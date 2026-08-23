// ---- KI-Integration: Ollama & Google Gemini ----
// Reine API-Client-Logik + Prompt-Aufbau. Keine Electron-Fenster-Abhängigkeit.
const http = require('http');
const https = require('https');
const { store, saveStore, getMergedLecturesForClient } = require('./store');
const {
  canonicalToolCall,
  executeReadOnlyTool,
  validIsoDate,
} = require('./aiRetrieval');

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
const CHAT_MAX_TOOL_CALLS = 12;
const CHAT_MAX_CALLS_PER_TURN = 6;

function generateTodoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function allowsTodoWriteIntent(rawText) {
  const text = String(rawText || '').trim().toLocaleLowerCase('de-DE');
  if (!text || text.length > 12000) return false;

  if (/\b(?:wie|how|nasıl)\b/u.test(text)
    || /^(?:(?:kann|könnte|soll|darf)\s+ich|(?:can|could|should|may)\s+i)\b/u.test(text)
    || /\b(?:falls|wenn|if|eğer|erklär\w*|beschreib\w*|explain\w*|describe\w*|tell\s+me|sag\s+mir|açıkla\w*)\b/u.test(text)
    || /\b(?:nicht|keine?|don't|do not|never|oluşturma|ekleme|kaydetme)\b/u.test(text)
    || /\b(?:ignore|ignoriere|anweisungen|instructions?|system[\s-]?prompt|tool|function|provider|model|talimatları|kuralları)\b/u.test(text)) {
    return false;
  }

  const germanTodo = /\b(?:todos?|to-dos?|aufgaben?|erinnerungen?)\b/u;
  const germanDirect = /^(?:bitte\s+)?(?:erstell(?:e)?|leg(?:e)?|speicher(?:e)?|merk(?:e)?)\b/u;
  const germanElliptical = /^bitte\s+(?:(?:das|dies|dieses|diesen|diese|es)\s+)?(?:als\s+)?(?:ein(?:e|en)?\s+)?(?:todo|to-do|aufgabe|erinnerung)\b.*\b(?:erstellen|anlegen|speichern)\s*[?!.]*$/u;
  const germanPolite = /^(?:kannst|könntest)\s+du\s+(?:bitte\s+)?.*\b(?:erstellen|anlegen|speichern|merken)\s*[?!.]*$/u;
  const germanExplicit = (
    (germanTodo.test(text) && (
      germanDirect.test(text)
      || germanElliptical.test(text)
      || germanPolite.test(text)
    ))
    || /^(?:bitte\s+)?erinner(?:e)?\s+(?:mich|uns)\b/u.test(text)
    || /^(?:kannst|könntest)\s+du\s+(?:bitte\s+)?(?:mich|uns)(?:\s+bitte)?\b.*\berinnern\b/u.test(text)
  );

  const englishTodo = /\b(?:todos?|to-dos?|tasks?|reminders?)\b/u;
  const englishDirect = /^(?:please\s+)?(?:create|add|save|store)\b/u;
  const englishPolite = /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:create|add|save|store)\b/u;
  const englishExplicit = (
    (englishTodo.test(text) && (
      englishDirect.test(text)
      || englishPolite.test(text)
    ))
    || /^(?:please\s+)?remind\s+(?:me|us)\b/u.test(text)
    || /^(?:can|could|would)\s+you\s+(?:please\s+)?remind\s+(?:me|us)\b/u.test(text)
    || /^(?:please\s+)?remember\s+to\b/u.test(text)
  );

  const turkishTodo = /\b(?:görev(?:ler)?|ödev(?:ler)?|hatırlatıcı(?:lar)?|yapılacak(?:lar)?)\b/u;
  const turkishAction = /\b(?:oluştur(?:un)?|ekle(?:yin)?|kaydet(?:in)?|oluşturabilir\s+misin(?:iz)?|ekleyebilir\s+misin(?:iz)?|kaydedebilir\s+misin(?:iz)?)\b/u;
  const turkishDirectStart = /^(?:(?:bir\s+)?(?:görev(?:ler)?|ödev(?:ler)?|hatırlatıcı(?:lar)?|yapılacak(?:lar)?)\b|(?:bunu|şunu)\s+(?:bir\s+)?(?:görev|ödev|hatırlatıcı)\b)/u;
  const turkishExplicit = (
    (turkishTodo.test(text) && turkishAction.test(text)
      && (/^lütfen\b/u.test(text) || turkishDirectStart.test(text)))
    || /^(?:lütfen\s+)?(?:bana|bize)\b.*\b(?:hatırlat(?:ın)?|hatırlatabilir\s+misin(?:iz)?|hatırlatır\s+mısın(?:ız)?)\b/u.test(text)
  );

  return germanExplicit || englishExplicit || turkishExplicit;
}

