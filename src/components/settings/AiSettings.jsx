import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../../context/LocaleContext';

/**
 * KI-Anbieter-Einstellungen (Ollama / Google Gemini) — aus Settings.jsx
 * ausgelagert. Erhält das gemeinsame `settings`-Objekt + Setter vom Parent;
 * Modell-Liste, Test- und Speicher-Logik leben hier.
 */
export default function AiSettings({ settings, setSettings }) {
  const { t, intlLocale, locale } = useLocale();

  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // 'loading' | 'ok' | 'error'
  const [testMsg, setTestMsg] = useState('');

  const [models, setModels] = useState([]);
  const [modelsStatus, setModelsStatus] = useState('idle');
  const [modelsError, setModelsError] = useState('');

  const isOllama = settings.aiProvider !== 'gemini';
  const isGemini = settings.aiProvider === 'gemini';

  const fetchModelList = useCallback(async (snapshot) => {
    const s = {
      aiProvider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      geminiModel: '',
      ...snapshot,
    };
    setModelsStatus('loading');
    setModelsError('');
    try {
      const result = await window.api.ai.models({
        aiProvider: s.aiProvider,
        ollamaUrl: s.ollamaUrl,
        geminiModel: s.geminiModel,
      });
      if (result.success) {
        setModels(result.models);
        setModelsStatus('ok');
      } else {
        setModels([]);
        setModelsStatus('error');
        setModelsError(result.error || t('common.unknownError'));
      }
    } catch (e) {
      setModels([]);
      setModelsStatus('error');
      setModelsError(e.message);
    }
  }, [t]);

  useEffect(() => {
    fetchModelList({
      aiProvider: settings.aiProvider,
      ollamaUrl: settings.ollamaUrl,
      geminiModel: settings.geminiModel,
    });
  }, [settings.aiProvider, settings.ollamaUrl, settings.geminiModel, fetchModelList]);

  const handleSave = async () => {
    await window.api.settings.save({ ...settings, locale });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestAi = async () => {
    setTestStatus('loading');
    setTestMsg('');
    await window.api.settings.save({ ...settings, locale });
    try {
      const result = await window.api.ai.recommend({
        exams: [],
        todos: [],
        lectures: [],
        today: new Date().toLocaleDateString(intlLocale),
      });
      if (result.success) {
        setTestStatus('ok');
        const modelLabel =
          typeof result.model === 'string'
            ? result.model
            : isOllama
              ? settings.ollamaModel
              : settings.geminiModel || t('settings.standard');
        setTestMsg(t('settings.testOkMsg', {
          model: modelLabel || t('settings.standard'),
          snippet: result.content.slice(0, 70),
        }));
      } else {
        setTestStatus('error');
        setTestMsg(result.error || t('common.unknownError'));
      }
    } catch (e) {
      setTestStatus('error');
      setTestMsg(e.message);
    }
  };

  const cfg = settings.ollamaModel;
  const modelInstalled =
    !isOllama ||
    !cfg ||
    models.some(m => m === cfg || m.startsWith(`${cfg}:`));
  const effectiveOllamaModel = !cfg && models.length > 0 ? models[0] : cfg;

  return (
    <>
      {/* KI-Anbieter */}
      <div className="card" style={{ maxWidth: 620, marginBottom: 24 }}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>🧠</span>
          <div>
            <div style={styles.sectionTitle}>{t('settings.aiTitle')}</div>
            <div style={styles.sectionSub}>{t('settings.aiSub')}</div>
          </div>
        </div>

        <div className="divider" />

        <div className="form-group">
          <label className="form-label">{t('settings.serviceLabel')}</label>
          <div style={styles.segmentRow}>
            <button
              type="button"
              className="btn btn-secondary"
              style={isOllama ? { ...styles.segmentBtn, ...styles.segmentActive } : styles.segmentBtn}
              onClick={() => setSettings(s => ({ ...s, aiProvider: 'ollama' }))}
            >
              {t('settings.ollama')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={isGemini ? { ...styles.segmentBtn, ...styles.segmentActive } : styles.segmentBtn}
              onClick={() => setSettings(s => ({ ...s, aiProvider: 'gemini' }))}
            >
              {t('settings.gemini')}
            </button>
          </div>
        </div>

        {/* Ollama */}
        {isOllama && (
          <>
            <div style={{ ...styles.sectionHeader, marginTop: 20 }}>
              <span style={styles.sectionIcon}>🤖</span>
              <div>
                <div style={styles.sectionTitle}>{t('settings.ollamaTitle')}</div>
                <div style={styles.sectionSub}>
                  {t('settings.ollamaSub')}{' '}
                  <button
                    type="button"
                    onClick={() => window.api.openExternal('https://ollama.ai')}
                    style={styles.link}
                  >
                    {t('settings.ollamaInstall')}
                  </button>
                </div>
              </div>
            </div>
            <div className="divider" />

            <div className="form-group">
              <label className="form-label">{t('settings.ollamaUrl')}</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="form-input"
                  value={settings.ollamaUrl}
                  onChange={e => setSettings(s => ({ ...s, ollamaUrl: e.target.value }))}
                  placeholder="http://localhost:11434"
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fetchModelList(settings)}
                  style={{ flexShrink: 0 }}
                >
                  {t('settings.loadModels')}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.ollamaDisableReasoning)}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setSettings(s => ({ ...s, ollamaDisableReasoning: checked }));
                    try {
                      await window.api.settings.save({ ollamaDisableReasoning: checked });
                    } catch {
                      setSettings(s => ({ ...s, ollamaDisableReasoning: !checked }));
                    }
                  }}
                  style={{ marginTop: 4 }}
                />
                <span>
                  <strong>{t('settings.ollamaDisableReasoningLabel')}</strong>
                  <div style={{ ...styles.sectionSub, marginTop: 4 }}>
                    {t('settings.ollamaDisableReasoningHint')}
                  </div>
                </span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('settings.modelLabel')}
                {modelsStatus === 'ok' && (
                  <span style={styles.countTag}>{t('settings.modelsFound', { count: models.length })}</span>
                )}
              </label>

              {modelsStatus === 'loading' && (
                <div style={styles.modelsHint}>{t('settings.modelsLoading')}</div>
              )}

              {modelsStatus === 'error' && (
                <div style={{ ...styles.banner, ...styles.bannerError }}>
                  {t('settings.modelsLoadErr', { error: modelsError })}
                </div>
              )}

              {modelsStatus === 'ok' && models.length === 0 && (
                <div style={{ ...styles.banner, ...styles.bannerWarn }}>
                  {t('settings.noModels')}{' '}
                  <code style={styles.code}>ollama pull llama3.2</code>
                </div>
              )}

              {modelsStatus === 'ok' && models.length > 0 && (
                <>
                  <div style={styles.modelChips}>
                    {models.map(m => {
                      const active = settings.ollamaModel === m;
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => setSettings(s => ({ ...s, ollamaModel: m }))}
                          style={{
                            ...styles.chip,
                            background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                            color: active ? '#fff' : 'var(--text-secondary)',
                            borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                          }}
                        >
                          {active && '✓ '}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  {!cfg && (
                    <p style={styles.modelsHint}>
                      {t('settings.modelNotChosen')}{' '}
                      <strong>{effectiveOllamaModel}</strong>
                      {t('settings.modelNotChosen2')}
                    </p>
                  )}
                  {cfg && !modelInstalled && (
                    <div style={{ ...styles.banner, ...styles.bannerWarn, marginTop: 8 }}>
                      {t('settings.modelMissingWarn')}{' '}
                      <code style={styles.code}>{cfg}</code>{' '}
                      {t('settings.modelMissingWarn2')}{' '}
                      <code style={styles.code}>ollama pull {cfg}</code> {t('settings.modelMissingOut')}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Gemini */}
        {isGemini && (
          <>
            <div style={{ ...styles.sectionHeader, marginTop: 20 }}>
              <span style={styles.sectionIcon}>☁️</span>
              <div>
                <div style={styles.sectionTitle}>{t('settings.geminiTitle')}</div>
                <div style={styles.sectionSub}>
                  {t('settings.geminiSub')}{' '}
                  <button type="button" onClick={() => window.api.openExternal('https://aistudio.google.com/apikey')} style={styles.link}>
                    {t('settings.geminiConsole')}
                  </button>{' '}
                  {t('settings.geminiSub2')}
                </div>
              </div>
            </div>
            <div className="divider" />

            <div className="form-group">
              <label className="form-label">{t('settings.apiKey')}</label>
              <input
                className="form-input"
                type="password"
                autoComplete="off"
                value={settings.geminiApiKey}
                onChange={e => setSettings(s => ({ ...s, geminiApiKey: e.target.value }))}
                placeholder={t('settings.apiKeyPlaceholder')}
              />
              <p style={styles.modelsHint}>
                {t('settings.apiKeyHint')} <code style={styles.code}>GEMINI_API_KEY</code> {t('settings.apiKeyHint2')}
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('settings.modelId')}
                {modelsStatus === 'ok' && models.length > 0 && (
                  <span style={styles.countTag}>{t('settings.modelsFound', { count: models.length })}</span>
                )}
              </label>
              <input
                className="form-input"
                value={settings.geminiModel}
                onChange={e => setSettings(s => ({ ...s, geminiModel: e.target.value }))}
                placeholder={t('settings.modelIdPlaceholder')}
              />

              {modelsStatus === 'loading' && (
                <div style={styles.modelsHint}>{t('settings.modelSuggestionsLoading')}</div>
              )}
              {modelsStatus === 'error' && (
                <div style={{ ...styles.banner, ...styles.bannerError, marginTop: 8 }}>
                  {t('settings.testErr')} {modelsError}
                </div>
              )}
              {modelsStatus === 'ok' && models.length > 0 && (
                <>
                  <p style={{ ...styles.modelsHint, marginTop: 10 }}>{t('settings.quickPick')}</p>
                  <div style={styles.modelChips}>
                    {models.map(m => {
                      const active = settings.geminiModel === m;
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => setSettings(s => ({ ...s, geminiModel: m }))}
                          style={{
                            ...styles.chip,
                            background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                            color: active ? '#fff' : 'var(--text-secondary)',
                            borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                          }}
                        >
                          {active && '✓ '}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Test */}
        {testStatus && (
          <div style={{
            ...styles.banner,
            ...(testStatus === 'ok' ? styles.bannerOk
              : testStatus === 'error' ? styles.bannerError
                : styles.bannerNeutral),
          }}>
            {testStatus === 'loading'
              ? t('settings.testLoading')
              : testStatus === 'ok' ? `${t('settings.testOk')} ${testMsg}` : `${t('settings.testErr')} ${testMsg}`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTestAi}
            disabled={testStatus === 'loading'}
          >
            {t('settings.testConnection')}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {saved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>
      </div>

      {/* Quick-Start Ollama */}
      {isOllama && (
        <div className="card" style={{ maxWidth: 620, background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionIcon}>💡</span>
            <div style={styles.sectionTitle}>{t('settings.quickStartTitle')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {[
              { step: '1', text: t('settings.qs1') },
              { step: '2', text: t('settings.qs2') },
              { step: '3', text: t('settings.qs3') },
              { step: '4', text: t('settings.qs4') },
            ].map(({ step, text }) => (
              <div key={step} style={styles.stepRow}>
                <div style={styles.stepBadge}>{step}</div>
                <code style={styles.stepText}>{text}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  sectionHeader: { display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 4 },
  sectionIcon: { fontSize: 24, lineHeight: 1, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  sectionSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 },
  link: { background: 'none', border: 'none', color: 'var(--accent-hover)', cursor: 'pointer', padding: 0, fontSize: 'inherit' },
  code: { fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: 3, fontSize: 11 },
  countTag: {
    fontSize: 10, fontWeight: 600, color: 'var(--success)',
    background: 'var(--success-subtle)', padding: '1px 7px', borderRadius: 999, marginLeft: 8,
  },
  segmentRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  segmentBtn: { flex: '1 1 140px' },
  segmentActive: {
    borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)',
    color: 'var(--accent-hover)', fontWeight: 600,
  },
  modelChips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    padding: '4px 11px', borderRadius: 999, border: '1px solid',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'monospace',
    transition: 'all var(--transition)',
  },
  modelsHint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.5 },
  banner: { padding: '10px 14px', borderRadius: 8, border: '1px solid', fontSize: 12, lineHeight: 1.5, marginTop: 8 },
  bannerOk: { background: 'var(--success-subtle)', borderColor: 'var(--success)', color: 'var(--success)' },
  bannerError: { background: 'var(--danger-subtle)', borderColor: 'var(--danger)', color: 'var(--danger)' },
  bannerWarn: { background: 'var(--warning-subtle)', borderColor: 'var(--warning)', color: 'var(--text-primary)' },
  bannerNeutral: { background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' },
  stepRow: { display: 'flex', alignItems: 'center', gap: 12 },
  stepBadge: {
    width: 22, height: 22, borderRadius: '50%',
    background: 'var(--accent-subtle)', color: 'var(--accent-hover)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, flexShrink: 0,
  },
  stepText: { fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' },
};
