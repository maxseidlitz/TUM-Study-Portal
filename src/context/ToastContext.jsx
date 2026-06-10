import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.showToast;
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div style={styles.container}>
      {toasts.map(t => (
        <div key={t.id} style={{ ...styles.toast, ...styles[t.type] }} onClick={() => onDismiss(t.id)}>
          <span style={styles.icon}>{ICONS[t.type]}</span>
          <span style={styles.message}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

const styles = {
  container: {
    position: 'fixed',
    top: 20,
    right: 20,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    boxShadow: 'var(--shadow-lg)',
    cursor: 'pointer',
    pointerEvents: 'all',
    maxWidth: 360,
    animation: 'slideInRight 0.2s ease',
    border: '1px solid transparent',
  },
  success: {
    background: 'var(--success)',
    color: '#fff',
  },
  error: {
    background: 'var(--danger)',
    color: '#fff',
  },
  warning: {
    background: 'var(--warning)',
    color: '#fff',
  },
  info: {
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
  },
  icon: {
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  message: {
    lineHeight: 1.4,
  },
};
