import React, { useState, useEffect, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { generateId } from '../utils/helpers';
import ICalImportForm from './lectures/ICalImportForm';
import ExamICalImportForm from './exams/ExamICalImportForm';
import { useOllamaSetup, isOllamaSetupActive } from '../hooks/useOllamaSetup';
import { api } from '../api';
import AccessibleDialog from './ui/AccessibleDialog';

const TOTAL_STEPS = 4;

export default function SetupWizard({ onComplete, onVisibilityChange, onNavigate }) {
  const { t } = useLocale();
  const { exams, lectures, addExam, loading: dataLoading } = useData();
  const ollamaState = useOllamaSetup();

  const [visible, setVisible] = useState(false);
  const [initDone, setInitDone] = useState(false);
  const [step, setStep] = useState(0);
  const [importStats, setImportStats] = useState({ moduleCount: 0, lectureCount: 0, examCount: 0 });
  const [scheduleImported, setScheduleImported] = useState(false);

  const saveStep = useCallback(async (nextStep) => {
    try {
      await api.settings.save({ onboardingStep: nextStep });
      setStep(nextStep);
      return true;
    } catch {
      return false;
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      await api.settings.save({ onboardingCompleted: true, onboardingStep: TOTAL_STEPS });
    } catch {
      return false;
    }
    setVisible(false);
    onVisibilityChange?.(false);
    onComplete?.();
    return true;
  }, [onComplete, onVisibilityChange]);

  useEffect(() => {
    const onRestart = () => {
      setStep(0);
      setScheduleImported(false);
      setImportStats({ moduleCount: 0, lectureCount: 0, examCount: 0 });
      setVisible(true);
      onVisibilityChange?.(true);
    };
    window.addEventListener('restart-setup-wizard', onRestart);
    return () => window.removeEventListener('restart-setup-wizard', onRestart);
  }, [onVisibilityChange]);

  useEffect(() => {
    if (dataLoading || initDone) return;

    const init = async () => {
      const settings = await api.settings.get();
      let completed = Boolean(settings?.onboardingCompleted);

      if (localStorage.getItem('tourCompleted')) {
        completed = true;
        localStorage.removeItem('tourCompleted');
        await api.settings.save({ onboardingCompleted: true });
      }

      if (!completed && lectures.length > 0) {
        completed = true;
        await api.settings.save({ onboardingCompleted: true });
      }

      if (completed) {
        setVisible(false);
        onVisibilityChange?.(false);
      } else {
        const savedStep = typeof settings?.onboardingStep === 'number'
          ? Math.min(Math.max(settings.onboardingStep, 0), TOTAL_STEPS - 1)
          : 0;
        setStep(savedStep);
        setVisible(true);
        onVisibilityChange?.(true);
      }
      setInitDone(true);
    };

    init().catch(() => {
      // A settings transport failure must not leave initialization pending.
      setStep(0);
      setVisible(true);
      onVisibilityChange?.(true);
      setInitDone(true);
    });
  }, [dataLoading, initDone, lectures.length, onVisibilityChange]);

  const handleScheduleImport = useCallback((result) => {
    setScheduleImported(true);
    setImportStats((prev) => ({
      ...prev,
      moduleCount: result.moduleCount,
      lectureCount: result.lectureCount,
    }));
  }, []);

  const handleExamImport = useCallback(async (candidates) => {
    for (const c of candidates) {
      if (!await addExam({ ...c, id: generateId() })) return false;
    }
    setImportStats((prev) => ({ ...prev, examCount: candidates.length }));
    return true;
  }, [addExam]);

  const handleExamImportComplete = useCallback((result) => {
    setImportStats((prev) => ({ ...prev, examCount: result.examCount }));
  }, []);

  const goNext = async () => {
    const next = step + 1;
    if (next >= TOTAL_STEPS) {
      await completeOnboarding();
    } else {
      await saveStep(next);
    }
  };

  const goBack = async () => {
    if (step > 0) await saveStep(step - 1);
  };

  if (!visible) return null;

  const stepLabels = [
    t('setupWizard.stepWelcome'),
    t('setupWizard.stepSchedule'),
    t('setupWizard.stepExams'),
    t('setupWizard.stepDone'),
  ];

  return (
    <AccessibleDialog
      onClose={null}
      closeOnBackdrop={false}
      closeOnEscape={false}
      labelledBy="setup-wizard-title"
      overlayClassName="setup-wizard-overlay"
      className="setup-wizard-dialog"
      style={styles.card}
    >
        <div className="setup-progress" style={styles.progressRow}>
          {stepLabels.map((label, idx) => (
            <div key={label} style={styles.progressItem}>
              <div style={{
                ...styles.progressDot,
                background: idx <= step ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: idx <= step ? '#fff' : 'var(--text-muted)',
              }}>
                {idx + 1}
              </div>
              <span style={{
                ...styles.progressLabel,
                color: idx === step ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: idx === step ? 600 : 400,
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="setup-content" style={styles.content}>
          {step === 0 && (
            <>
              <div style={styles.icon}>🎓</div>
              <h1 id="setup-wizard-title" style={styles.title}>{t('setupWizard.welcomeTitle')}</h1>
              <p style={styles.body}>{t('setupWizard.welcomeBody')}</p>
              <ul style={styles.featureList}>
                <li>{t('setupWizard.featureSchedule')}</li>
                <li>{t('setupWizard.featureExams')}</li>
                <li>{t('setupWizard.featureAi')}</li>
              </ul>
            </>
          )}

          {step === 1 && (
            <>
              <h2 id="setup-wizard-title" style={styles.stepTitle}>{t('setupWizard.scheduleTitle')}</h2>
              <p style={styles.stepSub}>{t('setupWizard.scheduleBody')}</p>
              <ICalImportForm
                embedded
                showSyncInfo={false}
                onImportComplete={handleScheduleImport}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h2 id="setup-wizard-title" style={styles.stepTitle}>{t('setupWizard.examsTitle')}</h2>
              <p style={styles.stepSub}>{t('setupWizard.examsBody')}</p>
              <ExamICalImportForm
                embedded
                existingExams={exams}
                onImport={handleExamImport}
                onImportComplete={handleExamImportComplete}
              />
            </>
          )}

          {step === 3 && (
            <>
              <div style={styles.icon}>✅</div>
              <h2 id="setup-wizard-title" style={styles.title}>{t('setupWizard.doneTitle')}</h2>
              <p style={styles.body}>{t('setupWizard.doneBody')}</p>
              <div style={styles.summaryBox}>
                {importStats.moduleCount > 0 && (
                  <div>{t('setupWizard.summaryModules', { count: importStats.moduleCount })}</div>
                )}
                {importStats.lectureCount > 0 && (
                  <div>{t('setupWizard.summaryLectures', { count: importStats.lectureCount })}</div>
                )}
                {importStats.examCount > 0 && (
                  <div>{t('setupWizard.summaryExams', { count: importStats.examCount })}</div>
                )}
                {!scheduleImported && importStats.examCount === 0 && (
                  <div>{t('setupWizard.summaryEmpty')}</div>
                )}
              </div>
            </>
          )}
        </div>

        <OllamaStatusBar state={ollamaState} t={t} />

        <div className="setup-actions" style={styles.actions}>
          {step > 0 && step < TOTAL_STEPS && (
            <button type="button" className="btn btn-secondary" onClick={goBack}>
              {t('setupWizard.back')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 0 && (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              {t('setupWizard.start')}
            </button>
          )}
          {step === 1 && (
            <>
              <button type="button" className="btn btn-ghost" onClick={goNext}>
                {t('setupWizard.skipSchedule')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={goNext}
                disabled={!scheduleImported}
              >
                {t('setupWizard.next')}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button type="button" className="btn btn-ghost" onClick={goNext}>
                {t('setupWizard.skipExams')}
              </button>
              <button type="button" className="btn btn-primary" onClick={goNext}>
                {t('setupWizard.next')}
              </button>
            </>
          )}
          {step === 3 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                completeOnboarding();
                onNavigate?.('dashboard');
              }}
            >
              {t('setupWizard.finish')}
            </button>
          )}
        </div>
    </AccessibleDialog>
  );
}

function OllamaStatusBar({ state, t }) {
  if (!state) return null;
  if (!isOllamaSetupActive(state)) return null;

  const { phase, percent = 0, model } = state;
  const isError = phase === 'error';
  const isDownloading = phase === 'downloading';

  let text = t('setupWizard.ollamaStarting');
  if (isDownloading) text = t('setupWizard.ollamaDownloading', { model: model || '', percent });
  if (isError) text = t('setupWizard.ollamaError');

  return (
    <div style={styles.ollamaBar}>
      <span>🤖</span>
      <span style={{ flex: 1 }}>{text}</span>
      {isDownloading && (
        <div style={styles.ollamaProgressTrack}>
          <div style={{ ...styles.ollamaProgressFill, width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(8, 10, 16, 0.88)',
    backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9000, padding: 24,
  },
  card: {
    width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto',
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-xl)', padding: 32, boxShadow: 'var(--shadow-lg)',
  },
  progressRow: {
    display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 28,
    paddingBottom: 20, borderBottom: '1px solid var(--border-color)',
  },
  progressItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 },
  progressDot: {
    width: 28, height: 28, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
  },
  progressLabel: { fontSize: 11, textAlign: 'center', lineHeight: 1.3 },
  content: { minHeight: 200, marginBottom: 20 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: {
    fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 700,
    color: 'var(--text-primary)', textAlign: 'center', marginBottom: 12,
  },
  body: { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, textAlign: 'center' },
  featureList: {
    marginTop: 20, paddingLeft: 20, fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)', lineHeight: 1.8,
  },
  stepTitle: {
    fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 700,
    color: 'var(--text-primary)', marginBottom: 8,
  },
  stepSub: { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 },
  summaryBox: {
    marginTop: 20, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10,
    fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.8, textAlign: 'center',
  },
  ollamaBar: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 16,
    fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
  },
  ollamaProgressTrack: {
    width: 80, height: 4, background: 'var(--border-color)', borderRadius: 999, overflow: 'hidden',
  },
  ollamaProgressFill: { height: '100%', background: 'var(--accent)', borderRadius: 999 },
  actions: { display: 'flex', alignItems: 'center', gap: 10 },
};
