# Release e pubblicazione sul Google Play Store

## Versioning

| Concetto                                | Dove                                                     | Regola                                                     |
| --------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Versione app (`versionName`)            | `sushi-game-app/package.json` → letta da `app.config.ts` | [SemVer](https://semver.org/lang/it/): `MAJOR.MINOR.PATCH` |
| Codice versione Android (`versionCode`) | Gestito da EAS (`appVersionSource: remote`)              | Incrementato automaticamente a ogni build `production`     |
| Versione backend                        | `sushi-game-backend/package.json`                        | SemVer; mostrata da `/api/health`                          |
| Tag Git                                 | `vX.Y.Z`                                                 | Uno per ogni versione dell'app rilasciata                  |

- **PATCH**: correzioni senza cambi di comportamento.
- **MINOR**: nuove funzionalità compatibili.
- **MAJOR**: modifiche incompatibili (es. cambi di protocollo che richiedono di aggiornare insieme app e backend).

### Quale versione è sul Play Store?

- Ogni tag `vX.Y.Z` produce una **GitHub Release** marcata _pre-release_.
- Quando la versione viene promossa in **produzione** sul Play Store, modifica la release su GitHub: togli "pre-release", seleziona "Set as latest" e aggiungi `versionCode` e data di pubblicazione nelle note.
- La release marcata _Latest_ su GitHub corrisponde quindi sempre alla versione in produzione sul Play Store.

## Procedura di rilascio

1. Verifica che `main` sia verde in CI.
2. Aggiorna la versione dell'app (senza creare il tag):
   ```bash
   cd sushi-game-app
   npm version minor --no-git-tag-version   # oppure patch / major
   ```
   Se cambia anche il backend, aggiorna `sushi-game-backend/package.json` allo stesso modo.
3. In `CHANGELOG.md` sposta le voci di `Unreleased` in una nuova sezione `## [X.Y.Z] - AAAA-MM-GG` e aggiorna i link in fondo.
4. Committa e crea il tag:
   ```bash
   git commit -am "chore(release): vX.Y.Z"
   git tag -a vX.Y.Z -m "Sushi Streak vX.Y.Z"
   git push origin main --follow-tags
   ```
5. Il workflow **Release** verifica che tag, `package.json` e CHANGELOG coincidano, crea la GitHub Release e, se `EXPO_TOKEN` è configurato, avvia la build AAB su EAS.
6. Scarica l'AAB da EAS oppure usa `eas submit` (vedi sotto) e pubblicalo sulla traccia **interna** → **chiusa** → **produzione** della Play Console.

> Se il rilascio include modifiche al backend, distribuisci **prima** il backend (vedi [DEPLOYMENT.md](DEPLOYMENT.md)) e poi l'app.

## Ambienti

| Profilo EAS      | `APP_VARIANT` | Application ID                         | Uso                                         |
| ---------------- | ------------- | -------------------------------------- | ------------------------------------------- |
| `development`    | development   | `com.stevatero.sushistreakapp.dev`     | Dev client per lo sviluppo                  |
| `preview`        | preview       | `com.stevatero.sushistreakapp.preview` | APK interno per test                        |
| `production`     | production    | `com.stevatero.sushistreakapp`         | AAB per il Play Store                       |
| `production-apk` | production    | `com.stevatero.sushistreakapp`         | APK di produzione per installazione diretta |

Il backend è unico (`https://sushi.dietalab.net`). Per usarne un altro in una build, imposta `EXPO_PUBLIC_API_URL` nella sezione `env` del profilo in `eas.json` o come variabile d'ambiente EAS.

### Strumenti di sviluppo esclusi dalle build di rilascio

`expo-dev-client` (con dev launcher e dev menu) porta con sé dipendenze native come Google ML Kit e il tooling di Jetpack Compose. Per le varianti `preview` e `production` lo script [`scripts/configure-build-variant.js`](../sushi-game-app/scripts/configure-build-variant.js) li esclude dall'autolinking. EAS lo esegue automaticamente tramite l'hook `eas-build-pre-install`.

### APK di test da GitHub Actions (senza EAS)

Il workflow **APK Android** (Actions → _APK Android_ → _Run workflow_) compila un APK sui runner GitHub, che includono Android SDK e NDK, e lo allega a una pre-release `apk-<variante>-<commit>`. È firmato con la chiave di debug del template Expo: va bene per provare l'app, ma non aggiorna versioni installate da EAS o dal Play Store (la variante `preview` si installa accanto a quella pubblicata).

### Build locale di rilascio (senza EAS)

Serve Android Studio (JDK 17+ e Android SDK 36). Su Windows conviene un percorso breve (es. `C:\src\sushi-streak-game`) per non superare il limite di 260 caratteri nella compilazione nativa.

```bash
cd sushi-game-app
APP_VARIANT=production node scripts/configure-build-variant.js   # modifica package.json: non committare
npm ci
APP_VARIANT=production npx expo prebuild --platform android --clean
cd android && ./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab
```

Senza configurazione di firma, la build locale è firmata con la chiave di debug: va bene per le verifiche, non per il Play Store. Per pubblicare usa EAS, oppure configura la firma in `android/app/build.gradle` leggendo keystore e password da variabili d'ambiente (mai committati).

## Firma dell'app

- La chiave di upload Android è **gestita da EAS** (`eas credentials`): non è nel repository e non va mai committata.
- Alla prima pubblicazione attiva **Play App Signing**: Google conserva la chiave di firma dell'app, EAS firma con la chiave di upload.
- Esegui un backup della chiave di upload da `eas credentials -p android` → _Download credentials_ e conservalo in un password manager.

## Secrets richiesti

| Secret                             | Dove                                                                        | A cosa serve                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                       | GitHub → Settings → Secrets and variables → Actions (ambiente `production`) | Build e submit EAS dalla CI ([crea token](https://expo.dev/settings/access-tokens)) |
| Service account Google Play (JSON) | Caricato in EAS: `eas credentials -p android` → _Google Service Account_    | `eas submit` verso la Play Console                                                  |
| `ANDROID_CERT_SHA256`              | Variabile d'ambiente del backend                                            | Verifica degli App Links (`/.well-known/assetlinks.json`)                           |

## Checklist Google Play (prima pubblicazione)

### Configurazione app (già nel repository)

- [x] `applicationId` / namespace: `com.stevatero.sushistreakapp`
- [x] `targetSdk` 36 e `compileSdk` 36 (requisito Google Play dal 31/08/2026), `minSdk` 24
- [x] Android App Bundle (`buildType: app-bundle`) con R8 e riduzione delle risorse
- [x] Icona adattiva con contenuto nella safe zone, splash screen, nome dell'app
- [x] Orientamento portrait, edge-to-edge
- [x] Permessi minimi (`INTERNET`, `ACCESS_NETWORK_STATE`); microfono, overlay e storage bloccati
- [x] `allowBackup=false`, nessun traffico in chiaro nelle build di rilascio
- [x] App Links `https://sushi.dietalab.net/join/*` (solo build di produzione)
- [x] Informativa privacy pubblica: `https://sushi.dietalab.net/privacy`

### Da completare manualmente

- [ ] Account sviluppatore Google Play e creazione dell'app nella Play Console.
- [ ] Impostare `PRIVACY_CONTACT` sul backend (email di contatto mostrata nell'informativa).
- [ ] Impostare `ANDROID_CERT_SHA256` sul backend con l'impronta SHA-256 della **chiave di firma dell'app** (Play Console → Test e rilascio → Integrità dell'app) per verificare gli App Links.
- [ ] Scheda dello store: descrizione breve e completa, screenshot telefono (almeno 2), **grafica in primo piano 1024×500**, icona 512×512 (già pronta in [`play-store/play-store-icon-512.png`](play-store/play-store-icon-512.png)).
- [ ] Questionario **Sicurezza dei dati**: vedi [DATA_SAFETY.md](DATA_SAFETY.md).
- [ ] Classificazione dei contenuti (IARC), pubblico di destinazione, dichiarazione annunci (nessun annuncio).
- [ ] Per i nuovi account personali: test chiuso con almeno 12 tester per 14 giorni prima dell'accesso alla produzione.
- [ ] Configurare `EXPO_TOKEN` e il service account per automatizzare build e submit.
