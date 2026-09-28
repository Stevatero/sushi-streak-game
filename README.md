<p align="center">
  <img src="docs/play-store/play-store-icon-512.png" alt="Sushi Streak" width="120" height="120">
</p>

<h1 align="center">Sushi Streak</h1>

<p align="center">
  Sfida i tuoi amici e scopri chi è il vero campione di sushi.<br>
  Un'app Android per contare in tempo reale i pezzi mangiati durante una cena all-you-can-eat.
</p>

<p align="center">
  <a href="https://github.com/Stevatero/sushi-streak-game/actions/workflows/ci.yml"><img src="https://github.com/Stevatero/sushi-streak-game/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Stevatero/sushi-streak-game/releases"><img src="https://img.shields.io/github/v/release/Stevatero/sushi-streak-game?include_prereleases&label=release" alt="Release"></a>
  <img src="https://img.shields.io/badge/Expo_SDK-54-000020?logo=expo" alt="Expo SDK 54">
  <img src="https://img.shields.io/badge/Android-API_24%E2%80%9336-3DDC84?logo=android&logoColor=white" alt="Android API 24-36">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

---

## Indice

- [Funzionalità](#funzionalità)
- [Come si gioca](#come-si-gioca)
- [Stack tecnologico](#stack-tecnologico)
- [Architettura](#architettura)
- [Struttura del progetto](#struttura-del-progetto)
- [Requisiti](#requisiti)
- [Sviluppo locale](#sviluppo-locale)
- [Configurazione](#configurazione)
- [Qualità: test, lint e formattazione](#qualità-test-lint-e-formattazione)
- [Build e release Android](#build-e-release-android)
- [CI/CD](#cicd)
- [Sicurezza e privacy](#sicurezza-e-privacy)
- [Roadmap](#roadmap)
- [Licenza e crediti](#licenza-e-crediti)

## Funzionalità

**Partite multigiocatore in tempo reale**

- Crea una sessione con un codice (generato o personalizzato) e invita gli amici con codice o link (`https://sushi.dietalab.net/join/CODICE`).
- Classifica condivisa aggiornata in tempo reale via WebSocket, con la tua posizione evidenziata.
- Chi crea la partita può rimuovere un giocatore (es. chi è entrato indovinando il codice).
- "Aggiungi pezzo" con animazione, suono e pila di sushi con fisica simulata sul thread UI (fluida anche con decine di pezzi); "Annulla ultimo" per correggere un tocco accidentale.
- "Ho finito!" (con conferma): la partita termina quando tutti hanno finito, con podio, classifica finale (pareggi inclusi) e una pioggia di petali di ciliegio per chi vince.

**Affidabilità**

- Riconnessione automatica dopo cadute di rete o il ritorno dall'app in background, con indicatore dello stato di connessione.
- Partita riprendibile dalla Home anche dopo la chiusura forzata dell'app o un riavvio del server.
- Le sessioni restano attive fino a 3 ore senza attività (configurabile).

**Storico e preferenze**

- Salvataggio automatico delle partite sul dispositivo, con durata e nome del ristorante facoltativo.
- Tema sistema/chiaro/scuro e suoni attivabili, con preferenze salvate.
- Cancellazione dei dati locali e informativa privacy dalle Impostazioni.

L'app non richiede registrazione e non contiene pubblicità, analytics o tracciamento.

## Come si gioca

1. Un giocatore crea la sessione e condivide il codice o il link.
2. Gli altri si uniscono inserendo il codice e il proprio nome.
3. Ognuno tocca **Aggiungi pezzo** per ogni pezzo mangiato: la classifica si aggiorna per tutti.
4. Quando hai finito tocca **Ho finito!**; quando tutti hanno finito viene proclamato il vincitore.

## Stack tecnologico

| Componente       | Tecnologie                                                                             |
| ---------------- | -------------------------------------------------------------------------------------- |
| App              | Expo SDK 54, React Native 0.81 (New Architecture, Hermes), React 19, TypeScript strict |
| UI e navigazione | React Native Paper (Material 3), React Navigation 7 (native stack), Reanimated 4       |
| Stato e dati     | Zustand, AsyncStorage, Socket.IO client                                                |
| Gioco            | Motore fisico worklet su Reanimated (pila di sushi), expo-audio                        |
| Backend          | Node.js ≥ 20, Express 4, Socket.IO 4, SQLite (`sqlite3`), Helmet                       |
| Qualità          | Jest + Testing Library, node:test, ESLint, Prettier, TypeScript                        |
| Delivery         | EAS Build/Submit, GitHub Actions, Dependabot, PM2 + nginx                              |

## Architettura

```
┌──────────────────────────── App (Expo / React Native) ────────────────────────────┐
│ Screens (Home, Partita, Storico, Impostazioni)                                    │
│   │                                                                              │
│   ├── gameStore (Zustand) ◀── socketService ── riconnessione, rejoin, ack/timeout │
│   ├── api (REST, timeout, errori tipizzati)                                       │
│   └── sessionStorage / preferences (AsyncStorage, dati validati)                  │
└───────────────┬───────────────────────────────────────────────┬───────────────────┘
                │ HTTPS  POST /api/sessions, /join, GET /info   │ WSS  join_session, add_piece,
                ▼                                               ▼      remove_piece, player_finished
┌──────────────────────────── Backend (Node.js) ────────────────────────────────────┐
│ Express (validazione, rate limit, Helmet/CSP) · Socket.IO (auth con token)        │
│ Stato partite in memoria + persistenza SQLite · chiusura e pulizia automatiche     │
│ Pagine web: /join/:codice (invito), /privacy · /api/health                         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- Il server è la fonte di verità della partita; il client applica gli snapshot ricevuti.
- Ogni giocatore riceve `playerId` + `playerToken` alla creazione/ingresso: il socket si autentica con questi e le azioni valgono solo per il giocatore autenticato.
- Le sessioni attive sono in memoria per la latenza e su SQLite per la persistenza; dopo un riavvio vengono ricaricate dal database.

## Struttura del progetto

```
sushi-streak-game/
├── sushi-game-app/            App Expo (Android)
│   ├── App.tsx                Provider, error boundary, splash
│   ├── app.config.ts          Configurazione Expo per ambiente (APP_VARIANT)
│   ├── eas.json               Profili di build EAS
│   ├── assets/                Icone, splash, suoni, immagini del sushi
│   └── src/
│       ├── components/        SushiStack (+ motore fisico), SakuraCelebration, ui/ (design system)
│       ├── navigation/        Stack e tipi delle rotte
│       ├── screens/           Home, GameSession, SessionHistory, Settings
│       ├── services/          api, socketService, sessionStorage, preferences, shareService
│       ├── store/             gameStore (Zustand)
│       ├── theme/             Temi chiaro/scuro e provider
│       └── utils/             logger, sessionCode, SoundManager
├── sushi-game-backend/        Server Node.js
│   ├── server.js              API REST, Socket.IO, manutenzione sessioni
│   ├── db.js                  Schema e migrazioni SQLite
│   ├── joinPage.js            Pagina web di invito
│   ├── privacyPage.js         Informativa privacy (/privacy)
│   ├── logger.js              Log strutturati JSON
│   ├── scripts/backup.js      Backup consistente del database
│   └── test/                  Test di integrazione (node:test)
├── docs/                      Release, deploy, privacy / Data Safety, asset Play Store
├── .github/                   CI, release, Dependabot, template
└── start.ps1                  Avvio locale di backend e app (Windows)
```

## Requisiti

- Node.js **22 LTS** (minimo 20.19 per l'app, 20.17 per il backend) e npm
- Per provare l'app: un dispositivo Android con la build di sviluppo installata, oppure un emulatore Android
- Per le build: account [Expo](https://expo.dev) con accesso al progetto EAS; per build locali, Android Studio (JDK 17+ e Android SDK 36)

## Sviluppo locale

```bash
git clone https://github.com/Stevatero/sushi-streak-game.git
cd sushi-streak-game

# Backend
cd sushi-game-backend
npm ci
npm run dev            # http://localhost:3000

# App (in un altro terminale)
cd ../sushi-game-app
npm ci
cp .env.example .env   # imposta EXPO_PUBLIC_API_URL=http://<IP-del-PC>:3000
npm start
```

Su Windows `.\start.ps1` avvia backend e app insieme e configura automaticamente l'IP locale (`.\start.ps1 -Production` per usare il backend di produzione).

L'app usa il dev client di Expo: installa sul dispositivo una build `development` (`npm run build:dev`) e aprila scansionando il QR code mostrato da `npm start`.

## Configurazione

### App (`sushi-game-app/.env`, vedi `.env.example`)

| Variabile                | Default                      | Descrizione                                                                         |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`    | `https://sushi.dietalab.net` | Backend usato dall'app                                                              |
| `EXPO_PUBLIC_PUBLIC_URL` | `https://sushi.dietalab.net` | Dominio dei link di invito e dell'informativa                                       |
| `APP_VARIANT`            | `production`                 | `development` / `preview` / `production`: nome, application ID e deep link dell'app |

### Backend (`sushi-game-backend/.env.example`)

| Variabile                | Default                               | Descrizione                                                      |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| `PORT`                   | `3000`                                | Porta HTTP                                                       |
| `HOST`                   | `0.0.0.0`                             | Interfaccia di ascolto (`127.0.0.1` in produzione, dietro nginx) |
| `DB_PATH`                | `sushi_game.db` accanto a `server.js` | Database SQLite                                                  |
| `SESSION_INACTIVITY_MIN` | `180`                                 | Minuti di inattività prima della chiusura di una sessione        |
| `SESSION_RETENTION_DAYS` | `30`                                  | Giorni di conservazione delle sessioni chiuse                    |
| `CORS_ORIGINS`           | localhost + dominio pubblico          | Origini web ammesse                                              |
| `TRUST_PROXY`            | `loopback`                            | Proxy fidati (nginx sulla stessa macchina)                       |
| `LOG_LEVEL`              | `info`                                | `debug` / `info` / `warn` / `error` / `silent`                   |
| `PRIVACY_CONTACT`        | issue GitHub                          | Contatto mostrato in `/privacy`                                  |
| `ANDROID_CERT_SHA256`    | —                                     | Impronte del certificato Play per gli App Links                  |
| `APP_STORE_URL`          | scheda Google Play del pacchetto      | Download dell'app dalla pagina di invito se non è installata     |

Nessun secret è necessario per sviluppare: le credenziali di firma e pubblicazione sono gestite da EAS e GitHub Secrets.

## Qualità: test, lint e formattazione

```bash
# App
cd sushi-game-app
npm run check          # lint + typecheck + formattazione + test
npm run test:ci        # test con coverage

# Backend
cd sushi-game-backend
npm run lint && npm run format:check && npm test
```

I test coprono le parti a maggior rischio di regressione:

- **App**: validazione dei codici e deep link, client API, riconnessione e rejoin del socket, store di gioco, storage con dati corrotti o legacy, error boundary, flussi Home (creazione/ingresso) e Partita (pezzi online/offline, conferma di fine, salvataggio automatico).
- **Backend**: autenticazione con token, robustezza agli eventi malformati, fine partita, ricarica dopo riavvio, XSS e CSP delle pagine web, health check, backup.

## Build e release Android

| Comando (`sushi-game-app`)  | Risultato                                                    |
| --------------------------- | ------------------------------------------------------------ |
| `npm run build:dev`         | Dev client (`com.stevatero.sushistreakapp.dev`)              |
| `npm run build:preview`     | APK interno di test (`com.stevatero.sushistreakapp.preview`) |
| `npm run build:production`  | **AAB** firmato per il Play Store                            |
| `npm run submit:production` | Invio dell'ultimo AAB alla traccia interna di Google Play    |

Configurazione Android: `targetSdk`/`compileSdk` 36, `minSdk` 24, R8 e riduzione delle risorse, backup disabilitato, permessi minimi, App Links verificati su `sushi.dietalab.net/join`.

Il versioning segue SemVer: `versionName` = versione in `sushi-game-app/package.json`, `versionCode` incrementato da EAS. Ogni rilascio ha un tag `vX.Y.Z` e una GitHub Release; la release marcata _Latest_ corrisponde alla versione in produzione sul Play Store.

Procedura completa e checklist Play Store: **[docs/RELEASING.md](docs/RELEASING.md)**. Deploy del backend, monitoraggio e backup: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## CI/CD

| Workflow                                         | Quando                       | Cosa fa                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CI](.github/workflows/ci.yml)                   | Push su `main`, pull request | Backend (Node 20 e 22): lint, formattazione, test, audit. App: lint, typecheck, formattazione, test con coverage, expo-doctor, build del bundle Android, audit. Scansione secrets con gitleaks. |
| [Release](.github/workflows/release.yml)         | Tag `vX.Y.Z`                 | Verifica versione e CHANGELOG, crea la GitHub Release e, con `EXPO_TOKEN` configurato, avvia la build AAB su EAS (submit opzionale).                                                            |
| [APK Android](.github/workflows/android-apk.yml) | Manuale (Run workflow)       | Compila un APK di test (`preview` o `production`, anche solo arm64) senza EAS e lo pubblica come asset di una pre-release `apk-<variante>-<commit>`.                                            |
| [Dependabot](.github/dependabot.yml)             | Settimanale                  | Aggiornamenti raggruppati di dipendenze e GitHub Actions (Expo/React Native esclusi: si aggiornano con l'SDK).                                                                                  |

## Sicurezza e privacy

- Comunicazione solo HTTPS/WSS; token dei giocatori conservati come hash sul server; validazione degli input e rate limiting; Helmet e CSP con nonce.
- Nessun account, nessun analytics o SDK pubblicitario; i dati delle partite vengono cancellati automaticamente dopo 30 giorni dalla chiusura.
- Informativa: [sushi.dietalab.net/privacy](https://sushi.dietalab.net/privacy) · Inventario dei dati e questionario Data Safety: [docs/DATA_SAFETY.md](docs/DATA_SAFETY.md).
- Segnalazione di vulnerabilità: [SECURITY.md](SECURITY.md).

## Roadmap

- [ ] Aggiornamento a Expo SDK 57 (risolve gli advisory residui delle dipendenze di build)
- [ ] Prima pubblicazione su Google Play (traccia interna → chiusa → produzione)
- [ ] Crash reporting opt-in (es. Sentry) tramite l'hook già presente in `src/utils/logger.ts`
- [ ] Localizzazione in inglese
- [ ] Supporto iOS (configurazione già presente, non ancora testata né pubblicata)

## Licenza e crediti

Distribuito con licenza [MIT](LICENSE). Sviluppato da **Dario Stevanato** ([@Stevatero](https://github.com/Stevatero)).

Font [Outfit](https://fonts.google.com/specimen/Outfit) (SIL Open Font License) tramite `@expo-google-fonts`.

Contributi benvenuti: vedi [CONTRIBUTING.md](CONTRIBUTING.md) e il [CHANGELOG](CHANGELOG.md).
