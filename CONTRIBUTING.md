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
```

## Convenzioni

- **Commit**: [Conventional Commits](https://www.conventionalcommits.org/it/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`).
- **Formattazione**: Prettier (configurazione in `.prettierrc.json`); nessuna discussione sullo stile nelle review.
- **Lingua**: interfaccia utente, commenti e documentazione in italiano.
- **Changelog**: aggiungi una voce nella sezione `Unreleased` di `CHANGELOG.md` per ogni modifica visibile all'utente.
- **Versione**: ogni modifica che viene compilata e distribuita (APK di test, build EAS, rilascio) aggiorna la versione SemVer in `sushi-game-app/package.json` (e in `sushi-game-backend/package.json` se cambia il server) e porta le voci di `Unreleased` nella nuova sezione del changelog. Vedi [docs/RELEASING.md](docs/RELEASING.md).
- **Privacy**: se una modifica cambia i dati trattati, aggiorna `sushi-game-backend/privacyPage.js` e `docs/DATA_SAFETY.md`.

## Sicurezza

Non includere mai secrets, keystore o dati personali. Per le vulnerabilità segui [SECURITY.md](SECURITY.md).
