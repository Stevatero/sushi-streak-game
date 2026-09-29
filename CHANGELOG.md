# Changelog

Tutte le modifiche rilevanti al progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto adotta il [Semantic Versioning](https://semver.org/lang/it/).
La versione si riferisce all'app (`sushi-game-app/package.json`, = `versionName` Android); ogni rilascio ha un tag Git `vX.Y.Z`.

## [Unreleased]

## [1.6.0] - 2026-09-29

Aggiornamento a Expo SDK 57.

> Backend invariato rispetto alla 1.4.1: cambia solo il numero di versione, unico per tutto il progetto.

### Modificato

- Expo SDK 57 (da 54): React Native 0.86, React 19.2, Reanimated 4.5 e Worklets 0.10, TypeScript 6. Risolti tutti gli advisory di sicurezza delle dipendenze (PostCSS, image-size, uuid): `npm audit` non riporta vulnerabilità.
- iOS: versione minima 16.4 (da 15.1), richiesta dall'SDK; ciclo di vita a scene di UIKit, necessario per le app compilate con l'SDK di iOS 27.
- Android invariato: API 24–36.

### Corretto

- Home: tolto il timbro 寿司 sovrapposto all'icona dell'app, che dalla 1.5.0 ha già il suo timbro 寿.
- Singolare con un solo pezzo o giocatore ("1 pezzo", "1 giocatore" invece di "1 pezzi", "1 giocatori") nella partita, nella classifica finale e nello storico.

### Tecnico

- Codice adattato alle regole del React Compiler introdotte da `eslint-config-expo` 57 (petali calcolati fuori dal render, festeggiamento ricavato dallo stato, valori animati con `set()`).
- CI: generazione del progetto nativo iOS su Linux a ogni PR (controlla il ciclo di vita a scene e gli Universal Links) e audit delle dipendenze bloccante già dal livello "high".

## [1.5.0] - 2026-09-29

Nuova icona e nuovo splash screen.

> Backend invariato rispetto alla 1.4.1: cambia solo il numero di versione, unico per tutto il progetto.

### Modificato

- Nuova icona nello stile dell'app: un nigiri con il timbro hanko 寿 vermiglione su fondo prugna con le onde seigaiha. Su Android l'icona adattiva ha lo stesso sfondo a onde e il soggetto resta nella zona sicura con ogni forma (cerchio, squircle, goccia).
- Nuovo splash screen con lo stesso soggetto; nuova icona anche nella Home.

### Aggiunto

- Sorgenti SVG di icone, splash e grafica per Google Play in `sushi-game-app/assets/source/` e comando `npm run icons` per rigenerare i PNG, senza dipendenze aggiuntive.
- Grafica in primo piano (1024×500) e icona (512×512) per la scheda di Google Play in `docs/play-store/`.

## [1.4.1] - 2026-09-29

Configurazione del backend in un file `.env`.

### Corretto

- Backend: all'avvio viene caricato `sushi-game-backend/.env`, se esiste, come indicato in `.env.example`: prima il file veniva ignorato e le variabili andavano scritte in `ecosystem.config.js` sul server, bloccando `git pull`. Le variabili già impostate nell'ambiente (PM2, shell) hanno la precedenza. Anche lo script di backup legge il file.

## [1.4.0] - 2026-09-28

Conferme nello stile dell'app, annullamento animato e preparazione per iOS.

> L'app 1.4.0 funziona con il backend 1.3.0; il backend 1.4.0 serve solo per gli Universal Links e i link all'App Store della pagina di invito.

### Aggiunto

- Annullando l'ultimo pezzo, questo si gonfia, ruota e svanisce dalla pila con un suono "bop".
- Supporto iOS: bundle identifier, Universal Links (`applinks:sushi.dietalab.net`) per la build di produzione, profili EAS e script per le build iOS (anche per il simulatore, senza account Apple), bundle iOS verificato in CI.
- Backend: `/.well-known/apple-app-site-association` per gli Universal Links (variabile `APPLE_TEAM_ID`, facoltativa `IOS_BUNDLE_ID`).
- Pagina di invito: su iPhone il link di download porta all'App Store (`IOS_APP_STORE_URL`) e compare lo Smart App Banner di Safari; finché l'app iOS non è pubblicata il link a Google Play non viene mostrato.

### Modificato

- Tutte le conferme e gli avvisi (fine della partita, uscita, rimozione di un giocatore, sessione scaduta o non disponibile, eliminazione dallo storico, cancellazione dei dati) usano un pannello nello stile dell'app, con timbro hanko e motivo seigaiha, al posto delle finestre di sistema. Aspetto identico su Android e iOS.
- Conferma "Ho finito": riepilogo dei pezzi mangiati e della posizione in classifica.
- Partita: "I tuoi pezzi", nome della sessione e "Tocca per invitare" centrati.
- I suoni si mescolano alla musica di altre app invece di interromperla e su iPhone rispettano il tasto silenzioso.
- Condivisione: su iOS il link di invito non viene più duplicato nel messaggio.
- Su iPad l'app gira in modalità iPhone (solo verticale).

### Corretto

- Su iOS una finestra (es. la classifica finale o il nome del ristorante) poteva non aprirsi se un'altra si stava ancora chiudendo: le finestre ora si aprono una alla volta, al termine della chiusura della precedente.
- La classifica nel pannello a scomparsa non permette più di aprire la rimozione di un giocatore sopra il pannello stesso.

## [1.3.0] - 2026-09-28

Nuova interfaccia, animazione della pila di sushi riscritta e miglioramenti del server.

> L'app 1.3.0 funziona anche con il backend 1.2.0; la rimozione dei giocatori richiede il backend 1.3.0.

### Aggiunto

- Podio nella classifica finale e gestione dei pareggi: a pari punteggio si condivide la posizione e la vittoria (anche nello storico).
- Home: pulsante "Incolla" che riconosce codici e link di invito copiati.
- Storico: riepilogo con partite giocate, pezzi mangiati e record.
- Chi crea la partita può rimuovere un giocatore toccandolo in classifica; il giocatore rimosso viene avvisato e non può rientrare con le vecchie credenziali.
- Pagina di invito: su Android il pulsante "Apri nell'app" porta allo store se l'app non è installata (`APP_STORE_URL`, default Google Play) ed è presente un link per scaricarla.
- Workflow GitHub Actions "APK Android" per compilare APK di test senza EAS, con link fisso all'ultima build.

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
- Backend: in caso di errore del database punteggio e stato "finito" potevano cambiare in memoria ma non su disco. Le modifiche di ogni giocatore ora sono serializzate e scritte prima sul database, senza perdere tocchi ravvicinati.
- Backend: un errore nella chiusura di una sessione scaduta non blocca più la chiusura delle altre.
- Pagina di invito: niente più tentativi di apertura dell'app su iOS (non supportato) e nessun errore su Android se l'app non è installata.

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

[Unreleased]: https://github.com/Stevatero/sushi-streak-game/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/Stevatero/sushi-streak-game/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Stevatero/sushi-streak-game/releases/tag/v1.2.0
