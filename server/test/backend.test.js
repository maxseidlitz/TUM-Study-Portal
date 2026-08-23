const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const BetterSqlite3 = require('better-sqlite3');
const request = require('supertest');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { StudyDatabase } = require('../db/database');
const { restoreBackup } = require('../restore');
const { compactContext } = require('../services/ai');
const { BackupService } = require('../services/domain');
const { SecurityService } = require('../services/security');
const { isPrivateIp, resolvePublic, safeFetchText } = require('../services/safeFetch');

const ORIGIN = 'https://portal.test';
const KEY = Buffer.alloc(32, 7);

async function fixture(t, configOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-backend-'));
  const buildDir = path.join(root, 'build');
  fs.mkdirSync(buildDir);
  fs.mkdirSync(path.join(buildDir, 'static'));
  fs.writeFileSync(path.join(buildDir, 'index.html'), '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  fs.writeFileSync(path.join(buildDir, 'static', 'main.abc123.js'), 'console.log("static");');
  fs.writeFileSync(path.join(buildDir, 'service-worker.js'), 'self.addEventListener("fetch", () => {});');
  fs.writeFileSync(path.join(buildDir, 'offline.html'), '<!doctype html><title>Offline</title>');
  const config = {
    nodeEnv: 'test',
    publicOrigin: ORIGIN,
    databasePath: path.join(root, 'db.sqlite'),
    buildDir,
    backupDir: path.join(root, 'backups'),
    passwordHash: '',
    bootstrapPassword: 'correct horse battery staple',
    sessionSecret: 's'.repeat(48),
    csrfSecret: 'c'.repeat(48),
    sessionTtlMs: 60 * 60 * 1000,
    secureCookies: true,
    trustProxy: false,
    settingsEncryptionKey: KEY,
    backupKey: KEY,
    icalAllowedHosts: ['calendar.test'],
    mensaCanteenIds: ['422'],
    ollamaUrl: 'http://127.0.0.1:1',
    ollamaModel: 'test-model',
    geminiApiKey: '',
    maxJsonBytes: 1024 * 1024,
    maxImportBytes: 10 * 1024 * 1024,
    maxAiContextBytes: 64 * 1024,
    backupRetention: 2,
    importRateLimit: 2,
    maxSseConnections: 1,
    importQuotas: {
      exams: 3, lectures: 10, todos: 10, moodleCourses: 10,
      modules: 10, studyLogs: 10, chats: 10,
    },
    ...configOverrides,
  };
  const app = await createApp({
    config,
    logger: { error() {}, warn() {}, info() {} },
  });
  t.after(() => {
    app.locals.services.db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { app, config, root };
}

function cookieValue(setCookies, name) {
  const row = setCookies.find((value) => value.startsWith(`${name}=`));
  return row && row.split(';')[0];
}

async function login(app, {
  origin = ORIGIN,
  cookiePrefix = '__Host-',
  secureCookies = true,
} = {}) {
  const page = await request(app).get('/login').expect(200);
  const nonce = cookieValue(page.headers['set-cookie'], `${cookiePrefix}login_nonce`);
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const response = await request(app).post('/login')
    .set('Origin', origin)
    .set('Cookie', nonce)
    .type('form')
    .send({ _csrf: token, password: 'correct horse battery staple' })
    .expect(302);
  const session = cookieValue(response.headers['set-cookie'], `${cookiePrefix}tum_session`);
  assert.match(response.headers['set-cookie'].join(';'), /HttpOnly/);
  if (secureCookies) assert.match(response.headers['set-cookie'].join(';'), /Secure/);
  else assert.doesNotMatch(response.headers['set-cookie'].join(';'), /;\s*Secure(?:;|$)/);
  assert.match(response.headers['set-cookie'].join(';'), /SameSite=Strict/);
  const shell = await request(app).get('/').set('Cookie', session).expect(200);
  const csrf = shell.text.match(/name="csrf-token" content="([^"]+)"/)[1];
  return { session, csrf };
}

test('local HTTP development uses unprefixed cookies browsers accept', async (t) => {
  const origin = 'http://127.0.0.1:3443';
  const { app } = await fixture(t, { publicOrigin: origin, secureCookies: false });
  const page = await request(app).get('/login').expect(200);
  assert.match(page.headers['set-cookie'].join(';'), /^login_nonce=/);
  assert.doesNotMatch(page.headers['set-cookie'].join(';'), /;\s*Secure(?:;|$)/);
  assert.doesNotMatch(page.headers['content-security-policy'], /upgrade-insecure-requests/);
  assert.equal(page.headers['strict-transport-security'], undefined);
  assert.equal(page.headers['referrer-policy'], 'same-origin');

  const nonce = cookieValue(page.headers['set-cookie'], 'login_nonce');
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await request(app).post('/login')
    .set('Referer', `${origin}/login`)
    .set('Cookie', nonce)
    .type('form')
    .send({ _csrf: token, password: 'correct horse battery staple' })
    .expect(302);

  const auth = await login(app, { origin, cookiePrefix: '', secureCookies: false });
  assert.match(auth.session, /^tum_session=/);
  await request(app).get('/api/v1/exams').set('Cookie', auth.session).expect(200);
});

function api(app, auth, method, url, body) {
  const call = request(app)[method](url).set('Cookie', auth.session).set('Origin', ORIGIN);
  if (!['get', 'head'].includes(method)) call.set('X-CSRF-Token', auth.csrf);
  return body === undefined ? call : call.send(body);
}

test('health, login, session, CSRF and origin enforcement', async (t) => {
  const { app } = await fixture(t);
  await request(app).get('/healthz').expect(200, { status: 'ok' });
  await request(app).get('/readyz').expect(200, { status: 'ready' });
  await request(app).get('/service-worker.js').expect(200)
    .expect('Cache-Control', 'no-store')
    .expect('Service-Worker-Allowed', '/');
  await request(app).get('/offline.html').expect(200).expect('Cache-Control', 'no-store');
  await request(app).get('/static/main.abc123.js').expect(200)
    .expect('Cache-Control', 'public, max-age=31536000, immutable');
  await request(app).get('/api/v1/exams').expect(401);
  const auth = await login(app);
  await request(app).get('/').set('Cookie', auth.session).expect(200)
    .expect('Cache-Control', 'no-store');
  await request(app).post('/api/v1/exams').set('Cookie', auth.session)
    .set('Origin', ORIGIN).send({ id: 'e1', name: 'Exam', date: '' }).expect(403);
  await request(app).post('/api/v1/exams').set('Cookie', auth.session)
    .set('Origin', 'https://evil.test').set('X-CSRF-Token', auth.csrf)
    .send({ id: 'e1', name: 'Exam', date: '' }).expect(403);
  const logout = await api(app, auth, 'post', '/api/v1/auth/logout').expect(200, { success: true });
  assert.match(logout.headers['set-cookie'].join(';'), /Max-Age=0/);
  await request(app).get('/api/v1/exams').set('Cookie', auth.session).expect(401);
});

test('all entity CRUD routes preserve HTTP adapter shapes', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  const cases = [
    ['exams', { id: 'e1', name: 'Analysis', date: '2026-09-01', time: '10:00', credits: 6 }],
    ['todos', { id: 't1', title: 'Learn', priority: 'high', due: '2026-08-30', done: false }],
    ['moodle', { id: 'c1', name: 'Course', url: 'https://moodle.test/course' }],
  ];
  for (const [resource, item] of cases) {
    await api(app, auth, 'post', `/api/v1/${resource}`, item).expect(200, { success: true });
    const list = await api(app, auth, 'get', `/api/v1/${resource}`).expect(200);
    assert.equal(list.body.length, 1);
    await api(app, auth, 'put', `/api/v1/${resource}/${item.id}`, { ...item, name: item.name || 'Changed' })
      .expect(200, { success: true });
    await api(app, auth, 'delete', `/api/v1/${resource}/${item.id}`).expect(200, { success: true });
    await api(app, auth, 'get', `/api/v1/${resource}`).expect(200, []);
  }
});

test('schemas normalize unknown data and reject reserved IDs and invalid dates/times', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  await api(app, auth, 'post', '/api/v1/exams', {
    id: 'e1', name: 'Normalized', date: '2026-08-23', time: '23:59', injected: 'drop-me',
  }).expect(200);
  const exams = await api(app, auth, 'get', '/api/v1/exams').expect(200);
  assert.equal(Object.hasOwn(exams.body[0], 'injected'), false);
  await api(app, auth, 'post', '/api/v1/exams', {
    id: 'bad-date', name: 'Bad', date: '2026-02-30',
  }).expect(422);
  await api(app, auth, 'post', '/api/v1/exams', {
    id: 'bad-time', name: 'Bad', date: '', time: '25:61',
  }).expect(422);
  await api(app, auth, 'post', '/api/v1/modules', {
    id: 'bad::module', name: 'Bad', slots: [],
  }).expect(422);
  await api(app, auth, 'post', '/api/v1/modules', {
    id: 'm1', name: 'Bad slot',
    slots: [{ id: 's::1', day: 'Mo', time: '10:00', end_time: '09:00' }],
  }).expect(422);
  await api(app, auth, 'post', '/api/v1/lectures', {
    id: 'standalone::collision', name: 'Bad', day: 'Mo', time: '10:00', end_time: '11:00',
  }).expect(422);
  await api(app, auth, 'patch', '/api/v1/settings', { unknownSetting: true }).expect(422);
  await api(app, auth, 'post', '/api/v1/ical/replace', {
    items: [{ name: 'Bad date', day: 'Mo', eventDate: '2026-02-30' }],
  }).expect(422).expect(({ body }) => assert.deepEqual(body, {
    success: false, error: 'Request validation failed',
  }));
  await api(app, auth, 'post', '/api/v1/ai/chat', {
    messages: [], context: { unexpected: true },
  }).expect(422).expect(({ body }) => assert.equal(body.success, false));
});

