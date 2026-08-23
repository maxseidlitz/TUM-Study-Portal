import React from 'react';
import { useLocale } from '../../context/LocaleContext';
import { CloseIcon } from '../icons/Icons';
import ICalImportForm from './ICalImportForm';
import AccessibleDialog from '../ui/AccessibleDialog';

export default function ICalImport({ onClose }) {
  const { t } = useLocale();

  return (
    <AccessibleDialog onClose={onClose} labelledBy="ical-import-title" className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div>
            <h2 id="ical-import-title">{t('ical.title')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('ical.subtitle')}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}><CloseIcon /></button>
        </div>

        <ICalImportForm onClose={onClose} showSyncInfo />
    </AccessibleDialog>
  );
}
