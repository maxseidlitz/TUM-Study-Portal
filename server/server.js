const fs = require('fs');
const http = require('http');
const https = require('https');
const pino = require('pino');
const { createApp } = require('./app');
const { loadConfig } = require('./config');

async function main() {
  const config = loadConfig();
  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  if (!config.passwordHash) {
    logger.warn('APP_PASSWORD bootstrap mode is active; configure APP_PASSWORD_HASH for normal operation');
  }
  const app = await createApp({ config, logger });
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;
  if (Boolean(certPath) !== Boolean(keyPath)) throw new Error('TLS_CERT_PATH and TLS_KEY_PATH must be configured together');
  const server = certPath
    ? https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app)
    : http.createServer(app);
  server.listen(config.port, config.host, () => {
    logger.info({
      host: config.host,
      port: config.port,
      tls: Boolean(certPath),
      origin: config.publicOrigin,
    }, 'study portal backend listening');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      app.locals.services.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  // Do not print configuration values; only the validation message.
  process.stderr.write(`Backend startup failed: ${error.message}\n`);
  process.exit(1);
});
