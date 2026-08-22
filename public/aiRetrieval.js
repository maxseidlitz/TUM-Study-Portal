const MAX_RESULTS = 20;
const MAX_SCHEDULE_DAYS = 31;
const MAX_RESULT_BYTES = 16000;

function text(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(raw) {
  if (isObject(raw)) return { ok: true, value: raw };
  if (typeof raw !== 'string') return { ok: false, error: 'Tool-Parameter müssen ein JSON-Objekt sein.' };
  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, error: 'Tool-Parameter müssen ein JSON-Objekt sein.' };
  } catch {
    return { ok: false, error: 'Ungültige Tool-Parameter (kein gültiges JSON).' };
  }
}

function validateKeys(args, allowed) {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  return unknown.length ? `Unbekannte Parameter: ${unknown.join(', ')}.` : '';
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validateLimit(value) {
  if (value == null) return { ok: true, value: MAX_RESULTS };
  if (!Number.isInteger(value) || value < 1 || value > MAX_RESULTS) {
    return { ok: false, error: `limit muss eine ganze Zahl zwischen 1 und ${MAX_RESULTS} sein.` };
  }
  return { ok: true, value };
}

function normalize(value) {
  return text(value, 120).toLocaleLowerCase('de-DE');
}

function includesQuery(values, query) {
  if (!query) return true;
  return values.some((value) => normalize(value).includes(query));
}

function boundedResult(result) {
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded, 'utf8') <= MAX_RESULT_BYTES) return result;
  const rows = Array.isArray(result.results) ? result.results : [];
  const reduced = { ...result, results: [] };
  for (const row of rows) {
    const next = { ...reduced, results: [...reduced.results, row] };
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_RESULT_BYTES) break;
    reduced.results.push(row);
  }
  reduced.truncated = true;
  reduced.count = reduced.results.length;
  return reduced;
}

function notFound(entity, details = '') {
  return boundedResult({
    success: true,
    found: false,
    count: 0,
    results: [],
    message: `${entity} nicht gefunden${details ? ` (${details})` : ''}.`,
  });
}

function failure(error) {
  return { success: false, error };
}

function searchTodos(rawArgs, dataStore) {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) return failure(parsed.error);
  const args = parsed.value;
  const keyError = validateKeys(args, ['query', 'status', 'priority', 'moduleId', 'dueFrom', 'dueTo', 'limit']);
  if (keyError) return failure(keyError);
  if (args.query != null && (typeof args.query !== 'string' || args.query.length > 120)) {
    return failure('query muss ein Text mit maximal 120 Zeichen sein.');
  }
  const status = args.status == null ? 'open' : args.status;
  if (!['open', 'done', 'all'].includes(status)) return failure('status muss open, done oder all sein.');
  if (args.priority != null && !['high', 'medium', 'low'].includes(args.priority)) {
    return failure('priority muss high, medium oder low sein.');
  }
  if (args.moduleId != null && (typeof args.moduleId !== 'string' || !args.moduleId.trim() || args.moduleId.length > 120)) {
    return failure('moduleId muss eine nicht-leere Zeichenkette sein.');
  }
  for (const key of ['dueFrom', 'dueTo']) {
    if (args[key] != null && (typeof args[key] !== 'string' || !validIsoDate(args[key]))) {
      return failure(`${key} muss ein gültiges Datum im Format YYYY-MM-DD sein.`);
    }
  }
  if (args.dueFrom && args.dueTo && args.dueFrom > args.dueTo) {
    return failure('dueFrom darf nicht nach dueTo liegen.');
  }
  const limit = validateLimit(args.limit);
  if (!limit.ok) return failure(limit.error);
  const query = normalize(args.query);
  const modules = new Map((dataStore.modules || []).map((mod) => [String(mod.id), text(mod.name, 120)]));
  const matches = (Array.isArray(dataStore.todos) ? dataStore.todos : [])
    .filter((todo) => {
      if (status === 'open' && todo.done) return false;
      if (status === 'done' && !todo.done) return false;
      if (args.priority && todo.priority !== args.priority) return false;
      if (args.moduleId && String(todo.moduleId || '') !== args.moduleId) return false;
      if (args.dueFrom && (!todo.due || todo.due < args.dueFrom)) return false;
      if (args.dueTo && (!todo.due || todo.due > args.dueTo)) return false;
      return includesQuery([todo.title, todo.subject, todo.notes, modules.get(String(todo.moduleId))], query);
    })
    .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')))
    .slice(0, limit.value)
    .map((todo) => ({
      id: text(todo.id, 120),
      title: text(todo.title, 240),
      done: Boolean(todo.done),
      priority: ['high', 'medium', 'low'].includes(todo.priority) ? todo.priority : 'medium',
      due: validIsoDate(String(todo.due || '')) ? todo.due : '',
      subject: text(todo.subject, 120),
      moduleId: text(todo.moduleId, 120),
      moduleName: modules.get(String(todo.moduleId)) || '',
      notes: text(todo.notes, 300),
    }));
  return matches.length
    ? boundedResult({ success: true, found: true, count: matches.length, results: matches })
    : notFound('Passende Aufgabe');
}

