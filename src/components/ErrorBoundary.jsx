import React from 'react';
import de from '../locales/de.json';
import en from '../locales/en.json';
import tr from '../locales/tr.json';

const ERROR_MESSAGES = {
  de: de.errorBoundary,
  en: en.errorBoundary,
  tr: tr.errorBoundary,
};

export function errorMessagesForLocale(locale) {
  return ERROR_MESSAGES[locale] || ERROR_MESSAGES.de;
}

export function resolveErrorLocale({
  documentObject = typeof document === 'undefined' ? null : document,
  navigatorObject = typeof navigator === 'undefined' ? null : navigator,
} = {}) {
  const candidates = [
    documentObject?.documentElement?.dataset?.uiLocale,
    ...(navigatorObject?.languages || []),
    navigatorObject?.language,
  ];
  for (const candidate of candidates) {
    const locale = String(candidate || '').toLowerCase().split('-')[0];
    if (locale in ERROR_MESSAGES) return locale;
  }
  return 'de';
}

/**
 * Fängt Render-Fehler in der Komponenten-Hierarchie ab, damit ein einzelner
 * Crash nicht die ganze App weiß werden lässt. Zeigt einen Fallback mit der
 * Möglichkeit, die App neu zu laden.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In Produktion landet das in der DevTools-Konsole / im Main-Log.
    console.error('Unerwarteter App-Fehler:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const locale = resolveErrorLocale();
    const messages = errorMessagesForLocale(locale);

    return (
      <div style={styles.wrap} lang={locale}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>{messages.title}</h1>
          <p style={styles.text}>{messages.body}</p>
          <pre style={styles.detail}>{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn btn-primary" onClick={this.handleReload}>
            {messages.reload}
          </button>
        </div>
      </div>
    );
  }
}

const styles = {
  wrap: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary, #0f1117)',
    padding: 24,
  },
  card: {
    maxWidth: 460,
    textAlign: 'center',
    background: 'var(--bg-card, #1a1d27)',
    border: '1px solid var(--border-color, #2a2f3e)',
    borderRadius: 16,
    padding: 32,
  },
  icon: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #e8eaf0)', marginBottom: 8 },
  text: { fontSize: 14, color: 'var(--text-secondary, #9aa0b4)', lineHeight: 1.6, marginBottom: 16 },
  detail: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'var(--danger, #e5484d)',
    background: 'var(--bg-tertiary, #11141c)',
    border: '1px solid var(--border-color, #2a2f3e)',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 20,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    textAlign: 'left',
  },
};
