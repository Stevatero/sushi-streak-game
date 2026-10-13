import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { API_URL, APP_VERSION } from '../config';
import { logger } from '../utils/logger';

export interface Player {
  id: string;
  name: string;
  score: number;
  finished: boolean;
  // Ultimo pezzo numerato applicato dal server (server 1.8+)
  seq?: number;
}

// Chi ha chiuso la partita (server 1.8+): l'host, la chiusura automatica o nessuno (tutti hanno finito)
export type ClosedBy = 'host' | 'auto' | null;

export interface SessionSnapshot {
  id: string;
  name: string;
  status: 'active' | 'ended' | 'expired';
  expiresAt: number;
  // Creatore della partita (assente con i server precedenti alla 1.3)
  hostId?: string | null;
  closedBy?: ClosedBy;
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
  // Rientro in partita (server 1.8+): ultimo pezzo numerato applicato e funzioni disponibili
  lastSeq?: number;
  features?: string[];
  // Pezzo registrato sul telefono e non ancora confermato dal server (es. offline)
  queued?: boolean;
}

// Funzioni offerte dal server, note dopo il primo rientro in partita
export interface ServerFeatures {
  // Pezzi numerati: si registrano anche offline e vengono inviati alla riconnessione, senza doppioni
  pieceQueue: boolean;
  // L'host può terminare la partita per tutti
  endSession: boolean;
}

// Pezzi registrati sul telefono e non ancora confermati dal server
export interface PendingPieces {
  // Somma dei pezzi in attesa (+1 per ogni pezzo, -1 per ogni annullamento)
  delta: number;
  count: number;
}

type Events = {
  session: SessionSnapshot;
  gameEnded: SessionSnapshot;
  sessionExpired: { sessionId: string };
  kicked: { sessionId: string };
  connection: ConnectionStatus;
  joinFailed: AckResponse;
  features: ServerFeatures;
  pending: PendingPieces;
  // Pezzi in attesa che non si possono più registrare (es. la partita è stata chiusa nel frattempo)
  dropped: { count: number; code?: string };
};

type Listener<T> = (payload: T) => void;

interface PendingPiece {
  delta: 1 | -1;
  // Numero assegnato al primo invio e mantenuto nei tentativi successivi
  seq?: number;
}

const ACK_TIMEOUT_MS = 8000;
// Nuovi tentativi di rientro nella partita dopo un errore temporaneo (server occupato, timeout…)
const REJOIN_RETRY_MIN_MS = 2000;
const REJOIN_RETRY_MAX_MS = 15000;
// Errori definitivi: le credenziali non valgono più (o l'app va aggiornata), riprovare è inutile
const FATAL_JOIN_CODES = new Set(['unauthorized', 'not_found', 'bad_request', 'upgrade_required']);
// Coda dei pezzi: dimensione massima, intervallo tra due invii (il server ne accetta al massimo 6 al
// secondo), attesa prima di riprovare dopo un errore temporaneo e attesa massima prima di "Ho finito"
const MAX_PENDING_PIECES = 60;
const PIECE_SEND_INTERVAL_MS = 200;
const PIECE_RETRY_MS = 1500;
const FLUSH_TIMEOUT_MS = 8000;
// Errori dopo i quali conviene ritentare l'invio di un pezzo
const RETRY_PIECE_CODES = new Set(['rate_limited', 'timeout', 'internal', 'invalid_response', 'not_joined']);

