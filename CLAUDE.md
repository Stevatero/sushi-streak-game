# Sushi Streak — istruzioni per Claude

App per Android e iOS (Expo / React Native) per contare in tempo reale i pezzi di sushi mangiati con gli amici, con backend Node.js + Socket.IO + SQLite. Documentazione generale nel [README](README.md).

## Regole del progetto

- **Versione a ogni modifica compilata**: ogni volta che si modificano app o backend e si esegue una build (APK, EAS o rilascio), aggiorna prima la versione SemVer:
  - `cd sushi-game-app && npm version <patch|minor|major> --no-git-tag-version` (e lo stesso in `sushi-game-backend` se cambia il backend);
  - PATCH per correzioni, MINOR per nuove funzionalità, MAJOR per cambi incompatibili del protocollo app/server;
  - sposta le voci di `Unreleased` in `CHANGELOG.md` in una nuova sezione `## [X.Y.Z] - AAAA-MM-GG` e aggiorna i link in fondo;
  - con una nuova MINOR o MAJOR aggiorna la tabella di `SECURITY.md`.

  La versione in `sushi-game-app/package.json` è l'unica fonte: `app.config.ts` la usa come `versionName` e il workflow APK ne ricava il `versionCode` (`scripts/version-code.js`).

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
- **Protocollo**: il server è la fonte di verità. Eventi socket: `join_session`, `add_piece`, `remove_piece`, `player_finished`, `kick_player` (solo host); il server invia `session_update`, `game_ended`, `session_expired`, `player_kicked`. Le modifiche devono restare compatibili con l'app già pubblicata o richiedono una MAJOR.
- **APK di test**: in questo ambiente cloud `dl.google.com` (Android SDK) è bloccato. Si compila con il workflow GitHub Actions `android-apk.yml` (Actions → "APK Android"), che pubblica l'APK in una pre-release e aggiorna il link fisso `apk-<variante>-latest`.
