import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { sessionListLabel } from '../utils/chat';
import { useChatSessions } from '../hooks/useChatSessions';
import ChatMessage from '../components/chat/ChatMessage';
import ChatThinking from '../components/chat/ChatThinking';
import { SendIcon } from '../components/icons/Icons';
import AccessibleDialog from '../components/ui/AccessibleDialog';
import { useIsMobile } from '../hooks/useMediaQuery';

const SUGGESTION_KEYS = ['sug1', 'sug2', 'sug3', 'sug4'];
const SUGGESTION_ICONS = ['🎯', '📅', '⏱️', '✅'];

export default function Chat() {
  const { t, intlLocale } = useLocale();
  const {
    exams, lectures, todos, loading,
    activeAiChat, setActiveAiChat, sendAiMessage,
  } = useData();

  const [input, setInput] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const isMobile = useIsMobile();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const {
    sessions,
    activeSessionId,
    messages,
    persistReady,
    ipcStaleHint,
    hydrated,
    startNewChat,
    selectSession,
    deleteSession,
  } = useChatSessions({ activeAiChat, setActiveAiChat });

  const isThinking = activeAiChat.sessionId === activeSessionId && activeAiChat.thinking;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || isThinking) return;
    setInput('');
    try {
      await sendAiMessage(content, activeSessionId, messages);
    } finally {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleStartNewChat = async () => {
    await startNewChat();
    setInput('');
    inputRef.current?.focus();
  };

  const handleSelectSession = async (id) => {
    await selectSession(id);
    setSessionsOpen(false);
    setInput('');
    inputRef.current?.focus();
  };

  if (loading || !hydrated) {
    return <div className="loading">{t('chat.loading')}</div>;
  }

  const contextSummary = t('chat.contextSummary', {
    exams: exams.length,
    lectures: lectures.length,
    openTodos: todos.filter(td => !td.done).length,
  });

  const sessionPanel = (
    <>
      <div id="chat-sessions-title" style={styles.sessionAsideHead}>{t('chat.sessionsTitle')}</div>
      <button type="button" className="btn btn-secondary btn-sm" style={styles.newSessionBtn} onClick={handleStartNewChat}>
        {t('chat.newChat')}
      </button>
      <div style={styles.sessionList}>
        {sessions.map(s => (
          <div
            key={s.id}
            aria-current={s.id === activeSessionId ? 'true' : undefined}
            style={{
              ...styles.sessionItem,
              ...(s.id === activeSessionId ? styles.sessionItemActive : {}),
            }}
          >
            <button type="button" style={styles.sessionSelect} onClick={() => handleSelectSession(s.id)}>
              <span style={styles.sessionItemTitle}>{sessionListLabel(s, t, intlLocale)}</span>
              <span style={styles.sessionItemMeta}>
                {s.updatedAt
                  ? new Date(s.updatedAt).toLocaleString(intlLocale, { dateStyle: 'short', timeStyle: 'short' })
                  : ''}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm chat-session-delete"
              style={styles.sessionDelete}
              title={t('chat.deleteSession')}
              aria-label={`${t('chat.deleteSession')}: ${sessionListLabel(s, t, intlLocale)}`}
              onClick={ev => deleteSession(ev, s.id, t)}
            >
              {t('chat.deleteSession')}
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="chat-page" style={styles.root}>
      <div className="chat-main-row" style={styles.mainRow}>
        {persistReady && !isMobile && (
          <aside className="chat-session-aside" style={styles.sessionAside} aria-label={t('chat.sessionsTitle')}>
            {sessionPanel}
          </aside>
        )}
        {persistReady && isMobile && sessionsOpen && (
          <AccessibleDialog
            onClose={() => setSessionsOpen(false)}
            labelledBy="chat-sessions-title"
            className="chat-sessions-dialog"
          >
            {sessionPanel}
          </AccessibleDialog>
        )}

        <div className="chat-column" style={styles.chatColumn}>
          {ipcStaleHint && (
            <div
              className="card card-sm"
              style={{
                marginBottom: 12,
                borderColor: 'var(--warning)',
                background: 'var(--warning-subtle)',
                color: 'var(--text-primary)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {t('chat.ipcStaleMain')}
            </div>
          )}
          <div className="chat-header" style={styles.header}>
            <div>
              <h1 style={styles.title}>{t('chat.title')}</h1>
              <p style={styles.subtitle}>
                <span style={styles.contextDot} /> {t('chat.contextLabel')} {contextSummary}
              </p>
            </div>
            {persistReady && isMobile && (
              <button type="button" className="btn btn-secondary" onClick={() => setSessionsOpen(true)}>
                {t('chat.sessionsTitle')}
              </button>
            )}
            {!persistReady && messages.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleStartNewChat}>
                {t('chat.newChat')}
              </button>
            )}
          </div>

          <div className="chat-message-area" style={styles.messageArea} ref={scrollRef}>
            {messages.length === 0 ? (
              <div style={styles.empty}>
                <div style={styles.emptyIcon}>🤖</div>
                <h2 style={styles.emptyTitle}>{t('chat.emptyTitle')}</h2>
                <p style={styles.emptyText}>{t('chat.emptyText')}</p>
                <div className="chat-suggestions" style={styles.suggestions}>
                  {SUGGESTION_KEYS.map((key, i) => (
                    <button key={key} type="button" style={styles.suggestion} onClick={() => send(t(`chat.${key}`))}>
                      <span style={{ fontSize: 18 }}>{SUGGESTION_ICONS[i]}</span>
                      <span>{t(`chat.${key}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={styles.messages}>
                {messages.map((msg, i) => (
                  <ChatMessage key={i} msg={msg} />
                ))}
                {isThinking && <ChatThinking />}
              </div>
            )}
          </div>

          <div style={styles.composer}>
            <div className="chat-input-bar" style={styles.inputBar}>
              <textarea
                ref={inputRef}
                aria-label={t('chat.inputLabel')}
                className="chat-message-input"
                style={styles.input}
                placeholder={t('chat.placeholder')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                type="button"
                className="chat-send-button"
                aria-label={t('chat.send')}
                style={{
                  ...styles.sendBtn,
                  opacity: input.trim() && !isThinking ? 1 : 0.4,
                  cursor: input.trim() && !isThinking ? 'pointer' : 'default',
                }}
                onClick={() => send(input)}
                disabled={!input.trim() || isThinking}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  mainRow: { display: 'flex', flex: 1, gap: 14, minHeight: 0, alignItems: 'stretch' },
  sessionAside: {
    width: 220,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 10px 10px 0',
    borderRight: '1px solid var(--border-color)',
    minHeight: 0,
  },
  sessionAsideHead: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  newSessionBtn: { width: '100%', justifyContent: 'center' },
  sessionList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 },
  sessionItem: {
    position: 'relative',
    padding: '8px 8px 28px 8px',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color var(--transition), background var(--transition)',
  },
  sessionItemActive: {
    borderColor: 'var(--accent)',
    background: 'var(--accent-subtle)',
  },
  sessionSelect: {
    display: 'flex',
    width: '100%',
    minHeight: 44,
    flexDirection: 'column',
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  sessionItemTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-primary)',
    lineHeight: 1.35,
    wordBreak: 'break-word',
    paddingRight: 4,
  },
  sessionItemMeta: {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
  sessionDelete: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    fontSize: 10,
    padding: '2px 6px',
    minHeight: 0,
  },
  chatColumn: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 },
  title: { fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', fontWeight: 700, lineHeight: 1.2 },
  subtitle: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 4 },
  contextDot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' },
  messageArea: { flex: 1, overflowY: 'auto', minHeight: 0 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 20px' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 8 },
  emptyText: { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.6, marginBottom: 24 },
  suggestions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 560, width: '100%' },
  suggestion: {
    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
    padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-color)',
    background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
    fontSize: 12, fontFamily: 'var(--font-sans)', transition: 'all var(--transition)',
  },
  messages: { display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 },
  composer: { flexShrink: 0, marginTop: 12 },
  inputBar: {
    display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0,
    marginTop: 8, padding: 10, background: 'var(--bg-card)',
    border: '1px solid var(--border-color)', borderRadius: 14,
  },
  input: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13,
    resize: 'none', minHeight: 44, maxHeight: 120, lineHeight: 1.5, padding: '11px 8px',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 9, border: 'none',
    background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'opacity var(--transition)',
  },
};
