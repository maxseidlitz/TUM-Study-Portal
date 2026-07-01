import React from 'react';
import { useLocale } from '../../context/LocaleContext';
import { CloseIcon } from '../icons/Icons';
import ICalImportForm from './ICalImportForm';

export default function ICalImport({ onClose }) {
  const { t } = useLocale();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div>
            <h2>{t('ical.title')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('ical.subtitle')}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><CloseIcon /></button>
        </div>

        <ICalImportForm onClose={onClose} showSyncInfo />
      </div>
    </div>
  );
}
