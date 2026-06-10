import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { getDaysUntil } from '../utils/helpers';

export default function Sidebar({ activePage, onNavigate }) {
  const { t } = useLocale();
  const NAV = useMemo(() => [
    {
      section: t('sidebar.sectionOverview'),
      items: [
        { id: 'dashboard', label: t('sidebar.navDashboard'), icon: IconGrid },
        { id: 'today', label: t('sidebar.navToday'), icon: IconCalendarDay },
        { id: 'chat', label: t('sidebar.navChat'), icon: IconChat },
      ],
    },
    {
      section: t('sidebar.sectionStudies'),
      items: [
        { id: 'exams', label: t('sidebar.navExams'), icon: IconClipboard },
        { id: 'lectures', label: t('sidebar.navLectures'), icon: IconBook },
        { id: 'todos', label: t('sidebar.navTodos'), icon: IconChecklist },
      ],
    },
    {
      section: t('sidebar.sectionResources'),
      items: [
        { id: 'modules', label: t('sidebar.navModules'), icon: IconSchool },
        { id: 'links', label: t('sidebar.navLinks'), icon: IconLink },
      ],
    },
    {
      section: t('sidebar.sectionSystem'),
      items: [
        { id: 'settings', label: t('sidebar.navSettings'), icon: IconSettings },
      ],
    },
  ], [t]);

  const { exams, todos } = useData();
  const openTodos = todos.filter(t => !t.done).length;
  const nextExamDays = exams.length > 0
    ? Math.min(...exams.map(e => getDaysUntil(e.date)).filter(d => d !== null && d >= 0))
    : null;

  return (
    <aside style={styles.sidebar}>
      {/* macOS traffic light spacing – also acts as drag region for window */}
      <div style={styles.trafficLightSpacer} />

      {/* Logo */}
      <div style={styles.logo}>
        <div style={styles.logoMark}>
          <span style={styles.logoT}>TUM</span>
        </div>
        <div>
          <div style={styles.logoTitle}>Study Portal</div>
          <div style={styles.logoSub}>TU München</div>
        </div>
      </div>

      {/* Status pills */}
      <div style={styles.statusRow}>
        {nextExamDays !== null && (
          <div style={{ ...styles.pill, background: nextExamDays <= 7 ? 'var(--danger-subtle)' : nextExamDays <= 21 ? 'var(--warning-subtle)' : 'var(--success-subtle)', color: nextExamDays <= 7 ? 'var(--danger)' : nextExamDays <= 21 ? 'var(--warning)' : 'var(--success)' }}>
            {t('sidebar.daysToExam', { days: nextExamDays })}
          </div>
        )}
        {openTodos > 0 && (
          <div style={{ ...styles.pill, background: 'var(--accent-subtle)', color: 'var(--accent-hover)' }}>
            {openTodos === 1
              ? t('sidebar.openTodosOne')
              : t('sidebar.openTodosMany', { count: openTodos })}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={styles.nav}>
        {NAV.map(group => (
          <div key={group.section} style={styles.navGroup}>
            <div style={styles.navSection}>{group.section}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  data-tour-id={`nav-${item.id}`}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    ...styles.navItem,
                    ...(active ? styles.navItemActive : {}),
                  }}
                >
                  <Icon size={18} color={active ? 'var(--accent-hover)' : 'var(--text-muted)'} />
                  <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {item.label}
                  </span>
                  {active && <div style={styles.activeIndicator} />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100vh',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  },
  trafficLightSpacer: { height: 46, WebkitAppRegion: 'drag', flexShrink: 0 },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 20px 20px',
  },
  logoMark: {
    width: 36,
    height: 36,
    background: 'var(--accent)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoT: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.05em',
  },
  logoTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 },
  logoSub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  statusRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '0 16px 16px',
  },
  pill: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
  },
  nav: { flex: 1, overflowY: 'auto', padding: '0 10px' },
  navGroup: { marginBottom: 20 },
  navSection: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-muted)',
    padding: '0 10px',
    marginBottom: 4,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'background var(--transition)',
    position: 'relative',
    textAlign: 'left',
  },
  navItemActive: { background: 'var(--bg-hover)' },
  activeIndicator: {
    position: 'absolute',
    right: 10,
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent)',
  },
};

// Inline SVG icons
function IconGrid({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconCalendarDay({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  );
}
function IconClipboard({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}
function IconBook({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function IconChecklist({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" /><polyline points="3 12 4 13 6 11" /><polyline points="3 18 4 19 6 17" />
    </svg>
  );
}
function IconSchool({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  );
}
function IconLink({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function IconChat({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function IconSettings({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
