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

const LOGIN_MESSAGES = {
  de: {
    title: 'Anmeldung', password: 'Passwort', submit: 'Anmelden',
    invalid: 'Ungültige oder abgelaufene Anfrage.', failed: 'Anmeldung fehlgeschlagen.',
  },
  en: {
    title: 'Sign in', password: 'Password', submit: 'Sign in',
    invalid: 'Invalid or expired request.', failed: 'Sign-in failed.',
  },
  tr: {
    title: 'Giriş', password: 'Parola', submit: 'Giriş yap',
    invalid: 'Geçersiz veya süresi dolmuş istek.', failed: 'Giriş başarısız.',
  },
};

function selectLocale(acceptLanguage = '') {
  const supported = new Set(Object.keys(LOGIN_MESSAGES));
  const candidates = String(acceptLanguage).split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(';');
    const qParameter = parameters.find(parameter => parameter.trim().toLowerCase().startsWith('q='));
    const parsedQuality = qParameter ? Number(qParameter.trim().slice(2)) : 1;
    return {
      locale: tag.toLowerCase().split('-')[0],
      quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
      index,
    };
  }).filter(candidate => candidate.quality > 0 && supported.has(candidate.locale));
  candidates.sort((a, b) => b.quality - a.quality || a.index - b.index);
  return candidates[0]?.locale || 'de';
}

