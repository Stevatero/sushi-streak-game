// Informativa sulla privacy servita su /privacy (URL da indicare nella scheda Google Play).
// Il contenuto descrive esclusivamente i dati trattati dall'app e da questo backend:
// aggiornarlo a ogni modifica che introduca nuovi dati, servizi di terze parti o SDK.

const { escapeHtml } = require('./joinPage');

const LAST_UPDATED = '29 settembre 2026';

function renderPrivacyPage({ contact, retentionDays, inactivityMinutes, nonce = '' }) {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const contactHtml = isEmail
    ? `<a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>`
    : `<a href="${escapeHtml(contact)}" rel="noopener">${escapeHtml(contact)}</a>`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sushi Streak - Informativa sulla privacy</title>
  <style nonce="${escapeHtml(nonce)}">
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;
      color: #222; max-width: 760px; margin: 0 auto; padding: 24px 20px 64px; }
    h1 { color: #3E2843; }
    h2 { color: #3E2843; margin-top: 32px; font-size: 1.2rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f5f2f6; }
    .muted { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>🍣 Sushi Streak — Informativa sulla privacy</h1>
  <p class="muted">Ultimo aggiornamento: ${LAST_UPDATED}</p>

  <p>Sushi Streak è un'app per contare, insieme agli amici, i pezzi di sushi mangiati durante una cena.
  Questa informativa spiega quali dati vengono trattati, perché e per quanto tempo.</p>

  <h2>Titolare e contatti</h2>
  <p>Il servizio è sviluppato e gestito da Dario Stevanato. Per domande o richieste relative ai dati personali:
  ${contactHtml}.</p>

  <h2>Cosa non facciamo</h2>
  <ul>
    <li>Non è richiesta alcuna registrazione: non esistono account, email o password.</li>
    <li>Non usiamo pubblicità, strumenti di analisi statistica, profilazione o tracciamento tra app.</li>
    <li>Non raccogliamo posizione, contatti, foto, microfono o identificativi pubblicitari del dispositivo.</li>
    <li>Non vendiamo né cediamo dati a terzi.</li>
  </ul>

  <h2>Dati trattati dal server</h2>
  <table>
    <tr><th>Dato</th><th>Finalità</th><th>Conservazione</th></tr>
    <tr>
      <td>Nome (nickname) scelto per la partita</td>
      <td>Mostrarlo in classifica agli altri partecipanti</td>
      <td rowspan="3">Per tutta la durata della partita; la partita si chiude quando tutti hanno finito o dopo
        ${Number(inactivityMinutes)} minuti di inattività. I dati delle partite chiuse vengono cancellati
        automaticamente dopo ${Number(retentionDays)} giorni. Se chi ha creato la partita ti rimuove, i tuoi dati
        di quella partita vengono cancellati subito: resta solo il nickname, per impedire di rientrare nella
        stessa partita con quel nome, e viene cancellato insieme alla partita.</td>
    </tr>
    <tr><td>Codice/nome della sessione, punteggio (pezzi), stato "ho finito"</td><td>Funzionamento del gioco e della classifica in tempo reale</td></tr>
    <tr><td>Identificativo casuale del giocatore e token segreto (salvato come impronta crittografica)</td><td>Permettere la riconnessione alla partita e impedire che altri modifichino il tuo punteggio</td></tr>
    <tr>
      <td>Indirizzo IP e dati tecnici della connessione</td>
      <td>Trasmissione dei dati, sicurezza e prevenzione degli abusi (limitazione delle richieste)</td>
      <td>Trattati per il tempo necessario alla connessione; possono comparire nei log tecnici del server per
        finalità di sicurezza e manutenzione.</td>
    </tr>
  </table>

  <h2>Chi può vedere i dati di una partita</h2>
  <p>Nome e punteggio sono visibili agli altri partecipanti della stessa partita e a chiunque conosca il codice
  della sessione tramite la pagina di invito (<code>/join/CODICE</code>). Scegli quindi un nickname che non ti
  identifichi se preferisci restare anonimo.</p>

  <h2>Dati salvati solo sul tuo dispositivo</h2>
  <p>L'app salva localmente, senza inviarli al server: il nome usato nell'ultima partita, lo storico delle
  partite (nomi dei partecipanti, punteggi, eventuale ristorante indicato da te), le preferenze di tema e audio
  e le credenziali per riconnetterti alla partita in corso (il token segreto è conservato nell'archivio sicuro
  del sistema: Android Keystore o Portachiavi di iOS). Questi dati sono esclusi dal backup automatico
  (Android e iCloud) e puoi cancellarli in qualsiasi momento da <em>Impostazioni → Cancella dati locali</em> o
  disinstallando l'app.</p>

  <h2>Sicurezza</h2>
  <p>Le comunicazioni tra app e server avvengono tramite connessione cifrata (HTTPS/WSS).</p>

  <h2>Base giuridica</h2>
  <p>I dati sono trattati per fornire il servizio richiesto dall'utente (esecuzione del servizio) e, per i dati
  tecnici di connessione, per il legittimo interesse alla sicurezza del servizio.</p>

  <h2>I tuoi diritti</h2>
  <p>Puoi chiedere accesso, rettifica o cancellazione dei dati di una partita, o opporti al trattamento,
  scrivendo al contatto indicato sopra e indicando il codice della sessione e il nickname usato. Hai inoltre
  il diritto di proporre reclamo all'autorità di controllo competente (in Italia, il Garante per la protezione
  dei dati personali).</p>

  <h2>Modifiche</h2>
  <p>Eventuali modifiche a questa informativa saranno pubblicate su questa pagina con la data di aggiornamento.</p>
</body>
</html>`;
}

module.exports = { renderPrivacyPage };