test('nested modules and lecture composite IDs update series and occurrences', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  const mod = {
    id: 'm1', name: 'Algorithms', code: '', semester: '', moodleUrl: '', color: '#3B82F6',
    slots: [{ id: 's1', day: 'Mo', time: '10:00', end_time: '11:00', room: 'A', lecturer: '', allDay: false }],
  };
  await api(app, auth, 'post', '/api/v1/modules', mod).expect(200);
  let lectures = await api(app, auth, 'get', '/api/v1/lectures').expect(200);
  assert.equal(lectures.body[0].id, 'm1::s1');
  await api(app, auth, 'put', '/api/v1/lectures/m1%3A%3As1', {
    ...lectures.body[0], room: 'B',
  }).expect(200);
  await api(app, auth, 'put', '/api/v1/lectures/m1%3A%3As1%3A%3A2026-08-24', {
    id: 'm1::s1::2026-08-24', time: '12:00', end_time: '13:00', room: 'C',
  }).expect(200);
  lectures = await api(app, auth, 'get', '/api/v1/lectures').expect(200);
  assert.equal(lectures.body.find((row) => row.id === 'm1::s1').room, 'B');
  assert.equal(lectures.body.find((row) => row.overrideDate === '2026-08-24').room, 'C');
  await api(app, auth, 'delete', '/api/v1/lectures/m1%3A%3As1%3A%3A2026-08-24').expect(200);
  lectures = await api(app, auth, 'get', '/api/v1/lectures').expect(200);
  assert.equal(lectures.body.some((row) => row.overrideDate === '2026-08-24'), false);
  for (const invalidDate of ['not-a-date', '2026-02-30', '']) {
    const invalidId = `m1::s1::${invalidDate}`;
    await api(app, auth, 'put', `/api/v1/lectures/${encodeURIComponent(invalidId)}`, {
      id: invalidId, time: '12:00', end_time: '13:00', room: 'X',
    }).expect(422);
    await api(app, auth, 'delete', `/api/v1/lectures/${encodeURIComponent(invalidId)}`).expect(422);
  }
});

