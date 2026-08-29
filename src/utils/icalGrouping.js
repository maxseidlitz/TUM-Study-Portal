/**
 * Gruppiert importierte iCal-Termine zu Modulen + Einzelterminen.
 *
 * Regel: Termine mit gleichem Kursnamen + gleichem Wochentag + gleicher Uhrzeit,
 * die mehrfach vorkommen, sind eine wöchentliche Vorlesung → Modul-Slot.
 * Einmalige Termine (z. B. Klausuren, Sondertermine) bleiben dattierte Lectures.
 *
 * Reine Funktion (keine IDs, keine Seiteneffekte) → gut testbar. IDs werden vom
 * Aufrufer ergänzt.
 *
 * @param {Array} items  Vom Parser gelieferte Termine ({ name, day, time, end_time, room, allDay, eventDate, ... })
 * @returns {{ modules: Array, lectures: Array }}
 */
export function normalizeIcalTitle(name) {
  const trimmed = String(name || '').replace(/\s+/g, ' ').trim();
  return trimmed || '(Ohne Titel)';
}

/**
 * TUM-Semester aus einem Datum (YYYY-MM-DD) ableiten.
 * (Spiegel der Logik in public/ical.js — dort für die Termin-Tags, hier für die UI.)
 */
export function semesterForYmd(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-/);
  if (!m) return '';
  const y = +m[1];
  const mo = +m[2];
  if (mo >= 4 && mo <= 9) return `SS ${y}`;
  const startYear = mo >= 10 ? y : y - 1;
  return `WS ${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Aktuelles Semester (heute). */
export function currentSemesterLabel(now = new Date()) {
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return semesterForYmd(ymd);
}

/** Sortierschlüssel: neueres Semester = größerer Wert (SS Y < WS Y/…). */
export function semesterSortKey(label) {
  const ss = String(label || '').match(/^SS (\d{4})/);
  if (ss) return +ss[1] * 2;
  const ws = String(label || '').match(/^WS (\d{4})/);
  if (ws) return +ws[1] * 2 + 1;
  return -1;
}

export function slotOverrideKey(moduleName, slot) {
  return `${normalizeIcalTitle(moduleName)}|${slot.day || ''}|${slot.time || ''}|${slot.end_time || ''}`;
}

export function collectSlotOverrides(modules = []) {
  const map = new Map();
  for (const mod of modules) {
    for (const slot of mod.slots || []) {
      const overrides = slot.overrides && typeof slot.overrides === 'object' ? slot.overrides : null;
      if (!overrides || !Object.keys(overrides).length) continue;
      map.set(slotOverrideKey(mod.name, slot), overrides);
    }
  }
  return map;
}

export function groupImportedItemsToModules(items = []) {
  const byName = new Map();
  for (const it of items) {
    const key = normalizeIcalTitle(it.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(it);
  }

  const modules = [];
  const lectures = [];

  for (const [name, group] of byName) {
    // Slot-Signatur: Wochentag + Start + Ende (ganztägige Termine nie als Slot)
    const slotMap = new Map();
    for (const it of group) {
      const sig = `${it.day}|${it.time || ''}|${it.end_time || ''}`;
      if (!slotMap.has(sig)) slotMap.set(sig, []);
      slotMap.get(sig).push(it);
    }

    const slots = [];
    const oneOffs = [];
    for (const occ of slotMap.values()) {
      const first = occ[0];
      if (occ.length >= 2 && !first.allDay && first.time) {
        slots.push({
          day: first.day,
          time: first.time || '',
          end_time: first.end_time || '',
          room: mostCommon(occ.map(o => o.room).filter(Boolean)),
          lecturer: '',
          allDay: false,
        });
      } else {
        oneOffs.push(...occ);
      }
    }

    if (slots.length > 0) {
      modules.push({
        name,
        semester: mostCommon(group.map(g => g.semester).filter(Boolean)),
        color: group.find(g => g.color)?.color || '#3B82F6',
        source: 'ical',
        slots,
      });
      // Einmalige Termine desselben Kurses bleiben dattierte Lectures
      lectures.push(...oneOffs);
    } else {
      // Kein wiederkehrender Slot → alle als Einzeltermine
      lectures.push(...group);
    }
  }

  return { modules, lectures };
}

function mostCommon(arr) {
  if (!arr.length) return '';
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best = '';
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}
