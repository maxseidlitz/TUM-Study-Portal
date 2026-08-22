export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Anzeigename für Kurs/Fach in ToDos (Modul > Moodle > Freitext). */
export function resolveTodoCourseLabel(todo, modules = [], moodleCourses = []) {
  if (todo.moduleId) {
    const mod = modules.find((m) => m.id === todo.moduleId);
    if (mod?.name) return mod.name;
  }
  if (todo.moodleCourseId) {
    const c = moodleCourses.find((x) => x.id === todo.moodleCourseId);
    if (c?.name) return c.name;
  }
  return (todo.subject && String(todo.subject).trim()) || '';
}

export function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

export function getCountdownColor(days) {
  if (days === null) return 'var(--text-muted)';
  if (days <= 7) return 'var(--countdown-red)';
  if (days <= 21) return 'var(--countdown-orange)';
  return 'var(--countdown-green)';
}

export function getCountdownClass(days) {
  if (days === null) return '';
  if (days <= 7) return 'danger';
  if (days <= 21) return 'warning';
  return 'success';
}

export function formatDate(dateStr, intlLocale = 'de-DE') {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateLong(dateStr, intlLocale = 'de-DE') {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Lokales Kalenderdatum als YYYY-MM-DD. */
export function formatISODateLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Heute (lokal) als YYYY-MM-DD. */
export function getTodayISODate() {
  return formatISODateLocal(new Date());
}

/** Termin gehört zum angegebenen Kalendertag (manuell: Wochentag; Import/Override: eventDate). */
export function lectureMatchesCalendarDay(lecture, date = new Date()) {
  if (!lecture || !date) return false;
  const iso = formatISODateLocal(date);
  if (lecture.eventDate) return lecture.eventDate === iso;
  // Wöchentliche Basis-Instanz: an Tagen mit Override (verschoben/abgesagt) NICHT
  // anzeigen – die dattierte Override-Instanz übernimmt bzw. der Tag entfällt.
  if (lecture.overrides && lecture.overrides[iso]) return false;
  const code = dateToDayCode(date);
  return lecture.day === code;
}

/** Alle (bereits expandierten) Vorlesungsinstanzen für einen konkreten Kalendertag. */
export function lecturesForCalendarDay(lectures, date = new Date()) {
  if (!Array.isArray(lectures)) return [];
  return lectures.filter((lecture) => lectureMatchesCalendarDay(lecture, date));
}

/** Sortierung importierter Kalendertermine nach Datum und Uhrzeit. */
export function sortCalendarImports(a, b) {
  const c = (a.eventDate || '').localeCompare(b.eventDate || '');
  if (c !== 0) return c;
  if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
  return (a.time || '').localeCompare(b.time || '');
}

export function dayCodeFromISODate(iso) {
  if (!iso || typeof iso !== 'string') return 'Mo';
  const p = iso.split('-').map(Number);
  if (p.length !== 3 || p.some(Number.isNaN)) return 'Mo';
  return dateToDayCode(new Date(p[0], p[1] - 1, p[2]));
}

/** Wochentag-Kürzel wie `getTodayDayCode` (So … Sa). */
export function dateToDayCode(date) {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return days[new Date(date).getDay()];
}

export function getTodayDayCode() {
  return dateToDayCode(new Date());
}

/** Montag 00:00 der Kalenderwoche, in der `ref` liegt (ISO: Woche beginnt Montag). */
export function getMondayOfWeek(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Kalendertag gleich (lokal)? */
export function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

/** ISO-Kalenderwoche (1–53) für ein Datum. */
export function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/** Kurztitel z. B. „KW 20 · 12.–18. Mai 2026“ (weekAbbr z. B. „KW“, „Wk“, „Hf“). */
export function formatWeekRangeTitle(monday, sunday, intlLocale = 'de-DE', weekAbbr = 'KW') {
  const kw = getISOWeekNumber(monday);
  const m = monday.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
  const s = sunday.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${weekAbbr} ${kw} · ${m}.–${s}`;
}

const DAY_ORDER = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 };
export function sortByDay(lectures) {
  return [...lectures].sort((a, b) => {
    const dayDiff = (DAY_ORDER[a.day] ?? 7) - (DAY_ORDER[b.day] ?? 7);
    if (dayDiff !== 0) return dayDiff;
    return (a.time || '').localeCompare(b.time || '');
  });
}

export function getPriorityOrder(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 1;
}

export function getPriorityLabel(priority) {
  return { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }[priority] ?? 'Mittel';
}

export function getStudyProgress(dateStr) {
  if (!dateStr) return 0;
  const semesterStart = new Date();
  semesterStart.setMonth(semesterStart.getMonth() - 3);
  const exam = new Date(dateStr);
  const today = new Date();
  const total = exam - semesterStart;
  const elapsed = today - semesterStart;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function openExternal(url) {
  if (window.api?.openExternal) {
    window.api.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

/** Lokale Heuristik für die KI-Karte; `t` wie aus useLocale(). */
export function getAiRecommendation({ exams, todos, lectures }, t) {
  const now = new Date();
  const todayLectures = lectures.filter(l => lectureMatchesCalendarDay(l, now));
  const urgentExams = exams
    .map(e => ({ ...e, days: getDaysUntil(e.date) }))
    .filter(e => e.days !== null && e.days >= 0 && e.days <= 21)
    .sort((a, b) => a.days - b.days);
  const highTodos = todos.filter(t => !t.done && t.priority === 'high');
  const openTodos = todos.filter(t => !t.done);

  const parts = [];

  if (urgentExams.length > 0) {
    const next = urgentExams[0];
    if (next.days <= 3) {
      parts.push(
        next.days === 1
          ? t('aiFallback.examUrgentOne', { name: next.name })
          : t('aiFallback.examUrgentMany', { name: next.name, days: next.days }),
      );
    } else if (next.days <= 7) {
      parts.push(t('aiFallback.examWeek', { name: next.name, days: next.days }));
    } else {
      parts.push(t('aiFallback.examLater', { name: next.name, days: next.days }));
    }
  }

  if (highTodos.length > 0) {
    parts.push(
      highTodos.length === 1
        ? t('aiFallback.highOne', { title: highTodos[0].title })
        : t('aiFallback.highMany', { count: highTodos.length, title: highTodos[0].title }),
    );
  } else if (openTodos.length > 0) {
    parts.push(
      openTodos.length === 1
        ? t('aiFallback.openOne')
        : t('aiFallback.openMany', { count: openTodos.length }),
    );
  }

  if (todayLectures.length > 0) {
    parts.push(
      todayLectures.length === 1
        ? t('aiFallback.lectureOne')
        : t('aiFallback.lectureMany', { count: todayLectures.length }),
    );
  }

  if (parts.length === 0) {
    return t('aiFallback.relaxed');
  }

  return parts.join(' ');
}