test('iCal replacement is atomic, scoped to imported rows and rolls back injected failures', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  await api(app, auth, 'post', '/api/v1/modules', {
    id: 'manual', name: 'Manual', source: 'manual', slots: [],
  }).expect(200);
  await api(app, auth, 'post', '/api/v1/modules', {
    id: 'old-import', name: 'Old import', source: 'ical',
    slots: [{ id: 'old-slot', day: 'Mo', time: '08:00', end_time: '09:00' }],
  }).expect(200);
  await api(app, auth, 'post', '/api/v1/lectures', {
    id: 'old-lecture', name: 'Old one-off', day: 'Di', time: '10:00',
    end_time: '11:00', eventDate: '2026-08-25', imported: true,
  }).expect(200);
  const items = [
    { name: 'New course', day: 'Mo', time: '10:00', end_time: '11:00', eventDate: '2026-08-24' },
    { name: 'New course', day: 'Mo', time: '10:00', end_time: '11:00', eventDate: '2026-08-31' },
  ];
  const replaced = await api(app, auth, 'post', '/api/v1/ical/replace', { items }).expect(200);
  assert.deepEqual(replaced.body, { success: true, moduleCount: 1, lectureCount: 0 });
  let modules = await api(app, auth, 'get', '/api/v1/modules').expect(200);
  assert.equal(modules.body.some(mod => mod.id === 'manual'), true);
  assert.equal(modules.body.some(mod => mod.id === 'old-import'), false);
  assert.equal(modules.body.some(mod => mod.name === 'New course'), true);

  const database = app.locals.services.db;
  const originalSaveModule = database.saveModule;
  database.saveModule = () => { throw new Error('sensitive sqlite internals'); };
  const failed = await api(app, auth, 'post', '/api/v1/ical/replace', { items }).expect(200);
  database.saveModule = originalSaveModule;
  assert.deepEqual(failed.body, { success: false, error: 'External service request failed' });
  modules = await api(app, auth, 'get', '/api/v1/modules').expect(200);
  assert.equal(modules.body.some(mod => mod.name === 'New course'), true);
  assert.equal(modules.body.some(mod => mod.id === 'manual'), true);
});

