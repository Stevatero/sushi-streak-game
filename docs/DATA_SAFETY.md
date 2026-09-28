# Privacy e questionario "Sicurezza dei dati" (Google Play)

Questo documento descrive i dati trattati da Sushi Streak **così come risultano dal codice** (versione 1.2.0) e propone le risposte per il questionario _Data safety_ della Play Console.
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

### Salvati solo sul dispositivo (AsyncStorage, esclusi dal backup Android)

- Ultimo nickname usato
- Storico delle partite (nomi dei partecipanti, punteggi, ristorante facoltativo)
- Preferenze tema e audio
- Credenziali della partita in corso (ID giocatore e token)

Cancellabili da **Impostazioni → Cancella dati locali** o disinstallando l'app.

### Non raccolti

Account, email, telefono, posizione, contatti, foto/file, audio (il permesso microfono è bloccato), identificativi pubblicitari, dati di utilizzo/analytics, crash report.

### Terze parti

Nessun SDK di terze parti che invia dati (niente analytics, pubblicità o crash reporting). Le librerie incluse (Expo, React Native, Socket.IO) non effettuano chiamate verso servizi esterni nell'app di produzione. Nessun dato è condiviso con terze parti.

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

## Informativa sulla privacy

URL da indicare nella Play Console: **https://sushi.dietalab.net/privacy** (generata da `sushi-game-backend/privacyPage.js`).
È raggiungibile anche dall'app: Impostazioni → Privacy → _Informativa sulla privacy_.

Prima della pubblicazione impostare `PRIVACY_CONTACT` sul backend con un indirizzo email di contatto valido.
