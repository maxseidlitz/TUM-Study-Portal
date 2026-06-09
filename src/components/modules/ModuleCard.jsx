import React from 'react';
import { openExternal } from '../../utils/helpers';
import { EditIcon, TrashIcon, ExternalIcon } from '../icons/Icons';

const styles = {
  card: { display: 'flex', flexDirection: 'column', gap: 16 },
  cardTop: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  courseIcon: {
    width: 46, height: 46, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
  },
  courseName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 },
  courseMeta: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' },
  cardActions: { display: 'flex', gap: 8, alignItems: 'center' },
};

export default function ModuleCard({ mod, onEdit, onDelete, t }) {
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

