# Security Policy

## Versioni supportate

Riceve correzioni di sicurezza solo l'ultima versione pubblicata dell'app e il backend in esecuzione su `sushi.dietalab.net`.

| Versione | Supportata |
| -------- | ---------- |
| 1.5.x    | ✅         |
| < 1.5    | ❌         |

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

- Alcune dipendenze di **build** dell'app (Metro, PostCSS in `@expo/metro-config`) presentano advisory di gravità alta che si risolvono solo aggiornando l'SDK Expo. Questi pacchetti non sono inclusi nell'app installata e processano solo file del progetto. L'aggiornamento dell'SDK è pianificato (vedi README → Roadmap).