test('study logs, settings secrets, chats and result routes work', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  await api(app, auth, 'post', '/api/v1/exams', { id: 'e1', name: 'Exam', date: '2026-09-01' }).expect(200);
  await api(app, auth, 'post', '/api/v1/study-logs', {
    id: 'l1', exam_id: 'e1', date: '2026-08-23', duration_min: 25, topics: 'Proofs',
  }).expect(200);
  const logs = await api(app, auth, 'get', '/api/v1/study-logs?examId=e1').expect(200);
  assert.equal(logs.body[0].id, 'l1');

  const settings = await api(app, auth, 'patch', '/api/v1/settings', {
    locale: 'en', geminiApiKey: 'top-secret', ollamaUrl: 'http://evil.test',
  }).expect(200);
  assert.equal(settings.body.locale, 'en');
  assert.equal(settings.body.geminiApiKeyConfigured, true);
  assert.equal(settings.body.ollamaServerManaged, true);
  assert.equal(settings.body.ollamaModel, 'test-model');
  assert.equal(settings.body.ollamaUrl, 'http://127.0.0.1:1');
  assert.equal(Object.hasOwn(settings.body, 'geminiApiKey'), false);
  assert.equal(app.locals.services.domain.geminiKey(), 'top-secret');

  const chat = { id: 'chat/1', title: 'Hello', updatedAt: new Date().toISOString(), messages: [] };
  await api(app, auth, 'put', '/api/v1/chats/chat%2F1', chat).expect(200);
  await api(app, auth, 'get', '/api/v1/chats/chat%2F1').expect(200);
  await api(app, auth, 'delete', '/api/v1/chats/chat%2F1').expect(200);

  await api(app, auth, 'post', '/api/v1/ical/fetch', { url: 'https://not-allowed.test/a.ics' })
    .expect(200).expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'get', '/api/v1/mensa/999').expect(422)
    .expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'post', '/api/v1/ai/models', { aiProvider: 'gemini' }).expect(200)
    .expect(({ body }) => assert.equal(body.success, true));
  app.locals.services.ai.generate = async () => ({ content: 'Safe test response', model: 'test-model' });
  await api(app, auth, 'post', '/api/v1/ai/recommend', { today: '2026-08-23' }).expect(200)
    .expect(({ body }) => assert.equal(body.content, 'Safe test response'));
  await api(app, auth, 'post', '/api/v1/ai/chat', {
    messages: [{ role: 'user', content: 'What should I study?' }],
    context: { locale: 'en' },
  }).expect(200).expect(({ body }) => {
    assert.equal(body.success, true);
    assert.deepEqual(body.todoActions, []);
  });
  await api(app, auth, 'get', '/api/v1/ollama/setup').expect(200)
    .expect(({ body }) => assert.equal(body.phase, 'idle'));
  app.locals.services.ai.models = async () => ['test-model'];
  await api(app, auth, 'post', '/api/v1/ollama/setup/retry').expect(200)
    .expect(({ body }) => assert.equal(body.phase, 'ready'));
});

