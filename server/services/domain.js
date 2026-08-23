const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { schemas, settingsPatch, validIsoDate } = require('../validation');
const { backupPayload, BackupFormatError, validateBackupStructure } = require('./backupFormat');

class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const defaults = {
  aiProvider: 'ollama',
  ollamaUrl: '',
  ollamaModel: '',
  ollamaServerManaged: false,
  ollamaDisableReasoning: false,
  geminiModel: '',
  targetEcts: 180,
  targetGpa: 1,
  preferredMensaId: '422',
  onboardingCompleted: false,
  onboardingStep: 0,
  ollamaSetupDismissed: false,
};

function composite(id) {
  if (typeof id !== 'string' || !id.includes('::')) return null;
  const parts = id.split('::');
  return parts.length >= 3
    ? {
      moduleId: parts[0], slotId: parts[1], overrideDate: parts.slice(2).join('::'), hasOverride: true,
    }
    : { moduleId: parts[0], slotId: parts[1], hasOverride: false };
}

function requireValidOverrideDate(target) {
  if (target?.hasOverride && !validIsoDate(target.overrideDate)) {
    throw new HttpError(422, 'Lecture override ID contains an invalid calendar date', 'VALIDATION_FAILED');
  }
}

const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dayForDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? days[new Date(+match[1], +match[2] - 1, +match[3]).getDay()] : 'Mo';
}

function expandModules(modules) {
  const result = [];
  for (const mod of modules) {
    for (const slot of mod.slots || []) {
      result.push({
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
        overrides: slot.overrides || {},
      });
      for (const [date, override] of Object.entries(slot.overrides || {})) {
        if (!override || override.canceled) continue;
        result.push({
          id: `${mod.id}::${slot.id}::${date}`,
          moduleId: mod.id,
          slotId: slot.id,
          overrideDate: date,
          isOverride: true,
          name: mod.name || '',
          day: dayForDate(date),
          time: override.time ?? slot.time ?? '',
          end_time: override.end_time ?? slot.end_time ?? '',
          room: override.room ?? slot.room ?? '',
          lecturer: slot.lecturer || '',
          color: mod.color || '#3B82F6',
          eventDate: date,
          allDay: Boolean(slot.allDay),
        });
      }
    }
  }
  return result;
}

function mostCommon(values) {
  const counts = new Map();
  let best = '';
  let bestCount = 0;
  for (const value of values.filter(Boolean)) {
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function groupIcalItems(items) {
  const byName = new Map();
  for (const item of items) {
    const name = (item.name || '(Ohne Titel)').trim();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(item);
  }
  const modules = [];
  const lectures = [];
  for (const [name, group] of byName) {
    const signatures = new Map();
    for (const item of group) {
      const signature = `${item.day}|${item.time || ''}|${item.end_time || ''}`;
      if (!signatures.has(signature)) signatures.set(signature, []);
      signatures.get(signature).push(item);
    }
    const slots = [];
    const oneOffs = [];
    for (const occurrences of signatures.values()) {
      const first = occurrences[0];
      if (occurrences.length >= 2 && !first.allDay && first.time) {
        slots.push({
          id: crypto.randomUUID(),
          day: first.day,
          time: first.time || '',
          end_time: first.end_time || '',
          room: mostCommon(occurrences.map(item => item.room)),
          lecturer: '',
          allDay: false,
        });
      } else {
        oneOffs.push(...occurrences);
      }
    }
    if (slots.length) {
      modules.push({
        id: crypto.randomUUID(),
        name,
        code: '',
        semester: '',
        moodleUrl: '',
        color: group.find(item => item.color)?.color || '#3B82F6',
        source: 'ical',
        slots,
      });
      lectures.push(...oneOffs);
    } else {
      lectures.push(...group);
    }
  }
  return {
    modules,
    lectures: lectures.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      imported: true,
    })),
  };
}

class DomainService {
  constructor(db, security, config) {
    this.db = db;
    this.security = security;
    this.config = config;
  }

  list(type) {
    const mapping = {
      exams: ['exams', 'date'],
      todos: ['todos', 'rowid'],
      moodle: ['moodle_courses', 'name COLLATE NOCASE'],
    };
    const entry = mapping[type];
    if (!entry) throw new HttpError(404, 'Unknown resource');
    return this.db.listEntities(entry[0], entry[1]);
  }

