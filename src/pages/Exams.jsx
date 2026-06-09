import React, { useState, useEffect, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { getDaysUntil, getCountdownClass, formatDate, getStudyProgress, generateId } from '../utils/helpers';

const EMPTY_FORM = { name: '', date: '', time: '', room: '', credits: '', notes: '' };
const GRADES = ['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0', '5.0'];

export default function Exams() {
  const { t, intlLocale } = useLocale();
  const { exams, addExam, updateExam, deleteExam, loading } = useData();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [logExamId, setLogExamId] = useState(null);
  const [gradeExamId, setGradeExamId] = useState(null);

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
    if (editing) await updateExam({ ...data, id: editing });
    else await addExam(data);
    closeModal();
  };

  const handleDelete = async (id) => {
    await deleteExam(id);
    setDeleteConfirm(null);
  };

  const handleGradeSave = async (examId, grade) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;
    await updateExam({ ...exam, grade: parseFloat(grade), passed: parseFloat(grade) < 5.0 });
    setGradeExamId(null);
  };

  const handleGradeRemove = async (examId) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;
    const { grade, passed, ...rest } = exam;
    await updateExam(rest);
  };

  return (
    <div>
      <div style={styles.pageHeader}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('exams.title')}</h1>
          <p>
            {weightedGpa !== null
              ? t('exams.summaryGpa', { upcoming: upcomingExams.length, past: pastExams.length, gpa: weightedGpa.toFixed(2) })
              : t('exams.summary', { upcoming: upcomingExams.length, past: pastExams.length })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <PlusIcon /> {t('exams.addExam')}
        </button>
      </div>

      {exams.length === 0 ? (
        <EmptyState onAdd={openAdd} t={t} />
      ) : (
        <>
          {upcomingExams.length > 0 && (
            <>
              <div className="section-title">{t('exams.upcoming')}</div>
              <div style={styles.examGrid}>
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
              <div style={styles.examGrid}>
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editing ? t('exams.modalEdit') : t('exams.modalNew')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}><CloseIcon /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">{t('exams.fieldName')}</label>
                <input className="form-input" required placeholder={t('exams.placeholderName')}
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('exams.fieldDate')}</label>
                  <input className="form-input" type="date" required
                    value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('exams.fieldTime')}</label>
                  <input className="form-input" type="time"
                    value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('exams.fieldRoom')}</label>
                  <input className="form-input" placeholder={t('exams.placeholderRoom')}
                    value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('exams.fieldCredits')}</label>
                  <input className="form-input" type="number" min="0" max="30" placeholder="0"
                    value={form.credits} onChange={e => setForm(f => ({ ...f, credits: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('exams.fieldNotes')}</label>
                <textarea className="form-textarea" placeholder={t('exams.placeholderNotes')}
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary">{editing ? t('common.save') : t('common.add')}</button>
              </div>
            </form>
          </div>
        </div>
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>{t('exams.deleteTitle')}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirm(null)}><CloseIcon /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('exams.deleteBody', { name: exams.find(e => e.id === deleteConfirm)?.name || '' })}
            </p>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function ExamCard({ exam, onEdit, onDelete, onOpenLog, onOpenGrade, onRemoveGrade, past, intlLocale, t }) {
  const days = getDaysUntil(exam.date);
  const cls = getCountdownClass(days);
  const colorMap = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)' };
  const countdownColor = past ? 'var(--text-muted)' : (colorMap[cls] || 'var(--text-muted)');
  const progress = getStudyProgress(exam.date);

  const gradeColor = exam.grade != null
    ? exam.grade <= 1.5 ? 'var(--success)' : exam.grade <= 3.0 ? 'var(--warning)' : 'var(--danger)'
    : null;

  return (
    <div className="card" style={{ ...styles.examCard, opacity: past && !exam.grade ? 0.65 : 1 }}>
      <div style={styles.examCardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={styles.examName}>{exam.name}</h3>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {exam.credits && <span className="badge badge-accent">{exam.credits} ECTS</span>}
            {exam.grade != null && (
              <span style={{ ...styles.gradeBadge, color: gradeColor, borderColor: gradeColor }}>
                {t('exams.gradeLabel')} {exam.grade.toFixed(1)} {exam.passed ? t('exams.passed') : t('exams.failed')}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...styles.daysCount, color: countdownColor }}>
            {past ? (exam.grade != null ? '' : t('exams.pastLabel')) : days === 0 ? t('exams.todayExclaim') : t('exams.daysShort', { days })}
          </div>
        </div>
      </div>

      <div style={styles.examMeta}>
        <MetaItem icon="📅" text={formatDate(exam.date, intlLocale)} />
        {exam.time && <MetaItem icon="🕐" text={`${exam.time}${t('common.timeSuffix')}`} />}
        {exam.room && <MetaItem icon="📍" text={exam.room} />}
      </div>

      {exam.notes && <p style={styles.examNotes}>{exam.notes}</p>}

      {!past && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={styles.progressLabel}>{t('exams.progressLabel')}</span>
            <span style={{ ...styles.progressLabel, color: countdownColor }}>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%`, background: countdownColor }} />
          </div>
        </div>
      )}

      <div style={styles.examActions}>
        <button className="btn btn-ghost btn-sm" onClick={onOpenLog} title={t('exams.studyLogTitle')}>
          <LogIcon /> {t('exams.studyLog')}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={past && exam.grade != null ? onRemoveGrade : onOpenGrade}
          title={exam.grade != null ? t('exams.gradeTitleChange') : t('exams.gradeTitleSet')}
          style={exam.grade != null ? { color: gradeColor } : {}}
        >
          <GradeIcon /> {exam.grade != null ? `${exam.grade.toFixed(1)}` : t('exams.grade')}
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(exam)}><EditIcon /> {t('exams.editShort')}</button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(exam.id)}><TrashIcon /></button>
      </div>
    </div>
  );
}

function StudyLogModal({ exam, onClose, intlLocale, t }) {
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], duration_min: '', topics: '' });
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    if (!exam) return;
    const result = await window.api.studyLogs.getByExam(exam.id);
    setLogs(result || []);
    setLoading(false);
  }, [exam]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const log = { id: generateId(), exam_id: exam.id, ...form, duration_min: parseInt(form.duration_min) || 0 };
    await window.api.studyLogs.create(log);
    setLogs(prev => [log, ...prev]);
    setForm({ date: new Date().toISOString().split('T')[0], duration_min: '', topics: '' });
  };

  const handleDelete = async (id) => {
    await window.api.studyLogs.delete(id);
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  if (!exam) return null;

  const totalMin = logs.reduce((sum, l) => sum + (l.duration_min || 0), 0);
  const totalHours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2>{t('exams.studyLog')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{exam.name}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><CloseIcon /></button>
        </div>

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
              <label className="form-label">{t('exams.logFieldDate')}</label>
              <input className="form-input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('exams.logFieldDuration')}</label>
              <input className="form-input" type="number" min="1" max="600" placeholder={t('exams.logPlaceholderDuration')} required
                value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('exams.logFieldTopics')}</label>
            <input className="form-input" placeholder={t('exams.logPlaceholderTopics')} required
              value={form.topics} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
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
                  style={{ color: 'var(--danger)', flexShrink: 0 }}><TrashIcon /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GradeModal({ exam, onSave, onClose, t }) {
  const [selectedGrade, setSelectedGrade] = useState(exam?.grade?.toFixed(1) || '');

  if (!exam) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div>
            <h2>{t('exams.gradeModalTitle')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{exam.name}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><CloseIcon /></button>
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
      </div>
    </div>
  );
}

function MetaItem({ icon, text }) {
  return <span style={styles.metaItem}>{icon} {text}</span>;
}

function EmptyState({ onAdd, t }) {
  return (
    <div className="empty-state">
      <span style={{ fontSize: 48 }}>📋</span>
      <p>{t('exams.emptyTitle')}</p>
      <button className="btn btn-primary" onClick={onAdd}>{t('exams.emptyCta')}</button>
    </div>
  );
}

// Icons
function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function CloseIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function EditIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>; }
function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>; }
function LogIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>; }
function GradeIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>; }

const styles = {
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  examGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 16 },
  examCard: { display: 'flex', flexDirection: 'column', gap: 0, transition: 'opacity var(--transition)' },
  examCardHeader: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  examName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 },
  daysCount: { fontSize: 20, fontWeight: 700 },
  gradeBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: '1px solid' },
  examMeta: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  metaItem: { fontSize: 12, color: 'var(--text-secondary)' },
  examNotes: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 8, fontStyle: 'italic' },
  progressLabel: { fontSize: 11, color: 'var(--text-muted)' },
  examActions: { display: 'flex', gap: 6, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', alignItems: 'center' },
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
