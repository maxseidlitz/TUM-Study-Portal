const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { parseIcal, eventsToCalendarItems } = require('./ical');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- JSON File Store ----
let dbPath;
let store = {
  exams: [], lectures: [], todos: [], moodle_courses: [],
  modules: [],
  study_logs: [], settings: {}, chat_sessions: [],
};

function loadStore() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      store = {
        exams: [], lectures: [], todos: [], moodle_courses: [],
        modules: [],
        study_logs: [], settings: {}, chat_sessions: [],
        ...JSON.parse(raw),
      };
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

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    mod.get(urlStr, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Request timed out')));
  });
}

// ---- Ollama Integration ----

function normalizeOllamaUrl(url) {
  return (url || 'http://localhost:11434').trim().replace(/\/+$/, '');
}

function describeConnectionError(e, ollamaUrl) {
  if (e.code === 'ECONNREFUSED') {
    return `Keine Verbindung zu Ollama (${ollamaUrl}). Läuft der Ollama-Dienst? Starte ihn mit "ollama serve".`;
  }
  if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') {
    return `Ollama-Server "${ollamaUrl}" nicht erreichbar – Adresse prüfen.`;
  }
  return e.message || 'Netzwerkfehler bei der Verbindung zu Ollama.';
}

// List installed Ollama models via /api/tags
function listOllamaModels(ollamaUrl) {
  return new Promise((resolve, reject) => {
    const base = normalizeOllamaUrl(ollamaUrl);
    let parsed;
    try {
      parsed = new URL(`${base}/api/tags`);
    } catch (e) {
      return reject(new Error(`Ungültige Ollama-URL: ${base}`));
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(parsed, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve((json.models || []).map(m => m.name).filter(Boolean));
        } catch (e) {
          reject(new Error('Ungültige Antwort von Ollama (/api/tags).'));
        }
      });
    });
    req.on('error', (e) => reject(new Error(describeConnectionError(e, base))));
    req.on('timeout', () => { req.destroy(); reject(new Error('Zeitüberschreitung beim Abruf der Modell-Liste.')); });
  });
}

// Default model bundled/expected by the app
const DEFAULT_MODEL = 'gemma4:e2b';

// Resolve which model to use: prefer the configured one, then the app default
// (gemma4:e2b), then any installed model. Never blindly pick the largest model.
async function resolveModel(ollamaUrl, preferred) {
  let models = [];
  try {
    models = await listOllamaModels(ollamaUrl);
  } catch (e) {
    return preferred || DEFAULT_MODEL; // let callOllama surface the real error
  }
  if (!models.length) return preferred || DEFAULT_MODEL;
  const matchIn = (name) =>
    name && models.find(m => m === name || m.startsWith(`${name}:`));
  // 1) explicitly configured model
  const configured = matchIn(preferred);
  if (configured) return configured;
  // 2) the app default model
  const fallbackDefault = matchIn(DEFAULT_MODEL);
  if (fallbackDefault) return fallbackDefault;
  // 3) last resort: first installed model
  return models[0];
}

/** Reduziert HTTP-Runden zu Ollama: Modellwahl kurz cachen. */
let ollamaModelResolveCache = { key: '', model: '', at: 0 };
const OLLAMA_MODEL_CACHE_MS = 60000;
async function resolveModelCached(ollamaUrl, preferred) {
  const key = `${normalizeOllamaUrl(ollamaUrl || '')}|${preferred || ''}`;
  const now = Date.now();
  if (
    ollamaModelResolveCache.key === key
    && now - ollamaModelResolveCache.at < OLLAMA_MODEL_CACHE_MS
    && ollamaModelResolveCache.model
  ) {
    return ollamaModelResolveCache.model;
  }
  const model = await resolveModel(ollamaUrl, preferred);
  ollamaModelResolveCache = { key, model, at: now };
  return model;
}

/**
 * POST /api/chat — JSON-Körper wie in der Ollama-Doku (0.20+): bei deaktiviertem Reasoning
 * Top-Level `think: false` unmittelbar nach `model`, dann `messages`, dann `stream: false`.
 */
function buildOllamaApiChatBody(model, settings, rest) {
  const r = rest && typeof rest === 'object' ? { ...rest } : {};
  delete r.think;

  if (settings?.ollamaDisableReasoning === true) {
    return {
      model,
      think: false,
      ...r,
      stream: false,
    };
  }

  return {
    model,
    ...r,
    stream: false,
  };
}

