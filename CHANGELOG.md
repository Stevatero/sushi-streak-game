# Changelog

Tutte le modifiche rilevanti al progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto adotta il [Semantic Versioning](https://semver.org/lang/it/).
La versione si riferisce all'app (`sushi-game-app/package.json`, = `versionName` Android); ogni rilascio ha un tag Git `vX.Y.Z`.

## [Unreleased]

## [1.8.0] - 2026-10-13

Partite più affidabili al tavolo: pezzi registrati anche senza rete, chiusura della partita da parte di chi la
gestisce, inviti con codice QR e risultato da condividere come immagine. Il backend va aggiornato prima
dell'app; resta compatibile con l'app 1.7 (i nuovi campi ed eventi del protocollo sono facoltativi).

### Aggiunto

- **Pezzi anche senza rete**: con la connessione assente i pezzi (e gli annullamenti) restano sul telefono, contano subito nel punteggio e nella pila, e partono da soli alla riconnessione. Il titolo della partita indica quanti sono ancora da inviare.
- **Termina la partita per tutti**: chi gestisce la partita può chiuderla anche se qualcuno si è dimenticato di toccare "Ho finito"; chi non ha finito viene segnato come finito con i pezzi che ha.
- **Chiusura automatica**: una partita senza nuovi pezzi da 45 minuti, in cui almeno metà dei giocatori ha già finito, si chiude da sola con il podio.
- **Passaggio del ruolo di host**: se chi gestisce la partita resta assente per 15 minuti (telefono scarico, app chiusa), il ruolo passa al primo giocatore connesso, che riceve un avviso.
- **Codice QR nell'invito**: gli amici al tavolo entrano inquadrandolo con la fotocamera.
- **Risultato come immagine**: a fine partita e dallo storico si condivide una card con podio, vincitore, ristorante e data (WhatsApp, Telegram…).
- **Vibrazione leggera** quando aggiungi o annulli un pezzo e quando vinci, disattivabile nelle Impostazioni. Su Android usa il feedback al tocco del sistema: nessuna nuova autorizzazione.
- **Segnalazioni di errore facoltative** (Impostazioni → Privacy, disattivate di default): se l'app incontra un errore invia al nostro server versione, sistema ed errore, mai nomi o partite. Nessun servizio di terze parti.
- **Aggiornamento richiesto**: se il server richiede una versione più recente, l'app lo spiega e porta allo store; la partita in corso resta riprendibile dopo l'aggiornamento.
- Avviso nella Home quando il codice scelto a mano è corto (meno di 5 caratteri) e quindi facile da indovinare.
- Lettori di schermo: annuncio dei cambi di posizione in classifica.

### Modificato

- A fine partita il pannello indica se l'ha chiusa chi la gestiva o la chiusura automatica.
- Il numero dei pezzi e il pulsante +1 crescono meno con i caratteri di sistema molto grandi, per restare leggibili sopra la pila.
- Chi gestisce la partita è indicato come "gestisce" (non più "ha creato"): con il passaggio del ruolo può non essere chi l'ha creata.

### Corretto

- Un pezzo rinviato dopo un timeout o una riconnessione non viene più contato due volte.

### Sicurezza

- Backend: aggiornato `proxy-addr` (avviso critico GHSA-jqcg-44mw-7w3h sull'IP del client dietro proxy).
- App: patch di Expo SDK 57 (`expo` 57.0.28) e `source-map-js` 1.2.2. Per gli avvisi senza correzione che riguardano solo gli strumenti di build (`braces`, `node-forge`) la CI usa un elenco di eccezioni motivate con data di revisione (`audit-allowlist.json`).

### Tecnico

- Protocollo (compatibile): `add_piece`/`remove_piece` accettano un numero progressivo `seq` e il server ignora quelli già applicati; `join_session` accetta `appVersion` e risponde con `lastSeq` e `features`; nuovo evento `end_session` (solo host); gli aggiornamenti della partita indicano `closedBy` e, per ogni giocatore, l'ultimo `seq` applicato.
- Backend: nuove colonne `players.last_seq` e `sessions.closed_by`, tabella `crash_reports` (cancellate dopo 30 giorni, al massimo 5000), endpoint `POST /api/crash-reports` con limite per IP, script `npm run crash-reports`. Nuove variabili `SESSION_AUTO_END_MIN`, `HOST_TRANSFER_MIN`, `MIN_APP_VERSION`, `CRASH_RETENTION_DAYS`.
- Backend: l'ultima attività di una partita viene salvata al più ogni 30 secondi (e alla chiusura), così un pezzo costa una sola scrittura sul database; test con copertura in CI (`npm run test:coverage`).
- App: schermata di gioco divisa in componenti (`src/screens/gameSession/`) e hook per il salvataggio nello storico; invito e risultato condivisi tra partita, Impostazioni e storico.
- Test end-to-end con Maestro su emulatore Android contro un backend locale (workflow "E2E Android", anche con l'etichetta `e2e` sulle pull request).
- Nuove dipendenze native: `expo-haptics`, `expo-sharing`, `react-native-view-shot`, `react-native-svg` (nessuna nuova autorizzazione Android, nessun permesso iOS).
- Valutato il passaggio da `sqlite3` a `better-sqlite3`: rimandato, perché la versione attuale richiede Node 22 e `sqlite3` 6 è mantenuto.

## [1.7.1] - 2026-09-30

### Modificato

- Su tablet e pieghevoli aperti Android l'app si può usare anche in orizzontale; sui telefoni resta in verticale.

## [1.7.0] - 2026-09-29

Revisione completa di app e backend: correzioni, sicurezza e affidabilità. Il backend va aggiornato prima
dell'app; resta compatibile con le versioni già installate (i nuovi campi del protocollo sono facoltativi).

### Corretto

- Il nome del ristorante non viene più cancellato quando si rientra in una partita dopo averlo indicato.
- Una partita che si chiude mentre si è fuori dalla schermata di gioco viene comunque salvata nello storico, con la classifica finale.
- Riprendendo una partita non si crea più, in rari casi, una seconda voce nello storico.
- La Home non propone più di rientrare in una partita nuova creata da altri con lo stesso codice di quella salvata, né in una partita da cui si è stati rimossi.
- Se il server non conferma subito il rientro nella partita (es. errore temporaneo), l'app resta in "Riconnessione…" e riprova da sola, invece di mostrarsi online senza registrare i pezzi.
- Toccando "+1" troppo in fretta l'app avvisa che il pezzo non è stato contato.
- "Cancella dati locali" durante una partita non impedisce più di rientrarvi (e lo dice nella conferma).

### Sicurezza

- Il token della partita in corso è conservato nell'archivio sicuro del sistema (Android Keystore, Portachiavi iOS) e non più in chiaro; quello salvato dalle versioni precedenti viene spostato automaticamente.
- Backend: limite di richieste per IP anche su informazioni della partita, pagina di invito e ingresso via socket (anche dietro nginx), contro la ricerca di codici a tentativi.
- Backend: un giocatore rimosso dall'host non può rientrare nella stessa partita con lo stesso nome.
- CI: `eas-cli` a versione fissa e action di GitHub fissate per SHA nei workflow che usano i secret.

### Tecnico

- Backend: le partite hanno un orario di inizio (`startedAt`, nelle risposte di creazione/ingresso, in `/info` e negli aggiornamenti) che distingue partite diverse con lo stesso codice.
- Backend: creazione di partite con lo stesso codice serializzata (due richieste contemporanee non si sovrascrivono più) e chiusura delle partite scritta prima sul database e poi in memoria.
- App: lo storico viene aggiornato al massimo ogni 1,5 secondi mentre gli altri giocano ancora, e le scritture sono serializzate.
- Nuova dipendenza nativa `expo-secure-store` (nessuna nuova autorizzazione).
- Versione unica per app e backend, come richiesto dal rilascio automatico (`CLAUDE.md` aggiornato).

## [1.6.1] - 2026-09-29

Prima versione pubblicata automaticamente sul Google Play (test interno).

> Backend invariato rispetto alla 1.4.1: cambia solo il numero di versione, unico per tutto il progetto.

### Tecnico

- Rilascio automatico: unendo in `main` una nuova versione, dopo la CI verde vengono creati tag e GitHub Release, la build AAB su EAS e l'invio alla traccia di test interno del Google Play (workflow `auto-release.yml`).
- Patch di Expo SDK 57 (`expo` 57.0.26, `expo-constants` 57.0.20).

### Corretto

- Il messaggio di invito condiviso (es. su WhatsApp) non ripete più il codice come "Sessione" e "Codice": resta solo il codice.

## [1.6.0] - 2026-09-29

Aggiornamento a Expo SDK 57.

> Backend invariato rispetto alla 1.4.1: cambia solo il numero di versione, unico per tutto il progetto.

### Modificato

- Expo SDK 57 (da 54): React Native 0.86, React 19.2, Reanimated 4.5 e Worklets 0.10, TypeScript 6. Risolti tutti gli advisory di sicurezza delle dipendenze (PostCSS, image-size, uuid): `npm audit` non riporta vulnerabilità.
- iOS: versione minima 16.4 (da 15.1), richiesta dall'SDK; ciclo di vita a scene di UIKit, necessario per le app compilate con l'SDK di iOS 27.
- Android invariato: API 24–36.

### Documentazione

- Materiale per la scheda Google Play in `docs/play-store/`: testi (`listing.md`), 10 screenshot in tema chiaro e scuro, grafica in primo piano e icona.
- Nuove immagini dell'interfaccia nel README e nuova immagine social del repository.

### Corretto

- Home: tolto il timbro 寿司 sovrapposto all'icona dell'app, che dalla 1.5.0 ha già il suo timbro 寿.
- Android 16: il tasto indietro con la tastiera aperta chiudeva l'app invece della tastiera. Ora l'app usa il gesto "indietro predittivo" di Android.
- Nei pannelli (es. nome del ristorante) il tasto indietro con la tastiera aperta chiude solo la tastiera, senza perdere quanto scritto.
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

[Unreleased]: https://github.com/Stevatero/sushi-streak-game/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/Stevatero/sushi-streak-game/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/Stevatero/sushi-streak-game/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/Stevatero/sushi-streak-game/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Stevatero/sushi-streak-game/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Stevatero/sushi-streak-game/releases/tag/v1.2.0
