const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ---- JSON File Store ----
// `store` wird als gemeinsam genutzte Objekt-Referenz exportiert und niemals
// neu zugewiesen — Mutationen erfolgen immer in-place, damit Consumer-Module
// (ai.js, electron.js) stets dieselbe Referenz sehen.
let dbPath;
const store = {
  exams: [], lectures: [], todos: [], moodle_courses: [],
  modules: [],
  study_logs: [], settings: {}, chat_sessions: [],
};

function loadStore() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      const loaded = {
        exams: [], lectures: [], todos: [], moodle_courses: [],
        modules: [],
        study_logs: [], settings: {}, chat_sessions: [],
        ...JSON.parse(raw),
      };
      // In-place mutieren statt neu zuweisen → exportierte Referenz bleibt gültig
      Object.keys(store).forEach((k) => { delete store[k]; });
      Object.assign(store, loaded);
    }
  } catch (e) {
    console.error('Failed to load store:', e);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save store:', e);
  }
}

function normalizeStoreAfterLoad() {
  if (!Array.isArray(store.modules)) store.modules = [];
  if (!Array.isArray(store.lectures)) store.lectures = [];
  if (!Array.isArray(store.moodle_courses)) store.moodle_courses = [];
  if (!Array.isArray(store.todos)) store.todos = [];
  if (!store.settings) store.settings = {};
  if (store.settings.targetEcts === undefined) store.settings.targetEcts = 180;
  if (store.settings.targetGpa === undefined) store.settings.targetGpa = 1.0;
  if (store.settings.preferredMensaId === undefined) store.settings.preferredMensaId = '422'; // Garching
  if (store.settings.onboardingCompleted === undefined) store.settings.onboardingCompleted = false;
  if (store.settings.onboardingStep === undefined) store.settings.onboardingStep = 0;
  if (store.settings.ollamaSetupDismissed === undefined) store.settings.ollamaSetupDismissed = false;
}