function latestUserAllowsTodoWrite(messages) {
  const latest = [...(messages || [])].reverse()
    .find(message => message?.role === 'user' && typeof message.content === 'string');
  return allowsTodoWriteIntent(latest?.content);
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
  const allowedKeys = ['title', 'priority', 'subject', 'moduleId', 'moodleCourseId', 'due', 'notes'];
  const unknownKeys = Object.keys(args).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length) {
    return { success: false, error: `Unbekannte Parameter: ${unknownKeys.join(', ')}.` };
  }
  for (const key of ['title', 'priority', 'subject', 'moduleId', 'moodleCourseId', 'due', 'notes']) {
    if (args[key] != null && typeof args[key] !== 'string') {
      return { success: false, error: `${key} muss eine Zeichenkette sein.` };
    }
  }

  const title = String(args.title ?? '').trim();
  if (!title) return { success: false, error: 'Titel (title) fehlt oder ist leer.' };
  if (title.length > 240) return { success: false, error: 'Titel zu lang (max. 240 Zeichen).' };

  let priority = String(args.priority ?? 'medium').toLowerCase();
  if (!['high', 'medium', 'low'].includes(priority)) {
    return { success: false, error: 'priority muss high, medium oder low sein.' };
  }

  let due = String(args.due ?? '').trim();
  if (due && !validIsoDate(due)) {
    return { success: false, error: 'due muss ein gültiges Datum im Format YYYY-MM-DD sein.' };
  }

  const subject = String(args.subject ?? '').trim();
  const notes = String(args.notes ?? '').trim();
  if (subject.length > 120) return { success: false, error: 'subject ist zu lang (max. 120 Zeichen).' };
  if (notes.length > 1000) return { success: false, error: 'notes ist zu lang (max. 1000 Zeichen).' };

  let moodleCourseId = String(args.moodleCourseId ?? '').trim();
  if (moodleCourseId.length > 120) return { success: false, error: 'moodleCourseId ist zu lang.' };
  if (moodleCourseId && !(store.moodle_courses || []).some((c) => c.id === moodleCourseId)) {
    return { success: false, error: 'moodleCourseId wurde nicht gefunden.' };
  }

  let moduleId = String(args.moduleId ?? '').trim();
  if (moduleId.length > 120) return { success: false, error: 'moduleId ist zu lang.' };
  if (moduleId && !(store.modules || []).some((m) => m.id === moduleId)) {
    return { success: false, error: 'moduleId wurde nicht gefunden.' };
  }

  let resolvedSubject = subject;
  if (moduleId) {
    const mod = (store.modules || []).find((m) => m.id === moduleId);
    if (mod) resolvedSubject = String(mod.name || '').slice(0, 200);
  } else if (moodleCourseId) {
    const c = (store.moodle_courses || []).find((x) => x.id === moodleCourseId);
    if (c) resolvedSubject = String(c.name || '').slice(0, 200);
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
  if (!Array.isArray(store.todos)) store.todos = [];
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

const RETRIEVAL_TOOL_DECLARATIONS = [
  {
    name: 'search_todos',
    description: 'Sucht kompakt in den persönlichen Aufgaben. Vor Aussagen über Aufgaben immer zuerst verwenden.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optionaler Suchtext, maximal 120 Zeichen' },
        status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Standard: open' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        moduleId: { type: 'string' },
        dueFrom: { type: 'string', description: 'YYYY-MM-DD' },
        dueTo: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: 'search_exams',
    description: 'Sucht kompakt in den persönlichen Prüfungen. Vor Aussagen über Prüfungen immer zuerst verwenden.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optionaler Suchtext, maximal 120 Zeichen' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        graded: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: 'get_schedule',
    description: 'Liest persönliche Termine für einen Zeitraum von höchstens 31 Tagen.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD; Standard: heute' },
        to: { type: 'string', description: 'YYYY-MM-DD; Standard: from' },
        query: { type: 'string', description: 'Optionaler Suchtext' },
        moduleId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: 'get_module',
    description: 'Liest ein persönliches Modul anhand exakter ID oder eines Suchtexts.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        query: { type: 'string' },
      },
    },
  },
];

