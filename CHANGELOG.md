# Changelog

Tutte le modifiche rilevanti al progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto adotta il [Semantic Versioning](https://semver.org/lang/it/).
La versione si riferisce all'app (`sushi-game-app/package.json`, = `versionName` Android); ogni rilascio ha un tag Git `vX.Y.Z`.

## [Unreleased]

### Aggiunto

- Podio nella classifica finale e gestione dei pareggi: a pari punteggio si condivide la posizione e la vittoria (anche nello storico).
- Home: pulsante "Incolla" che riconosce codici e link di invito copiati.
- Storico: riepilogo con partite giocate, pezzi mangiati e record.

### Modificato

- Nuova interfaccia grafica con un richiamo discreto allo stile giapponese: palette washi / sumi / vermiglione shu armonizzata con l'icona, tema scuro "notte" prugna, font Outfit, timbri hanko per logo e posizioni, motivo a onde seigaiha, didascalie in giapponese e pannelli a scomparsa dal basso.
- Partita: punteggio in grande, classifica semitrasparente sopra la pila e pulsante "+1" con animazione; comandi raggiungibili con il pollice.
- La vittoria è festeggiata con una pioggia di petali di ciliegio al posto dei fuochi d'artificio.
- Pagina web di invito con la stessa grafica dell'app (anche in tema scuro).
- Nuovo sistema di animazione della pila di sushi: la fisica gira sul thread UI con un motore dedicato (worklet Reanimated) al posto di Matter.js sul thread JS. La caduta resta fluida anche con decine di pezzi, la pila si assesta in modo naturale e a riposo la simulazione si ferma del tutto.
- Rientrando in una partita già avviata i pezzi cadono uno dopo l'altro invece che tutti insieme.

### Corretto

- Un doppio tocco su "Crea"/"Unisciti" poteva inviare due richieste al server.
- Il suono di vittoria veniva riprodotto anche quando si segnava solo la fine dei propri pezzi.
- Impostazioni: la licenza indicata nei crediti ("Tutti i diritti riservati") non corrispondeva alla licenza MIT del progetto.
- Backend: in caso di errore del database il giocatore poteva risultare "finito" in memoria ma non su disco.

### Rimosso

- Dipendenze `matter-js` e `@expo-google-fonts/joti-one`.

## [1.2.0] - 2026-09-25

Prima versione preparata per la pubblicazione sul Google Play Store.

> ⚠️ Il protocollo client/server è cambiato: l'app 1.2.0 richiede il backend 1.2.0 e le versioni precedenti dell'app non sono compatibili.

### Aggiunto

- Autenticazione dei giocatori con token segreto: i punti possono essere modificati solo dal giocatore stesso.
- Riconnessione automatica alla partita dopo cadute di rete, ritorno dal background o riavvio del server.
- Ripresa della partita in corso dalla Home, anche dopo la chiusura forzata dell'app.
- "Annulla ultimo pezzo", conferma prima di "Ho finito!" e uscita dalla partita con conferma.
- Indicatore dello stato di connessione e classifica completa con la propria posizione.
- Salvataggio automatico delle partite nello storico, con durata e ristorante facoltativo.
- Preferenze persistenti per tema (sistema/chiaro/scuro) e suoni.
- Impostazioni → Privacy: link all'informativa e cancellazione dei dati locali.
- Pagina `/privacy` servita dal backend e documentazione per la scheda Data Safety di Google Play.
- Schermata di recupero in caso di errore imprevisto.
- Backend: health check con verifica del database, log strutturati JSON, script di backup del database.
- Test automatici per app (Jest + Testing Library) e backend (node:test), CI GitHub Actions, Dependabot.

### Modificato

- Scadenza delle sessioni per inattività portata da 10 minuti a 3 ore (configurabile); ci si può unire finché la sessione è attiva.
- Le sessioni chiuse vengono conservate e cancellate automaticamente dopo 30 giorni, invece di essere eliminate subito.
- Icona adattiva Android e splash screen rigenerati sui colori del brand.
- Build Android di produzione in formato App Bundle con R8 e riduzione delle risorse.
- Ambienti separati (development, preview, production) installabili sullo stesso dispositivo.
- Comunicazione solo HTTPS: rimossi gli indirizzi IP e il traffico in chiaro.

### Corretto

- Crash del server causato da messaggi socket malformati.
- Link di invito che aprivano una partita non funzionante.
- Aggiornamenti in tempo reale persi dopo una riconnessione e partite diverse mescolate nella classifica.
- Interpretazione errata delle date delle partite salvate con versioni precedenti.
- Contenuti non filtrati nella pagina web di invito (XSS).

### Sicurezza

- Aggiornate le dipendenze del backend (0 vulnerabilità note) e rimosso `uuid` non più usato.
- Header di sicurezza HTTP e Content Security Policy con nonce.
- Backup Android disabilitato e permessi non necessari (microfono, overlay, storage) bloccati.

## [1.1.0] - 2025-12-23

Versione di sviluppo interna, non pubblicata sugli store.

[Unreleased]: https://github.com/Stevatero/sushi-streak-game/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Stevatero/sushi-streak-game/releases/tag/v1.2.0
