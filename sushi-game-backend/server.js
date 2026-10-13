// Configurazione da sushi-game-backend/.env (solo avviando il server, non nei test): va letta prima
// del logger e di DEFAULT_CONFIG. Le variabili già impostate da PM2 o dalla shell hanno la precedenza.
const { loadEnv } = require('./env');
const envFile = require.main === module ? loadEnv() : null;

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

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Minuti da una variabile d'ambiente: 0 è un valore valido (disattiva la funzione), vuoto o non valido
// usa il default
function minutesFromEnv(value, defaultMinutes) {
  if (value === undefined || String(value).trim() === '') return defaultMinutes;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : defaultMinutes;
}

const DEFAULT_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  // Interfaccia di ascolto: in produzione 127.0.0.1, così il server è raggiungibile solo tramite nginx
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || path.join(__dirname, 'sushi_game.db'),
  // Dopo quanto tempo senza attività una sessione viene chiusa (default 3 ore)
  inactivityMs: (Number(process.env.SESSION_INACTIVITY_MIN) || 180) * MINUTE_MS,
  // Per quanto tempo si conservano le sessioni chiuse prima di cancellarle (default 30 giorni)
  retentionMs: (Number(process.env.SESSION_RETENTION_DAYS) || 30) * DAY_MS,
  // Chiusura automatica di una partita dopo questi minuti senza pezzi, se almeno metà dei giocatori ha
  // finito (default 45, 0 = mai)
  autoEndIdleMs: minutesFromEnv(process.env.SESSION_AUTO_END_MIN, 45) * MINUTE_MS,
  // Il ruolo di host passa a un altro giocatore connesso dopo questi minuti di assenza dell'host
  // (default 15, 0 = mai)
  hostTransferMs: minutesFromEnv(process.env.HOST_TRANSFER_MIN, 15) * MINUTE_MS,
  // Versione minima dell'app (es. 1.8.0): le precedenti ricevono "upgrade_required". Vuoto = tutte
  minAppVersion: process.env.MIN_APP_VERSION || '',
  // L'ultima attività di una partita è sempre aggiornata in memoria e salvata al più ogni 30 secondi
  activityPersistMs: 30 * 1000,
  // Segnalazioni di errore inviate dall'app (solo con il consenso dell'utente): conservazione e limiti
  crashRetentionMs: (Number(process.env.CRASH_RETENTION_DAYS) || 30) * DAY_MS,
  maxCrashReports: 5000,
  sweepIntervalMs: MINUTE_MS,
  maxPlayersPerSession: 30,
  // Limiti di frequenza per IP: creazione/ingresso, letture pubbliche (info e pagina di invito),
  // ingresso via socket (anche le riconnessioni) e segnalazioni di errore
  writeRateLimit: { max: 30, windowMs: MINUTE_MS },
  readRateLimit: { max: 120, windowMs: MINUTE_MS },
  socketJoinRateLimit: { max: 60, windowMs: MINUTE_MS },
  crashReportRateLimit: { max: 20, windowMs: 60 * MINUTE_MS },
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
  // iOS: Team ID Apple (10 caratteri) e bundle identifier per gli Universal Links
  appleTeamId: process.env.APPLE_TEAM_ID || '',
  iosBundleId: process.env.IOS_BUNDLE_ID || 'com.stevatero.sushistreakapp',
  // Pagina dell'app sull'App Store (facoltativa, finché l'app iOS non è pubblicata resta vuota)
  iosAppStoreUrl: process.env.IOS_APP_STORE_URL || '',
};

const APPLE_TEAM_ID_RE = /^[A-Z0-9]{10}$/;
const BUNDLE_ID_RE = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;

const SESSION_ID_RE = /^[A-Z0-9-]{3,20}$/;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_SCORE = 999;
// Limite di frequenza per add/remove piece: massimo N eventi per finestra
const PIECE_RATE_LIMIT = { max: 6, windowMs: 1000 };
// Funzioni del protocollo offerte da questo server, comunicate all'app quando entra in partita:
// piece_seq = pezzi numerati (nessun doppione rinviando dopo un timeout), end_session = l'host chiude
// la partita per tutti, host_transfer = il ruolo di host passa a un altro giocatore se l'host è assente
const FEATURES = ['piece_seq', 'end_session', 'host_transfer'];
const UPGRADE_MESSAGE = "È disponibile una nuova versione di Sushi Streak: aggiorna l'app per continuare a giocare.";

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)/;

