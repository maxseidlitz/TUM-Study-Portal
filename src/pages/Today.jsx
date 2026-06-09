import React from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import {
  getDaysUntil, formatDate, formatDateLong,
  lectureMatchesCalendarDay,
  formatISODateLocal,
  resolveTodoCourseLabel,
} from '../utils/helpers';
import AiRecommendation from './AiRecommendation';

export default function Today() {
  const { t, intlLocale } = useLocale();
  const { exams, lectures, todos, modules, moodleCourses, toggleTodo, loading } = useData();
  if (loading) return <div className="loading">{t('common.loading')}</div>;

  const todayLectures = lectures
    .filter(l => lectureMatchesCalendarDay(l, new Date()))
    .sort((a, b) => {
      if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

  const dateStr = formatDateLong(formatISODateLocal(new Date()), intlLocale);

  const upcomingExams = exams
    .map(e => ({ ...e, days: getDaysUntil(e.date) }))
    .filter(e => e.days !== null && e.days >= 0)
    .sort((a, b) => a.days - b.days);

  const nextExam = upcomingExams[0] || null;

  const urgentTodos = todos
    .filter(t => !t.done && (t.priority === 'high' || (t.due && getDaysUntil(t.due) !== null && getDaysUntil(t.due) <= 3)))
    .sort((a, b) => (a.priority === 'high' ? -1 : 1));

  const todayTodos = todos
    .filter(t => !t.done && t.due && getDaysUntil(t.due) === 0)
    .sort((a, b) => (a.priority === 'high' ? -1 : 1));

  const allRelevantTodos = [...new Map([...urgentTodos, ...todayTodos].map(t => [t.id, t])).values()];

  return (
    <div>
      <div className="page-header">
        <h1>{t('today.title')}</h1>
        <p>{dateStr}</p>
      </div>

      {/* Next exam big countdown */}
      {nextExam && (
        <div className="card" style={{ ...styles.bigCountdown, borderColor: countdownBorder(nextExam.days) }}>
          <div style={styles.countdownLabel}>{t('today.nextExam')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '8px 0' }}>
            <span style={{ ...styles.countdownNumber, color: countdownColor(nextExam.days) }}>
              {nextExam.days === 0 ? t('today.todayWord') : nextExam.days}
            </span>
            {nextExam.days > 0 && <span style={styles.countdownUnit}>{t('today.daysUnit')}</span>}
          </div>
          <div style={styles.countdownName}>{nextExam.name}</div>
          <div style={styles.countdownMeta}>
            {formatDate(nextExam.date, intlLocale)}
            {nextExam.time ? ` · ${nextExam.time}${t('common.timeSuffix')}` : ''}
            {nextExam.room ? ` · ${nextExam.room}` : ''}
            {nextExam.credits ? ` · ${nextExam.credits} ECTS` : ''}
          </div>
          {nextExam.days > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(100, Math.max(5, 100 - (nextExam.days / 90) * 100))}%`, background: countdownColor(nextExam.days) }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{t('today.progressToday')}</span>
                <span>{formatDate(nextExam.date, intlLocale)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={styles.grid}>
        {/* Today's lectures */}
        <div>
          <div className="card">
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>{t('today.todayLectures')}</span>
              <span className="badge badge-accent">{todayLectures.length}</span>
            </div>
            {todayLectures.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>{t('today.noLectures')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {todayLectures.map(l => (
                  <LectureCard key={l.id} lecture={l} t={t} />
                ))}
              </div>
            )}
          </div>

          {/* AI tip */}
          <div style={{ marginTop: 20 }}>
            <AiRecommendation />
          </div>
        </div>

        {/* Urgent / today todos */}
        <div className="card">
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>{t('today.urgentTasks')}</span>
            <span className="badge badge-high">{allRelevantTodos.length}</span>
          </div>
          {allRelevantTodos.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p>{t('today.noUrgent')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allRelevantTodos.map(todo => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  modules={modules}
                  moodleCourses={moodleCourses}
                  onToggle={toggleTodo}
                  t={t}
                  intlLocale={intlLocale}
                />
              ))}
            </div>
          )}

          {upcomingExams.length > 1 && (
            <>
              <div className="divider" />
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>{t('today.moreExams')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingExams.slice(1, 4).map(exam => (
                  <div key={exam.id} style={styles.miniExam}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{exam.name}</span>
                    <span style={{ fontSize: 11, color: countdownColor(exam.days) }}>{exam.days}d</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LectureCard({ lecture, t }) {
  const timeLabel = lecture.allDay
    ? t('lectures.allDay')
    : `${lecture.time || ''}${lecture.end_time ? `–${lecture.end_time}` : ''}`;
  return (
    <div style={{ ...styles.lectureCard, borderLeft: `3px solid ${lecture.color || 'var(--accent)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={styles.lectureName}>{lecture.name}</span>
        <span style={styles.lectureTime}>{timeLabel}</span>
      </div>
      <div style={styles.lectureMeta}>
        {lecture.room && <span>📍 {lecture.room}</span>}
        {lecture.lecturer && <span>👤 {lecture.lecturer}</span>}
      </div>
    </div>
  );
}

function TodoCard({ todo, modules, moodleCourses, onToggle, t, intlLocale }) {
  const days = todo.due ? getDaysUntil(todo.due) : null;
  const overdue = days !== null && days < 0;
  const courseLabel = resolveTodoCourseLabel(todo, modules, moodleCourses);
  return (
    <div style={styles.todoCard}>
      <button
        onClick={() => onToggle(todo.id)}
        style={{ ...styles.checkbox, borderColor: todo.priority === 'high' ? 'var(--danger)' : 'var(--border-color)' }}
        title={t('today.checkboxTitle')}
      >
        {todo.done && '✓'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.todoTitle}>{todo.title}</div>
        <div style={styles.todoMeta}>
          {courseLabel && <span>{courseLabel}</span>}
          {days !== null && (
            <span style={{ color: overdue ? 'var(--danger)' : days === 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
              {overdue ? t('today.overdue', { days: Math.abs(days) }) : days === 0 ? t('today.dueToday') : t('today.dueIn', { days })}
            </span>
          )}
        </div>
      </div>
      <span className={`badge badge-${todo.priority || 'medium'}`}>{t(`priority.${todo.priority || 'medium'}`)}</span>
    </div>
  );
}

function countdownColor(days) {
  if (days <= 7) return 'var(--danger)';
  if (days <= 21) return 'var(--warning)';
  return 'var(--success)';
}
function countdownBorder(days) {
  if (days <= 7) return 'var(--danger)';
  if (days <= 21) return 'var(--warning)';
  return 'var(--border-color)';
}

const styles = {
  bigCountdown: {
    marginBottom: 24,
    background: 'var(--bg-card)',
  },
  countdownLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' },
  countdownNumber: { fontSize: 72, fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-serif)' },
  countdownUnit: { fontSize: 24, color: 'var(--text-secondary)', fontWeight: 300 },
  countdownName: { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' },
  countdownMeta: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  lectureCard: {
    background: 'var(--bg-tertiary)',
    borderRadius: 8,
    padding: '10px 12px',
    borderLeft: '3px solid var(--accent)',
  },
  lectureName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
  lectureTime: { fontSize: 12, color: 'var(--accent-hover)', fontWeight: 600 },
  lectureMeta: { display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' },
  todoCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    border: '2px solid var(--border-color)',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: 'var(--success)',
    flexShrink: 0,
  },
  todoTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  todoMeta: { display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--text-muted)' },
  miniExam: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' },
};
