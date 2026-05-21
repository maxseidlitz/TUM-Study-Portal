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
export function groupImportedItemsToModules(items = []) {
  const byName = new Map();
  for (const it of items) {
    const key = (it.name || '(Ohne Titel)').trim();
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
