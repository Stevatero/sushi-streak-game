// Test dello store di gioco: applicazione degli snapshot del server e stati di fine partita.
import socketService from '../../services/socketService';
import useGameStore from '../gameStore';

type Listener = (payload: any) => void;

// La mappa degli ascoltatori vive dentro il mock: lo store si registra già all'import del modulo
jest.mock('../../services/socketService', () => {
  const listeners = new Map<string, Listener[]>();
  return {
    __esModule: true,
    listeners,
    default: {
      on: jest.fn((event: string, listener: Listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return () => undefined;
      }),
      joinSession: jest.fn(),
      leaveSession: jest.fn(),
      getStatus: jest.fn(() => 'connecting'),
      getFeatures: jest.fn(() => ({ pieceQueue: false, endSession: false })),
      getPending: jest.fn(() => ({ delta: 0, count: 0 })),
      addPiece: jest.fn(() => Promise.resolve({ ok: true, score: 1 })),
      removePiece: jest.fn(),
      finishGame: jest.fn(),
      endSession: jest.fn(() => Promise.resolve({ ok: true })),
    },
  };
});

const { listeners } = jest.requireMock('../../services/socketService') as { listeners: Map<string, Listener[]> };
const emit = (event: string, payload: unknown) => listeners.get(event)?.forEach((l) => l(payload));

const players = [
  { id: 'p1', name: 'Anna', score: 4, finished: false },
  { id: 'p2', name: 'Luca', score: 2, finished: true },
];

const start = () =>
  useGameStore.getState().startSession({
    sessionId: 'CENA',
    sessionName: 'Cena',
    playerId: 'p1',
    playerName: 'Anna',
    playerToken: 'secret',
    isHost: true,
  });

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    jest.clearAllMocks();
  });

  it('avvia la sessione passando le credenziali al socket', () => {
    start();
    expect(socketService.joinSession).toHaveBeenCalledWith({ sessionId: 'CENA', playerId: 'p1', token: 'secret' });
    expect(useGameStore.getState()).toMatchObject({ sessionId: 'CENA', playerName: 'Anna', isHost: true });
  });

  it('applica gli snapshot della propria sessione', () => {
    start();
    emit('session', { id: 'CENA', name: 'Cena', status: 'active', expiresAt: 123, players });
    expect(useGameStore.getState()).toMatchObject({ players, status: 'active', expiresAt: 123, gameEnded: false });
  });

  it('ignora gli snapshot di altre sessioni', () => {
    start();
    emit('session', { id: 'ALTRA', name: 'Altra', status: 'active', expiresAt: 1, players });
    expect(useGameStore.getState().players).toEqual([]);
  });

  it('segna la partita come terminata quando il server la chiude', () => {
    start();
    emit('gameEnded', { id: 'CENA', name: 'Cena', status: 'ended', expiresAt: 1, players });
    expect(useGameStore.getState()).toMatchObject({ gameEnded: true, endReason: 'ended' });
  });

  it('gestisce la scadenza per inattività', () => {
    start();
    emit('sessionExpired', { sessionId: 'CENA' });
    expect(useGameStore.getState()).toMatchObject({ gameEnded: true, endReason: 'expired', status: 'expired' });
  });

  it('termina la sessione se le credenziali non sono più valide', () => {
    start();
    emit('joinFailed', { ok: false, code: 'unauthorized' });
    expect(useGameStore.getState()).toMatchObject({ gameEnded: true, endReason: 'unauthorized' });
  });

  it('non termina la sessione per errori temporanei', () => {
    start();
    emit('joinFailed', { ok: false, code: 'internal' });
    expect(useGameStore.getState().gameEnded).toBe(false);
  });

  it('riflette lo stato della connessione', () => {
    emit('connection', 'connected');
    expect(useGameStore.getState().connection).toBe('connected');
  });

  it('resetGame esce dalla sessione e azzera lo stato', () => {
    start();
    emit('session', { id: 'CENA', name: 'Cena', status: 'active', expiresAt: 1, players });
    useGameStore.getState().resetGame();
    expect(socketService.leaveSession).toHaveBeenCalled();
    expect(useGameStore.getState()).toMatchObject({ sessionId: null, players: [], gameEnded: false });
  });

  it("memorizza l'host e chiude la partita quando si viene rimossi", () => {
    start();
    emit('session', { id: 'CENA', name: 'Cena', status: 'active', expiresAt: 123, hostId: 'p2', players });
    expect(useGameStore.getState().hostId).toBe('p2');

    emit('kicked', { sessionId: 'ALTRA' });
    expect(useGameStore.getState().gameEnded).toBe(false);
    emit('kicked', { sessionId: 'CENA' });
    expect(useGameStore.getState()).toMatchObject({ gameEnded: true, endReason: 'kicked' });
  });

  it('aggiorna insieme classifica e pezzi in attesa, e segnala quelli scartati', () => {
    (socketService.getPending as jest.Mock).mockReturnValueOnce({ delta: 2, count: 2 });
    start();
    emit('session', { id: 'CENA', name: 'Cena', status: 'active', expiresAt: 1, players });
    expect(useGameStore.getState()).toMatchObject({ pendingDelta: 2, pendingCount: 2 });

    emit('pending', { delta: 0, count: 0 });
    expect(useGameStore.getState()).toMatchObject({ pendingDelta: 0, pendingCount: 0 });

    emit('dropped', { count: 3, code: 'session_closed' });
    expect(useGameStore.getState().droppedPieces).toMatchObject({ count: 3 });
  });

  it('memorizza le funzioni del server e chi ha chiuso la partita', () => {
    start();
    emit('features', { pieceQueue: true, endSession: true });
    expect(useGameStore.getState().features).toEqual({ pieceQueue: true, endSession: true });
    emit('gameEnded', { id: 'CENA', name: 'Cena', status: 'ended', expiresAt: 1, closedBy: 'host', players });
    expect(useGameStore.getState()).toMatchObject({ gameEnded: true, closedBy: 'host' });
  });

  it("chiude la partita se l'app va aggiornata", () => {
    start();
    emit('joinFailed', { ok: false, code: 'upgrade_required' });
    expect(useGameStore.getState()).toMatchObject({ gameEnded: true, endReason: 'upgrade_required' });
  });

  it("l'host termina la partita tramite il socket", async () => {
    start();
    await useGameStore.getState().endSession();
    expect(socketService.endSession).toHaveBeenCalled();
  });
});
