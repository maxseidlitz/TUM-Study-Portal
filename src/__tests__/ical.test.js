/* Tests für den iCal-Parser (public/ical.js, CommonJS). */
const { parseIcal, eventsToCalendarItems } = require('../../public/ical');

/** YYYYMMDD aus einem Datum n Tage ab heute. */
function icalDay(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}

describe('parseIcal', () => {
  test('zählt VEVENT-Blöcke', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'SUMMARY:A', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:B', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    expect(parseIcal(text)).toHaveLength(2);
  });

  test('entfaltet Folgezeilen und liest Properties', () => {
    const text = [
      'BEGIN:VEVENT',
      'SUMMARY:Lange',
      ' Zeile',
      'DTSTART;TZID=Europe/Berlin:20260518T101500',
      'END:VEVENT',
    ].join('\r\n');
    const [ev] = parseIcal(text);
    expect(ev.SUMMARY).toBe('LangeZeile');
    expect(ev.DTSTART).toBe('20260518T101500');
    expect(ev.__PROP_DTSTART).toContain('TZID');
  });
});

describe('eventsToCalendarItems', () => {
  test('einzelner Termin → genau ein Item mit Zeiten', () => {
    const date = icalDay(5);
    const events = parseIcal([
      'BEGIN:VEVENT',
      'UID:single-1',
      'SUMMARY:Vorlesung A',
      `DTSTART;TZID=Europe/Berlin:${date}T101500`,
      `DTEND;TZID=Europe/Berlin:${date}T114500`,
      'LOCATION:MI HS 1',
      'END:VEVENT',
    ].join('\n'));
    const items = eventsToCalendarItems(events);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'Vorlesung A',
      time: '10:15',
      end_time: '11:45',
      room: 'MI HS 1',
      allDay: false,
      imported: true,
    });
    expect(items[0].eventDate).toBeTruthy();
  });

  test('FREQ=WEEKLY;COUNT=3 expandiert zu drei Terminen', () => {
    const date = icalDay(2);
    const events = parseIcal([
      'BEGIN:VEVENT',
      'UID:weekly-1',
      'SUMMARY:Wöchentlich',
      `DTSTART;TZID=Europe/Berlin:${date}T080000`,
      `DTEND;TZID=Europe/Berlin:${date}T093000`,
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'END:VEVENT',
    ].join('\n'));
    const items = eventsToCalendarItems(events);
    expect(items).toHaveLength(3);
    expect(new Set(items.map(i => i.eventDate)).size).toBe(3);
  });

  test('ganztägiger Termin → allDay-Item ohne Uhrzeit', () => {
    const events = parseIcal([
      'BEGIN:VEVENT',
      'UID:allday-1',
      'SUMMARY:Feiertag',
      `DTSTART;VALUE=DATE:${icalDay(3)}`,
      `DTEND;VALUE=DATE:${icalDay(4)}`,
      'END:VEVENT',
    ].join('\n'));
    const items = eventsToCalendarItems(events);
    expect(items).toHaveLength(1);
    expect(items[0].allDay).toBe(true);
    expect(items[0].time).toBe('');
  });

  test('dedupliziert identische Vorkommen', () => {
    const date = icalDay(6);
    const block = [
      'BEGIN:VEVENT',
      'UID:dup-1',
      'SUMMARY:Doppelt',
      `DTSTART;TZID=Europe/Berlin:${date}T120000`,
      `DTEND;TZID=Europe/Berlin:${date}T130000`,
      'END:VEVENT',
    ].join('\n');
    const events = parseIcal(`${block}\n${block}`);
    expect(eventsToCalendarItems(events)).toHaveLength(1);
  });
});
