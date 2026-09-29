# Privacy: "Sicurezza dei dati" (Google Play) e "Privacy dell'app" (App Store)

Questo documento descrive i dati trattati da Sushi Streak **così come risultano dal codice** (versione 1.6.0, uguale su Android e iOS) e propone le risposte per il questionario _Data safety_ della Play Console e per la sezione _App Privacy_ di App Store Connect.
Va riverificato a ogni release che introduca nuovi dati, SDK o servizi esterni.

> Questo documento non è una consulenza legale e non attesta la conformità al GDPR: serve come base tecnica verificata per compilare il questionario e l'informativa. Le valutazioni legali restano a carico del titolare.

## Inventario dei dati

### Inviati al server (`sushi.dietalab.net`)

| Dato                                         | Origine              | Uso                                       | Visibilità                                                               | Conservazione                               |
| -------------------------------------------- | -------------------- | ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Nickname del giocatore                       | Inserito dall'utente | Classifica della partita                  | Partecipanti della partita e chiunque conosca il codice (`/join/CODICE`) | Durata partita + 30 giorni dalla chiusura   |
| Codice/nome sessione                         | Inserito o generato  | Identificare la partita                   | Come sopra                                                               | Come sopra                                  |
| Punteggio e stato "finito"                   | Azioni di gioco      | Classifica in tempo reale                 | Come sopra                                                               | Come sopra                                  |
| ID giocatore (UUID casuale) + hash del token | Generati dal server  | Riconnessione e autorizzazione            | Nessuno (il token resta sul dispositivo)                                 | Come sopra                                  |
| Indirizzo IP                                 | Connessione          | Trasmissione, limitazione delle richieste | Nessuno                                                                  | Transitorio; può comparire nei log di nginx |

### Salvati solo sul dispositivo (AsyncStorage, esclusi dal backup Android e iCloud)

- Ultimo nickname usato
- Storico delle partite (nomi dei partecipanti, punteggi, ristorante facoltativo)
- Preferenze tema e audio
- Credenziali della partita in corso (ID giocatore e token)

Cancellabili da **Impostazioni → Cancella dati locali** o disinstallando l'app.

### Non raccolti

Account, email, telefono, posizione, contatti, foto/file, audio (il permesso microfono è bloccato), identificativi pubblicitari, dati di utilizzo/analytics, crash report.

### Terze parti

Nessun SDK di terze parti che invia dati (niente analytics, pubblicità o crash reporting). Le librerie incluse (Expo, React Native, Socket.IO) non effettuano chiamate verso servizi esterni nell'app di produzione. Nessun dato è condiviso con terze parti.

### Autorizzazioni Android

Autorizzazioni dichiarate dal bundle di produzione 1.6.0 (`com.stevatero.sushistreakapp`, versionCode 5), come riportate dalla Play Console:

| Autorizzazione                                                          | Origine                                  | Note                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `android.permission.INTERNET`                                           | App                                      | Comunicazione con il server (HTTPS/WSS)                        |
| `android.permission.ACCESS_NETWORK_STATE`                               | App                                      | Stato della connessione e riconnessione automatica             |
| `android.permission.WAKE_LOCK`                                          | Libreria nativa (riproduzione audio)     | Normale; da non bloccare, il player può usarla durante i suoni |
| `com.android.vending.CHECK_LICENSE`                                     | Libreria Google/Expo inclusa nella build | Normale; nessun dato personale                                 |
| `com.stevatero.sushistreakapp.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX (targetSdk 33+)                 | Interna all'app                                                |

Sono tutte autorizzazioni "normali": Android le concede senza chiedere nulla all'utente e nessuna dà accesso a dati personali, quindi non cambiano le risposte del questionario. Microfono, overlay, storage, vibrazione e servizi in foreground sono esclusi con `blockedPermissions` in `app.config.ts`. Da ricontrollare nella Play Console (App bundle → Autorizzazioni) a ogni aggiornamento delle dipendenze.

## Risposte proposte per il questionario

| Domanda                                                  | Risposta proposta                                                                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L'app raccoglie o condivide dati utente obbligatori?     | **Sì** (raccoglie)                                                                                                                                                                 |
| Tutti i dati sono criptati in transito?                  | **Sì** (HTTPS/WSS)                                                                                                                                                                 |
| Gli utenti possono richiedere la cancellazione dei dati? | **Sì**: dati locali dall'app; dati sul server tramite il contatto indicato in `/privacy` (e cancellazione automatica dopo 30 giorni, immediata per un giocatore rimosso dall'host) |
| Dati condivisi con terze parti                           | **Nessuno**                                                                                                                                                                        |

**Tipi di dati raccolti**

| Categoria Play            | Tipo                                 | Raccolto | Condiviso | Temporaneo | Obbligatorio     | Finalità                         |
| ------------------------- | ------------------------------------ | -------- | --------- | ---------- | ---------------- | -------------------------------- |
| Informazioni personali    | **Nome** (nickname)                  | Sì       | No        | No         | Sì (per giocare) | Funzionalità dell'app            |
| Attività nelle app        | **Altre azioni** (punteggi di gioco) | Sì       | No        | No         | Sì               | Funzionalità dell'app            |
| ID dispositivo o altri ID | Altri ID (ID giocatore casuale)      | Sì       | No        | No         | Sì               | Funzionalità dell'app, sicurezza |

Note:

- Il nickname è scelto liberamente e può non identificare la persona, ma Google chiede di dichiararlo come "Nome".
- L'indirizzo IP trattato solo per la connessione e la sicurezza, secondo le linee guida Google, di norma non va dichiarato come dato raccolto se non viene conservato per altre finalità. Se i log di nginx vengono conservati a lungo, valuta di dichiarare "Altri ID" anche per questo scopo o di ridurre la conservazione dei log.
- I dati salvati solo sul dispositivo e mai trasmessi non vanno dichiarati come "raccolti".

## App Store Connect: Privacy dell'app

Stesso inventario, con le categorie Apple. L'app non effettua tracciamento (nessun dato combinato con dati di terzi né condiviso con data broker): non serve la richiesta di App Tracking Transparency.

| Categoria Apple          | Tipo                           | Raccolto | Collegato all'identità | Tracciamento | Finalità              |
| ------------------------ | ------------------------------ | -------- | ---------------------- | ------------ | --------------------- |
| Informazioni di contatto | **Nome** (nickname)            | Sì       | No                     | No           | Funzionalità dell'app |
| Contenuti utente         | **Contenuti di gioco** (punti) | Sì       | No                     | No           | Funzionalità dell'app |
| Identificatori           | **ID utente** (ID giocatore)   | Sì       | No                     | No           | Funzionalità dell'app |

Note:

- "Collegato all'identità: No" perché non esistono account e l'ID giocatore è casuale e valido per una sola partita. Se si aggiungono account o identificativi del dispositivo la risposta diventa "Sì".
- Il manifesto privacy richiesto da Apple (`PrivacyInfo.xcprivacy`, API "required reason" di React Native ed Expo) viene generato da `expo prebuild`.

## Informativa sulla privacy

URL da indicare nella Play Console e in App Store Connect: **https://sushi.dietalab.net/privacy** (generata da `sushi-game-backend/privacyPage.js`).
È raggiungibile anche dall'app: Impostazioni → Privacy → _Informativa sulla privacy_.

Prima della pubblicazione impostare `PRIVACY_CONTACT` sul backend con un indirizzo email di contatto valido.
