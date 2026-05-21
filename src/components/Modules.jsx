import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { generateId, openExternal } from '../utils/helpers';
import EmptyState from './ui/EmptyState';
import { PlusIcon, CloseIcon, SyncIcon, ExternalIcon } from './icons/Icons';
import ModuleCard from './modules/ModuleCard';
import WeekScheduleEditor from './modules/WeekScheduleEditor';

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316', '#6366F1', '#EF4444', '#14B8A6'];
const EMPTY_SLOT = { id: '', day: 'Mo', time: '', end_time: '', room: '', lecturer: '', allDay: false };
const EMPTY_FORM = { name: '', code: '', semester: '', moodleUrl: '', color: COLORS[0], slots: [] };

export default function Modules() {
  const { t } = useLocale();
  const { modules, addModule, updateModule, deleteModule, loading } = useData();
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
        <EmptyState icon="📚" title={t('modules.emptyTitle')} actionLabel={t('modules.emptyCta')} onAction={openAdd} />
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
          <div className="modal" style={{ maxWidth: 760 }}>
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

              <div className="form-group">
                <label className="form-label">{t('modules.slotsTitle')}</label>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 10 }}>
                  {t('modules.slotsHint')}
                </p>
                <WeekScheduleEditor
                  slots={form.slots || []}
                  color={form.color}
                  onChange={(slots) => setForm((f) => ({ ...f, slots }))}
                />
              </div>

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
