// Template HTML delle pagine web di invito. Tutti i valori dinamici passano da escapeHtml.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Serializza un valore per inserirlo in modo sicuro dentro un tag <script>
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp('[\u2028\u2029]', 'g'), (c) => '\\u' + c.charCodeAt(0).toString(16));
}

// Stessa palette dell'app: carta washi, inchiostro sumi, vermiglione shu (timbro hanko)
const baseStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --washi: #F7F2EA; --kinari: #FFFCF7; --sumi: #1D1A17; --muted: #6B625A; --shu: #C94330;
    --line: #E6DDD0; --soft: #EFE7DB; }
  @media (prefers-color-scheme: dark) {
    :root { --washi: #16111B; --kinari: #211A27; --sumi: #F2ECE6; --muted: #BDB2BF; --shu: #FF8A73;
      --line: #362E3D; --soft: #2C2433; }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: var(--washi); color: var(--sumi);
    background-image: radial-gradient(circle at 50% 100%, transparent 58%, var(--line) 59%, var(--line) 62%,
      transparent 63%, transparent 76%, var(--line) 77%, var(--line) 80%, transparent 81%);
    background-size: 44px 22px;
    min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .container {
    background: var(--kinari); border: 1px solid var(--line); border-radius: 24px; padding: 36px 32px;
    max-width: 480px; width: 100%; box-shadow: 0 16px 40px rgba(59, 42, 30, 0.08); text-align: center;
  }
  .icon {
    display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px;
    margin-bottom: 20px; border-radius: 18px; background: var(--shu); color: #fff; font-size: 1.5rem;
    font-weight: 700; transform: rotate(-5deg); box-shadow: inset 0 0 0 5px var(--shu), inset 0 0 0 6.5px rgba(255,255,255,0.55);
  }
  h1 { margin-bottom: 8px; font-size: 2rem; letter-spacing: -0.02em; }
  p { color: var(--muted); }
  .btn {
    display: inline-block; padding: 15px 28px; margin: 8px; border: 1.5px solid var(--shu); border-radius: 16px;
    font-size: 1rem; font-weight: 600; text-decoration: none; cursor: pointer; transition: transform 0.15s ease;
    background: var(--shu); color: #fff;
  }
  .btn-secondary { background: transparent; color: var(--sumi); border-color: var(--line); }
  .btn:active { transform: scale(0.97); }
  @media (max-width: 600px) {
    .container { padding: 28px 20px; }
    .btn { display: block; width: 100%; margin: 10px 0; }
  }
`;

function renderJoinPage(info, nonce = '') {
  const players = [...info.players].sort((a, b) => b.score - a.score);
  const playersHtml = players.length
    ? `<div class="players-list">
        <h3>Giocatori:</h3>
        ${players
          .map(
            (p) => `<div class="player-item">
              <span>${escapeHtml(p.name)}</span>
              <span>${Number(p.score) || 0} 🍣 ${p.finished ? '✅' : ''}</span>
            </div>`
          )
          .join('')}
      </div>`
    : '';

  const deepLink = `sushi-streak://join/${encodeURIComponent(info.sessionId)}`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sushi Streak - Unisciti alla sessione</title>
  <style nonce="${escapeHtml(nonce)}">
    ${baseStyles}
    .session-info { background: var(--soft); border-radius: 18px; padding: 22px; margin: 24px 0; }
    .session-name { font-size: 1.5rem; font-weight: 700; color: var(--sumi); margin-bottom: 10px; word-break: break-word; }
    .session-details { display: flex; justify-content: space-around; margin: 18px 0 8px; }
    .detail-value { font-size: 1.5rem; font-weight: 800; color: var(--sumi); letter-spacing: 0.08em; }
    .detail-label { font-size: 0.75rem; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.12em; }
    .status { display: inline-block; padding: 6px 14px; border-radius: 999px; font-weight: 600; font-size: 0.9rem; margin: 6px 0; }
    .status.active { background: #E2EBCF; color: #1F2B0C; }
    .status.inactive { background: #F9DEDC; color: #410E0B; }
    .players-list { margin: 18px 0 0; text-align: left; }
    .players-list h3 { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px; }
    .player-item {
      display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; margin: 6px 0;
      background: var(--kinari); border-radius: 12px; border: 1px solid var(--line); word-break: break-word;
    }
    @media (max-width: 600px) { .session-details { flex-direction: column; gap: 15px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon" aria-hidden="true">寿司</div>
    <h1>Sushi Streak</h1>
    <p>Sei stato invitato a una sfida di sushi!</p>

    <div class="session-info">
      <div class="session-name">${escapeHtml(info.sessionName)}</div>
      <div class="status ${info.isActive ? 'active' : 'inactive'}">
        ${info.isActive ? '🟢 Sessione attiva' : '🔴 Sessione terminata'}
      </div>
      <div class="session-details">
        <div>
          <div class="detail-value">${Number(info.playersCount) || 0}</div>
          <div class="detail-label">Giocatori</div>
        </div>
        <div>
          <div class="detail-value">${escapeHtml(info.sessionId)}</div>
          <div class="detail-label">Codice sessione</div>
        </div>
      </div>
      ${playersHtml}
    </div>

    <div>
      ${info.isActive ? `<a href="${escapeHtml(deepLink)}" class="btn">📱 Apri nell'app</a>` : ''}
      <button id="copy-btn" class="btn btn-secondary" type="button">📋 Copia codice</button>
    </div>
  </div>

  <script nonce="${escapeHtml(nonce)}">
    (function () {
      var sessionId = ${jsonForScript(info.sessionId)};
      var deepLink = ${jsonForScript(deepLink)};
      var isActive = ${info.isActive ? 'true' : 'false'};

      function fallbackCopy() {
        var textArea = document.createElement('textarea');
        textArea.value = sessionId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Codice sessione copiato negli appunti!');
      }

      document.getElementById('copy-btn').addEventListener('click', function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(sessionId).then(function () {
            alert('Codice sessione copiato negli appunti!');
          }).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      });

      // Prova ad aprire l'app automaticamente su mobile
      if (isActive && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setTimeout(function () { window.location.href = deepLink; }, 1000);
      }
    })();
  </script>
</body>
</html>`;
}

function renderNotFoundPage(nonce = '') {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sushi Streak - Sessione non trovata</title>
  <style nonce="${escapeHtml(nonce)}">${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Sessione non trovata</h1>
    <p>La sessione richiesta non esiste o è scaduta.</p>
  </div>
</body>
</html>`;
}

module.exports = { escapeHtml, jsonForScript, renderJoinPage, renderNotFoundPage };
