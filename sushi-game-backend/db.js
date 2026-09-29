const sqlite3 = require('sqlite3');

// Wrapper minimale su sqlite3 con API basata su Promise
function openDatabase(dbPath) {
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  const close = () =>
    new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });

  return { raw: db, run, get, all, close };
}

async function columnExists(db, table, column) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

async function addColumnIfMissing(db, table, column, definition) {
  if (!(await columnExists(db, table, column))) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Crea lo schema e applica le migrazioni sui database esistenti
async function migrate(db) {
  await db.run('PRAGMA journal_mode = WAL');
  await db.run('PRAGMA foreign_keys = ON');

  await db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    finished BOOLEAN DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  )`);

  // Colonne aggiunte nella v1.2: stato sessione, ultima attività, token giocatore
  await addColumnIfMissing(db, 'sessions', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await addColumnIfMissing(db, 'sessions', 'last_activity', 'INTEGER');
  await addColumnIfMissing(db, 'sessions', 'ended_at', 'INTEGER');
  await addColumnIfMissing(db, 'players', 'token', 'TEXT');
  await addColumnIfMissing(db, 'players', 'joined_at', 'INTEGER');
  // v1.3: creatore della partita, che può rimuovere i giocatori
  await addColumnIfMissing(db, 'sessions', 'host_id', 'TEXT');
  // v1.7: inizio della partita (distingue partite diverse con lo stesso codice) e nomi rimossi dall'host
  await addColumnIfMissing(db, 'sessions', 'started_at', 'INTEGER');
  await addColumnIfMissing(db, 'sessions', 'kicked_names', 'TEXT');

  await db.run('CREATE INDEX IF NOT EXISTS idx_players_session ON players (session_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status, last_activity)');

  // Le sessioni create prima della migrazione non hanno last_activity: le consideriamo scadute
  await db.run(
    "UPDATE sessions SET status = 'expired', ended_at = ? WHERE status = 'active' AND last_activity IS NULL",
    [Date.now()]
  );
}

module.exports = { openDatabase, migrate };
