## Descrizione

<!-- Cosa cambia e perché. Collega le issue correlate (es. "Closes #12"). -->

## Tipo di modifica

- [ ] Correzione di bug
- [ ] Nuova funzionalità
- [ ] Refactoring / manutenzione
- [ ] Documentazione / CI

## Checklist

- [ ] `npm run check` passa in `sushi-game-app` (lint, typecheck, formattazione, test)
- [ ] `npm run lint && npm test` passano in `sushi-game-backend`
- [ ] Aggiunti o aggiornati i test per il comportamento modificato
- [ ] Modifiche all'app: etichetta `e2e` per i test su emulatore (workflow "E2E Android"), flussi aggiornati se cambiano le schermate
- [ ] Aggiornato `CHANGELOG.md` (sezione "Unreleased") se la modifica è visibile all'utente
- [ ] Nessun secret, token o dato personale nel codice
- [ ] Se cambiano i dati trattati: aggiornati `privacyPage.js` e `docs/DATA_SAFETY.md`
