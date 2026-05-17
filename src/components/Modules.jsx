import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { generateId, openExternal } from '../utils/helpers';

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316', '#6366F1', '#EF4444', '#14B8A6'];
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const EMPTY_SLOT = { id: '', day: 'Mo', time: '', end_time: '', room: '', lecturer: '', allDay: false };
const EMPTY_FORM = { name: '', code: '', semester: '', moodleUrl: '', color: COLORS[0], slots: [] };

export default function Modules() {
  const { t } = useLocale();
  const { modules, addModule, updateModule, deleteModule, loading } = useData();
  const dayNames = useMemo(() => {
    const o = {};
    DAYS.forEach((d) => {
      o[d] = t(`lectures.daysLong.${d}`);
    });
    return o;
  }, [t]);
  const [showModal, setShowModal] = useState(false);
  const [showMoodleModal, setShowMoodleModal] = useState(false);
  const [moodleEmail, setMoodleEmail] = useState('');
  const [moodleSubmitted, setMoodleSubmitted] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  if (loading) return <div className="loading">{t('common.loading')}</div>;

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowModal(true);
  };
  const openEdit = (mod) => {
    setForm({
      name: mod.name || '',
      code: mod.code || '',
      semester: mod.semester || '',
      moodleUrl: mod.moodleUrl || '',
      color: mod.color || COLORS[0],
      slots: Array.isArray(mod.slots) ? mod.slots.map((s) => ({ ...EMPTY_SLOT, ...s })) : [],
    });
    setEditing(mod.id);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const slots = (form.slots || []).map((s) => ({
      ...s,
      id: s.id || generateId(),
      day: s.day || 'Mo',
      time: s.time || '',
      end_time: s.end_time || '',
      room: s.room || '',
      lecturer: s.lecturer || '',
      allDay: Boolean(s.allDay),
    }));
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      semester: form.semester.trim(),
      moodleUrl: form.moodleUrl.trim(),
      color: form.color,
      slots,
    };
    if (editing) await updateModule({ ...payload, id: editing });
    else await addModule(payload);
    closeModal();
  };

  const handleDelete = async (id) => {
    await deleteModule(id);
    setDeleteConfirm(null);
  };

  const addSlot = () => {
    setForm((f) => ({
      ...f,
      slots: [...(f.slots || []), { ...EMPTY_SLOT, id: generateId() }],
    }));
  };

  const updateSlot = (index, patch) => {
    setForm((f) => {
      const slots = [...(f.slots || [])];
      slots[index] = { ...slots[index], ...patch };
      return { ...f, slots };
    });
  };

  const removeSlot = (index) => {
    setForm((f) => ({
      ...f,
      slots: (f.slots || []).filter((_, i) => i !== index),
    }));
  };

  return (
    <div>
      <div style={styles.pageHeader}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('modules.title')}</h1>
          <p>{modules.length === 1 ? t('modules.countOne') : t('modules.countMany', { count: modules.length })}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowMoodleModal(true)}>
            <SyncIcon /> {t('modules.moodleSync')}
          </button>
          <button className="btn btn-secondary" onClick={() => openExternal('https://www.moodle.tum.de')}>
            <ExternalIcon /> {t('modules.openMoodle')}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <PlusIcon /> {t('modules.addModule')}
          </button>
        </div>
      </div>

      {modules.length === 0 ? (
        <EmptyState onAdd={openAdd} t={t} />
      ) : (
        <div className="grid-2">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.id}
              mod={mod}
              onEdit={openEdit}
              onDelete={setDeleteConfirm}
              t={t}
            />
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>{editing ? t('modules.modalEdit') : t('modules.modalNew')}</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={closeModal}><CloseIcon /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">{t('modules.fieldName')}</label>
                <input
                  className="form-input"
                  required
                  placeholder={t('modules.placeholderName')}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('modules.fieldCode')}</label>
                  <input
                    className="form-input"
                    placeholder={t('modules.placeholderCode')}
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('modules.fieldSemester')}</label>
                  <input
                    className="form-input"
                    placeholder={t('modules.placeholderSemester')}
                    value={form.semester}
                    onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('modules.fieldMoodleUrl')}</label>
                <input
                  className="form-input"
                  type="url"
                  placeholder={t('modules.placeholderUrl')}
                  value={form.moodleUrl}
                  onChange={(e) => setForm((f) => ({ ...f, moodleUrl: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('modules.fieldColor')}</label>
                <div style={styles.colorPicker}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      style={{
                        ...styles.colorSwatch,
                        background: c,
                        outline: form.color === c ? `3px solid ${c}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={styles.slotsHead}>
                <span className="form-label" style={{ margin: 0 }}>{t('modules.slotsTitle')}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addSlot}>
                  <PlusIcon /> {t('modules.addSlot')}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
                {t('modules.slotsHint')}
              </p>
              {(form.slots || []).length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('modules.noSlots')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {(form.slots || []).map((slot, index) => (
                    <div key={slot.id || index} style={styles.slotCard}>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">{t('lectures.fieldDay')}</label>
                          <select
                            className="form-select"
                            value={slot.day}
                            onChange={(e) => updateSlot(index, { day: e.target.value })}
                          >
                            {DAYS.map((d) => <option key={d} value={d}>{dayNames[d]}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('lectures.fieldFrom')}</label>
                          <input
                            className="form-input"
                            type="time"
                            disabled={slot.allDay}
                            value={slot.time}
                            onChange={(e) => updateSlot(index, { time: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('lectures.fieldTo')}</label>
                          <input
                            className="form-input"
                            type="time"
                            disabled={slot.allDay}
                            value={slot.end_time}
                            onChange={(e) => updateSlot(index, { end_time: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">{t('lectures.fieldRoom')}</label>
                          <input
                            className="form-input"
                            placeholder={t('lectures.placeholderRoom')}
                            value={slot.room}
                            onChange={(e) => updateSlot(index, { room: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">{t('lectures.fieldLecturer')}</label>
                          <input
                            className="form-input"
                            placeholder={t('lectures.placeholderLecturer')}
                            value={slot.lecturer}
                            onChange={(e) => updateSlot(index, { lecturer: e.target.value })}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(slot.allDay)}
                            onChange={(e) => updateSlot(index, {
                              allDay: e.target.checked,
                              time: e.target.checked ? '' : slot.time,
                              end_time: e.target.checked ? '' : slot.end_time,
                            })}
                          />
                          {t('lectures.fieldAllDay')}
                        </label>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeSlot(index)}>
                          {t('modules.removeSlot')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary">{editing ? t('common.save') : t('common.add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>{t('modules.deleteTitle')}</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirm(null)}><CloseIcon /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('modules.deleteBody', { name: modules.find((m) => m.id === deleteConfirm)?.name || '' })}
            </p>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {showMoodleModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowMoodleModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>{t('modules.moodleSyncModalTitle')}</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowMoodleModal(false)}><CloseIcon /></button>
            </div>
            {moodleSubmitted ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
                <p style={{ fontWeight: 600, color: 'var(--success)' }}>{t('modules.moodleSyncSuccess')}</p>
                <button type="button" className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => setShowMoodleModal(false)}>
                  {t('common.close')}
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setMoodleSubmitted(true); }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  {t('modules.moodleSyncModalBody')}
                </p>
                <div className="form-group">
                  <input
                    className="form-input"
                    type="email"
                    required
                    placeholder={t('modules.moodleSyncEmailPlaceholder')}
                    value={moodleEmail}
                    onChange={(e) => setMoodleEmail(e.target.value)}
                  />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMoodleModal(false)}>{t('common.cancel')}</button>
                  <button type="submit" className="btn btn-primary">{t('modules.moodleSyncSubmit')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleCard({ mod, onEdit, onDelete, t }) {
  const initials = (mod.name || '')
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const slotCount = Array.isArray(mod.slots) ? mod.slots.length : 0;

  return (
    <div className="card" style={styles.card}>
      <div style={styles.cardTop}>
        <div style={{ ...styles.courseIcon, background: mod.color || 'var(--accent)' }}>
          {initials || '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={styles.courseName}>{mod.name}</h3>
          <div style={styles.courseMeta}>
            {mod.code && <span className="badge badge-muted">{mod.code}</span>}
            {mod.semester && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mod.semester}</span>}
            <span className="badge badge-muted">{t('modules.slotCount', { count: slotCount })}</span>
          </div>
        </div>
      </div>

      <div style={styles.cardActions}>
        {mod.moodleUrl ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openExternal(mod.moodleUrl)} style={{ flex: 1 }}>
            <ExternalIcon /> {t('modules.openCourse')}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{t('modules.noUrl')}</span>
        )}
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(mod)} title={t('modules.editTitle')}>
          <EditIcon />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onDelete(mod.id)} title={t('modules.deleteTitleBtn')} style={{ color: 'var(--danger)' }}>
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd, t }) {
  return (
    <div className="empty-state">
      <span style={{ fontSize: 48 }}>📚</span>
      <p>{t('modules.emptyTitle')}</p>
      <button type="button" className="btn btn-primary" onClick={onAdd}>{t('modules.emptyCta')}</button>
    </div>
  );
}

function PlusIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function SyncIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><polyline points="21 3 21 8 16 8" /></svg>; }
function CloseIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function ExternalIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>; }
function EditIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>; }
function TrashIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>; }

const styles = {
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  card: { display: 'flex', flexDirection: 'column', gap: 16 },
  cardTop: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  courseIcon: {
    width: 46, height: 46, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
  },
  courseName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 },
  courseMeta: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  cardActions: { display: 'flex', gap: 8, alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' },
  colorPicker: { display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8 },
  colorSwatch: { width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', transition: 'transform var(--transition)' },
  slotsHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  slotCard: {
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: 12,
    background: 'var(--bg-tertiary)',
  },
};
