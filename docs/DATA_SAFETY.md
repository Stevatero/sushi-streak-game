# Privacy: "Sicurezza dei dati" (Google Play) e "Privacy dell'app" (App Store)

Questo documento descrive i dati trattati da Sushi Streak **così come risultano dal codice** (versione 1.8.0, uguale su Android e iOS) e propone le risposte per il questionario _Data safety_ della Play Console e per la sezione _App Privacy_ di App Store Connect.
Va riverificato a ogni release che introduca nuovi dati, SDK o servizi esterni.

> Questo documento non è una consulenza legale e non attesta la conformità al GDPR: serve come base tecnica verificata per compilare il questionario e l'informativa. Le valutazioni legali restano a carico del titolare.

## Inventario dei dati

### Inviati al server (`sushi.dietalab.net`)

| Dato                                         | Origine              | Uso                                       | Visibilità                                                               | Conservazione                               |
| -------------------------------------------- | -------------------- | ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Nickname del giocatore                       | Inserito dall'utente | Classifica della partita                  | Partecipanti della partita e chiunque conosca il codice (`/join/CODICE`) | Durata partita + 30 giorni dalla chiusura¹  |
| Codice/nome sessione                         | Inserito o generato  | Identificare la partita                   | Come sopra                                                               | Come sopra                                  |
| Punteggio e stato "finito"                   | Azioni di gioco      | Classifica in tempo reale                 | Come sopra                                                               | Come sopra                                  |
| ID giocatore (UUID casuale) + hash del token | Generati dal server  | Riconnessione e autorizzazione            | Nessuno (il token resta sul dispositivo)                                 | Come sopra                                  |
| Indirizzo IP                                 | Connessione          | Trasmissione, limitazione delle richieste | Nessuno                                                                  | Transitorio; può comparire nei log di nginx |
| Segnalazioni di errore (facoltative)²        | Errori dell'app      | Correggere i problemi dell'app            | Solo lo sviluppatore (`npm run crash-reports` sul server)                | 30 giorni (`CRASH_RETENTION_DAYS`)          |

¹ Se l'host rimuove un giocatore, i suoi dati vengono cancellati subito tranne il nickname, conservato (in minuscolo) solo per impedirne il rientro nella stessa partita e cancellato insieme alla partita.

² **Dalla 1.8.0, disattivate di default**: partono solo se l'utente le attiva in Impostazioni → Privacy → _Segnalazioni di errore_, e si possono disattivare in qualsiasi momento. Contengono versione dell'app, piattaforma e versione del sistema operativo, nome, messaggio e traccia (stack) dell'errore, se è fatale e una breve descrizione del punto dell'app in cui è avvenuto. Nessun nickname, punteggio, codice di partita, ID giocatore o identificativo del dispositivo; l'IP serve solo al limite di invii (20 all'ora) e non viene salvato con la segnalazione. Vanno al nostro server (`POST /api/crash-reports`), nessuna terza parte. Al massimo 10 segnalazioni per avvio dell'app, ognuna una sola volta; il server ne conserva al massimo 5000.

### Salvati solo sul dispositivo (esclusi dal backup Android e iCloud)

- Ultimo nickname usato
- Storico delle partite (nomi dei partecipanti, punteggi, ristorante facoltativo)
- Preferenze tema, audio, vibrazione e consenso alle segnalazioni di errore
- Credenziali della partita in corso: ID giocatore in AsyncStorage, token nell'archivio sicuro del sistema (`expo-secure-store`: Android Keystore, Portachiavi iOS)
- Con le segnalazioni attive: l'ultimo errore che ha chiuso l'app, finché non viene inviato all'avvio successivo
- Solo in memoria, finché non tornano online: i pezzi registrati senza connessione
- Immagine del risultato condivisa: file temporaneo creato sul dispositivo e passato solo all'app scelta dall'utente nel foglio di condivisione del sistema

Cancellabili da **Impostazioni → Cancella dati locali** o disinstallando l'app.

### Non raccolti

Account, email, telefono, posizione, contatti, foto/file, audio (il permesso microfono è bloccato), identificativi pubblicitari o del dispositivo, dati di utilizzo/analytics. Crash report solo con il consenso dell'utente (vedi sopra).

### Terze parti

Nessun SDK di terze parti che invia dati (niente analytics, pubblicità o servizi di crash reporting esterni: le segnalazioni facoltative vanno al nostro server). Le librerie incluse (Expo, React Native, Socket.IO, e dalla 1.8.0 `expo-haptics`, `expo-sharing`, `react-native-view-shot`, `react-native-svg`) non effettuano chiamate verso servizi esterni nell'app di produzione. L'app non usa aggiornamenti over-the-air (EAS Update), che contatterebbero i server di Expo a ogni avvio. Nessun dato è condiviso con terze parti.

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

La 1.8.0 non aggiunge autorizzazioni (verificato con `expo prebuild`): la vibrazione usa il feedback al tocco del sistema (`View.performHapticFeedback`), che non richiede `VIBRATE`, e il permesso dichiarato da `expo-haptics` resta rimosso; `expo-sharing` aggiunge solo un `FileProvider` interno e la dichiarazione `<queries>` per l'azione di condivisione (`SEND`), che non è un'autorizzazione. Su iOS nessun nuovo permesso: l'immagine del risultato non viene salvata nella libreria foto.

