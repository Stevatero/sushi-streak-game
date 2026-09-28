const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { openDatabase, migrate } = require('./db');
const { renderJoinPage, renderNotFoundPage } = require('./joinPage');
const { renderPrivacyPage } = require('./privacyPage');
const logger = require('./logger');
const { version: SERVICE_VERSION } = require('./package.json');

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
  'https://sushi.dietalab.net',
];

const DEFAULT_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  // Interfaccia di ascolto: in produzione 127.0.0.1, così il server è raggiungibile solo tramite nginx
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || path.join(__dirname, 'sushi_game.db'),
  // Dopo quanto tempo senza attività una sessione viene chiusa (default 3 ore)
  inactivityMs: (Number(process.env.SESSION_INACTIVITY_MIN) || 180) * 60 * 1000,
  // Per quanto tempo si conservano le sessioni chiuse prima di cancellarle (default 30 giorni)
  retentionMs: (Number(process.env.SESSION_RETENTION_DAYS) || 30) * 24 * 60 * 60 * 1000,
  sweepIntervalMs: 60 * 1000,
  maxPlayersPerSession: 30,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : DEFAULT_CORS_ORIGINS,
  trustProxy: process.env.TRUST_PROXY || 'loopback',
  androidPackage: process.env.ANDROID_PACKAGE || 'com.stevatero.sushistreakapp',
  // Dove scaricare l'app se non è installata (default: scheda Google Play del pacchetto)
  appStoreUrl: process.env.APP_STORE_URL || '',
  // Contatto mostrato nell'informativa privacy (email o URL)
  privacyContact: process.env.PRIVACY_CONTACT || 'https://github.com/Stevatero/sushi-streak-game/issues',
  androidCertFingerprints: (process.env.ANDROID_CERT_SHA256 || '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean),
};

