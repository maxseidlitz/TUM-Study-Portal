import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { generateId } from '../../utils/helpers';
import { DISPLAY_START_MIN, DISPLAY_END_MIN } from '../../utils/weekGridLayout';

/**
 * Interaktiver Wochenraster-Editor für Modul-Termine ("slots").
 * - Klick ins Raster legt einen 90-min-Termin an.
 * - Klick auf einen Termin-Block öffnet den Inline-Editor darunter.
 * Arbeitet rein auf dem vorhandenen slots-Datenmodell und meldet Änderungen
 * über onChange(nextSlots) zurück.
 */

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const GRID_DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_NAMES = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
const SPAN = DISPLAY_END_MIN - DISPLAY_START_MIN;
const BODY_HEIGHT = 380;

function minToTime(min) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, min));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}
function timeToMin(t) {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}
function snap(min, step = 15) {
  return Math.round(min / step) * step;
}

export default function WeekScheduleEditor({ slots = [], color = '#3B82F6', onChange }) {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState(null);

  const hours = [];
  for (let m = DISPLAY_START_MIN; m <= DISPLAY_END_MIN; m += 60) hours.push(m);

  const handleColumnClick = (day, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    let start = snap(DISPLAY_START_MIN + ratio * SPAN, 15);
    let end = start + 90;
    if (end > DISPLAY_END_MIN) { end = DISPLAY_END_MIN; start = Math.max(DISPLAY_START_MIN, end - 90); }
    const slot = {
      id: generateId(), day,
      time: minToTime(start), end_time: minToTime(end),
      room: '', lecturer: '', allDay: false,
    };
    onChange([...slots, slot]);
    setSelectedId(slot.id);
  };

  const patchSlot = (id, patch) => onChange(slots.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const removeSlot = (id) => {
    onChange(slots.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selected = slots.find(s => s.id === selectedId) || null;

  return (
    <div>
      <div style={{ ...styles.grid, gridTemplateColumns: `44px repeat(${GRID_DAYS.length}, 1fr)` }}>
        {/* Time gutter */}
        <div>
          <div style={styles.colHead} />
          <div style={{ ...styles.gutterBody, height: BODY_HEIGHT }}>
            {hours.map((m) => (
              <div key={m} style={{ ...styles.hourLabel, top: `${((m - DISPLAY_START_MIN) / SPAN) * 100}%` }}>
                {minToTime(m)}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {GRID_DAYS.map((day) => (
          <div key={day}>
            <div style={styles.colHead}>{day}</div>
            <div
              style={{ ...styles.colBody, height: BODY_HEIGHT }}
              onClick={(e) => handleColumnClick(day, e)}
              title={t('modules.gridClickHint') || 'Klicken zum Anlegen'}
            >
              {hours.map((m, i) => (i === 0 ? null : (
                <div key={m} style={{ ...styles.hourLine, top: `${((m - DISPLAY_START_MIN) / SPAN) * 100}%` }} />
              )))}
              {slots.filter(s => s.day === day).map((s) => {
                const start = s.allDay ? DISPLAY_START_MIN : (timeToMin(s.time) ?? DISPLAY_START_MIN);
                let end = s.allDay ? DISPLAY_START_MIN + 50 : (timeToMin(s.end_time) ?? start + 90);
                if (end <= start) end = start + 90;
                const top = Math.max(0, ((start - DISPLAY_START_MIN) / SPAN) * 100);
                const height = Math.max(5, ((Math.min(end, DISPLAY_END_MIN) - start) / SPAN) * 100);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
                    style={{
                      ...styles.block,
                      top: `${top}%`,
                      height: `${height}%`,
                      background: color,
                      boxShadow: selectedId === s.id ? '0 0 0 2px var(--bg-secondary), 0 0 0 4px #fff' : 'none',
                    }}
                  >
                    <span style={styles.blockTime}>{s.allDay ? (t('lectures.allDay') || 'Ganztägig') : s.time}</span>
                    {s.room && <span style={styles.blockRoom}>{s.room}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p style={styles.hint}>{t('modules.gridHint') || 'Klicke ins Raster, um einen Termin anzulegen. Klicke auf einen Termin, um ihn zu bearbeiten.'}</p>

      {/* Inline editor for selected slot */}
      {selected && (
        <div style={styles.editPanel}>
          <div style={styles.editHead}>
            <span style={styles.editTitle}>{t('modules.editSlot') || 'Termin bearbeiten'}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>✕</button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('lectures.fieldDay')}</label>
              <select className="form-select" value={selected.day} onChange={(e) => patchSlot(selected.id, { day: e.target.value })}>
                {DAYS.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('lectures.fieldFrom')}</label>
              <input className="form-input" type="time" disabled={selected.allDay}
                value={selected.time} onChange={(e) => patchSlot(selected.id, { time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('lectures.fieldTo')}</label>
              <input className="form-input" type="time" disabled={selected.allDay}
                value={selected.end_time} onChange={(e) => patchSlot(selected.id, { end_time: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('lectures.fieldRoom')}</label>
              <input className="form-input" placeholder={t('lectures.placeholderRoom')}
                value={selected.room} onChange={(e) => patchSlot(selected.id, { room: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('lectures.fieldLecturer')}</label>
              <input className="form-input" placeholder={t('lectures.placeholderLecturer')}
                value={selected.lecturer} onChange={(e) => patchSlot(selected.id, { lecturer: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={Boolean(selected.allDay)}
                onChange={(e) => patchSlot(selected.id, {
                  allDay: e.target.checked,
                  time: e.target.checked ? '' : (selected.time || '08:00'),
                  end_time: e.target.checked ? '' : (selected.end_time || '09:30'),
                })}
              />
              {t('lectures.fieldAllDay')}
            </label>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeSlot(selected.id)}>
              {t('modules.removeSlot')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  grid: { display: 'grid', gap: 0, border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' },
  colHead: {
    height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
    background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)',
  },
  gutterBody: { position: 'relative', borderRight: '1px solid var(--border-color)' },
  hourLabel: { position: 'absolute', right: 4, transform: 'translateY(-50%)', fontSize: 9, color: 'var(--text-muted)' },
  colBody: { position: 'relative', cursor: 'copy', borderRight: '1px solid var(--border-subtle)' },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, background: 'var(--border-subtle)' },
  block: {
    position: 'absolute', left: 2, right: 2, border: 'none', borderRadius: 5,
    color: '#fff', cursor: 'pointer', padding: '2px 4px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left',
    fontFamily: 'var(--font-sans)',
  },
  blockTime: { fontSize: 10, fontWeight: 700, lineHeight: 1.2 },
  blockRoom: { fontSize: 9, opacity: 0.9, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 8, marginBottom: 12 },
  editPanel: {
    border: '1px solid var(--border-color)', borderRadius: 10, padding: 14,
    background: 'var(--bg-tertiary)', marginBottom: 16,
  },
  editHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  editTitle: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' },
};
