import {
  generateId,
  getDaysUntil,
  getCountdownClass,
  getCountdownColor,
  getPriorityOrder,
  getPriorityLabel,
  formatISODateLocal,
  dayCodeFromISODate,
  sortByDay,
  getStudyProgress,
  lectureMatchesCalendarDay,
} from './helpers';

describe('generateId', () => {
  test('liefert eindeutige, nicht-leere IDs', () => {
    const a = generateId();
    const b = generateId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('getDaysUntil', () => {
  test('null bei fehlendem Datum', () => {
    expect(getDaysUntil('')).toBeNull();
    expect(getDaysUntil(null)).toBeNull();
  });

  test('0 für heute', () => {
    expect(getDaysUntil(formatISODateLocal(new Date()))).toBe(0);
  });

  test('positiv für Zukunft, negativ für Vergangenheit', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(getDaysUntil(formatISODateLocal(future))).toBe(10);
    expect(getDaysUntil(formatISODateLocal(past))).toBe(-5);
  });
});

describe('getCountdownClass', () => {
  test('Schwellen 7 / 21 Tage', () => {
    expect(getCountdownClass(null)).toBe('');
    expect(getCountdownClass(0)).toBe('danger');
    expect(getCountdownClass(7)).toBe('danger');
    expect(getCountdownClass(8)).toBe('warning');
    expect(getCountdownClass(21)).toBe('warning');
    expect(getCountdownClass(22)).toBe('success');
  });
});

describe('getCountdownColor', () => {
  test('passende CSS-Variablen je Schwelle', () => {
    expect(getCountdownColor(null)).toBe('var(--text-muted)');
    expect(getCountdownColor(3)).toBe('var(--countdown-red)');
    expect(getCountdownColor(14)).toBe('var(--countdown-orange)');
    expect(getCountdownColor(40)).toBe('var(--countdown-green)');
  });
});

describe('Priorität', () => {
  test('getPriorityOrder sortiert hoch < mittel < niedrig', () => {
    expect(getPriorityOrder('high')).toBeLessThan(getPriorityOrder('medium'));
    expect(getPriorityOrder('medium')).toBeLessThan(getPriorityOrder('low'));
    expect(getPriorityOrder('unbekannt')).toBe(1);
  });

  test('getPriorityLabel mappt korrekt mit Fallback', () => {
    expect(getPriorityLabel('high')).toBe('Hoch');
    expect(getPriorityLabel('low')).toBe('Niedrig');
    expect(getPriorityLabel(undefined)).toBe('Mittel');
  });
});

describe('formatISODateLocal & dayCodeFromISODate', () => {
  test('formatISODateLocal liefert YYYY-MM-DD', () => {
    expect(formatISODateLocal(new Date(2026, 4, 18))).toBe('2026-05-18');
  });

  test('dayCodeFromISODate liefert Wochentagskürzel', () => {
    // 2026-05-18 ist ein Montag
    expect(dayCodeFromISODate('2026-05-18')).toBe('Mo');
    // ungültige Eingabe → Fallback 'Mo'
    expect(dayCodeFromISODate('kaputt')).toBe('Mo');
  });
});

describe('sortByDay', () => {
  test('sortiert nach Wochentag, dann Uhrzeit', () => {
    const input = [
      { day: 'Mi', time: '10:00' },
      { day: 'Mo', time: '14:00' },
      { day: 'Mo', time: '08:00' },
    ];
    const sorted = sortByDay(input).map(l => `${l.day} ${l.time}`);
    expect(sorted).toEqual(['Mo 08:00', 'Mo 14:00', 'Mi 10:00']);
  });

  test('mutiert das Original-Array nicht', () => {
    const input = [{ day: 'Mi', time: '10:00' }, { day: 'Mo', time: '08:00' }];
    sortByDay(input);
    expect(input[0].day).toBe('Mi');
  });
});

describe('getStudyProgress', () => {
  test('0 ohne Datum, 0-100 sonst', () => {
    expect(getStudyProgress('')).toBe(0);
    const v = getStudyProgress(formatISODateLocal(new Date()));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('lectureMatchesCalendarDay (Einzel-Instanz-Overrides)', () => {
  // 2026-05-18 = Montag, 2026-05-25 = Montag
  const monday = new Date(2026, 4, 18);
  const nextMonday = new Date(2026, 4, 25);
  const tuesday = new Date(2026, 4, 19);

  test('wöchentliche Basis matcht nach Wochentag', () => {
    const base = { day: 'Mo', eventDate: '' };
    expect(lectureMatchesCalendarDay(base, monday)).toBe(true);
    expect(lectureMatchesCalendarDay(base, tuesday)).toBe(false);
  });

  test('Basis wird an Override-Tag (abgesagt) unterdrückt, andere Wochen bleiben', () => {
    const base = { day: 'Mo', eventDate: '', overrides: { '2026-05-18': { canceled: true } } };
    expect(lectureMatchesCalendarDay(base, monday)).toBe(false);
    expect(lectureMatchesCalendarDay(base, nextMonday)).toBe(true);
  });

  test('Basis wird an Override-Tag (verschoben) unterdrückt', () => {
    const base = { day: 'Mo', eventDate: '', overrides: { '2026-05-18': { time: '14:00' } } };
    expect(lectureMatchesCalendarDay(base, monday)).toBe(false);
  });

  test('dattierte Override-Instanz matcht nur an ihrem Datum', () => {
    const ov = { eventDate: '2026-05-18', isOverride: true };
    expect(lectureMatchesCalendarDay(ov, monday)).toBe(true);
    expect(lectureMatchesCalendarDay(ov, nextMonday)).toBe(false);
  });
});
