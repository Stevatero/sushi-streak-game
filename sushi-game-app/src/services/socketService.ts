import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import { logger } from '../utils/logger';

export interface Player {
  id: string;
  name: string;
  score: number;
  finished: boolean;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  status: 'active' | 'ended' | 'expired';
  expiresAt: number;
  // Creatore della partita (assente con i server precedenti alla 1.3)
  hostId?: string | null;
  players: Player[];
}

export interface JoinCredentials {
  sessionId: string;
  playerId: string;
  token: string;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface AckResponse {
  ok: boolean;
  code?: string;
  error?: string;
  score?: number;
  session?: SessionSnapshot;
}

type Events = {
  session: SessionSnapshot;
  gameEnded: SessionSnapshot;
  sessionExpired: { sessionId: string };
  kicked: { sessionId: string };
  connection: ConnectionStatus;
  joinFailed: AckResponse;
};

type Listener<T> = (payload: T) => void;

const ACK_TIMEOUT_MS = 8000;
// Nuovi tentativi di rientro nella partita dopo un errore temporaneo (server occupato, timeout…)
const REJOIN_RETRY_MIN_MS = 2000;
const REJOIN_RETRY_MAX_MS = 15000;
// Errori definitivi: le credenziali non valgono più, riprovare è inutile
const FATAL_JOIN_CODES = new Set(['unauthorized', 'not_found', 'bad_request']);

class SocketService {
  private socket: Socket | null = null;
  private credentials: JoinCredentials | null = null;
  private status: ConnectionStatus = 'disconnected';
  private listeners = new Map<keyof Events, Set<Listener<any>>>();
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinAttempts = 0;

  constructor() {
    // Quando l'app torna in primo piano forza la riconnessione se il socket è caduto
    AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && this.credentials && this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    });
  }

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private emitLocal<K extends keyof Events>(event: K, payload: Events[K]) {
    this.listeners.get(event)?.forEach((l) => l(payload));
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emitLocal('connection', status);
  }

  // Crea il socket una sola volta: i listener sono registrati qui e non si accumulano
  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    const socket = io(API_URL, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      // Dopo ogni (ri)connessione il nuovo socket deve rientrare nella stanza della partita: si è
      // "connessi" solo quando il server ha confermato il rientro
      if (this.credentials) {
        this.setStatus('connecting');
        this.rejoinAttempts = 0;
        this.rejoin();
      } else {
        this.setStatus('connected');
      }
    });
    socket.on('disconnect', () => {
      this.cancelRejoinRetry();
      this.setStatus(this.credentials ? 'connecting' : 'disconnected');
    });
    socket.io.on('reconnect_attempt', () => this.setStatus('connecting'));
    socket.on('connect_error', (err) => {
      logger.debug('Errore di connessione socket', { message: err.message });
      this.setStatus('connecting');
    });

    socket.on('session_update', (data: SessionSnapshot) => this.emitLocal('session', data));
    socket.on('game_ended', (data: SessionSnapshot) => this.emitLocal('gameEnded', data));
    socket.on('session_expired', (data: { sessionId: string }) => this.emitLocal('sessionExpired', data));
    socket.on('player_kicked', (data: { sessionId: string }) => this.emitLocal('kicked', data));

    this.socket = socket;
    return socket;
  }

  private cancelRejoinRetry() {
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
  }

  private async rejoin() {
    const credentials = this.credentials;
    if (!credentials) return;
    this.cancelRejoinRetry();
    const response = await this.request('join_session', credentials);
    // Nel frattempo si è usciti dalla partita o si è entrati in un'altra
    if (this.credentials !== credentials) return;
    if (response.ok && response.session) {
      this.rejoinAttempts = 0;
      this.setStatus('connected');
      this.emitLocal('session', response.session);
    } else if (response.code && FATAL_JOIN_CODES.has(response.code)) {
      this.emitLocal('joinFailed', response);
    } else if (response.code !== 'offline' && this.socket?.connected) {
      // Errore temporaneo: si riprova con attesa crescente finché il socket resta connesso
      const delay = Math.min(REJOIN_RETRY_MAX_MS, REJOIN_RETRY_MIN_MS * 2 ** this.rejoinAttempts);
      this.rejoinAttempts += 1;
      logger.debug('Rientro nella partita non riuscito, nuovo tentativo', { code: response.code, delay });
      this.rejoinTimer = setTimeout(() => {
        this.rejoinTimer = null;
        this.rejoin();
      }, delay);
    }
  }

  private request(event: string, payload?: object): Promise<AckResponse> {
    const socket = this.socket;
    if (!socket || !socket.connected) {
      return Promise.resolve({ ok: false, code: 'offline', error: 'Connessione assente' });
    }
    return new Promise((resolve) => {
      socket.timeout(ACK_TIMEOUT_MS).emit(event, payload ?? {}, (err: Error | null, response: AckResponse) => {
        if (err) resolve({ ok: false, code: 'timeout', error: 'Il server non ha risposto' });
        else resolve(response ?? { ok: false, code: 'invalid_response' });
      });
    });
  }

  // Entra in una partita: la connessione e le riconnessioni successive usano queste credenziali
  joinSession(credentials: JoinCredentials) {
    const socket = this.ensureSocket();
    const changed =
      !this.credentials ||
      this.credentials.sessionId !== credentials.sessionId ||
      this.credentials.playerId !== credentials.playerId;
    this.credentials = credentials;

    if (socket.connected) {
      if (changed) {
        this.setStatus('connecting');
        this.rejoinAttempts = 0;
        this.rejoin();
      }
    } else {
      this.setStatus('connecting');
      socket.connect();
    }
  }

  // Esce dalla partita corrente e chiude la connessione
  leaveSession() {
    const socket = this.socket;
    this.credentials = null;
    this.cancelRejoinRetry();
    if (socket) {
      if (socket.connected) socket.emit('leave_session', {});
      socket.disconnect();
    }
    this.setStatus('disconnected');
  }

  addPiece() {
    return this.request('add_piece');
  }

  removePiece() {
    return this.request('remove_piece');
  }

  finishGame() {
    return this.request('player_finished');
  }

  // Solo l'host: rimuove un giocatore dalla partita
  kickPlayer(playerId: string) {
    return this.request('kick_player', { playerId });
  }
}

export default new SocketService();
