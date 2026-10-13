// Chiamate al backend locale dai test Maestro (motore JavaScript di Maestro, non Node.js).
// Variabili: BACKEND_URL, ACTION (create | join | info), SESSION, NAME.
// Con "info" il risultato è in output.session: status, players (in ordine di ingresso), allFinished.

const headers = { 'Content-Type': 'application/json', 'X-App-Version': '1.8.0' };

function call(method, path, body) {
  const url = BACKEND_URL + path;
  const response =
    method === 'GET'
      ? http.get(url, { headers: headers })
      : http.post(url, { headers: headers, body: JSON.stringify(body) });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(method + ' ' + path + ': ' + response.status + ' ' + response.body);
  }
  return json(response.body);
}

if (ACTION === 'create') {
  call('POST', '/api/sessions', { sessionName: SESSION, playerName: NAME });
} else if (ACTION === 'join') {
  call('POST', '/api/sessions/join', { sessionId: SESSION, playerName: NAME });
} else if (ACTION === 'info') {
  const info = call('GET', '/api/sessions/' + SESSION + '/info');
  output.session = {
    status: info.status,
    players: info.players,
    firstScore: info.players.length > 0 ? info.players[0].score : -1,
    allFinished: info.players.every(function (p) {
      return p.finished;
    }),
  };
} else {
  throw new Error('Azione sconosciuta: ' + ACTION);
}