function searchExams(rawArgs, dataStore) {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) return failure(parsed.error);
  const args = parsed.value;
  const keyError = validateKeys(args, ['query', 'from', 'to', 'graded', 'limit']);
  if (keyError) return failure(keyError);
  if (args.query != null && (typeof args.query !== 'string' || args.query.length > 120)) {
    return failure('query muss ein Text mit maximal 120 Zeichen sein.');
  }
  for (const key of ['from', 'to']) {
    if (args[key] != null && (typeof args[key] !== 'string' || !validIsoDate(args[key]))) {
      return failure(`${key} muss ein gültiges Datum im Format YYYY-MM-DD sein.`);
    }
  }
  if (args.from && args.to && args.from > args.to) return failure('from darf nicht nach to liegen.');
  if (args.graded != null && typeof args.graded !== 'boolean') return failure('graded muss ein Boolean sein.');
  const limit = validateLimit(args.limit);
  if (!limit.ok) return failure(limit.error);
  const query = normalize(args.query);
  const matches = (Array.isArray(dataStore.exams) ? dataStore.exams : [])
    .filter((exam) => {
      const date = String(exam.date || '');
      if (args.from && (!validIsoDate(date) || date < args.from)) return false;
      if (args.to && (!validIsoDate(date) || date > args.to)) return false;
      if (args.graded === true && (exam.grade == null || exam.grade === '')) return false;
      if (args.graded === false && exam.grade != null && exam.grade !== '') return false;
      return includesQuery([exam.name, exam.room, exam.notes], query);
    })
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')))
    .slice(0, limit.value)
    .map((exam) => ({
      id: text(exam.id, 120),
      name: text(exam.name, 240),
      date: validIsoDate(String(exam.date || '')) ? exam.date : '',
      time: text(exam.time, 20),
      room: text(exam.room, 100),
      credits: typeof exam.credits === 'number' ? exam.credits : text(exam.credits, 20),
      grade: typeof exam.grade === 'number' ? exam.grade : text(exam.grade, 20),
    }));
  return matches.length
    ? boundedResult({ success: true, found: true, count: matches.length, results: matches })
    : notFound('Passende Prüfung');
}