const SESSION_ID_RE = /^[A-Z0-9-]{3,20}$/;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_SCORE = 999;
// Limite di frequenza per add/remove piece: massimo N eventi per finestra
const PIECE_RATE_LIMIT = { max: 6, windowMs: 1000 };

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeSessionId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizePlayerName(value) {
  if (typeof value !== 'string') return '';
  return (
    value
      // eslint-disable-next-line no-control-regex -- rimozione intenzionale dei caratteri di controllo
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function validateSessionId(sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new ApiError(
      400,
      'Il codice sessione deve avere 3-20 caratteri tra lettere, numeri e trattino',
      'invalid_session_id'
    );
  }
}

function validatePlayerName(name) {
  const length = [...name].length;
  if (length < 1 || length > MAX_PLAYER_NAME_LENGTH) {
    throw new ApiError(400, `Il nome deve avere tra 1 e ${MAX_PLAYER_NAME_LENGTH} caratteri`, 'invalid_player_name');
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function tokenMatches(token, storedHash) {
  if (typeof token !== 'string' || !token || typeof storedHash !== 'string' || !storedHash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Limitatore di richieste in memoria per IP (sufficiente per un'istanza singola)
function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Troppe richieste, riprova tra poco', code: 'rate_limited' });
    }
    return next();
  };
}

function createServer(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const db = openDatabase(config.dbPath);

  // Sessioni attive in memoria: id -> { id, name, status, lastActivity, hostId, players: Map<id, player> }
  const sessions = new Map();
  const pendingLoads = new Map();

  const expiresAt = (session) => session.lastActivity + config.inactivityMs;
  const isExpired = (session) => Date.now() > expiresAt(session);
  const isOpen = (session) => session.status === 'active' && !isExpired(session);

  function publicSession(session) {
    return {
      id: session.id,
      name: session.name,
      status: isOpen(session) ? 'active' : session.status === 'active' ? 'expired' : session.status,
      expiresAt: expiresAt(session),
      hostId: session.hostId,
      players: [...session.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        finished: p.finished,
      })),
    };
  }

  // Informazioni pubbliche per la condivisione: nessun id dei giocatori
  function shareInfo(session) {
    const pub = publicSession(session);
    return {
      sessionId: session.id,
      sessionName: session.name,
      playersCount: session.players.size,
      isActive: pub.status === 'active',
      status: pub.status,
      expiresAt: pub.expiresAt,
      players: pub.players.map(({ name, score, finished }) => ({ name, score, finished })),
    };
  }

  function logDbError(context) {
    return (err) => logger.error('Errore database', { context, err });
  }

  async function closeSession(session, status) {
    session.status = status;
    sessions.delete(session.id);
    await db.run('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?', [status, Date.now(), session.id]);
  }

  // Restituisce la sessione dalla memoria o la ricarica dal database (es. dopo un riavvio)
  async function loadSession(sessionId) {
    if (sessions.has(sessionId)) return sessions.get(sessionId);
    if (pendingLoads.has(sessionId)) return pendingLoads.get(sessionId);

    const load = (async () => {
      const row = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
      if (!row) return null;
      const rows = await db.all('SELECT * FROM players WHERE session_id = ? ORDER BY joined_at, rowid', [sessionId]);
      const session = {
        id: row.id,
        name: row.name,
        status: row.status || 'active',
        lastActivity: row.last_activity || 0,
        // Le sessioni create prima della colonna host_id hanno come host il primo giocatore entrato
        hostId: row.host_id || rows[0]?.id || null,
        players: new Map(
          rows.map((p) => [
            p.id,
            { id: p.id, name: p.name, score: p.score || 0, finished: !!p.finished, tokenHash: p.token },
          ])
        ),
      };
      if (session.status === 'active') {
        if (isExpired(session)) {
          await closeSession(session, 'expired');
        } else {
          sessions.set(sessionId, session);
        }
      }
      return session;
    })();

    pendingLoads.set(sessionId, load);
    try {
      return await load;
    } finally {
      pendingLoads.delete(sessionId);
    }
  }

  function touch(session) {
    session.lastActivity = Date.now();
    db.run('UPDATE sessions SET last_activity = ? WHERE id = ?', [session.lastActivity, session.id]).catch(
      logDbError('last_activity')
    );
  }

  function newPlayer(name) {
    const token = crypto.randomBytes(24).toString('base64url');
    return {
      token,
      player: { id: crypto.randomUUID(), name, score: 0, finished: false, tokenHash: hashToken(token) },
    };
  }

  // Esegue le modifiche di un giocatore una alla volta: così si può scrivere prima sul database e poi
  // in memoria senza perdere aggiornamenti quando arrivano più tocchi ravvicinati
  const playerQueues = new WeakMap();
  function withPlayerLock(player, task) {
    const run = (playerQueues.get(player) || Promise.resolve()).then(task);
    playerQueues.set(
      player,
      run.catch(() => undefined)
    );
    return run;
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Nonce per gli script/stili inline della pagina di invito, usato dalla Content Security Policy
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
          styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'] }));

  // Log di accesso strutturato (livello debug per le richieste riuscite)
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'info' : 'debug';
      logger[level]('http_request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    });
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const writeLimiter = createRateLimiter({ max: 30, windowMs: 60 * 1000 });

  app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Sushi Streak Server is running!', timestamp: new Date().toISOString() });
  });

  app.get(
    '/api/health',
    asyncRoute(async (req, res) => {
      let database = 'ok';
      try {
        await db.get('SELECT 1');
      } catch (err) {
        database = 'error';
        logger.error('Health check database fallito', { err });
      }
      res.status(database === 'ok' ? 200 : 503).json({
        status: database === 'ok' ? 'healthy' : 'degraded',
        service: 'sushi-streak-backend',
        version: SERVICE_VERSION,
        database,
        activeSessions: sessions.size,
        timestamp: new Date().toISOString(),
      });
    })
  );

  app.post(
    '/api/sessions',
    writeLimiter,
    asyncRoute(async (req, res) => {
      const body = req.body || {};
      const sessionName = typeof body.sessionName === 'string' ? body.sessionName.trim() : '';
      const sessionId = normalizeSessionId(sessionName);
      const playerName = normalizePlayerName(body.playerName);
      validateSessionId(sessionId);
      validatePlayerName(playerName);

      const existing = await loadSession(sessionId);
      if (existing && isOpen(existing)) {
        throw new ApiError(409, 'Esiste già una sessione attiva con questo nome. Scegline un altro.', 'session_exists');
      }
      if (existing) {
        // Il codice di una sessione chiusa può essere riutilizzato
        await db.run('DELETE FROM players WHERE session_id = ?', [sessionId]);
        await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      }

      const now = Date.now();
      const { player, token } = newPlayer(playerName);
      try {
        await db.run("INSERT INTO sessions (id, name, status, last_activity, host_id) VALUES (?, ?, 'active', ?, ?)", [
          sessionId,
          sessionName,
          now,
          player.id,
        ]);
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          throw new ApiError(
            409,
            'Esiste già una sessione attiva con questo nome. Scegline un altro.',
            'session_exists'
          );
        }
        throw err;
      }

      await db.run('INSERT INTO players (id, name, session_id, token, joined_at) VALUES (?, ?, ?, ?, ?)', [
        player.id,
        player.name,
        sessionId,
        player.tokenHash,
        now,
      ]);

      const session = {
        id: sessionId,
        name: sessionName,
        status: 'active',
        lastActivity: now,
        hostId: player.id,
        players: new Map([[player.id, player]]),
      };
      sessions.set(sessionId, session);

      res.status(201).json({
        sessionId,
        sessionName,
        playerId: player.id,
        playerToken: token,
        expiresAt: expiresAt(session),
      });
    })
  );

  app.post(
    '/api/sessions/join',
    writeLimiter,
    asyncRoute(async (req, res) => {
      const body = req.body || {};
      const sessionId = normalizeSessionId(body.sessionId);
      const playerName = normalizePlayerName(body.playerName);
      if (!sessionId) throw new ApiError(400, 'Inserisci il codice della sessione', 'invalid_session_id');
      validatePlayerName(playerName);

      const session = await loadSession(sessionId);
      if (!session) throw new ApiError(404, 'Sessione non trovata', 'not_found');
      if (!isOpen(session)) throw new ApiError(410, 'La sessione è terminata o scaduta', 'session_closed');

      const lower = playerName.toLowerCase();
      if ([...session.players.values()].some((p) => p.name.toLowerCase() === lower)) {
        throw new ApiError(409, 'Nome già in uso in questa sessione', 'name_taken');
      }
      if (session.players.size >= config.maxPlayersPerSession) {
        throw new ApiError(403, 'La sessione ha raggiunto il numero massimo di giocatori', 'session_full');
      }

      // Il giocatore viene riservato in memoria prima dell'insert per evitare nomi duplicati concorrenti
      const { player, token } = newPlayer(playerName);
      session.players.set(player.id, player);
      try {
        await db.run('INSERT INTO players (id, name, session_id, token, joined_at) VALUES (?, ?, ?, ?, ?)', [
          player.id,
          player.name,
          sessionId,
          player.tokenHash,
          Date.now(),
        ]);
      } catch (err) {
        session.players.delete(player.id);
        throw err;
      }

      touch(session);
      io.to(sessionId).emit('session_update', publicSession(session));

      res.json({
        sessionId,
        sessionName: session.name,
        playerId: player.id,
        playerToken: token,
        expiresAt: expiresAt(session),
      });
    })
  );

  app.get(
    '/api/sessions/:sessionId/info',
    asyncRoute(async (req, res) => {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const session = SESSION_ID_RE.test(sessionId) ? await loadSession(sessionId) : null;
      if (!session) throw new ApiError(404, 'Sessione non trovata', 'not_found');
      res.json(shareInfo(session));
    })
  );

  app.get(
    '/join/:sessionId',
    asyncRoute(async (req, res) => {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const session = SESSION_ID_RE.test(sessionId) ? await loadSession(sessionId) : null;
      const nonce = res.locals.cspNonce;
      if (!session) return res.status(404).type('html').send(renderNotFoundPage(nonce));
      return res.type('html').send(
        renderJoinPage(shareInfo(session), nonce, {
          androidPackage: config.androidPackage,
          storeUrl: config.appStoreUrl || `https://play.google.com/store/apps/details?id=${config.androidPackage}`,
        })
      );
    })
  );

  // Verifica degli Android App Links (attiva solo se è configurata l'impronta del certificato)
  app.get('/privacy', (req, res) => {
    res.type('html').send(
      renderPrivacyPage({
        contact: config.privacyContact,
        retentionDays: Math.round(config.retentionMs / (24 * 60 * 60 * 1000)),
        inactivityMinutes: Math.round(config.inactivityMs / 60000),
        nonce: res.locals.cspNonce,
      })
    );
  });

  app.get('/.well-known/assetlinks.json', (req, res) => {
    if (!config.androidCertFingerprints.length) return res.status(404).json([]);
    return res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: config.androidPackage,
          sha256_cert_fingerprints: config.androidCertFingerprints,
        },
      },
    ]);
  });

  app.use((req, res) => res.status(404).json({ error: 'Risorsa non trovata', code: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Richiesta non valida', code: 'bad_request' });
    }
    logger.error('Errore non gestito', { err, method: req.method, path: req.path });
    return res.status(500).json({ error: 'Errore interno del server', code: 'internal' });
  });

  // ---------------------------------------------------------------------------
  // Socket.IO
  // ---------------------------------------------------------------------------
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] } });

  // Avvolge un gestore di evento: valida l'ack, intercetta ogni errore e garantisce una sola risposta
  function handler(fn) {
    return (...args) => {
      const last = args[args.length - 1];
      const rawAck = typeof last === 'function' ? args.pop() : null;
      let answered = false;
      const ack = (response) => {
        if (answered || !rawAck) return;
        answered = true;
        rawAck(response);
      };
      const payload = args[0] && typeof args[0] === 'object' ? args[0] : {};
      Promise.resolve()
        .then(() => fn(payload, ack))
        .catch((err) => {
          logger.error('Errore gestore socket', { err });
          ack({ ok: false, code: 'internal', error: 'Errore interno del server' });
        });
    };
  }

  io.on('connection', (socket) => {
    socket.data.pieceHits = [];

    const currentContext = () => {
      const { sessionId, playerId } = socket.data;
      if (!sessionId || !playerId)
        return { error: { ok: false, code: 'not_joined', error: 'Non sei in una sessione' } };
      const session = sessions.get(sessionId);
      if (!session || !isOpen(session)) {
        return { error: { ok: false, code: 'session_closed', error: 'La sessione è terminata o scaduta' } };
      }
      const player = session.players.get(playerId);
      if (!player) return { error: { ok: false, code: 'unauthorized', error: 'Giocatore non valido' } };
      return { session, player };
    };

    const withinRateLimit = () => {
      const now = Date.now();
      socket.data.pieceHits = socket.data.pieceHits.filter((t) => now - t < PIECE_RATE_LIMIT.windowMs);
      if (socket.data.pieceHits.length >= PIECE_RATE_LIMIT.max) return false;
      socket.data.pieceHits.push(now);
      return true;
    };

    const broadcast = (session) => io.to(session.id).emit('session_update', publicSession(session));

    socket.on(
      'join_session',
      handler(async ({ sessionId: rawSessionId, playerId, token }, ack) => {
        const sessionId = normalizeSessionId(rawSessionId);
        if (!SESSION_ID_RE.test(sessionId) || typeof playerId !== 'string') {
          return ack({ ok: false, code: 'bad_request', error: 'Dati non validi' });
        }
        const session = await loadSession(sessionId);
        if (!session) return ack({ ok: false, code: 'not_found', error: 'Sessione non trovata' });

        const player = session.players.get(playerId);
        if (!player || !tokenMatches(token, player.tokenHash)) {
          return ack({ ok: false, code: 'unauthorized', error: 'Credenziali di gioco non valide' });
        }

        if (socket.data.sessionId && socket.data.sessionId !== sessionId) {
          socket.leave(socket.data.sessionId);
        }
        socket.data.sessionId = sessionId;
        socket.data.playerId = playerId;
        socket.join(sessionId);

        if (isOpen(session)) touch(session);
        return ack({ ok: true, session: publicSession(session) });
      })
    );

    socket.on(
      'leave_session',
      handler(async (payload, ack) => {
        if (socket.data.sessionId) socket.leave(socket.data.sessionId);
        socket.data.sessionId = null;
        socket.data.playerId = null;
        ack({ ok: true });
      })
    );

    const changeScore = (delta) =>
      handler(async (payload, ack) => {
        const context = currentContext();
        if (context.error) return ack(context.error);
        if (!withinRateLimit()) return ack({ ok: false, code: 'rate_limited', error: 'Stai andando troppo veloce!' });

        return withPlayerLock(context.player, async () => {
          // Lo stato va ricontrollato: nel frattempo la partita può essere finita o il giocatore rimosso
          const { session, player, error } = currentContext();
          if (error) return ack(error);
          if (player.finished) return ack({ ok: false, code: 'finished', error: 'Hai già finito' });

          const next = Math.min(MAX_SCORE, Math.max(0, player.score + delta));
          if (next !== player.score) {
            // Prima il database, poi la memoria: se la scrittura fallisce il punteggio non cambia
            await db.run('UPDATE players SET score = ? WHERE id = ?', [next, player.id]);
            player.score = next;
            touch(session);
            broadcast(session);
          }
          return ack({ ok: true, score: player.score });
        });
      });

    socket.on('add_piece', changeScore(1));
    socket.on('remove_piece', changeScore(-1));

    socket.on(
      'player_finished',
      handler(async (payload, ack) => {
        const context = currentContext();
        if (context.error) return ack(context.error);

        return withPlayerLock(context.player, async () => {
          const { session, player, error } = currentContext();
          if (error) return ack(error);
          if (!player.finished) {
            await db.run('UPDATE players SET finished = 1 WHERE id = ?', [player.id]);
            player.finished = true;
            touch(session);
          }
          await endIfAllFinished(session);
          return ack({ ok: true });
        });
      })
    );

    // L'host può rimuovere un giocatore (es. chi è entrato indovinando il codice)
    socket.on(
      'kick_player',
      handler(async ({ playerId: targetId }, ack) => {
        const { session, player, error } = currentContext();
        if (error) return ack(error);
        if (player.id !== session.hostId) {
          return ack({
            ok: false,
            code: 'forbidden',
            error: 'Solo chi ha creato la partita può rimuovere i giocatori',
          });
        }
        if (typeof targetId !== 'string' || targetId === player.id) {
          return ack({ ok: false, code: 'bad_request', error: 'Giocatore non valido' });
        }
        const target = session.players.get(targetId);
        if (!target) return ack({ ok: false, code: 'not_found', error: 'Giocatore non trovato' });

        await withPlayerLock(target, async () => {
          await db.run('DELETE FROM players WHERE id = ?', [target.id]);
          session.players.delete(target.id);
        });
        // I dispositivi del giocatore rimosso escono dalla stanza e vengono avvisati
        for (const s of await io.in(session.id).fetchSockets()) {
          if (s.data.playerId !== target.id) continue;
          s.emit('player_kicked', { sessionId: session.id });
          s.leave(session.id);
          s.data.sessionId = null;
          s.data.playerId = null;
        }
        touch(session);
        logger.info("Giocatore rimosso dall'host", { sessionId: session.id });
        await endIfAllFinished(session);
        return ack({ ok: true });
      })
    );
  });

  // Chiude la partita se tutti i giocatori rimasti hanno finito, altrimenti aggiorna i client
  async function endIfAllFinished(session) {
    const players = [...session.players.values()];
    const allFinished = players.length > 0 && players.every((p) => p.finished);
    if (allFinished && session.status === 'active') await closeSession(session, 'ended');
    io.to(session.id).emit('session_update', publicSession(session));
    if (allFinished) io.to(session.id).emit('game_ended', publicSession(session));
  }

  // ---------------------------------------------------------------------------
  // Manutenzione periodica: chiusura sessioni inattive e pulizia di quelle vecchie
  // ---------------------------------------------------------------------------
  async function sweep() {
    const now = Date.now();
    for (const session of [...sessions.values()]) {
      if (!isExpired(session)) continue;
      // Un errore su una sessione non deve impedire la chiusura delle altre
      try {
        await closeSession(session, 'expired');
        io.to(session.id).emit('session_expired', { sessionId: session.id });
        io.in(session.id).socketsLeave(session.id);
      } catch (err) {
        logDbError('sweep_session')(err);
      }
    }
    await db.run("UPDATE sessions SET status = 'expired', ended_at = ? WHERE status = 'active' AND last_activity < ?", [
      now,
      now - config.inactivityMs,
    ]);
    const purgeBefore = now - config.retentionMs;
    await db.run(
      "DELETE FROM players WHERE session_id IN (SELECT id FROM sessions WHERE status != 'active' AND ended_at < ?)",
      [purgeBefore]
    );
    await db.run("DELETE FROM sessions WHERE status != 'active' AND ended_at < ?", [purgeBefore]);
  }

  let sweepTimer = null;

  async function start(port = config.port) {
    await migrate(db);
    sweepTimer = setInterval(() => sweep().catch(logDbError('sweep')), config.sweepIntervalMs);
    await new Promise((resolve) => server.listen(port, config.host, resolve));
    return server.address().port;
  }

  async function close() {
    if (sweepTimer) clearInterval(sweepTimer);
    await new Promise((resolve) => io.close(() => resolve()));
    await db.close();
  }

  return { app, server, io, start, close, sweep, sessions };
}

module.exports = { createServer, normalizePlayerName, normalizeSessionId };

if (require.main === module) {
  const instance = createServer();
  instance
    .start()
    .then((port) => logger.info('Server in ascolto', { port, version: SERVICE_VERSION }))
    .catch((err) => {
      logger.error('Avvio del server fallito', { err });
      process.exit(1);
    });

  const shutdown = (signal) => {
    logger.info('Chiusura in corso', { signal });
    instance
      .close()
      .catch((err) => logger.error('Errore in chiusura', { err }))
      .finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error('Promise rifiutata non gestita', { err }));
}