function loginPage(token, locale = 'de', errorKey = '') {
  const selectedLocale = LOGIN_MESSAGES[locale] ? locale : 'de';
  const messages = LOGIN_MESSAGES[selectedLocale];
  const error = errorKey ? messages[errorKey] : '';
  return `<!doctype html><html lang="${html(selectedLocale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${html(`TUM Study Portal – ${messages.title}`)}</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#f3f6fa;--card:#fff;--text:#172033;--muted:#5f6b7a;--border:#d8dee8;--input:#fff;--accent:#3070b3;--accent-hover:#245b91;--button-text:#fff;--alert-bg:#fff0f0;--alert-text:#b42318;--alert-border:#f1aeb5}
*{box-sizing:border-box}
body{min-height:100vh;min-height:100dvh;margin:0;background:var(--bg);color:var(--text)}
main{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.login-card{width:min(100%,28rem);padding:28px 24px;border:1px solid var(--border);border-radius:18px;background:var(--card);box-shadow:0 16px 40px rgba(20,40,70,.12)}
.brand{text-align:center;margin-bottom:24px}
.brand img{display:block;width:64px;height:64px;margin:0 auto 14px;border-radius:14px}
h1{margin:0;font-size:1.45rem;line-height:1.25}
.subtitle{margin:6px 0 0;color:var(--muted);font-size:.95rem}
.alert{margin:0 0 18px;padding:12px 14px;border:1px solid var(--alert-border);border-radius:10px;background:var(--alert-bg);color:var(--alert-text);font-size:.9rem;line-height:1.4}
label{display:block;margin-bottom:8px;color:var(--muted);font-size:.9rem;font-weight:600}
input,button{width:100%;min-height:44px;border-radius:10px;font:inherit}
input{padding:10px 12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:16px}
button{margin-top:16px;padding:10px 16px;border:1px solid var(--accent);background:var(--accent);color:var(--button-text);font-weight:700;cursor:pointer}
button:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
input:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(prefers-color-scheme:dark){:root{--bg:#0f1117;--card:#1a1d27;--text:#f2f4f8;--muted:#aeb6c5;--border:#343a4a;--input:#11141c;--accent:#5aa2e8;--accent-hover:#78b5ef;--button-text:#071525;--alert-bg:#35191d;--alert-text:#ffb4b8;--alert-border:#7d3038}.login-card{box-shadow:0 18px 44px rgba(0,0,0,.35)}}
</style></head><body><main><section class="login-card" aria-labelledby="login-title">
<div class="brand"><img src="/icons/apple-touch-icon.png" alt="TUM Study Portal"><h1 id="login-title">TUM Study Portal</h1><p class="subtitle">${html(messages.title)}</p></div>
${error ? `<p class="alert" role="alert">${html(error)}</p>` : ''}
<form method="post" action="/login"><input type="hidden" name="_csrf" value="${html(token)}">
<label for="password">${html(messages.password)}</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">${html(messages.submit)}</button></form></section></main></body></html>`;
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
      const message = error instanceof ZodError
        ? 'Request validation failed'
        : (error instanceof HttpError || error.safe)
          ? error.message
          : 'External service request failed';
      const status = error instanceof ZodError || (error instanceof HttpError && error.status === 422)
        ? 422 : 200;
      res.status(status).json({ success: false, error: message });
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
  let activeSseConnections = 0;
  const app = express();
  app.locals.services = { ai, backup, db, domain, ollama, security };

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    referrerPolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    strictTransportSecurity: config.secureCookies ? undefined : false,
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
    const locale = selectLocale(req.get('accept-language'));
    const challenge = security.loginChallenge();
    res.vary('Accept-Language').set('Set-Cookie', challenge.cookie).type('html')
      .send(loginPage(challenge.token, locale));
  });
  app.post('/login', loginLimiter, async (req, res) => {
    const locale = selectLocale(req.get('accept-language'));
    res.vary('Accept-Language');
    if (!security.verifyOrigin(req) || !security.verifyLoginChallenge(req, req.body._csrf)) {
      const challenge = security.loginChallenge();
      return res.status(403).set('Set-Cookie', challenge.cookie).type('html')
        .send(loginPage(challenge.token, locale, 'invalid'));
    }
    if (!await security.verifyPassword(req.body.password)) {
      const challenge = security.loginChallenge();
      return res.status(401).set('Set-Cookie', challenge.cookie).type('html')
        .send(loginPage(challenge.token, locale, 'failed'));
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
  const importLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.importRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
      success: false,
      error: 'Backup import rate limit exceeded',
    }),
  });

  api.post('/auth/logout', command((req, res) => {
    res.set('Set-Cookie', security.destroySession(req)).json({ success: true });
  }));

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
    const { url } = schemas.icalFetch.parse(req.body);
    const text = await safeFetchText(url, { allowedHosts: config.icalAllowedHosts });
    const events = parseIcal(text);
    return { items: eventsToCalendarItems(events), eventCount: events.length };
  }));
  api.post('/ical/replace', result(async (req) => domain.replaceIcal(req.body?.items)));

  api.get('/mensa/:canteenId', result(async (req) => {
    if (!config.mensaCanteenIds.includes(req.params.canteenId)) {
      throw new HttpError(422, 'Canteen is not allowlisted');
    }
    const date = new Date().toISOString().slice(0, 10);
    const meals = await requestJson(
      `https://openmensa.org/api/v2/canteens/${encodeURIComponent(req.params.canteenId)}/days/${date}/meals`,
      { timeoutMs: 10000, maxBytes: 2 * 1024 * 1024 },
    );
    if (!Array.isArray(meals)) throw new Error('OpenMensa returned an invalid response');
    return { meals };
  }));

  api.post('/ai/models', aiLimiter, result(async (req) => ({
    models: await ai.models(schemas.aiModels.parse(req.body || {})),
  })));
  api.post('/ai/recommend', aiLimiter, result(async (req) => (
    ai.recommend(schemas.aiRecommend.parse(req.body || {}))
  )));
  api.post('/ai/chat', aiLimiter, result(async (req) => ai.chat(schemas.aiChat.parse(req.body))));

  api.get('/ollama/setup', (_req, res) => res.json(ollama.state));
  api.post('/ollama/setup/retry', aiLimiter, command(async (_req, res) => res.json(await ollama.retry())));
  api.get('/ollama/setup/events', (req, res) => {
    if (activeSseConnections >= config.maxSseConnections) {
      return res.status(429).json({ error: 'Too many setup event connections', code: 'SSE_LIMIT' });
    }
    activeSseConnections += 1;
    let closed = false;
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
      if (closed) return;
      closed = true;
      activeSseConnections -= 1;
      clearInterval(heartbeat);
      ollama.off('state', send);
    });
  });

  api.get('/backup/export', result(async () => ({ data: backup.exportJson() })));
  api.post('/backup/import', importLimiter, result(async (req) => ({
    warnings: await backup.importJson(req.body?.data),
  })));

  app.use('/api/v1', api);
  app.use('/static', express.static(path.join(config.buildDir, 'static'), { index: false, immutable: true, maxAge: '1y' }));
  app.use('/icons', express.static(path.join(config.buildDir, 'icons'), { index: false, fallthrough: true }));
  for (const asset of ['manifest.json', 'offline.html', 'offline-locale.js', 'service-worker.js', 'favicon.ico', 'asset-manifest.json']) {
    app.get(`/${asset}`, (req, res, next) => {
      const target = path.join(config.buildDir, asset);
      if (!fs.existsSync(target)) return next();
      if (asset === 'service-worker.js') res.set('Service-Worker-Allowed', '/');
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
      error: isValidation
        ? 'Request validation failed'
        : status < 500 ? error.message : 'Internal server error',
      code: error.code || (isValidation ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR'),
      ...(isValidation ? { details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) } : {}),
    });
  });

  return app;
}

module.exports = { createApp, loginPage, selectLocale };
