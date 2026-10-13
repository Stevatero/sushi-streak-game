# Contribuire a Sushi Streak

Grazie per l'interesse! Il progetto è piccolo e l'obiettivo è mantenerlo semplice e affidabile.

## Flusso di lavoro

1. Apri una issue per discutere modifiche non banali prima di iniziare.
2. Crea un branch da `main` (`feat/…`, `fix/…`, `chore/…`).
3. Mantieni le modifiche piccole e accompagnate da test quando cambiano il comportamento.
4. Apri una pull request compilando il template: la CI deve essere verde.

## Controlli locali

```bash
# App
cd sushi-game-app
npm ci
npm run check          # lint + typecheck + formattazione + test

# Backend
cd sushi-game-backend
npm ci
npm run lint && npm run format:check && npm test
npm run test:coverage  # test con copertura (come in CI)
```

### Test end-to-end (Maestro)

I flussi in `sushi-game-app/e2e/flows` (partita da soli, ingresso con il link, chiusura da parte dell'host, pezzi registrati offline) girano su un emulatore Android contro un backend locale. In CI: etichetta **`e2e`** sulla pull request o Actions → **E2E Android** → _Run workflow_.

In locale servono un emulatore Android, [Maestro](https://maestro.mobile.dev) e un APK della variante `preview` compilato con il backend del PC (`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` e `E2E_CLEARTEXT=1`, che abilita l'http solo in quella build):

```bash
cd sushi-game-backend && npm run dev                       # backend su http://localhost:3000
cd sushi-game-app && maestro test e2e/flows                # con l'APK già installato sull'emulatore
```

I controlli usano i `testID` (`player-name`, `session-code`, `join-code`, `add-piece`, `undo-piece`, `finish-game`, `my-score`…): mantienili quando modifichi le schermate.

## Convenzioni

- **Commit**: [Conventional Commits](https://www.conventionalcommits.org/it/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`).
- **Formattazione**: Prettier (configurazione in `.prettierrc.json`); nessuna discussione sullo stile nelle review.
- **Lingua**: interfaccia utente, commenti e documentazione in italiano.
- **Changelog**: aggiungi una voce nella sezione `Unreleased` di `CHANGELOG.md` per ogni modifica visibile all'utente.
- **Versione**: ogni modifica che viene compilata e distribuita (APK di test, build EAS, rilascio) aggiorna la versione SemVer in `sushi-game-app/package.json` (e in `sushi-game-backend/package.json` se cambia il server) e porta le voci di `Unreleased` nella nuova sezione del changelog. Vedi [docs/RELEASING.md](docs/RELEASING.md).
- **Privacy**: se una modifica cambia i dati trattati, aggiorna `sushi-game-backend/privacyPage.js` e `docs/DATA_SAFETY.md`.

## Sicurezza

Non includere mai secrets, keystore o dati personali. Per le vulnerabilità segui [SECURITY.md](SECURITY.md).