test('ON DELETE SET NULL keeps relational columns and compatibility JSON synchronized', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  await api(app, auth, 'post', '/api/v1/modules', { id: 'm1', name: 'Module', slots: [] }).expect(200);
  await api(app, auth, 'post', '/api/v1/moodle', { id: 'c1', name: 'Course' }).expect(200);
  await api(app, auth, 'post', '/api/v1/todos', {
    id: 't1', title: 'Linked', moduleId: 'm1', moodleCourseId: 'c1',
  }).expect(200);
  await api(app, auth, 'post', '/api/v1/lectures', {
    id: 'l1', name: 'Linked lecture', moduleId: 'm1', day: 'Mo', time: '10:00', end_time: '11:00',
  }).expect(200);
  await api(app, auth, 'delete', '/api/v1/modules/m1').expect(200);
  await api(app, auth, 'delete', '/api/v1/moodle/c1').expect(200);
  const todos = await api(app, auth, 'get', '/api/v1/todos').expect(200);
  const lectures = await api(app, auth, 'get', '/api/v1/lectures').expect(200);
  assert.equal(todos.body[0].moduleId, '');
  assert.equal(todos.body[0].moodleCourseId, '');
  assert.equal(lectures.body[0].moduleId, '');
  const rawTodo = app.locals.services.db.db.prepare('SELECT data_json FROM todos WHERE id=?').get('t1');
  const rawLecture = app.locals.services.db.db.prepare('SELECT data_json FROM lectures WHERE id=?').get('l1');
  assert.equal(JSON.parse(rawTodo.data_json).moduleId, '');
  assert.equal(JSON.parse(rawTodo.data_json).moodleCourseId, '');
  assert.equal(JSON.parse(rawLecture.data_json).moduleId, '');
});

test('backup export/import is validated, encrypted and transactional', async (t) => {
  const { app, root } = await fixture(t);
  const auth = await login(app);
  await api(app, auth, 'post', '/api/v1/exams', { id: 'old', name: 'Old', date: '' }).expect(200);
  const exported = await api(app, auth, 'get', '/api/v1/backup/export').expect(200);
  assert.equal(exported.body.success, true);
  const replacement = JSON.stringify({
    exams: [{ id: 'new', name: 'New', date: '2026-12-01' }],
    lectures: [], todos: [], moodle_courses: [], modules: [], study_logs: [],
    settings: { locale: 'de' }, chat_sessions: [],
  });
  await api(app, auth, 'post', '/api/v1/backup/import', { data: replacement }).expect(200)
    .expect(({ body }) => assert.equal(body.success, true));
  await api(app, auth, 'get', '/api/v1/exams').expect(200)
    .expect(({ body }) => assert.deepEqual(body.map((row) => row.id), ['new']));
  assert.equal(fs.readdirSync(path.join(root, 'backups')).some((name) => name.endsWith('.enc')), true);

  const invalid = JSON.stringify({
    exams: [{ id: 'broken', name: '', date: '' }],
    lectures: [], todos: [], moodle_courses: [], modules: [], study_logs: [], chat_sessions: [],
  });
  await api(app, auth, 'post', '/api/v1/backup/import', { data: invalid }).expect(422)
    .expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'get', '/api/v1/exams').expect(200)
    .expect(({ body }) => assert.deepEqual(body.map((row) => row.id), ['new']));
});

test('current desktop backup fixture imports without compatibility rewrites', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  const raw = fs.readFileSync(path.resolve('server/test/fixtures/current-backup.json'), 'utf8');
  await api(app, auth, 'post', '/api/v1/backup/import', { data: raw }).expect(200)
    .expect(({ body }) => {
      assert.equal(body.success, true);
      assert.deepEqual(body.warnings, []);
    });
  const modules = await api(app, auth, 'get', '/api/v1/modules').expect(200);
  const todos = await api(app, auth, 'get', '/api/v1/todos').expect(200);
  const lectures = await api(app, auth, 'get', '/api/v1/lectures').expect(200);
  assert.equal(modules.body[0].id, 'module-current');
  assert.equal(todos.body[0].moduleId, 'module-current');
  assert.equal(lectures.body.find(row => row.name === 'Current One-Off').moduleId, 'module-current');
});

