# Security Policy

## Versioni supportate

Riceve correzioni di sicurezza solo l'ultima versione pubblicata dell'app e il backend in esecuzione su `sushi.dietalab.net`.

| Versione | Supportata |
| -------- | ---------- |
| 1.8.x    | ✅         |
| < 1.8    | ❌         |

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
- Validazione di tutti gli input REST e Socket.IO, limitazione delle richieste per IP (creazione, ingresso, informazioni della partita, pagina di invito, ingresso via socket, segnalazioni di errore), header di sicurezza (Helmet) e Content Security Policy con nonce sulle pagine web.
- Pezzi numerati per giocatore (`seq`): un evento ripetuto, per errore o di proposito, non cambia il punteggio due volte.
- Versione minima dell'app configurabile sul server (`MIN_APP_VERSION`): le app troppo vecchie, ad esempio dopo una correzione di sicurezza, vengono invitate ad aggiornare.
- Segnalazioni di errore solo con il consenso dell'utente, verso il nostro server: nessun dato del giocatore, dimensione e numero limitati, cancellazione automatica dopo 30 giorni.
- Sul dispositivo il token della partita in corso è nell'archivio sicuro del sistema (`expo-secure-store`: Android Keystore, Portachiavi iOS); backup Android disabilitato (`allowBackup: false`) e dati locali esclusi dal backup iCloud (`RCTAsyncStorageExcludeFromBackup`).
- Chi gestisce la partita può rimuovere un giocatore, che non può rientrare nella stessa partita con lo stesso nome. L'app segnala i codici scelti a mano troppo corti, più facili da indovinare.
- Nessun secret nel repository: le credenziali (EAS, Google Play) sono gestite tramite GitHub Secrets ed EAS; nei workflow `eas-cli` ha una versione fissa e le action sono fissate per SHA.
- CI con audit delle dipendenze, scansione dei secrets (gitleaks), Dependabot e test end-to-end su emulatore (workflow "E2E Android").

## Rischi noti accettati

- Avvisi senza versione corretta che riguardano solo gli strumenti di build dell'app, non il codice incluso nell'app: `braces` (GHSA-vfj7-8cjw-p6xm, usato da Jest e Metro per i pattern dei file del progetto) e `node-forge` (GHSA-86w9-cpqp-85rv, usato da Expo CLI per certificati di sviluppo e firma degli aggiornamenti, che il progetto non usa). Sono elencati con motivo e data di revisione in [`sushi-game-app/audit-allowlist.json`](sushi-game-app/audit-allowlist.json): la CI (`npm run audit:check`) blocca ogni altro avviso high/critical e torna a bloccare questi dopo la data di revisione.
- `uuid` 7, usato da `xcode` in `@expo/config-plugins` durante `expo prebuild`, è forzato alla 11.1.1 con `overrides` in `sushi-game-app/package.json` (advisory GHSA-w5hq-g745-h8pq); `xcode` usa solo `uuid.v4()`, invariato. Rimuovere l'override quando l'SDK includerà una versione corretta.
