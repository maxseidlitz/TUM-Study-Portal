import React from 'react';
import { CloseIcon } from '../icons/Icons';
import AccessibleDialog from '../ui/AccessibleDialog';

export default function ExamFormModal({
  editing,
  form,
  setForm,
  onSubmit,
  onClose,
  t,
}) {
  return (
    <AccessibleDialog onClose={onClose} labelledBy="exam-form-title" className="modal">
        <div className="modal-header">
          <h2 id="exam-form-title">{editing ? t('exams.modalEdit') : t('exams.modalNew')}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>
        <form onSubmit={onSubmit}>
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
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary">{editing ? t('common.save') : t('common.add')}</button>
          </div>
        </form>
    </AccessibleDialog>
  );
}
