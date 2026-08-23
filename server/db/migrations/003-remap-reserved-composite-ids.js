'use strict';

const { remapReservedCompositeIds } = require('../../services/domain');

function json(value) {
  return JSON.stringify(value == null ? null : value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function remapReservedStoredIds(database) {
  const modules = database.listModules();
  const lectures = database.listEntities('lectures');
  const todos = database.listEntities('todos');
  const needsRemap = modules.some(mod => (
    String(mod?.id || '').includes('::')
    || (mod.slots || []).some(slot => String(slot?.id || '').includes('::'))
  )) || lectures.some(lecture => String(lecture?.id || '').includes('::'));
  if (!needsRemap) return;

  const store = {
    modules: clone(modules),
    lectures: clone(lectures),
    todos: clone(todos),
  };
  remapReservedCompositeIds(store, []);

  const sqlite = database.db;
  const insertModule = sqlite.prepare('INSERT INTO modules(id,name,data_json) VALUES(?,?,?)');
  const insertSlot = sqlite.prepare('INSERT INTO module_slots(module_id,id,data_json) VALUES(?,?,?)');
  const insertOverride = sqlite.prepare(
    'INSERT INTO module_slot_overrides(module_id,slot_id,event_date,data_json) VALUES(?,?,?,?)',
  );
  const insertLecture = sqlite.prepare(
    'INSERT INTO lectures(id,module_id,event_date,data_json) VALUES(?,?,?,?)',
  );
  const updateLectureModule = sqlite.prepare(`
    UPDATE lectures
    SET module_id=?, data_json=json_set(data_json, '$.moduleId', ?)
    WHERE module_id=?
  `);
  const updateTodoModule = sqlite.prepare(`
    UPDATE todos
    SET module_id=?, data_json=json_set(data_json, '$.moduleId', ?)
    WHERE module_id=?
  `);
  const deleteModule = sqlite.prepare('DELETE FROM modules WHERE id=?');
  const deleteSlot = sqlite.prepare('DELETE FROM module_slots WHERE module_id=? AND id=?');
  const deleteLecture = sqlite.prepare('DELETE FROM lectures WHERE id=?');

  for (let index = 0; index < modules.length; index += 1) {
    const previous = modules[index];
    const next = store.modules[index];
    const moduleChanged = previous.id !== next.id;
    if (moduleChanged) {
      const base = clone(next);
      delete base.slots;
      insertModule.run(next.id, next.name || '', json(base));
    }
    const previousSlots = previous.slots || [];
    const nextSlots = next.slots || [];
    for (let slotIndex = 0; slotIndex < previousSlots.length; slotIndex += 1) {
      const previousSlot = previousSlots[slotIndex];
      const nextSlot = nextSlots[slotIndex];
      if (!previousSlot || !nextSlot) continue;
      const slotChanged = previousSlot.id !== nextSlot.id;
      if (moduleChanged || slotChanged) {
        const slotJson = clone(nextSlot);
        const overrides = slotJson.overrides && typeof slotJson.overrides === 'object' ? slotJson.overrides : {};
        delete slotJson.overrides;
        insertSlot.run(next.id, nextSlot.id, json(slotJson));
        for (const [date, override] of Object.entries(overrides)) {
          insertOverride.run(next.id, nextSlot.id, date, json(override));
        }
      }
    }
    if (moduleChanged) {
      updateLectureModule.run(next.id, next.id, previous.id);
      updateTodoModule.run(next.id, next.id, previous.id);
      deleteModule.run(previous.id);
    } else {
      for (let slotIndex = 0; slotIndex < previousSlots.length; slotIndex += 1) {
        const previousSlot = previousSlots[slotIndex];
        const nextSlot = nextSlots[slotIndex];
        if (previousSlot && nextSlot && previousSlot.id !== nextSlot.id) {
          deleteSlot.run(previous.id, previousSlot.id);
        }
      }
    }
  }

  for (let index = 0; index < lectures.length; index += 1) {
    const previous = lectures[index];
    const next = store.lectures[index];
    if (previous.id === next.id) continue;
    const payload = clone(next);
    payload.id = next.id;
    insertLecture.run(next.id, next.moduleId || null, next.eventDate || '', json(payload));
    deleteLecture.run(previous.id);
  }

  const problems = sqlite.pragma('foreign_key_check');
  if (problems.length) {
    throw new Error('Reserved ID remapping violated referential integrity');
  }
}

module.exports = remapReservedStoredIds;
