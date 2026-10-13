#!/usr/bin/env node
// Mostra le ultime segnalazioni di errore inviate dall'app (solo dagli utenti che le hanno attivate).
// Uso: node scripts/crash-reports.js [numero] (default 20). Usa DB_PATH, letto anche da .env come il server.
// Le segnalazioni vengono cancellate automaticamente dopo CRASH_RETENTION_DAYS giorni (default 30).

const { loadEnv } = require('../env');

loadEnv();

const fs = require('fs');
const path = require('path');
const { openDatabase } = require('../db');

async function main() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'sushi_game.db');
  const limit = Math.min(500, Math.max(1, Number(process.argv[2]) || 20));
  if (!fs.existsSync(dbPath)) throw new Error(`Database non trovato: ${dbPath}`);

  const db = openDatabase(dbPath);
  try {
    const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'crash_reports'");
    const rows = table ? await db.all('SELECT * FROM crash_reports ORDER BY id DESC LIMIT ?', [limit]) : [];
    if (!rows.length) {
      console.log('Nessuna segnalazione di errore.');
      return;
    }
    for (const row of rows) {
      const when = new Date(row.received_at).toISOString();
      const device = [row.platform, row.os_version].filter(Boolean).join(' ');
      console.log(
        `#${row.id} · ${when} · app ${row.app_version ?? '?'} · ${device || '?'}${row.fatal ? ' · FATALE' : ''}`
      );
      console.log(`  ${row.name ?? 'Errore'}: ${row.message ?? ''}`);
      if (row.context) console.log(`  Contesto: ${row.context}`);
      if (row.stack) {
        console.log(
          row.stack
            .split('\n')
            .slice(0, 12)
            .map((line) => `    ${line}`)
            .join('\n')
        );
      }
      console.log('');
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(`Lettura delle segnalazioni non riuscita: ${err.message}`);
  process.exit(1);
});
