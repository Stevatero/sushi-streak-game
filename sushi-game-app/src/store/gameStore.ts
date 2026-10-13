import { create } from 'zustand';
import socketService, {
  AckResponse,
  ClosedBy,
  ConnectionStatus,
  Player,
  ServerFeatures,
  SessionSnapshot,
} from '../services/socketService';

export type { Player } from '../services/socketService';

export type SessionEndReason =
  'ended' | 'expired' | 'unauthorized' | 'not_found' | 'kicked' | 'upgrade_required' | null;

interface StartSessionParams {
  sessionId: string;
  sessionName: string;
  playerId: string;
  playerName: string;
  playerToken: string;
  isHost: boolean;
}

interface GameState {
  sessionId: string | null;
  sessionName: string | null;
  playerId: string | null;
  playerName: string | null;
  isHost: boolean;
  hostId: string | null;
  players: Player[];
  status: SessionSnapshot['status'] | null;
  expiresAt: number | null;
  connection: ConnectionStatus;
  gameEnded: boolean;
  endReason: SessionEndReason;
  // Chi ha chiuso la partita: l'host, la chiusura automatica o null (tutti hanno finito)
  closedBy: ClosedBy;
  // Funzioni offerte dal server (coda dei pezzi, chiusura della partita da parte dell'host)
  features: ServerFeatures;
  // Pezzi del giocatore registrati sul telefono e non ancora confermati dal server
  pendingDelta: number;
  pendingCount: number;
  // Ultimi pezzi in attesa scartati perché la partita non li accettava più (per avvisare il giocatore)
  droppedPieces: { count: number; at: number } | null;

  startSession: (params: StartSessionParams) => void;
  addPiece: () => Promise<AckResponse>;
  removePiece: () => Promise<AckResponse>;
  finishGame: () => Promise<AckResponse>;
  endSession: () => Promise<AckResponse>;
  kickPlayer: (playerId: string) => Promise<AckResponse>;
  resetGame: () => void;
}

const initialState = {
  sessionId: null,
  sessionName: null,
  playerId: null,
  playerName: null,
  isHost: false,
  hostId: null as string | null,
  players: [] as Player[],
  status: null,
  expiresAt: null,
  connection: 'disconnected' as ConnectionStatus,
  gameEnded: false,
  endReason: null as SessionEndReason,
  closedBy: null as ClosedBy,
  features: { pieceQueue: false, endSession: false } as ServerFeatures,
  pendingDelta: 0,
  pendingCount: 0,
  droppedPieces: null as GameState['droppedPieces'],
};

const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  startSession: ({ sessionId, sessionName, playerId, playerName, playerToken, isHost }) => {
    const current = get();
    if (current.sessionId !== sessionId || current.playerId !== playerId) {
      set({ ...initialState, connection: socketService.getStatus() });
    }
    set({ sessionId, sessionName, playerId, playerName, isHost, features: socketService.getFeatures() });
    socketService.joinSession({ sessionId, playerId, token: playerToken });
  },

  addPiece: () => socketService.addPiece(),
  removePiece: () => socketService.removePiece(),
  finishGame: () => socketService.finishGame(),
  endSession: () => socketService.endSession(),
  kickPlayer: (playerId) => socketService.kickPlayer(playerId),

  resetGame: () => {
    socketService.leaveSession();
    set({ ...initialState, features: socketService.getFeatures() });
  },
}));

// Gli eventi del socket vengono collegati allo store una sola volta. La classifica e i pezzi in attesa
// si aggiornano insieme: il servizio ha già tolto dalla coda i pezzi contenuti nell'aggiornamento
const applySnapshot = (snapshot: SessionSnapshot) => {
  const { sessionId } = useGameStore.getState();
  if (!sessionId || snapshot.id !== sessionId) return;
  const ended = snapshot.status !== 'active';
  const pending = socketService.getPending();
  useGameStore.setState({
    players: snapshot.players,
    hostId: snapshot.hostId ?? null,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt,
    gameEnded: ended,
    endReason: ended ? (snapshot.status as SessionEndReason) : null,
    closedBy: snapshot.closedBy ?? null,
    pendingDelta: pending.delta,
    pendingCount: pending.count,
  });
};

socketService.on('session', applySnapshot);
socketService.on('gameEnded', applySnapshot);
socketService.on('connection', (connection) => useGameStore.setState({ connection }));
socketService.on('features', (features) => useGameStore.setState({ features }));
socketService.on('pending', ({ delta, count }) => useGameStore.setState({ pendingDelta: delta, pendingCount: count }));
socketService.on('dropped', ({ count }) => {
  if (useGameStore.getState().sessionId) useGameStore.setState({ droppedPieces: { count, at: Date.now() } });
});
socketService.on('sessionExpired', ({ sessionId }) => {
  if (useGameStore.getState().sessionId === sessionId) {
    useGameStore.setState({ status: 'expired', gameEnded: true, endReason: 'expired' });
  }
});
socketService.on('kicked', ({ sessionId }) => {
  if (useGameStore.getState().sessionId === sessionId) {
    useGameStore.setState({ gameEnded: true, endReason: 'kicked' });
  }
});
socketService.on('joinFailed', (response) => {
  const code = response.code;
  if (code === 'unauthorized' || code === 'not_found' || code === 'upgrade_required') {
    useGameStore.setState({ gameEnded: true, endReason: code });
  }
});

export default useGameStore;
