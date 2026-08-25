const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { parseIcal, eventsToCalendarItems } = require('./ical');
const { isSafeExternalUrl } = require('./externalUrl');
const {
  store, saveStore, initStore,
  getMergedLecturesForClient, parseCompositeLectureId, setSlotOverride,
  exportBackupJson, importBackupJson,
} = require('./store');
const {
  DEFAULT_MODEL, normalizeOllamaUrl, describeConnectionError, listOllamaModels,
  sanitizeGeminiModelId, GEMINI_MODEL_PRESETS,
  aiRecommendOllama, aiChatOllama, aiRecommendGemini, aiChatGemini,
} = require('./ai');

const isSmokeTest = process.env.ELECTRON_SMOKE_TEST === '1';
const isDev = !isSmokeTest && (process.env.NODE_ENV === 'development' || !app.isPackaged);

let mainWindow;

// ---- App Menu (Fix: Maximieren über Menüleiste) ----
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Fenster',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveAppIcon() {
  return path.join(
    __dirname,
    app.isPackaged ? '../build/icons/icon-512.png' : 'icons/icon-512.png',
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    icon: resolveAppIcon(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((error) => {
        console.error('Externe URL konnte nicht geöffnet werden:', error.message);
      });
    }
    // Never create a renderer-owned child window with an opener.
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (!isSmokeTest) mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}


function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    mod.get(urlStr, { timeout: 10000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Request timed out')));
  });
}


