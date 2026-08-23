const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  exams: {
    getAll: () => ipcRenderer.invoke('exams:getAll'),
    create: (exam) => ipcRenderer.invoke('exams:create', exam),
    update: (exam) => ipcRenderer.invoke('exams:update', exam),
    delete: (id) => ipcRenderer.invoke('exams:delete', id),
  },
  lectures: {
    getAll: () => ipcRenderer.invoke('lectures:getAll'),
    create: (lecture) => ipcRenderer.invoke('lectures:create', lecture),
    update: (lecture) => ipcRenderer.invoke('lectures:update', lecture),
    delete: (id) => ipcRenderer.invoke('lectures:delete', id),
  },
  todos: {
    getAll: () => ipcRenderer.invoke('todos:getAll'),
    create: (todo) => ipcRenderer.invoke('todos:create', todo),
    update: (todo) => ipcRenderer.invoke('todos:update', todo),
    delete: (id) => ipcRenderer.invoke('todos:delete', id),
  },
  moodle: {
    getAll: () => ipcRenderer.invoke('moodle:getAll'),
    create: (course) => ipcRenderer.invoke('moodle:create', course),
    update: (course) => ipcRenderer.invoke('moodle:update', course),
    delete: (id) => ipcRenderer.invoke('moodle:delete', id),
  },
  modules: {
    getAll: () => ipcRenderer.invoke('modules:getAll'),
    create: (mod) => ipcRenderer.invoke('modules:create', mod),
    update: (mod) => ipcRenderer.invoke('modules:update', mod),
    delete: (id) => ipcRenderer.invoke('modules:delete', id),
  },
  studyLogs: {
    getByExam: (examId) => ipcRenderer.invoke('studylogs:getByExam', examId),
    getByTodo: (todoId) => ipcRenderer.invoke('studylogs:getByTodo', todoId),
    create: (log) => ipcRenderer.invoke('studylogs:create', log),
    delete: (id) => ipcRenderer.invoke('studylogs:delete', id),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
  },
  ical: {
    fetch: (url) => ipcRenderer.invoke('ical:fetch', url),
  },
  ai: {
    recommend: (context) => ipcRenderer.invoke('ai:recommend', context),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
    models: (opts) => ipcRenderer.invoke('ai:models', opts),
  },
  chats: {
    getAll: () => ipcRenderer.invoke('chats:getAll'),
    get: (id) => ipcRenderer.invoke('chats:get', id),
    save: (session) => ipcRenderer.invoke('chats:save', session),
    delete: (id) => ipcRenderer.invoke('chats:delete', id),
  },
  mensa: {
    fetch: (canteenId) => ipcRenderer.invoke('mensa:fetch', canteenId),
  },
  ollama: {
    getSetupState: () => ipcRenderer.invoke('ollama:getSetupState'),
    retrySetup: () => ipcRenderer.invoke('ollama:retrySetup'),
    onSetupProgress: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('ollama:setup-progress', listener);
      // Return an unsubscribe function for cleanup
      return () => ipcRenderer.removeListener('ollama:setup-progress', listener);
    },
  },
  // Navigation is validated again in the main process. Resolve false instead
  // of leaking an ignored invoke rejection into renderer event handlers.
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url).then(Boolean, () => false),
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: (json) => ipcRenderer.invoke('backup:import', json),
  },
});
