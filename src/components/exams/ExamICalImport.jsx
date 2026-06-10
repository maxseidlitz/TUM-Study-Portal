import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { formatDate } from '../../utils/helpers';
import { CloseIcon, CheckIcon } from '../icons/Icons';

export default function ExamICalImport({ existingExams, onImport, onClose }) {
  const { t, intlLocale } = useLocale();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | preview | error | success
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState([]);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    setPreview([]);

    const result = await window.api.ical.fetch(url.trim());
    if (!result.success) {
      setStatus('error');
      setErrorMsg(result.error || t('common.unknownError'));
      return;
    }

    const items = result.items || [];
    if (items.length === 0) {
      setStatus('error');
      setErrorMsg(t('exams.icalNoEvents'));
      return;
    }

    const dupSet = new Set(
      existingExams.map(e => `${(e.name || '').toLowerCase()}|${e.date || ''}`)
    );

    const candidates = items.map((item) => {
      const date = item.eventDate || '';
      const isDup = dupSet.has(`${(item.name || '').toLowerCase()}|${date}`);
      return {
        name: item.name || '',
        date,
        time: item.time || '',
        room: item.room || '',
        _selected: !isDup,
        _duplicate: isDup,
      };
    });

    setPreview(candidates);
    setStatus('preview');
  };

  const handleImport = async (selected) => {
    const toImport = selected
      .filter(i => i._selected)
      .map(({ _selected, _duplicate, ...rest }) => rest);
    await onImport(toImport);
    setStatus('success');
    setTimeout(onClose, 1200);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
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

        <div className="form-group">
          <label className="form-label">{t('exams.icalUrlLabel')}</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="form-input"
              placeholder="https://campus.tum.de/tumonline/...ics"
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus('idle'); }}
              disabled={status === 'loading'}
            />
            <button
              className="btn btn-primary"
              onClick={handleFetch}
              disabled={!url.trim() || status === 'loading'}
              style={{ flexShrink: 0 }}
            >
              {status === 'loading' ? t('exams.icalFetching') : t('exams.icalFetch')}
            </button>
          </div>
        </div>

        {status === 'error' && (
          <div style={styles.errorBox}>⚠ {errorMsg}</div>
        )}

        {status === 'success' && (
          <div style={styles.successBox}>{t('exams.icalSuccess')}</div>
        )}

        {status === 'preview' && (
          <ImportPreview
            items={preview}
            onImport={handleImport}
            onCancel={() => setStatus('idle')}
            t={t}
            intlLocale={intlLocale}
          />
        )}
      </div>
    </div>
  );
}

function ImportPreview({ items, onImport, onCancel, t, intlLocale }) {
  const [selected, setSelected] = useState(items);

  const toggle = (idx) => {
    setSelected(prev => prev.map((item, i) => i === idx ? { ...item, _selected: !item._selected } : item));
  };

  const toggleAll = () => {
    const allSelected = selected.every(i => i._selected);
    setSelected(prev => prev.map(item => ({ ...item, _selected: !allSelected })));
  };

  const selectedCount = selected.filter(i => i._selected).length;

  return (
    <>
      <div className="divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {items.length === 1 ? t('exams.icalPreviewOne') : t('exams.icalPreviewMany', { count: items.length })}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
          {selected.every(i => i._selected) ? t('ical.deselectAll') : t('ical.selectAll')}
        </button>
      </div>

      <div style={styles.previewList}>
        {selected.map((item, idx) => (
          <div
            key={`${item.date}-${item.name}-${idx}`}
            onClick={() => toggle(idx)}
            style={{
              ...styles.previewItem,
              opacity: item._selected ? 1 : 0.4,
            }}
          >
            <div style={styles.previewCheck}>
              {item._selected ? <CheckIcon /> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={styles.previewName}>{item.name}</span>
                {item._duplicate && (
                  <span style={styles.dupBadge}>{t('exams.icalDuplicate')}</span>
                )}
              </div>
              <div style={styles.previewMeta}>
                {item.date && <span style={{ fontWeight: 600 }}>{formatDate(item.date, intlLocale)}</span>}
                {item.time && <span>{item.time}</span>}
                {item.room && <span>📍 {item.room}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel}>{t('common.cancel')}</button>
        <button
          className="btn btn-primary"
          disabled={selectedCount === 0}
          onClick={() => onImport(selected)}
        >
          {selectedCount === 1 ? t('exams.icalImportOne') : t('exams.icalImportMany', { count: selectedCount })}
        </button>
      </div>
    </>
  );
}

const styles = {
  errorBox: {
    padding: '10px 14px', background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
    borderRadius: 8, fontSize: 12, color: 'var(--danger)', marginBottom: 12,
  },
  successBox: {
    padding: '10px 14px', background: 'var(--success-subtle)', border: '1px solid var(--success)',
    borderRadius: 8, fontSize: 12, color: 'var(--success)', marginBottom: 12,
  },
  previewList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', marginBottom: 8 },
  previewItem: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 12px', borderRadius: 8, background: 'var(--bg-tertiary)',
    cursor: 'pointer', transition: 'opacity var(--transition)',
    borderLeft: '4px solid var(--accent)',
  },
  previewCheck: {
    width: 18, height: 18, borderRadius: 4, border: '2px solid var(--border-color)',
    background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  previewName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
  previewMeta: { display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  dupBadge: {
    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
    background: 'var(--warning-subtle)', color: 'var(--warning)', border: '1px solid var(--warning)',
  },
};
