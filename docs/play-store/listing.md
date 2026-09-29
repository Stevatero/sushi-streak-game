# Scheda Google Play (italiano)

Testi e materiali per la scheda dello store di Sushi Streak nella Play Console (**Crescita → Presenza nello store → Scheda principale dello store**). I limiti di caratteri sono quelli della Play Console, e i conteggi sono verificati.

## Dettagli dell'app

**Nome dell'app** (massimo 30 caratteri)

```text
Sushi Streak: sfida al sushi
```

**Descrizione breve** (massimo 80 caratteri)

```text
Chi mangia più sushi? Conta i pezzi con gli amici in una classifica dal vivo.
```

**Descrizione completa** (massimo 4000 caratteri)

```text
Chi mangia più sushi? Sushi Streak trasforma la cena all-you-can-eat in una sfida tra amici: ognuno conta i pezzi che mangia e la classifica si aggiorna in tempo reale sul telefono di tutti.

🍣 COME SI GIOCA
• Crea una partita e invita gli amici con un link o un codice.
• Tocca +1 per ogni pezzo mangiato: la tua pila di sushi cresce e la classifica si aggiorna per tutti.
• Hai sbagliato? "Annulla" toglie l'ultimo pezzo.
• Quando hai finito tocca "Ho finito". Quando tutti hanno finito compaiono il podio e il vincitore, con una pioggia di petali di ciliegio.

🏆 CLASSIFICA IN TEMPO REALE
• La tua posizione e il tuo punteggio sempre in primo piano.
• Chi crea la partita può rimuovere un giocatore entrato per sbaglio.
• Pareggi gestiti: se si arriva a pari merito vincono tutti.

🎌 UNO STILE GIAPPONESE
• Interfaccia ispirata ai colori tradizionali: carta washi, vermiglione dei timbri hanko, onde seigaiha.
• Tema chiaro e scuro, suoni e animazioni fluide.
• Una pila di sushi animata che cresce a ogni pezzo.

📜 STORICO DELLE CENE
• Ogni partita viene salvata sul telefono con classifica, durata e ristorante.
• Riepilogo con partite giocate, pezzi mangiati e il tuo record.

📶 AFFIDABILE
• Riconnessione automatica se la rete del ristorante va e viene.
• Se chiudi l'app per sbaglio, riprendi la partita dalla Home.

🔒 SENZA ACCOUNT E SENZA PUBBLICITÀ
• Nessuna registrazione: basta un nickname.
• Niente pubblicità, niente tracciamento, niente analytics.
• I dati delle partite vengono cancellati dal server al massimo 30 giorni dopo la fine; lo storico resta solo sul tuo telefono.

Sushi Streak è open source: il codice è su GitHub (Stevatero/sushi-streak-game).

Mangia responsabilmente: la vera vittoria è una bella serata con gli amici. 🥢
```

## Note di rilascio (massimo 500 caratteri)

Prima pubblicazione:

```text
Prima versione su Google Play!
• Partite in tempo reale con gli amici tramite link o codice
• Pila di sushi animata, suoni e tema chiaro/scuro
• Podio finale, pareggi e storico delle cene
• Riconnessione automatica e ripresa della partita
```

## Categoria e contatti

| Campo                     | Valore proposto                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Tipo di app               | Gioco                                                                                   |
| Categoria                 | Casual (in alternativa, come app: Intrattenimento)                                      |
| Tag                       | Party, Multigiocatore, Cibo                                                             |
| Email di contatto         | `stevatero@gmail.com` (uguale a `PRIVACY_CONTACT` del backend)                          |
| Sito web                  | https://github.com/Stevatero/sushi-streak-game                                          |
| Informativa sulla privacy | https://sushi.dietalab.net/privacy                                                      |
| Annunci                   | No, l'app non contiene annunci                                                          |
| Sicurezza dei dati        | Vedi [DATA_SAFETY.md](../DATA_SAFETY.md)                                                |
| Classificazione contenuti | Questionario IARC: nessun contenuto sensibile (niente violenza, acquisti o chat libera) |
| Pubblico di destinazione  | 13 anni e oltre (l'app non è pensata per bambini)                                       |

## Grafica

| Elemento                         | File                                                                 | Requisito Play                    |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| Icona dell'app                   | [`play-store-icon-512.png`](play-store-icon-512.png)                 | 512×512, PNG a 32 bit             |
| Grafica in primo piano           | [`feature-graphic.png`](feature-graphic.png)                         | 1024×500, PNG/JPEG senza alfa     |
| Screenshot del telefono (min. 2) | [`screenshots/`](screenshots/) (tema chiaro e tema scuro, 1080×1920) | 9:16, lato lungo ≤ 2 × lato corto |

Icona e grafica in primo piano si rigenerano con `npm run icons` in `sushi-game-app` (sorgenti in `sushi-game-app/assets/source/`).

### Screenshot

Catturati dall'emulatore Android con la versione 1.6.0 (1080×1920, barra di stato in modalità demo). La Play Console ne accetta fino a 8 per il telefono: si consiglia di caricare i cinque in tema chiaro e tre in tema scuro (07, 09, 10).

| File                                                                                                              | Schermata                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`01-home-chiaro.png`](screenshots/01-home-chiaro.png)                                                            | Home: crea o partecipa a una partita                          |
| [`02-partita-chiaro.png`](screenshots/02-partita-chiaro.png)                                                      | Partita: punteggio, classifica in tempo reale e pila di sushi |
| [`03-ho-finito-chiaro.png`](screenshots/03-ho-finito-chiaro.png)                                                  | Conferma "Ho finito" con il riepilogo                         |
| [`04-podio-chiaro.png`](screenshots/04-podio-chiaro.png)                                                          | Podio finale con i petali di ciliegio                         |
| [`05-storico-chiaro.png`](screenshots/05-storico-chiaro.png)                                                      | Storico delle cene                                            |
| [`06-home-scuro.png`](screenshots/06-home-scuro.png) … [`10-storico-scuro.png`](screenshots/10-storico-scuro.png) | Le stesse schermate in tema scuro                             |
