/**
 * Chat-Hilfsfunktionen: API-Nachrichtenfilter, Session-Labels, KI-Kontext.
 */

export const CHAT_API_HISTORY_MAX = 48;

/** Nachrichten für die KI-API (nur user/assistant mit Inhalt, begrenzte Historie). */
export function messagesForApi(msgs) {
  return msgs
    .filter(
      m => m.role === 'user'
        || (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()),
    )
    .slice(-CHAT_API_HISTORY_MAX)
    .map(({ role, content }) => ({ role, content }));
}

export function deriveSessionTitle(msgs) {
  const first = msgs.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim());
  if (!first) return '';
  return first.content.trim().split('\n')[0].slice(0, 72);
}

export function formatSessionStartLabel(startedAt, intlLocale) {
  if (!startedAt) return '';
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(intlLocale, { dateStyle: 'short', timeStyle: 'short' });
}

export function sessionListLabel(s, t, intlLocale) {
  const fromStart = formatSessionStartLabel(s.startedAt, intlLocale);
  if (fromStart) return fromStart;
  const fromMsgs = deriveSessionTitle(s.messages || []);
  if (fromMsgs) return fromMsgs;
  if (typeof s.title === 'string' && s.title.trim()) return s.title.trim();
  return t('chat.sessionUntitled');
}

/** Kontext-Objekt für window.api.ai.chat (Dashboard-Daten + heutiges Datum). */
export function buildAiContext({ exams, lectures, todos, modules, locale, intlLocale }) {
  return {
    exams,
    lectures,
    todos,
    modules,
    locale,
    today: new Date().toLocaleDateString(intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}
