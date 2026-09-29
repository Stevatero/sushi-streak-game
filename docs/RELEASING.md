# Release e pubblicazione (Google Play e App Store)

## Versioning

| Concetto                                | Dove                                                     | Regola                                                     |
| --------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Versione app (`versionName`)            | `sushi-game-app/package.json` → letta da `app.config.ts` | [SemVer](https://semver.org/lang/it/): `MAJOR.MINOR.PATCH` |
| Codice versione Android (`versionCode`) | Gestito da EAS (`appVersionSource: remote`)              | Incrementato automaticamente a ogni build `production`     |
| Numero di build iOS (`buildNumber`)     | Gestito da EAS (`appVersionSource: remote`)              | Incrementato automaticamente a ogni build `production`     |
| `versionCode` degli APK di test         | Workflow "APK Android" (`scripts/version-code.js`)       | `MAJOR*10000 + MINOR*100 + PATCH` (es. 1.3.0 → 10300)      |
| Versione backend                        | `sushi-game-backend/package.json`                        | SemVer; mostrata da `/api/health`                          |
| Tag Git                                 | `vX.Y.Z`                                                 | Uno per ogni versione dell'app rilasciata                  |

**Ogni modifica che viene compilata (APK di test, build EAS, rilascio) aggiorna la versione**: il workflow "APK Android" si ferma se la stessa versione è già stata compilata da un altro commit.

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

| Profilo EAS         | `APP_VARIANT` | Application ID / bundle ID iOS         | Uso                                                       |
| ------------------- | ------------- | -------------------------------------- | --------------------------------------------------------- |
| `development`       | development   | `com.stevatero.sushistreakapp.dev`     | Dev client per lo sviluppo                                |
| `preview`           | preview       | `com.stevatero.sushistreakapp.preview` | APK interno (Android), build ad hoc per iPhone registrati |
| `preview-simulator` | preview       | `com.stevatero.sushistreakapp.preview` | App per il Simulatore iOS (non serve un account Apple)    |
| `production`        | production    | `com.stevatero.sushistreakapp`         | AAB per il Play Store, build per App Store / TestFlight   |
| `production-apk`    | production    | `com.stevatero.sushistreakapp`         | APK di produzione per installazione diretta               |

Il backend è unico (`https://sushi.dietalab.net`). Per usarne un altro in una build, imposta `EXPO_PUBLIC_API_URL` nella sezione `env` del profilo in `eas.json` o come variabile d'ambiente EAS.

### Strumenti di sviluppo esclusi dalle build di rilascio

`expo-dev-client` (con dev launcher e dev menu) porta con sé dipendenze native come Google ML Kit e il tooling di Jetpack Compose. Per le varianti `preview` e `production` lo script [`scripts/configure-build-variant.js`](../sushi-game-app/scripts/configure-build-variant.js) li esclude dall'autolinking. EAS lo esegue automaticamente tramite l'hook `eas-build-pre-install`.

### APK di test da GitHub Actions (senza EAS)

Il workflow **APK Android** (Actions → _APK Android_ → _Run workflow_) compila un APK sui runner GitHub, che includono Android SDK e NDK, e lo allega a due pre-release: `apk-<variante>-vX.Y.Z` (una per versione) e `apk-<variante>-latest` (sempre l'ultima build, con nome file fisso: il link di download non cambia). Si può scegliere l'APK completo (arm64 + armeabi-v7a) o solo arm64, più leggero. Per l'emulatore Android del PC (x86_64) scegli **x86_64**: gli APK ARM non si avviano sull'emulatore, perché le librerie native non vengono estratte e la traduzione ARM non le trova. Quell'APK è solo un artifact della run (Summary → Artifacts), senza pre-release. Le istruzioni di installazione sono nelle note della release e nel README. È firmato con la chiave di debug del template Expo: va bene per provare l'app, ma non aggiorna versioni installate da EAS o dal Play Store (la variante `preview` si installa accanto a quella pubblicata).

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

## iOS (App Store)

L'app è la stessa su Android e iOS (stesso codice, stesse funzioni). Le build iOS si fanno con EAS nel cloud: **non serve un Mac**, tranne per usare il Simulatore.

Configurazione già nel repository: bundle identifier `com.stevatero.sushistreakapp` (con i suffissi delle varianti), solo iPhone (su iPad l'app gira in modalità iPhone), orientamento verticale, iOS 16.4+, ciclo di vita a scene di UIKit (`enableSceneSupport` di `expo-build-properties`, necessario con l'SDK di iOS 27), Universal Links `applinks:sushi.dietalab.net` nella build di produzione, `ITSAppUsesNonExemptEncryption = false` (niente documentazione sull'esportazione della crittografia), dati locali esclusi dal backup iCloud, nessuna richiesta di permessi (microfono disattivato).

| Comando (`sushi-game-app`)      | Cosa serve                                    | Risultato                                                               |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run build:ios:simulator`   | Solo account Expo                             | `.app` da trascinare nel Simulatore iOS di Xcode (su Mac)               |
| `npm run build:ios:preview`     | Apple Developer Program + `eas device:create` | Build ad hoc installabile dagli iPhone registrati (link/QR di EAS)      |
| `npm run build:ios:production`  | Apple Developer Program                       | Build firmata per App Store Connect (`buildNumber` incrementato da EAS) |
| `npm run submit:ios:production` | App creata in App Store Connect               | Invio dell'ultima build a TestFlight, poi revisione e pubblicazione     |

Alla prima build `eas build -p ios` chiede di accedere con l'Apple ID e crea certificato di distribuzione e provisioning profile, abilitando la capability **Associated Domains** sull'App ID. Credenziali da conservare: `eas credentials -p ios`.

### Checklist App Store (prima pubblicazione)

- [ ] Iscrizione all'[Apple Developer Program](https://developer.apple.com/programs/) (99 USD/anno) e annotazione del **Team ID** (developer.apple.com → Membership).
- [ ] App Store Connect → App → **+ Nuova app**: piattaforma iOS, bundle ID `com.stevatero.sushistreakapp`, lingua principale italiano, SKU a scelta.
- [ ] Backend: impostare `APPLE_TEAM_ID` (Universal Links) e, dopo la pubblicazione, `IOS_APP_STORE_URL` (link di download e Smart App Banner nella pagina di invito). Verifica: `https://sushi.dietalab.net/.well-known/apple-app-site-association`.
- [ ] Scheda: nome, sottotitolo, descrizione, parole chiave, URL di supporto (es. pagina GitHub), URL dell'informativa `https://sushi.dietalab.net/privacy`, categoria (es. Giochi → Party o Stile di vita).
- [ ] Screenshot iPhone da 6,9" (1320×2868 o 1290×2796): si possono ricavare dal Simulatore.
- [ ] **Privacy dell'app**: vedi [DATA_SAFETY.md](DATA_SAFETY.md#app-store-connect-privacy-dellapp).
- [ ] Classificazione per età (questionario, nessun contenuto sensibile) e prezzo (gratis).
- [ ] Test con **TestFlight**, poi invio in revisione. Per la revisione Apple indica nelle note come provare l'app: crea una partita dalla Home (non servono account).

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
| `APPLE_TEAM_ID`                    | Variabile d'ambiente del backend                                            | Universal Links iOS (`/.well-known/apple-app-site-association`)                     |
| Chiave API App Store Connect       | Caricata in EAS: `eas credentials -p ios` (facoltativa)                     | `eas submit -p ios` senza inserire ogni volta l'Apple ID                            |

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
- [ ] Scheda dello store: descrizione breve e completa, screenshot telefono (almeno 2), grafica in primo piano 1024×500 e icona 512×512 (pronte in [`play-store/feature-graphic.png`](play-store/feature-graphic.png) e [`play-store/play-store-icon-512.png`](play-store/play-store-icon-512.png), generate con `npm run icons`).
- [ ] Questionario **Sicurezza dei dati**: vedi [DATA_SAFETY.md](DATA_SAFETY.md).
- [ ] Classificazione dei contenuti (IARC), pubblico di destinazione, dichiarazione annunci (nessun annuncio).
- [ ] Per i nuovi account personali: test chiuso con almeno 12 tester per 14 giorni prima dell'accesso alla produzione.
- [ ] Configurare `EXPO_TOKEN` e il service account per automatizzare build e submit.
