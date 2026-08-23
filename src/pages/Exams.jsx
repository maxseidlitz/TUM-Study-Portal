import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { useToast } from '../context/ToastContext';
import {
  createExamTodoPayload, getDaysUntil, formatDate, generateId,
} from '../utils/helpers';
import EmptyState from '../components/ui/EmptyState';
import { PlusIcon, CloseIcon, TrashIcon } from '../components/icons/Icons';
import ExamCard from '../components/exams/ExamCard';
import ExamFormModal from '../components/exams/ExamFormModal';
import GradeAnalytics from '../components/exams/GradeAnalytics';
import ExamICalImport from '../components/exams/ExamICalImport';
import { api } from '../api';
import AccessibleDialog from '../components/ui/AccessibleDialog';
import {
  createStudyLog,
  deleteStudyLog,
  loadExamStudyLogs,
} from '../utils/studyLogPersistence';

const EMPTY_FORM = { name: '', date: '', time: '', room: '', credits: '', notes: '' };
const GRADES = ['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0', '5.0'];

export default function Exams() {
  const { t, intlLocale } = useLocale();
  const { exams, addExam, addTodo, updateExam, deleteExam, loading } = useData();
  const showToast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [logExamId, setLogExamId] = useState(null);
  const [gradeExamId, setGradeExamId] = useState(null);
  const [showIcalImport, setShowIcalImport] = useState(false);
  const [suggestTodoExam, setSuggestTodoExam] = useState(null);

  const [settings, setSettings] = useState({ targetGpa: 1.0, targetEcts: 180 });
  const [showAnalytics] = useState(true);

  useEffect(() => {
    api.settings.get().then(s => {
      if (s) setSettings({ 
        targetGpa: s.targetGpa ?? 1.0, 
        targetEcts: s.targetEcts ?? 180 
      });
    }).catch(() => {});
  }, []);

  if (loading) return <div className="loading">{t('common.loading')}</div>;

  const upcomingExams = exams.filter(e => { const d = getDaysUntil(e.date); return d !== null && d >= 0; });
  const pastExams = exams.filter(e => { const d = getDaysUntil(e.date); return d !== null && d < 0; });

  const gradedExams = exams.filter(e => e.grade != null);
  const weightedGpa = gradedExams.length > 0
    ? gradedExams.reduce((sum, e) => sum + parseFloat(e.grade) * (e.credits || 1), 0) /
      gradedExams.reduce((sum, e) => sum + (e.credits || 1), 0)
    : null;

  const openAdd = () => { setForm(EMPTY_FORM); setEditing(null); setShowModal(true); };
  const openEdit = (exam) => { setForm({ ...exam, credits: exam.credits ?? '' }); setEditing(exam.id); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...form, credits: form.credits ? parseInt(form.credits) : null };
    if (editing) {
      if (!await updateExam({ ...data, id: editing })) return;
    } else {
      const newExam = await addExam(data);
      if (!newExam) return;
      if (data.date) setSuggestTodoExam(newExam);
    }
    closeModal();
  };

  const handleIcalImport = async (candidates) => {
    for (const c of candidates) {
      if (!await addExam({ ...c, id: generateId() })) return false;
    }
    showToast(
      candidates.length === 1
        ? t('exams.icalSuccess')
        : t('exams.icalSuccessMany', { count: candidates.length }),
      'success'
    );
    return true;
  };

  const handleExportCsv = () => {
    const headers = ['Name', 'Datum', 'Uhrzeit', 'Raum', 'ECTS', 'Note', 'Bestanden'];
    const rows = exams.map(e => [
      `"${(e.name || '').replace(/"/g, '""')}"`,
      e.date || '',
      e.time || '',
      `"${(e.room || '').replace(/"/g, '""')}"`,
      e.credits ?? '',
      e.grade != null ? e.grade.toFixed(1) : '',
      e.passed != null ? (e.passed ? 'Ja' : 'Nein') : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pruefungen-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('exams.exportCsvSuccess'), 'success');
  };

  const handleDelete = async (id) => {
    if (await deleteExam(id)) setDeleteConfirm(null);
  };

  const handleGradeSave = async (examId, grade) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;
    if (await updateExam({ ...exam, grade: parseFloat(grade), passed: parseFloat(grade) < 5.0 })) {
      setGradeExamId(null);
    }
  };

  const handleGradeRemove = async (examId) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;
    const { grade, passed, ...rest } = exam;
    await updateExam(rest);
  };

  return (
    <div className="exams-page">
      <div className="responsive-page-header" style={styles.pageHeader}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('exams.title')}</h1>
          <p>
            {weightedGpa !== null
              ? t('exams.summaryGpa', { upcoming: upcomingExams.length, past: pastExams.length, gpa: weightedGpa.toFixed(2) })
              : t('exams.summary', { upcoming: upcomingExams.length, past: pastExams.length })}
          </p>
        </div>
        <div className="responsive-toolbar" style={{ display: 'flex', gap: 8 }}>
          {exams.length > 0 && (
            <button className="btn btn-secondary" onClick={handleExportCsv}>
              {t('exams.exportCsvBtn')}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowIcalImport(true)}>
            {t('exams.icalImportBtn')}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <PlusIcon size={14} strokeWidth={2.5} /> {t('exams.addExam')}
          </button>
        </div>
      </div>

      {exams.length > 0 && showAnalytics && (
        <GradeAnalytics 
          exams={exams} 
          targetGpa={settings.targetGpa} 
          targetEcts={settings.targetEcts} 
        />
      )}

      {exams.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t('exams.emptyTitle')}
          description={t('exams.emptyDescription')}
          actionLabel={t('exams.icalImportBtn')}
          onAction={() => setShowIcalImport(true)}
          secondaryActionLabel={t('exams.emptyCta')}
          onSecondaryAction={openAdd}
        />
      ) : (
        <>
          {upcomingExams.length > 0 && (
            <>
              <div className="section-title">{t('exams.upcoming')}</div>
              <div className="exam-grid" style={styles.examGrid}>
                {upcomingExams.map(exam => (
                  <ExamCard key={exam.id} exam={exam}
                    intlLocale={intlLocale}
                    t={t}
                    onEdit={openEdit} onDelete={setDeleteConfirm}
                    onOpenLog={() => setLogExamId(exam.id)}
                    onOpenGrade={() => setGradeExamId(exam.id)}
                  />
                ))}
              </div>
            </>
          )}

          {pastExams.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 32 }}>{t('exams.past')}</div>
              <div className="exam-grid" style={styles.examGrid}>
                {pastExams.map(exam => (
                  <ExamCard key={exam.id} exam={exam} past
                    intlLocale={intlLocale}
                    t={t}
                    onEdit={openEdit} onDelete={setDeleteConfirm}
                    onOpenLog={() => setLogExamId(exam.id)}
                    onOpenGrade={() => setGradeExamId(exam.id)}
                    onRemoveGrade={() => handleGradeRemove(exam.id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showModal && (
        <ExamFormModal
          editing={editing}
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onClose={closeModal}
          t={t}
        />
      )}

      {/* Study Log Modal */}
      {logExamId && (
        <StudyLogModal
          exam={exams.find(e => e.id === logExamId)}
          onClose={() => setLogExamId(null)}
          intlLocale={intlLocale}
          t={t}
        />
      )}

      {/* Grade Modal */}
      {gradeExamId && (
        <GradeModal
          exam={exams.find(e => e.id === gradeExamId)}
          onSave={handleGradeSave}
          onClose={() => setGradeExamId(null)}
          t={t}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <AccessibleDialog onClose={() => setDeleteConfirm(null)} labelledBy="exam-delete-title" className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2 id="exam-delete-title">{t('exams.deleteTitle')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirm(null)} aria-label={t('common.close')}><CloseIcon /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('exams.deleteBody', { name: exams.find(e => e.id === deleteConfirm)?.name || '' })}
            </p>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>{t('common.delete')}</button>
            </div>
        </AccessibleDialog>
      )}

      {/* iCal Import */}
      {showIcalImport && (
        <ExamICalImport
          existingExams={exams}
          onImport={handleIcalImport}
          onClose={() => setShowIcalImport(false)}
        />
      )}

      {/* Suggest Study Todo */}
      {suggestTodoExam && (
        <SuggestTodoModal
          exam={suggestTodoExam}
          onConfirm={async (todoText, dueDate) => {
            const created = await addTodo(createExamTodoPayload(suggestTodoExam, todoText, dueDate));
            if (!created) return;
            showToast(t('exams.suggestTodoCreated'), 'success');
            setSuggestTodoExam(null);
          }}
          onClose={() => setSuggestTodoExam(null)}
          t={t}
        />
      )}
    </div>
  );
}

// ---- Sub-components ----

function SuggestTodoModal({ exam, onConfirm, onClose, t }) {
  const defaultText = t('exams.suggestTodoTaskTitle', { name: exam.name || '' });
  // Suggest a due date 3 days before the exam
  const defaultDue = (() => {
    if (!exam.date) return '';
    const d = new Date(exam.date);
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  })();
  const [text, setText] = useState(defaultText);
  const [dueDate, setDueDate] = useState(defaultDue);

  return (
    <AccessibleDialog onClose={onClose} labelledBy="suggest-todo-title" className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 id="suggest-todo-title">{t('exams.suggestTodoTitle')}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {t('exams.suggestTodoBody', { name: exam.name || '' })}
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="suggest-todo-text">{t('todoDetail.placeholderTitle')}</label>
          <input
            id="suggest-todo-text"
            className="form-input"
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="suggest-todo-due">{t('todoDetail.due')}</label>
          <input
            id="suggest-todo-due"
            type="date"
            className="form-input"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('exams.suggestTodoBtnNo')}</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => onConfirm(text.trim(), dueDate)}>
            {t('exams.suggestTodoBtnYes')}
          </button>
        </div>
    </AccessibleDialog>
  );
}