/** Ergänzt den System-Prompt, falls Modelle `think: false` ignorieren (bekannt z. B. bei manchen Qwen-Builds). */
function augmentOllamaSystemForNoReasoning(systemPrompt, settings) {
  if (!systemPrompt || settings?.ollamaDisableReasoning !== true) return systemPrompt;
  return `${systemPrompt}\n\n[Wichtig für diesen Aufruf: Antworte nur mit der finalen Antwort; keine ausführlichen Denk-Schritte davor und keine Reasoning-/Thinking-Markierungen im Text.]`;
}

function callOllama(ollamaUrl, model, messages, settings) {
  return new Promise((resolve, reject) => {
    const base = normalizeOllamaUrl(ollamaUrl);
    let body;
    try {
      body = JSON.stringify(buildOllamaApiChatBody(model, settings, { messages }));
    } catch (e) {
      return reject(new Error('Anfrage-Daten konnten nicht serialisiert werden.'));
    }

    let parsed;
    try {
      parsed = new URL(`${base}/api/chat`);
    } catch (e) {
      return reject(new Error(`Ungültige Ollama-URL: ${base}`));
    }

    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 11434),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch (e) {
            return reject(new Error(
              res.statusCode >= 400
                ? `Ollama-Fehler (HTTP ${res.statusCode}).`
                : 'Ollama lieferte eine ungültige Antwort.'
            ));
          }
          // Ollama reports problems (e.g. missing model) via an "error" field
          if (json.error) {
            return reject(new Error(json.error));
          }
          if (res.statusCode >= 400) {
            return reject(new Error(`Ollama-Fehler (HTTP ${res.statusCode}).`));
          }
          const content = json.message?.content || json.response || '';
          if (!content.trim()) {
            return reject(new Error('Ollama lieferte eine leere Antwort. Ist das Modell korrekt geladen?'));
          }
          resolve(content);
        });
      }
    );
    // Inactivity timeout – local inference (incl. first-time model load) can be slow
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Zeitüberschreitung – Ollama hat nicht innerhalb von 3 Minuten geantwortet.'));
    });
    req.on('error', (e) => reject(new Error(describeConnectionError(e, base))));
    req.write(body);
    req.end();
  });
}

const CHAT_MAX_TOOL_TURNS = 5;

function generateTodoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Legt ein To-Do in store an (KI-Tool). Rückgabe ist JSON-serialisierbar für Function-/Tool-Antworten. */
function executeCreateTodo(rawArgs) {
  let args = rawArgs;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch (e) {
      return { success: false, error: 'Ungültige Tool-Parameter (kein JSON).' };
    }
  }
  if (!args || typeof args !== 'object') {
    return { success: false, error: 'Ungültige Tool-Parameter.' };
  }

  const title = String(args.title ?? '').trim();
  if (!title) return { success: false, error: 'Titel (title) fehlt oder ist leer.' };
  if (title.length > 500) return { success: false, error: 'Titel zu lang (max. 500 Zeichen).' };

  let priority = String(args.priority ?? 'medium').toLowerCase();
  if (!['high', 'medium', 'low'].includes(priority)) priority = 'medium';

  let due = String(args.due ?? '').trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    due = '';
  }
  if (due) {
    const d = new Date(`${due}T12:00:00`);
    if (Number.isNaN(d.getTime())) due = '';
  }

  const subject = String(args.subject ?? '').trim().slice(0, 200);
  const notes = String(args.notes ?? '').trim().slice(0, 5000);

  let moodleCourseId = String(args.moodleCourseId ?? '').trim();
  if (moodleCourseId && !(store.moodle_courses || []).some((c) => c.id === moodleCourseId)) {
    moodleCourseId = '';
  }

  let moduleId = String(args.moduleId ?? '').trim();
  if (moduleId && !(store.modules || []).some((m) => m.id === moduleId)) {
    moduleId = '';
  }

  let resolvedSubject = subject;
  if (moduleId) {
    const mod = (store.modules || []).find((m) => m.id === moduleId);
    if (mod && !resolvedSubject) resolvedSubject = String(mod.name || '').slice(0, 200);
  } else if (moodleCourseId) {
    const c = (store.moodle_courses || []).find((x) => x.id === moodleCourseId);
    if (c && !resolvedSubject) resolvedSubject = String(c.name || '').slice(0, 200);
  }

  const id = generateTodoId();
  const todo = {
    id,
    title,
    priority,
    subject: resolvedSubject,
    due,
    notes,
    done: false,
    ...(moodleCourseId ? { moodleCourseId } : {}),
    ...(moduleId ? { moduleId } : {}),
  };
  store.todos.push(todo);
  saveStore();
  return {
    success: true,
    id,
    title,
    priority,
    subject: resolvedSubject,
    due,
    moduleId: moduleId || undefined,
    moodleCourseId: moodleCourseId || undefined,
    message: 'Aufgabe wurde in der App gespeichert.',
  };
}

