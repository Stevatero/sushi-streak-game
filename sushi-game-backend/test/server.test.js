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
  instance = createServer({ dbPath: path.join(tmpDir, 'test.db'), inactivityMs: 60 * 60 * 1000 });
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
