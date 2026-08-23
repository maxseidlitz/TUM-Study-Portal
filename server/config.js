const path = require('path');

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes)$/i.test(String(value));
}

function csv(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function key(value, name) {
  if (!value) return null;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error(`${name} must be a base64 encoded 32-byte key`);
  return decoded;
}

function loadConfig(overrides = {}) {
  const env = process.env;
  const nodeEnv = overrides.nodeEnv || env.NODE_ENV || 'development';
  const publicOrigin = overrides.publicOrigin || env.PUBLIC_ORIGIN || 'https://localhost:3443';
  const config = {
    nodeEnv,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3443),
    publicOrigin,
    databasePath: overrides.databasePath || env.DATABASE_PATH || path.resolve('data/study-portal.sqlite'),
    buildDir: overrides.buildDir || env.BUILD_DIR || path.resolve('build'),
    backupDir: overrides.backupDir || env.BACKUP_DIR || path.resolve('data/backups'),
    passwordHash: overrides.passwordHash || env.APP_PASSWORD_HASH || '',
    bootstrapPassword: overrides.bootstrapPassword || env.APP_PASSWORD || '',
    sessionSecret: overrides.sessionSecret || env.SESSION_SECRET || '',
    csrfSecret: overrides.csrfSecret || env.CSRF_SECRET || '',
    sessionTtlMs: Number(env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
    secureCookies: overrides.secureCookies ?? bool(env.SECURE_COOKIES, true),
    trustProxy: bool(env.TRUST_PROXY),
    settingsEncryptionKey: overrides.settingsEncryptionKey
      || key(env.SETTINGS_ENCRYPTION_KEY, 'SETTINGS_ENCRYPTION_KEY'),
    backupKey: overrides.backupKey || key(env.BACKUP_KEY, 'BACKUP_KEY'),
    icalAllowedHosts: overrides.icalAllowedHosts || csv(env.ICAL_ALLOWED_HOSTS),
    mensaCanteenIds: overrides.mensaCanteenIds || csv(env.MENSA_CANTEEN_IDS, ['421', '422', '423', '530']),
    ollamaUrl: overrides.ollamaUrl || env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    ollamaModel: overrides.ollamaModel || env.OLLAMA_MODEL || 'qwen3:4b-instruct',
    geminiApiKey: overrides.geminiApiKey || env.GEMINI_API_KEY || '',
    maxJsonBytes: Number(env.MAX_JSON_BYTES || 1024 * 1024),
    maxImportBytes: Number(env.MAX_IMPORT_BYTES || 10 * 1024 * 1024),
    maxAiContextBytes: Number(env.MAX_AI_CONTEXT_BYTES || 64 * 1024),
    backupRetention: Number(env.BACKUP_RETENTION || 7),
    importRateLimit: Number(env.IMPORT_RATE_LIMIT || 3),
    maxSseConnections: Number(env.MAX_SSE_CONNECTIONS || 5),
    importQuotas: overrides.importQuotas || {
      exams: Number(env.IMPORT_MAX_EXAMS || 10000),
      lectures: Number(env.IMPORT_MAX_LECTURES || 50000),
      todos: Number(env.IMPORT_MAX_TODOS || 50000),
      moodleCourses: Number(env.IMPORT_MAX_MOODLE_COURSES || 10000),
      modules: Number(env.IMPORT_MAX_MODULES || 10000),
      studyLogs: Number(env.IMPORT_MAX_STUDY_LOGS || 100000),
      chats: Number(env.IMPORT_MAX_CHATS || 5000),
    },
  };

  if (!config.passwordHash && !config.bootstrapPassword) {
    throw new Error('APP_PASSWORD_HASH or APP_PASSWORD is required');
  }
  if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  if (config.csrfSecret.length < 32) throw new Error('CSRF_SECRET must contain at least 32 characters');
  if (!Buffer.isBuffer(config.settingsEncryptionKey) || config.settingsEncryptionKey.length !== 32) {
    throw new Error('SETTINGS_ENCRYPTION_KEY is required and must decode to 32 bytes');
  }
  if (!Buffer.isBuffer(config.backupKey) || config.backupKey.length !== 32) {
    throw new Error('BACKUP_KEY is required and must decode to 32 bytes');
  }
  if (!Number.isInteger(config.backupRetention) || config.backupRetention < 1) {
    throw new Error('BACKUP_RETENTION must be a positive integer');
  }
  if (!Number.isInteger(config.maxSseConnections) || config.maxSseConnections < 1) {
    throw new Error('MAX_SSE_CONNECTIONS must be a positive integer');
  }
  for (const [name, value] of Object.entries({
    MAX_JSON_BYTES: config.maxJsonBytes,
    MAX_IMPORT_BYTES: config.maxImportBytes,
    MAX_AI_CONTEXT_BYTES: config.maxAiContextBytes,
    IMPORT_RATE_LIMIT: config.importRateLimit,
    ...config.importQuotas,
  })) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
  const ollama = new URL(config.ollamaUrl);
  if (!['http:', 'https:'].includes(ollama.protocol) || ollama.username || ollama.password) {
    throw new Error('OLLAMA_BASE_URL must be an HTTP(S) URL without credentials');
  }
  const origin = new URL(config.publicOrigin);
  if (nodeEnv === 'production' && origin.protocol !== 'https:') {
    throw new Error('PUBLIC_ORIGIN must use HTTPS in production');
  }
  return config;
}

module.exports = { loadConfig };