const CREATE_TODO_DECLARATION = {
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

const RETRIEVAL_OLLAMA_TOOLS = RETRIEVAL_TOOL_DECLARATIONS.map((declaration) => ({
  type: 'function',
  function: declaration,
}));

function geminiToolsBody() {
  return [{ functionDeclarations: [...RETRIEVAL_TOOL_DECLARATIONS, CREATE_TODO_DECLARATION] }];
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
  if (raw == null || raw === '') return { ok: true, value: {} };
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ok: true, value: raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, error: 'Tool-Parameter müssen ein JSON-Objekt sein.' };
    } catch (e) {
      return { ok: false, error: 'Ungültige Tool-Parameter (kein gültiges JSON).' };
    }
  }
  return { ok: false, error: 'Tool-Parameter müssen ein JSON-Objekt sein.' };
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

function safeTodoFinalContent(content, todoActionResults, locale) {
  const failures = (todoActionResults || []).filter(result => result && !result.success);
  if (!failures.length) return content;
  const confirmed = collectTodoToolResults(todoActionResults);
  const titles = confirmed.map(action => `„${action.title}“`).join(', ');
  if (locale === 'en') {
    return `${confirmed.length ? `Confirmed writes: ${titles}.` : 'No Todo was saved.'} ${failures.length} Todo action(s) failed or were rejected.`;
  }
  if (locale === 'tr') {
    return `${confirmed.length ? `Onaylanan kayıtlar: ${titles}.` : 'Hiçbir görev kaydedilmedi.'} ${failures.length} görev işlemi başarısız oldu veya reddedildi.`;
  }
  return `${confirmed.length ? `Bestätigt gespeichert: ${titles}.` : 'Es wurde kein Todo gespeichert.'} ${failures.length} Todo-Aktion(en) sind fehlgeschlagen oder wurden abgelehnt.`;
}

function todayIsoLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function contextFromMainStore(context) {
  return {
    exams: Array.isArray(store.exams) ? store.exams : [],
    todos: Array.isArray(store.todos) ? store.todos : [],
    lectures: getMergedLecturesForClient(),
    modules: Array.isArray(store.modules) ? store.modules : [],
    locale: context?.locale,
    today: context?.today || todayIsoLocal(),
  };
}

function executeChatTool(name, rawArgs, todayIso, todoActionResults, writeIntentAllowed) {
  if (name === 'create_todo') {
    const parsed = parseOllamaToolArguments(rawArgs);
    if (!parsed.ok) {
      const result = { success: false, error: parsed.error };
      todoActionResults.push(result);
      return result;
    }
    const result = writeIntentAllowed
      ? executeCreateTodo(parsed.value)
      : {
        success: false,
        error: 'Todo write rejected: explicit user consent and a direct create, save, or reminder instruction are required.',
      };
    todoActionResults.push(result);
    return result;
  }
  return executeReadOnlyTool(name, rawArgs, store, todayIso);
}

function minimalRetrievalSystemPrompt(context) {
  const locale = context?.locale === 'en' || context?.locale === 'tr' ? context.locale : 'de';
  return [
    'Du bist der persönliche Studienassistent in der App "TUM Study Portal".',
    chatReplyLanguageBlock(locale),
    `Heutiges Datum (ISO): ${todayIsoLocal()}.`,
    'Persönliche Aufgaben, Prüfungen, Termine und Module sind nicht im Prompt enthalten.',
    'Rufe vor jeder Behauptung über persönliche Studiendaten das passende Read-only-Tool auf.',
    'Erfinde keine persönlichen Fakten. Ein leeres oder not-found Tool-Ergebnis bedeutet, dass keine passenden Daten vorliegen.',
    'Nutze create_todo ausschließlich auf ausdrücklichen Wunsch. Wiederhole niemals denselben Tool-Aufruf.',
  ].join('\n');
}

