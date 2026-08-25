import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import ChatMessage from './chat/ChatMessage';
import ChatThinking from './chat/ChatThinking';
import { SendIcon } from './icons/Icons';

export default function ChatContinuity({ activePage }) {
  const { activeAiChat, setActiveAiChat, sendAiMessage } = useData();
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeAiChat.messages, activeAiChat.thinking, isOpen]);

  if (activePage === 'chat' || !activeAiChat.sessionId) return null;

  const hasConversation = activeAiChat.messages.length > 0;
  const shouldShow = hasConversation || activeAiChat.thinking || activeAiChat.hasUnread || isOpen;
  if (!shouldShow) return null;

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (activeAiChat.hasUnread) {
      setActiveAiChat(prev => ({ ...prev, hasUnread: false }));
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || activeAiChat.thinking) return;
    await sendAiMessage(text, activeAiChat.sessionId, activeAiChat.messages);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-continuity" style={styles.container}>
      {isOpen && (
        <div className="chat-continuity-popup" style={styles.popup}>
          <div style={styles.popupHeader}>
            <span>{t('chat.title')}</span>
            <button type="button" onClick={toggleOpen} style={styles.closeBtn} aria-label={t('chat.closeFloating')}>×</button>
          </div>
          <div style={styles.messageArea} ref={scrollRef}>
            {activeAiChat.messages.map((msg, i) => (
              <ChatMessage key={i} msg={msg} variant="compact" showAvatar={false} />
            ))}
            {activeAiChat.thinking && <ChatThinking variant="compact" />}
          </div>
          <div className="chat-continuity-input-bar" style={styles.inputBar}>
            <input
              ref={inputRef}
              className="chat-continuity-input"
              aria-label={t('chat.inputLabel')}
              style={styles.input}
              placeholder={t('chat.placeholder')}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="chat-send-button"
              aria-label={t('chat.send')}
              style={{
                ...styles.sendBtn,
                opacity: input.trim() && !activeAiChat.thinking ? 1 : 0.4,
                cursor: input.trim() && !activeAiChat.thinking ? 'pointer' : 'default',
              }}
              onClick={handleSend}
              disabled={!input.trim() || activeAiChat.thinking}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        aria-label={isOpen ? t('chat.minimizeFloating') : t('chat.openFloating')}
        style={{
          ...styles.fab,
          ...(activeAiChat.thinking ? styles.fabThinking : {}),
        }}
      >
        {activeAiChat.thinking ? (
          <div className="spinner-small" />
        ) : (
          <span style={{ fontSize: 20 }}>🤖</span>
        )}
        {activeAiChat.hasUnread && !isOpen && <div style={styles.unreadDot} />}
      </button>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'var(--accent)',
    border: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    transition: 'transform 0.2s',
  },
  fabThinking: {
    animation: 'pulse-accent 2s infinite',
  },
  unreadDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: 'var(--danger)',
    border: '2px solid var(--accent)',
  },
  popup: {
    width: 'min(320px, calc(100vw - 32px))',
    height: 400,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  popupHeader: {
    padding: '10px 14px',
    background: 'var(--bg-tertiary)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 600,
  },
  closeBtn: {
    width: 44,
    height: 44,
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 20,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  messageArea: {
    flex: 1,
    padding: 12,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTop: '1px solid var(--border-color)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '11px 10px',
    fontSize: 16,
    color: 'var(--text-primary)',
    outline: 'none',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 9,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
};