const CREATE_TODO_OLLAMA_TOOL = {
  type: 'function',
  function: {
    name: 'create_todo',
    description:
      'Legt eine neue Aufgabe in der To-Do-Liste der App an. Nur nutzen, wenn der Nutzer ausdrücklich darum bittet.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Kurzer Aufgabentitel' },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Priorität (Standard: medium)',
        },
        subject: { type: 'string', description: 'Optional: Fach / Modul (Freitext)' },
        moduleId: { type: 'string', description: 'Optional: ID eines Moduls aus der App (Kurs)' },
        moodleCourseId: { type: 'string', description: 'Optional: ID eines Moodle-Kurses (Legacy, falls noch vorhanden)' },
        due: { type: 'string', description: 'Optional: Fälligkeit als YYYY-MM-DD' },
        notes: { type: 'string', description: 'Optional: Notizen' },
      },
      required: ['title'],
    },
  },
};

const GEMINI_CREATE_TODO_DECLARATION = {
  name: 'create_todo',
  description:
    'Legt eine neue Aufgabe in der To-Do-Liste der App an. Nur nutzen, wenn der Nutzer ausdrücklich darum bittet.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Kurzer Aufgabentitel' },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Priorität (Standard: medium)',
      },
      subject: { type: 'string', description: 'Optional: Fach / Modul (Freitext)' },
      moduleId: { type: 'string', description: 'Optional: Modul-ID aus der App' },
      moodleCourseId: { type: 'string', description: 'Optional: Moodle-Kurs-ID (Legacy)' },
      due: { type: 'string', description: 'Optional: Fälligkeit YYYY-MM-DD' },
      notes: { type: 'string', description: 'Optional: Notizen' },
    },
    required: ['title'],
  },
};

function geminiToolsBody() {
  return [{ functionDeclarations: [GEMINI_CREATE_TODO_DECLARATION] }];
}

function normalizeGeminiFunctionArgs(fc) {
  let a = fc.args;
  if (a == null && fc.arguments != null) a = fc.arguments;
  if (typeof a === 'string') {
    try {
      return JSON.parse(a);
    } catch (e) {
      return {};
    }
  }
  return a && typeof a === 'object' ? a : {};
}

/** Ollama liefert `function.arguments` je nach Modell als JSON-String oder als Objekt (siehe Ollama-Doku). */
function parseOllamaToolArguments(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }
  return {};
}

function extractGeminiFunctionCalls(json) {
  const parts = json.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  return parts.filter(p => p && p.functionCall).map(p => p.functionCall);
}

function collectTodoToolResults(todoActionResults) {
  return (todoActionResults || [])
    .filter(r => r && r.success && r.id)
    .map(r => ({ id: r.id, title: r.title, priority: r.priority }));
}

/** POST /api/chat — vollständige JSON-Antwort (inkl. tool_calls). `settings` steuert Top-Level `think: false`. */
function postOllamaChat(ollamaUrl, model, settings, payload, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const base = normalizeOllamaUrl(ollamaUrl);
    let body;
    try {
      body = JSON.stringify(buildOllamaApiChatBody(model, settings, payload));
    } catch (e) {
      return reject(new Error('Anfrage-Daten konnten nicht serialisiert werden.'));
    }

    let parsed;
    try {
      parsed = new URL(`${base}/api/chat`);
    } catch (e) {
      return reject(new Error(`Ungültige Ollama-URL: ${base}`));
    }

    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 11434),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch (e) {
            return reject(new Error(
              res.statusCode >= 400
                ? `Ollama-Fehler (HTTP ${res.statusCode}).`
                : 'Ollama lieferte eine ungültige Antwort.'
            ));
          }
          if (json.error) {
            return reject(new Error(json.error));
          }
          if (res.statusCode >= 400) {
            return reject(new Error(`Ollama-Fehler (HTTP ${res.statusCode}).`));
          }
          resolve(json);
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Zeitüberschreitung – Ollama hat nicht innerhalb von 3 Minuten geantwortet.'));
    });
    req.on('error', (e) => reject(new Error(describeConnectionError(e, base))));
    req.write(body);
    req.end();
  });
}