function chatMetadata(model, fallbackUsed, fallbackReason) {
  return {
    model,
    activeModel: model,
    fallbackUsed,
    fallbackReason: fallbackUsed ? fallbackReason : null,
    retrievalMode: fallbackUsed ? 'full_context_fallback' : 'model_tools',
  };
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
  return /(does not support (?:tools?|tool calling|function calling)|tools? (?:are |is )?not supported|unsupported (?:tool|function)|(?:tool|function) calling (?:is )?not supported)/i.test(msg);
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

async function aiChatGemini(settings, messagesFromRenderer, context, dependencies = {}) {
  const apiKey = resolveGeminiApiKey(settings);
  if (!apiKey) {
    throw new Error(
      'Kein Gemini-API-Schlüssel gesetzt. Unter Einstellungen eintragen oder Umgebungsvariable GEMINI_API_KEY setzen.'
    );
  }

  // Gemini bleibt beim bewährten Vollkontext, bezieht ihn aber direkt aus dem Main-Store.
  const systemPrompt = buildChatSystemPrompt(contextFromMainStore(context));
  const modelId = resolveGeminiModelId(settings);

  const contents = [];
  for (const msg of (messagesFromRenderer || []).slice(-16)) {
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
  const requestGenerate = dependencies.requestGeminiGenerateContent || requestGeminiGenerateContent;
  const writeIntentAllowed = context?.allowTodoWrites === true
    && latestUserAllowsTodoWrite(messagesFromRenderer);

  const todoActionResults = [];
  const seenToolCalls = new Set();
  let toolCallCount = 0;
  let workingContents = contents;

  for (let turn = 0; turn < CHAT_MAX_TOOL_TURNS; turn++) {
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: workingContents,
      tools,
    };

    const json = await requestGenerate(apiKey, modelId, body);
    const calls = extractGeminiFunctionCalls(json);
    const text = extractGeminiReplyText(json).trim();
    const modelContent = json.candidates?.[0]?.content;

    if (calls.length) {
      if (calls.length > CHAT_MAX_CALLS_PER_TURN) {
        throw new Error('Zu viele Tool-Aufrufe in einer Modellantwort.');
      }
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
        toolCallCount += 1;
        if (toolCallCount > CHAT_MAX_TOOL_CALLS) {
          throw new Error('Zu viele Tool-Aufrufe – bitte Anfrage kürzen.');
        }
        const signature = canonicalToolCall(name, args);
        if (seenToolCalls.has(signature)) {
          result = {
            success: false,
            error: 'Identischer Tool-Aufruf blockiert. Nutze vorhandene Ergebnisse oder ändere die Abfrage.',
          };
        } else {
          seenToolCalls.add(signature);
          result = executeChatTool(
            name, args, todayIsoLocal(), todoActionResults, writeIntentAllowed
          );
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
        content: safeTodoFinalContent(text, todoActionResults, context?.locale),
        model: modelId,
        activeModel: modelId,
        fallbackUsed: false,
        fallbackReason: null,
        retrievalMode: 'full_context',
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

async function aiChatOllama(settings, messagesFromRenderer, context, dependencies = {}) {
  const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
  const resolveChatModel = dependencies.resolveModel || resolveModelCached;
  const postChat = dependencies.postOllamaChat || postOllamaChat;
  const model = await resolveChatModel(ollamaUrl, settings.ollamaModel);
  const originalMessages = (messagesFromRenderer || [])
    .filter((msg) => msg
      && (msg.role === 'user' || msg.role === 'assistant')
      && typeof msg.content === 'string'
      && msg.content.trim())
    .slice(-16)
    .map((msg) => ({ role: msg.role, content: msg.content.slice(0, 12000) }));
  if (!originalMessages.length) throw new Error('Keine gültigen Chat-Nachrichten zum Senden.');

  const systemPrompt = augmentOllamaSystemForNoReasoning(minimalRetrievalSystemPrompt(context), settings);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...originalMessages,
  ];

  const tools = [...RETRIEVAL_OLLAMA_TOOLS, CREATE_TODO_OLLAMA_TOOL];
  const writeIntentAllowed = context?.allowTodoWrites === true
    && latestUserAllowsTodoWrite(originalMessages);
  const todoActionResults = [];
  const seenToolCalls = new Set();
  let toolCallCount = 0;

  for (let turn = 0; turn < CHAT_MAX_TOOL_TURNS; turn++) {
    let json;
    try {
      json = await postChat(ollamaUrl, model, settings, { messages, tools });
    } catch (e) {
      if (isOllamaToolsUnsupportedError(e)) {
        const fallbackPrompt = augmentOllamaSystemForNoReasoning(
          buildChatSystemPrompt(contextFromMainStore(context)),
          settings
        );
        const fallbackJson = await postChat(ollamaUrl, model, settings, {
          messages: [{ role: 'system', content: fallbackPrompt }, ...originalMessages],
        });
        const fallbackContent = fallbackJson.message?.content || fallbackJson.response || '';
        if (!fallbackContent.trim()) {
          throw new Error('Ollama lieferte auch mit Vollkontext eine leere Antwort.');
        }
        return {
          content: safeTodoFinalContent(fallbackContent, todoActionResults, context?.locale),
          todoActions: collectTodoToolResults(todoActionResults),
          ...chatMetadata(model, true, 'tools_unsupported'),
        };
      }
      throw e;
    }

    const toolCalls = json.message?.tool_calls;

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      if (toolCalls.length > CHAT_MAX_CALLS_PER_TURN) {
        throw new Error('Zu viele Tool-Aufrufe in einer Modellantwort.');
      }
      messages.push({
        role: 'assistant',
        content: json.message?.content || '',
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        const name = tc.function?.name || '';
        let result;
        toolCallCount += 1;
        if (toolCallCount > CHAT_MAX_TOOL_CALLS) {
          throw new Error('Zu viele Tool-Aufrufe – bitte Anfrage kürzen.');
        }
        const signature = canonicalToolCall(name, tc.function?.arguments);
        if (seenToolCalls.has(signature)) {
          result = {
            success: false,
            error: 'Identischer Tool-Aufruf blockiert. Nutze vorhandene Ergebnisse oder ändere die Abfrage.',
          };
        } else {
          seenToolCalls.add(signature);
          result = executeChatTool(
            name,
            tc.function?.arguments,
            todayIsoLocal(),
            todoActionResults,
            writeIntentAllowed
          );
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
        content: safeTodoFinalContent(content, todoActionResults, context?.locale),
        todoActions: collectTodoToolResults(todoActionResults),
        ...chatMetadata(model, false),
      };
    }

    // Manche Modelle melden fehlende Tool-Unterstützung nur durch eine leere Antwort.
    const fallbackPrompt = augmentOllamaSystemForNoReasoning(
      buildChatSystemPrompt(contextFromMainStore(context)),
      settings
    );
    const fallbackJson = await postChat(ollamaUrl, model, settings, {
      messages: [{ role: 'system', content: fallbackPrompt }, ...originalMessages],
    });
    const fallbackContent = fallbackJson.message?.content || fallbackJson.response || '';
    if (fallbackContent.trim()) {
      return {
        content: safeTodoFinalContent(fallbackContent, todoActionResults, context?.locale),
        todoActions: collectTodoToolResults(todoActionResults),
        ...chatMetadata(model, true, 'empty_tool_response'),
      };
    }
    throw new Error('Ollama lieferte auch mit Vollkontext eine leere Antwort.');
  }

  throw new Error('Zu viele Tool-Runden – bitte erneut versuchen.');
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

module.exports = {
  DEFAULT_MODEL,
  normalizeOllamaUrl,
  describeConnectionError,
  listOllamaModels,
  sanitizeGeminiModelId,
  GEMINI_MODEL_PRESETS,
  aiRecommendOllama,
  aiChatOllama,
  aiRecommendGemini,
  aiChatGemini,
};