const DAY_CODES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function datesBetween(from, to) {
  const result = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end && result.length <= MAX_SCHEDULE_DAYS) {
    result.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function scheduleRows(dataStore, from, to) {
  const rows = [];
  const dates = datesBetween(from, to);
  const modules = Array.isArray(dataStore.modules) ? dataStore.modules : [];
  for (const mod of modules) {
    for (const slot of Array.isArray(mod.slots) ? mod.slots : []) {
      const overrides = isObject(slot.overrides) ? slot.overrides : {};
      for (const date of dates) {
        const day = DAY_CODES[new Date(`${date}T12:00:00Z`).getUTCDay()];
        const override = overrides[date];
        if (override?.canceled || (!override && slot.day !== day)) continue;
        if (override && slot.day !== day && !Object.keys(override).some((key) => ['time', 'end_time', 'room'].includes(key))) {
          continue;
        }
        rows.push({
          id: text(`${mod.id || ''}::${slot.id || ''}::${date}`, 240),
          moduleId: text(mod.id, 120),
          name: text(mod.name, 200),
          date,
          day,
          time: text(override?.time != null ? override.time : slot.time, 20),
          endTime: text(override?.end_time != null ? override.end_time : slot.end_time, 20),
          room: text(override?.room != null ? override.room : slot.room, 100),
          lecturer: text(slot.lecturer, 100),
          allDay: Boolean(slot.allDay),
        });
      }
    }
  }
  for (const lecture of Array.isArray(dataStore.lectures) ? dataStore.lectures : []) {
    if (lecture.eventDate) {
      const date = String(lecture.eventDate).slice(0, 10);
      if (date >= from && date <= to) {
        rows.push({
          id: text(lecture.id, 120),
          moduleId: text(lecture.moduleId, 120),
          name: text(lecture.name, 200),
          date,
          day: text(lecture.day, 10),
          time: text(lecture.time, 20),
          endTime: text(lecture.end_time, 20),
          room: text(lecture.room, 100),
          lecturer: text(lecture.lecturer, 100),
          allDay: Boolean(lecture.allDay),
        });
      }
    } else {
      for (const date of dates) {
        const day = DAY_CODES[new Date(`${date}T12:00:00Z`).getUTCDay()];
        if (lecture.day !== day) continue;
        rows.push({
          id: text(`${lecture.id || ''}::${date}`, 180),
          moduleId: text(lecture.moduleId, 120),
          name: text(lecture.name, 200),
          date,
          day,
          time: text(lecture.time, 20),
          endTime: text(lecture.end_time, 20),
          room: text(lecture.room, 100),
          lecturer: text(lecture.lecturer, 100),
          allDay: Boolean(lecture.allDay),
        });
      }
    }
  }
  return rows.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function getSchedule(rawArgs, dataStore, todayIso) {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) return failure(parsed.error);
  const args = parsed.value;
  const keyError = validateKeys(args, ['from', 'to', 'query', 'moduleId', 'limit']);
  if (keyError) return failure(keyError);
  const from = args.from == null ? todayIso : args.from;
  const to = args.to == null ? from : args.to;
  if (typeof from !== 'string' || !validIsoDate(from)) return failure('from muss ein gültiges Datum im Format YYYY-MM-DD sein.');
  if (typeof to !== 'string' || !validIsoDate(to)) return failure('to muss ein gültiges Datum im Format YYYY-MM-DD sein.');
  if (from > to) return failure('from darf nicht nach to liegen.');
  const span = datesBetween(from, to);
  if (!span.length || span.length > MAX_SCHEDULE_DAYS) {
    return failure(`Der abgefragte Zeitraum darf maximal ${MAX_SCHEDULE_DAYS} Tage umfassen.`);
  }
  if (args.query != null && (typeof args.query !== 'string' || args.query.length > 120)) {
    return failure('query muss ein Text mit maximal 120 Zeichen sein.');
  }
  if (args.moduleId != null && (typeof args.moduleId !== 'string' || !args.moduleId.trim() || args.moduleId.length > 120)) {
    return failure('moduleId muss eine nicht-leere Zeichenkette sein.');
  }
  const limit = validateLimit(args.limit);
  if (!limit.ok) return failure(limit.error);
  const query = normalize(args.query);
  const matches = scheduleRows(dataStore, from, to)
    .filter((row) => (!args.moduleId || row.moduleId === args.moduleId)
      && includesQuery([row.name, row.room, row.lecturer], query))
    .slice(0, limit.value);
  return matches.length
    ? boundedResult({ success: true, found: true, from, to, count: matches.length, results: matches })
    : notFound('Passender Termin', `${from} bis ${to}`);
}

function compactModule(mod) {
  return {
    id: text(mod.id, 120),
    name: text(mod.name, 240),
    code: text(mod.code, 80),
    semester: text(mod.semester, 80),
    hasMoodleUrl: Boolean(mod.moodleUrl),
    slots: (Array.isArray(mod.slots) ? mod.slots : []).slice(0, MAX_RESULTS).map((slot) => ({
      id: text(slot.id, 120),
      day: text(slot.day, 10),
      time: text(slot.time, 20),
      endTime: text(slot.end_time, 20),
      room: text(slot.room, 100),
      lecturer: text(slot.lecturer, 100),
      allDay: Boolean(slot.allDay),
    })),
  };
}

function getModule(rawArgs, dataStore) {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) return failure(parsed.error);
  const args = parsed.value;
  const keyError = validateKeys(args, ['id', 'query']);
  if (keyError) return failure(keyError);
  const hasId = typeof args.id === 'string' && Boolean(args.id.trim());
  const hasQuery = typeof args.query === 'string' && Boolean(args.query.trim());
  if (hasId === hasQuery) return failure('Genau einer der Parameter id oder query ist erforderlich.');
  if ((args.id != null && (typeof args.id !== 'string' || args.id.length > 120))
    || (args.query != null && (typeof args.query !== 'string' || args.query.length > 120))) {
    return failure('id/query muss ein Text mit maximal 120 Zeichen sein.');
  }
  const modules = Array.isArray(dataStore.modules) ? dataStore.modules : [];
  if (hasId) {
    const found = modules.find((mod) => String(mod.id) === args.id.trim());
    return found
      ? boundedResult({ success: true, found: true, result: compactModule(found) })
      : notFound('Modul', `ID ${text(args.id, 120)}`);
  }
  const query = normalize(args.query);
  const matches = modules
    .filter((mod) => includesQuery([mod.name, mod.code, mod.semester], query))
    .slice(0, MAX_RESULTS)
    .map(compactModule);
  if (!matches.length) return notFound('Modul', `Suche ${text(args.query, 120)}`);
  if (matches.length === 1) return boundedResult({ success: true, found: true, result: matches[0] });
  return boundedResult({
    success: true,
    found: false,
    ambiguous: true,
    count: matches.length,
    results: matches,
    message: 'Mehrere Module passen. Erneut mit einer exakten Modul-ID abfragen.',
  });
}

function canonicalToolCall(name, rawArgs) {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) return `${name}:invalid:${String(rawArgs)}`;
  const sorted = Object.keys(parsed.value).sort().reduce((acc, key) => {
    acc[key] = parsed.value[key];
    return acc;
  }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

function executeReadOnlyTool(name, rawArgs, dataStore, todayIso) {
  if (name === 'search_todos') return searchTodos(rawArgs, dataStore);
  if (name === 'search_exams') return searchExams(rawArgs, dataStore);
  if (name === 'get_schedule') return getSchedule(rawArgs, dataStore, todayIso);
  if (name === 'get_module') return getModule(rawArgs, dataStore);
  return failure(`Unbekannte Funktion: ${text(name, 80)}`);
}

module.exports = {
  MAX_RESULTS,
  MAX_SCHEDULE_DAYS,
  canonicalToolCall,
  executeReadOnlyTool,
  getModule,
  getSchedule,
  searchExams,
  searchTodos,
  validIsoDate,
};
