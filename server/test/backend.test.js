const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../app');
const { isPrivateIp } = require('../services/safeFetch');

const ORIGIN = 'https://portal.test';
const KEY = Buffer.alloc(32, 7);

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-backend-'));
  const buildDir = path.join(root, 'build');
  fs.mkdirSync(buildDir);
  fs.writeFileSync(path.join(buildDir, 'index.html'), '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
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

async function login(app) {
  const page = await request(app).get('/login').expect(200);
  const nonce = cookieValue(page.headers['set-cookie'], '__Host-login_nonce');
  const token = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const response = await request(app).post('/login')
    .set('Origin', ORIGIN)
    .set('Cookie', nonce)
    .type('form')
    .send({ _csrf: token, password: 'correct horse battery staple' })
    .expect(302);
  const session = cookieValue(response.headers['set-cookie'], '__Host-tum_session');
  assert.match(response.headers['set-cookie'].join(';'), /HttpOnly/);
  assert.match(response.headers['set-cookie'].join(';'), /Secure/);
  assert.match(response.headers['set-cookie'].join(';'), /SameSite=Strict/);
  const shell = await request(app).get('/').set('Cookie', session).expect(200);
  const csrf = shell.text.match(/name="csrf-token" content="([^"]+)"/)[1];
  return { session, csrf };
}

function api(app, auth, method, url, body) {
  const call = request(app)[method](url).set('Cookie', auth.session).set('Origin', ORIGIN);
  if (!['get', 'head'].includes(method)) call.set('X-CSRF-Token', auth.csrf);
  return body === undefined ? call : call.send(body);
}

test('health, login, session, CSRF and origin enforcement', async (t) => {
  const { app } = await fixture(t);
  await request(app).get('/healthz').expect(200, { status: 'ok' });
  await request(app).get('/readyz').expect(200, { status: 'ready' });
  await request(app).get('/api/v1/exams').expect(401);
  const auth = await login(app);
  await request(app).post('/api/v1/exams').set('Cookie', auth.session)
    .set('Origin', ORIGIN).send({ id: 'e1', name: 'Exam', date: '' }).expect(403);
  await request(app).post('/api/v1/exams').set('Cookie', auth.session)
    .set('Origin', 'https://evil.test').set('X-CSRF-Token', auth.csrf)
    .send({ id: 'e1', name: 'Exam', date: '' }).expect(403);
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
  assert.equal(Object.hasOwn(settings.body, 'geminiApiKey'), false);
  assert.equal(app.locals.services.domain.geminiKey(), 'top-secret');

  const chat = { id: 'chat/1', title: 'Hello', updatedAt: new Date().toISOString(), messages: [] };
  await api(app, auth, 'put', '/api/v1/chats/chat%2F1', chat).expect(200);
  await api(app, auth, 'get', '/api/v1/chats/chat%2F1').expect(200);
  await api(app, auth, 'delete', '/api/v1/chats/chat%2F1').expect(200);

  await api(app, auth, 'post', '/api/v1/ical/fetch', { url: 'https://not-allowed.test/a.ics' })
    .expect(200).expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'get', '/api/v1/mensa/999').expect(200)
    .expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'post', '/api/v1/ai/models', { aiProvider: 'gemini' }).expect(200)
    .expect(({ body }) => assert.equal(body.success, true));
  await api(app, auth, 'get', '/api/v1/ollama/setup').expect(200)
    .expect(({ body }) => assert.equal(body.phase, 'idle'));
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
  await api(app, auth, 'post', '/api/v1/backup/import', { data: invalid }).expect(200)
    .expect(({ body }) => assert.equal(body.success, false));
  await api(app, auth, 'get', '/api/v1/exams').expect(200)
    .expect(({ body }) => assert.deepEqual(body.map((row) => row.id), ['new']));
});

test('private and reserved address checks fail closed', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.1.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(address), true, address);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});
