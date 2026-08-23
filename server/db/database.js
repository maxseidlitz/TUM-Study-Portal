const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function json(value) {
  return JSON.stringify(value == null ? null : value);
}

function parsed(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class StudyDatabase {
  constructor(filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.filename = filename;
    this.db = new Database(filename);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
  }

  migrate() {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    const dir = path.join(__dirname, 'migrations');
    const applied = new Set(this.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
    for (const name of fs.readdirSync(dir).filter((file) => /^\d+.*\.sql$/.test(file)).sort()) {
      const version = Number(name.match(/^(\d+)/)[1]);
      if (applied.has(version)) continue;
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      this.db.transaction(() => {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)')
          .run(version, name, new Date().toISOString());
      })();
    }
  }

  close() {
    this.db.close();
  }

  ready() {
    const result = this.db.pragma('quick_check', { simple: true });
    return result === 'ok';
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  listEntities(table, order = '') {
    const rows = this.db.prepare(`SELECT data_json FROM ${table}${order ? ` ORDER BY ${order}` : ''}`).all();
    return rows.map((row) => parsed(row.data_json, {}));
  }

  getEntity(table, id) {
    const row = this.db.prepare(`SELECT data_json FROM ${table} WHERE id=?`).get(id);
    return row ? parsed(row.data_json, {}) : null;
  }

  saveEntity(table, item, mode = 'insert') {
    const columns = {
      exams: ['date'],
      lectures: ['module_id', 'event_date'],
      todos: ['module_id', 'moodle_course_id', 'due', 'done'],
      moodle_courses: ['name'],
    }[table];
    if (!columns) throw new Error(`Unsupported entity table ${table}`);
    const values = {
      date: item.date || '',
      module_id: item.moduleId || null,
      event_date: item.eventDate || '',
      moodle_course_id: item.moodleCourseId || null,
      due: item.due || '',
      done: item.done ? 1 : 0,
      name: item.name || '',
    };
    const allColumns = ['id', ...columns, 'data_json'];
    const placeholders = allColumns.map(() => '?').join(',');
    const params = [item.id, ...columns.map((column) => values[column]), json(item)];
    if (mode === 'insert') {
      this.db.prepare(`INSERT INTO ${table}(${allColumns.join(',')}) VALUES(${placeholders})`).run(...params);
    } else {
      const assignments = [...columns, 'data_json'].map((column) => `${column}=?`).join(',');
      this.db.prepare(`UPDATE ${table} SET ${assignments} WHERE id=?`)
        .run(...columns.map((column) => values[column]), json(item), item.id);
    }
    return item;
  }

  deleteEntity(table, id) {
    return this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes > 0;
  }

  listModules() {
    const modules = this.db.prepare('SELECT id,data_json FROM modules ORDER BY name COLLATE NOCASE').all();
    const slotQuery = this.db.prepare('SELECT id,data_json FROM module_slots WHERE module_id=? ORDER BY rowid');
    const overrideQuery = this.db.prepare(
      'SELECT event_date,data_json FROM module_slot_overrides WHERE module_id=? AND slot_id=? ORDER BY event_date',
    );
    return modules.map((row) => {
      const mod = parsed(row.data_json, {});
      mod.slots = slotQuery.all(row.id).map((slotRow) => {
        const slot = parsed(slotRow.data_json, {});
        const overrides = {};
        for (const override of overrideQuery.all(row.id, slotRow.id)) {
          overrides[override.event_date] = parsed(override.data_json, {});
        }
        if (Object.keys(overrides).length) slot.overrides = overrides;
        return slot;
      });
      return mod;
    });
  }

  getModule(id) {
    return this.listModules().find((mod) => mod.id === id) || null;
  }

  saveModule(mod, mode = 'insert') {
    const slots = Array.isArray(mod.slots) ? mod.slots : [];
    const base = { ...mod };
    delete base.slots;
    const write = () => {
      if (mode === 'insert') {
        this.db.prepare('INSERT INTO modules(id,name,data_json) VALUES(?,?,?)')
          .run(mod.id, mod.name || '', json(base));
      } else {
        const result = this.db.prepare('UPDATE modules SET name=?,data_json=? WHERE id=?')
          .run(mod.name || '', json(base), mod.id);
        if (!result.changes) return false;
        this.db.prepare('DELETE FROM module_slots WHERE module_id=?').run(mod.id);
      }
      const insertSlot = this.db.prepare('INSERT INTO module_slots(module_id,id,data_json) VALUES(?,?,?)');
      const insertOverride = this.db.prepare(
        'INSERT INTO module_slot_overrides(module_id,slot_id,event_date,data_json) VALUES(?,?,?,?)',
      );
      for (const rawSlot of slots) {
        const slot = { ...rawSlot };
        const overrides = slot.overrides && typeof slot.overrides === 'object' ? slot.overrides : {};
        delete slot.overrides;
        insertSlot.run(mod.id, slot.id, json(slot));
        for (const [date, override] of Object.entries(overrides)) {
          insertOverride.run(mod.id, slot.id, date, json(override));
        }
      }
      return true;
    };
    return this.db.transaction(write)();
  }

  deleteModule(id) {
    return this.deleteEntity('modules', id);
  }

  updateSlot(moduleId, slotId, patch) {
    const row = this.db.prepare('SELECT data_json FROM module_slots WHERE module_id=? AND id=?').get(moduleId, slotId);
    if (!row) return false;
    const slot = { ...parsed(row.data_json, {}), ...patch, id: slotId };
    this.db.prepare('UPDATE module_slots SET data_json=? WHERE module_id=? AND id=?').run(json(slot), moduleId, slotId);
    if (patch.name) {
      const mod = this.getModule(moduleId);
      if (mod) {
        const base = { ...mod, name: patch.name };
        delete base.slots;
        this.db.prepare('UPDATE modules SET name=?,data_json=? WHERE id=?').run(base.name, json(base), moduleId);
      }
    }
    return true;
  }

  setSlotOverride(moduleId, slotId, date, patch) {
    const exists = this.db.prepare('SELECT 1 FROM module_slots WHERE module_id=? AND id=?').get(moduleId, slotId);
    if (!exists) return false;
    const previous = this.db.prepare(
      'SELECT data_json FROM module_slot_overrides WHERE module_id=? AND slot_id=? AND event_date=?',
    ).get(moduleId, slotId, date);
    const value = { ...(previous ? parsed(previous.data_json, {}) : {}), ...patch };
    this.db.prepare(`
      INSERT INTO module_slot_overrides(module_id,slot_id,event_date,data_json) VALUES(?,?,?,?)
      ON CONFLICT(module_id,slot_id,event_date) DO UPDATE SET data_json=excluded.data_json
    `).run(moduleId, slotId, date, json(value));
    return true;
  }

  deleteSlot(moduleId, slotId) {
    return this.db.prepare('DELETE FROM module_slots WHERE module_id=? AND id=?').run(moduleId, slotId).changes > 0;
  }

  listStudyLogs(field, id) {
    const column = field === 'exam' ? 'exam_id' : 'todo_id';
    return this.db.prepare(`SELECT data_json FROM study_logs WHERE ${column}=? ORDER BY date DESC`)
      .all(id).map((row) => parsed(row.data_json, {}));
  }

  createStudyLog(log) {
    this.db.prepare('INSERT INTO study_logs(id,exam_id,todo_id,date,data_json) VALUES(?,?,?,?,?)')
      .run(log.id, log.exam_id || null, log.todo_id || null, log.date || '', json(log));
  }

  settings() {
    const result = {};
    for (const row of this.db.prepare('SELECT key,value_json FROM settings').all()) {
      result[row.key] = parsed(row.value_json);
    }
    return result;
  }

  patchSettings(patch) {
    const statement = this.db.prepare(`
      INSERT INTO settings(key,value_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at
    `);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const [keyName, value] of Object.entries(patch)) statement.run(keyName, json(value), now);
    })();
    return this.settings();
  }

  listChats() {
    return this.db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all().map((row) => ({
      id: row.id,
      title: row.title,
      ...(row.started_at ? { startedAt: row.started_at } : {}),
      updatedAt: row.updated_at,
      messages: parsed(row.messages_json, []),
    }));
  }

  getChat(id) {
    return this.listChats().find((chat) => chat.id === id) || null;
  }

  saveChat(session) {
    this.db.prepare(`
      INSERT INTO chat_sessions(id,title,started_at,updated_at,messages_json) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,
        started_at=COALESCE(excluded.started_at,chat_sessions.started_at),
        updated_at=excluded.updated_at,messages_json=excluded.messages_json
    `).run(session.id, session.title || '', session.startedAt || null,
      session.updatedAt || new Date().toISOString(), json(session.messages || []));
  }

  exportStore() {
    return {
      exams: this.listEntities('exams', 'date'),
      lectures: this.listEntities('lectures'),
      todos: this.listEntities('todos'),
      moodle_courses: this.listEntities('moodle_courses', 'name COLLATE NOCASE'),
      modules: this.listModules(),
      study_logs: this.db.prepare('SELECT data_json FROM study_logs ORDER BY rowid').all()
        .map((row) => parsed(row.data_json, {})),
      settings: this.settings(),
      chat_sessions: this.listChats(),
      modules_migration_v1: true,
    };
  }

  clearDomain() {
    for (const table of ['study_logs', 'todos', 'lectures', 'module_slot_overrides', 'module_slots',
      'modules', 'moodle_courses', 'exams', 'chat_sessions', 'settings']) {
      this.db.prepare(`DELETE FROM ${table}`).run();
    }
  }
}

module.exports = { StudyDatabase, parsed, json };
