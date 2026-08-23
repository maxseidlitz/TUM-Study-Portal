const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const pino = require('pino');
const { ZodError } = require('zod');
const { StudyDatabase } = require('./db/database');
const { SecurityService } = require('./services/security');
const { BackupService, DomainService, HttpError } = require('./services/domain');
const { AiService, OllamaSetupService, requestJson } = require('./services/ai');
const { safeFetchText } = require('./services/safeFetch');
const { schemas } = require('./validation');
const { parseIcal, eventsToCalendarItems } = require('../public/ical');

function html(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function loginPage(token, error = '') {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TUM Study Portal – Anmeldung</title></head><body><main>
<h1>TUM Study Portal</h1>${error ? `<p role="alert">${html(error)}</p>` : ''}
<form method="post" action="/login"><input type="hidden" name="_csrf" value="${html(token)}">
<label>Passwort <input name="password" type="password" autocomplete="current-password" required autofocus></label>
<button type="submit">Anmelden</button></form></main></body></html>`;
}

function command(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
      if (!res.headersSent) res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}

function result(handler) {
  return async (req, res) => {
    try {
      const value = await handler(req, res);
      if (!res.headersSent) res.json({ success: true, ...value });
    } catch (error) {
      res.status(200).json({ success: false, error: error.message || 'Request failed' });
    }
  };
}

async function createApp({ config, db: suppliedDb, logger: suppliedLogger } = {}) {
  if (!config) throw new Error('config is required');
  const logger = suppliedLogger || pino({ level: process.env.LOG_LEVEL || 'info' });
  const db = suppliedDb || new StudyDatabase(config.databasePath);
  const security = await SecurityService.create(db, config);
  const domain = new DomainService(db, security, config);
  const backup = new BackupService(db, config, security);
  const ai = new AiService(domain, config);
  const ollama = new OllamaSetupService(ai, config);
  const app = express();
  app.locals.services = { ai, backup, db, domain, ollama, security };

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use((req, res, next) => {
    res.set('Cache-Control', req.path.startsWith('/static/') ? 'public, max-age=31536000, immutable' : 'no-store');
    next();
  });
  app.use(express.json({ limit: config.maxImportBytes }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (_req, res) => {
    try {
      res.status(db.ready() ? 200 : 503).json({ status: db.ready() ? 'ready' : 'not-ready' });
    } catch {
      res.status(503).json({ status: 'not-ready' });
    }
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  });
  app.get('/login', (req, res) => {
    if (security.session(req, { touch: false })) return res.redirect('/');
    const challenge = security.loginChallenge();
    res.set('Set-Cookie', challenge.cookie).type('html').send(loginPage(challenge.token));
  });
  app.post('/login', loginLimiter, async (req, res) => {
    if (!security.verifyOrigin(req) || !security.verifyLoginChallenge(req, req.body._csrf)) {
      const challenge = security.loginChallenge();
      return res.status(403).set('Set-Cookie', challenge.cookie).type('html')
        .send(loginPage(challenge.token, 'Ungültige oder abgelaufene Anfrage.'));
    }
    if (!await security.verifyPassword(req.body.password)) {
      const challenge = security.loginChallenge();
      return res.status(401).set('Set-Cookie', challenge.cookie).type('html')
        .send(loginPage(challenge.token, 'Anmeldung fehlgeschlagen.'));
    }
    const session = security.createSession();
    return res.set('Set-Cookie', [
      session.cookie,
      security.cookie(security.loginCookie, '', { maxAge: 0 }),
    ]).redirect('/');
  });
  app.post('/logout', security.requireAuth(), security.requireCsrf(), (req, res) => {
    res.set('Set-Cookie', security.destroySession(req)).redirect('/login');
  });

  const api = express.Router();
  api.use(security.requireAuth());
  api.use((req, res, next) => {
    if (req.path === '/backup/import') return next();
    const size = Buffer.byteLength(JSON.stringify(req.body ?? null));
    if (size > config.maxJsonBytes) {
      return res.status(413).json({ error: 'Request body exceeds the size limit', code: 'BODY_TOO_LARGE' });
    }
    return next();
  });
  api.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    return security.requireCsrf()(req, res, next);
  });
  const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

  for (const type of ['exams', 'todos', 'moodle']) {
    api.get(`/${type}`, (req, res) => res.json(domain.list(type)));
    api.post(`/${type}`, command((req) => domain.write(type, req.body, 'insert')));
    api.put(`/${type}/:id`, command((req) => {
      if (req.body?.id !== req.params.id) throw new HttpError(422, 'Path and body IDs must match');
      domain.write(type, req.body, 'update');
    }));
    api.delete(`/${type}/:id`, command((req) => domain.remove(type, req.params.id)));
  }

  api.get('/modules', (_req, res) => res.json(domain.modules()));
  api.post('/modules', command((req) => domain.saveModule(req.body, 'insert')));
  api.put('/modules/:id', command((req) => {
    if (req.body?.id !== req.params.id) throw new HttpError(422, 'Path and body IDs must match');
    domain.saveModule(req.body, 'update');
  }));
  api.delete('/modules/:id', command((req) => {
    if (!db.deleteModule(req.params.id)) throw new HttpError(404, 'Module not found');
  }));

  api.get('/lectures', (_req, res) => res.json(domain.lectures()));
  api.post('/lectures', command((req) => domain.createLecture(req.body)));
  api.put('/lectures/:id', command((req) => {
    if (req.body?.id !== req.params.id) throw new HttpError(422, 'Path and body IDs must match');
    domain.updateLecture(req.body);
  }));
  api.delete('/lectures/:id', command((req) => domain.deleteLecture(req.params.id)));

  api.get('/study-logs', (req, res) => {
    if (Boolean(req.query.examId) === Boolean(req.query.todoId)) {
      throw new HttpError(422, 'Exactly one of examId or todoId is required');
    }
    res.json(db.listStudyLogs(req.query.examId ? 'exam' : 'todo', req.query.examId || req.query.todoId));
  });
  api.post('/study-logs', command((req) => db.createStudyLog(schemas.studyLog.parse(req.body))));
  api.delete('/study-logs/:id', command((req) => {
    if (!db.deleteEntity('study_logs', req.params.id)) throw new HttpError(404, 'Study log not found');
  }));

  api.get('/settings', (_req, res) => res.json(domain.publicSettings()));
  api.patch('/settings', command((req, res) => res.json(domain.patchSettings(req.body))));

  api.get('/chats', (_req, res) => res.json(db.listChats()));
  api.get('/chats/:id', (req, res) => res.json(db.getChat(req.params.id)));
  api.put('/chats/:id', command((req) => {
    if (req.body?.id !== req.params.id) throw new HttpError(422, 'Path and body IDs must match');
    db.saveChat(schemas.chat.parse(req.body));
  }));
  api.delete('/chats/:id', command((req) => {
    if (!db.deleteEntity('chat_sessions', req.params.id)) throw new HttpError(404, 'Chat not found');
    const settings = db.settings();
    if (settings.lastActiveChatId === req.params.id) db.patchSettings({ lastActiveChatId: '' });
  }));

  api.post('/ical/fetch', result(async (req) => {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    const text = await safeFetchText(url, { allowedHosts: config.icalAllowedHosts });
    const events = parseIcal(text);
    return { items: eventsToCalendarItems(events), eventCount: events.length };
  }));

  api.get('/mensa/:canteenId', result(async (req) => {
    if (!config.mensaCanteenIds.includes(req.params.canteenId)) throw new Error('Canteen is not allowlisted');
    const date = new Date().toISOString().slice(0, 10);
    const meals = await requestJson(
      `https://openmensa.org/api/v2/canteens/${encodeURIComponent(req.params.canteenId)}/days/${date}/meals`,
      { timeoutMs: 10000, maxBytes: 2 * 1024 * 1024 },
    );
    if (!Array.isArray(meals)) throw new Error('OpenMensa returned an invalid response');
    return { meals };
  }));

  api.post('/ai/models', aiLimiter, result(async (req) => ({ models: await ai.models(req.body || {}) })));
  api.post('/ai/recommend', aiLimiter, result(async (req) => ai.recommend(req.body || {})));
  api.post('/ai/chat', aiLimiter, result(async (req) => ai.chat(schemas.aiChat.parse(req.body))));

  api.get('/ollama/setup', (_req, res) => res.json(ollama.state));
  api.post('/ollama/setup/retry', aiLimiter, command(async (_req, res) => res.json(await ollama.retry())));
  api.get('/ollama/setup/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const send = (state) => res.write(`data: ${JSON.stringify(state)}\n\n`);
    send(ollama.state);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
    ollama.on('state', send);
    req.on('close', () => {
      clearInterval(heartbeat);
      ollama.off('state', send);
    });
  });

  api.get('/backup/export', result(async () => ({ data: backup.exportJson() })));
  api.post('/backup/import', result(async (req) => ({
    warnings: await backup.importJson(req.body?.data),
  })));

  app.use('/api/v1', api);
  app.use('/static', express.static(path.join(config.buildDir, 'static'), { index: false, immutable: true, maxAge: '1y' }));
  for (const asset of ['manifest.json', 'favicon.ico', 'asset-manifest.json', 'logo192.png', 'logo512.png']) {
    app.get(`/${asset}`, (req, res, next) => {
      const target = path.join(config.buildDir, asset);
      if (!fs.existsSync(target)) return next();
      return res.sendFile(target);
    });
  }
  app.get('*path', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const session = security.session(req);
    if (!session) return res.redirect('/login');
    const indexPath = path.join(config.buildDir, 'index.html');
    if (!fs.existsSync(indexPath)) return res.status(503).type('text').send('Frontend build is unavailable');
    const source = fs.readFileSync(indexPath, 'utf8');
    const meta = `<meta name="csrf-token" content="${session.csrf}">`;
    return res.type('html').send(source.replace(/<head([^>]*)>/i, `<head$1>${meta}`));
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));
  app.use((error, req, res, _next) => {
    const isValidation = error instanceof ZodError;
    const status = error.status || (isValidation ? 422 : error.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 500);
    if (status >= 500) logger.error({ err: error, method: req.method, path: req.path }, 'request failed');
    res.status(status).json({
      error: isValidation ? 'Request validation failed' : error.message || 'Internal server error',
      code: error.code || (isValidation ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR'),
      ...(isValidation ? { details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
