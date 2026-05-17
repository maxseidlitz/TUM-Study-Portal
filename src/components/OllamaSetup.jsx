import React, { useState, useEffect, useCallback } from 'react';

/**
 * First-run overlay for the bundled Ollama setup.
 * Shows progress while the KI model (gemma4:e2b, ~7.2 GB) is downloaded.
 * The app stays usable underneath — the overlay can be dismissed and the
 * download continues in the background.
 */
export default function OllamaSetup() {
  const [state, setState] = useState(null); // { phase, percent, message, model }
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!window.api?.ollama) return undefined;

    window.api.ollama.getSetupState().then(setState).catch(() => {});
    const unsubscribe = window.api.ollama.onSetupProgress(setState);
    return unsubscribe;
  }, []);

  const handleRetry = useCallback(async () => {
    if (!window.api?.ollama) return;
    setRetrying(true);
    try {
      const next = await window.api.ollama.retrySetup();
      setState(next);
    } finally {
      setRetrying(false);
    }
  }, []);

  if (!state) return null;
  const { phase, percent = 0, message, model } = state;

  // Overlay only matters while starting / downloading / on error
  const shouldShow = ['starting', 'downloading', 'error'].includes(phase);
  if (!shouldShow || dismissed) return null;

  const isError = phase === 'error';
  const isDownloading = phase === 'downloading';

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.icon}>{isError ? '⚠️' : '🤖'}</div>

        <h2 style={styles.title}>
          {isError
            ? 'KI-Einrichtung fehlgeschlagen'
            : isDownloading
              ? 'KI-Modell wird geladen'
              : 'KI-Dienst wird gestartet…'}
        </h2>

        <p style={styles.subtitle}>
          {isError
            ? message || 'Beim Einrichten des KI-Modells ist ein Fehler aufgetreten.'
            : isDownloading
              ? `Einmaliger Download von "${model}" (ca. 7,2 GB). Das kann je nach Internetverbindung einige Minuten dauern.`
              : 'Der lokale KI-Dienst (Ollama) wird vorbereitet…'}
        </p>

        {isDownloading && (
          <>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${percent}%` }} />
            </div>
            <div style={styles.progressMeta}>
              <span>{message || 'Lade…'}</span>
              <span>{percent}%</span>
            </div>
          </>
        )}

        {phase === 'starting' && (
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, ...styles.indeterminate }} />
          </div>
        )}

        <div style={styles.actions}>
          {isError && (
            <button className="btn btn-primary" onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Wird wiederholt…' : 'Erneut versuchen'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setDismissed(true)}>
            {isError ? 'Ohne KI fortfahren' : 'Im Hintergrund laden'}
          </button>
        </div>

        <p style={styles.hint}>
          Die App ist auch ohne KI-Modell voll nutzbar – Empfehlungen nutzen dann
          eine lokale Logik. Der Download lässt sich später in den Einstellungen
          erneut anstoßen.
        </p>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(8, 10, 16, 0.82)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-xl)',
    padding: 32,
    textAlign: 'center',
    boxShadow: 'var(--shadow-lg)',
  },
  icon: { fontSize: 44, marginBottom: 12 },
  title: {
    fontFamily: 'var(--font-serif)',
    fontSize: 'var(--text-xl)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: 20,
  },
  progressTrack: {
    height: 8,
    background: 'var(--bg-tertiary)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 999,
    transition: 'width 300ms ease',
  },
  indeterminate: {
    width: '40%',
    animation: 'indeterminateSlide 1.4s ease-in-out infinite',
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: 8,
  },
  actions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    marginTop: 20,
  },
  hint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    marginTop: 18,
  },
};
