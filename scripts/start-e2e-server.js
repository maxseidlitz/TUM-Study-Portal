const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tum-study-portal-e2e-'));
const key = Buffer.alloc(32, 7).toString('base64');

Object.assign(process.env, {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '4173',
  PUBLIC_ORIGIN: 'http://127.0.0.1:4173',
  SECURE_COOKIES: 'false',
  DATABASE_PATH: path.join(runtimeDir, 'study-portal.sqlite'),
  BACKUP_DIR: path.join(runtimeDir, 'backups'),
  BUILD_DIR: path.resolve('build'),
  APP_PASSWORD: 'playwright-password',
  SESSION_SECRET: 'playwright-session-secret-32-characters',
  CSRF_SECRET: 'playwright-csrf-secret-32-characters',
  SETTINGS_ENCRYPTION_KEY: key,
  BACKUP_KEY: key,
  OLLAMA_BASE_URL: 'http://127.0.0.1:9',
  ICAL_ALLOWED_HOSTS: 'calendar.invalid',
  LOG_LEVEL: 'fatal',
});

process.on('exit', () => {
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

require('../server/server');
