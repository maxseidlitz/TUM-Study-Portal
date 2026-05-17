import React, { useState } from 'react';
import { LocaleProvider } from './context/LocaleContext';
import { DataProvider } from './context/DataContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Today from './components/Today';
import Exams from './components/Exams';
import Lectures from './components/Lectures';
import Todos from './components/Todos';
import Modules from './components/Modules';
import Links from './components/Links';
import Settings from './components/Settings';
import Chat from './components/Chat';
import OllamaSetup from './components/OllamaSetup';

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

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [theme, setTheme] = useState('dark');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  };

  const PageComponent = PAGES[activePage] || Dashboard;

  return (
    <LocaleProvider>
      <DataProvider>
        <div className="app">
          <Sidebar activePage={activePage} onNavigate={setActivePage} />
          <main className="main-content">
            <PageComponent theme={theme} onToggleTheme={toggleTheme} />
          </main>
        </div>
        <OllamaSetup />
      </DataProvider>
    </LocaleProvider>
  );
}
