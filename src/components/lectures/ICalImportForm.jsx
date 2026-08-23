import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useData } from '../../context/DataContext';
import { useLocale } from '../../context/LocaleContext';
import { formatDate } from '../../utils/helpers';
import { groupImportedItemsToModules } from '../../utils/icalGrouping';
import { persistIcalItems, replaceIcalItems } from '../../utils/icalPersistence';
import { RefreshIcon, CheckIcon } from '../icons/Icons';

const COLORS_CYCLE = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316', '#6366F1'];

export default function ICalImportForm({
  embedded = false,
  onImportComplete,
  onClose,
  showSyncInfo = true,
}) {
  const { t, intlLocale } = useLocale();
  const {
    addLectures, lectures, deleteLecture, modules, addModule, deleteModule, refreshData,
  } = useData();

  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    api.settings.get().then((s) => {
      if (s?.icalUrl) { setUrl(s.icalUrl); setSavedUrl(s.icalUrl); }
      if (s?.icalLastSync) setLastSync(s.icalLastSync);
    }).catch(() => {});
  }, []);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    setPreview([]);

    const result = await api.ical.fetch(url.trim());
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

  const finishImport = async (result) => {
    setStatus('success');
    onImportComplete?.(result);
    if (onClose && !embedded) {
      setTimeout(onClose, 1500);
    }
  };

  const handleImport = async (selectedItems) => {
    const toImport = selectedItems.filter((i) => i._selected !== false).map(({ _selected, ...rest }) => rest);
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await persistIcalItems(toImport, { addModule, addLectures });
      const now = new Date().toISOString();
      await api.settings.save({ icalUrl: url.trim(), icalLastSync: now });
      setSavedUrl(url.trim());
      setLastSync(now);
      await finishImport(result);
    } catch (error) {
      setStatus('error');
      setErrorMsg(t('ical.importFailed', { error: error.message || t('common.unknownError') }));
    }
  };

  const handleRefresh = async () => {
    if (!savedUrl) return;
    setUrl(savedUrl);
    setStatus('loading');
    setErrorMsg('');

    const result = await api.ical.fetch(savedUrl);
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

    const withColors = items.map((l, idx) => ({
      ...l,
      color: COLORS_CYCLE[idx % COLORS_CYCLE.length],
    }));

    try {
      const importResult = await replaceIcalItems({
        importedLectures: lectures.filter(lecture => lecture.imported),
        importedModules: modules.filter(module => module.source === 'ical'),
        nextItems: withColors,
        deleteLecture,
        deleteModule,
        addModule,
        addLectures,
        atomicReplace: api.runtime === 'browser' ? api.ical.replace : undefined,
      });
      if (api.runtime === 'browser') await refreshData();
      const now = new Date().toISOString();
      await api.settings.save({ icalLastSync: now });
      setLastSync(now);
      await finishImport(importResult);
    } catch (error) {
      setStatus('error');
      setErrorMsg(t('ical.replaceFailed', { error: error.message || t('common.unknownError') }));
    }
  };

  return (
    <div>
      {showSyncInfo && lastSync && (
        <div style={styles.syncInfo}>
          <span>{t('ical.lastSync', { datetime: new Date(lastSync).toLocaleString(intlLocale) })}</span>
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={status === 'loading'}>
            <RefreshIcon /> {t('ical.refresh')}
          </button>
        </div>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="lecture-ical-url">{t('ical.urlLabel')}</label>
        <div className="ical-input-row" style={{ display: 'flex', gap: 10 }}>
          <input
            id="lecture-ical-url"
            className="form-input"
            placeholder={t('ical.urlPlaceholder')}
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus('idle'); }}
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
        <p style={styles.hint}>{t('ical.hint')}</p>
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
        <ImportPreview
          items={preview}
          onImport={handleImport}
          onCancel={() => setStatus('idle')}
          t={t}
          intlLocale={intlLocale}
          embedded={embedded}
        />
      )}
    </div>
  );
}

function ImportPreview({ items, onImport, onCancel, t, intlLocale, embedded }) {
  const [selected, setSelected] = useState(items.map((i) => ({ ...i, _selected: true })));

  const toggle = (idx) => {
    setSelected((prev) => prev.map((item, i) => (i === idx ? { ...item, _selected: !item._selected } : item)));
  };

  const toggleAll = () => {
    const allSelected = selected.every((i) => i._selected);
    setSelected((prev) => prev.map((item) => ({ ...item, _selected: !allSelected })));
  };

  const selectedCount = selected.filter((i) => i._selected).length;
  const grouped = groupImportedItemsToModules(
    selected.filter((i) => i._selected).map(({ _selected, ...rest }) => rest),
  );

  const footerClass = embedded ? 'wizard-footer' : 'modal-footer';

  return (
    <>
      <div className="divider" />
      <div className="ical-preview-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {items.length === 1 ? t('ical.previewCountOne') : t('ical.previewCountMany', { count: items.length })}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
          {selected.every((i) => i._selected) ? t('ical.deselectAll') : t('ical.selectAll')}
        </button>
      </div>

      <div style={styles.previewList}>
        {selected.map((item, idx) => (
          <button
            type="button"
            key={item.icalUid || `${item.eventDate}-${item.time}-${idx}`}
            onClick={() => toggle(idx)}
            aria-pressed={item._selected}
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
          </button>
        ))}
      </div>

      {selectedCount > 0 && (
        <div style={styles.groupSummary}>
          {t('ical.groupSummary', { modules: grouped.modules.length, lectures: grouped.lectures.length })}
        </div>
      )}

      <div className={footerClass}>
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
    width: '100%', textAlign: 'left', color: 'inherit', border: 'none',
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
  groupSummary: {
    fontSize: 12, color: 'var(--accent-hover)', background: 'var(--accent-subtle)',
    border: '1px solid var(--accent-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 4,
  },
};