/** Ollama lehnt manche Modelle (z. B. llama3:latest) mit diesem Fehler ab, wenn `tools` gesendet wird. */
function isOllamaToolsUnsupportedError(err) {
  const msg = err && err.message ? String(err.message) : String(err);
  return /does not support tools/i.test(msg);
}

// ---- Google Gemini (Generative Language API) ----

const GEMINI_API_HOST = 'generativelanguage.googleapis.com';
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

// Presets für UIs (Liste der Modell-ID ohne "models/" Präfix).
const GEMINI_MODEL_PRESETS = [
  GEMINI_DEFAULT_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
];

function sanitizeGeminiModelId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return GEMINI_DEFAULT_MODEL;
  return s.replace(/^models\//, '');
}

// Optional: GEMINI_API_KEY in der Umgebung (Electron-Main-Prozess).
function resolveGeminiApiKey(settings) {
  const envKey = typeof process.env.GEMINI_API_KEY === 'string' ? process.env.GEMINI_API_KEY.trim() : '';
  if (envKey) return envKey;
  const saved = settings.geminiApiKey;
  return typeof saved === 'string' ? saved.trim() : '';
}

function resolveGeminiModelId(settings) {
  return sanitizeGeminiModelId(settings.geminiModel);
}

function extractGeminiReplyText(json) {
  const parts = json.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('')
    : '';
  return text;
}

function describeGeminiEmptyResponse(json) {
  const block = json.promptFeedback?.blockReason;
  if (block) {
    return `Gemini-Anfrage wurde nicht ausgeführt (Filter: ${block}).`;
  }
  const fc = json.candidates?.[0]?.finishReason;
  if (fc && fc !== 'STOP') {
    return `Gemini lieferte keine nutzbare Antwort (Grund: ${fc}).`;
  }
  return 'Gemini lieferte eine leere Antwort.';
}

/** POST generateContent — gibt geparstes JSON zurück (auch bei leerem Text / Function Calls). */
function requestGeminiGenerateContent(apiKey, modelId, requestBody, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let bodyStr;
    try {
      bodyStr = JSON.stringify(requestBody);
    } catch (e) {
      return reject(new Error('Anfrage-Daten konnten nicht serialisiert werden.'));
    }

    const encodedModel = encodeURIComponent(sanitizeGeminiModelId(modelId));
    const requestPath = `/v1beta/models/${encodedModel}:generateContent`;

    const req = https.request(
      {
        hostname: GEMINI_API_HOST,
        port: 443,
        path: requestPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'X-goog-api-key': apiKey,
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch (e) {
            return reject(new Error(
              res.statusCode >= 400
                ? `Gemini-Fehler (HTTP ${res.statusCode}).`
                : 'Gemini lieferte eine ungültige Antwort.'
            ));
          }

          const apiErr = json.error?.message || json.message;
          if (res.statusCode >= 400 || json.error) {
            return reject(new Error(
              apiErr
                ? `Gemini (${res.statusCode}): ${apiErr}`
                : `Gemini-Fehler (HTTP ${res.statusCode}).`
            ));
          }
          resolve(json);
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Zeitüberschreitung – Gemini hat nicht rechtzeitig geantwortet.'));
    });
    req.on('error', (e) =>
      reject(new Error(e.message || 'Netzwerkfehler bei Verbindung zu Gemini.')));
    req.write(bodyStr);
    req.end();
  });
}

