#!/usr/bin/env node
/**
 * versionCode Android ricavato dalla versione SemVer di package.json: MAJOR*10000 + MINOR*100 + PATCH
 * (es. 1.3.0 → 10300). Cresce a ogni nuova versione, quindi un APK più recente si installa come
 * aggiornamento del precedente. Usato dalle build fuori da EAS (workflow "APK Android").
 */
const { version } = require('../package.json');

function versionCode(semver) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(semver);
  if (!match) throw new Error(`Versione non valida: ${semver}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`MINOR e PATCH devono essere ≤ 99: ${semver}`);
  return major * 10000 + minor * 100 + patch;
}

module.exports = { versionCode };

if (require.main === module) {
  console.log(versionCode(version));
}
