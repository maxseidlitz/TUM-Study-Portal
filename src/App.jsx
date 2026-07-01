import React, { useState, Suspense } from 'react';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Dashboard from './pages/Dashboard';
import Today from './pages/Today';
import Todos from './pages/Todos';
import Links from './pages/Links';
import Settings from './pages/Settings';
import ChatContinuity from './components/ChatContinuity';
import OnboardingTour from './components/OnboardingTour';
import PomodoroWidget from './components/PomodoroWidget';
import OllamaSetup from './components/OllamaSetup';

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

function MobileHeader() {
  return (
    <header className="mobile-header">
      <div className="mobile-header-mark">TUM</div>
      <div className="mobile-header-titles">
        <span className="mobile-header-title">Study Portal</span>
        <span className="mobile-header-sub">TU München</span>
      </div>
    </header>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const PageComponent = PAGES[activePage] || Dashboard;
  const isLazy = ['chat', 'exams', 'lectures', 'modules'].includes(activePage);

  return (
    <LocaleProvider>
      <ThemeProvider>
        <ToastProvider>
        <DataProvider>
          <OnboardingTour />
          <PomodoroWidget />
          <div className="app">
            <Sidebar activePage={activePage} onNavigate={setActivePage} />
            <main className="main-content">
              <MobileHeader />
              {isLazy ? (
                <Suspense fallback={<PageFallback />}>
                  <PageComponent />
                </Suspense>
              ) : (
                <PageComponent />
              )}
            </main>
          </div>
          <MobileNav activePage={activePage} onNavigate={setActivePage} />
          <ChatContinuity activePage={activePage} />
          <OllamaSetup />
        </DataProvider>
        </ToastProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