/** Nur Textantworten (z. B. Empfehlungen); wirft bei leerem Text ohne Function Call. */
function callGemini(apiKey, modelId, requestBody, timeoutMs = 120000) {
  return requestGeminiGenerateContent(apiKey, modelId, requestBody, timeoutMs).then((json) => {
    const text = extractGeminiReplyText(json);
    if (!text.trim() && extractGeminiFunctionCalls(json).length === 0) {
      throw new Error(describeGeminiEmptyResponse(json));
    }
    if (!text.trim()) {
      throw new Error('Gemini lieferte nur Tool-Aufrufe ohne Text (unerwartet für diesen Aufruf).');
    }
    return text;
  });
}

async function aiRecommendGemini(settings, context) {
  const apiKey = resolveGeminiApiKey(settings);
  if (!apiKey) {
    throw new Error(
      'Kein Gemini-API-Schlüssel gesetzt. Unter Einstellungen eintragen oder Umgebungsvariable GEMINI_API_KEY setzen.'
    );
  }

  const systemPrompt =
    `Du bist ein persönlicher Studienassistent für TUM-Studenten. Gib kurze, konkrete Empfehlungen auf Deutsch (max. 3 Sätze). Fokus: was der Student HEUTE tun sollte. Sei motivierend aber realistisch.`;

  const userPrompt = buildAiPrompt(context);
  const modelId = resolveGeminiModelId(settings);

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  };

  const content = await callGemini(apiKey, modelId, body);
  return { content, model: modelId };
}

async function aiChatGemini(settings, messagesFromRenderer, context) {
  const apiKey = resolveGeminiApiKey(settings);
  if (!apiKey) {
    throw new Error(
      'Kein Gemini-API-Schlüssel gesetzt. Unter Einstellungen eintragen oder Umgebungsvariable GEMINI_API_KEY setzen.'
    );
  }

  const systemPrompt = buildChatSystemPrompt(context);
  const modelId = resolveGeminiModelId(settings);

  const contents = [];
  for (const msg of messagesFromRenderer || []) {
    if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') continue;
    if (msg.role === 'system') continue;
    if (msg.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    } else if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    }
  }

  if (!contents.length) {
    throw new Error('Keine gültigen Chat-Nachrichten zum Senden.');
  }

  const tools = geminiToolsBody();

  const todoActionResults = [];
  let workingContents = contents;

  for (let turn = 0; turn < CHAT_MAX_TOOL_TURNS; turn++) {
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: workingContents,
      tools,
    };

    const json = await requestGeminiGenerateContent(apiKey, modelId, body);
    const calls = extractGeminiFunctionCalls(json);
    const text = extractGeminiReplyText(json).trim();
    const modelContent = json.candidates?.[0]?.content;

    if (calls.length) {
      const contentBlock =
        modelContent && Array.isArray(modelContent.parts)
          ? modelContent
          : { role: 'model', parts: calls.map(fc => ({ functionCall: fc })) };
      workingContents = [...workingContents, contentBlock];
      const frParts = [];
      for (const fc of calls) {
        const name = fc.name || '';
        const args = normalizeGeminiFunctionArgs(fc);
        let result;
        if (name === 'create_todo') {
          result = executeCreateTodo(args);
          todoActionResults.push(result);
        } else {
          result = { success: false, error: `Unbekannte Funktion: ${name}` };
        }
        frParts.push({
          functionResponse: {
            name: name || 'unknown',
            response: result,
          },
        });
      }
      workingContents = [...workingContents, { role: 'user', parts: frParts }];
      continue;
    }

    if (text) {
      return {
        content: text,
        model: modelId,
        todoActions: collectTodoToolResults(todoActionResults),
      };
    }

    throw new Error(describeGeminiEmptyResponse(json));
  }

  throw new Error('Zu viele Tool-Runden – bitte erneut versuchen oder Anfrage kürzen.');
}

async function aiRecommendOllama(settings, context) {
  const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
  const systemPrompt = augmentOllamaSystemForNoReasoning(
    `Du bist ein persönlicher Studienassistent für TUM-Studenten. Gib kurze, konkrete Empfehlungen auf Deutsch (max. 3 Sätze). Fokus: was der Student HEUTE tun sollte. Sei motivierend aber realistisch.`,
    settings
  );
  const userPrompt = buildAiPrompt(context);

  const model = await resolveModelCached(ollamaUrl, settings.ollamaModel);
  const content = await callOllama(ollamaUrl, model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], settings);
  return { content, model };
}

