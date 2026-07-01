// ---- Browser-/PWA-Implementierung von window.api ----
// Spiegelt die Electron-IPC-Handler (public/electron.js) für den Web-Build wider,
// sodass der gesamte UI-Code (DataContext, Hooks, Seiten) unverändert läuft.
// Aktiviert sich nur, wenn KEIN Electron-`window.api` vorhanden ist.

import {
  store, saveStore, initStore,
  getMergedLecturesForClient, parseCompositeLectureId, setSlotOverride,
} from './browserStore';
import { parseIcal, eventsToCalendarItems } from './ical';
import { aiModels, aiRecommend, aiChat } from './gemini';

const ok = () => ({ success: true });

// Direkter Fetch; bei CORS-/Netzwerkfehler aussagekräftige Meldung.
async function fetchText(url) {
  const res = await fetch(url, { headers: { Accept: 'text/calendar, text/plain, */*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function installBrowserApi() {
  if (typeof window === 'undefined') return;
  if (window.api) return; // Electron-Build: native API hat Vorrang
  initStore();

  const settings = () => store.settings || {};

  window.api = {
    isWebApp: true,

    exams: {
      getAll: async () => [...store.exams].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
      create: async (exam) => { store.exams.push(exam); saveStore(); return ok(); },
      update: async (exam) => { store.exams = store.exams.map((e) => (e.id === exam.id ? exam : e)); saveStore(); return ok(); },
      delete: async (id) => {
        store.exams = store.exams.filter((e) => e.id !== id);
        store.study_logs = store.study_logs.filter((l) => l.exam_id !== id);
        saveStore(); return ok();
      },
    },

    lectures: {
      getAll: async () => getMergedLecturesForClient(),
      create: async (lecture) => { store.lectures.push(lecture); saveStore(); return ok(); },
      update: async (lecture) => {
        const parsed = parseCompositeLectureId(lecture.id);
        if (parsed && parsed.overrideDate) {
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
          saveStore(); return ok();
        }
        store.lectures = store.lectures.map((l) => (l.id === lecture.id ? lecture : l)); saveStore(); return ok();
      },
      delete: async (id) => {
        const parsed = parseCompositeLectureId(id);
        if (parsed && parsed.overrideDate) {
          return setSlotOverride(parsed.moduleId, parsed.slotId, parsed.overrideDate, { canceled: true });
        }
        if (parsed) {
          const mod = (store.modules || []).find((m) => m.id === parsed.moduleId);
          if (!mod) return { success: false, error: 'Modul nicht gefunden.' };
          const slots = (mod.slots || []).filter((s) => s.id !== parsed.slotId);
          store.modules = (store.modules || []).map((m) => (m.id === mod.id ? { ...m, slots } : m));
          saveStore(); return ok();
        }
        store.lectures = store.lectures.filter((l) => l.id !== id); saveStore(); return ok();
      },
    },

    todos: {
      getAll: async () => store.todos,
      create: async (todo) => { store.todos.push(todo); saveStore(); return ok(); },
      update: async (todo) => { store.todos = store.todos.map((t) => (t.id === todo.id ? todo : t)); saveStore(); return ok(); },
      delete: async (id) => { store.todos = store.todos.filter((t) => t.id !== id); saveStore(); return ok(); },
    },

    moodle: {
      getAll: async () => [...store.moodle_courses].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      create: async (c) => { store.moodle_courses.push(c); saveStore(); return ok(); },
      update: async (c) => { store.moodle_courses = store.moodle_courses.map((x) => (x.id === c.id ? c : x)); saveStore(); return ok(); },
      delete: async (id) => { store.moodle_courses = store.moodle_courses.filter((c) => c.id !== id); saveStore(); return ok(); },
    },

    modules: {
      getAll: async () => [...(store.modules || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      create: async (mod) => { store.modules = [...(store.modules || []), mod]; saveStore(); return ok(); },
      update: async (mod) => { store.modules = (store.modules || []).map((m) => (m.id === mod.id ? mod : m)); saveStore(); return ok(); },
      delete: async (id) => { store.modules = (store.modules || []).filter((m) => m.id !== id); saveStore(); return ok(); },
    },

    studyLogs: {
      getByExam: async (examId) => store.study_logs.filter((l) => l.exam_id === examId).sort((a, b) => b.date.localeCompare(a.date)),
      getByTodo: async (todoId) => store.study_logs.filter((l) => l.todo_id === todoId).sort((a, b) => b.date.localeCompare(a.date)),
      create: async (log) => { store.study_logs.push(log); saveStore(); return ok(); },
      delete: async (id) => { store.study_logs = store.study_logs.filter((l) => l.id !== id); saveStore(); return ok(); },
    },

    settings: {
      get: async () => store.settings || {},
      save: async (next) => { store.settings = { ...store.settings, ...next }; saveStore(); return ok(); },
    },

    chats: {
      getAll: async () => {
        const list = Array.isArray(store.chat_sessions) ? store.chat_sessions : [];
        return [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      },
      get: async (id) => {
        if (!id) return null;
        const list = Array.isArray(store.chat_sessions) ? store.chat_sessions : [];
        return list.find((s) => s.id === id) || null;
      },
      save: async (session) => {
        if (!session || typeof session.id !== 'string' || !session.id.trim()) {
          return { success: false, error: 'Ungültige Chat-Session.' };
        }
        const messages = Array.isArray(session.messages) ? session.messages : [];
        const list = Array.isArray(store.chat_sessions) ? [...store.chat_sessions] : [];
        const sid = session.id.trim();
        const idx = list.findIndex((s) => s.id === sid);
        const prev = idx >= 0 ? list[idx] : null;
        const isoNow = new Date().toISOString();
        let startedAt;
        if (typeof session.startedAt === 'string' && session.startedAt.trim()) startedAt = session.startedAt.trim();
        else if (prev && typeof prev.startedAt === 'string' && prev.startedAt.trim()) startedAt = prev.startedAt.trim();
        const row = {
          id: sid,
          title: typeof session.title === 'string' ? session.title.slice(0, 200) : '',
          updatedAt: typeof session.updatedAt === 'string' && session.updatedAt ? session.updatedAt : isoNow,
          messages,
        };
        if (startedAt) row.startedAt = startedAt;
        if (idx >= 0) list[idx] = row; else list.unshift(row);
        store.chat_sessions = list;
        saveStore(); return ok();
      },
      delete: async (id) => {
        if (!id) return { success: false, error: 'Keine ID.' };
        store.chat_sessions = (store.chat_sessions || []).filter((s) => s.id !== id);
        const st = store.settings || {};
        if (st.lastActiveChatId === id) store.settings = { ...st, lastActiveChatId: '' };
        saveStore(); return ok();
      },
    },

    ical: {
      fetch: async (url) => {
        try {
          const text = await fetchText(url);
          const events = parseIcal(text);
          const items = eventsToCalendarItems(events);
          return { success: true, items, eventCount: events.length };
        } catch (e) {
          return {
            success: false,
            error: `${e.message}. Falls es ein CORS-/Netzwerkfehler ist: lade die .ics-Datei stattdessen herunter und importiere sie als Datei.`,
          };
        }
      },
      // Web-Zusatz: bereits geladenen iCal-Text (z. B. aus Datei-Upload) parsen.
      parseText: async (text) => {
        try {
          const events = parseIcal(String(text || ''));
          const items = eventsToCalendarItems(events);
          return { success: true, items, eventCount: events.length };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
    },

    ai: {
      models: async () => aiModels(settings()),
      recommend: async (context) => aiRecommend(settings(), context),
      chat: async ({ messages, context }) => aiChat(settings(), messages, context),
    },

    // Ollama läuft nicht im Browser – Setup meldet sich als nicht verfügbar
    // (Phase 'unavailable' blendet das Setup-Overlay aus).
    ollama: {
      getSetupState: async () => ({ phase: 'unavailable', percent: 0, message: '', model: '' }),
      retrySetup: async () => ({ phase: 'unavailable', percent: 0, message: '', model: '' }),
      onSetupProgress: () => () => {},
    },

    mensa: {
      fetch: async (canteenId) => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const url = `https://openmensa.org/api/v2/canteens/${canteenId}/days/${today}/meals`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { success: true, meals: await res.json() };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
    },

    openExternal: async (url) => { window.open(url, '_blank', 'noopener,noreferrer'); },

    backup: {
      export: async () => {
        try { return { success: true, data: JSON.stringify(store, null, 2) }; }
        catch (e) { return { success: false, error: e.message }; }
      },
      import: async (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString);
          Object.keys(store).forEach((k) => { delete store[k]; });
          Object.assign(store, parsed);
          saveStore(); return ok();
        } catch (e) { return { success: false, error: e.message }; }
      },
    },
  };
}

installBrowserApi();
