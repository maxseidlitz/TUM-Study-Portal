import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { formatDate } from '../utils/helpers';

const COLORS_CYCLE = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316', '#6366F1'];

export default function ICalImport({ onClose }) {
  const { t, intlLocale } = useLocale();
  const { addLectures, lectures, deleteLecture } = useData();
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | preview | error | success
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    window.api.settings.get().then(s => {
      if (s?.icalUrl) { setUrl(s.icalUrl); setSavedUrl(s.icalUrl); }
      if (s?.icalLastSync) setLastSync(s.icalLastSync);
    });
  }, []);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    setPreview([]);

    const result = await window.api.ical.fetch(url.trim());
    if (!result.success) {
      setStatus('error');
      setErrorMsg(result.error || t('ical.errUnknown'));
      return;
    }

    const items = result.items || [];
    if (items.length === 0) {
      setStatus('error');
      setErrorMsg(result.eventCount ? t('ical.errNoEventsInRange', { count: result.eventCount }) : t('ical.errNoEvents'));
      return;
    }

    const withColors = items.map((l, idx) => ({
      ...l,
      color: COLORS_CYCLE[idx % COLORS_CYCLE.length],
    }));

    setPreview(withColors);
    setStatus('preview');
  };

  const handleImport = async (selectedItems) => {
    const toImport = selectedItems.filter(i => i._selected !== false);
    await addLectures(toImport.map(({ _selected, ...rest }) => rest));

    const now = new Date().toISOString();
    await window.api.settings.save({ icalUrl: url.trim(), icalLastSync: now });
    setSavedUrl(url.trim());
    setLastSync(now);

    setStatus('success');
    setTimeout(onClose, 1500);
  };

  const handleRefresh = async () => {
    if (!savedUrl) return;
    setUrl(savedUrl);
    setStatus('loading');
    setErrorMsg('');

    const result = await window.api.ical.fetch(savedUrl);
    if (!result.success) {
      setStatus('error');
      setErrorMsg(result.error || t('common.unknownError'));
      return;
    }

    const items = result.items || [];
    if (items.length === 0) {
      setStatus('error');
      setErrorMsg(result.eventCount
        ? t('ical.errNoEventsInRangeShort', { count: result.eventCount })
        : t('ical.errNoEventsShort'));
      return;
    }

    const existingImported = lectures.filter(l => l.imported);
    for (const l of existingImported) await deleteLecture(l.id);

    const withIds = items.map((l, idx) => ({
      ...l,
      color: COLORS_CYCLE[idx % COLORS_CYCLE.length],
    }));
    await addLectures(withIds);

    const now = new Date().toISOString();
    await window.api.settings.save({ icalLastSync: now });
    setLastSync(now);
    setStatus('success');
    setTimeout(onClose, 1500);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
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

        {lastSync && (
          <div style={styles.syncInfo}>
            <span>{t('ical.lastSync', { datetime: new Date(lastSync).toLocaleString(intlLocale) })}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={status === 'loading'}>
              <RefreshIcon /> {t('ical.refresh')}
            </button>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{t('ical.urlLabel')}</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="form-input"
              placeholder={t('ical.urlPlaceholder')}
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
              {status === 'loading' ? t('ical.fetching') : t('ical.fetch')}
            </button>
          </div>
          <p style={styles.hint}>
            {t('ical.hint')}
          </p>
        </div>

        {status === 'error' && (
          <div style={styles.errorBox}>
            <span>⚠ {errorMsg}</span>
          </div>
        )}

        {status === 'success' && (
          <div style={styles.successBox}>
            <span>{t('ical.success')}</span>
          </div>
        )}

        {status === 'preview' && (
          <ImportPreview items={preview} onImport={handleImport} onCancel={() => setStatus('idle')} t={t} intlLocale={intlLocale} />
        )}
      </div>
    </div>
  );
}

function ImportPreview({ items, onImport, onCancel, t, intlLocale }) {
  const [selected, setSelected] = useState(items.map(i => ({ ...i, _selected: true })));

  const toggle = (idx) => {
    setSelected(prev => prev.map((item, i) => (i === idx ? { ...item, _selected: !item._selected } : item)));
  };

  const toggleAll = () => {
    const allSelected = selected.every(i => i._selected);
    setSelected(prev => prev.map(item => ({ ...item, _selected: !allSelected })));
  };

  const selectedCount = selected.filter(i => i._selected).length;

  return (
    <>
      <div className="divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {items.length === 1 ? t('ical.previewCountOne') : t('ical.previewCountMany', { count: items.length })}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
          {selected.every(i => i._selected) ? t('ical.deselectAll') : t('ical.selectAll')}
        </button>
      </div>

      <div style={styles.previewList}>
        {selected.map((item, idx) => (
          <div
            key={item.icalUid || `${item.eventDate}-${item.time}-${idx}`}
            onClick={() => toggle(idx)}
            style={{
              ...styles.previewItem,
              opacity: item._selected ? 1 : 0.45,
              borderLeft: `4px solid ${item.color || 'var(--accent)'}`,
            }}
          >
            <div style={styles.previewCheck}>
              {item._selected ? <CheckIcon /> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.previewName}>{item.name}</div>
              <div style={styles.previewMeta}>
                {item.eventDate && (
                  <span style={{ fontWeight: 600 }}>{formatDate(item.eventDate, intlLocale)}</span>
                )}
                {item.allDay ? (
                  <span>{t('lectures.allDay')}</span>
                ) : item.time ? (
                  <span>{item.time}{item.end_time ? `–${item.end_time}` : ''}</span>
                ) : null}
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
          {selectedCount === 1 ? t('ical.importOne') : t('ical.importMany', { count: selectedCount })}
        </button>
      </div>
    </>
  );
}

function CloseIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function RefreshIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>; }
function CheckIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>; }

const styles = {
  syncInfo: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 16,
    fontSize: 12, color: 'var(--text-muted)',
  },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 5 },
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
};
