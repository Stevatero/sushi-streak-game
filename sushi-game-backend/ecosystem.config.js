// Configurazione PM2. Uso: npm run prod
// Le altre variabili (PRIVACY_CONTACT, ANDROID_CERT_SHA256, APPLE_TEAM_ID…) vanno in .env, non qui:
// questo file è versionato e una modifica sul server bloccherebbe git pull (vedi docs/DEPLOYMENT.md).
module.exports = {
  apps: [
    {
      name: 'sushi-streak-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1, // lo stato delle sessioni è in memoria: una sola istanza
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      kill_timeout: 6000,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005, // porta locale dietro nginx
        HOST: '127.0.0.1', // non raggiungibile dall'esterno
        LOG_LEVEL: 'info',
      },
    },
  ],
};