## Risposte proposte per il questionario

| Domanda                                                  | Risposta proposta                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L'app raccoglie o condivide dati utente obbligatori?     | **Sì** (raccoglie)                                                                                                                                                                                                                   |
| Tutti i dati sono criptati in transito?                  | **Sì** (HTTPS/WSS)                                                                                                                                                                                                                   |
| Gli utenti possono richiedere la cancellazione dei dati? | **Sì**: dati locali dall'app; dati sul server tramite il contatto indicato in `/privacy` (e cancellazione automatica dopo 30 giorni, immediata per un giocatore rimosso dall'host; segnalazioni di errore cancellate dopo 30 giorni) |
| Dati condivisi con terze parti                           | **Nessuno**                                                                                                                                                                                                                          |

**Tipi di dati raccolti**

| Categoria Play                      | Tipo                                     | Raccolto | Condiviso | Temporaneo | Obbligatorio         | Finalità                         |
| ----------------------------------- | ---------------------------------------- | -------- | --------- | ---------- | -------------------- | -------------------------------- |
| Informazioni personali              | **Nome** (nickname)                      | Sì       | No        | No         | Sì (per giocare)     | Funzionalità dell'app            |
| Attività nelle app                  | **Altre azioni** (punteggi di gioco)     | Sì       | No        | No         | Sì                   | Funzionalità dell'app            |
| ID dispositivo o altri ID           | Altri ID (ID giocatore casuale)          | Sì       | No        | No         | Sì                   | Funzionalità dell'app, sicurezza |
| Informazioni e prestazioni dell'app | **Log degli arresti anomali**            | Sì       | No        | No         | **No** (facoltativo) | Analisi (stabilità dell'app)     |
| Informazioni e prestazioni dell'app | **Diagnostica** (versione app e sistema) | Sì       | No        | No         | **No** (facoltativo) | Analisi (stabilità dell'app)     |

Note:

- Il nickname è scelto liberamente e può non identificare la persona, ma Google chiede di dichiararlo come "Nome".
- L'indirizzo IP trattato solo per la connessione e la sicurezza, secondo le linee guida Google, di norma non va dichiarato come dato raccolto se non viene conservato per altre finalità. Se i log di nginx vengono conservati a lungo, valuta di dichiarare "Altri ID" anche per questo scopo o di ridurre la conservazione dei log.
- I dati salvati solo sul dispositivo e mai trasmessi non vanno dichiarati come "raccolti".
- **Dalla 1.8.0** le segnalazioni di errore vanno dichiarate anche se disattivate di default: Google chiede di dichiarare ogni dato che l'app può trasmettere, indicando che la raccolta è facoltativa ("Gli utenti possono scegliere se questi dati vengono raccolti"). Aggiorna il modulo nella Play Console **prima** di promuovere la 1.8.0 in produzione.

## App Store Connect: Privacy dell'app

Stesso inventario, con le categorie Apple. L'app non effettua tracciamento (nessun dato combinato con dati di terzi né condiviso con data broker): non serve la richiesta di App Tracking Transparency.

| Categoria Apple          | Tipo                           | Raccolto | Collegato all'identità | Tracciamento | Finalità              |
| ------------------------ | ------------------------------ | -------- | ---------------------- | ------------ | --------------------- |
| Informazioni di contatto | **Nome** (nickname)            | Sì       | No                     | No           | Funzionalità dell'app |
| Contenuti utente         | **Contenuti di gioco** (punti) | Sì       | No                     | No           | Funzionalità dell'app |
| Identificatori           | **ID utente** (ID giocatore)   | Sì       | No                     | No           | Funzionalità dell'app |
| Diagnostica              | **Dati sugli arresti anomali** | Sì       | No                     | No           | Funzionalità dell'app |
| Diagnostica              | **Altri dati diagnostici**     | Sì       | No                     | No           | Funzionalità dell'app |

Note:

- "Collegato all'identità: No" perché non esistono account e l'ID giocatore è casuale e valido per una sola partita. Se si aggiungono account o identificativi del dispositivo la risposta diventa "Sì".
- Diagnostica (dalla 1.8.0, solo con il consenso dell'utente): Apple include tra le finalità "Funzionalità dell'app" anche la riduzione degli arresti anomali. Le segnalazioni non contengono identificativi, quindi non sono collegate all'identità.
- Il manifesto privacy richiesto da Apple (`PrivacyInfo.xcprivacy`, API "required reason" di React Native ed Expo) viene generato da `expo prebuild`.

## Informativa sulla privacy

URL da indicare nella Play Console e in App Store Connect: **https://sushi.dietalab.net/privacy** (generata da `sushi-game-backend/privacyPage.js`).
È raggiungibile anche dall'app: Impostazioni → Privacy → _Informativa sulla privacy_.

Prima della pubblicazione impostare `PRIVACY_CONTACT` sul backend con un indirizzo email di contatto valido.
