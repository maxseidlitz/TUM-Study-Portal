import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../context/LocaleContext';
import { useOllamaSetup } from '../hooks/useOllamaSetup';
import { api } from '../api';

export default function OllamaSetup({ suppressOverlay = false }) {
  const { t } = useLocale();
  const state = useOllamaSetup();
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    api.settings.get().then((s) => {
      if (s?.ollamaSetupDismissed) setDismissed(true);
    }).catch(() => {});
  }, []);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    try {
      await api.settings.save({ ollamaSetupDismissed: true });
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await api.ollama.retrySetup();
    } catch {
      // The setup state remains on the existing error and can be retried.
    } finally {
      setRetrying(false);
    }
  }, []);

  if (!state || suppressOverlay) return null;
  const { phase, percent = 0, message, model } = state;

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
            ? t('ollama.setupFailed')
            : isDownloading
              ? t('ollama.setupDownloading')
              : t('ollama.setupStarting')}
        </h2>

        <p style={styles.subtitle}>
          {isError
            ? message || t('ollama.setupErrorMsg')
            : isDownloading
              ? t('ollama.setupDownloadHint').replace('{model}', model || '')
              : t('ollama.setupStartingHint')}
        </p>

        {isDownloading && (
          <>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${percent}%` }} />
            </div>
            <div style={styles.progressMeta}>
              <span>{message || t('common.loadingShort')}</span>
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
              {retrying ? t('ollama.setupRetrying') : t('ollama.setupRetry')}
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleDismiss}>
            {isError ? t('ollama.setupDismissError') : t('ollama.setupDismissDownload')}
          </button>
        </div>

        <p style={styles.hint}>{t('ollama.setupHint')}</p>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(8, 10, 16, 0.82)',
    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000, padding: 24,
  },
  card: {
    width: '100%', maxWidth: 460, background: 'var(--bg-card)',
    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xl)',
    padding: 32, textAlign: 'center', boxShadow: 'var(--shadow-lg)',
  },
  icon: { fontSize: 44, marginBottom: 12 },
  title: {
    fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 700,
    color: 'var(--text-primary)', marginBottom: 8,
  },
  subtitle: {
    fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20,
  },
  progressTrack: { height: 8, background: 'var(--bg-tertiary)', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 300ms ease' },
  indeterminate: { width: '40%', animation: 'indeterminateSlide 1.4s ease-in-out infinite' },
  progressMeta: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 8,
  },
  actions: { display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 },
  hint: { fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 18 },
};
