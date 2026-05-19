// ---- iCal Parser ----
// Reine Parser-Logik ohne Abhängigkeiten zu Electron/Store — daher gut testbar.
// Öffentliche API: parseIcal(text), eventsToCalendarItems(events).

function parseIcal(text) {
  // Unfold lines (continuation lines start with space/tab)
  const unfolded = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');

  const lines = unfolded.split('\n');
  const events = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
    } else if (trimmed === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current && line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const rawKey = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1);
      // Strip parameters (e.g. DTSTART;TZID=Europe/Berlin → DTSTART)
      const key = rawKey.split(';')[0].toUpperCase();
      current[key] = value;
      if (key === 'DTSTART' || key === 'DTEND') {
        current[`__PROP_${key}`] = rawKey;
      }
      // Also store with TZID info if present
      if (rawKey.includes('TZID')) current[`${key}_TZID`] = true;
    }
  }
  return events;
}

const DAY_CODES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const ICAL_BYDAY_TO_JS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function cleanIcalText(s) {
  return (s || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(y, mo, d) {
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

function parseIcalDateOnly(dtValue) {
  if (!dtValue) return null;
  const m = String(dtValue).trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const weekday = new Date(y, mo - 1, d).getDay();
  return { y, mo, d, date: formatYmd(y, mo, d), weekday };
}

function isAllDayDt(rawProp, value) {
  if (!value) return false;
  const rp = (rawProp || '').toUpperCase();
  if (rp.includes('VALUE=DATE')) return true;
  const v = String(value).trim();
  return /^\d{8}$/.test(v) || /^\d{8}Z$/i.test(v);
}

/** Local floating or naive-Z-adjusted clock on a calendar day (same rules as legacy parser). */
function parseClockFromIcal(dtValue) {
  const v = String(dtValue || '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:(\d{2}))?/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  let hour = +m[4];
  const min = +m[5];
  if (v.endsWith('Z') || v.endsWith('z')) hour = (hour + 1) % 24;
  const time = `${pad2(hour)}:${pad2(min)}`;
  const date = formatYmd(y, mo, d);
  const weekday = new Date(y, mo - 1, d).getDay();
  return { date, time, y, mo, d, hour, min, weekday };
}

function addMinutesToClock(timeStr, addMin) {
  const [h, mi] = String(timeStr || '0:0').split(':').map(Number);
  let t = h * 60 + (Number.isNaN(mi) ? 0 : mi) + addMin;
  if (t < 0) t = 0;
  const hh = Math.floor(t / 60) % 24;
  const mm = t % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function minutesBetween(startTimeStr, endTimeStr) {
  const [h1, m1] = String(startTimeStr || '').split(':').map(Number);
  const [h2, m2] = String(endTimeStr || '').split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

function parseRruleParts(rruleVal) {
  const s = String(rruleVal || '').trim();
  if (!s) return {};
  const body = s.replace(/^RRULE:/i, '');
  const out = {};
  for (const part of body.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

function parseByDayToJsWeekdays(bydayStr) {
  if (!bydayStr) return null;
  const days = String(bydayStr).split(',').map((token) => {
    const code = token.replace(/^[-+\d]+/, '').toUpperCase();
    return ICAL_BYDAY_TO_JS[code];
  }).filter((x) => x !== undefined);
  return days.length ? days : null;
}

function parseUntilDate(untilVal) {
  if (!untilVal) return null;
  const m = String(untilVal).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
}

function startOfLocalDayFromParts(y, mo, d) {
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

function eachCalendarDay(fromDate, toDate) {
  const out = [];
  const c = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  for (; c <= end; c.setDate(c.getDate() + 1)) {
    out.push(new Date(c));
  }
  return out;
}

/**
 * One import row per calendar occurrence in a fixed window (mirrors a normal calendar).
 * Includes all-day events; expands FREQ=WEEKLY with BYDAY/INTERVAL/COUNT/UNTIL in a basic way.
 */
function eventsToCalendarItems(events) {
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - 28);

  const rangeEnd = new Date();
  rangeEnd.setHours(23, 59, 59, 999);
  rangeEnd.setDate(rangeEnd.getDate() + 365);

  const rangeStartYmd = formatYmd(
    rangeStart.getFullYear(),
    rangeStart.getMonth() + 1,
    rangeStart.getDate(),
  );
  const rangeEndYmd = formatYmd(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth() + 1,
    rangeEnd.getDate(),
  );

  const items = [];
  let evIndex = 0;

  for (const ev of events) {
    evIndex += 1;
    const summary = cleanIcalText(ev.SUMMARY) || '(Ohne Titel)';
    const room = cleanIcalText(ev.LOCATION);
    const uidRaw = cleanIcalText(ev.UID) || `noid-${evIndex}`;
    const rruleParsed = parseRruleParts(ev.RRULE);
    const freq = (rruleParsed.FREQ || '').toUpperCase();
    const interval = Math.max(1, parseInt(rruleParsed.INTERVAL, 10) || 1);
    const countCap = rruleParsed.COUNT ? parseInt(rruleParsed.COUNT, 10) : null;
    const untilDate = rruleParsed.UNTIL ? parseUntilDate(rruleParsed.UNTIL) : null;

    const rawStart = ev.__PROP_DTSTART || '';
    const rawEnd = ev.__PROP_DTEND || '';
    const dtStartVal = ev.DTSTART;
    const dtEndVal = ev.DTEND;

    const startAllDay = isAllDayDt(rawStart, dtStartVal);
    const endAllDay = dtEndVal ? isAllDayDt(rawEnd, dtEndVal) : startAllDay;

    if (startAllDay) {
      const s = parseIcalDateOnly(dtStartVal);
      if (!s) continue;
      let endExclusive = { ...s };
      if (dtEndVal && endAllDay) {
        const e = parseIcalDateOnly(dtEndVal);
        if (e) endExclusive = e;
      }
      const startD = startOfLocalDayFromParts(s.y, s.mo, s.d);
      const endD = startOfLocalDayFromParts(endExclusive.y, endExclusive.mo, endExclusive.d);
      for (let d = new Date(startD); d < endD; d.setDate(d.getDate() + 1)) {
        const dateStr = formatYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
        if (dateStr < rangeStartYmd) continue;
        if (dateStr > rangeEndYmd) continue;
        const weekday = d.getDay();
        items.push({
          name: summary,
          day: DAY_CODES[weekday],
          time: '',
          end_time: '',
          room,
          lecturer: '',
          imported: true,
          eventDate: dateStr,
          allDay: true,
          icalUid: `${uidRaw}_allday_${dateStr}`,
        });
      }
      continue;
    }

    const clk = parseClockFromIcal(dtStartVal);
    if (!clk) continue;

    let endTime = '';
    if (dtEndVal && !isAllDayDt(rawEnd, dtEndVal)) {
      const endClk = parseClockFromIcal(dtEndVal);
      if (endClk && endClk.date === clk.date) {
        endTime = endClk.time;
      } else if (endClk) {
        endTime = '23:59';
      }
    }
    if (!endTime) {
      endTime = addMinutesToClock(clk.time, 60);
    }
    if (minutesBetween(clk.time, endTime) <= 0) {
      endTime = addMinutesToClock(clk.time, 60);
    }

    const pushTimed = (dateStr, weekday) => {
      if (dateStr < rangeStartYmd) return;
      if (dateStr > rangeEndYmd) return;
      items.push({
        name: summary,
        day: DAY_CODES[weekday],
        time: clk.time,
        end_time: endTime,
        room,
        lecturer: '',
        imported: true,
        eventDate: dateStr,
        allDay: false,
        icalUid: `${uidRaw}_${dateStr}_${clk.time}`,
      });
    };

    if (!freq || freq === 'NONE') {
      pushTimed(clk.date, clk.weekday);
      continue;
    }

    if (freq === 'WEEKLY') {
      const bydays = parseByDayToJsWeekdays(rruleParsed.BYDAY);
      const allowed = bydays || [clk.weekday];
      const anchor = startOfLocalDayFromParts(clk.y, clk.mo, clk.d);
      let emitted = 0;
      for (const d of eachCalendarDay(rangeStart, rangeEnd)) {
        if (untilDate && d > untilDate) break;
        if (countCap != null && emitted >= countCap) break;
        const wd = d.getDay();
        if (!allowed.includes(wd)) continue;
        const dayStart = startOfLocalDayFromParts(
          d.getFullYear(),
          d.getMonth() + 1,
          d.getDate(),
        );
        const weekNum = Math.floor((dayStart - anchor) / (7 * 86400000));
        if (weekNum < 0) continue;
        if (weekNum % interval !== 0) continue;
        const dateStr = formatYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
        pushTimed(dateStr, wd);
        emitted += 1;
      }
      continue;
    }

    pushTimed(clk.date, clk.weekday);
  }

  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    if (seen.has(it.icalUid)) continue;
    seen.add(it.icalUid);
    deduped.push(it);
  }
  deduped.sort((a, b) => {
    const c = (a.eventDate || '').localeCompare(b.eventDate || '');
    if (c !== 0) return c;
    const ct = (a.time || '').localeCompare(b.time || '');
    if (ct !== 0) return ct;
    return (a.name || '').localeCompare(b.name || '');
  });
  return deduped;
}

module.exports = { parseIcal, eventsToCalendarItems };
