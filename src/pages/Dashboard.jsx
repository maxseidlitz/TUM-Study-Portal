import React from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import {
  getDaysUntil, getCountdownClass, formatDate,
  getTodayDayCode,
  addDays,
  getMondayOfWeek,
  lectureMatchesCalendarDay,
  formatISODateLocal,
  resolveTodoCourseLabel,
} from '../utils/helpers';
import AiRecommendation from './AiRecommendation';

export default function Dashboard() {
  const { t, intlLocale } = useLocale();
  const { exams, lectures, todos, modules, moodleCourses, loading } = useData();
  if (loading) return <div className="loading">{t('common.loading')}</div>;

  const today = getTodayDayCode();
  const h = new Date().getHours();
  const greeting = h < 12 ? t('dashboard.greetingMorning') : h < 18 ? t('dashboard.greetingDay') : t('dashboard.greetingEvening');
  const now = new Date();
  const dateStr = now.toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' });

  const upcomingExams = exams
    .map(e => ({ ...e, days: getDaysUntil(e.date) }))
    .filter(e => e.days !== null && e.days >= 0)
    .slice(0, 4);

  const openTodos = todos.filter(t => !t.done).slice(0, 5);
  const weekMonday = getMondayOfWeek();
  const todayLectures = lectures.filter(l => lectureMatchesCalendarDay(l, new Date()));

  const nextExamDays = upcomingExams.length > 0 ? upcomingExams[0].days : null;

  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const lecturesByDay = weekDays.map((d, idx) => {
    const date = addDays(weekMonday, idx);
    return {
      day: d,
      hasLecture: lectures.some(l => lectureMatchesCalendarDay(l, date)),
      hasExam: exams.some((e) => {
        const days = getDaysUntil(e.date);
        if (days === null || days < 0 || days > 7) return false;
        const examIso = (e.date || '').slice(0, 10);
        return examIso === formatISODateLocal(date);
      }),
    };
  });

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>{greeting} 👋</h1>
          <p style={styles.date}>{dateStr}</p>
        </div>
        <div style={styles.tumBadge}>{t('dashboard.tumBadge')}</div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 32 }}>
        <StatCard
          label={t('dashboard.statExams')}
          value={exams.length}
          sub={t('dashboard.subTotal')}
          color="var(--accent)"
          icon="📋"
        />
        <StatCard
          label={t('dashboard.statNextExam')}
          value={nextExamDays !== null ? t('dashboard.examDays', { days: nextExamDays }) : t('common.dash')}
          sub={nextExamDays !== null ? upcomingExams[0]?.name : t('dashboard.subNoExam')}
          color={nextExamDays !== null ? `var(--${getCountdownClass(nextExamDays) || 'success'})` : 'var(--text-muted)'}
          icon="⏱️"
        />
        <StatCard
          label={t('dashboard.statOpenTodos')}
          value={todos.filter(t => !t.done).length}
          sub={t('dashboard.subOpen')}
          color="var(--warning)"
          icon="✓"
        />
        <StatCard
          label={t('dashboard.statToday')}
          value={todayLectures.length}
          sub={t('dashboard.subLectures')}
          color="var(--info)"
          icon="📚"
        />
      </div>

      {/* Main grid */}
      <div style={styles.mainGrid}>
        {/* Left column */}
        <div style={styles.leftCol}>
          {/* Upcoming exams */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>{t('dashboard.nextExams')}</span>
              <span style={styles.cardCount}>{upcomingExams.length}</span>
            </div>
            {upcomingExams.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <p>{t('dashboard.noUpcomingExams')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {upcomingExams.map(exam => (
                  <ExamRow key={exam.id} exam={exam} intlLocale={intlLocale} t={t} />
                ))}
              </div>
            )}
          </div>

          {/* Open To-Dos */}
          <div className="card">
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>{t('dashboard.openTasks')}</span>
              <span style={styles.cardCount}>{openTodos.length}</span>
            </div>
            {openTodos.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <p>{t('dashboard.allTasksDone')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {openTodos.map(todo => (
                  <TodoRow key={todo.id} todo={todo} modules={modules} moodleCourses={moodleCourses} intlLocale={intlLocale} t={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={styles.rightCol}>
          {/* AI tip */}
          <div style={{ marginBottom: 20 }}>
            <AiRecommendation />
          </div>

          {/* Week overview */}
          <div className="card">
            <div style={styles.cardTitle}>{t('dashboard.weekOverview')}</div>
            <div style={styles.weekGrid}>
              {lecturesByDay.map(({ day, hasLecture, hasExam }) => (
                <div
                  key={day}
                  style={{
                    ...styles.dayCell,
                    background: day === today ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                    borderColor: day === today ? 'var(--accent)' : 'transparent',
                  }}
                >
                  <span style={{
                    fontSize: 11,
                    fontWeight: day === today ? 700 : 500,
                    color: day === today ? 'var(--accent-hover)' : 'var(--text-secondary)',
                  }}>{day}</span>
                  <div style={styles.dayDots}>
                    {hasLecture && <div style={{ ...styles.dot, background: 'var(--info)' }} title={t('dashboard.legendLecture')} />}
                    {hasExam && <div style={{ ...styles.dot, background: 'var(--danger)' }} title={t('dashboard.legendExam')} />}
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.legend}>
              <LegendItem color="var(--info)" label={t('dashboard.legendLecture')} />
              <LegendItem color="var(--danger)" label={t('dashboard.legendExam')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="card" style={styles.statCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...styles.statValue, color }}>{value}</div>
          <div style={styles.statLabel}>{label}</div>
        </div>
        <span style={{ fontSize: 22, opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={styles.statSub}>{sub}</div>
    </div>
  );
}

function ExamRow({ exam, intlLocale, t }) {
  const cls = getCountdownClass(exam.days);
  const colorMap = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)' };
  const color = colorMap[cls] || 'var(--text-muted)';

  return (
    <div style={styles.examRow}>
      <div style={{ ...styles.examCountdown, color }}>
        {exam.days === 0 ? t('dashboard.examToday') : t('dashboard.examDays', { days: exam.days })}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.examName}>{exam.name}</div>
        <div style={styles.examDate}>{formatDate(exam.date, intlLocale)}{exam.time ? ` · ${exam.time}` : ''}{exam.room ? ` · ${exam.room}` : ''}</div>
      </div>
      {exam.credits && (
        <div className="badge badge-muted">{exam.credits} ECTS</div>
      )}
    </div>
  );
}

function TodoRow({ todo, modules, moodleCourses, intlLocale, t }) {
  const priorityColors = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };
  const p = todo.priority || 'medium';
  const courseLabel = resolveTodoCourseLabel(todo, modules, moodleCourses);
  return (
    <div style={styles.todoRow}>
      <div style={{ ...styles.priorityBar, background: priorityColors[p] || 'var(--text-muted)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.todoTitle}>{todo.title}</div>
        {(courseLabel || todo.due) && (
          <div style={styles.todoMeta}>
            {courseLabel && <span>{courseLabel}</span>}
            {todo.due && (
              <span>
                {courseLabel ? ` · ${t('dashboard.dueDate', { date: formatDate(todo.due, intlLocale) })}` : t('dashboard.dueDate', { date: formatDate(todo.due, intlLocale) })}
              </span>
            )}
          </div>
        )}
      </div>
      <span className={`badge badge-${p}`}>{t(`priority.${p}`)}</span>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}

const styles = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  greeting: { fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', fontWeight: 700, lineHeight: 1.2 },
  date: { color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 4 },
  tumBadge: {
    padding: '6px 14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 },
  leftCol: {},
  rightCol: {},
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  cardCount: { fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 999 },
  statCard: { display: 'flex', flexDirection: 'column', gap: 8 },
  statValue: { fontSize: 'var(--text-2xl)', fontWeight: 700, lineHeight: 1 },
  statLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 },
  statSub: { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  examRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' },
  examCountdown: { fontWeight: 700, fontSize: 15, minWidth: 36, textAlign: 'right' },
  examName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  examDate: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  todoRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' },
  priorityBar: { width: 3, height: 32, borderRadius: 999, flexShrink: 0 },
  todoTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  todoMeta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  weekGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 12, marginBottom: 12 },
  dayCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 8, border: '1px solid transparent' },
  dayDots: { display: 'flex', gap: 2, minHeight: 8 },
  dot: { width: 6, height: 6, borderRadius: '50%' },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap' },
};
