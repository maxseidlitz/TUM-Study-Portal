import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { api } from '../../api';

export default function MensaWidget() {
  const { t } = useLocale();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canteenId, setCanteenId] = useState('422');

  const fetchMeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const settings = await api.settings.get();
      const mid = settings.preferredMensaId || '422';
      setCanteenId(mid);

      const result = await api.mensa.fetch(mid);
      
      if (result.success) {
        setMeals(result.meals || []);
      } else {
        // Wenn 404, dann ist wahrscheinlich geschlossen
        if (result.error && result.error.includes('404')) {
          setMeals([]);
        } else {
          throw new Error(result.error);
        }
      }
    } catch (err) {
      console.error('Mensa fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  const canteenNames = {
    '422': 'Mensa Garching',
    '421': 'Mensa Arcisstraße',
    '423': 'Mensa Weihenstephan',
    '530': 'Mensa Heilbronn'
  };

  return (
    <div className="card" style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <span style={{ fontSize: 18 }}>🍕</span>
          <span style={styles.title}>{canteenNames[canteenId] || 'Mensa'}</span>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={fetchMeals} title={t('common.refresh')} aria-label={t('common.refresh')}>
          <RefreshIcon size={14} />
        </button>
      </div>

      <div style={styles.content}>
        {loading ? (
          <div style={styles.stateMsg}>{t('common.loadingShort') || 'Lade...'}</div>
        ) : error ? (
          <div style={{ ...styles.stateMsg, color: 'var(--danger)' }}>
            {t('dashboard.mensaError') || 'Fehler beim Laden.'}
          </div>
        ) : meals.length === 0 ? (
          <div style={styles.stateMsg}>
            {t('dashboard.mensaClosed') || 'Heute kein Speiseplan verfügbar (geschlossen).'}
          </div>
        ) : (
          <div style={styles.mealList}>
            {meals.slice(0, 4).map((meal, idx) => (
              <div key={idx} style={styles.mealItem}>
                <div style={styles.mealName}>{meal.name}</div>
                <div style={styles.mealMeta}>
                  <span style={styles.category}>{meal.category}</span>
                  {meal.prices?.students && (
                    <span style={styles.price}>{meal.prices.students.toFixed(2)}€</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

const styles = {
  card: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  content: { minHeight: 60 },
  stateMsg: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' },
  mealList: { display: 'flex', flexDirection: 'column', gap: 10 },
  mealItem: { borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 },
  mealName: { fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 },
  mealMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' },
  price: { fontSize: 11, fontWeight: 600, color: 'var(--accent-hover)' },
};
