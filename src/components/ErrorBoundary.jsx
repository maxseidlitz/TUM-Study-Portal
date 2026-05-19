import React from 'react';

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

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>Etwas ist schiefgelaufen</h1>
          <p style={styles.text}>
            Die App ist auf einen unerwarteten Fehler gestoßen. Deine Daten sind
            lokal gespeichert und nicht betroffen.
          </p>
          <pre style={styles.detail}>{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn btn-primary" onClick={this.handleReload}>
            App neu laden
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