function parseVersion(value) {
  const match = typeof value === 'string' ? VERSION_RE.exec(value.trim()) : null;
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

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

const LOOPBACK_RE = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

// Limitatore di richieste in memoria per chiave (IP), sufficiente per un'istanza singola.
// Il middleware Express usa req.ip; allow(key) serve per gli eventi socket.
function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  const allow = (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };

  const middleware = (req, res, next) => {
    if (allow(req.ip)) return next();
    return res.status(429).json({ error: 'Troppe richieste, riprova tra poco', code: 'rate_limited' });
  };
  middleware.allow = allow;
  return middleware;
}

// SQLite salva created_at come 'AAAA-MM-GG HH:MM:SS' in UTC
function parseSqliteTimestamp(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(time) ? null : time;
}

function parseKickedNames(value) {
  try {
    const list = JSON.parse(value || '[]');
    return new Set(Array.isArray(list) ? list.filter((n) => typeof n === 'string') : []);
  } catch {
    return new Set();
  }
}

function createServer(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const db = openDatabase(config.dbPath);
  const minAppVersion = parseVersion(config.minAppVersion);
  if (config.minAppVersion && !minAppVersion) {
    logger.warn('MIN_APP_VERSION non valida, nessun controllo della versione', { value: config.minAppVersion });
  }

  // Le versioni dell'app precedenti alla minima configurata devono essere aggiornate. Le app 1.7 e
  // precedenti non indicano la versione: con un minimo configurato vengono considerate da aggiornare
  const isSupportedApp = (version) => {
    if (!minAppVersion) return true;
    const parsed = parseVersion(version);
    return !!parsed && compareVersions(parsed, minAppVersion) >= 0;
  };

  // Sessioni attive in memoria:
  // id -> { id, name, status, startedAt, lastActivity, persistedActivity, lastProgressAt, hostId,
  //         hostSeenAt, closedBy, kickedNames: Set, players: Map<id, player> }
  // player -> { id, name, score, finished, lastSeq, tokenHash }
  const sessions = new Map();
  const pendingLoads = new Map();
  // Codici in fase di creazione: due creazioni contemporanee dello stesso codice non si sovrappongono
  const creating = new Set();

  const expiresAt = (session) => session.lastActivity + config.inactivityMs;
  const isExpired = (session) => Date.now() > expiresAt(session);
  const isOpen = (session) => session.status === 'active' && !isExpired(session);

  function publicSession(session) {
    return {
      id: session.id,
      name: session.name,
      status: isOpen(session) ? 'active' : session.status === 'active' ? 'expired' : session.status,
      // Distingue due partite diverse con lo stesso codice (un codice chiuso si può riutilizzare)
      startedAt: session.startedAt,
      expiresAt: expiresAt(session),
      hostId: session.hostId,
      // Chi ha chiuso la partita: 'host', 'auto' (nessun pezzo per un po') o null (tutti hanno finito)
      closedBy: session.closedBy ?? null,
      players: [...session.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        finished: p.finished,
        // Ultimo pezzo numerato applicato: l'app capisce quali pezzi in attesa sono già contati
        seq: p.lastSeq,
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
      startedAt: pub.startedAt,
      expiresAt: pub.expiresAt,
      players: pub.players.map(({ name, score, finished }) => ({ name, score, finished })),
    };
  }

  function logDbError(context) {
    return (err) => logger.error('Errore database', { context, err });
  }

  // Prima il database, poi la memoria: se la scrittura fallisce la sessione resta attiva e coerente
  // (la chiusura viene ritentata dal controllo periodico o dal prossimo evento)
  async function closeSession(session, status, closedBy = null) {
    await db.run('UPDATE sessions SET status = ?, ended_at = ?, closed_by = ?, last_activity = ? WHERE id = ?', [
      status,
      Date.now(),
      closedBy,
      session.lastActivity,
      session.id,
    ]);
    session.status = status;
    session.closedBy = closedBy;
    session.persistedActivity = session.lastActivity;
    sessions.delete(session.id);
  }

  // Restituisce la sessione dalla memoria o la ricarica dal database (es. dopo un riavvio)
  async function loadSession(sessionId) {
    if (sessions.has(sessionId)) return sessions.get(sessionId);
    if (pendingLoads.has(sessionId)) return pendingLoads.get(sessionId);

    const load = (async () => {
      const row = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
      if (!row) return null;
      const rows = await db.all('SELECT * FROM players WHERE session_id = ? ORDER BY joined_at, rowid', [sessionId]);
      const startedAt = row.started_at || parseSqliteTimestamp(row.created_at);
      const session = {
        id: row.id,
        name: row.name,
        status: row.status || 'active',
        startedAt,
        lastActivity: row.last_activity || 0,
        persistedActivity: row.last_activity || 0,
        // Dopo un riavvio l'ultimo pezzo non è noto: si usa l'ultima attività (stima prudente)
        lastProgressAt: row.last_activity || startedAt || Date.now(),
        // Le sessioni create prima della colonna host_id hanno come host il primo giocatore entrato
        hostId: row.host_id || rows[0]?.id || null,
        // L'assenza dell'host si conta da quando il server ha (ri)caricato la partita
        hostSeenAt: Date.now(),
        closedBy: row.closed_by || null,
        kickedNames: parseKickedNames(row.kicked_names),
        players: new Map(
          rows.map((p) => [
            p.id,
            {
              id: p.id,
              name: p.name,
              score: p.score || 0,
              finished: !!p.finished,
              lastSeq: p.last_seq || 0,
              tokenHash: p.token,
            },
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

  // Salva l'ultima attività sul database (solo se è cambiata)
  function persistActivity(session) {
    const value = session.lastActivity;
    if (value === session.persistedActivity) return Promise.resolve();
    session.persistedActivity = value;
    return db.run('UPDATE sessions SET last_activity = ? WHERE id = ?', [value, session.id]).catch((err) => {
      // Al prossimo salvataggio si ritenta
      if (session.persistedActivity === value) session.persistedActivity = 0;
      logDbError('last_activity')(err);
    });
  }

  // Attività nella partita. In memoria è sempre aggiornata; sul database si scrive al più ogni
  // activityPersistMs (il resto lo salvano il controllo periodico e la chiusura), così un pezzo costa una
  // sola scrittura. progress: un pezzo, una fine o un nuovo giocatore (non una semplice riconnessione)
  function touch(session, { progress = false } = {}) {
    const now = Date.now();
    session.lastActivity = now;
    if (progress) session.lastProgressAt = now;
    if (now - session.persistedActivity >= config.activityPersistMs) persistActivity(session);
  }

  function newPlayer(name) {
    const token = crypto.randomBytes(24).toString('base64url');
    return {
      token,
      player: { id: crypto.randomUUID(), name, score: 0, finished: false, lastSeq: 0, tokenHash: hashToken(token) },
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
  const writeLimiter = createRateLimiter(config.writeRateLimit);
  const readLimiter = createRateLimiter(config.readRateLimit);
  const socketJoinLimiter = createRateLimiter(config.socketJoinRateLimit);
  const crashReportLimiter = createRateLimiter(config.crashReportRateLimit);

  // L'app 1.8+ indica la propria versione nell'header X-App-Version
  const requireSupportedApp = (req, res, next) =>
    isSupportedApp(req.get('x-app-version')) ? next() : next(new ApiError(426, UPGRADE_MESSAGE, 'upgrade_required'));

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
        minAppVersion: minAppVersion ? config.minAppVersion : null,
        database,
        activeSessions: sessions.size,
        timestamp: new Date().toISOString(),
      });
    })
  );

  app.post(
    '/api/sessions',
    writeLimiter,
    requireSupportedApp,
    asyncRoute(async (req, res) => {
      const body = req.body || {};
      const sessionName = typeof body.sessionName === 'string' ? body.sessionName.trim() : '';
      const sessionId = normalizeSessionId(sessionName);
      const playerName = normalizePlayerName(body.playerName);
      validateSessionId(sessionId);
      validatePlayerName(playerName);

      if (creating.has(sessionId)) {
        throw new ApiError(409, 'Esiste già una sessione attiva con questo nome. Scegline un altro.', 'session_exists');
      }
      creating.add(sessionId);
      try {
        res.status(201).json(await createSession(sessionId, sessionName, playerName));
      } finally {
        creating.delete(sessionId);
      }
    })
  );

  async function createSession(sessionId, sessionName, playerName) {
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
      await db.run(
        "INSERT INTO sessions (id, name, status, started_at, last_activity, host_id) VALUES (?, ?, 'active', ?, ?, ?)",
        [sessionId, sessionName, now, now, player.id]
      );
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        throw new ApiError(409, 'Esiste già una sessione attiva con questo nome. Scegline un altro.', 'session_exists');
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
      startedAt: now,
      lastActivity: now,
      persistedActivity: now,
      lastProgressAt: now,
      hostId: player.id,
      hostSeenAt: now,
      closedBy: null,
      kickedNames: new Set(),
      players: new Map([[player.id, player]]),
    };
    sessions.set(sessionId, session);

    return {
      sessionId,
      sessionName,
      playerId: player.id,
      playerToken: token,
      startedAt: now,
      expiresAt: expiresAt(session),
    };
  }

  app.post(
    '/api/sessions/join',
    writeLimiter,
    requireSupportedApp,
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
      if (session.kickedNames.has(lower)) {
        throw new ApiError(403, 'Chi ha creato la partita ti ha rimosso: non puoi rientrare', 'kicked');
      }
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

      touch(session, { progress: true });
      io.to(sessionId).emit('session_update', publicSession(session));

      res.json({
        sessionId,
        sessionName: session.name,
        playerId: player.id,
        playerToken: token,
        startedAt: session.startedAt,
        expiresAt: expiresAt(session),
      });
    })
  );

  app.get(
    '/api/sessions/:sessionId/info',
    readLimiter,
    asyncRoute(async (req, res) => {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const session = SESSION_ID_RE.test(sessionId) ? await loadSession(sessionId) : null;
      if (!session) throw new ApiError(404, 'Sessione non trovata', 'not_found');
      res.json(shareInfo(session));
    })
  );

  app.get(
    '/join/:sessionId',
    readLimiter,
    asyncRoute(async (req, res) => {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const session = SESSION_ID_RE.test(sessionId) ? await loadSession(sessionId) : null;
      const nonce = res.locals.cspNonce;
      if (!session) return res.status(404).type('html').send(renderNotFoundPage(nonce));
      return res.type('html').send(
        renderJoinPage(shareInfo(session), nonce, {
          androidPackage: config.androidPackage,
          storeUrl: config.appStoreUrl || `https://play.google.com/store/apps/details?id=${config.androidPackage}`,
          iosStoreUrl: config.iosAppStoreUrl,
        })
      );
    })
  );

  // Segnalazioni di errore dell'app, inviate solo se l'utente le ha attivate nelle Impostazioni. Nessun
  // dato del giocatore: versione, sistema operativo ed errore. Conservate crashRetentionMs e poi cancellate
  app.post(
    '/api/crash-reports',
    crashReportLimiter,
    asyncRoute(async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const text = (value, max) => (typeof value === 'string' && value.trim() ? value.slice(0, max) : null);
      const report = {
        appVersion: text(body.appVersion, 32),
        platform: text(body.platform, 16),
        osVersion: text(body.osVersion, 32),
        name: text(body.name, 120),
        message: text(body.message, 1000),
        stack: text(body.stack, 6000),
        context: text(body.context, 300),
        fatal: body.fatal === true,
      };
      if (!report.name && !report.message) throw new ApiError(400, 'Segnalazione vuota', 'bad_request');
      const { lastID } = await db.run(
        `INSERT INTO crash_reports (received_at, app_version, platform, os_version, name, message, stack, context, fatal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Date.now(),
          report.appVersion,
          report.platform,
          report.osVersion,
          report.name,
          report.message,
          report.stack,
          report.context,
          report.fatal ? 1 : 0,
        ]
      );
      logger.warn('Segnalazione di errore dall’app', {
        id: lastID,
        appVersion: report.appVersion,
        platform: report.platform,
        fatal: report.fatal,
        name: report.name,
      });
      res.status(202).json({ ok: true });
    })
  );

  app.get('/privacy', (req, res) => {
    res.type('html').send(
      renderPrivacyPage({
        contact: config.privacyContact,
        retentionDays: Math.round(config.retentionMs / DAY_MS),
        inactivityMinutes: Math.round(config.inactivityMs / MINUTE_MS),
        crashRetentionDays: Math.round(config.crashRetentionMs / DAY_MS),
        nonce: res.locals.cspNonce,
      })
    );
  });

  // Verifica degli Android App Links (attiva solo se è configurata l'impronta del certificato)
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

  // Verifica degli Universal Links iOS (attiva solo se è configurato il Team ID Apple)
  app.get('/.well-known/apple-app-site-association', (req, res) => {
    const valid = APPLE_TEAM_ID_RE.test(config.appleTeamId) && BUNDLE_ID_RE.test(config.iosBundleId);
    if (!valid) return res.status(404).json({});
    return res.json({
      applinks: {
        details: [
          {
            appIDs: [`${config.appleTeamId}.${config.iosBundleId}`],
            components: [{ '/': '/join/*', comment: 'Inviti alle partite' }],
          },
        ],
      },
    });
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
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Richiesta troppo grande', code: 'too_large' });
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

  // IP del client: dietro nginx (proxy su loopback, come per Express con "trust proxy") si usa
  // l'ultimo indirizzo non locale di X-Forwarded-For
  function socketClientIp(socket) {
    const address = socket.handshake.address || '';
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const trusted = config.trustProxy && config.trustProxy !== 'false';
    if (!trusted || !LOOPBACK_RE.test(address) || typeof forwarded !== 'string') return address;
    const hops = forwarded
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!LOOPBACK_RE.test(hops[i])) return hops[i];
    }
    return address;
  }

  io.on('connection', (socket) => {
    socket.data.pieceHits = [];
    const clientIp = socketClientIp(socket);

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

    // Disconnessione dell'host: da qui parte il conteggio dell'assenza per il passaggio del ruolo
    socket.on('disconnect', () => {
      const { sessionId, playerId } = socket.data;
      const session = sessionId ? sessions.get(sessionId) : null;
      if (session && playerId && session.hostId === playerId) session.hostSeenAt = Date.now();
    });

    socket.on(
      'join_session',
      handler(async ({ sessionId: rawSessionId, playerId, token, appVersion }, ack) => {
        const sessionId = normalizeSessionId(rawSessionId);
        if (!SESSION_ID_RE.test(sessionId) || typeof playerId !== 'string') {
          return ack({ ok: false, code: 'bad_request', error: 'Dati non validi' });
        }
        if (!isSupportedApp(appVersion)) {
          return ack({ ok: false, code: 'upgrade_required', error: UPGRADE_MESSAGE });
        }
        if (!socketJoinLimiter.allow(clientIp)) {
          return ack({ ok: false, code: 'rate_limited', error: 'Troppe richieste, riprova tra poco' });
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
        if (session.hostId === playerId) session.hostSeenAt = Date.now();
        // lastSeq: ultimo pezzo numerato applicato, da cui l'app riprende a numerare quelli in attesa
        return ack({ ok: true, session: publicSession(session), lastSeq: player.lastSeq, features: FEATURES });
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

    // Pezzo aggiunto o annullato. Con "seq" (app 1.8+) ogni pezzo ha un numero crescente per giocatore:
    // un pezzo già applicato (stesso numero, rinviato dopo un timeout o una riconnessione) non viene
    // contato due volte. Senza "seq" (app precedenti) ogni evento vale un pezzo, come prima
    const changeScore = (delta) =>
      handler(async (payload, ack) => {
        const context = currentContext();
        if (context.error) return ack(context.error);
        const { seq } = payload;
        if (seq !== undefined && !(Number.isSafeInteger(seq) && seq > 0)) {
          return ack({ ok: false, code: 'bad_request', error: 'Dati non validi' });
        }
        if (!withinRateLimit()) return ack({ ok: false, code: 'rate_limited', error: 'Stai andando troppo veloce!' });

        return withPlayerLock(context.player, async () => {
          // Lo stato va ricontrollato: nel frattempo la partita può essere finita o il giocatore rimosso
          const { session, player, error } = currentContext();
          if (error) return ack(error);
          if (seq !== undefined && seq <= player.lastSeq) {
            return ack({ ok: true, score: player.score, lastSeq: player.lastSeq, duplicate: true });
          }
          if (player.finished) return ack({ ok: false, code: 'finished', error: 'Hai già finito' });

          const next = Math.min(MAX_SCORE, Math.max(0, player.score + delta));
          const nextSeq = seq ?? player.lastSeq;
          if (next !== player.score || nextSeq !== player.lastSeq) {
            // Prima il database, poi la memoria: se la scrittura fallisce il punteggio non cambia.
            // Punteggio e numero del pezzo vanno insieme, nella stessa scrittura
            await db.run('UPDATE players SET score = ?, last_seq = ? WHERE id = ?', [next, nextSeq, player.id]);
            const changed = next !== player.score;
            player.score = next;
            player.lastSeq = nextSeq;
            if (changed) {
              touch(session, { progress: true });
              broadcast(session);
            }
          }
          return ack({ ok: true, score: player.score, lastSeq: player.lastSeq });
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
            touch(session, { progress: true });
          }
          await endIfAllFinished(session);
          return ack({ ok: true });
        });
      })
    );

    // L'host chiude la partita per tutti (es. qualcuno si è dimenticato di toccare "Ho finito"): chi non ha
    // finito viene segnato come finito con i pezzi che ha
    socket.on(
      'end_session',
      handler(async (payload, ack) => {
        const { session, player, error } = currentContext();
        if (error) return ack(error);
        if (player.id !== session.hostId) {
          return ack({ ok: false, code: 'forbidden', error: 'Solo chi gestisce la partita può terminarla' });
        }
        await endSession(session, 'host');
        logger.info("Partita terminata dall'host", { sessionId: session.id });
        return ack({ ok: true });
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
            error: 'Solo chi gestisce la partita può rimuovere i giocatori',
          });
        }
        if (typeof targetId !== 'string' || targetId === player.id) {
          return ack({ ok: false, code: 'bad_request', error: 'Giocatore non valido' });
        }
        const target = session.players.get(targetId);
        if (!target) return ack({ ok: false, code: 'not_found', error: 'Giocatore non trovato' });

        // Il nome rimosso non può rientrare nella stessa partita
        const kickedNames = new Set(session.kickedNames).add(target.name.toLowerCase());
        await withPlayerLock(target, async () => {
          await db.run('UPDATE sessions SET kicked_names = ? WHERE id = ?', [
            JSON.stringify([...kickedNames]),
            session.id,
          ]);
          await db.run('DELETE FROM players WHERE id = ?', [target.id]);
          session.kickedNames = kickedNames;
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

  // Chiude la partita come terminata (una sola volta, anche con richieste contemporanee) e invia a tutti
  // la classifica finale. closedBy: 'host', 'auto' o null (tutti hanno finito)
  async function finishSession(session, closedBy) {
    if (session.status !== 'active' || session.closing) return false;
    session.closing = true;
    try {
      await closeSession(session, 'ended', closedBy);
    } finally {
      session.closing = false;
    }
    const snapshot = publicSession(session);
    io.to(session.id).emit('session_update', snapshot);
    io.to(session.id).emit('game_ended', snapshot);
    return true;
  }

  // Chiude la partita se tutti i giocatori rimasti hanno finito, altrimenti aggiorna i client
  async function endIfAllFinished(session) {
    const players = [...session.players.values()];
    const allFinished = players.length > 0 && players.every((p) => p.finished);
    if (allFinished && (await finishSession(session, null))) return;
    io.to(session.id).emit('session_update', publicSession(session));
  }

  // Termina la partita per tutti: chi non ha finito viene segnato come finito con i pezzi che ha. Il lock di
  // ogni giocatore fa prima completare i pezzi che si stanno registrando, e blocca quelli successivi
  async function endSession(session, closedBy) {
    for (const player of [...session.players.values()]) {
      await withPlayerLock(player, async () => {
        if (player.finished || session.status !== 'active' || !session.players.has(player.id)) return;
        await db.run('UPDATE players SET finished = 1 WHERE id = ?', [player.id]);
        player.finished = true;
      });
    }
    return finishSession(session, closedBy);
  }

  // Chiusura automatica: nessun pezzo da autoEndIdleMs e almeno metà dei giocatori ha già finito
  function shouldAutoEnd(session, now) {
    if (!config.autoEndIdleMs || now - session.lastProgressAt < config.autoEndIdleMs) return false;
    const players = [...session.players.values()];
    const finished = players.filter((p) => p.finished).length;
    return finished > 0 && finished * 2 >= players.length;
  }

  // Se l'host è assente da hostTransferMs (telefono scarico, app chiusa) il ruolo passa al primo giocatore
  // connesso, in ordine di ingresso: così qualcuno può ancora rimuovere giocatori e terminare la partita
  async function transferHostIfAway(session, now) {
    if (!config.hostTransferMs || session.players.size < 2) return;
    const sockets = await io.in(session.id).fetchSockets();
    const connected = new Set(sockets.map((s) => s.data.playerId).filter(Boolean));
    if (connected.has(session.hostId)) {
      session.hostSeenAt = now;
      return;
    }
    if (now - session.hostSeenAt < config.hostTransferMs) return;
    const next = [...session.players.values()].find((p) => p.id !== session.hostId && connected.has(p.id));
    if (!next || session.status !== 'active') return;
    await db.run('UPDATE sessions SET host_id = ? WHERE id = ?', [next.id, session.id]);
    session.hostId = next.id;
    session.hostSeenAt = now;
    logger.info('Ruolo di host passato a un altro giocatore', { sessionId: session.id });
    io.to(session.id).emit('session_update', publicSession(session));
  }

  // ---------------------------------------------------------------------------
  // Manutenzione periodica: chiusura delle sessioni inattive o ferme, passaggio del ruolo di host,
  // salvataggio dell'ultima attività e pulizia dei dati vecchi
  // ---------------------------------------------------------------------------
  async function sweep() {
    const now = Date.now();
    for (const session of [...sessions.values()]) {
      if (session.closing) continue;
      // Un errore su una sessione non deve impedire la gestione delle altre
      try {
        if (isExpired(session)) {
          await closeSession(session, 'expired');
          io.to(session.id).emit('session_expired', { sessionId: session.id });
          io.in(session.id).socketsLeave(session.id);
          continue;
        }
        if (shouldAutoEnd(session, now)) {
          if (await endSession(session, 'auto'))
            logger.info('Partita chiusa automaticamente', { sessionId: session.id });
          continue;
        }
        await transferHostIfAway(session, now);
        // Prima della chiusura per inattività sul database qui sotto, che legge last_activity
        await persistActivity(session);
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
    // Segnalazioni di errore: cancellate dopo crashRetentionMs e comunque al massimo maxCrashReports
    await db.run('DELETE FROM crash_reports WHERE received_at < ?', [now - config.crashRetentionMs]);
    await db.run('DELETE FROM crash_reports WHERE id NOT IN (SELECT id FROM crash_reports ORDER BY id DESC LIMIT ?)', [
      config.maxCrashReports,
    ]);
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
    // L'ultima attività ancora solo in memoria va salvata prima di chiudere il database
    await Promise.all([...sessions.values()].map((session) => persistActivity(session)));
    await db.close();
  }

  return { app, server, io, start, close, sweep, sessions };
}

module.exports = { createServer, normalizePlayerName, normalizeSessionId };

if (require.main === module) {
  const instance = createServer();
  instance
    .start()
    .then((port) => logger.info('Server in ascolto', { port, version: SERVICE_VERSION, envFile }))
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
