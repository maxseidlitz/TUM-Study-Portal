import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { useData } from '../../context/DataContext';
import { formatDate, getDaysUntil } from '../../utils/helpers';
import { CloseIcon, CheckIcon, TrashIcon } from '../icons/Icons';

const PRIORITY_KEYS = ['high', 'medium', 'low'];
const PRIORITY_COLORS = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };

export default function TodoDetail({ todo, onUpdate, onToggle, onDelete, onClose }) {
  const { t, intlLocale } = useLocale();
  const { modules, moodleCourses } = useData();
  const priorities = useMemo(
    () => PRIORITY_KEYS.map(key => ({ key, label: t(`priority.${key}`), color: PRIORITY_COLORS[key] })),
    [t],
  );
  const [draft, setDraft] = useState(todo);

  useEffect(() => { setDraft(todo); }, [todo]);

  if (!todo) return null;

  // Persist a field change immediately
  const commit = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onUpdate(next);
  };

  const days = draft.due ? getDaysUntil(draft.due) : null;
  const prioKey = draft.priority || 'medium';

  return (
    <aside style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>{t('todoDetail.header')}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} title={t('todoDetail.closeTitle')}>
          <CloseIcon />
        </button>
      </div>

      <div style={styles.body}>
        {/* Complete + title */}
        <div style={styles.titleRow}>
          <button
            className={`todo-check ${draft.done ? 'done' : ''}`}
            onClick={() => onToggle(draft.id)}
            title={draft.done ? t('todoDetail.markOpen') : t('todoDetail.complete')}
            style={{ width: 24, height: 24 }}
          >
            <CheckIcon />
          </button>
          <textarea
            style={{ ...styles.titleInput, textDecoration: draft.done ? 'line-through' : 'none' }}
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            onBlur={() => draft.title.trim() && onUpdate(draft)}
            rows={1}
            placeholder={t('todoDetail.placeholderTitle')}
          />
        </div>

        {draft.done && (
          <div style={styles.doneBanner}>{t('todoDetail.doneBanner')}</div>
        )}

        {/* Priority */}
        <div style={styles.field}>
          <label style={styles.label}>{t('todoDetail.priority')}</label>
          <div style={styles.segmented}>
            {priorities.map(p => (
              <button
                key={p.key}
                onClick={() => commit({ priority: p.key })}
                style={{
                  ...styles.segment,
                  background: draft.priority === p.key ? p.color : 'transparent',
                  color: draft.priority === p.key ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modul (Kurs) */}
        <div style={styles.field}>
          <label style={styles.label}>{t('todoDetail.module')}</label>
          <select
            className="form-input"
            value={draft.moduleId || ''}
            onChange={(e) => {
              const v = e.target.value;
              const mod = modules.find((m) => m.id === v);
              const next = {
                ...draft,
                moduleId: v || '',
                moodleCourseId: v ? '' : (draft.moodleCourseId || ''),
                subject: v && mod ? mod.name : draft.subject,
              };
              setDraft(next);
              onUpdate(next);
            }}
          >
            <option value="">{t('todoDetail.noModule')}</option>
            {draft.moduleId && !modules.some((m) => m.id === draft.moduleId) && (
              <option value={draft.moduleId}>{t('todoDetail.unknownModule')}</option>
            )}
            {modules.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {moodleCourses.length > 0 && (
          <div style={styles.field}>
            <label style={styles.label}>{t('todoDetail.moodleCourse')}</label>
            <select
              className="form-input"
              value={draft.moodleCourseId || ''}
              onChange={(e) => {
                const v = e.target.value;
                const c = moodleCourses.find((x) => x.id === v);
                const next = {
                  ...draft,
                  moodleCourseId: v || '',
                  moduleId: v ? '' : (draft.moduleId || ''),
                  subject: v && c ? c.name : draft.subject,
                };
                setDraft(next);
                onUpdate(next);
              }}
            >
              <option value="">{t('todoDetail.noMoodleCourse')}</option>
              {moodleCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Subject */}
        <div style={styles.field}>
          <label style={styles.label}>{t('todoDetail.subject')}</label>
          <input
            className="form-input"
            placeholder={t('todoDetail.placeholderSubject')}
            value={draft.subject || ''}
            onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
            onBlur={() => onUpdate(draft)}
          />
        </div>

        {/* Due date */}
        <div style={styles.field}>
          <label style={styles.label}>{t('todoDetail.due')}</label>
          <input
            className="form-input"
            type="date"
            value={draft.due || ''}
            onChange={e => commit({ due: e.target.value })}
          />
          {days !== null && (
            <div style={{
              ...styles.dueHint,
              color: days < 0 ? 'var(--danger)' : days === 0 ? 'var(--warning)' : 'var(--text-muted)',
            }}>
              {days < 0
                ? t('todoDetail.overdue', { days: Math.abs(days) })
                : days === 0 ? t('todoDetail.dueToday') : t('todoDetail.dueIn', { days, date: formatDate(draft.due, intlLocale) })}
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={styles.field}>
          <label style={styles.label}>{t('todoDetail.notes')}</label>
          <textarea
            className="form-textarea"
            placeholder={t('todoDetail.placeholderNotes')}
            value={draft.notes || ''}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            onBlur={() => onUpdate(draft)}
          />
        </div>
      </div>

      <div style={styles.footer}>
        <span style={styles.meta}>{t('todoDetail.priorityMeta', { prio: t(`priority.${prioKey}`) })}</span>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(draft.id)}>
          <TrashIcon /> {t('todoDetail.deleteTask')}
        </button>
      </div>
    </aside>
  );
}

const styles = {
  panel: {
    width: 360, flexShrink: 0,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex', flexDirection: 'column',
    height: 'fit-content',
    maxHeight: 'calc(100vh - 140px)',
    position: 'sticky', top: 0,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
  },
  headerLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' },
  body: { padding: 16, overflowY: 'auto' },
  titleRow: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 },
  titleInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
    color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 600,
    lineHeight: 1.4, padding: 0, marginTop: 1,
  },
  doneBanner: {
    fontSize: 12, color: 'var(--success)', background: 'var(--success-subtle)',
    padding: '6px 10px', borderRadius: 6, marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  segmented: { display: 'flex', gap: 4, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 },
  segment: {
    flex: 1, padding: '6px 4px', border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition)',
  },
  dueHint: { fontSize: 11, marginTop: 5, fontWeight: 500 },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderTop: '1px solid var(--border-color)',
  },
  meta: { fontSize: 11, color: 'var(--text-muted)' },
};
