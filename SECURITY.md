# Security Policy

## Versioni supportate

Riceve correzioni di sicurezza solo l'ultima versione pubblicata dell'app e il backend in esecuzione su `sushi.dietalab.net`.

| Versione | Supportata |
| -------- | ---------- |
| 1.6.x    | ✅         |
| < 1.6    | ❌         |

## Segnalare una vulnerabilità

**Non aprire issue pubbliche per problemi di sicurezza.**

Usa la segnalazione privata di GitHub: [Security → Report a vulnerability](https://github.com/Stevatero/sushi-streak-game/security/advisories/new).

Indica, se possibile:

- componente coinvolto (app Android/iOS, backend, pagina web di invito);
- passi per riprodurre il problema e impatto stimato;
- versione dell'app (Impostazioni → Crediti).

Riceverai una prima risposta entro 7 giorni. Le vulnerabilità confermate vengono corrette con priorità e citate nel `CHANGELOG.md` una volta rilasciata la correzione.

## Misure in essere

- Comunicazione app ↔ server solo via HTTPS/WSS; traffico in chiaro disabilitato nelle build di rilascio.
- Ogni giocatore riceve un token casuale; sul server se ne conserva solo l'hash SHA-256 e il confronto è a tempo costante.
- Validazione di tutti gli input REST e Socket.IO, limitazione delle richieste, header di sicurezza (Helmet) e Content Security Policy con nonce sulle pagine web.
- Backup Android disabilitato (`allowBackup: false`) e dati locali esclusi dal backup iCloud (`RCTAsyncStorageExcludeFromBackup`) per non esportare i token locali.
- Nessun secret nel repository: le credenziali (EAS, Google Play) sono gestite tramite GitHub Secrets ed EAS.
- CI con audit delle dipendenze, scansione dei secrets (gitleaks) e Dependabot.

## Rischi noti accettati

- Nessuno al momento: con Expo SDK 57 `npm audit` non riporta vulnerabilità (la CI blocca dal livello "high"). `uuid` 7, usato da `xcode` in `@expo/config-plugins` durante `expo prebuild`, è forzato alla 11.1.1 con `overrides` in `sushi-game-app/package.json` (advisory GHSA-w5hq-g745-h8pq); `xcode` usa solo `uuid.v4()`, invariato. Rimuovere l'override quando l'SDK includerà una versione corretta.
