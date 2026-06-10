import React from 'react';
import { getDaysUntil, getCountdownClass, formatDate, getStudyProgress } from '../../utils/helpers';
import { EditIcon, TrashIcon, LogIcon, GradeIcon } from '../icons/Icons';

const styles = {
  examCard: { display: 'flex', flexDirection: 'column', gap: 0, transition: 'opacity var(--transition)' },
  examCardHeader: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  examName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 },
  daysCount: { fontSize: 20, fontWeight: 700 },
  gradeBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: '1px solid' },
  examMeta: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  metaItem: { fontSize: 12, color: 'var(--text-secondary)' },
  examNotes: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 8, fontStyle: 'italic' },
  progressLabel: { fontSize: 11, color: 'var(--text-muted)' },
  examActions: { display: 'flex', gap: 6, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', alignItems: 'center' },
};

function MetaItem({ icon, text }) {
  return <span style={styles.metaItem}>{icon} {text}</span>;
}

export default function ExamCard({
  exam, onEdit, onDelete, onOpenLog, onOpenGrade, onRemoveGrade, past, intlLocale, t,
}) {
  const days = getDaysUntil(exam.date);
  const cls = getCountdownClass(days);
  const colorMap = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)' };
  const countdownColor = past ? 'var(--text-muted)' : (colorMap[cls] || 'var(--text-muted)');
  const progress = getStudyProgress(exam.date);

  const gradeColor = exam.grade != null
    ? exam.grade <= 1.5 ? 'var(--success)' : exam.grade <= 3.0 ? 'var(--warning)' : 'var(--danger)'
    : null;

  return (
    <div className="card" style={{ ...styles.examCard, opacity: past && !exam.grade ? 0.65 : 1 }}>
      <div style={styles.examCardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={styles.examName}>{exam.name}</h3>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {exam.credits && <span className="badge badge-accent">{exam.credits} ECTS</span>}
            {exam.grade != null && (
              <span style={{ ...styles.gradeBadge, color: gradeColor, borderColor: gradeColor }}>
                {t('exams.gradeLabel')} {exam.grade.toFixed(1)} {exam.passed ? t('exams.passed') : t('exams.failed')}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...styles.daysCount, color: countdownColor }}>
            {past ? (exam.grade != null ? '' : t('exams.pastLabel')) : days === 0 ? t('exams.todayExclaim') : t('exams.daysShort', { days })}
          </div>
        </div>
      </div>

      <div style={styles.examMeta}>
        <MetaItem icon="📅" text={formatDate(exam.date, intlLocale)} />
        {exam.time && <MetaItem icon="🕐" text={`${exam.time}${t('common.timeSuffix')}`} />}
        {exam.room && <MetaItem icon="📍" text={exam.room} />}
      </div>

      {exam.notes && <p style={styles.examNotes}>{exam.notes}</p>}

      {!past && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={styles.progressLabel}>{t('exams.progressLabel')}</span>
            <span style={{ ...styles.progressLabel, color: countdownColor }}>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%`, background: countdownColor }} />
          </div>
        </div>
      )}

      <div style={styles.examActions}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenLog} title={t('exams.studyLogTitle')}>
          <LogIcon /> {t('exams.studyLog')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={past && exam.grade != null ? onRemoveGrade : onOpenGrade}
          title={exam.grade != null ? t('exams.gradeTitleChange') : t('exams.gradeTitleSet')}
          style={exam.grade != null ? { color: gradeColor } : {}}
        >
          <GradeIcon /> {exam.grade != null ? `${exam.grade.toFixed(1)}` : t('exams.grade')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(exam)}><EditIcon /> {t('exams.editShort')}</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(exam.id)}><TrashIcon /></button>
      </div>
    </div>
  );
}
