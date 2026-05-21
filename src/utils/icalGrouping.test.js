import { groupImportedItemsToModules } from './icalGrouping';

const wk = (name, day, time, end_time, extra = {}) => ({
  name, day, time, end_time, room: '', allDay: false, ...extra,
});

describe('groupImportedItemsToModules', () => {
  test('wiederkehrende Termine werden zu einem Modul mit Slot', () => {
    const items = [
      wk('Analysis 2', 'Mo', '10:15', '11:45', { eventDate: '2026-04-13', room: 'MI HS 1' }),
      wk('Analysis 2', 'Mo', '10:15', '11:45', { eventDate: '2026-04-20', room: 'MI HS 1' }),
      wk('Analysis 2', 'Mo', '10:15', '11:45', { eventDate: '2026-04-27', room: 'MI HS 1' }),
    ];
    const { modules, lectures } = groupImportedItemsToModules(items);
    expect(modules).toHaveLength(1);
    expect(lectures).toHaveLength(0);
    expect(modules[0].name).toBe('Analysis 2');
    expect(modules[0].source).toBe('ical');
    expect(modules[0].slots).toHaveLength(1);
    expect(modules[0].slots[0]).toMatchObject({ day: 'Mo', time: '10:15', end_time: '11:45', room: 'MI HS 1' });
  });

  test('einmaliger Termin bleibt Einzeltermin (Lecture)', () => {
    const items = [wk('Klausur Physik', 'Di', '09:00', '11:00', { eventDate: '2026-07-28' })];
    const { modules, lectures } = groupImportedItemsToModules(items);
    expect(modules).toHaveLength(0);
    expect(lectures).toHaveLength(1);
    expect(lectures[0].name).toBe('Klausur Physik');
  });

  test('Mischung: wöchentliche Vorlesung + einmalige Klausur desselben Kurses', () => {
    const items = [
      wk('Lineare Algebra', 'Mi', '14:00', '15:30', { eventDate: '2026-04-15' }),
      wk('Lineare Algebra', 'Mi', '14:00', '15:30', { eventDate: '2026-04-22' }),
      wk('Lineare Algebra', 'Fr', '09:00', '11:00', { eventDate: '2026-07-31' }), // einmalige Klausur
    ];
    const { modules, lectures } = groupImportedItemsToModules(items);
    expect(modules).toHaveLength(1);
    expect(modules[0].slots).toHaveLength(1);
    expect(modules[0].slots[0].day).toBe('Mi');
    expect(lectures).toHaveLength(1);
    expect(lectures[0].day).toBe('Fr');
  });

  test('mehrere Wochentage werden zu mehreren Slots eines Moduls', () => {
    const items = [
      wk('Datenbanken', 'Mo', '08:00', '09:30', { eventDate: '2026-04-13' }),
      wk('Datenbanken', 'Mo', '08:00', '09:30', { eventDate: '2026-04-20' }),
      wk('Datenbanken', 'Do', '12:00', '13:30', { eventDate: '2026-04-16' }),
      wk('Datenbanken', 'Do', '12:00', '13:30', { eventDate: '2026-04-23' }),
    ];
    const { modules } = groupImportedItemsToModules(items);
    expect(modules).toHaveLength(1);
    expect(modules[0].slots).toHaveLength(2);
    expect(new Set(modules[0].slots.map(s => s.day))).toEqual(new Set(['Mo', 'Do']));
  });

  test('häufigster Raum gewinnt pro Slot', () => {
    const items = [
      wk('X', 'Mo', '10:00', '11:00', { room: 'A' }),
      wk('X', 'Mo', '10:00', '11:00', { room: 'B' }),
      wk('X', 'Mo', '10:00', '11:00', { room: 'B' }),
    ];
    const { modules } = groupImportedItemsToModules(items);
    expect(modules[0].slots[0].room).toBe('B');
  });
});
