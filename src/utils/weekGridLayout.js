/** Sichtbares Raster (Minuten ab Mitternacht). */
export const DISPLAY_START_MIN = 8 * 60;
export const DISPLAY_END_MIN = 20 * 60;

const DEFAULT_DURATION_MIN = 90;

export function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/** Rohintervall [start,end) in Minuten; null wenn keine Startzeit. Ganztägig: kurzer Balken oben im Raster. */
export function lectureToRawInterval(lecture) {
  if (lecture.allDay) {
    return { startMin: DISPLAY_START_MIN, endMin: Math.min(DISPLAY_START_MIN + 42, DISPLAY_END_MIN) };
  }
  const start = timeToMinutes(lecture.time);
  if (start == null) return null;
  let end = timeToMinutes(lecture.end_time);
  if (end == null) end = start + DEFAULT_DURATION_MIN;
  if (end <= start) end = start + DEFAULT_DURATION_MIN;
  return { startMin: start, endMin: end };
}

/** Schnitt mit Anzeigefenster; null wenn komplett außerhalb. */
export function clipToDisplay(startMin, endMin) {
  if (endMin <= DISPLAY_START_MIN || startMin >= DISPLAY_END_MIN) return null;
  return {
    startMin: Math.max(startMin, DISPLAY_START_MIN),
    endMin: Math.min(endMin, DISPLAY_END_MIN),
  };
}

function overlapsHalfOpen(a, b) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function findClusterIndices(intervals) {
  const n = intervals.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (overlapsHalfOpen(intervals[i], intervals[j])) union(i, j);
    }
  }
  const roots = new Map();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    if (!roots.has(r)) roots.set(r, []);
    roots.get(r).push(i);
  }
  return [...roots.values()];
}

/** Sweep: maximale gleichzeitige Anzahl überlappender Intervalle. */
export function maxConcurrency(intervals) {
  if (intervals.length === 0) return 0;
  const points = [];
  for (const e of intervals) {
    points.push({ t: e.startMin, d: 1 });
    points.push({ t: e.endMin, d: -1 });
  }
  points.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let m = 0;
  for (const p of points) {
    cur += p.d;
    m = Math.max(m, cur);
  }
  return m;
}

/**
 * Ordnet pro Tag überlappende Termine Spalten zu.
 * @param {Array<{ id: string, startMin: number, endMin: number }>} clipped – bereits auf DISPLAY_* begrenzt
 * @returns {Array<{ id: string, startMin: number, endMin: number, columnIndex: number, columnCount: number }>}
 */
export function layoutDayColumns(clipped) {
  if (clipped.length === 0) return [];

  const intervals = clipped.map((c) => ({ id: c.id, startMin: c.startMin, endMin: c.endMin }));
  const clusters = findClusterIndices(intervals);
  const colById = new Map();

  for (const idxs of clusters) {
    const sub = idxs.map((i) => intervals[i]);
    const M = maxConcurrency(sub);
    const sortedIdx = [...idxs].sort(
      (ia, ib) => intervals[ia].startMin - intervals[ib].startMin
        || intervals[ia].endMin - intervals[ib].endMin,
    );

    const active = [];

    for (const i of sortedIdx) {
      const ev = intervals[i];
      for (let k = active.length - 1; k >= 0; k -= 1) {
        if (active[k].endMin <= ev.startMin) active.splice(k, 1);
      }
      const used = new Set(active.map((a) => a.col));
      let col = 0;
      while (used.has(col)) col += 1;
      active.push({ endMin: ev.endMin, col });
      colById.set(ev.id, { columnIndex: col, columnCount: M });
    }
  }

  return clipped.map((c) => {
    const { columnIndex, columnCount } = colById.get(c.id);
    return { ...c, columnIndex, columnCount };
  });
}

/**
 * @param {Array<object>} lectures – Rohvorlesungen mit time / end_time
 * @returns {Array<{ id: string, startMin: number, endMin: number, columnIndex: number, columnCount: number, lecture: object }>}
 */
export function layoutLecturesForDay(lectures) {
  const clipped = [];
  for (const lec of lectures) {
    const raw = lectureToRawInterval(lec);
    if (!raw) continue;
    const c = clipToDisplay(raw.startMin, raw.endMin);
    if (!c) continue;
    clipped.push({ id: lec.id, startMin: c.startMin, endMin: c.endMin, lecture: lec });
  }
  return layoutDayColumns(clipped);
}
