/* eslint-disable @typescript-eslint/no-require-imports */
// Test del ciclo di vita del socket con un finto client socket.io controllato dal test.

type Handler = (...args: any[]) => void;

class FakeSocket {
  connected = false;
  handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown }[] = [];
  // Risposte simulate del server per evento (ack)
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
        if (event in this.responses) cb(null, this.responses[event]);
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
    expect(mockSocket.emitted).toContainEqual({ event: 'join_session', payload: credentials });
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
});
