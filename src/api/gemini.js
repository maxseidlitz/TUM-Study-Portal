// ---- KI-Integration im Browser: Google Gemini (Generative Language API) ----
// Port der Gemini-Logik aus public/ai.js. Läuft direkt im Browser via fetch
// (API-Key als Query-Parameter → kein CORS-Preflight). Ollama wird im Web-Build
// nicht unterstützt (lokaler Dienst nicht vom Handy erreichbar).

import { store, saveStore } from './browserStore';

const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

export const GEMINI_MODEL_PRESETS = [
  GEMINI_DEFAULT_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
];

export function sanitizeGeminiModelId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return GEMINI_DEFAULT_MODEL;
  return s.replace(/^models\//, '');
}

function resolveGeminiApiKey(settings) {
  const saved = settings.geminiApiKey;
  return typeof saved === 'string' ? saved.trim() : '';
}

function resolveGeminiModelId(settings) {
  return sanitizeGeminiModelId(settings.geminiModel);
}

function extractGeminiReplyText(json) {
  const parts = json.candidates?.[0]?.content?.parts;
  return Array.isArray(parts)
    ? parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('')
    : '';
}

function extractGeminiFunctionCalls(json) {
  const parts = json.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  return parts.filter((p) => p && p.functionCall).map((p) => p.functionCall);
}

function describeGeminiEmptyResponse(json) {
  const block = json.promptFeedback?.blockReason;
  if (block) return `Gemini-Anfrage wurde nicht ausgeführt (Filter: ${block}).`;
  const fc = json.candidates?.[0]?.finishReason;
  if (fc && fc !== 'STOP') return `Gemini lieferte keine nutzbare Antwort (Grund: ${fc}).`;
  return 'Gemini lieferte eine leere Antwort.';
}

