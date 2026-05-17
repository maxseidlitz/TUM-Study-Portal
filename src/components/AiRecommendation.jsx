import React, { useState, useCallback, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { getAiRecommendation, lectureMatchesCalendarDay } from '../utils/helpers';

/**
 * Study recommendation card.
 *
 * By default it shows an instant, local rule-based recommendation — it does NOT
 * call Ollama on mount. The LLM is only invoked when the user explicitly clicks
 * "Mit KI verfeinern". This keeps app startup fast and avoids loading a large
 * model into RAM unexpectedly.
 */
export default function AiRecommendation() {
  const { t, intlLocale } = useLocale();
  const { exams, todos, lectures, modules } = useData();
  const [status, setStatus] = useState('local'); // local | loading | ok | error
  const [kiText, setKiText] = useState('');

  const todayLectures = useMemo(
    () => lectures.filter(l => lectureMatchesCalendarDay(l, new Date())),
    [lectures],
  );

  // Instant, no-LLM recommendation — always available.
  const localText = useMemo(
    () => getAiRecommendation({ exams, todos, lectures }, t),
    [exams, todos, lectures, t],
  );

  const kiAvailable = !!window.api?.ai?.recommend;

  const runKi = useCallback(async () => {
    if (!kiAvailable) return;
    setStatus('loading');
    try {
      const result = await window.api.ai.recommend({
        exams,
        todos,
        lectures: todayLectures,
        modules,
        today: new Date().toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' }),
      });
      if (result.success && result.content) {
        setKiText(result.content);
        setStatus('ok');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [kiAvailable, exams, todos, todayLectures, modules, intlLocale]);

  const isKi = status === 'ok';
  const displayText = isKi ? kiText : localText;

  return (
    <div style={{
      ...styles.container,
      background: isKi ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
      borderColor: isKi ? 'var(--accent-light)' : 'var(--border-color)',
    }}>
      <div style={styles.header}>
        <div style={styles.labelRow}>
          <span style={styles.label}>
            {isKi ? t('ai.labelKi') : t('ai.labelLocal')}
          </span>
          {status === 'error' && (
            <span style={styles.fallbackBadge} title={t('ai.badgeLocalTitle')}>
              {t('ai.badgeLocal')}
            </span>
          )}
        </div>
        {isKi && (
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={runKi}
            disabled={status === 'loading'}
            title={t('ai.refreshTitle')}
            style={{ opacity: 0.7 }}
          >
            <RefreshIcon spin={status === 'loading'} />
          </button>
        )}
      </div>

      {status === 'loading' ? (
        <div style={styles.loadingRow}>
          <div style={styles.shimmer} />
          <div style={{ ...styles.shimmer, width: '70%' }} />
        </div>
      ) : (
        <p style={styles.text}>{displayText}</p>
      )}

      {/* Opt-in: the LLM only runs on explicit click */}
      {kiAvailable && status !== 'loading' && !isKi && (
        <button style={styles.kiButton} onClick={runKi}>
          ✨ Mit KI verfeinern
        </button>
      )}
      {status === 'error' && (
        <div style={styles.errorHint}>
          KI nicht verfügbar – lokale Empfehlung wird angezeigt. Modell in den
          Einstellungen prüfen.
        </div>
      )}
    </div>
  );
}

function RefreshIcon({ spin }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round"
      style={{ animation: spin ? 'spin 1s linear infinite' : 'none' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

const styles = {
  container: {
    border: '1px solid',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-5)',
    transition: 'background var(--transition), border-color var(--transition)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  labelRow: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' },
  fallbackBadge: {
    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
    background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)',
    cursor: 'help',
  },
  text: { fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65 },
  loadingRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  shimmer: {
    height: 12, width: '100%', borderRadius: 6,
    background: 'var(--bg-hover)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  kiButton: {
    marginTop: 12,
    width: '100%',
    padding: '7px 12px',
    background: 'transparent',
    border: '1px dashed var(--accent-light)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--accent-hover)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background var(--transition)',
  },
  errorHint: {
    marginTop: 10,
    fontSize: 11,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
};
