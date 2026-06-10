import React from 'react';

const fullStyles = {
  msgRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 30, height: 30, borderRadius: 8, background: 'var(--bg-tertiary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
  },
  bubble: {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
    borderBottomLeftRadius: 4, display: 'flex', gap: 4, padding: '14px 16px',
  },
};

const compactStyles = {
  msgRow: { display: 'flex', width: '100%' },
  bubble: {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
    borderBottomLeftRadius: 2, display: 'flex', gap: 4, padding: '8px 12px',
  },
};

export default function ChatThinking({ variant = 'full' }) {
  const styles = variant === 'compact' ? compactStyles : fullStyles;

  return (
    <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
      {variant === 'full' && <div style={fullStyles.avatar}>🤖</div>}
      <div style={styles.bubble}>
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
        <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}
