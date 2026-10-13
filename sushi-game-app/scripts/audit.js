#!/usr/bin/env node
/**
 * Controllo delle vulnerabilità delle dipendenze di runtime (npm audit --omit=dev), usato dalla CI.
 *
 * Fallisce con gli avvisi di gravità high o critical, tranne quelli elencati in audit-allowlist.json:
 * avvisi per cui non esiste ancora una versione corretta e che riguardano solo gli strumenti di build
 * (Metro, Jest, Expo CLI), non il codice incluso nell'app. Ogni eccezione ha una data di revisione
 * (reviewBy): dopo quella data il controllo fallisce di nuovo e l'eccezione va riverificata.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const BLOCKING = new Set(['high', 'critical']);

// Avvisi distinti (per ID GHSA) presenti nel report di npm audit --json
function findAdvisories(report) {
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || !via.url) continue;
      const id = via.url.split('/').pop();
      if (!found.has(id)) {
        found.set(id, { id, name: via.name, severity: via.severity, title: via.title, url: via.url });
      }
    }
  }
  return [...found.values()];
}

function checkAudit(report, allowlist, today = new Date()) {
  const allowed = new Map(allowlist.map((entry) => [entry.id, entry]));
  const problems = [];
  const ignored = [];
  for (const advisory of findAdvisories(report)) {
    if (!BLOCKING.has(advisory.severity)) continue;
    const entry = allowed.get(advisory.id);
    if (!entry) {
      problems.push(`${advisory.severity} · ${advisory.name}: ${advisory.title} (${advisory.url})`);
    } else if (!(new Date(`${entry.reviewBy}T23:59:59Z`) >= today)) {
      problems.push(`eccezione scaduta il ${entry.reviewBy}, da riverificare: ${advisory.id} (${advisory.name})`);
    } else {
      ignored.push(`${advisory.id} · ${advisory.name}: ${entry.reason} (revisione entro il ${entry.reviewBy})`);
    }
  }
  return { problems, ignored };
}

module.exports = { checkAudit, findAdvisories };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const allowlist = require(path.join(root, 'audit-allowlist.json'));
  // npm audit termina con errore quando trova vulnerabilità: conta solo il report JSON.
  // Su Windows npm è uno script .cmd e va avviato tramite la shell
  const options = { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const result =
    process.platform === 'win32'
      ? spawnSync('npm audit --omit=dev --json', { ...options, shell: true })
      : spawnSync('npm', ['audit', '--omit=dev', '--json'], options);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error('Report di npm audit non leggibile:');
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  if (report.error) {
    console.error(`npm audit non riuscito: ${report.error.summary ?? JSON.stringify(report.error)}`);
    process.exit(1);
  }

  const { problems, ignored } = checkAudit(report, allowlist);
  if (ignored.length) {
    console.log('Avvisi ammessi (solo strumenti di build, nessuna versione corretta disponibile):');
    ignored.forEach((line) => console.log(`  - ${line}`));
  }
  if (problems.length) {
    console.error('Vulnerabilità high/critical nelle dipendenze di runtime:');
    problems.forEach((line) => console.error(`  - ${line}`));
    process.exit(1);
  }
  console.log('Nessuna vulnerabilità high/critical da correggere.');
}
