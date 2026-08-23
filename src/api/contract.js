/**
 * Runtime description of the renderer API contract.
 *
 * Keeping this list executable lets adapters be checked in tests and during
 * development without introducing a TypeScript build step.
 */
export const API_METHODS = Object.freeze([
  'exams.getAll', 'exams.create', 'exams.update', 'exams.delete',
  'lectures.getAll', 'lectures.create', 'lectures.update', 'lectures.delete',
  'todos.getAll', 'todos.create', 'todos.update', 'todos.delete',
  'moodle.getAll', 'moodle.create', 'moodle.update', 'moodle.delete',
  'modules.getAll', 'modules.create', 'modules.update', 'modules.delete',
  'studyLogs.getByExam', 'studyLogs.getByTodo', 'studyLogs.create', 'studyLogs.delete',
  'settings.get', 'settings.save',
  'ical.fetch',
  'ai.recommend', 'ai.chat', 'ai.models',
  'chats.getAll', 'chats.get', 'chats.save', 'chats.delete',
  'mensa.fetch',
  'ollama.getSetupState', 'ollama.retrySetup', 'ollama.onSetupProgress',
  'openExternal',
  'backup.export', 'backup.import',
]);

function valueAtPath(object, path) {
  return path.split('.').reduce((value, part) => value?.[part], object);
}

export function assertApiContract(api, adapterName = 'API adapter') {
  const missing = API_METHODS.filter(path => typeof valueAtPath(api, path) !== 'function');
  if (missing.length > 0) {
    throw new Error(`${adapterName} does not implement: ${missing.join(', ')}`);
  }
  return api;
}
