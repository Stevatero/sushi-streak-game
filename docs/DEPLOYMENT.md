# Deploy e operatività del backend

Il backend è un singolo processo Node.js (Express + Socket.IO + SQLite) gestito da PM2 dietro un reverse proxy nginx con HTTPS.

```
App Android/iOS ──HTTPS/WSS──▶ nginx (443, TLS) ──HTTP──▶ Node :3005 (solo localhost) ──▶ SQLite
```

> Lo stato delle partite attive è anche in memoria: eseguire **una sola istanza** del processo.
> Dopo un riavvio le partite vengono ricaricate automaticamente dal database.

## Requisiti

- Node.js ≥ 20.17 (consigliato 22 LTS), npm
- PM2 (`npm install -g pm2`)
- nginx + certificato TLS (es. Let's Encrypt / certbot)

## Installazione / aggiornamento

```bash
cd /percorso/sushi-streak-game
git pull
cd sushi-game-backend
npm ci --omit=dev
npm run backup            # backup prima dell'aggiornamento
npm run prod              # prima installazione  (pm2 start ecosystem.config.js --env production)
npm run restart           # aggiornamenti successivi
pm2 save
```

Le migrazioni del database vengono applicate automaticamente all'avvio (es. la 1.3.0 aggiunge la colonna `sessions.host_id`; per le partite già esistenti l'host è il primo giocatore entrato). Aggiorna il backend **prima** di distribuire una nuova versione dell'app che ne usa le funzioni: l'app 1.3.0 funziona anche con il backend 1.2.0, ma la rimozione dei giocatori richiede il backend 1.3.0. Il backend 1.4.0 non cambia il protocollo né il database: aggiunge il supporto agli Universal Links iOS e ai link all'App Store nella pagina di invito.

### Variabili d'ambiente

Vedi [`sushi-game-backend/.env.example`](../sushi-game-backend/.env.example). In produzione impostare almeno:

- `PRIVACY_CONTACT`: email o URL mostrati nella pagina `/privacy`
- `ANDROID_CERT_SHA256`: impronta del certificato di firma Play, per gli App Links
- `APP_STORE_URL` (facoltativa): pagina di download usata dalla pagina di invito se l'app non è installata (default: scheda Google Play)
- `APPLE_TEAM_ID` (per iOS): Team ID Apple, abilita `/.well-known/apple-app-site-association` per gli Universal Links
- `IOS_APP_STORE_URL` (facoltativa, dopo la pubblicazione su App Store): link di download su iPhone e Smart App Banner nella pagina di invito
- `DB_PATH`: percorso del database fuori dalla cartella del codice (es. `/var/lib/sushi-streak/sushi_game.db`)

Le variabili possono essere aggiunte nella sezione `env_production` di `ecosystem.config.js` **sul server** (senza committare valori sensibili) o esportate nell'ambiente del processo PM2.

## nginx

```nginx
server {
    listen 443 ssl http2;
    server_name sushi.dietalab.net;

    ssl_certificate     /etc/letsencrypt/live/sushi.dietalab.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sushi.dietalab.net/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 75s;
    }
}

server {
    listen 80;
    server_name sushi.dietalab.net;
    return 301 https://$host$request_uri;
}
```

Assicurarsi che la porta 3005 **non** sia raggiungibile dall'esterno (firewall), in modo che tutto il traffico passi da HTTPS.

## Monitoraggio

- **Health check**: `GET https://sushi.dietalab.net/api/health` → `200` con `database: "ok"`, `503` se il database non risponde. Collegarlo a un servizio di uptime monitoring (es. UptimeRobot, Better Stack) con avviso via email.
- **Log**: righe JSON su stdout/stderr (`pm2 logs sushi-streak-backend`); livello con `LOG_LEVEL`. Consigliata la rotazione con `pm2 install pm2-logrotate`.

## Backup e ripristino

Il database contiene solo i dati delle partite (conservati al massimo 30 giorni dopo la chiusura). Backup consigliato giornaliero:

```bash
# crontab -e  (ogni notte alle 04:00, conserva 14 copie)
0 4 * * * cd /percorso/sushi-streak-game/sushi-game-backend && BACKUP_DIR=/var/backups/sushi-streak npm run backup >> /var/log/sushi-backup.log 2>&1
```

Lo script usa `VACUUM INTO`, quindi produce una copia consistente anche con il server in esecuzione. Conservare una copia dei backup fuori dal server (es. storage esterno).

**Ripristino**

```bash
pm2 stop sushi-streak-backend
cp /var/backups/sushi-streak/sushi_game-<data>.db "$DB_PATH"
rm -f "$DB_PATH-wal" "$DB_PATH-shm"
pm2 start sushi-streak-backend
curl -s https://sushi.dietalab.net/api/health
```

In caso di perdita totale del server basta reinstallare il backend: le partite in corso andrebbero perse, ma lo storico degli utenti resta sui loro dispositivi.
