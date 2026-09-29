#!/usr/bin/env node
// Backup consistente del database SQLite (anche con il server in esecuzione) tramite VACUUM INTO.
// Uso: node scripts/backup.js [cartella-destinazione]
// Variabili: DB_PATH (default: ../sushi_game.db), BACKUP_DIR, BACKUP_KEEP (default 14 file),
// lette anche da sushi-game-backend/.env come fa il server.

const { loadEnv } = require('../env');

loadEnv();

const fs = require('fs');
const path = require('path');
const { openDatabase } = require('../db');

async function main() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'sushi_game.db');
  const backupDir = process.argv[2] || process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  const keep = Number(process.env.BACKUP_KEEP) || 14;

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `sushi_game-${stamp}.db`);

  const db = openDatabase(dbPath);
  try {
    await db.run('VACUUM INTO ?', [target]);
  } finally {
    await db.close();
  }
  console.log(`Backup creato: ${target}`);

  // Rotazione: conserva solo gli ultimi N backup
  const backups = fs
    .readdirSync(backupDir)
    .filter((f) => /^sushi_game-.*\.db$/.test(f))
    .sort()
    .reverse();
  for (const old of backups.slice(keep)) {
    fs.unlinkSync(path.join(backupDir, old));
    console.log(`Backup rimosso: ${old}`);
  }
}

main().catch((err) => {
  console.error(`Backup fallito: ${err.message}`);
  process.exit(1);
});