test('legacy desktop backup is normalized before validation with deterministic reference-safe IDs', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  const raw = fs.readFileSync(path.resolve('server/test/fixtures/legacy-desktop-backup.json'), 'utf8');
  const first = app.locals.services.backup.validateImport(raw);
  const second = app.locals.services.backup.validateImport(raw);
  assert.equal(first.modules[0].id, second.modules[0].id);
  assert.equal(first.modules[0].slots[0].id, second.modules[0].slots[0].id);
  assert.equal(first.lectures[0].id, second.lectures[0].id);
  assert.doesNotMatch(first.modules[0].id, /::/);
  assert.doesNotMatch(first.modules[0].slots[0].id, /::/);
  assert.doesNotMatch(first.lectures[0].id, /::/);
  assert.equal(new Set(first.modules.map(mod => mod.id)).size, first.modules.length);
  assert.equal(new Set(first.modules[0].slots.map(slot => slot.id)).size, first.modules[0].slots.length);
  assert.equal(new Set(first.lectures.map(lecture => lecture.id)).size, first.lectures.length);
  assert.notEqual(first.modules[0].id, 'module--legacy');
  assert.notEqual(first.modules[0].slots[0].id, 'slot--legacy');
  assert.notEqual(first.lectures[0].id, 'lecture--legacy');
  assert.equal(first.todos[0].title, 'Legacy Todo Text');
  assert.equal(first.todos[0].due, '2026-10-18');
  assert.equal(first.todos[0].subject, 'Legacy Exam');
  assert.equal(first.todos[0].moduleId, first.modules[0].id);
  assert.equal(first.lectures[0].moduleId, first.modules[0].id);

  await api(app, auth, 'post', '/api/v1/backup/import', { data: raw }).expect(200)
    .expect(({ body }) => {
      assert.equal(body.success, true);
      assert.ok(body.warnings.some(warning => warning.includes('module ID')));
      assert.ok(body.warnings.some(warning => warning.includes('slot ID')));
      assert.ok(body.warnings.some(warning => warning.includes('lecture ID')));
    });
  const modules = await api(app, auth, 'get', '/api/v1/modules').expect(200);
  const todos = await api(app, auth, 'get', '/api/v1/todos').expect(200);
  const lectures = await api(app, auth, 'get', '/api/v1/lectures').expect(200);
  const logs = await api(app, auth, 'get', '/api/v1/study-logs?todoId=todo-legacy').expect(200);
  const legacyModule = modules.body.find(mod => mod.name === 'Legacy Module');
  assert.equal(todos.body[0].moduleId, legacyModule.id);
  assert.equal(lectures.body.find(row => row.name === 'Legacy One-Off').moduleId, legacyModule.id);
  assert.equal(lectures.body.some(row => row.id === `${legacyModule.id}::${legacyModule.slots[0].id}`), true);
  assert.equal(logs.body[0].todo_id, 'todo-legacy');
});

test('backup retention, import quotas and import rate limits are enforced', async (t) => {
  const { app, root } = await fixture(t);
  const auth = await login(app);
  await app.locals.services.backup.safetyBackup();
  await new Promise(resolve => setTimeout(resolve, 2));
  await app.locals.services.backup.safetyBackup();
  await new Promise(resolve => setTimeout(resolve, 2));
  await app.locals.services.backup.safetyBackup();
  assert.equal(
    fs.readdirSync(path.join(root, 'backups')).filter(name => name.endsWith('.enc')).length,
    2,
  );
  const oversized = JSON.stringify({
    exams: Array.from({ length: 4 }, (_, index) => ({ id: `e${index}`, name: 'Exam', date: '' })),
  });
  await api(app, auth, 'post', '/api/v1/backup/import', { data: oversized }).expect(422)
    .expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'post', '/api/v1/backup/import', { data: '{}' }).expect(200);
  await api(app, auth, 'post', '/api/v1/backup/import', { data: '{}' }).expect(429)
    .expect(({ body }) => assert.deepEqual(body, {
      success: false, error: 'Backup import rate limit exceeded',
    }));
});

test('external provider details are not returned in result envelopes', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  app.locals.services.ai.generate = async () => {
    throw new Error('upstream secret token and internal hostname');
  };
  await api(app, auth, 'post', '/api/v1/ai/recommend', {}).expect(200)
    .expect(({ body }) => assert.deepEqual(body, {
      success: false, error: 'External service request failed',
    }));
});

