process.env.LOG_LEVEL = 'silent';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioClient } = require('socket.io-client');
const { execFileSync } = require('child_process');
const { createServer } = require('../server');
const { appLinks } = require('../joinPage');

let instance;
let baseUrl;
let tmpDir;
const clients = [];

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-test-'));
  instance = createServer({
    dbPath: path.join(tmpDir, 'test.db'),
    inactivityMs: 60 * 60 * 1000,
    // I test creano molte partite dallo stesso IP: il limite di produzione (30/min) li bloccherebbe
    writeRateLimit: { max: 1000, windowMs: 60 * 1000 },
  });
  const port = await instance.start(0);
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  clients.forEach((c) => c.disconnect());
  await instance.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function post(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function connect() {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
}

const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Server separato con una configurazione dedicata (database proprio), chiuso alla fine del test
async function withServer(options, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-extra-'));
  const server = createServer({ dbPath: path.join(dir, 'test.db'), ...options });
  const url = `http://127.0.0.1:${await server.start(0)}`;
  const sockets = [];
  const helpers = {
    url,
    server,
    dbPath: path.join(dir, 'test.db'),
    post: async (pathname, body, headers = {}) => {
      const res = await fetch(`${url}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    },
    connect: () => {
      const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
      sockets.push(socket);
      return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
    },
  };
  try {
    return await fn(helpers);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('crea una sessione e restituisce un token', async () => {
  const res = await post('/api/sessions', { sessionName: 'test-1', playerName: 'Anna' });
  assert.equal(res.status, 201);
  assert.equal(res.body.sessionId, 'TEST-1');
  assert.ok(res.body.playerToken);
});

test('rifiuta codici sessione non validi e nomi troppo lunghi', async () => {
  assert.equal((await post('/api/sessions', { sessionName: 'a b<script>', playerName: 'Anna' })).status, 400);
  assert.equal((await post('/api/sessions', { sessionName: 'OK-CODE', playerName: 'x'.repeat(40) })).status, 400);
});

test('blocca nomi duplicati e sessioni inesistenti', async () => {
  await post('/api/sessions', { sessionName: 'DUP', playerName: 'Luca' });
  assert.equal((await post('/api/sessions/join', { sessionId: 'dup', playerName: 'luca' })).status, 409);
  assert.equal((await post('/api/sessions/join', { sessionId: 'NOPE', playerName: 'Luca' })).status, 404);
});

test('eventi socket malformati non fanno cadere il server', async () => {
  const socket = await connect();
  socket.emit('join_session');
  socket.emit('add_piece', { sessionId: 'constructor', playerId: 'x' });
  socket.emit('player_finished', null);
  const res = await emit(socket, 'add_piece', { sessionId: '__proto__' });
  assert.equal(res.ok, false);
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
});

test('serve il token corretto per unirsi via socket e i punti non si possono assegnare ad altri', async () => {
  const host = (await post('/api/sessions', { sessionName: 'GAME', playerName: 'Host' })).body;
  const guest = (await post('/api/sessions/join', { sessionId: 'GAME', playerName: 'Guest' })).body;

  const intruder = await connect();
  const denied = await emit(intruder, 'join_session', { sessionId: 'GAME', playerId: host.playerId, token: 'wrong' });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'unauthorized');
  assert.equal((await emit(intruder, 'add_piece', { sessionId: 'GAME', playerId: host.playerId })).ok, false);

  const guestSocket = await connect();
  const joined = await emit(guestSocket, 'join_session', {
    sessionId: 'GAME',
    playerId: guest.playerId,
    token: guest.playerToken,
  });
  assert.equal(joined.ok, true);

  // Il playerId passato dal client viene ignorato: conta solo l'identità del socket
  const added = await emit(guestSocket, 'add_piece', { playerId: host.playerId });
  assert.equal(added.score, 1);
  assert.equal((await emit(guestSocket, 'remove_piece')).score, 0);
  assert.equal((await emit(guestSocket, 'remove_piece')).score, 0);

  const info = await (await fetch(`${baseUrl}/api/sessions/game/info`)).json();
  assert.ok(info.players.every((p) => p.score === 0));
  assert.ok(info.players.every((p) => !('id' in p)));
});

test('la partita termina quando tutti hanno finito', async () => {
  const host = (await post('/api/sessions', { sessionName: 'END', playerName: 'Solo' })).body;
  const socket = await connect();
  await emit(socket, 'join_session', { sessionId: 'END', playerId: host.playerId, token: host.playerToken });
  const ended = new Promise((resolve) => socket.on('game_ended', resolve));
  assert.equal((await emit(socket, 'player_finished')).ok, true);
  const session = await ended;
  assert.equal(session.status, 'ended');
  assert.equal((await emit(socket, 'add_piece')).ok, false);
  assert.equal((await post('/api/sessions/join', { sessionId: 'END', playerName: 'Late' })).status, 410);
  // Il codice di una sessione chiusa può essere riutilizzato
  assert.equal((await post('/api/sessions', { sessionName: 'END', playerName: 'New' })).status, 201);
});

test('la sessione viene ricaricata dal database dopo un riavvio', async () => {
  const host = (await post('/api/sessions', { sessionName: 'RESTART', playerName: 'Host' })).body;
  instance.sessions.clear();
  const socket = await connect();
  const joined = await emit(socket, 'join_session', {
    sessionId: 'RESTART',
    playerId: host.playerId,
    token: host.playerToken,
  });
  assert.equal(joined.ok, true);
  assert.equal((await emit(socket, 'add_piece')).score, 1);
});

test('la pagina di invito fa escape dei contenuti', async () => {
  await post('/api/sessions', { sessionName: 'XSS', playerName: '<svg onload=x>' });
  const html = await (await fetch(`${baseUrl}/join/XSS`)).text();
  assert.ok(!html.includes('<svg onload'));
  assert.ok(html.includes('&lt;svg onload=x&gt;'));
});

test('health check verifica il database', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.database, 'ok');
  assert.ok(body.version);
});

test('la pagina di invito usa una CSP con nonce coerente e header di sicurezza', async () => {
  await post('/api/sessions', { sessionName: 'CSP', playerName: 'Anna' });
  const res = await fetch(`${baseUrl}/join/CSP`);
  const csp = res.headers.get('content-security-policy');
  const html = await res.text();
  const nonce = csp.match(/'nonce-([^']+)'/)[1];
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('le richieste JSON malformate restituiscono 400 senza dettagli interni', async () => {
  const res = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.code, 'bad_request');
  assert.ok(!('stack' in body));
});

test('lo script di backup crea una copia consistente del database', () => {
  const backupDir = path.join(tmpDir, 'backups');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'backup.js'), backupDir], {
    // Nessun .env reale: la configurazione arriva solo dall'ambiente del test
    env: { ...process.env, DB_PATH: path.join(tmpDir, 'test.db'), ENV_FILE: path.join(tmpDir, 'nessun.env') },
  });
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
  assert.equal(files.length, 1);
  assert.ok(fs.statSync(path.join(backupDir, files[0])).size > 0);
});

test('la pagina privacy è pubblica e riporta i tempi di conservazione configurati', async () => {
  const res = await fetch(`${baseUrl}/privacy`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes('Informativa sulla privacy'));
  assert.ok(html.includes('dopo 30 giorni'));
  assert.ok(html.includes('Segnalazioni di errore (facoltative)'));
  assert.ok(html.includes('disattivate di default'));
});

test('tocchi ravvicinati non perdono punti e il database resta allineato', async () => {
  const host = (await post('/api/sessions', { sessionName: 'RAPID', playerName: 'Veloce' })).body;
  const socket = await connect();
  await emit(socket, 'join_session', { sessionId: 'RAPID', playerId: host.playerId, token: host.playerToken });
  const results = await Promise.all(Array.from({ length: 5 }, () => emit(socket, 'add_piece')));
  assert.deepEqual(
    results.map((r) => r.score),
    [1, 2, 3, 4, 5]
  );

  // Dopo un "riavvio" il punteggio letto dal database è lo stesso
  instance.sessions.clear();
  const info = await (await fetch(`${baseUrl}/api/sessions/RAPID/info`)).json();
  assert.equal(info.players[0].score, 5);
});

test("l'host può rimuovere un giocatore, gli altri no", async () => {
  const host = (await post('/api/sessions', { sessionName: 'KICK', playerName: 'Host' })).body;
  const guest = (await post('/api/sessions/join', { sessionId: 'KICK', playerName: 'Ospite' })).body;
  const hostSocket = await connect();
  const guestSocket = await connect();
  const joined = await emit(hostSocket, 'join_session', {
    sessionId: 'KICK',
    playerId: host.playerId,
    token: host.playerToken,
  });
  assert.equal(joined.session.hostId, host.playerId);
  await emit(guestSocket, 'join_session', { sessionId: 'KICK', playerId: guest.playerId, token: guest.playerToken });

  const forbidden = await emit(guestSocket, 'kick_player', { playerId: host.playerId });
  assert.equal(forbidden.code, 'forbidden');
  assert.equal((await emit(hostSocket, 'kick_player', { playerId: host.playerId })).code, 'bad_request');

  const kicked = new Promise((resolve) => guestSocket.on('player_kicked', resolve));
  assert.equal((await emit(hostSocket, 'kick_player', { playerId: guest.playerId })).ok, true);
  assert.deepEqual(await kicked, { sessionId: 'KICK' });

  // Il giocatore rimosso non può più giocare né rientrare con le vecchie credenziali
  assert.equal((await emit(guestSocket, 'add_piece')).ok, false);
  const rejoin = await emit(guestSocket, 'join_session', {
    sessionId: 'KICK',
    playerId: guest.playerId,
    token: guest.playerToken,
  });
  assert.equal(rejoin.code, 'unauthorized');
  const info = await (await fetch(`${baseUrl}/api/sessions/KICK/info`)).json();
  assert.deepEqual(
    info.players.map((p) => p.name),
    ['Host']
  );
});

test("rimuovendo l'ultimo giocatore che non ha finito la partita si chiude", async () => {
  const host = (await post('/api/sessions', { sessionName: 'KICK-END', playerName: 'Host' })).body;
  const guest = (await post('/api/sessions/join', { sessionId: 'KICK-END', playerName: 'Lento' })).body;
  const socket = await connect();
  await emit(socket, 'join_session', { sessionId: 'KICK-END', playerId: host.playerId, token: host.playerToken });
  await emit(socket, 'player_finished');

  const ended = new Promise((resolve) => socket.on('game_ended', resolve));
  await emit(socket, 'kick_player', { playerId: guest.playerId });
  const session = await ended;
  assert.equal(session.status, 'ended');
  assert.equal(session.players.length, 1);
});

test("l'host viene ricordato dopo un riavvio", async () => {
  const host = (await post('/api/sessions', { sessionName: 'HOST-DB', playerName: 'Host' })).body;
  await post('/api/sessions/join', { sessionId: 'HOST-DB', playerName: 'Ospite' });
  instance.sessions.clear();
  const socket = await connect();
  const joined = await emit(socket, 'join_session', {
    sessionId: 'HOST-DB',
    playerId: host.playerId,
    token: host.playerToken,
  });
  assert.equal(joined.session.hostId, host.playerId);
});

test("la pagina di invito apre l'app con un intent Android e rimanda allo store se manca", async () => {
  await post('/api/sessions', { sessionName: 'STORE', playerName: 'Anna' });
  const html = await (await fetch(`${baseUrl}/join/STORE`)).text();
  assert.ok(html.includes('intent://join/STORE#Intent;scheme=sushi-streak;package=com.stevatero.sushistreakapp;'));
  assert.ok(html.includes('S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3D'));
  assert.ok(html.includes('href="https://play.google.com/store/apps/details?id=com.stevatero.sushistreakapp"'));
});

test('i link della pagina di invito scartano pacchetti e URL non validi', () => {
  const links = appLinks('ABC', {
    androidPackage: 'x;S.evil=1',
    storeUrl: 'javascript:alert(1)',
    iosStoreUrl: 'javascript:alert(1)',
  });
  assert.equal(links.androidIntent, 'intent://join/ABC#Intent;scheme=sushi-streak;end');
  assert.equal(links.storeUrl, null);
  assert.equal(links.iosStoreUrl, null);
  assert.equal(links.iosAppId, null);
});

test("senza App Store configurato la pagina di invito non mostra banner iOS né l'associazione Universal Links", async () => {
  await post('/api/sessions', { sessionName: 'NO-IOS', playerName: 'Anna' });
  const html = await (await fetch(`${baseUrl}/join/NO-IOS`)).text();
  assert.ok(!html.includes('apple-itunes-app'));
  assert.equal((await fetch(`${baseUrl}/.well-known/apple-app-site-association`)).status, 404);
});

test('con Team ID e App Store configurati supporta Universal Links e Smart App Banner su iOS', async () => {
  const iosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-ios-'));
  const ios = createServer({
    dbPath: path.join(iosDir, 'test.db'),
    appleTeamId: 'ABCDE12345',
    iosAppStoreUrl: 'https://apps.apple.com/it/app/sushi-streak/id1234567890',
  });
  const iosUrl = `http://127.0.0.1:${await ios.start(0)}`;
  try {
    const res = await fetch(`${iosUrl}/.well-known/apple-app-site-association`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const [details] = (await res.json()).applinks.details;
    assert.deepEqual(details.appIDs, ['ABCDE12345.com.stevatero.sushistreakapp']);
    assert.equal(details.components[0]['/'], '/join/*');

    await fetch(`${iosUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName: 'IOS', playerName: 'Anna' }),
    });
    const html = await (await fetch(`${iosUrl}/join/IOS`)).text();
    assert.ok(
      html.includes('<meta name="apple-itunes-app" content="app-id=1234567890, app-argument=sushi-streak://join/IOS">')
    );
    assert.ok(html.includes('"https://apps.apple.com/it/app/sushi-streak/id1234567890"'));
  } finally {
    await ios.close();
    fs.rmSync(iosDir, { recursive: true, force: true });
  }
});

test("un Team ID Apple non valido non espone l'associazione Universal Links", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-ios-'));
  const server = createServer({ dbPath: path.join(dir, 'test.db'), appleTeamId: 'team id"' });
  const url = `http://127.0.0.1:${await server.start(0)}`;
  try {
    assert.equal((await fetch(`${url}/.well-known/apple-app-site-association`)).status, 404);
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un giocatore rimosso non può rientrare con lo stesso nome, anche dopo un riavvio', async () => {
  const host = (await post('/api/sessions', { sessionName: 'BAN', playerName: 'Host' })).body;
  const guest = (await post('/api/sessions/join', { sessionId: 'BAN', playerName: 'Intruso' })).body;
  const socket = await connect();
  await emit(socket, 'join_session', { sessionId: 'BAN', playerId: host.playerId, token: host.playerToken });
  assert.equal((await emit(socket, 'kick_player', { playerId: guest.playerId })).ok, true);

  const again = await post('/api/sessions/join', { sessionId: 'BAN', playerName: 'intruso' });
  assert.equal(again.status, 403);
  assert.equal(again.body.code, 'kicked');
  instance.sessions.clear();
  assert.equal((await post('/api/sessions/join', { sessionId: 'BAN', playerName: 'INTRUSO' })).status, 403);
  assert.equal((await post('/api/sessions/join', { sessionId: 'BAN', playerName: 'Amico' })).status, 200);
});

test("l'inizio della partita distingue un codice riutilizzato", async () => {
  const first = (await post('/api/sessions', { sessionName: 'REUSE', playerName: 'Uno' })).body;
  assert.ok(first.startedAt > 0);
  const info = await (await fetch(`${baseUrl}/api/sessions/REUSE/info`)).json();
  assert.equal(info.startedAt, first.startedAt);

  const socket = await connect();
  await emit(socket, 'join_session', { sessionId: 'REUSE', playerId: first.playerId, token: first.playerToken });
  await emit(socket, 'player_finished');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = (await post('/api/sessions', { sessionName: 'REUSE', playerName: 'Due' })).body;
  assert.ok(second.startedAt > first.startedAt);
  const joined = (await post('/api/sessions/join', { sessionId: 'REUSE', playerName: 'Tre' })).body;
  assert.equal(joined.startedAt, second.startedAt);
});

test('due creazioni contemporanee dello stesso codice non si sovrascrivono', async () => {
  const results = await Promise.all([
    post('/api/sessions', { sessionName: 'RACE', playerName: 'A' }),
    post('/api/sessions', { sessionName: 'RACE', playerName: 'B' }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const winner = results.find((r) => r.status === 201).body;
  const socket = await connect();
  const joined = await emit(socket, 'join_session', {
    sessionId: 'RACE',
    playerId: winner.playerId,
    token: winner.playerToken,
  });
  assert.equal(joined.ok, true);
});

test('le letture pubbliche e gli ingressi via socket hanno un limite di frequenza per IP', async () => {
  const limited = createServer({
    dbPath: path.join(tmpDir, 'limits.db'),
    readRateLimit: { max: 2, windowMs: 60 * 1000 },
    socketJoinRateLimit: { max: 2, windowMs: 60 * 1000 },
  });
  const port = await limited.start(0);
  const url = `http://127.0.0.1:${port}`;
  try {
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch(`${url}/api/sessions/NOPE/info`)).status);
    assert.deepEqual(statuses, [404, 404, 429]);

    // Dietro il proxy locale conta l'IP del client indicato da X-Forwarded-For
    const join = async (ip) => {
      const socket = ioClient(url, {
        transports: ['websocket'],
        forceNew: true,
        extraHeaders: { 'X-Forwarded-For': ip },
      });
      clients.push(socket);
      await new Promise((resolve) => socket.on('connect', resolve));
      return (await emit(socket, 'join_session', { sessionId: 'NOPE', playerId: 'x', token: 'y' })).code;
    };
    assert.deepEqual(
      [await join('203.0.113.1'), await join('203.0.113.1'), await join('203.0.113.1'), await join('203.0.113.2')],
      ['not_found', 'not_found', 'rate_limited', 'not_found']
    );
  } finally {
    await limited.close();
  }
});

test('i pezzi numerati non vengono contati due volte, anche dopo un riavvio', async () => {
  const host = (await post('/api/sessions', { sessionName: 'SEQ', playerName: 'Anna' })).body;
  const socket = await connect();
  const joined = await emit(socket, 'join_session', {
    sessionId: 'SEQ',
    playerId: host.playerId,
    token: host.playerToken,
  });
  assert.equal(joined.lastSeq, 0);
  assert.ok(joined.features.includes('piece_seq'));
  assert.ok(joined.features.includes('end_session'));

  assert.deepEqual(await emit(socket, 'add_piece', { seq: 1 }), { ok: true, score: 1, lastSeq: 1 });
  // Stesso pezzo rinviato (es. dopo un timeout): non cambia il punteggio
  const again = await emit(socket, 'add_piece', { seq: 1 });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(again.score, 1);
  assert.equal((await emit(socket, 'add_piece', { seq: 2 })).score, 2);
  assert.equal((await emit(socket, 'remove_piece', { seq: 3 })).score, 1);
  assert.equal((await emit(socket, 'add_piece', { seq: 'x' })).code, 'bad_request');
  assert.equal((await emit(socket, 'add_piece', { seq: -1 })).code, 'bad_request');

  // Dopo un riavvio il numero dell'ultimo pezzo viene riletto dal database
  instance.sessions.clear();
  const rejoined = await emit(socket, 'join_session', {
    sessionId: 'SEQ',
    playerId: host.playerId,
    token: host.playerToken,
  });
  assert.equal(rejoined.lastSeq, 3);
  assert.equal(rejoined.session.players[0].seq, 3);
  assert.equal((await emit(socket, 'add_piece', { seq: 3 })).duplicate, true);
  assert.equal((await emit(socket, 'add_piece', { seq: 4 })).score, 2);
  // Le app precedenti (senza numero) continuano a funzionare. Nuovo socket: il limite è di 6 pezzi al secondo
  const legacy = await connect();
  await emit(legacy, 'join_session', { sessionId: 'SEQ', playerId: host.playerId, token: host.playerToken });
  assert.equal((await emit(legacy, 'add_piece')).score, 3);
});

test("l'host termina la partita per tutti, gli altri no", async () => {
  const host = (await post('/api/sessions', { sessionName: 'STOP', playerName: 'Host' })).body;
  const guest = (await post('/api/sessions/join', { sessionId: 'STOP', playerName: 'Lento' })).body;
  const hostSocket = await connect();
  const guestSocket = await connect();
  await emit(hostSocket, 'join_session', { sessionId: 'STOP', playerId: host.playerId, token: host.playerToken });
  await emit(guestSocket, 'join_session', { sessionId: 'STOP', playerId: guest.playerId, token: guest.playerToken });
  await emit(guestSocket, 'add_piece', { seq: 1 });

  assert.equal((await emit(guestSocket, 'end_session')).code, 'forbidden');

  const ended = new Promise((resolve) => guestSocket.on('game_ended', resolve));
  assert.equal((await emit(hostSocket, 'end_session')).ok, true);
  const session = await ended;
  assert.equal(session.status, 'ended');
  assert.equal(session.closedBy, 'host');
  assert.ok(session.players.every((p) => p.finished));
  assert.equal(session.players.find((p) => p.id === guest.playerId).score, 1);
  assert.equal((await emit(guestSocket, 'add_piece', { seq: 2 })).ok, false);

  // Dopo un riavvio la partita resta chiusa dall'host
  instance.sessions.clear();
  const info = await (await fetch(`${baseUrl}/api/sessions/STOP/info`)).json();
  assert.equal(info.status, 'ended');
  const rejoined = await emit(hostSocket, 'join_session', {
    sessionId: 'STOP',
    playerId: host.playerId,
    token: host.playerToken,
  });
  assert.equal(rejoined.session.closedBy, 'host');
});

test('una partita ferma si chiude da sola solo se almeno metà dei giocatori ha finito', async () => {
  await withServer({ autoEndIdleMs: 80 }, async ({ server, post: postTo, connect: connectTo }) => {
    const host = (await postTo('/api/sessions', { sessionName: 'IDLE', playerName: 'Host' })).body;
    const guest = (await postTo('/api/sessions/join', { sessionId: 'IDLE', playerName: 'Ospite' })).body;
    const socket = await connectTo();
    await emit(socket, 'join_session', { sessionId: 'IDLE', playerId: host.playerId, token: host.playerToken });

    // Nessuno ha finito: la partita resta aperta anche se ferma
    await wait(100);
    await server.sweep();
    assert.equal(server.sessions.get('IDLE').status, 'active');

    await emit(socket, 'player_finished');
    await server.sweep();
    assert.equal(server.sessions.get('IDLE').status, 'active', 'appena finito: non è ancora ferma');

    const ended = new Promise((resolve) => socket.on('game_ended', resolve));
    await wait(100);
    await server.sweep();
    const session = await ended;
    assert.equal(session.closedBy, 'auto');
    assert.ok(session.players.find((p) => p.id === guest.playerId).finished);
  });
});

test("se l'host è assente il ruolo passa al primo giocatore connesso", async () => {
  await withServer({ hostTransferMs: 80 }, async ({ server, post: postTo, connect: connectTo }) => {
    const host = (await postTo('/api/sessions', { sessionName: 'AWAY', playerName: 'Host' })).body;
    const guest = (await postTo('/api/sessions/join', { sessionId: 'AWAY', playerName: 'Ospite' })).body;
    const hostSocket = await connectTo();
    const guestSocket = await connectTo();
    await emit(hostSocket, 'join_session', { sessionId: 'AWAY', playerId: host.playerId, token: host.playerToken });
    await emit(guestSocket, 'join_session', { sessionId: 'AWAY', playerId: guest.playerId, token: guest.playerToken });

    // Host connesso: nessun passaggio
    await wait(100);
    await server.sweep();
    assert.equal(server.sessions.get('AWAY').hostId, host.playerId);

    hostSocket.disconnect();
    await wait(30);
    await server.sweep();
    assert.equal(server.sessions.get('AWAY').hostId, host.playerId, "l'assenza è ancora breve");

    const update = new Promise((resolve) => guestSocket.on('session_update', resolve));
    await wait(100);
    await server.sweep();
    assert.equal((await update).hostId, guest.playerId);
    // Il nuovo host può terminare la partita
    assert.equal((await emit(guestSocket, 'end_session')).ok, true);
  });
});

test('con una versione minima le app precedenti vengono invitate ad aggiornare', async () => {
  await withServer({ minAppVersion: '1.8.0' }, async ({ url, post: postTo, connect: connectTo }) => {
    const old = await postTo('/api/sessions', { sessionName: 'OLD', playerName: 'Anna' });
    assert.equal(old.status, 426);
    assert.equal(old.body.code, 'upgrade_required');
    assert.equal(
      (await postTo('/api/sessions', { sessionName: 'OLD', playerName: 'Anna' }, { 'X-App-Version': '1.7.9' })).status,
      426
    );

    const created = await postTo(
      '/api/sessions',
      { sessionName: 'NEW', playerName: 'Anna' },
      { 'X-App-Version': '1.8.0' }
    );
    assert.equal(created.status, 201);
    const socket = await connectTo();
    const credentials = { sessionId: 'NEW', playerId: created.body.playerId, token: created.body.playerToken };
    assert.equal((await emit(socket, 'join_session', credentials)).code, 'upgrade_required');
    assert.equal((await emit(socket, 'join_session', { ...credentials, appVersion: '1.10.0' })).ok, true);

    const health = await (await fetch(`${url}/api/health`)).json();
    assert.equal(health.minAppVersion, '1.8.0');
  });
  // Senza versione minima tutte le app sono accettate (default)
  assert.equal((await post('/api/sessions', { sessionName: 'ANY-APP', playerName: 'Anna' })).status, 201);
});

test("le segnalazioni di errore dell'app vengono salvate, limitate e cancellate dopo la conservazione", async () => {
  await withServer(
    { crashReportRateLimit: { max: 2, windowMs: 60 * 1000 }, crashRetentionMs: 50 },
    async ({ server, dbPath, post: postTo }) => {
      const report = {
        appVersion: '1.8.0',
        platform: 'android',
        osVersion: '36',
        name: 'TypeError',
        message: 'Cannot read property x of undefined',
        stack: 'at foo (index.bundle:1:2)\n'.repeat(100),
        fatal: true,
      };
      assert.equal((await postTo('/api/crash-reports', report)).status, 202);
      assert.equal((await postTo('/api/crash-reports', { platform: 'ios' })).status, 400);
      assert.equal((await postTo('/api/crash-reports', report)).status, 429);

      const readReports = () =>
        execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'crash-reports.js')], {
          env: { ...process.env, DB_PATH: dbPath, ENV_FILE: path.join(path.dirname(dbPath), 'nessun.env') },
          encoding: 'utf8',
        });
      const output = readReports();
      assert.match(output, /app 1\.8\.0 · android 36 · FATALE/);
      assert.match(output, /TypeError: Cannot read property x of undefined/);

      await wait(80);
      await server.sweep();
      assert.match(readReports(), /Nessuna segnalazione/);
    }
  );
});

test("l'ultima attività viene salvata alla chiusura anche se il salvataggio è differito", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-flush-'));
  const dbPath = path.join(dir, 'test.db');
  const server = createServer({ dbPath, activityPersistMs: 60 * 60 * 1000 });
  const url = `http://127.0.0.1:${await server.start(0)}`;
  const { openDatabase } = require('../db');
  const lastActivity = async () => {
    const db = openDatabase(dbPath);
    try {
      return (await db.get('SELECT last_activity FROM sessions WHERE id = ?', ['FLUSH'])).last_activity;
    } finally {
      await db.close();
    }
  };
  try {
    const res = await fetch(`${url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName: 'FLUSH', playerName: 'Anna' }),
    });
    const host = await res.json();
    const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    await new Promise((resolve) => socket.on('connect', resolve));
    await emit(socket, 'join_session', { sessionId: 'FLUSH', playerId: host.playerId, token: host.playerToken });
    await wait(20);
    const pieceAt = Date.now();
    assert.equal((await emit(socket, 'add_piece', { seq: 1 })).score, 1);
    assert.ok((await lastActivity()) < pieceAt, "il pezzo non scrive subito l'attività");

    socket.disconnect();
    await server.close();
    assert.ok((await lastActivity()) >= pieceAt, "la chiusura salva l'ultima attività");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
