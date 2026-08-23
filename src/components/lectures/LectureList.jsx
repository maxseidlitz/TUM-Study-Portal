import React, { useState } from 'react';
import { formatDate } from '../../utils/helpers';
import { EditIcon, TrashIcon } from '../icons/Icons';

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
export default function LectureCard({ lecture, isToday, onEdit, onDelete, intlLocale, t }) {
  const [hover, setHover] = useState(false);
  const dateLabel = lecture.eventDate ? formatDate(lecture.eventDate, intlLocale) : null;
  return (
    <div
      role="group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles.lectureCard,
        borderLeft: `4px solid ${lecture.color || 'var(--accent)'}`,
        ...(isToday ? { background: 'var(--accent-subtle)' } : {}),
      }}
    >
      <div style={styles.lectureTop}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={styles.lectureName}>{lecture.name}</span>
          {dateLabel && (
            <span style={styles.lectureDateBadge}>{dateLabel}</span>
          )}
        </div>
        <div className="lecture-actions" style={{ ...styles.lectureActions, opacity: hover ? 1 : 0.5 }}>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(lecture)} title={t('lectures.editTitle')}>
            <EditIcon />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onDelete(lecture.id)} title={t('lectures.deleteTitleBtn')} style={{ color: 'var(--danger)' }}>
            <TrashIcon />
          </button>
        </div>
      </div>
      <div style={styles.lectureMeta}>
        {lecture.allDay ? (
          <span style={{
            color: lecture.color || 'var(--accent)',
            fontWeight: 600,
            fontSize: 12,
          }}
          >
            {t('lectures.allDay')}
          </span>
        ) : (lecture.time || lecture.end_time) ? (
          <span style={{
            color: lecture.color || 'var(--accent)',
            fontWeight: 600,
            fontSize: 12,
          }}
          >
            {lecture.time}{lecture.end_time ? `–${lecture.end_time}` : ''}
          </span>
        ) : null}
        {lecture.room && <span>📍 {lecture.room}</span>}
        {lecture.lecturer && <span>👤 {lecture.lecturer}</span>}
      </div>
    </div>
  );
}

