import React from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { getDaysUntil } from '../utils/helpers';
import { NAVIGATION_GROUPS } from '../navigation';

export default function Sidebar({ activePage, onNavigate }) {
  const { t } = useLocale();
  const { exams, todos } = useData();
  const openTodos = todos.filter(t => !t.done).length;
  const nextExamDays = exams.length > 0
    ? Math.min(...exams.map(e => getDaysUntil(e.date)).filter(d => d !== null && d >= 0))
    : null;

  return (
    <aside className="desktop-sidebar" style={styles.sidebar}>
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
        {NAVIGATION_GROUPS.map(group => (
          <div key={group.labelKey} style={styles.navGroup}>
            <div style={styles.navSection}>{t(group.labelKey)}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    ...styles.navItem,
                    ...(active ? styles.navItemActive : {}),
                  }}
                >
                  <Icon size={18} color={active ? 'var(--accent-hover)' : 'var(--text-muted)'} />
                  <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {t(item.labelKey)}
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