async function aiChatOllama(settings, messagesFromRenderer, context) {
  const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
  const systemPrompt = augmentOllamaSystemForNoReasoning(buildChatSystemPrompt(context), settings);

  const model = await resolveModelCached(ollamaUrl, settings.ollamaModel);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(messagesFromRenderer || []),
  ];

  const tools = [CREATE_TODO_OLLAMA_TOOL];
  const todoActionResults = [];
  let useTools = true;

  for (let turn = 0; turn < CHAT_MAX_TOOL_TURNS; turn++) {
    let json;
    if (useTools) {
      try {
        json = await postOllamaChat(ollamaUrl, model, settings, { messages, tools });
      } catch (e) {
        if (isOllamaToolsUnsupportedError(e)) {
          useTools = false;
          json = await postOllamaChat(ollamaUrl, model, settings, { messages });
        } else {
          throw e;
        }
      }
    } else {
      json = await postOllamaChat(ollamaUrl, model, settings, { messages });
    }

    const toolCalls = json.message?.tool_calls;

    if (useTools && Array.isArray(toolCalls) && toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: json.message?.content || '',
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        const name = tc.function?.name || '';
        const args = parseOllamaToolArguments(tc.function?.arguments);
        let result;
        if (name === 'create_todo') {
          result = executeCreateTodo(args);
          todoActionResults.push(result);
        } else {
          result = { success: false, error: `Unbekannte Funktion: ${name}` };
        }
        // Ollama erwartet `tool_name` (nicht OpenAI-`name`); sonst wird das Tool-Ergebnis ignoriert.
        messages.push({
          role: 'tool',
          tool_name: name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const content = json.message?.content || json.response || '';
    if (content.trim()) {
      return {
        content,
        model,
        todoActions: collectTodoToolResults(todoActionResults),
      };
    }

    // Manche Modelle (z. B. Gemma) werfen keinen Fehler bei `tools`, liefern aber weder Text noch tool_calls.
    if (useTools) {
      useTools = false;
      continue;
    }

    throw new Error('Ollama lieferte eine leere Antwort. Unterstützt das Modell Tools?');
  }

  throw new Error('Zu viele Tool-Runden – bitte erneut versuchen.');
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

  ipcMain.handle('ai:chat', async (_, { messages, context }) => {
    const settings = store.settings || {};
    const provider = settings.aiProvider === 'gemini' ? 'gemini' : 'ollama';

    try {
      let content;
      let model;
      let todoActions;
      if (provider === 'gemini') {
        ({ content, model, todoActions } = await aiChatGemini(settings, messages, context));
      } else {
        ({ content, model, todoActions } = await aiChatOllama(settings, messages, context));
      }
      return { success: true, content, model, todoActions: todoActions || [] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
}

function chatReplyLanguageBlock(locale) {
  const code = locale === 'en' || locale === 'tr' ? locale : 'de';
  if (code === 'en') {
    return [
      'IMPORTANT — UI language: English.',
      'Write your entire reply in English only (clear, friendly, well structured).',
      'The structured student data below may use German section labels; that is for context only.',
      'If data is missing, say so plainly instead of guessing.',
    ].join('\n');
  }
  if (code === 'tr') {
    return [
      'ÖNEMLİ — Arayüz dili: Türkçe.',
      'Tüm yanıtını yalnızca Türkçe yaz (açık, nazik, iyi yapılandırılmış).',
      'Aşağıdaki yapılandırılmış verilerde Almanca bölüm başlıkları olabilir; bunlar yalnızca bağlam içindir.',
      'Veri eksikse tahmin etmek yerine açıkça belirt.',
    ].join('\n');
  }
  return [
    'Wichtig — App-Sprache: Deutsch.',
    'Antworte ausschließlich auf Deutsch, freundlich, konkret und gut strukturiert. Beziehe dich auf die unten genannten echten Daten des Studenten.',
    'Wenn Daten fehlen, sage das offen statt zu raten.',
  ].join('\n');
}

function buildChatSystemPrompt(context) {
  const {
    exams = [],
    todos = [],
    lectures = [],
    modules = [],
    today,
    locale,
  } = context || {};
  const uiLocale = locale === 'en' || locale === 'tr' ? locale : 'de';

  const modNameById = Object.fromEntries((modules || []).map((m) => [m.id, m.name]));

  const lines = [
    'Du bist der persönliche KI-Studienassistent eines TUM-Studenten in der App "TUM Study Portal".',
    'Du hilfst bei Studienorganisation, Lernplanung, Priorisierung von Aufgaben und gibst konkrete Handlungsempfehlungen.',
    chatReplyLanguageBlock(uiLocale),
    `\nHeutiges Datum: ${today}`,
  ];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const sortedExams = [...exams].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const upcomingExams = sortedExams.filter((e) => {
    const d = new Date(e.date);
    return !Number.isNaN(d.getTime()) && d >= todayStart;
  }).slice(0, 15);

  lines.push('\n## Prüfungen');
  if (upcomingExams.length) {
    for (const e of upcomingExams) {
      const days = Math.ceil((new Date(e.date) - new Date()) / 86400000);
      const when = Number.isNaN(days) ? '' : days >= 0 ? ` (in ${days} Tagen)` : ` (vor ${-days} Tagen)`;
      lines.push(
        `- ${e.name}: ${e.date}${when}` +
        `${e.time ? `, ${e.time} Uhr` : ''}${e.room ? `, Raum ${e.room}` : ''}` +
        `${e.credits ? `, ${e.credits} ECTS` : ''}${e.grade != null ? `, Note ${e.grade}` : ''}`
      );
    }
    if (sortedExams.length > upcomingExams.length) {
      lines.push(`(Weitere vergangene oder spätere Prüfungen ausgeblendet: ${sortedExams.length} gesamt.)`);
    }
  } else if (sortedExams.length) {
    lines.push('Keine anstehenden Prüfungen. Zuletzt (Auszug):');
    const past = sortedExams.filter((e) => {
      const d = new Date(e.date);
      return !Number.isNaN(d.getTime()) && d < todayStart;
    }).slice(-5);
    for (const e of past) {
      lines.push(
        `- ${e.name}: ${e.date}` +
        `${e.time ? `, ${e.time} Uhr` : ''}${e.room ? `, Raum ${e.room}` : ''}`
      );
    }
  } else {
    lines.push('Keine Prüfungen eingetragen.');
  }

  const lectureSlice = lectures.slice(0, 45);
  lines.push('\n## Vorlesungen / Stundenplan');
  if (lectureSlice.length) {
    for (const l of lectureSlice) {
      const datePart = l.eventDate ? ` ${l.eventDate}` : '';
      const allPart = l.allDay ? ' (ganztags)' : '';
      lines.push(
        `- ${l.name}:${datePart} ${l.day} ${l.time || ''}${l.end_time ? `–${l.end_time}` : ''}${allPart}` +
        `${l.room ? `, ${l.room}` : ''}${l.lecturer ? `, ${l.lecturer}` : ''}`
      );
    }
    if (lectures.length > lectureSlice.length) {
      lines.push(`(Weitere Vorlesungstermine ausgeblendet: ${lectures.length} gesamt.)`);
    }
  } else {
    lines.push('Keine Vorlesungen eingetragen.');
  }

  const modSlice = (modules || []).slice(0, 25);
  lines.push('\n## Module (Kurse)');
  if (modSlice.length) {
    for (const m of modSlice) {
      const slotCount = Array.isArray(m.slots) ? m.slots.length : 0;
      lines.push(
        `- ${m.name}${m.code ? ` (${m.code})` : ''}${m.semester ? ` · ${m.semester}` : ''}` +
        `${m.moodleUrl ? ' · Moodle-URL gesetzt' : ''} · ${slotCount} wöchentliche Termin(e)`
      );
    }
    if ((modules || []).length > modSlice.length) {
      lines.push(`(Weitere Module ausgeblendet: ${modules.length} gesamt.)`);
    }
  } else {
    lines.push('Keine Module eingetragen.');
  }

  const open = todos.filter(t => !t.done).slice(0, 35);
  const done = todos.filter(t => t.done);
  lines.push('\n## Offene Aufgaben (To-Dos)');
  if (open.length) {
    for (const t of open) {
      const modPart = t.moduleId && modNameById[t.moduleId] ? ` (Modul: ${modNameById[t.moduleId]})` : '';
      lines.push(
        `- [Priorität: ${(t.priority || 'medium').toUpperCase()}] ${t.title}` +
        `${modPart}${t.subject && !modPart ? ` (Fach: ${t.subject})` : ''}${t.due ? `, fällig am ${t.due}` : ''}`
      );
    }
    const hiddenOpen = todos.filter(t => !t.done).length - open.length;
    if (hiddenOpen > 0) {
      lines.push(`(Weitere offene Aufgaben ausgeblendet: ${hiddenOpen}.)`);
    }
  } else {
    lines.push('Keine offenen Aufgaben.');
  }
  lines.push(`\nBereits erledigte Aufgaben: ${done.length}`);

  lines.push('\n## Aktionen in der App');
  lines.push(
    'Du hast Zugriff auf das Tool `create_todo`: Es legt eine neue Aufgabe in der To-Do-Liste an. ' +
      'Nutze es nur, wenn der Nutzer ausdrücklich darum bittet (z. B. „leg das als Aufgabe an“ oder „erstell ein To-Do“). ' +
      'Bei unklarem Wunsch kurz nachfragen statt mehrere Einträge zu erzeugen.'
  );

  return lines.join('\n');
}

function buildAiPrompt({ exams, todos, lectures, today, modules = [] }) {
  const parts = [`Heute ist ${today}.`];
  const modNameById = Object.fromEntries((modules || []).map((m) => [m.id, m.name]));

  const upcomingExams = exams
    .filter(e => {
      const d = new Date(e.date) - new Date();
      return d >= 0 && d <= 30 * 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  if (upcomingExams.length > 0) {
    parts.push('\nAnstehende Prüfungen (nächste 30 Tage):');
    for (const e of upcomingExams) {
      const days = Math.ceil((new Date(e.date) - new Date()) / 86400000);
      parts.push(`- ${e.name}: in ${days} Tag${days === 1 ? '' : 'en'} (${e.date})`);
    }
  }

  const openTodos = todos.filter(t => !t.done).slice(0, 5);
  if (openTodos.length > 0) {
    parts.push('\nOffene Aufgaben:');
    for (const t of openTodos) {
      const modPart = t.moduleId && modNameById[t.moduleId] ? ` (${modNameById[t.moduleId]})` : '';
      parts.push(`- [${t.priority?.toUpperCase() || 'MITTEL'}] ${t.title}${modPart}${t.due ? ` (fällig: ${t.due})` : ''}`);
    }
  }

  if (lectures.length > 0) {
    parts.push(`\nHeutige Vorlesungen: ${lectures.map(l => l.name).join(', ')}`);
  }

  parts.push('\nEmpfehle mir konkret, was ich heute prioritär tun sollte.');
  return parts.join('\n');
}

// ---- Bundled Ollama Lifecycle ----
// On Windows production builds the Ollama runtime is shipped inside the app
// (extraResources → resources/ollama). The model itself is NOT bundled and is
// downloaded on first launch. In dev / on macOS the user's system Ollama is used.

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
  if (process.platform !== 'win32') return null;
  const exe = path.join(process.resourcesPath, 'ollama', 'ollama.exe');
  return fs.existsSync(exe) ? exe : null;
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

// Start the bundled ollama server. Returns true once it is reachable.
async function startBundledOllama(ollamaUrl) {
  const exe = bundledOllamaPath();
  if (!exe) return false;
  try {
    ollamaProcess = spawn(exe, ['serve'], {
      env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
      stdio: 'ignore',
      windowsHide: true,
    });
    ollamaProcess.on('exit', () => { ollamaProcess = null; });
    return await waitForOllama(ollamaUrl, 30000);
  } catch (e) {
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

  // 1) Already running? (system Ollama in dev, or a previous instance)
  let up = await isOllamaUp(ollamaUrl);

  // 2) Otherwise start the bundled runtime (Windows production only)
  if (!up) up = await startBundledOllama(ollamaUrl);

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
  buildMenu();
  initStore();
  registerIpcHandlers();
  registerOllamaIpc();
  createWindow();

  // Kick off Ollama setup once the renderer can receive progress events.
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => { runOllamaSetup(); });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Stop the bundled Ollama process we started (leave system Ollama untouched).
app.on('will-quit', () => {
  if (ollamaProcess) {
    try { ollamaProcess.kill(); } catch { /* noop */ }
    ollamaProcess = null;
  }
});
