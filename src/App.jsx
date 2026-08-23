import React, { useCallback, useEffect, useState, Suspense } from 'react';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Today from './pages/Today';
import Todos from './pages/Todos';
import Links from './pages/Links';
import Settings from './pages/Settings';
import ChatContinuity from './components/ChatContinuity';
import SetupWizard from './components/SetupWizard';
import PomodoroWidget from './components/PomodoroWidget';
import OllamaSetup from './components/OllamaSetup';
import { MobileBottomNavigation, MobileTopBar } from './components/MobileNavigation';
import {
  DEFAULT_PAGE,
  LAST_PAGE_KEY,
  isValidPage,
  pageFromLocation,
  pageUrl,
} from './navigation';

const Chat = React.lazy(() => import('./pages/Chat'));
const Exams = React.lazy(() => import('./pages/Exams'));
const Lectures = React.lazy(() => import('./pages/Lectures'));
const Modules = React.lazy(() => import('./pages/Modules'));

const PAGES = {
  dashboard: Dashboard,
  today: Today,
  chat: Chat,
  exams: Exams,
  lectures: Lectures,
  todos: Todos,
  modules: Modules,
  links: Links,
  settings: Settings,
};

function PageFallback() {
  return <div className="loading" style={{ padding: 24 }}>…</div>;
}

export default function App() {
  const [activePage, setActivePage] = useState(() => {
    let restoredPage;
    try {
      restoredPage = window.localStorage.getItem(LAST_PAGE_KEY);
    } catch {
      restoredPage = null;
    }
    return pageFromLocation(window.location, restoredPage);
  });
  const [wizardActive, setWizardActive] = useState(false);
  const PageComponent = PAGES[activePage] || Dashboard;
  const isLazy = ['chat', 'exams', 'lectures', 'modules'].includes(activePage);

  const navigate = useCallback((page, { replace = false } = {}) => {
    if (!isValidPage(page)) return;
    setActivePage(page);
    try {
      window.localStorage.setItem(LAST_PAGE_KEY, page);
    } catch {
      // Navigation still works when storage is unavailable.
    }
    const nextUrl = pageUrl(page, window.location);
    const currentUrl = window.location.protocol === 'file:'
      ? window.location.hash
      : window.location.pathname;
    if (currentUrl !== nextUrl) {
      window.history[replace ? 'replaceState' : 'pushState']({ page }, '', nextUrl);
    }
  }, []);

  useEffect(() => {
    navigate(activePage, { replace: true });
  }, [activePage, navigate]);

  useEffect(() => {
    const handleHistoryNavigation = () => {
      const page = pageFromLocation(window.location, DEFAULT_PAGE);
      setActivePage(page);
      try {
        window.localStorage.setItem(LAST_PAGE_KEY, page);
      } catch {
        // Ignore restricted storage.
      }
    };
    window.addEventListener('popstate', handleHistoryNavigation);
    return () => window.removeEventListener('popstate', handleHistoryNavigation);
  }, []);

  return (
    <LocaleProvider>
      <ThemeProvider>
        <ToastProvider>
        <DataProvider>
          <SetupWizard
            onNavigate={navigate}
            onVisibilityChange={setWizardActive}
          />
          <PomodoroWidget />
          <div className="app">
            <Sidebar activePage={activePage} onNavigate={navigate} />
            <div className="mobile-shell">
              <MobileTopBar activePage={activePage} />
              <main className={`main-content page-${activePage}`}>
              {isLazy ? (
                <Suspense fallback={<PageFallback />}>
                  <PageComponent onNavigate={navigate} />
                </Suspense>
              ) : (
                <PageComponent onNavigate={navigate} />
              )}
              </main>
              <MobileBottomNavigation activePage={activePage} onNavigate={navigate} />
            </div>
          </div>
          <ChatContinuity activePage={activePage} />
          <OllamaSetup suppressOverlay={wizardActive} />
        </DataProvider>
        </ToastProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
