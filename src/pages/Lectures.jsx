import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import {
  sortByDay,
  getTodayDayCode,
  getMondayOfWeek,
  addDays,
  formatISODateLocal,
  dateToDayCode,
  sortCalendarImports,
  dayCodeFromISODate,
} from '../utils/helpers';
import { timeToMinutes } from '../utils/weekGridLayout';
import ICalImport from '../components/lectures/ICalImport';
import WeekTimeGridView from '../components/lectures/WeekTimeGridView';
import EmptyState from '../components/ui/EmptyState';
import { PlusIcon, CloseIcon, CalIcon } from '../components/icons/Icons';
import LectureCard from '../components/lectures/LectureList';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316', '#6366F1'];
const EMPTY_FORM = {
  name: '', day: 'Mo', time: '', end_time: '', room: '', lecturer: '', color: COLORS[0],
  eventDate: '', allDay: false,
};

const DAY_CODES_LOCAL = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** Nächstes Datum (ab heute) mit passendem Wochentag-Code, als ISO-String. */
function nextDateForDay(dayCode) {
  const d = new Date();
  for (let i = 0; i < 14; i += 1) {
    if (DAY_CODES_LOCAL[d.getDay()] === dayCode) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    d.setDate(d.getDate() + 1);
  }
  return '';
}

