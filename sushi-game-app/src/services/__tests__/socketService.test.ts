/* eslint-disable @typescript-eslint/no-require-imports */
// Test del ciclo di vita del socket con un finto client socket.io controllato dal test.

type Handler = (...args: any[]) => void;

class FakeSocket {
  connected = false;
  handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown }[] = [];
  // Risposte simulate del server per evento (ack): un valore fisso o una funzione del payload
  responses: Record<string, unknown> = {};
  io = { on: jest.fn() };

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((h) => h(...args));
  }

  connect = jest.fn(() => {
    this.connected = true;
    this.trigger('connect');
  });

  disconnect = jest.fn(() => {
    this.connected = false;
    this.trigger('disconnect');
  });

  emit = jest.fn((event: string, payload: unknown) => {
    this.emitted.push({ event, payload });
  });

  timeout() {
    return {
      emit: (event: string, payload: unknown, cb: (err: Error | null, res?: unknown) => void) => {
        this.emitted.push({ event, payload });
        const response = this.responses[event];
        if (typeof response === 'function') cb(null, response(payload));
        else if (event in this.responses) cb(null, response);
        else cb(new Error('timeout'));
      },
    };
  }

  // Simula la caduta e il ripristino della connessione
  dropAndReconnect() {
    this.connected = false;
    this.trigger('disconnect');
    this.connected = true;
    this.trigger('connect');
  }
}

let mockSocket: FakeSocket;

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

const credentials = { sessionId: 'CENA', playerId: 'p1', token: 'secret' };
const snapshot = { id: 'CENA', name: 'CENA', status: 'active', expiresAt: 0, players: [] };

