import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import { createStudyLog } from '../utils/studyLogPersistence';
import AccessibleDialog from './ui/AccessibleDialog';

export default function PomodoroWidget() {
  const { exams, todos, refreshData } = useData();
  const { t } = useLocale();
  const showToast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [showLogModal, setShowModal] = useState(false);
  const [logTarget, setLogTarget] = useState('exam'); // 'exam' | 'todo'
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedTodoId, setSelectedTodoId] = useState('');
  const [logSaving, setLogSaving] = useState(false);
  const [logError, setLogError] = useState('');

  const timerRef = useRef(null);

  const configs = {
    work: { time: 25 * 60, label: t('pomodoro.workLabel'), color: 'var(--danger)' },
    break: { time: 5 * 60, label: t('pomodoro.breakLabel'), color: 'var(--success)' },
    long: { time: 15 * 60, label: t('pomodoro.longBreakLabel'), color: 'var(--info)' },
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (mode === 'work') setShowModal(true);
      const nextMode = mode === 'work' ? 'break' : 'work';
      setMode(nextMode);
      setTimeLeft(nextMode === 'break' ? 5 * 60 : 25 * 60);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, mode, timeLeft]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(configs[mode].time);
  };

  const switchMode = (m) => {
    setMode(m);
    setIsActive(false);
    setTimeLeft(configs[m].time);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSaveLog = async () => {
    const duration = Math.floor(configs.work.time / 60);
    const base = {
      id: `${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      duration_min: duration,
      topics: t('pomodoro.workLabel'),
    };
    const log = logTarget === 'exam'
      ? { ...base, exam_id: selectedExamId }
      : { ...base, todo_id: selectedTodoId };
    setLogSaving(true);
    setLogError('');
    try {
      await createStudyLog(api.studyLogs, log);
      await refreshData();
      setShowModal(false);
      setSelectedExamId('');
      setSelectedTodoId('');
    } catch {
      const message = t('pomodoro.logSaveError');
      setLogError(message);
      showToast(message, 'error');
    } finally {
      setLogSaving(false);
    }
  };

  const upcomingExams = exams.filter(e => {
    const d = (new Date(e.date) - new Date()) / 86400000;
    return d >= -1;
  });

  const openTodos = todos.filter(td => !td.done);

  const canSave = logTarget === 'exam' ? !!selectedExamId : !!selectedTodoId;

  return (
    <>
      <div className="pomodoro-widget" style={{ ...styles.container, transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% - 44px))' }}>
        <button type="button" style={styles.toggleHandle} onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-label={t('pomodoro.toggle')}>
          {isOpen ? '→' : '⏱️'}
        </button>

        <div style={styles.widget}>
          <div style={styles.modes}>
            {Object.keys(configs).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  ...styles.modeBtn,
                  color: mode === m ? configs[m].color : 'var(--text-muted)',
                  fontWeight: mode === m ? 700 : 400,
                }}
              >
                {configs[m].label}
              </button>
            ))}
          </div>

          <div style={{ ...styles.timer, color: configs[mode].color }}>
            {formatTime(timeLeft)}
          </div>

          <div style={styles.controls}>
            <button className="btn btn-primary btn-sm" onClick={toggleTimer} style={{ flex: 1 }}>
              {isActive ? t('pomodoro.pause') : t('pomodoro.start')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={resetTimer}>{t('pomodoro.reset')}</button>
          </div>
        </div>
      </div>

      {showLogModal && (
        <AccessibleDialog onClose={() => setShowModal(false)} labelledBy="pomodoro-log-title" className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 id="pomodoro-log-title">{t('pomodoro.logTitle')}</h2>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {t('pomodoro.logDurationLabel')}: {t('pomodoro.logDurationMinutes', { min: Math.floor(configs.work.time / 60) })}
            </p>
            {logError && <div style={styles.logError}>{logError}</div>}

            <div className="form-group">
              <span id="pomodoro-log-type-label" className="form-label">{t('pomodoro.logTypeLabel')}</span>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }} role="group" aria-labelledby="pomodoro-log-type-label">
                {['exam', 'todo'].map(type => (
                  <button
                    key={type}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={logTarget === type ? styles.activeTab : {}}
                    onClick={() => setLogTarget(type)}
                  >
                    {type === 'exam' ? t('pomodoro.logTypeExam') : t('pomodoro.logTypeTodo')}
                  </button>
                ))}
              </div>
            </div>

            {logTarget === 'exam' ? (
              <div className="form-group">
                <label className="form-label" htmlFor="pomodoro-log-exam">{t('pomodoro.logExamLabel')}</label>
                <select
                  id="pomodoro-log-exam"
                  className="form-input"
                  value={selectedExamId}
                  onChange={e => setSelectedExamId(e.target.value)}
                >
                  <option value="">{t('pomodoro.logNoExam')}</option>
                  {upcomingExams.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="pomodoro-log-todo">{t('pomodoro.logTodoLabel')}</label>
                <select
                  id="pomodoro-log-todo"
                  className="form-input"
                  value={selectedTodoId}
                  onChange={e => setSelectedTodoId(e.target.value)}
                >
                  <option value="">{t('pomodoro.logNoTodo')}</option>
                  {openTodos.map(td => (
                    <option key={td.id} value={td.id}>{td.text || td.title || td.id}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={logSaving}>
                {t('pomodoro.logSkip')}
              </button>
              <button className="btn btn-primary" onClick={handleSaveLog} disabled={!canSave || logSaving}>
                {t('pomodoro.logSave')}
              </button>
            </div>
        </AccessibleDialog>
      )}
    </>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 100,
    right: 0,
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    transition: 'transform 0.3s ease',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRight: 'none',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    boxShadow: 'var(--shadow-lg)',
  },
  toggleHandle: {
    width: 44,
    height: 100,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 20,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  widget: {
    width: 180,
    padding: '16px 20px 16px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  modes: { display: 'flex', gap: 8, fontSize: 11 },
  modeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  timer: { fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  controls: { display: 'flex', gap: 8, width: '100%' },
  logError: { padding: '9px 11px', marginBottom: 12, borderRadius: 8, background: 'var(--danger-subtle)', color: 'var(--danger)', fontSize: 12 },
  activeTab: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent)',
    color: 'var(--accent-hover)',
    fontWeight: 600,
  },
};
