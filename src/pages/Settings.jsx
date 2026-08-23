import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import AiSettings from '../components/settings/AiSettings';
import { api } from '../api';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useLocale();
  const showToast = useToast();
  const importRef = useRef(null);

  const defaultState = () => ({
    aiProvider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: '',
    ollamaDisableReasoning: false,
    geminiApiKey: '',
    geminiModel: '',
    targetEcts: 180,
    targetGpa: 1.0,
    preferredMensaId: '422',
  });

  const [settings, setSettings] = useState(defaultState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ectsError, setEctsError] = useState('');
  const [gpaError, setGpaError] = useState('');

  useEffect(() => {
    api.settings.get().then((s) => {
      setSettings({ ...defaultState(), ...s });
      setLoading(false);
    });
  }, []);

  const saveSettings = async (next) => {
    setSaving(true);
    setSettings(next);
    await api.settings.save(next);
    setTimeout(() => setSaving(false), 800);
  };

  const handleEctsChange = (e) => {
    const val = parseInt(e.target.value);
    if (isNaN(val) || val < 0 || val > 360) {
      setEctsError(t('settings.targetEctsError'));
    } else {
      setEctsError('');
      saveSettings({ ...settings, targetEcts: val });
    }
    setSettings(s => ({ ...s, targetEcts: e.target.value }));
  };

  const handleGpaChange = (e) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val) || val < 1.0 || val > 4.0) {
      setGpaError(t('settings.targetGpaError'));
    } else {
      setGpaError('');
      saveSettings({ ...settings, targetGpa: val });
    }
    setSettings(s => ({ ...s, targetGpa: e.target.value }));
  };

  const handleExport = async () => {
    const result = await api.backup.export();
    if (!result.success) {
      showToast(result.error || t('common.unknownError'), 'error');
      return;
    }
    const blob = new Blob([result.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tum-dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('settings.exportSuccess'), 'success');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm(t('settings.importConfirm'))) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = await api.backup.import(ev.target.result);
      if (result.success) {
        showToast(t('settings.importSuccess'), 'success');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast(t('settings.importError').replace('{error}', result.error || ''), 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestartTour = async () => {
    await api.settings.save({ onboardingCompleted: false, onboardingStep: 0 });
    window.dispatchEvent(new CustomEvent('restart-setup-wizard'));
  };

  if (loading) return <div className="loading">{t('settings.loading')}</div>;

  return (
    <div>
      <div className="page-header">
        <h1>{t('settings.pageTitle')}</h1>
        <p>{t('settings.pageSubtitle')}</p>
        {saving && <span style={styles.savingMsg}>{t('settings.saved')}</span>}
      </div>

      {/* Studium & Dashboard */}
      <div className="card" style={{ maxWidth: 620, marginBottom: 24 }}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>🎓</span>
          <div>
            <div style={styles.sectionTitle}>{t('settings.studyTitle')}</div>
            <div style={styles.sectionSub}>{t('settings.studySub')}</div>
          </div>
        </div>
        <div className="divider" />
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('settings.targetEctsLabel')}</label>
            <input
              type="number"
              className={`form-input${ectsError ? ' form-input-error' : ''}`}
              value={settings.targetEcts}
              onChange={handleEctsChange}
            />
            {ectsError && <span style={styles.fieldError}>{ectsError}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">{t('settings.targetGpaLabel')}</label>
            <input
              type="number"
              step="0.1"
              min="1.0"
              max="4.0"
              className={`form-input${gpaError ? ' form-input-error' : ''}`}
              value={settings.targetGpa}
              onChange={handleGpaChange}
            />
            {gpaError && <span style={styles.fieldError}>{gpaError}</span>}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('settings.preferredMensaLabel')}</label>
          <select
            className="form-input"
            value={settings.preferredMensaId}
            onChange={e => saveSettings({ ...settings, preferredMensaId: e.target.value })}
          >
            <option value="422">Mensa Garching</option>
            <option value="421">Mensa Arcisstraße</option>
            <option value="423">Mensa Weihenstephan</option>
            <option value="530">Mensa Heilbronn</option>
          </select>
        </div>
      </div>

      {/* Datensicherung */}
      <div className="card" style={{ maxWidth: 620, marginBottom: 24 }}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>💾</span>
          <div>
            <div style={styles.sectionTitle}>{t('settings.backupTitle')}</div>
            <div style={styles.sectionSub}>{t('settings.backupSub')}</div>
          </div>
        </div>
        <div className="divider" />
        <div style={styles.segmentRow}>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            {t('settings.exportBtn')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => importRef.current?.click()}>
            {t('settings.importBtn')}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={handleRestartTour}>
            {t('settings.restartTour')}
          </button>
        </div>
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
                style={locale === code ? { ...styles.segmentBtn, ...styles.segmentActive } : styles.segmentBtn}
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
            {['light', 'dark'].map((th) => (
              <button
                key={th}
                type="button"
                className="btn btn-secondary"
                style={theme === th ? { ...styles.segmentBtn, ...styles.segmentActive } : styles.segmentBtn}
                onClick={() => { if (theme !== th) toggleTheme(); }}
              >
                {t(`common.${th}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KI-Anbieter (ausgelagert) */}
      <AiSettings settings={settings} setSettings={setSettings} />
    </div>
  );
}

const styles = {
  savingMsg: { fontSize: 12, color: 'var(--success)', fontWeight: 600, marginLeft: 16, animation: 'fadeIn 0.3s' },
  sectionHeader: { display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 4 },
  sectionIcon: { fontSize: 24, lineHeight: 1, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  sectionSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 },
  segmentRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  segmentBtn: { flex: '1 1 140px' },
  segmentActive: { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)', color: 'var(--accent-hover)', fontWeight: 600 },
  fieldError: { fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'block' },
};