async function requestGeminiGenerateContent(apiKey, modelId, requestBody, timeoutMs = 120000) {
  const encodedModel = encodeURIComponent(sanitizeGeminiModelId(modelId));
  const url = `${GEMINI_API_HOST}/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error('Zeitüberschreitung – Gemini hat nicht rechtzeitig geantwortet.');
    }
    throw new Error(e.message || 'Netzwerkfehler bei Verbindung zu Gemini.');
  }
  clearTimeout(timer);

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(
      res.status >= 400 ? `Gemini-Fehler (HTTP ${res.status}).` : 'Gemini lieferte eine ungültige Antwort.'
    );
  }
  const apiErr = json.error?.message || json.message;
  if (res.status >= 400 || json.error) {
    throw new Error(apiErr ? `Gemini (${res.status}): ${apiErr}` : `Gemini-Fehler (HTTP ${res.status}).`);
  }
  return json;
}

async function callGemini(apiKey, modelId, requestBody, timeoutMs = 120000) {
  const json = await requestGeminiGenerateContent(apiKey, modelId, requestBody, timeoutMs);
  const text = extractGeminiReplyText(json);
  if (!text.trim() && extractGeminiFunctionCalls(json).length === 0) {
    throw new Error(describeGeminiEmptyResponse(json));
  }
  if (!text.trim()) {
    throw new Error('Gemini lieferte nur Tool-Aufrufe ohne Text (unerwartet für diesen Aufruf).');
  }
  return text;
}

// ---- create_todo Tool (schreibt in den Browser-Store) ----

const CHAT_MAX_TOOL_TURNS = 5;

function generateTodoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function executeCreateTodo(rawArgs) {
  let args = rawArgs;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch (e) { return { success: false, error: 'Ungültige Tool-Parameter (kein JSON).' }; }
  }
  if (!args || typeof args !== 'object') return { success: false, error: 'Ungültige Tool-Parameter.' };

  const title = String(args.title ?? '').trim();
  if (!title) return { success: false, error: 'Titel (title) fehlt oder ist leer.' };
  if (title.length > 500) return { success: false, error: 'Titel zu lang (max. 500 Zeichen).' };

  let priority = String(args.priority ?? 'medium').toLowerCase();
  if (!['high', 'medium', 'low'].includes(priority)) priority = 'medium';

  let due = String(args.due ?? '').trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) due = '';
  if (due) {
    const d = new Date(`${due}T12:00:00`);
    if (Number.isNaN(d.getTime())) due = '';
  }

  const subject = String(args.subject ?? '').trim().slice(0, 200);
  const notes = String(args.notes ?? '').trim().slice(0, 5000);

  let moduleId = String(args.moduleId ?? '').trim();
  if (moduleId && !(store.modules || []).some((m) => m.id === moduleId)) moduleId = '';

  let resolvedSubject = subject;
  if (moduleId) {
    const mod = (store.modules || []).find((m) => m.id === moduleId);
    if (mod && !resolvedSubject) resolvedSubject = String(mod.name || '').slice(0, 200);
  }

  const id = generateTodoId();
  store.todos.push({
    id, title, priority, subject: resolvedSubject, due, notes, done: false,
    ...(moduleId ? { moduleId } : {}),
  });
  saveStore();
  return {
    success: true, id, title, priority, subject: resolvedSubject, due,
    moduleId: moduleId || undefined,
    message: 'Aufgabe wurde in der App gespeichert.',
  };
}

const GEMINI_CREATE_TODO_DECLARATION = {
  name: 'create_todo',
  description:
    'Legt eine neue Aufgabe in der To-Do-Liste der App an. Nur nutzen, wenn der Nutzer ausdrücklich darum bittet.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Kurzer Aufgabentitel' },
      priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priorität (Standard: medium)' },
      subject: { type: 'string', description: 'Optional: Fach / Modul (Freitext)' },
      moduleId: { type: 'string', description: 'Optional: Modul-ID aus der App' },
      due: { type: 'string', description: 'Optional: Fälligkeit YYYY-MM-DD' },
      notes: { type: 'string', description: 'Optional: Notizen' },
    },
    required: ['title'],
  },
};

function normalizeGeminiFunctionArgs(fc) {
  let a = fc.args;
  if (a == null && fc.arguments != null) a = fc.arguments;
  if (typeof a === 'string') {
    try { return JSON.parse(a); } catch (e) { return {}; }
  }
  return a && typeof a === 'object' ? a : {};
}

function collectTodoToolResults(results) {
  return (results || [])
    .filter((r) => r && r.success && r.id)
    .map((r) => ({ id: r.id, title: r.title, priority: r.priority }));
}

// ---- Prompt-Aufbau (Port aus ai.js) ----

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
  const { exams = [], todos = [], lectures = [], modules = [], today, locale } = context || {};
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
  } else {
    lines.push('Keine anstehenden Prüfungen.');
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
  } else {
    lines.push('Keine Module eingetragen.');
  }

  const open = todos.filter((t) => !t.done).slice(0, 35);
  const done = todos.filter((t) => t.done);
  lines.push('\n## Offene Aufgaben (To-Dos)');
  if (open.length) {
    for (const t of open) {
      const modPart = t.moduleId && modNameById[t.moduleId] ? ` (Modul: ${modNameById[t.moduleId]})` : '';
      lines.push(
        `- [Priorität: ${(t.priority || 'medium').toUpperCase()}] ${t.title}` +
        `${modPart}${t.subject && !modPart ? ` (Fach: ${t.subject})` : ''}${t.due ? `, fällig am ${t.due}` : ''}`
      );
    }
  } else {
    lines.push('Keine offenen Aufgaben.');
  }
  lines.push(`\nBereits erledigte Aufgaben: ${done.length}`);

  lines.push('\n## Aktionen in der App');
  lines.push(
    'Du hast Zugriff auf das Tool `create_todo`: Es legt eine neue Aufgabe in der To-Do-Liste an. ' +
      'Nutze es nur, wenn der Nutzer ausdrücklich darum bittet (z. B. „leg das als Aufgabe an"). ' +
      'Bei unklarem Wunsch kurz nachfragen statt mehrere Einträge zu erzeugen.'
  );

  return lines.join('\n');
}

function buildAiPrompt({ exams, todos, lectures, today, modules = [] }) {
  const parts = [`Heute ist ${today}.`];
  const modNameById = Object.fromEntries((modules || []).map((m) => [m.id, m.name]));

  const upcomingExams = exams
    .filter((e) => {
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

  const openTodos = todos.filter((t) => !t.done).slice(0, 5);
  if (openTodos.length > 0) {
    parts.push('\nOffene Aufgaben:');
    for (const t of openTodos) {
      const modPart = t.moduleId && modNameById[t.moduleId] ? ` (${modNameById[t.moduleId]})` : '';
      parts.push(`- [${t.priority?.toUpperCase() || 'MITTEL'}] ${t.title}${modPart}${t.due ? ` (fällig: ${t.due})` : ''}`);
    }
  }

  if (lectures.length > 0) {
    parts.push(`\nHeutige Vorlesungen: ${lectures.map((l) => l.name).join(', ')}`);
  }

  parts.push('\nEmpfehle mir konkret, was ich heute prioritär tun sollte.');
  return parts.join('\n');
}

// ---- Öffentliche API (von browserApi.js genutzt) ----

const NO_KEY_MSG =
  'Kein Gemini-API-Schlüssel gesetzt. Unter Einstellungen → KI eintragen. ' +
  '(Lokale Ollama-KI ist im Web-/Handy-Build nicht verfügbar.)';

export function aiModels(settings) {
  const merged = [...GEMINI_MODEL_PRESETS];
  const custom = sanitizeGeminiModelId(settings.geminiModel);
  if (custom && !merged.includes(custom)) merged.unshift(custom);
  return { success: true, models: merged };
}

export async function aiRecommend(settings, context) {
  const apiKey = resolveGeminiApiKey(settings);
  if (!apiKey) return { success: false, error: NO_KEY_MSG };
  try {
    const systemPrompt =
      'Du bist ein persönlicher Studienassistent für TUM-Studenten. Gib kurze, konkrete Empfehlungen auf Deutsch (max. 3 Sätze). Fokus: was der Student HEUTE tun sollte. Sei motivierend aber realistisch.';
    const modelId = resolveGeminiModelId(settings);
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: buildAiPrompt(context) }] }],
    };
    const content = await callGemini(apiKey, modelId, body);
    return { success: true, content, model: modelId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function aiChat(settings, messagesFromRenderer, context) {
  const apiKey = resolveGeminiApiKey(settings);
  if (!apiKey) return { success: false, error: NO_KEY_MSG };

  try {
    const systemPrompt = buildChatSystemPrompt(context);
    const modelId = resolveGeminiModelId(settings);

    const contents = [];
    for (const msg of messagesFromRenderer || []) {
      if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') continue;
      if (msg.role === 'system') continue;
      if (msg.role === 'assistant') contents.push({ role: 'model', parts: [{ text: msg.content }] });
      else if (msg.role === 'user') contents.push({ role: 'user', parts: [{ text: msg.content }] });
    }
    if (!contents.length) return { success: false, error: 'Keine gültigen Chat-Nachrichten zum Senden.' };

    const tools = [{ functionDeclarations: [GEMINI_CREATE_TODO_DECLARATION] }];
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
            : { role: 'model', parts: calls.map((fc) => ({ functionCall: fc })) };
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
          frParts.push({ functionResponse: { name: name || 'unknown', response: result } });
        }
        workingContents = [...workingContents, { role: 'user', parts: frParts }];
        continue;
      }

      if (text) {
        return { success: true, content: text, model: modelId, todoActions: collectTodoToolResults(todoActionResults) };
      }
      return { success: false, error: describeGeminiEmptyResponse(json) };
    }
    return { success: false, error: 'Zu viele Tool-Runden – bitte erneut versuchen oder Anfrage kürzen.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