  write(type, raw, mode) {
    const mapping = {
      exams: ['exams', schemas.exam],
      todos: ['todos', schemas.todo],
      moodle: ['moodle_courses', schemas.moodle],
    };
    const entry = mapping[type];
    if (!entry) throw new HttpError(404, 'Unknown resource');
    const item = entry[1].parse(raw);
    if (mode === 'update' && !this.db.getEntity(entry[0], item.id)) throw new HttpError(404, 'Entity not found');
    this.db.saveEntity(entry[0], item, mode);
    return item;
  }

  createAiTodo(raw) {
    const input = schemas.aiCreateTodo.parse(raw);
    return this.db.transaction(() => {
      let subject = input.subject;
      if (input.moduleId) {
        const mod = this.db.getModule(input.moduleId);
        if (!mod) throw new HttpError(422, 'Unknown moduleId', 'VALIDATION_FAILED');
        subject = mod.name;
      }
      if (input.moodleCourseId) {
        const course = this.db.getEntity('moodle_courses', input.moodleCourseId);
        if (!course) throw new HttpError(422, 'Unknown moodleCourseId', 'VALIDATION_FAILED');
        if (!input.moduleId) subject = course.name;
      }
      const todo = schemas.todo.parse({
        id: crypto.randomUUID(),
        title: input.title,
        priority: input.priority,
        subject,
        due: input.due,
        notes: input.notes,
        done: false,
        moduleId: input.moduleId,
        moodleCourseId: input.moodleCourseId,
      });
      this.db.saveEntity('todos', todo, 'insert');
      return todo;
    });
  }

  remove(type, id) {
    const table = { exams: 'exams', todos: 'todos', moodle: 'moodle_courses' }[type];
    if (!table || !this.db.deleteEntity(table, id)) throw new HttpError(404, 'Entity not found');
  }

  modules() {
    return this.db.listModules();
  }

  saveModule(raw, mode) {
    const mod = schemas.module.parse(raw);
    if (mode === 'update' && !this.db.getModule(mod.id)) throw new HttpError(404, 'Module not found');
    this.db.saveModule(mod, mode);
    return mod;
  }

  lectures() {
    return [...expandModules(this.db.listModules()), ...this.db.listEntities('lectures')];
  }

  createLecture(raw) {
    const lecture = schemas.standaloneLecture.parse(raw);
    this.db.saveEntity('lectures', lecture, 'insert');
    return lecture;
  }

  updateLecture(raw) {
    const lecture = schemas.lecture.parse(raw);
    const target = composite(lecture.id);
    requireValidOverrideDate(target);
    if (!target) {
      if (!this.db.getEntity('lectures', lecture.id)) throw new HttpError(404, 'Lecture not found');
      this.db.saveEntity('lectures', lecture, 'update');
      return;
    }
    const patch = {
      day: lecture.day,
      time: lecture.time || '',
      end_time: lecture.end_time || '',
      room: lecture.room || '',
      lecturer: lecture.lecturer || '',
      allDay: Boolean(lecture.allDay),
      ...(lecture.name ? { name: lecture.name } : {}),
    };
    const ok = target.hasOverride
      ? this.db.setSlotOverride(target.moduleId, target.slotId, target.overrideDate,
        { canceled: false, time: patch.time, end_time: patch.end_time, room: patch.room })
      : this.db.updateSlot(target.moduleId, target.slotId, patch);
    if (!ok) throw new HttpError(404, 'Module lecture not found');
  }

  deleteLecture(id) {
    const target = composite(id);
    requireValidOverrideDate(target);
    const ok = !target
      ? this.db.deleteEntity('lectures', id)
      : target.hasOverride
        ? this.db.setSlotOverride(target.moduleId, target.slotId, target.overrideDate, { canceled: true })
        : this.db.deleteSlot(target.moduleId, target.slotId);
    if (!ok) throw new HttpError(404, 'Lecture not found');
  }

  publicSettings() {
    const result = { ...defaults, ...this.db.settings() };
    result.ollamaUrl = this.config.ollamaUrl;
    result.ollamaModel = this.config.ollamaModel;
    result.ollamaServerManaged = true;
    result.geminiApiKeyConfigured = Boolean(this.config.geminiApiKey
      || this.db.db.prepare('SELECT 1 FROM secrets WHERE key=?').get('geminiApiKey'));
    delete result.geminiApiKey;
    return result;
  }

  patchSettings(raw) {
    const patch = settingsPatch(raw);
    if (patch.geminiApiKey) {
      this.security.saveSecret('geminiApiKey', patch.geminiApiKey);
      delete patch.geminiApiKey;
    }
    delete patch.ollamaUrl;
    delete patch.ollamaModel;
    if (Object.keys(patch).length) this.db.patchSettings(patch);
    return this.publicSettings();
  }

