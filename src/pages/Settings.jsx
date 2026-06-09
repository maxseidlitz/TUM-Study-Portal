import React, { useState, useEffect } from 'react';
import { useLocale } from '../context/LocaleContext';
import AiSettings from './AiSettings';

export default function Settings({ theme = 'dark', onToggleTheme = () => {} }) {
  const { t, locale, setLocale } = useLocale();
  const defaultState = () => ({
    aiProvider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: '',
    ollamaDisableReasoning: false,
    geminiApiKey: '',
    geminiModel: '',
  });

  const [settings, setSettings] = useState(defaultState());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.settings.get().then((s) => {
      setSettings({ ...defaultState(), ...s });
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading">{t('settings.loading')}</div>;

  return (
    <div>
      <div className="page-header">
        <h1>{t('settings.pageTitle')}</h1>
        <p>{t('settings.pageSubtitle')}</p>
      </div>

      {/* Sprache */}
      <div className="card" style={{ maxWidth: 620, marginBottom: 24 }}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>🌐</span>
          <div>
            <div style={styles.sectionTitle}>{t('settings.languageTitle')}</div>
            <div style={styles.sectionSub}>{t('settings.languageSub')}</div>
          </div>
        </div>
        <div className="divider" />
        <div className="form-group">
          <label className="form-label">{t('settings.languageTitle')}</label>
          <div style={styles.segmentRow}>
            {[
              { code: 'de', label: t('settings.langDe') },
              { code: 'en', label: t('settings.langEn') },
              { code: 'tr', label: t('settings.langTr') },
            ].map(({ code, label }) => (
              <button
                key={code}
                type="button"
                className="btn btn-secondary"
                style={
                  locale === code
                    ? { ...styles.segmentBtn, ...styles.segmentActive }
                    : styles.segmentBtn
                }
                onClick={() => setLocale(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Erscheinungsbild */}
      <div className="card" style={{ maxWidth: 620, marginBottom: 24 }}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>🌓</span>
          <div>
            <div style={styles.sectionTitle}>{t('settings.themeTitle')}</div>
            <div style={styles.sectionSub}>{t('settings.themeSub')}</div>
          </div>
        </div>
        <div className="divider" />
        <div className="form-group">
          <label className="form-label">{t('common.themeToggle')}</label>
          <div style={styles.segmentRow}>
            <button
              type="button"
              className="btn btn-secondary"
              style={
                theme === 'light'
                  ? { ...styles.segmentBtn, ...styles.segmentActive }
                  : styles.segmentBtn
              }
              onClick={() => { if (theme !== 'light') onToggleTheme(); }}
            >
              {t('common.light')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={
                theme === 'dark'
                  ? { ...styles.segmentBtn, ...styles.segmentActive }
                  : styles.segmentBtn
              }
              onClick={() => { if (theme !== 'dark') onToggleTheme(); }}
            >
              {t('common.dark')}
            </button>
          </div>
        </div>
      </div>

      {/* KI-Anbieter (ausgelagert) */}
      <AiSettings settings={settings} setSettings={setSettings} />
    </div>
  );
}

const styles = {
  sectionHeader: { display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 4 },
  sectionIcon: { fontSize: 24, lineHeight: 1, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  sectionSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 },
  segmentRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  segmentBtn: { flex: '1 1 140px' },
  segmentActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent)',
    color: 'var(--accent-hover)',
    fontWeight: 600,
  },
};
