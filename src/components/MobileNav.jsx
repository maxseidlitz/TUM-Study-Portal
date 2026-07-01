import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';

// iOS-artige Bottom-Tab-Bar für den WebApp-/Handy-Build.
// 5 Primär-Tabs; restliche Seiten über ein "Mehr"-Sheet erreichbar.
export default function MobileNav({ activePage, onNavigate }) {
  const { t } = useLocale();
  const { todos } = useData();
  const [moreOpen, setMoreOpen] = useState(false);

  const openTodos = todos.filter((td) => !td.done).length;

  const primary = useMemo(() => [
    { id: 'dashboard', label: t('sidebar.navDashboard'), icon: IconGrid },
    { id: 'today', label: t('sidebar.navToday'), icon: IconCalendarDay },
    { id: 'todos', label: t('sidebar.navTodos'), icon: IconChecklist, badge: openTodos },
    { id: 'chat', label: t('sidebar.navChat'), icon: IconChat },
  ], [t, openTodos]);

  const secondary = useMemo(() => [
    { id: 'exams', label: t('sidebar.navExams'), icon: IconClipboard },
    { id: 'lectures', label: t('sidebar.navLectures'), icon: IconBook },
    { id: 'modules', label: t('sidebar.navModules'), icon: IconSchool },
    { id: 'links', label: t('sidebar.navLinks'), icon: IconLink },
    { id: 'settings', label: t('sidebar.navSettings'), icon: IconSettings },
  ], [t]);

  const moreActive = secondary.some((s) => s.id === activePage);

  const go = (id) => {
    onNavigate(id);
    setMoreOpen(false);
  };

  return (
    <>
      {moreOpen && (
        <div className="mnav-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="mnav-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mnav-sheet-grabber" />
            <div className="mnav-sheet-grid">
              {secondary.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    className={`mnav-sheet-item${active ? ' active' : ''}`}
                    onClick={() => go(item.id)}
                  >
                    <Icon size={22} color={active ? 'var(--accent-hover)' : 'var(--text-secondary)'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              className={`mnav-tab${active ? ' active' : ''}`}
              onClick={() => go(item.id)}
            >
              <span className="mnav-icon-wrap">
                <Icon size={24} color={active ? 'var(--accent-hover)' : 'var(--text-muted)'} />
                {item.badge > 0 && <span className="mnav-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
              </span>
              <span className="mnav-label">{item.label}</span>
            </button>
          );
        })}
        <button
          className={`mnav-tab${moreActive || moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <span className="mnav-icon-wrap">
            <IconMore size={24} color={moreActive || moreOpen ? 'var(--accent-hover)' : 'var(--text-muted)'} />
          </span>
          <span className="mnav-label">{t('sidebar.navMore')}</span>
        </button>
      </nav>
    </>
  );
}

// ---- Icons ----
function IconGrid({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconCalendarDay({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  );
}
function IconClipboard({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}
function IconBook({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function IconChecklist({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" /><polyline points="3 12 4 13 6 11" /><polyline points="3 18 4 19 6 17" />
    </svg>
  );
}
function IconSchool({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  );
}
function IconLink({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function IconChat({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function IconSettings({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconMore({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.4" fill={color} stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill={color} stroke="none" />
    </svg>
  );
}