export default function Lectures() {
  const { t, intlLocale } = useLocale();
  const { lectures, addLecture, updateLecture, deleteLecture, loading } = useData();
  const dayNames = useMemo(() => {
    const o = {};
    DAYS.forEach((d) => {
      o[d] = t(`lectures.daysLong.${d}`);
    });
    return o;
  }, [t]);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'week'
  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showIcal, setShowIcal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editScope, setEditScope] = useState('series'); // 'series' | 'single' (nur Modul-Slots)
  const [overrideDate, setOverrideDate] = useState('');
  const [timeError, setTimeError] = useState('');

  const today = getTodayDayCode();
  const todayIso = formatISODateLocal(new Date());

  const manualLectures = useMemo(() => lectures.filter((l) => !l.eventDate), [lectures]);
  const calendarImports = useMemo(
    () => lectures.filter((l) => l.eventDate).sort(sortCalendarImports),
    [lectures],
  );

  const sortedManual = useMemo(() => sortByDay(manualLectures), [manualLectures]);
  const byDay = useMemo(
    () => DAYS.reduce((acc, d) => {
      acc[d] = sortedManual.filter((l) => l.day === d);
      return acc;
    }, {}),
    [sortedManual],
  );

  const untimedLectures = useMemo(
    () => manualLectures.filter((l) => timeToMinutes(l.time) == null),
    [manualLectures],
  );

  const weekMonday = useMemo(() => addDays(getMondayOfWeek(), weekOffset * 7), [weekOffset]);

  const lecturesByWeekColumn = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekMonday, i);
      const iso = formatISODateLocal(date);
      const code = dateToDayCode(date);
      const manual = sortedManual.filter((l) => l.day === code);
      const cal = calendarImports.filter((l) => l.eventDate === iso);
      return [...cal, ...manual].sort((a, b) => {
        if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
        return (a.time || '').localeCompare(b.time || '');
      });
    }),
    [weekMonday, sortedManual, calendarImports],
  );

  const openAdd = () => { setForm(EMPTY_FORM); setEditing(null); setEditScope('series'); setOverrideDate(''); setShowModal(true); };
  const openEdit = (l) => { setForm({ ...l }); setEditing(l.id); setEditScope('series'); setOverrideDate(nextDateForDay(l.day)); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  // Modul-Slot (wöchentliche Basis), für den Einzel-Instanz-Overrides möglich sind
  const isModuleBase = Boolean(form.moduleId) && !form.eventDate;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.time && form.end_time && form.time >= form.end_time) {
      setTimeError(t('lectures.timeError'));
      return;
    }
    setTimeError('');
    let payload = { ...form };
    if (payload.eventDate) {
      payload.day = dayCodeFromISODate(payload.eventDate);
    }
    if (payload.allDay) {
      payload.time = '';
      payload.end_time = '';
    }
    if (editing) {
      if (isModuleBase && editScope === 'single' && overrideDate) {
        // Nur diesen Termin verschieben/ändern → Override-ID moduleId::slotId::datum
        await updateLecture({
          id: `${editing}::${overrideDate}`,
          time: payload.time,
          end_time: payload.end_time,
          room: payload.room,
        });
      } else {
        await updateLecture({ ...payload, id: editing });
      }
    } else {
      await addLecture(payload);
    }
    closeModal();
  };

  // Einzelnen Termin einer Reihe absagen
  const handleCancelOccurrence = async () => {
    if (!editing || !overrideDate) return;
    await deleteLecture(`${editing}::${overrideDate}`);
    closeModal();
  };

  const handleDelete = async (id) => {
    await deleteLecture(id);
    setDeleteConfirm(null);
  };

  return loading ? (
    <div className="loading">{t('common.loading')}</div>
  ) : (
    <div>
      <div style={styles.pageHeader}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('lectures.title')}</h1>
          <p>{lectures.length === 1 ? t('lectures.countOne') : t('lectures.countMany', { count: lectures.length })}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          <div style={styles.viewToggle} role="group" aria-label={t('lectures.viewToggleAria')}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('list')}
            >
              {t('lectures.viewList')}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setViewMode('week');
                setWeekOffset(0);
              }}
            >
              {t('lectures.viewWeek')}
            </button>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowIcal(true)}>
            <CalIcon /> {t('lectures.icalImport')}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <PlusIcon /> {t('lectures.add')}
          </button>
        </div>
      </div>

      {lectures.length === 0 ? (
        <EmptyState icon="📚" title={t('lectures.emptyTitle')} actionLabel={t('lectures.emptyCta')} onAction={() => setShowIcal(true)} />
      ) : viewMode === 'list' ? (
        <div style={styles.schedule}>
          {DAYS.map(day => (
            <div key={day} style={styles.dayBlock}>
              <div style={styles.dayHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={styles.dayName}>{dayNames[day]}</span>
                  <span style={styles.dayCode}>{day}</span>
                </div>
                {day === today && <span className="badge badge-accent">{t('lectures.today')}</span>}
                <span className="badge badge-muted">{byDay[day].length}</span>
              </div>
              <div style={styles.lectureList}>
                {byDay[day].length === 0 ? (
                  <div style={styles.emptyDay}>{t('lectures.emptyDay')}</div>
                ) : (
                  byDay[day].map(lecture => (
                    <LectureCard
                      key={lecture.id}
                      lecture={lecture}
                      isToday={lecture.day === today}
                      onEdit={openEdit}
                      onDelete={setDeleteConfirm}
                      intlLocale={intlLocale}
                      t={t}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
          {calendarImports.length > 0 && (
            <div style={styles.calendarSection}>
              <h3 style={styles.calendarSectionTitle}>{t('lectures.importedCalendarTitle')}</h3>
              <p style={styles.calendarSectionHint}>{t('lectures.importedCalendarHint')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {calendarImports.map((lecture) => (
                  <LectureCard
                    key={lecture.id}
                    lecture={lecture}
                    isToday={lecture.eventDate === todayIso}
                    onEdit={openEdit}
                    onDelete={setDeleteConfirm}
                    intlLocale={intlLocale}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <WeekTimeGridView
            weekMonday={weekMonday}
            setWeekOffset={setWeekOffset}
            weekColumnLectures={lecturesByWeekColumn}
            dayNames={dayNames}
            onEdit={openEdit}
            onDelete={setDeleteConfirm}
            intlLocale={intlLocale}
            weekAbbr={t('lectures.weekAbbr')}
            t={t}
          />
          {untimedLectures.length > 0 && (
            <div style={styles.untimedSection}>
              <h3 style={styles.untimedTitle}>{t('lectures.untimedTitle')}</h3>
              <p style={styles.untimedHint}>{t('lectures.untimedHint')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {sortByDay(untimedLectures).map(lecture => (
                  <LectureCard
                    key={lecture.id}
                    lecture={lecture}
                    isToday={lecture.day === today}
                    onEdit={openEdit}
                    onDelete={setDeleteConfirm}
                    intlLocale={intlLocale}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editing ? t('lectures.modalEdit') : t('lectures.modalNew')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}><CloseIcon /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {isModuleBase && (
                <div className="form-group" style={styles.scopeBox}>
                  <label className="form-label" style={{ marginBottom: 6 }}>{t('lectures.scopeLabel')}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={editScope === 'series' ? { ...styles.scopeBtn, ...styles.scopeBtnActive } : styles.scopeBtn}
                      onClick={() => setEditScope('series')}
                    >
                      {t('lectures.scopeAll')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={editScope === 'single' ? { ...styles.scopeBtn, ...styles.scopeBtnActive } : styles.scopeBtn}
                      onClick={() => setEditScope('single')}
                    >
                      {t('lectures.scopeSingle')}
                    </button>
                  </div>
                  {editScope === 'single' && (
                    <div style={{ marginTop: 10 }}>
                      <input
                        className="form-input"
                        type="date"
                        value={overrideDate}
                        onChange={e => setOverrideDate(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)', marginTop: 8 }}
                        disabled={!overrideDate}
                        onClick={handleCancelOccurrence}
                      >
                        {t('lectures.cancelOccurrence')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{t('lectures.fieldName')}</label>
                <input className="form-input" required placeholder={t('lectures.placeholderName')}
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldDay')}</label>
                  <select
                    className="form-select"
                    value={form.day}
                    disabled={Boolean(form.eventDate)}
                    onChange={e => setForm(f => ({ ...f, day: e.target.value }))}
                  >
                    {DAYS.map(d => <option key={d} value={d}>{dayNames[d]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldColor')}</label>
                  <div style={styles.colorPicker}>
                    {COLORS.map(c => (
                      <button
                        key={c} type="button"
                        onClick={() => setForm(f => ({ ...f, color: c }))}
                        style={{ ...styles.colorSwatch, background: c, outline: form.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {Boolean(form.eventDate) && (
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldEventDate')}</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.eventDate || ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      eventDate: e.target.value,
                      day: e.target.value ? dayCodeFromISODate(e.target.value) : f.day,
                    }))}
                  />
                </div>
              )}
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  id="lecture-allday"
                  type="checkbox"
                  checked={Boolean(form.allDay)}
                  disabled={!form.eventDate}
                  onChange={e => setForm(f => ({
                    ...f,
                    allDay: e.target.checked,
                    time: e.target.checked ? '' : f.time,
                    end_time: e.target.checked ? '' : f.end_time,
                  }))}
                />
                <label htmlFor="lecture-allday" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('lectures.fieldAllDay')}</label>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldFrom')}</label>
                  <input
                    className="form-input"
                    type="time"
                    disabled={Boolean(form.allDay)}
                    value={form.time}
                    onChange={e => { setForm(f => ({ ...f, time: e.target.value })); setTimeError(''); }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldTo')}</label>
                  <input
                    className={`form-input${timeError ? ' form-input-error' : ''}`}
                    type="time"
                    disabled={Boolean(form.allDay)}
                    value={form.end_time}
                    onChange={e => { setForm(f => ({ ...f, end_time: e.target.value })); setTimeError(''); }}
                  />
                </div>
              </div>
              {timeError && <span style={{ fontSize: 11, color: 'var(--danger)', marginTop: -8, marginBottom: 8, display: 'block' }}>{timeError}</span>}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldRoom')}</label>
                  <input className="form-input" placeholder={t('lectures.placeholderRoom')}
                    value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('lectures.fieldLecturer')}</label>
                  <input className="form-input" placeholder={t('lectures.placeholderLecturer')}
                    value={form.lecturer} onChange={e => setForm(f => ({ ...f, lecturer: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary">{editing ? t('common.save') : t('common.add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showIcal && <ICalImport onClose={() => setShowIcal(false)} />}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>{t('lectures.deleteTitle')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirm(null)}><CloseIcon /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('lectures.deleteBody', { name: lectures.find(l => l.id === deleteConfirm)?.name || '' })}
            </p>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  schedule: { display: 'flex', flexDirection: 'column', gap: 20 },
  dayBlock: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  dayHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 20px',
    background: 'var(--bg-tertiary)',
    borderBottom: '1px solid var(--border-color)',
  },
  dayName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  dayCode: { fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 },
  lectureList: { display: 'flex', flexDirection: 'column', gap: 0 },
  lectureCard: {
    padding: '14px 20px',
    borderBottom: '1px solid var(--border-subtle)',
    borderLeft: '4px solid var(--accent)',
    transition: 'background var(--transition)',
  },
  lectureTop: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  lectureName: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', display: 'block' },
  lectureDateBadge: {
    display: 'inline-block',
    marginTop: 4,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'var(--bg-secondary)',
    padding: '2px 8px',
    borderRadius: 6,
  },
  lectureActions: { display: 'flex', gap: 2, transition: 'opacity var(--transition)' },
  viewToggle: { display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' },
  emptyDay: { padding: '16px 20px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' },
  untimedSection: {
    marginTop: 24,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  untimedTitle: { fontSize: 14, fontWeight: 600, margin: 0, padding: '14px 20px 0', color: 'var(--text-primary)' },
  untimedHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '6px 20px 0' },
  lectureMeta: { display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-secondary)' },
  colorPicker: { display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8 },
  colorSwatch: { width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', transition: 'transform var(--transition)' },
  scopeBox: { background: 'var(--bg-tertiary)', borderRadius: 10, padding: 12 },
  scopeBtn: { flex: 1 },
  scopeBtnActive: { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)', color: 'var(--accent-hover)', fontWeight: 600 },
  calendarSection: {
    marginTop: 8,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  calendarSectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
    padding: '14px 20px 0',
    color: 'var(--text-primary)',
  },
  calendarSectionHint: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    margin: '6px 20px 0',
  },
};
