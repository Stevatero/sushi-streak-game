const fs = require('fs');
const path = require('path');

const DEFAULT_ENV_FILE = path.join(__dirname, '.env');

// Carica le variabili da un file .env (formato KEY=valore) se esiste.
// Le variabili già presenti nell'ambiente (PM2, shell) hanno la precedenza: process.loadEnvFile
// non le sovrascrive (verificato con Node 20.17, 22 e 24).
// Il percorso si può cambiare con ENV_FILE. Restituisce il file caricato oppure null.
function loadEnv(file = process.env.ENV_FILE || DEFAULT_ENV_FILE) {
  if (!fs.existsSync(file)) return null;
  process.loadEnvFile(file);
  return file;
}

module.exports = { loadEnv, DEFAULT_ENV_FILE };
