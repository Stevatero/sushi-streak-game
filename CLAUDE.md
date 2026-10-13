# Sushi Streak — istruzioni per Claude

App per Android e iOS (Expo / React Native) per contare in tempo reale i pezzi di sushi mangiati con gli amici, con backend Node.js + Socket.IO + SQLite. Documentazione generale nel [README](README.md).

## Regole del progetto

- **Versione a ogni modifica compilata**: ogni volta che si modificano app o backend e si esegue una build (APK, EAS o rilascio), aggiorna prima la versione SemVer:
  - `cd sushi-game-app && npm version <patch|minor|major> --no-git-tag-version` e lo stesso in `sushi-game-backend`, anche se il backend non cambia: la versione del progetto è unica e il rilascio automatico (`auto-release.yml`) si ferma se app e backend hanno versioni diverse;
  - PATCH per correzioni, MINOR per nuove funzionalità, MAJOR per cambi incompatibili del protocollo app/server;
  - sposta le voci di `Unreleased` in `CHANGELOG.md` in una nuova sezione `## [X.Y.Z] - AAAA-MM-GG` e aggiorna i link in fondo;
  - con una nuova MINOR o MAJOR aggiorna la tabella di `SECURITY.md`.

  La versione in `sushi-game-app/package.json` è l'unica fonte: `app.config.ts` la usa come `versionName` e il workflow APK ne ricava il `versionCode` (`scripts/version-code.js`).

- **Rilascio automatico**: unire in `main` una nuova versione avvia, dopo la CI verde, il workflow `auto-release.yml` (tag `vX.Y.Z`, GitHub Release, build AAB su EAS e invio alla traccia di test interno del Google Play). Non cambiare la versione in `main` se non si vuole pubblicare; vedi `docs/RELEASING.md`.

- **Lingua**: interfaccia, commenti, documentazione, commit e PR in italiano.
- **Commit**: Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `ci:`, `chore:`…). Il repository non accetta merge commit: le PR si uniscono con rebase.
- **Changelog**: ogni modifica visibile all'utente va in `CHANGELOG.md` (sezione `Unreleased`, poi nella versione).
- **Privacy**: se cambiano i dati trattati aggiorna `sushi-game-backend/privacyPage.js` e `docs/DATA_SAFETY.md`.
- Le cartelle native `sushi-game-app/android` e `ios` sono generate da `expo prebuild` e non vanno committate.

## Controlli prima di ogni push

```bash
cd sushi-game-app && npm run check                                    # lint, typecheck, formattazione, test
cd sushi-game-backend && npm run lint && npm run format:check && npm test
```

## Note tecniche

- **Pila di sushi** (`sushi-game-app/src/components/sushiStack/physics.ts`): motore fisico eseguito come worklet sul thread UI. Il plugin dei worklet trasforma le funzioni in espressioni non "hoisted": ogni worklet va dichiarato prima delle funzioni che lo chiamano. Le modifiche ai parametri vanno verificate con `physics.test.ts` (stabilità, pezzi sospesi, tempo di assestamento).
- **Design system** in `sushi-game-app/src/theme/theme.ts` e `src/components/ui/`: usa `useAppTheme()`, i token `typography`/`radii` e i componenti esistenti (`AppButton`, `Panel`, `Sheet`, `ConfirmSheet`, `Field`, `Hanko`…) invece di stili ad hoc.
- **Conferme e avvisi**: niente `Alert.alert` (aspetto diverso tra Android e iOS). Usa `ConfirmSheet` con le opzioni (`seal`, `title`, `message`, `confirmLabel`, `cancelLabel`, `destructive`…) e gestisci tutte le finestre della schermata con `useExclusiveModal`: su iOS una Modal non si apre mentre un'altra si sta chiudendo, e l'hook apre la successiva (o esegue la navigazione con `afterModalClose`) solo al termine della dissolvenza.
- **Multipiattaforma**: ogni modifica deve funzionare su Android e iOS. Verifica il bundle iOS con `npm run export:ios` e, se cambia la configurazione nativa, `APP_VARIANT=production npx expo prebuild -p ios --no-install` in una copia del progetto (non committare `ios/`).
- **Protocollo**: il server è la fonte di verità. Eventi socket: `join_session` (con `appVersion`; la risposta ha `lastSeq` e `features`), `leave_session`, `add_piece` e `remove_piece` (con `seq` progressivo per giocatore: il server ignora i numeri già applicati), `player_finished`, `kick_player` ed `end_session` (solo host); il server invia `session_update`, `game_ended` (con `closedBy`), `session_expired`, `player_kicked`. Le modifiche devono restare compatibili con l'app già pubblicata o richiedono una MAJOR; i nuovi campi sono facoltativi e l'app usa una funzione solo se il server la dichiara in `features`. Le app troppo vecchie si escludono con `MIN_APP_VERSION` sul backend.
- **Coda dei pezzi** (`socketService.ts`): con un server che dichiara `piece_seq` i pezzi passano da una coda inviata un pezzo alla volta (al massimo 5 al secondo); offline restano in coda e contano subito nel punteggio mostrato (`pendingDelta` nello store). Gli aggiornamenti della partita tolgono dalla coda i pezzi già applicati prima di arrivare allo store: classifica e pezzi in attesa vanno aggiornati insieme, mai sommati due volte.
- **Test end-to-end**: flussi Maestro in `sushi-game-app/e2e/flows` (sottoflussi in `e2e/subflows`, script del backend in `e2e/scripts`), eseguiti dal workflow `e2e-android.yml` (etichetta `e2e` sulla PR). Usano i `testID` dei controlli principali: se cambi le schermate aggiorna anche i flussi.
- **Vulnerabilità**: la CI dell'app usa `npm run audit:check`; gli avvisi senza correzione che riguardano solo gli strumenti di build vanno in `audit-allowlist.json` con motivo e data di revisione, mai ignorati in blocco.
- **APK di test**: in questo ambiente cloud `dl.google.com` (Android SDK) è bloccato. Si compila con il workflow GitHub Actions `android-apk.yml` (Actions → "APK Android"), che pubblica l'APK in una pre-release e aggiorna il link fisso `apk-<variante>-latest`.
