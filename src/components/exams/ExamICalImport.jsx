import React from 'react';
import { useLocale } from '../../context/LocaleContext';
import { CloseIcon } from '../icons/Icons';
import ExamICalImportForm from './ExamICalImportForm';
import AccessibleDialog from '../ui/AccessibleDialog';

export default function ExamICalImport({ existingExams, onImport, onClose }) {
  const { t } = useLocale();

  return (
    <AccessibleDialog onClose={onClose} labelledBy="exam-ical-title" className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2 id="exam-ical-title">{t('exams.icalImportTitle')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('exams.icalImportHint')}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>

        <ExamICalImportForm
          existingExams={existingExams}
          onImport={onImport}
          onClose={onClose}
        />
    </AccessibleDialog>
  );
}