  geminiKey() {
    return this.config.geminiApiKey || this.security.readSecret('geminiApiKey');
  }

  replaceIcal(rawItems) {
    const items = schemas.icalItems.parse(rawItems);
    const grouped = groupIcalItems(items);
    this.db.transaction(() => {
      this.db.db.prepare("DELETE FROM lectures WHERE json_extract(data_json, '$.imported') = 1").run();
      this.db.db.prepare("DELETE FROM modules WHERE json_extract(data_json, '$.source') = 'ical'").run();
      for (const mod of grouped.modules) this.db.saveModule(schemas.module.parse(mod), 'insert');
      for (const lecture of grouped.lectures) {
        this.db.saveEntity('lectures', schemas.standaloneLecture.parse(lecture), 'insert');
      }
    });
    return { moduleCount: grouped.modules.length, lectureCount: grouped.lectures.length };
  }
}

function importCollection(input, keyName, quota) {
  const list = input[keyName] == null ? [] : input[keyName];
  if (!Array.isArray(list) || list.length > quota) {
    throw new HttpError(422, `Invalid or oversized ${keyName} collection`);
  }
  return list.map(item => (
    item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : item
  ));
}

function normalizeLegacyTodos(todos, exams) {
  const examNames = new Map(exams
    .filter(exam => exam && typeof exam === 'object')
    .map(exam => [exam.id, typeof exam.name === 'string' ? exam.name : '']));
  return todos.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const title = String(raw.title || raw.text || '').trim();
    const due = String(raw.due || raw.dueDate || '');
    const subject = String(raw.subject || examNames.get(raw.examId) || '');
    return {
      id: raw.id,
      title,
      priority: ['high', 'medium', 'low'].includes(raw.priority) ? raw.priority : 'medium',
      subject,
      due,
      notes: String(raw.notes || ''),
      done: raw.done === true || raw.done === 1,
      moduleId: typeof raw.moduleId === 'string' ? raw.moduleId : '',
      moodleCourseId: typeof raw.moodleCourseId === 'string' ? raw.moodleCourseId : '',
    };
  });
}

