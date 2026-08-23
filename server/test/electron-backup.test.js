const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { StudyDatabase } = require('../db/database');
const { BackupService } = require('../services/domain');
const {
  autoBackup,
  createImportSafetyBackup,
  exportBackupJson,
  importBackupJson,
  replaceStore,
  saveStore,
  setStorePathForTests,
  store,
} = require('../../public/store');

const COLLECTIONS = [
  'exams', 'lectures', 'todos', 'moodle_courses', 'modules', 'study_logs', 'chat_sessions',
];

function validStore(overrides = {}) {
  return {
    exams: [],
    lectures: [],
    todos: [],
    moodle_courses: [],
    modules: [],
    study_logs: [],
    settings: {},
    chat_sessions: [],
    modules_migration_v1: true,
    ...overrides,
  };
}

function versionedBackup(overrides = {}) {
  return JSON.stringify({
    format: 'tum-study-portal-backup',
    formatVersion: 1,
    ...validStore(),
    ...overrides,
  });
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-backup-'));
  const filename = path.join(root, 'tum-study-portal.json');
  setStorePathForTests(filename);
  replaceStore(validStore());
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { filename, root };
}

test('Electron export is complete, versioned and redacts provider secrets', (t) => {
  fixture(t);
  replaceStore(validStore({
    exams: [{ id: 'e1', name: 'Exam', date: '' }],
    settings: { locale: 'de', geminiApiKey: 'must-not-export' },
    foreign: [{ secret: true }],
  }));
  const exported = JSON.parse(exportBackupJson());
  assert.equal(exported.format, 'tum-study-portal-backup');
  assert.equal(exported.formatVersion, 1);
  for (const collection of COLLECTIONS) assert.ok(Array.isArray(exported[collection]), collection);
  assert.equal(exported.settings.locale, 'de');
  assert.equal(Object.hasOwn(exported.settings, 'geminiApiKey'), false);
  assert.equal(Object.hasOwn(exported, 'foreign'), false);
});

test('Electron rejects empty, foreign, empty-legacy and malformed versioned backups before mutation', (t) => {
  fixture(t);
  const original = validStore({ exams: [{ id: 'keep', name: 'Keep', date: '' }] });
  replaceStore(original);
  let safetyCalls = 0;
  const invalid = [
    '{}',
    JSON.stringify({ foreign: [{ id: 'x' }] }),
    JSON.stringify({ todos: [], foreign: [{ id: 'x' }] }),
    JSON.stringify({ format: 'tum-study-portal-backup', formatVersion: 2, exams: [] }),
    JSON.stringify({ format: 'tum-study-portal-backup', formatVersion: 1, exams: [] }),
  ];
  for (const json of invalid) {
    assert.throws(() => importBackupJson(json, {
      createSafetyBackup: () => { safetyCalls += 1; },
      persist: () => { throw new Error('must not persist'); },
    }));
    assert.deepEqual(store, original);
  }
  assert.equal(safetyCalls, 0);
});

test('Electron legacy import accepts non-empty domain data while ignoring accompanying foreign fields', (t) => {
  fixture(t);
  importBackupJson(JSON.stringify({
    exams: [{ id: 'legacy', name: 'Legacy', date: '' }],
    todos: [],
    foreign: [{ id: 'ignored' }],
  }), {
    createSafetyBackup: () => '/safety.json',
    persist: () => {},
  });
  assert.deepEqual(store.exams.map(exam => exam.id), ['legacy']);
  assert.equal(Object.hasOwn(store, 'foreign'), false);
});

test('every valid Electron import creates a unique safety backup despite a daily backup', (t) => {
  const { root } = fixture(t);
  replaceStore(validStore({ exams: [{ id: 'before', name: 'Before', date: '' }] }));
  saveStore();
  autoBackup();
  const backupDir = path.join(root, 'backups');
  const daily = fs.readdirSync(backupDir).find(name => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  assert.ok(daily);

  importBackupJson(versionedBackup({
    exams: [{ id: 'after', name: 'After', date: '' }],
  }));
  let safetyFiles = fs.readdirSync(backupDir).filter(name => name.startsWith('import-safety-'));
  assert.equal(safetyFiles.length, 1);
  const safety = JSON.parse(fs.readFileSync(path.join(backupDir, safetyFiles[0]), 'utf8'));
  assert.deepEqual(safety.exams.map(exam => exam.id), ['before']);
  assert.equal(fs.existsSync(path.join(backupDir, daily)), true);

  let newestSafety;
  for (let index = 0; index < 21; index += 1) newestSafety = createImportSafetyBackup();
  safetyFiles = fs.readdirSync(backupDir).filter(name => name.startsWith('import-safety-'));
  assert.equal(safetyFiles.length, 20);
  assert.equal(fs.existsSync(newestSafety), true);
  assert.equal(fs.existsSync(path.join(backupDir, daily)), true);
});

test('Electron import aborts on safety-backup failure without touching store or disk', (t) => {
  const { filename } = fixture(t);
  const original = validStore({ exams: [{ id: 'keep', name: 'Keep', date: '' }] });
  replaceStore(original);
  saveStore();
  assert.throws(() => importBackupJson(versionedBackup(), {
    createSafetyBackup: () => { throw new Error('backup disk full'); },
  }), /backup disk full/);
  assert.deepEqual(store, original);
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), original);
});

test('atomic Electron store write failure rolls in-memory state back and leaves disk unchanged', (t) => {
  const { filename, root } = fixture(t);
  const original = validStore({ exams: [{ id: 'keep', name: 'Keep', date: '' }] });
  replaceStore(original);
  saveStore();
  const renameSync = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === filename) throw new Error('injected rename failure');
    return renameSync(from, to);
  };
  try {
    assert.throws(() => importBackupJson(versionedBackup({
      exams: [{ id: 'replace', name: 'Replace', date: '' }],
    }), { createSafetyBackup: () => '/safety.json' }), /injected rename failure/);
  } finally {
    fs.renameSync = renameSync;
  }
  assert.deepEqual(store, original);
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), original);
  assert.equal(fs.readdirSync(root).some(name => name.includes('.tmp-')), false);
});

test('Electron and server exports cross-import through the shared format', (t) => {
  const { root } = fixture(t);
  replaceStore(validStore({
    exams: [{ id: 'electron-exam', name: 'Electron', date: '2026-09-01' }],
  }));
  const serverValidator = new BackupService(null, {
    maxImportBytes: 1024 * 1024,
    importQuotas: {
      exams: 10, lectures: 10, todos: 10, moodleCourses: 10,
      modules: 10, studyLogs: 10, chats: 10,
    },
  }, null);
  assert.deepEqual(
    serverValidator.validateImport(exportBackupJson()).exams.map(exam => exam.id),
    ['electron-exam'],
  );

  const database = new StudyDatabase(path.join(root, 'server.sqlite'));
  database.saveEntity('exams', { id: 'server-exam', name: 'Server', date: '2026-10-01' }, 'insert');
  const serverJson = new BackupService(database, {}, null).exportJson();
  database.close();
  importBackupJson(serverJson, {
    createSafetyBackup: () => '/safety.json',
    persist: () => {},
  });
  assert.deepEqual(store.exams.map(exam => exam.id), ['server-exam']);
});