function loadService() {
  let service: typeof import('../socketService').default;
  jest.isolateModules(() => {
    service = require('../socketService').default;
  });
  return service!;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('socketService', () => {
  beforeEach(() => {
    mockSocket = new FakeSocket();
    mockSocket.responses.join_session = { ok: true, session: snapshot };
  });

  it('si connette e rientra nella partita con le credenziali', async () => {
    const service = loadService();
    const onSession = jest.fn();
    service.on('session', onSession);

    service.joinSession(credentials);
    await flush();

    expect(mockSocket.connect).toHaveBeenCalled();
    expect(mockSocket.emitted).toContainEqual({
      event: 'join_session',
      payload: expect.objectContaining({ ...credentials, appVersion: expect.any(String) }),
    });
    expect(onSession).toHaveBeenCalledWith(snapshot);
    expect(service.getStatus()).toBe('connected');
  });

  it('dopo una riconnessione rientra automaticamente nella stanza', async () => {
    const service = loadService();
    service.joinSession(credentials);
    await flush();

    mockSocket.dropAndReconnect();
    await flush();

    const joins = mockSocket.emitted.filter((e) => e.event === 'join_session');
    expect(joins).toHaveLength(2);
  });

  it('notifica il fallimento del join quando le credenziali non sono valide', async () => {
    mockSocket.responses.join_session = { ok: false, code: 'unauthorized' };
    const service = loadService();
    const onFail = jest.fn();
    service.on('joinFailed', onFail);

    service.joinSession(credentials);
    await flush();

    expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ code: 'unauthorized' }));
  });

  it('resta in riconnessione e riprova se il server non conferma il rientro', async () => {
    jest.useFakeTimers();
    try {
      mockSocket.responses.join_session = { ok: false, code: 'internal' };
      const service = loadService();
      const onFail = jest.fn();
      service.on('joinFailed', onFail);

      service.joinSession(credentials);
      await Promise.resolve();
      expect(service.getStatus()).toBe('connecting');
      expect(onFail).not.toHaveBeenCalled();

      mockSocket.responses.join_session = { ok: true, session: snapshot };
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockSocket.emitted.filter((e) => e.event === 'join_session')).toHaveLength(2);
      expect(service.getStatus()).toBe('connected');
    } finally {
      jest.useRealTimers();
    }
  });

  it('le azioni offline non vengono inviate e restituiscono un errore', async () => {
    const service = loadService();
    await expect(service.addPiece()).resolves.toMatchObject({ ok: false, code: 'offline' });
  });

  it('un ack mancante viene trattato come timeout', async () => {
    const service = loadService();
    service.joinSession(credentials);
    await flush();
    await expect(service.addPiece()).resolves.toMatchObject({ ok: false, code: 'timeout' });
  });

  it('leaveSession chiude la connessione e non rientra più', async () => {
    const service = loadService();
    service.joinSession(credentials);
    await flush();

    service.leaveSession();
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(service.getStatus()).toBe('disconnected');

    mockSocket.connected = true;
    mockSocket.trigger('connect');
    await flush();
    expect(mockSocket.emitted.filter((e) => e.event === 'join_session')).toHaveLength(1);
  });

  it('inoltra gli aggiornamenti del server agli ascoltatori e permette di rimuoverli', async () => {
    const service = loadService();
    const listener = jest.fn();
    const unsubscribe = service.on('session', listener);
    service.joinSession(credentials);
    await flush();
    listener.mockClear();

    mockSocket.trigger('session_update', snapshot);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    mockSocket.trigger('session_update', snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe('coda dei pezzi (server 1.8+)', () => {
    const me = (score: number, seq: number) => ({
      ...snapshot,
      players: [{ id: 'p1', name: 'Anna', score, finished: false, seq }],
    });

    // Server simulato: applica i pezzi numerati una sola volta, come il backend
    function fakeServer(initialSeq = 0) {
      const state = { score: 0, lastSeq: initialSeq, applied: 0 };
      const piece = (delta: number) => (payload: { seq?: number }) => {
        if (payload.seq !== undefined && payload.seq <= state.lastSeq) {
          return { ok: true, score: state.score, lastSeq: state.lastSeq, duplicate: true };
        }
        state.score = Math.max(0, state.score + delta);
        state.lastSeq = payload.seq ?? state.lastSeq;
        state.applied += 1;
        return { ok: true, score: state.score, lastSeq: state.lastSeq };
      };
      mockSocket.responses.join_session = () => ({
        ok: true,
        session: me(state.score, state.lastSeq),
        lastSeq: state.lastSeq,
        features: ['piece_seq', 'end_session', 'host_transfer'],
      });
      mockSocket.responses.add_piece = piece(1);
      mockSocket.responses.remove_piece = piece(-1);
      return state;
    }

    const sentPieces = () =>
      mockSocket.emitted.filter((e) => e.event === 'add_piece' || e.event === 'remove_piece').map((e) => e.payload);

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('scopre le funzioni del server e invia i pezzi numerati', async () => {
      const server = fakeServer();
      const service = loadService();
      const onFeatures = jest.fn();
      service.on('features', onFeatures);
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);
      expect(onFeatures).toHaveBeenCalledWith({ pieceQueue: true, endSession: true });

      await expect(service.addPiece()).resolves.toEqual({ ok: true, queued: false });
      await service.addPiece();
      await jest.advanceTimersByTimeAsync(500);
      expect(sentPieces()).toEqual([{ seq: 1 }, { seq: 2 }]);
      expect(server.score).toBe(2);
      expect(service.getPending()).toEqual({ delta: 0, count: 0 });
    });

    it('offline registra i pezzi e li invia una sola volta al rientro', async () => {
      const server = fakeServer();
      const service = loadService();
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);

      mockSocket.connected = false;
      mockSocket.trigger('disconnect');
      expect(service.getStatus()).toBe('connecting');
      const pending = jest.fn();
      service.on('pending', pending);
      await expect(service.addPiece()).resolves.toEqual({ ok: true, queued: true });
      await service.addPiece();
      expect(service.getPending()).toEqual({ delta: 2, count: 2 });
      expect(pending).toHaveBeenLastCalledWith({ delta: 2, count: 2 });
      expect(sentPieces()).toEqual([]);

      mockSocket.connected = true;
      mockSocket.trigger('connect');
      await jest.advanceTimersByTimeAsync(1000);
      expect(sentPieces()).toEqual([{ seq: 1 }, { seq: 2 }]);
      expect(server.score).toBe(2);
      expect(service.getPending()).toEqual({ delta: 0, count: 0 });
    });

    it('un pezzo già applicato non viene rinviato dopo un timeout e una riconnessione', async () => {
      const server = fakeServer();
      const service = loadService();
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);

      // Il server applica il pezzo ma la risposta va persa
      mockSocket.responses.add_piece = (payload: { seq: number }) => {
        server.score += 1;
        server.lastSeq = payload.seq;
        server.applied += 1;
        mockSocket.connected = false;
        return undefined;
      };
      await service.addPiece();
      await jest.advanceTimersByTimeAsync(0);
      expect(service.getPending().count).toBe(1);

      // Riconnessione: il server indica che il pezzo 1 è già contato
      fakeServer(server.lastSeq);
      mockSocket.connected = true;
      mockSocket.trigger('disconnect');
      mockSocket.connected = true;
      mockSocket.trigger('connect');
      await jest.advanceTimersByTimeAsync(2000);
      expect(server.applied).toBe(1);
      expect(service.getPending()).toEqual({ delta: 0, count: 0 });

      await service.addPiece();
      await jest.advanceTimersByTimeAsync(500);
      expect(sentPieces().at(-1)).toEqual({ seq: 2 });
    });

    it("un aggiornamento della partita che contiene già il pezzo lo toglie dall'attesa", async () => {
      fakeServer();
      const service = loadService();
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);
      // Nessuna risposta: il pezzo resta in volo
      delete mockSocket.responses.add_piece;
      mockSocket.timeout = () => ({ emit: () => undefined }) as never;
      await service.addPiece();
      await jest.advanceTimersByTimeAsync(0);
      expect(service.getPending()).toEqual({ delta: 1, count: 1 });

      const onSession = jest.fn(() => expect(service.getPending()).toEqual({ delta: 0, count: 0 }));
      service.on('session', onSession);
      mockSocket.trigger('session_update', me(1, 1));
      expect(onSession).toHaveBeenCalled();
    });

    it('annullare un pezzo non ancora inviato lo toglie dalla coda', async () => {
      fakeServer();
      const service = loadService();
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);
      mockSocket.connected = false;
      mockSocket.trigger('disconnect');

      await service.addPiece();
      await service.addPiece();
      await service.removePiece();
      expect(service.getPending()).toEqual({ delta: 1, count: 1 });
    });

    it('se la partita si chiude i pezzi in attesa vengono scartati e segnalati', async () => {
      fakeServer();
      const service = loadService();
      const dropped = jest.fn();
      service.on('dropped', dropped);
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);
      mockSocket.connected = false;
      mockSocket.trigger('disconnect');
      await service.addPiece();

      mockSocket.trigger('game_ended', { ...me(0, 0), status: 'ended' });
      expect(dropped).toHaveBeenCalledWith({ count: 1, code: 'session_closed' });
      expect(service.getPending()).toEqual({ delta: 0, count: 0 });
    });

    it('"Ho finito" attende l’invio dei pezzi; offline non parte', async () => {
      const server = fakeServer();
      mockSocket.responses.player_finished = { ok: true };
      const service = loadService();
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);

      await service.addPiece();
      await service.addPiece();
      const finished = service.finishGame();
      await jest.advanceTimersByTimeAsync(1000);
      await expect(finished).resolves.toEqual({ ok: true });
      expect(server.score).toBe(2);
      const events = mockSocket.emitted.map((e) => e.event);
      expect(events.lastIndexOf('add_piece')).toBeLessThan(events.indexOf('player_finished'));

      mockSocket.connected = false;
      mockSocket.trigger('disconnect');
      await service.addPiece();
      await expect(service.finishGame()).resolves.toMatchObject({ ok: false, code: 'pending' });
    });

    it("l'host termina la partita per tutti", async () => {
      fakeServer();
      mockSocket.responses.end_session = { ok: true };
      const service = loadService();
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(0);
      await expect(service.endSession()).resolves.toEqual({ ok: true });
      expect(mockSocket.emitted.some((e) => e.event === 'end_session')).toBe(true);
    });

    it("con un'app da aggiornare il rientro fallisce in modo definitivo", async () => {
      mockSocket.responses.join_session = { ok: false, code: 'upgrade_required', error: 'Aggiorna' };
      const service = loadService();
      const onFail = jest.fn();
      service.on('joinFailed', onFail);
      service.joinSession(credentials);
      await jest.advanceTimersByTimeAsync(5000);
      expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ code: 'upgrade_required' }));
      expect(mockSocket.emitted.filter((e) => e.event === 'join_session')).toHaveLength(1);
    });
  });
});