function deterministicLegacyId(kind, identity, used) {
  const digest = crypto.createHash('sha256').update(`${kind}\0${identity}`).digest('hex');
  let candidate = `legacy-${kind}-${digest.slice(0, 32)}`;
  let suffix = 0;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `legacy-${kind}-${digest.slice(0, 28)}-${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

function assertUniqueStringIds(items, collection) {
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    if (seen.has(item.id)) throw new HttpError(422, `Duplicate legacy ID in ${collection}`);
    seen.add(item.id);
  }
}

function migratePreModuleCollections(store, warnings) {
  if (store.modules_migration_v1 === true || store.modules.length) return;
  assertUniqueStringIds(store.moodle_courses, 'moodle_courses');
  const modules = store.moodle_courses.map(course => ({
    id: course.id,
    name: course.name || 'Modul',
    code: course.code || '',
    semester: course.semester || '',
    moodleUrl: course.url || '',
    color: course.color || '#3B82F6',
    slots: [],
  }));
  const usedModuleIds = new Set(modules.map(mod => mod.id));
  const kept = [];
  const normalize = value => String(value || '').trim().toLowerCase();
  for (const lecture of store.lectures) {
    if (!lecture || typeof lecture !== 'object' || lecture.eventDate) {
      kept.push(lecture);
      continue;
    }
    let mod = modules.find(entry => normalize(entry.name) === normalize(lecture.name));
    if (!mod) {
      let moduleId = lecture.id;
      if (usedModuleIds.has(moduleId)) {
        moduleId = deterministicLegacyId('module', `lecture\0${lecture.id}\0${lecture.name}`, usedModuleIds);
      } else {
        usedModuleIds.add(moduleId);
      }
      mod = {
        id: moduleId,
        name: lecture.name || 'Modul',
        code: '',
        semester: '',
        moodleUrl: '',
        color: lecture.color || '#3B82F6',
        slots: [],
      };
      modules.push(mod);
    }
    mod.slots.push({
      id: lecture.id,
      day: lecture.day || 'Mo',
      time: lecture.time || '',
      end_time: lecture.end_time || '',
      room: lecture.room || '',
      lecturer: lecture.lecturer || '',
      allDay: Boolean(lecture.allDay),
    });
  }
  store.modules = modules;
  store.lectures = kept;
  const moduleIds = new Set(modules.map(mod => mod.id));
  store.todos = store.todos.map(todo => (
    todo?.moodleCourseId && moduleIds.has(todo.moodleCourseId)
      ? { ...todo, moduleId: todo.moodleCourseId, moodleCourseId: '' }
      : todo
  ));
  store.moodle_courses = [];
  warnings.push('Migrated pre-module desktop backup');
}

function remapReservedCompositeIds(store, warnings) {
  assertUniqueStringIds(store.modules, 'modules');
  const moduleIds = new Set(store.modules
    .map(mod => mod?.id)
    .filter(value => typeof value === 'string' && !value.includes('::')));
  const moduleMap = new Map();
  for (const mod of store.modules) {
    if (!mod || typeof mod.id !== 'string') continue;
    const oldModuleId = mod.id;
    if (oldModuleId.includes('::')) {
      mod.id = deterministicLegacyId('module', oldModuleId, moduleIds);
      moduleMap.set(oldModuleId, mod.id);
      warnings.push(`Remapped reserved legacy module ID: ${oldModuleId}`);
    }
    const slots = Array.isArray(mod.slots) ? mod.slots.map(slot => (
      slot && typeof slot === 'object' && !Array.isArray(slot) ? { ...slot } : slot
    )) : mod.slots;
    if (!Array.isArray(slots)) continue;
    assertUniqueStringIds(slots, `module ${oldModuleId} slots`);
    const slotIds = new Set(slots
      .map(slot => slot?.id)
      .filter(value => typeof value === 'string' && !value.includes('::')));
    for (const slot of slots) {
      if (slot && typeof slot.id === 'string' && slot.id.includes('::')) {
        slot.id = deterministicLegacyId('slot', `${oldModuleId}\0${slot.id}`, slotIds);
        warnings.push(`Remapped reserved legacy slot ID in module: ${oldModuleId}`);
      }
    }
    mod.slots = slots;
  }

  assertUniqueStringIds(store.lectures, 'lectures');
  const lectureIds = new Set(store.lectures
    .map(lecture => lecture?.id)
    .filter(value => typeof value === 'string' && !value.includes('::')));
  for (const lecture of store.lectures) {
    if (!lecture || typeof lecture !== 'object') continue;
    if (typeof lecture.id === 'string' && lecture.id.includes('::')) {
      const oldLectureId = lecture.id;
      lecture.id = deterministicLegacyId('lecture', oldLectureId, lectureIds);
      warnings.push(`Remapped reserved legacy lecture ID: ${oldLectureId}`);
    }
    if (moduleMap.has(lecture.moduleId)) lecture.moduleId = moduleMap.get(lecture.moduleId);
  }
  for (const todo of store.todos) {
    if (todo && moduleMap.has(todo.moduleId)) todo.moduleId = moduleMap.get(todo.moduleId);
  }
}

function normalizeImportReferences(store, warnings) {
  const moduleIds = new Set(store.modules.map(mod => mod?.id));
  const moodleIds = new Set(store.moodle_courses.map(course => course?.id));
  for (const todo of store.todos) {
    if (!todo || typeof todo !== 'object') continue;
    if (todo.moduleId && !moduleIds.has(todo.moduleId)) {
      todo.moduleId = '';
      warnings.push('Cleared dangling legacy Todo module reference');
    }
    if (todo.moodleCourseId && !moodleIds.has(todo.moodleCourseId)) {
      todo.moodleCourseId = '';
      warnings.push('Cleared dangling legacy Todo Moodle reference');
    }
  }
  for (const lecture of store.lectures) {
    if (lecture?.moduleId && !moduleIds.has(lecture.moduleId)) {
      lecture.moduleId = '';
      warnings.push('Cleared dangling legacy Lecture module reference');
    }
  }
}

class BackupService {
  constructor(db, config, security) {
    this.db = db;
    this.config = config;
    this.security = security;
  }

  exportJson() {
    return JSON.stringify(backupPayload(this.db.exportStore()), null, 2);
  }

  async safetyBackup() {
    if (!this.config.backupKey) throw new Error('BACKUP_KEY is required before destructive import');
    fs.mkdirSync(this.config.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const temp = path.join(this.config.backupDir, `.backup-${stamp}.sqlite`);
    const target = path.join(this.config.backupDir, `backup-${stamp}.enc`);
    await this.db.db.backup(temp);
    try {
      const encrypted = this.security.encrypt(fs.readFileSync(temp), this.config.backupKey);
      const payload = JSON.stringify({ version: 1, ...encrypted });
      fs.writeFileSync(`${target}.tmp`, payload, { mode: 0o600 });
      fs.renameSync(`${target}.tmp`, target);
      this.pruneBackups();
      return target;
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }

  pruneBackups() {
    const files = fs.readdirSync(this.config.backupDir)
      .filter(name => /^backup-.*\.enc$/.test(name))
      .sort()
      .reverse();
    for (const name of files.slice(this.config.backupRetention)) {
      fs.rmSync(path.join(this.config.backupDir, name), { force: true });
    }
  }

  validateImport(raw) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > this.config.maxImportBytes) {
      throw new HttpError(422, 'Backup is missing or exceeds the import size limit');
    }
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new HttpError(422, 'Backup is not valid JSON');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Invalid backup root');
    try {
      validateBackupStructure(input);
    } catch (error) {
      if (error instanceof BackupFormatError) throw new HttpError(422, error.message);
      throw error;
    }
    const specifications = {
      exams: [schemas.exam, this.config.importQuotas.exams],
      lectures: [schemas.standaloneLecture, this.config.importQuotas.lectures],
      todos: [schemas.todo, this.config.importQuotas.todos],
      moodle_courses: [schemas.moodle, this.config.importQuotas.moodleCourses],
      modules: [schemas.module, this.config.importQuotas.modules],
      study_logs: [schemas.studyLog, this.config.importQuotas.studyLogs],
      chat_sessions: [schemas.chat, this.config.importQuotas.chats],
    };
    const normalized = { modules_migration_v1: input.modules_migration_v1 === true };
    for (const [keyName, [, quota]] of Object.entries(specifications)) {
      normalized[keyName] = importCollection(input, keyName, quota);
    }
    normalized.todos = normalizeLegacyTodos(normalized.todos, normalized.exams);
    const warnings = [];
    migratePreModuleCollections(normalized, warnings);
    remapReservedCompositeIds(normalized, warnings);
    normalizeImportReferences(normalized, warnings);

    const result = {};
    for (const [keyName, [schema, quota]] of Object.entries(specifications)) {
      if (normalized[keyName].length > quota) {
        throw new HttpError(422, `Invalid or oversized ${keyName} collection`);
      }
      result[keyName] = normalized[keyName].map(item => schema.parse(item));
      const ids = new Set(result[keyName].map((item) => item.id));
      if (ids.size !== result[keyName].length) throw new HttpError(422, `Duplicate ID in ${keyName}`);
    }
    result.settings = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings)
      ? input.settings : {};
    if (Object.keys(result.settings).length > 100
      || Buffer.byteLength(JSON.stringify(result.settings), 'utf8') > 64 * 1024) {
      throw new HttpError(422, 'Invalid or oversized settings collection');
    }
    const examIds = new Set(result.exams.map(exam => exam.id));
    const todoIds = new Set(result.todos.map(todo => todo.id));
    for (const log of result.study_logs) {
      if ((log.exam_id && !examIds.has(log.exam_id)) || (log.todo_id && !todoIds.has(log.todo_id))) {
        throw new HttpError(422, 'Study log references a missing Exam or Todo');
      }
    }
    result.migrationWarnings = warnings;
    return result;
  }

  async importJson(raw) {
    const store = this.validateImport(raw);
    await this.safetyBackup();
    const settings = {};
    const warnings = [...store.migrationWarnings];
    for (const [keyName, value] of Object.entries(store.settings)) {
      if (keyName === 'geminiApiKey') continue;
      try {
        Object.assign(settings, settingsPatch({ [keyName]: value }));
      } catch {
        warnings.push(`Ignored unknown or invalid setting: ${keyName}`);
      }
    }
    this.db.transaction(() => {
      this.db.clearDomain();
      for (const item of store.exams) this.db.saveEntity('exams', item, 'insert');
      for (const item of store.moodle_courses) this.db.saveEntity('moodle_courses', item, 'insert');
      for (const item of store.modules) this.db.saveModule(item, 'insert');
      for (const item of store.lectures) this.db.saveEntity('lectures', item, 'insert');
      for (const item of store.todos) this.db.saveEntity('todos', item, 'insert');
      for (const item of store.study_logs) this.db.createStudyLog(item);
      for (const item of store.chat_sessions) this.db.saveChat(item);
      this.db.patchSettings(settings);
      const problems = this.db.db.pragma('foreign_key_check');
      if (problems.length) throw new Error('Imported backup violates referential integrity');
      const digest = crypto.createHash('sha256').update(raw).digest('hex');
      this.db.db.prepare('INSERT OR REPLACE INTO import_history(digest,imported_at,warnings_json) VALUES(?,?,?)')
        .run(digest, new Date().toISOString(), JSON.stringify(warnings));
    });
    return warnings;
  }
}

module.exports = { BackupService, DomainService, HttpError, composite, expandModules };
