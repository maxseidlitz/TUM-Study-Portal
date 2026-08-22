import React from 'react';
import { useLocale } from '../../context/LocaleContext';
import { CloseIcon } from '../icons/Icons';
import ExamICalImportForm from './ExamICalImportForm';

export default function ExamICalImport({ existingExams, onImport, onClose }) {
  const { t } = useLocale();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2>{t('exams.icalImportTitle')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('exams.icalImportHint')}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><CloseIcon /></button>
        </div>

        <ExamICalImportForm
          existingExams={existingExams}
          onImport={onImport}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