function StudyLogModal({ exam, onClose, intlLocale, t }) {
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], duration_min: '', topics: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!exam) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError('');
    loadExamStudyLogs(api.studyLogs, exam.id)
      .then(result => {
        if (!cancelled) setLogs(result);
      })
      .catch(() => {
        if (!cancelled) setError(t('exams.logLoadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [exam, t]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const log = { id: generateId(), exam_id: exam.id, ...form, duration_min: parseInt(form.duration_min) || 0 };
    setSaving(true);
    setError('');
    try {
      await createStudyLog(api.studyLogs, log, created => {
        setLogs(prev => [created, ...prev]);
      });
      setForm({ date: new Date().toISOString().split('T')[0], duration_min: '', topics: '' });
    } catch {
      setError(t('exams.logCreateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError('');
    try {
      await deleteStudyLog(api.studyLogs, id, deletedId => {
        setLogs(prev => prev.filter(log => log.id !== deletedId));
      });
    } catch {
      setError(t('exams.logDeleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!exam) return null;

  const totalMin = logs.reduce((sum, l) => sum + (l.duration_min || 0), 0);
  const totalHours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;

  return (
    <AccessibleDialog onClose={onClose} labelledBy="study-log-title" className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2 id="study-log-title">{t('exams.studyLog')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{exam.name}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>

        {error && <div style={styles.logError}>{error}</div>}

        {/* Stats */}
        <div style={styles.logStats}>
          <div style={styles.logStat}>
            <div style={styles.logStatValue}>{logs.length}</div>
            <div style={styles.logStatLabel}>{t('exams.sessions')}</div>
          </div>
          <div style={styles.logStat}>
            <div style={styles.logStatValue}>{totalHours}h {remMin}m</div>
            <div style={styles.logStatLabel}>{t('exams.totalStudied')}</div>
          </div>
          {exam.date && getDaysUntil(exam.date) > 0 && (
            <div style={styles.logStat}>
              <div style={styles.logStatValue}>{t('exams.daysShort', { days: getDaysUntil(exam.date) })}</div>
              <div style={styles.logStatLabel}>{t('exams.untilExam')}</div>
            </div>
          )}
        </div>

        {/* Add form */}
        <form onSubmit={handleAdd} style={styles.logForm}>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="study-log-date">{t('exams.logFieldDate')}</label>
              <input id="study-log-date" className="form-input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="study-log-duration">{t('exams.logFieldDuration')}</label>
              <input id="study-log-duration" className="form-input" type="number" min="1" max="600" placeholder={t('exams.logPlaceholderDuration')} required
                value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="study-log-topics">{t('exams.logFieldTopics')}</label>
            <input id="study-log-topics" className="form-input" placeholder={t('exams.logPlaceholderTopics')} required
              value={form.topics} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} disabled={saving}>
            <PlusIcon /> {t('exams.logAdd')}
          </button>
        </form>

        <div className="divider" />

        {/* Log entries */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>{t('common.loadingShort')}</div>
        ) : logs.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <p>{t('exams.logEmpty')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {logs.map(log => (
              <div key={log.id} style={styles.logEntry}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.logEntryTop}>
                    <span style={styles.logDate}>{formatDate(log.date, intlLocale)}</span>
                    <span style={styles.logDuration}>
                      {Math.floor(log.duration_min / 60)}h {log.duration_min % 60}m
                    </span>
                  </div>
                  <div style={styles.logTopics}>{log.topics}</div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(log.id)}
                  disabled={deletingId === log.id}
                  aria-label={t('common.delete')}
                  style={{ color: 'var(--danger)', flexShrink: 0 }}><TrashIcon /></button>
              </div>
            ))}
          </div>
        )}
    </AccessibleDialog>
  );
}

function GradeModal({ exam, onSave, onClose, t }) {
  const [selectedGrade, setSelectedGrade] = useState(exam?.grade?.toFixed(1) || '');

  if (!exam) return null;

  return (
    <AccessibleDialog onClose={onClose} labelledBy="grade-modal-title" className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div>
            <h2 id="grade-modal-title">{t('exams.gradeModalTitle')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{exam.name}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>

        <div style={styles.gradeGrid}>
          {GRADES.map(g => {
            const passed = parseFloat(g) < 5.0;
            const isSelected = selectedGrade === g;
            const color = parseFloat(g) <= 1.5 ? 'var(--success)' : parseFloat(g) <= 3.0 ? 'var(--warning)' : 'var(--danger)';
            return (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                style={{
                  ...styles.gradeBtn,
                  background: isSelected ? color : 'var(--bg-tertiary)',
                  color: isSelected ? '#fff' : color,
                  borderColor: isSelected ? color : 'var(--border-color)',
                  fontWeight: isSelected ? 700 : 500,
                }}
              >
                {g}
                {!passed && <span style={{ fontSize: 9, display: 'block', opacity: 0.8 }}>{t('exams.gradeNotPassed')}</span>}
              </button>
            );
          })}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn-primary"
            disabled={!selectedGrade}
            onClick={() => onSave(exam.id, selectedGrade)}
          >
            {t('exams.gradeSave')}
          </button>
        </div>
    </AccessibleDialog>
  );
}

const styles = {
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  examGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 16 },
  logError: { padding: '10px 12px', marginBottom: 12, borderRadius: 8, background: 'var(--danger-subtle)', color: 'var(--danger)', fontSize: 12 },
  logStats: { display: 'flex', gap: 20, padding: '12px 0', marginBottom: 16 },
  logStat: { textAlign: 'center' },
  logStatValue: { fontSize: 20, fontWeight: 700, color: 'var(--accent-hover)' },
  logStatLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  logForm: { display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-tertiary)', borderRadius: 10, padding: 16, marginBottom: 16 },
  logEntry: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' },
  logEntryTop: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 3 },
  logDate: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' },
  logDuration: { fontSize: 12, color: 'var(--accent-hover)', fontWeight: 600 },
  logTopics: { fontSize: 12, color: 'var(--text-muted)' },
  gradeGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 },
  gradeBtn: { padding: '10px 4px', border: '2px solid', borderRadius: 8, cursor: 'pointer', fontSize: 14, textAlign: 'center', transition: 'all var(--transition)' },
};