test('AI context serialization is byte-bounded for multibyte nested data', () => {
  const huge = '🧠'.repeat(10000);
  const context = compactContext({
    exams: Array.from({ length: 30 }, (_, id) => ({ id, notes: huge })),
    todos: Array.from({ length: 60 }, (_, id) => ({ id, notes: huge })),
    lectures: Array.from({ length: 80 }, (_, id) => ({ id, name: huge })),
    modules: Array.from({ length: 40 }, (_, id) => ({ id, name: huge })),
  }, 4096);
  assert.ok(Buffer.byteLength(context, 'utf8') <= 4096);
  assert.doesNotThrow(() => JSON.parse(context));
});

test('private and reserved address checks fail closed', () => {
  for (const address of [
    '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.1.1',
    '192.0.2.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('DNS answers and every redirect target are deterministically revalidated', async () => {
  await assert.rejects(
    resolvePublic('calendar.test', async () => [{ address: '127.0.0.1', family: 4 }]),
    error => error.code === 'ICAL_TARGET_BLOCKED',
  );
  const requestImpl = (_url, _options, callback) => {
    const outgoing = new EventEmitter();
    outgoing.destroy = () => outgoing.emit('error');
    process.nextTick(() => {
      const response = new PassThrough();
      response.statusCode = 302;
      response.headers = { location: 'https://not-allowlisted.test/private.ics' };
      callback(response);
      response.end();
    });
    return outgoing;
  };
  await assert.rejects(safeFetchText('https://calendar.test/source.ics', {
    allowedHosts: ['calendar.test'],
    lookupImpl: async () => [{ address: '8.8.8.8', family: 4 }],
    requestImpl,
  }), error => error.code === 'ICAL_HOST_NOT_ALLOWED');
});

test('startup rejects missing required encryption keys', () => {
  const previousSettingsKey = process.env.SETTINGS_ENCRYPTION_KEY;
  const previousBackupKey = process.env.BACKUP_KEY;
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  delete process.env.BACKUP_KEY;
  try {
    assert.throws(() => loadConfig({
      nodeEnv: 'test',
      publicOrigin: ORIGIN,
      bootstrapPassword: 'password',
      sessionSecret: 's'.repeat(32),
      csrfSecret: 'c'.repeat(32),
    }), /SETTINGS_ENCRYPTION_KEY is required/);
  } finally {
    if (previousSettingsKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
    else process.env.SETTINGS_ENCRYPTION_KEY = previousSettingsKey;
    if (previousBackupKey === undefined) delete process.env.BACKUP_KEY;
    else process.env.BACKUP_KEY = previousBackupKey;
  }
});

test('versioned migrations repair existing JSON/FK drift and remain idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-migration-'));
  const filename = path.join(root, 'db.sqlite');
  const legacy = new BetterSqlite3(filename);
  legacy.exec(fs.readFileSync(path.resolve('server/db/migrations/001-initial.sql'), 'utf8'));
  legacy.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(1,?,?)')
    .run('001-initial.sql', new Date().toISOString());
  legacy.prepare('INSERT INTO todos(id,module_id,moodle_course_id,due,done,data_json) VALUES(?,?,?,?,?,?)')
    .run('drifted', null, null, '', 0, JSON.stringify({
      id: 'drifted', title: 'Old', moduleId: 'deleted-module', moodleCourseId: 'deleted-course',
    }));
  legacy.close();
  const migrated = new StudyDatabase(filename);
  assert.equal(migrated.getEntity('todos', 'drifted').moduleId, '');
  assert.equal(JSON.parse(migrated.db.prepare('SELECT data_json FROM todos').get().data_json).moduleId, '');
  assert.deepEqual(migrated.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [
    { version: 1 }, { version: 2 },
  ]);
  migrated.close();
  const reopened = new StudyDatabase(filename);
  assert.equal(reopened.getEntity('todos', 'drifted').moodleCourseId, '');
  reopened.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('atomic restore validates, migrates and preserves a uniquely named previous database', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-restore-'));
  const destination = path.join(root, 'study.sqlite');
  const backupDir = path.join(root, 'backups');
  const database = new StudyDatabase(destination);
  database.saveEntity('exams', { id: 'from-backup', name: 'Backup', date: '' }, 'insert');
  database.db.prepare('INSERT INTO sessions(id_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?)')
    .run('restored-session', new Date().toISOString(), new Date().toISOString(), '2099-01-01T00:00:00.000Z');
  const backup = new BackupService(database, {
    backupDir, backupKey: KEY, backupRetention: 2,
  }, new SecurityService(database, {}, 'unused'));
  const source = await backup.safetyBackup();
  database.deleteEntity('exams', 'from-backup');
  database.saveEntity('exams', { id: 'before-restore', name: 'Current', date: '' }, 'insert');
  database.close();

  const operations = [];
  const filesystem = Object.create(fs);
  filesystem.linkSync = (from, to) => {
    operations.push(['link', from, to]);
    return fs.linkSync(from, to);
  };
  filesystem.renameSync = (from, to) => {
    operations.push(['rename', from, to, fs.existsSync(destination)]);
    return fs.renameSync(from, to);
  };
  filesystem.fsyncSync = (descriptor) => {
    operations.push(['fsync']);
    return fs.fsyncSync(descriptor);
  };
  const outcome = restoreBackup({ source, destination, key: KEY, filesystem });
  assert.match(outcome.previous, /\.before-restore-/);
  assert.equal(fs.existsSync(outcome.previous), true);
  const installRename = operations.filter(operation => operation[0] === 'rename');
  assert.equal(installRename.length, 1);
  assert.equal(installRename[0][2], destination);
  assert.equal(installRename[0][3], true);
  assert.ok(operations.findIndex(operation => operation[0] === 'link')
    < operations.findIndex(operation => operation[0] === 'rename'));
  assert.ok(operations.findIndex(operation => operation[0] === 'fsync')
    < operations.findIndex(operation => operation[0] === 'rename'));
  assert.equal(fs.existsSync(`${destination}-wal`), false);
  assert.equal(fs.existsSync(`${destination}-shm`), false);
  const previousDb = new StudyDatabase(outcome.previous);
  assert.deepEqual(previousDb.listEntities('exams').map(exam => exam.id), ['before-restore']);
  previousDb.close();
  const restored = new StudyDatabase(destination);
  assert.deepEqual(restored.listEntities('exams').map(exam => exam.id), ['from-backup']);
  assert.equal(restored.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  restored.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('restore rename failure leaves DATABASE_PATH and verified Previous copy intact', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-restore-failure-'));
  const destination = path.join(root, 'study.sqlite');
  const backupDir = path.join(root, 'backups');
  const database = new StudyDatabase(destination);
  database.saveEntity('exams', { id: 'from-backup', name: 'Backup', date: '' }, 'insert');
  const backup = new BackupService(database, {
    backupDir, backupKey: KEY, backupRetention: 2,
  }, new SecurityService(database, {}, 'unused'));
  const source = await backup.safetyBackup();
  database.deleteEntity('exams', 'from-backup');
  database.saveEntity('exams', { id: 'must-survive', name: 'Current', date: '' }, 'insert');
  database.close();

  const fixedNow = new Date('2026-08-23T03:00:00.000Z');
  const previous = `${destination}.before-restore-2026-08-23T03-00-00-000Z`;
  const filesystem = Object.create(fs);
  filesystem.renameSync = (from, to) => {
    if (to === destination) {
      assert.equal(fs.existsSync(destination), true);
      throw new Error('injected atomic rename failure');
    }
    return fs.renameSync(from, to);
  };
  assert.throws(() => restoreBackup({
    source, destination, key: KEY, filesystem, now: () => fixedNow,
  }), /injected atomic rename failure/);
  assert.equal(fs.existsSync(destination), true);
  assert.equal(fs.existsSync(previous), true);
  for (const filename of [destination, previous]) {
    const checked = new StudyDatabase(filename);
    assert.deepEqual(checked.listEntities('exams').map(exam => exam.id), ['must-survive']);
    checked.close();
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('authenticated Ollama SSE emits initial state and closes cleanly', async (t) => {
  const { app } = await fixture(t);
  const auth = await login(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/ollama/setup/events`,
      { headers: { Cookie: auth.session }, signal: controller.signal },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const { value } = await response.body.getReader().read();
    assert.match(Buffer.from(value).toString('utf8'), /"phase":"idle"/);
    const limited = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/ollama/setup/events`,
      { headers: { Cookie: auth.session } },
    );
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'SSE_LIMIT');
  } finally {
    controller.abort();
    await new Promise((resolve) => server.close(resolve));
  }
});
