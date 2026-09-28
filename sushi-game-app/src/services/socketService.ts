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

class SocketService {
  private socket: Socket | null = null;
  private credentials: JoinCredentials | null = null;
  private status: ConnectionStatus = 'disconnected';
  private listeners = new Map<keyof Events, Set<Listener<any>>>();

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
      this.setStatus('connected');
      // Dopo ogni (ri)connessione il nuovo socket deve rientrare nella stanza della partita
      this.rejoin();
    });
    socket.on('disconnect', () => this.setStatus(this.credentials ? 'connecting' : 'disconnected'));
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

  private async rejoin() {
    if (!this.credentials) return;
    const response = await this.request('join_session', this.credentials);
    if (response.ok && response.session) {
      this.emitLocal('session', response.session);
    } else if (response.code !== 'timeout' && response.code !== 'offline') {
      this.emitLocal('joinFailed', response);
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
      if (changed) this.rejoin();
    } else {
      this.setStatus('connecting');
      socket.connect();
    }
  }

  // Esce dalla partita corrente e chiude la connessione
  leaveSession() {
    const socket = this.socket;
    this.credentials = null;
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
