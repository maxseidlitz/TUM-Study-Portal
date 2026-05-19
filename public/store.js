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
}

/** Vorlesungszeile aus Modul-Slot (id = moduleId::slotId). */
function parseCompositeLectureId(id) {
  if (typeof id !== 'string' || !id.includes('::')) return null;
  const i = id.indexOf('::');
  return { moduleId: id.slice(0, i), slotId: id.slice(i + 2) };
}

function expandModulesToLectures(modules) {
  const out = [];
  if (!Array.isArray(modules)) return out;
  for (const mod of modules) {
    const slots = Array.isArray(mod.slots) ? mod.slots : [];
    for (const slot of slots) {
      if (!slot || typeof slot.id !== 'string' || !slot.id) continue;
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
      });
    }
  }
  return out;
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

function initStore() {
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'tum-study-portal.json');
  loadStore();
  normalizeStoreAfterLoad();
  migrateLegacyToModulesIfNeeded();
  normalizeStoreAfterLoad();
}

module.exports = {
  store,
  saveStore,
  initStore,
  getMergedLecturesForClient,
  parseCompositeLectureId,
  expandModulesToLectures,
};