/** Vorlesungszeile aus Modul-Slot (id = moduleId::slotId). */
const STORE_DAY_CODES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dayCodeForIso(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 'Mo';
  return STORE_DAY_CODES[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
}

/**
 * Composite-Lecture-ID:
 *  - "moduleId::slotId"          → wöchentlicher Slot
 *  - "moduleId::slotId::isoDate" → Einzel-Instanz-Override an diesem Datum
 */
function parseCompositeLectureId(id) {
  if (typeof id !== 'string' || !id.includes('::')) return null;
  const parts = id.split('::');
  if (parts.length >= 3) {
    return { moduleId: parts[0], slotId: parts[1], overrideDate: parts.slice(2).join('::') };
  }
  return { moduleId: parts[0], slotId: parts[1] };
}

function expandModulesToLectures(modules) {
  const out = [];
  if (!Array.isArray(modules)) return out;
  for (const mod of modules) {
    const slots = Array.isArray(mod.slots) ? mod.slots : [];
    for (const slot of slots) {
      if (!slot || typeof slot.id !== 'string' || !slot.id) continue;
      const overrides = (slot.overrides && typeof slot.overrides === 'object') ? slot.overrides : {};
      // Wöchentliche Basis-Instanz (trägt overrides zur Unterdrückung einzelner Tage)
      out.push({
        id: `${mod.id}::${slot.id}`,
        moduleId: mod.id,
        slotId: slot.id,
        name: mod.name || '',
        day: slot.day,
        time: slot.time || '',
        end_time: slot.end_time || '',
        room: slot.room || '',
        lecturer: slot.lecturer || '',
        color: mod.color || '#3B82F6',
        eventDate: '',
        allDay: Boolean(slot.allDay),
        overrides,
      });
      // Verschobene/geänderte Einzeltermine als dattierte Instanzen (abgesagte nicht)
      for (const [iso, ov] of Object.entries(overrides)) {
        if (!ov || ov.canceled) continue;
        out.push({
          id: `${mod.id}::${slot.id}::${iso}`,
          moduleId: mod.id,
          slotId: slot.id,
          overrideDate: iso,
          isOverride: true,
          name: mod.name || '',
          day: dayCodeForIso(iso),
          time: ov.time != null ? ov.time : (slot.time || ''),
          end_time: ov.end_time != null ? ov.end_time : (slot.end_time || ''),
          room: ov.room != null ? ov.room : (slot.room || ''),
          lecturer: slot.lecturer || '',
          color: mod.color || '#3B82F6',
          eventDate: iso,
          allDay: Boolean(slot.allDay),
        });
      }
    }
  }
  return out;
}

/** Setzt/merged einen Einzel-Instanz-Override (verschieben/ändern). */
function setSlotOverride(moduleId, slotId, iso, patch) {
  const mod = (store.modules || []).find((m) => m.id === moduleId);
  if (!mod) return { success: false, error: 'Modul nicht gefunden.' };
  const slots = [...(mod.slots || [])];
  const si = slots.findIndex((s) => s.id === slotId);
  if (si < 0) return { success: false, error: 'Termin nicht gefunden.' };
  const overrides = { ...(slots[si].overrides || {}) };
  overrides[iso] = { ...(overrides[iso] || {}), ...patch };
  slots[si] = { ...slots[si], overrides };
  store.modules = (store.modules || []).map((m) => (m.id === moduleId ? { ...mod, slots } : m));
  saveStore();
  return { success: true };
}

function getMergedLecturesForClient() {
  const fromModules = expandModulesToLectures(store.modules || []);
  const raw = Array.isArray(store.lectures) ? store.lectures : [];
  return [...fromModules, ...raw];
}

/**
 * Einmalige Migration: moodle_courses + wiederkehrende Vorlesungen → modules;
 * iCal-Termine (eventDate) bleiben in lectures.
 */
function migrateLegacyToModulesIfNeeded() {
  if (store.modules_migration_v1) return;
  normalizeStoreAfterLoad();
  if (Array.isArray(store.modules) && store.modules.length > 0) {
    store.modules_migration_v1 = true;
    saveStore();
    return;
  }
  const hasLegacy =
    (store.moodle_courses && store.moodle_courses.length > 0) ||
    (store.lectures || []).some((l) => !l.eventDate);
  if (!hasLegacy) {
    store.modules = [];
    store.modules_migration_v1 = true;
    saveStore();
    return;
  }
  const modules = [];
  const usedLectureIds = new Set();
  const norm = (s) => String(s || '').trim().toLowerCase();

  for (const mc of store.moodle_courses || []) {
    modules.push({
      id: mc.id,
      name: mc.name || 'Modul',
      code: mc.code || '',
      semester: mc.semester || '',
      moodleUrl: mc.url || '',
      color: mc.color || '#3B82F6',
      slots: [],
    });
  }

  for (const lec of store.lectures || []) {
    if (lec.eventDate) continue;
    const matched = modules.find((m) => norm(m.name) === norm(lec.name));
    const slot = {
      id: lec.id,
      day: lec.day,
      time: lec.time || '',
      end_time: lec.end_time || '',
      room: lec.room || '',
      lecturer: lec.lecturer || '',
      allDay: Boolean(lec.allDay),
    };
    if (matched) {
      matched.slots.push(slot);
      usedLectureIds.add(lec.id);
    } else {
      modules.push({
        id: lec.id,
        name: lec.name || 'Modul',
        code: '',
        semester: '',
        moodleUrl: '',
        color: lec.color || '#3B82F6',
        slots: [slot],
      });
      usedLectureIds.add(lec.id);
    }
  }

  const remaining = (store.lectures || []).filter((l) => !usedLectureIds.has(l.id));
  store.lectures = remaining;
  store.modules = modules;
  store.moodle_courses = [];
  store.modules_migration_v1 = true;
  saveStore();
}

function autoBackup() {
  try {
    const userDataPath = app.getPath('userData');
    const backupDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const backupPath = path.join(backupDir, `backup-${today}.json`);
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, JSON.stringify(store, null, 2), 'utf8');
    }

    // Keep only the 7 newest backup files
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();
    while (files.length > 7) {
      fs.unlinkSync(path.join(backupDir, files.shift()));
    }
  } catch (e) {
    console.error('Auto-backup failed:', e);
  }
}

function initStore() {
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'tum-study-portal.json');
  loadStore();
  normalizeStoreAfterLoad();
  migrateLegacyToModulesIfNeeded();
  normalizeStoreAfterLoad();
  autoBackup();
}

module.exports = {
  store,
  saveStore,
  initStore,
  getMergedLecturesForClient,
  parseCompositeLectureId,
  expandModulesToLectures,
  setSlotOverride,
  autoBackup,
};