// ---- IPC Handlers ----
function registerIpcHandlers() {
  // Exams
  ipcMain.handle('exams:getAll', () =>
    [...store.exams].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  );
  ipcMain.handle('exams:create', (_, exam) => {
    store.exams.push(exam); saveStore(); return { success: true };
  });
  ipcMain.handle('exams:update', (_, exam) => {
    store.exams = store.exams.map(e => e.id === exam.id ? exam : e); saveStore(); return { success: true };
  });
  ipcMain.handle('exams:delete', (_, id) => {
    store.exams = store.exams.filter(e => e.id !== id);
    store.study_logs = store.study_logs.filter(l => l.exam_id !== id);
    saveStore(); return { success: true };
  });

  // Lectures (enthält zusätzlich aus Modul-Slots expandierte Einträge mit id "moduleId::slotId")
  ipcMain.handle('lectures:getAll', () => getMergedLecturesForClient());
  ipcMain.handle('lectures:create', (_, lecture) => {
    store.lectures.push(lecture); saveStore(); return { success: true };
  });
  ipcMain.handle('lectures:update', (_, lecture) => {
    const parsed = parseCompositeLectureId(lecture.id);
    if (parsed && parsed.overrideDate) {
      // Einzel-Instanz verschieben/ändern (überschreibt nur diesen Tag)
      return setSlotOverride(parsed.moduleId, parsed.slotId, parsed.overrideDate, {
        canceled: false,
        time: lecture.time || '',
        end_time: lecture.end_time || '',
        room: lecture.room || '',
      });
    }
    if (parsed) {
      const mod = (store.modules || []).find((m) => m.id === parsed.moduleId);
      if (!mod) return { success: false, error: 'Modul nicht gefunden.' };
      const slots = [...(mod.slots || [])];
      const si = slots.findIndex((s) => s.id === parsed.slotId);
      if (si < 0) return { success: false, error: 'Termin nicht gefunden.' };
      slots[si] = {
        ...slots[si],
        day: lecture.day,
        time: lecture.time || '',
        end_time: lecture.end_time || '',
        room: lecture.room || '',
        lecturer: lecture.lecturer || '',
        allDay: Boolean(lecture.allDay),
      };
      const nextMod = { ...mod, slots, name: lecture.name != null && String(lecture.name).trim() ? lecture.name : mod.name };
      store.modules = (store.modules || []).map((m) => (m.id === nextMod.id ? nextMod : m));
      saveStore();
      return { success: true };
    }
    store.lectures = store.lectures.map(l => l.id === lecture.id ? lecture : l); saveStore(); return { success: true };
  });
  ipcMain.handle('lectures:delete', (_, id) => {
    const parsed = parseCompositeLectureId(id);
    if (parsed && parsed.overrideDate) {
      // Einzel-Instanz absagen (Reihe bleibt bestehen)
      return setSlotOverride(parsed.moduleId, parsed.slotId, parsed.overrideDate, { canceled: true });
    }
    if (parsed) {
      const mod = (store.modules || []).find((m) => m.id === parsed.moduleId);
      if (!mod) return { success: false, error: 'Modul nicht gefunden.' };
      const slots = (mod.slots || []).filter((s) => s.id !== parsed.slotId);
      store.modules = (store.modules || []).map((m) => (m.id === mod.id ? { ...m, slots } : m));
      saveStore();
      return { success: true };
    }
    store.lectures = store.lectures.filter(l => l.id !== id); saveStore(); return { success: true };
  });

  // Todos
  ipcMain.handle('todos:getAll', () => store.todos);
  ipcMain.handle('todos:create', (_, todo) => {
    store.todos.push(todo); saveStore(); return { success: true };
  });
  ipcMain.handle('todos:update', (_, todo) => {
    store.todos = store.todos.map(t => t.id === todo.id ? todo : t); saveStore(); return { success: true };
  });
  ipcMain.handle('todos:delete', (_, id) => {
    store.todos = store.todos.filter(t => t.id !== id); saveStore(); return { success: true };
  });

  // Moodle
  ipcMain.handle('moodle:getAll', () =>
    [...store.moodle_courses].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );
  ipcMain.handle('moodle:create', (_, c) => {
    store.moodle_courses.push(c); saveStore(); return { success: true };
  });
  ipcMain.handle('moodle:update', (_, c) => {
    store.moodle_courses = store.moodle_courses.map(x => x.id === c.id ? c : x); saveStore(); return { success: true };
  });
  ipcMain.handle('moodle:delete', (_, id) => {
    store.moodle_courses = store.moodle_courses.filter(c => c.id !== id); saveStore(); return { success: true };
  });

  // Module (vereinheitlichte Kurse: Moodle-URL + wöchentliche Termine)
  ipcMain.handle('modules:getAll', () =>
    [...(store.modules || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );
  ipcMain.handle('modules:create', (_, mod) => {
    store.modules = [...(store.modules || []), mod]; saveStore(); return { success: true };
  });
  ipcMain.handle('modules:update', (_, mod) => {
    store.modules = (store.modules || []).map((m) => (m.id === mod.id ? mod : m)); saveStore(); return { success: true };
  });
  ipcMain.handle('modules:delete', (_, id) => {
    store.modules = (store.modules || []).filter((m) => m.id !== id); saveStore(); return { success: true };
  });

  // Study Logs
  ipcMain.handle('studylogs:getByExam', (_, examId) =>
    store.study_logs.filter(l => l.exam_id === examId).sort((a, b) => b.date.localeCompare(a.date))
  );
  ipcMain.handle('studylogs:getByTodo', (_, todoId) =>
    store.study_logs.filter(l => l.todo_id === todoId).sort((a, b) => b.date.localeCompare(a.date))
  );
  ipcMain.handle('studylogs:create', (_, log) => {
    store.study_logs.push(log); saveStore(); return { success: true };
  });
  ipcMain.handle('studylogs:delete', (_, id) => {
    store.study_logs = store.study_logs.filter(l => l.id !== id); saveStore(); return { success: true };
  });

  // Settings
  ipcMain.handle('settings:get', () => store.settings || {});
  ipcMain.handle('settings:save', (_, settings) => {
    store.settings = { ...store.settings, ...settings }; saveStore(); return { success: true };
  });

  // Chat sessions (persisted)
  ipcMain.handle('chats:getAll', () => {
    const list = Array.isArray(store.chat_sessions) ? store.chat_sessions : [];
    return [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  });
  ipcMain.handle('chats:get', (_, id) => {
    if (!id) return null;
    const list = Array.isArray(store.chat_sessions) ? store.chat_sessions : [];
    return list.find(s => s.id === id) || null;
  });
  ipcMain.handle('chats:save', (_, session) => {
    if (!session || typeof session.id !== 'string' || !session.id.trim()) {
      return { success: false, error: 'Ungültige Chat-Session.' };
    }
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const list = Array.isArray(store.chat_sessions) ? [...store.chat_sessions] : [];
    const sid = session.id.trim();
    const idx = list.findIndex(s => s.id === sid);
    const prev = idx >= 0 ? list[idx] : null;
    const isoNow = new Date().toISOString();
    let startedAt;
    if (typeof session.startedAt === 'string' && session.startedAt.trim()) {
      startedAt = session.startedAt.trim();
    } else if (prev && typeof prev.startedAt === 'string' && prev.startedAt.trim()) {
      startedAt = prev.startedAt.trim();
    } else {
      startedAt = undefined;
    }
    const row = {
      id: sid,
      title: typeof session.title === 'string' ? session.title.slice(0, 200) : '',
      updatedAt: typeof session.updatedAt === 'string' && session.updatedAt
        ? session.updatedAt
        : isoNow,
      messages,
    };
    if (startedAt) row.startedAt = startedAt;
    if (idx >= 0) list[idx] = row;
    else list.unshift(row);
    store.chat_sessions = list;
    saveStore();
    return { success: true };
  });
  ipcMain.handle('chats:delete', (_, id) => {
    if (!id) return { success: false, error: 'Keine ID.' };
    store.chat_sessions = (store.chat_sessions || []).filter(s => s.id !== id);
    const st = store.settings || {};
    if (st.lastActiveChatId === id) {
      store.settings = { ...st, lastActiveChatId: '' };
    }
    saveStore();
    return { success: true };
  });
  console.log('[IPC] Chat-Sessions: getAll / get / save / delete registriert.');

  // iCal
  ipcMain.handle('ical:fetch', async (_, url) => {
    try {
      const text = await fetchUrl(url);
      const events = parseIcal(text);
      const items = eventsToCalendarItems(events);
      return { success: true, items, eventCount: events.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // AI — Ollama (lokal) oder Google Gemini (online)
  ipcMain.handle('ai:models', async (_, arg) => {
    const persisted = store.settings || {};
    const opts = typeof arg === 'string'
      ? { ollamaUrl: arg }
      : (arg && typeof arg === 'object' ? arg : {});
    const settings = { ...persisted, ...opts };
    const provider = settings.aiProvider === 'gemini' ? 'gemini' : 'ollama';

    if (provider === 'gemini') {
      const merged = [...GEMINI_MODEL_PRESETS];
      const custom = sanitizeGeminiModelId(settings.geminiModel);
      if (
        custom
        && GEMINI_MODEL_PRESETS.indexOf(custom) === -1
        && merged.indexOf(custom) === -1
      ) {
        merged.unshift(custom);
      }
      return { success: true, models: merged };
    }

    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
    try {
      const models = await listOllamaModels(ollamaUrl);
      return { success: true, models };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('ai:recommend', async (_, context) => {
    const settings = store.settings || {};
    const provider = settings.aiProvider === 'gemini' ? 'gemini' : 'ollama';

    try {
      let content;
      let model;
      if (provider === 'gemini') {
        ({ content, model } = await aiRecommendGemini(settings, context));
      } else {
        ({ content, model } = await aiRecommendOllama(settings, context));
      }
      return { success: true, content, model };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('ai:chat', async (_, payload = {}) => {
    const settings = store.settings || {};
    const provider = settings.aiProvider === 'gemini' ? 'gemini' : 'ollama';

    try {
      const messages = payload?.messages;
      const rawContext = payload?.context ?? {};
      if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
        throw new Error('Ungültiger KI-Chat-Kontext.');
      }
      const allowedContextKeys = ['locale', 'today', 'allowTodoWrites'];
      if (Object.keys(rawContext).some(key => !allowedContextKeys.includes(key))) {
        throw new Error('Unbekanntes Feld im KI-Chat-Kontext.');
      }
      if (rawContext.allowTodoWrites != null && typeof rawContext.allowTodoWrites !== 'boolean') {
        throw new Error('allowTodoWrites muss ein Boolean sein.');
      }
      if (rawContext.locale != null && !['de', 'en', 'tr'].includes(rawContext.locale)) {
        throw new Error('Ungültige Sprache im KI-Chat-Kontext.');
      }
      if (rawContext.today != null
        && (typeof rawContext.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawContext.today))) {
        throw new Error('Ungültiges Datum im KI-Chat-Kontext.');
      }
      const context = {
        ...(rawContext.locale == null ? {} : { locale: rawContext.locale }),
        ...(rawContext.today == null ? {} : { today: rawContext.today }),
        allowTodoWrites: rawContext.allowTodoWrites === true,
      };
      let result;
      if (provider === 'gemini') {
        result = await aiChatGemini(settings, messages, context);
      } else {
        result = await aiChatOllama(settings, messages, context);
      }
      return { success: true, ...result, todoActions: result.todoActions || [] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('shell:openExternal', async (_, url) => {
    if (!isSafeExternalUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  // Backup — Export / Import
  ipcMain.handle('backup:export', () => {
    try {
      return { success: true, data: exportBackupJson() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('backup:import', (_, jsonString) => {
    try {
      return importBackupJson(jsonString);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Mensa
  ipcMain.handle('mensa:fetch', async (_, canteenId) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const url = `https://openmensa.org/api/v2/canteens/${canteenId}/days/${today}/meals`;
      const data = await fetchUrl(url);
      return { success: true, meals: JSON.parse(data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}


// ---- Ollama Lifecycle ----
// Beim App-Start wird geprüft, ob bereits ein Ollama-Server läuft. Falls nicht,
// wird einer gestartet (gebündelte Windows-Runtime oder System-Installation).
// Einen selbst gestarteten Server beendet die App beim Schließen wieder; ein
// bereits vorhandener (vom Nutzer gestarteter) Server bleibt unangetastet.
// Das Modell wird nicht gebündelt, sondern beim ersten Start heruntergeladen.

let ollamaProcess = null; // child process — only set if WE started Ollama
let ollamaSetupState = { phase: 'idle', percent: 0, message: '', model: DEFAULT_MODEL };

function sendSetupState(patch) {
  ollamaSetupState = { ...ollamaSetupState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ollama:setup-progress', ollamaSetupState);
  }
}

// Absolute path to the bundled ollama executable, or null if not bundled.
function bundledOllamaPath() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return null;
  const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  const exe = path.join(process.resourcesPath, 'ollama', name);
  return fs.existsSync(exe) ? exe : null;
}

// Find an ollama executable: bundled runtime first, then known system install
// locations, then the bare command via PATH as a last resort.
function findOllamaExecutable() {
  const bundled = bundledOllamaPath();
  if (bundled) return bundled;

  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
        path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe'),
      ]
    : [
        '/usr/local/bin/ollama',
        '/opt/homebrew/bin/ollama',
        '/usr/bin/ollama',
      ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return process.platform === 'win32' ? 'ollama.exe' : 'ollama';
}

// Resolves true if an Ollama server is already answering on the URL.
function isOllamaUp(ollamaUrl) {
  return listOllamaModels(ollamaUrl).then(() => true).catch(() => false);
}

// Poll until Ollama is reachable or the timeout elapses.
function waitForOllama(ollamaUrl, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await isOllamaUp(ollamaUrl)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 1000);
    };
    tick();
  });
}

// Start an ollama server (bundled or system install).
// Returns true once it is reachable. The spawned process is tracked in
// `ollamaProcess` so it can be stopped again when the app quits.
async function startOllamaServer(ollamaUrl) {
  const bundled = bundledOllamaPath();
  const exe = findOllamaExecutable();
  const spawnOpts = {
    env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
    stdio: 'ignore',
    windowsHide: true,
  };
  // Dylibs der gebündelten macOS-Runtime liegen neben dem Binary
  if (bundled && exe === bundled && process.platform === 'darwin') {
    spawnOpts.cwd = path.dirname(bundled);
  }
  try {
    ollamaProcess = spawn(exe, ['serve'], spawnOpts);
    // ENOENT (ollama nicht installiert) kommt asynchron als 'error'-Event.
    ollamaProcess.on('error', (e) => {
      console.error('Ollama konnte nicht gestartet werden:', e.message);
      ollamaProcess = null;
    });
    ollamaProcess.on('exit', () => { ollamaProcess = null; });
    return await waitForOllama(ollamaUrl, 30000);
  } catch (e) {
    console.error('Ollama konnte nicht gestartet werden:', e.message);
    return false;
  }
}

// Pull a model via /api/pull, streaming NDJSON progress to the renderer.
function pullOllamaModel(ollamaUrl, model) {
  return new Promise((resolve, reject) => {
    const base = normalizeOllamaUrl(ollamaUrl);
    let parsed;
    try {
      parsed = new URL(`${base}/api/pull`);
    } catch (e) {
      return reject(new Error(`Ungültige Ollama-URL: ${base}`));
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ model, stream: true });
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 11434,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk;
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const j = JSON.parse(line);
              if (j.error) { req.destroy(); return reject(new Error(j.error)); }
              if (j.total && j.completed != null) {
                const pct = Math.max(0, Math.min(100, Math.round((j.completed / j.total) * 100)));
                sendSetupState({ phase: 'downloading', percent: pct, message: j.status || 'Lade Modell…' });
              } else if (j.status) {
                sendSetupState({ message: j.status });
              }
            } catch { /* ignore partial line */ }
          }
        });
        res.on('end', () => resolve());
      }
    );
    req.on('error', (e) => reject(new Error(describeConnectionError(e, base))));
    // Pulling several GB can take a long time — no inactivity timeout.
    req.write(body);
    req.end();
  });
}

// Orchestrate: ensure Ollama is running + the model is present.
async function runOllamaSetup() {
  const settings = store.settings || {};
  const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
  const model = settings.ollamaModel || DEFAULT_MODEL;
  ollamaSetupState.model = model;

  sendSetupState({ phase: 'starting', percent: 0, message: 'Starte KI-Dienst…' });

  // 1) Already running? (system Ollama, or a previous instance)
  let up = await isOllamaUp(ollamaUrl);

  // 2) Otherwise start a server (bundled runtime or system install)
  if (!up) up = await startOllamaServer(ollamaUrl);

  if (!up) {
    // App stays usable — AI features fall back to local rule-based logic.
    sendSetupState({ phase: 'unavailable', message: 'Ollama nicht verfügbar.' });
    return;
  }

  // 3) Model already installed?
  let models = [];
  try { models = await listOllamaModels(ollamaUrl); } catch { models = []; }
  const hasModel = models.some(m => m === model || m.startsWith(`${model}:`));
  if (hasModel) {
    sendSetupState({ phase: 'ready', percent: 100, message: 'Bereit.' });
    return;
  }

  // 4) Download the model (one-time, several GB)
  sendSetupState({ phase: 'downloading', percent: 0, message: `Lade Modell ${model}…` });
  try {
    await pullOllamaModel(ollamaUrl, model);
    sendSetupState({ phase: 'ready', percent: 100, message: 'Modell geladen.' });
  } catch (e) {
    sendSetupState({ phase: 'error', message: `Modell-Download fehlgeschlagen: ${e.message}` });
  }
}

function registerOllamaIpc() {
  ipcMain.handle('ollama:getSetupState', () => ollamaSetupState);
  ipcMain.handle('ollama:retrySetup', async () => {
    await runOllamaSetup();
    return ollamaSetupState;
  });
}

app.whenReady().then(() => {
  const iconPath = resolveAppIcon();
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }
  buildMenu();
  initStore();
  registerIpcHandlers();
  registerOllamaIpc();
  createWindow();

  if (isSmokeTest && mainWindow) {
    const timeout = setTimeout(() => {
      console.error('ELECTRON_SMOKE_FAILED renderer timeout');
      app.exit(1);
    }, 15000);
    mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
      clearTimeout(timeout);
      console.error(`ELECTRON_SMOKE_FAILED ${code} ${description}`);
      app.exit(1);
    });
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const result = await mainWindow.webContents.executeJavaScript(
          `({
            protocol: location.protocol,
            hasRoot: Boolean(document.querySelector('#root > *')),
            title: document.title
          })`,
        );
        if (result.protocol !== 'file:' || !result.hasRoot || result.title !== 'TUM Study Portal') {
          throw new Error(`unexpected renderer state: ${JSON.stringify(result)}`);
        }
        clearTimeout(timeout);
        console.log('ELECTRON_SMOKE_OK');
        app.exit(0);
      } catch (error) {
        clearTimeout(timeout);
        console.error(`ELECTRON_SMOKE_FAILED ${error.message}`);
        app.exit(1);
      }
    });
  } else if (mainWindow) {
    // Kick off Ollama setup once the renderer can receive progress events.
    mainWindow.webContents.once('did-finish-load', () => { runOllamaSetup(); });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Beim App-Ende den selbst gestarteten Ollama-Server beenden.
// Ein bereits laufender (vom Nutzer gestarteter) Server wird nicht angetastet,
// da `ollamaProcess` dann null ist.
app.on('will-quit', () => {
  if (ollamaProcess) {
    try { ollamaProcess.kill(); } catch { /* noop */ }
    ollamaProcess = null;
  }
});