const OFFLINE: AckResponse = { ok: false, code: 'offline', error: 'Connessione assente' };
const NO_FEATURES: ServerFeatures = { pieceQueue: false, endSession: false };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class SocketService {
  private socket: Socket | null = null;
  private credentials: JoinCredentials | null = null;
  private status: ConnectionStatus = 'disconnected';
  private listeners = new Map<keyof Events, Set<Listener<any>>>();
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinAttempts = 0;

  // Il server è lo stesso per tutte le partite: le funzioni restano note anche cambiando partita
  private features: ServerFeatures = NO_FEATURES;
  private queue: PendingPiece[] = [];
  // Ultimo numero assegnato a un pezzo (o confermato dal server) e ultimo applicato dal server
  private lastSeq = 0;
  private confirmedSeq = 0;
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSendAt = 0;
  private queueWaiters = new Set<() => void>();

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

  getFeatures(): ServerFeatures {
    return this.features;
  }

  getPending(): PendingPieces {
    return { delta: this.queue.reduce((sum, piece) => sum + piece.delta, 0), count: this.queue.length };
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

    // Prima di inoltrare un aggiornamento si tolgono dalla coda i pezzi che contiene già: lo store legge
    // insieme classifica e pezzi in attesa, senza sommarli due volte
    socket.on('session_update', (data: SessionSnapshot) => {
      this.confirmSeq(this.mySeq(data), false);
      this.emitLocal('session', data);
    });
    socket.on('game_ended', (data: SessionSnapshot) => {
      this.confirmSeq(this.mySeq(data), false);
      this.dropQueue('session_closed', false);
      this.emitLocal('gameEnded', data);
    });
    socket.on('session_expired', (data: { sessionId: string }) => {
      this.dropQueue('session_closed', true);
      this.emitLocal('sessionExpired', data);
    });
    socket.on('player_kicked', (data: { sessionId: string }) => {
      this.dropQueue('kicked', true);
      this.emitLocal('kicked', data);
    });

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
    const response = await this.request('join_session', { ...credentials, appVersion: APP_VERSION });
    // Nel frattempo si è usciti dalla partita o si è entrati in un'altra
    if (this.credentials !== credentials) return;
    if (response.ok && response.session) {
      this.rejoinAttempts = 0;
      this.applyFeatures(response);
      // Un server senza pezzi numerati non può ricevere quelli in coda senza rischio di doppioni
      if (!this.features.pieceQueue) this.dropQueue('unsupported', false);
      if (typeof response.lastSeq === 'number') {
        // Si riprende a numerare dall'ultimo pezzo applicato; quelli in coda già applicati si tolgono
        this.lastSeq = Math.max(this.lastSeq, response.lastSeq);
        this.confirmSeq(response.lastSeq, false);
      }
      if (response.session.status !== 'active') this.dropQueue('session_closed', false);
      this.setStatus('connected');
      this.emitLocal('session', response.session);
      this.emitLocal('pending', this.getPending());
      this.drain();
    } else if (response.code && FATAL_JOIN_CODES.has(response.code)) {
      this.dropQueue(response.code, true);
      this.emitLocal('joinFailed', response);
    } else if (response.code !== 'offline' && this.socket?.connected) {
      // Errore temporaneo: si riprova con attesa crescente finché il socket resta connesso
      const wait = Math.min(REJOIN_RETRY_MAX_MS, REJOIN_RETRY_MIN_MS * 2 ** this.rejoinAttempts);
      this.rejoinAttempts += 1;
      logger.debug('Rientro nella partita non riuscito, nuovo tentativo', { code: response.code, delay: wait });
      this.rejoinTimer = setTimeout(() => {
        this.rejoinTimer = null;
        this.rejoin();
      }, wait);
    }
  }

  private applyFeatures(response: AckResponse) {
    const list = Array.isArray(response.features) ? response.features : [];
    const next: ServerFeatures = {
      pieceQueue: list.includes('piece_seq') && typeof response.lastSeq === 'number',
      endSession: list.includes('end_session'),
    };
    if (next.pieceQueue === this.features.pieceQueue && next.endSession === this.features.endSession) return;
    this.features = next;
    this.emitLocal('features', next);
  }

  private request(event: string, payload?: object): Promise<AckResponse> {
    const socket = this.socket;
    if (!socket || !socket.connected) return Promise.resolve(OFFLINE);
    return new Promise((resolve) => {
      socket.timeout(ACK_TIMEOUT_MS).emit(event, payload ?? {}, (err: Error | null, response: AckResponse) => {
        if (err) resolve({ ok: false, code: 'timeout', error: 'Il server non ha risposto' });
        else resolve(response ?? { ok: false, code: 'invalid_response' });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Coda dei pezzi (server 1.8+): ogni pezzo riceve un numero crescente e viene inviato uno alla volta.
  // Un pezzo rinviato dopo un timeout o una riconnessione ha lo stesso numero e il server non lo conta
  // due volte; offline i pezzi restano in coda e partono appena si rientra in partita.
  // ---------------------------------------------------------------------------

  // Ultimo pezzo applicato del giocatore secondo un aggiornamento della partita
  private mySeq(snapshot: SessionSnapshot): number | undefined {
    const credentials = this.credentials;
    if (!credentials || snapshot.id !== credentials.sessionId) return undefined;
    return snapshot.players.find((p) => p.id === credentials.playerId)?.seq;
  }

  // Il server ha applicato i pezzi fino a seq: quelli in coda con numero ≤ seq sono già contati
  private confirmSeq(seq: number | undefined, notify: boolean) {
    if (typeof seq !== 'number' || seq <= this.confirmedSeq) return;
    this.confirmedSeq = seq;
    this.lastSeq = Math.max(this.lastSeq, seq);
    const before = this.queue.length;
    this.queue = this.queue.filter((piece) => piece.seq === undefined || piece.seq > seq);
    if (this.queue.length !== before) this.queueChanged(notify);
  }

  private queueChanged(notify: boolean) {
    [...this.queueWaiters].forEach((check) => check());
    if (notify) this.emitLocal('pending', this.getPending());
  }

  // Scarta i pezzi in attesa che non possono più essere registrati
  private dropQueue(code: string, notify: boolean) {
    const count = this.queue.length;
    if (count === 0) return;
    this.queue = [];
    this.cancelDrainRetry();
    logger.info('Pezzi in attesa non registrati', { count, code });
    this.queueChanged(notify);
    this.emitLocal('dropped', { count, code });
  }

  private resetQueue() {
    const hadPieces = this.queue.length > 0;
    this.queue = [];
    this.lastSeq = 0;
    this.confirmedSeq = 0;
    this.lastSendAt = 0;
    this.cancelDrainRetry();
    if (hadPieces) this.queueChanged(true);
  }

  private canSendPieces() {
    return this.features.pieceQueue && this.status === 'connected' && !!this.socket?.connected;
  }

  private cancelDrainRetry() {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
  }

  private scheduleDrain(wait: number) {
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drain();
    }, wait);
  }

  // Invia i pezzi in coda uno alla volta, nell'ordine in cui sono stati toccati
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    const credentials = this.credentials;
    try {
      while (this.queue.length > 0 && this.credentials === credentials && this.canSendPieces()) {
        const wait = this.lastSendAt + PIECE_SEND_INTERVAL_MS - Date.now();
        if (wait > 0) {
          await delay(wait);
          continue;
        }
        const piece = this.queue[0];
        if (piece.seq === undefined) {
          this.lastSeq += 1;
          piece.seq = this.lastSeq;
        }
        this.lastSendAt = Date.now();
        const response = await this.request(piece.delta > 0 ? 'add_piece' : 'remove_piece', { seq: piece.seq });
        if (this.credentials !== credentials) return;
        if (response.ok) {
          this.confirmSeq(Math.max(response.lastSeq ?? 0, piece.seq), true);
          continue;
        }
        if (response.code === 'offline') return; // riparte dopo il rientro in partita
        if (response.code && RETRY_PIECE_CODES.has(response.code)) {
          this.scheduleDrain(PIECE_RETRY_MS);
          return;
        }
        // Errore definitivo (partita chiusa, giocatore che ha finito o è stato rimosso)
        this.dropQueue(response.code ?? 'error', true);
        return;
      }
    } finally {
      this.draining = false;
    }
  }

  private enqueue(delta: 1 | -1): AckResponse {
    if (delta < 0) {
      // Annullare un pezzo non ancora inviato lo toglie dalla coda, senza disturbare il server
      const last = this.queue[this.queue.length - 1];
      if (last && last.delta > 0 && last.seq === undefined) {
        this.queue.pop();
        this.queueChanged(true);
        return { ok: true, queued: true };
      }
    }
    if (this.queue.length >= MAX_PENDING_PIECES) {
      return { ok: false, code: 'queue_full', error: 'Troppi pezzi in attesa: aspetta di tornare online' };
    }
    this.queue.push({ delta });
    this.queueChanged(true);
    const queued = !this.canSendPieces();
    this.drain();
    return { ok: true, queued };
  }

  // Attende che i pezzi in coda siano confermati (prima di "Ho finito" o della chiusura della partita)
  private flushPieces(): Promise<boolean> {
    if (this.queue.length === 0) return Promise.resolve(true);
    if (!this.canSendPieces()) return Promise.resolve(false);
    this.drain();
    return new Promise((resolve) => {
      const done = (flushed: boolean) => {
        clearTimeout(timer);
        this.queueWaiters.delete(check);
        resolve(flushed);
      };
      const check = () => {
        if (this.queue.length === 0) done(true);
      };
      const timer = setTimeout(() => done(false), FLUSH_TIMEOUT_MS);
      this.queueWaiters.add(check);
    });
  }

  // Entra in una partita: la connessione e le riconnessioni successive usano queste credenziali
  joinSession(credentials: JoinCredentials) {
    const socket = this.ensureSocket();
    const changed =
      !this.credentials ||
      this.credentials.sessionId !== credentials.sessionId ||
      this.credentials.playerId !== credentials.playerId;
    if (changed) this.resetQueue();
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

  // Esce dalla partita corrente e chiude la connessione (i pezzi non ancora inviati vanno persi)
  leaveSession() {
    const socket = this.socket;
    this.credentials = null;
    this.cancelRejoinRetry();
    this.resetQueue();
    if (socket) {
      if (socket.connected) socket.emit('leave_session', {});
      socket.disconnect();
    }
    this.setStatus('disconnected');
  }

  addPiece(): Promise<AckResponse> {
    if (!this.credentials) return Promise.resolve(OFFLINE);
    // Server precedente alla 1.8: un evento per pezzo, solo online
    if (!this.features.pieceQueue) return this.request('add_piece');
    return Promise.resolve(this.enqueue(1));
  }

  removePiece(): Promise<AckResponse> {
    if (!this.credentials) return Promise.resolve(OFFLINE);
    if (!this.features.pieceQueue) return this.request('remove_piece');
    return Promise.resolve(this.enqueue(-1));
  }

  async finishGame(): Promise<AckResponse> {
    if (!(await this.flushPieces())) {
      return { ok: false, code: 'pending', error: 'Alcuni pezzi non sono ancora stati inviati: riprova da online' };
    }
    return this.request('player_finished');
  }

  // Solo l'host (server 1.8+): termina la partita per tutti
  async endSession(): Promise<AckResponse> {
    if (!(await this.flushPieces())) {
      return { ok: false, code: 'pending', error: 'Alcuni pezzi non sono ancora stati inviati: riprova da online' };
    }
    return this.request('end_session');
  }

  // Solo l'host: rimuove un giocatore dalla partita
  kickPlayer(playerId: string) {
    return this.request('kick_player', { playerId });
  }
}

export default new SocketService();
