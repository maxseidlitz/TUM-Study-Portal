import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  THEME_STORAGE_KEY, ThemeProvider, useTheme,
} from './ThemeContext';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  let host;
  let root;
  let listeners;
  let systemDark;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.querySelectorAll('meta[name="theme-color"]').forEach(node => node.remove());
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#0f1117');
    document.head.appendChild(meta);
    listeners = new Set();
    systemDark = false;
    window.matchMedia = vi.fn(() => ({
      get matches() { return systemDark; },
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    global.IS_REACT_ACT_ENVIRONMENT = false;
  });

  function render() {
    act(() => root.render(<ThemeProvider><Probe /></ThemeProvider>));
    return host.querySelector('button');
  }

  test('uses and follows the system theme without an explicit preference', () => {
    systemDark = true;
    const button = render();
    expect(button.textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0f1117');

    systemDark = false;
    act(() => listeners.forEach(listener => listener({ matches: false })));
    expect(button.textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f4f6fb');

    act(() => button.click());
    act(() => listeners.forEach(listener => listener({ matches: false })));
    expect(button.textContent).toBe('dark');
  });

  test('restores and persists an explicit theme without empty attributes', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const button = render();
    expect(button.textContent).toBe('light');
    expect(listeners.size).toBe(0);

    act(() => button.click());
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => listeners.forEach(listener => listener({ matches: false })));
    expect(button.textContent).toBe('dark');
  });
});
