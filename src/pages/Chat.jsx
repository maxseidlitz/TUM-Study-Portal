import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { generateId } from '../utils/helpers';

const markdownComponents = {
  a({ href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="chat-md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

const SUGGESTION_KEYS = ['sug1', 'sug2', 'sug3', 'sug4'];
const SUGGESTION_ICONS = ['🎯', '📅', '⏱️', '✅'];
const CHAT_API_HISTORY_MAX = 48;

function deriveSessionTitle(msgs) {
  const first = msgs.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim());
  if (!first) return '';
  return first.content.trim().split('\n')[0].slice(0, 72);
}

/** Anzeigename: Startzeitpunkt der Session (Datum + Uhrzeit kurz, z. B. HH:MM). */
function formatSessionStartLabel(startedAt, intlLocale) {
  if (!startedAt) return '';
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(intlLocale, { dateStyle: 'short', timeStyle: 'short' });
}

function sessionListLabel(s, t, intlLocale) {
  const fromStart = formatSessionStartLabel(s.startedAt, intlLocale);
  if (fromStart) return fromStart;
  const fromMsgs = deriveSessionTitle(s.messages || []);
  if (fromMsgs) return fromMsgs;
  if (typeof s.title === 'string' && s.title.trim()) return s.title.trim();
  return t('chat.sessionUntitled');
}

function messagesForApi(msgs) {
  return msgs
    .filter(
      m => m.role === 'user'
        || (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()),
    )
    .slice(-CHAT_API_HISTORY_MAX)
    .map(({ role, content }) => ({ role, content }));
}

export default function Chat() {
  const chatsPreload = typeof window !== 'undefined' && typeof window.api?.chats?.getAll === 'function';
  const { t, intlLocale, locale } = useLocale();
  const { exams, lectures, todos, modules, loading, refreshData } = useData();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [persistReady, setPersistReady] = useState(false);
  const [ipcStaleHint, setIpcStaleHint] = useState(false);
  const [hydrated, setHydrated] = useState(!chatsPreload);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const saveDebounceRef = useRef(null);

  const buildContext = useCallback(() => ({
    exams,
    lectures,
    todos,
    modules,
    locale,
    today: new Date().toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  }), [exams, lectures, todos, modules, intlLocale, locale]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (!chatsPreload) {
      setHydrated(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [list, settings] = await Promise.all([
          window.api.chats.getAll(),
          window.api.settings.get(),
        ]);
        if (cancelled) return;
        setPersistReady(true);
        setIpcStaleHint(false);
        const sessionsList = Array.isArray(list) ? list : [];
        const lastId = settings?.lastActiveChatId;
        let pick = lastId && sessionsList.find(s => s.id === lastId);
        if (!pick && sessionsList.length) {
          [pick] = sessionsList;
        }
        if (!pick) {
          const nid = generateId();
          const now = new Date().toISOString();
          const row = { id: nid, title: '', startedAt: now, updatedAt: now, messages: [] };
          await window.api.chats.save(row);
          await window.api.settings.save({ ...settings, lastActiveChatId: nid });
          if (cancelled) return;
          setSessions([row, ...sessionsList]);
          setActiveSessionId(nid);
          setMessages([]);
        } else {
          setSessions(sessionsList);
          setActiveSessionId(pick.id);
          setMessages(Array.isArray(pick.messages) ? pick.messages : []);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setPersistReady(false);
          setSessions([]);
          setActiveSessionId('');
          setMessages([]);
          const msg = String(e?.message || e || '');
          if (msg.includes('No handler registered')) {
            setIpcStaleHint(true);
          }
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [chatsPreload]);

  const flushSaveCurrentSession = useCallback(async () => {
    if (!persistReady || !activeSessionId) return;
    const updatedAt = new Date().toISOString();
    const existing = sessions.find(s => s.id === activeSessionId);
    const startedAt =
      existing && typeof existing.startedAt === 'string' && existing.startedAt.trim()
        ? existing.startedAt.trim()
        : null;
    const payload = {
      id: activeSessionId,
      title: '',
      updatedAt,
      messages,
    };
    if (startedAt) payload.startedAt = startedAt;
    await window.api.chats.save(payload);
    setSessions(prev => {
      const other = prev.filter(s => s.id !== activeSessionId);
      const row = {
        id: activeSessionId,
        title: '',
        updatedAt,
        messages,
        ...(startedAt ? { startedAt } : {}),
      };
      return [row, ...other].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    });
  }, [persistReady, activeSessionId, messages, sessions]);

  useEffect(() => {
    if (!persistReady || !hydrated || !activeSessionId) return undefined;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      flushSaveCurrentSession().catch(err => console.error(err));
    }, 500);
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [messages, persistReady, hydrated, activeSessionId, flushSaveCurrentSession]);

  const startNewChat = useCallback(async () => {
    if (thinking) return;
    if (persistReady) {
      await flushSaveCurrentSession();
      const nid = generateId();
      const now = new Date().toISOString();
      const row = { id: nid, title: '', startedAt: now, updatedAt: now, messages: [] };
      const st = await window.api.settings.get();
      await window.api.chats.save(row);
      await window.api.settings.save({ ...st, lastActiveChatId: nid });
      setSessions(prev => [row, ...prev.filter(s => s.id !== nid)]);
      setActiveSessionId(nid);
      setMessages([]);
    } else {
      setMessages([]);
    }
    setInput('');
    inputRef.current?.focus();
  }, [thinking, persistReady, flushSaveCurrentSession]);

  const selectSession = useCallback(async (id) => {
    if (id === activeSessionId || thinking) return;
    if (persistReady) {
      await flushSaveCurrentSession();
      const s = sessions.find(x => x.id === id);
      if (!s) return;
      const st = await window.api.settings.get();
      await window.api.settings.save({ ...st, lastActiveChatId: id });
      setActiveSessionId(id);
      setMessages(Array.isArray(s.messages) ? [...s.messages] : []);
    }
    setInput('');
    inputRef.current?.focus();
  }, [activeSessionId, thinking, persistReady, flushSaveCurrentSession, sessions]);

  const deleteSession = useCallback(async (ev, id) => {
    ev.stopPropagation();
    if (!persistReady || !window.confirm(t('chat.deleteSessionConfirm'))) return;
    try {
      await window.api.chats.delete(id);
      const nextList = await window.api.chats.getAll();
      setSessions(nextList);
      if (activeSessionId !== id) return;
      if (nextList.length) {
        const next = nextList[0];
        const st = await window.api.settings.get();
        await window.api.settings.save({ ...st, lastActiveChatId: next.id });
        setActiveSessionId(next.id);
        setMessages(Array.isArray(next.messages) ? [...next.messages] : []);
      } else {
        const nid = generateId();
        const now = new Date().toISOString();
        const row = { id: nid, title: '', startedAt: now, updatedAt: now, messages: [] };
        const st = await window.api.settings.get();
        await window.api.chats.save(row);
        await window.api.settings.save({ ...st, lastActiveChatId: nid });
        setSessions([row]);
        setActiveSessionId(nid);
        setMessages([]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [persistReady, t, activeSessionId]);

  const send = useCallback(async (text) => {
    const content = text.trim();
    if (!content || thinking) return;

    const userMsg = { role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setThinking(true);

    if (!window.api?.ai?.chat) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('chat.onlyElectron'),
        error: true,
      }]);
      setThinking(false);
      return;
    }

    try {
      const result = await window.api.ai.chat({
        messages: messagesForApi(history),
        context: buildContext(),
      });

      const todoActions = Array.isArray(result.todoActions) ? result.todoActions : [];
      const replyText = typeof result.content === 'string' ? result.content.trim() : '';
      if (result.success && (replyText || todoActions.length > 0)) {
        if (replyText) {
          setMessages(prev => [...prev, { role: 'assistant', content: replyText }]);
        } else if (todoActions.length > 0) {
          setMessages(prev => [...prev, { role: 'assistant', variant: 'todo_saved', todoActions }]);
        }
        if (todoActions.length > 0) {
          await refreshData();
        } else {
          void refreshData();
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          error: true,
          errorKind: 'failed',
          errorDetail: result.error || '',
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        error: true,
        errorKind: 'exception',
        errorDetail: e.message,
      }]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }, [messages, thinking, buildContext, refreshData, t]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  if (loading || !hydrated) {
    return <div className="loading">{t('chat.loading')}</div>;
  }

  const contextSummary = t('chat.contextSummary', {
    exams: exams.length,
    lectures: lectures.length,
    openTodos: todos.filter(td => !td.done).length,
  });

  return (
    <div style={styles.root}>
      <div style={styles.mainRow}>
        {persistReady && (
          <aside style={styles.sessionAside} aria-label={t('chat.sessionsTitle')}>
            <div style={styles.sessionAsideHead}>{t('chat.sessionsTitle')}</div>
            <button type="button" className="btn btn-secondary btn-sm" style={styles.newSessionBtn} onClick={() => startNewChat()}>
              {t('chat.newChat')}
            </button>
            <div style={styles.sessionList}>
              {sessions.map(s => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectSession(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectSession(s.id);
                    }
                  }}
                  style={{
                    ...styles.sessionItem,
                    ...(s.id === activeSessionId ? styles.sessionItemActive : {}),
                  }}
                >
                  <div style={styles.sessionItemTitle}>{sessionListLabel(s, t, intlLocale)}</div>
                  <div style={styles.sessionItemMeta}>
                    {s.updatedAt
                      ? new Date(s.updatedAt).toLocaleString(intlLocale, { dateStyle: 'short', timeStyle: 'short' })
                      : ''}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={styles.sessionDelete}
                    title={t('chat.deleteSession')}
                    onClick={ev => deleteSession(ev, s.id)}
                  >
                    {t('chat.deleteSession')}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div style={styles.chatColumn}>
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
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>{t('chat.title')}</h1>
              <p style={styles.subtitle}>
                <span style={styles.contextDot} /> {t('chat.contextLabel')} {contextSummary}
              </p>
            </div>
            {!persistReady && messages.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => startNewChat()}>
                {t('chat.newChat')}
              </button>
            )}
          </div>

          <div style={styles.messageArea} ref={scrollRef}>
            {messages.length === 0 ? (
              <div style={styles.empty}>
                <div style={styles.emptyIcon}>🤖</div>
                <h2 style={styles.emptyTitle}>{t('chat.emptyTitle')}</h2>
                <p style={styles.emptyText}>
                  {t('chat.emptyText')}
                </p>
                <div style={styles.suggestions}>
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
                  <Message key={i} msg={msg} />
                ))}
                {thinking && <ThinkingBubble />}
              </div>
            )}
          </div>

          <div style={styles.inputBar}>
            <textarea
              ref={inputRef}
              style={styles.input}
              placeholder={t('chat.placeholder')}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              type="button"
              style={{
                ...styles.sendBtn,
                opacity: input.trim() && !thinking ? 1 : 0.4,
                cursor: input.trim() && !thinking ? 'pointer' : 'default',
              }}
              onClick={() => send(input)}
              disabled={!input.trim() || thinking}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ msg }) {
  const { t } = useLocale();
  const isUser = msg.role === 'user';

  let displayPlain = isUser;
  let displayContent = typeof msg.content === 'string' ? msg.content : '';

  if (!isUser && msg.variant === 'todo_saved' && Array.isArray(msg.todoActions)) {
    displayPlain = true;
    const lines = msg.todoActions.map(
      (a) => t('chat.todoLine', { title: a.title, priority: t(`priority.${a.priority || 'medium'}`) }),
    );
    displayContent = msg.todoActions.length === 1
      ? `${t('chat.todoSavedOne')}\n${lines.join('\n')}`
      : `${t('chat.todoSavedMany')}\n${lines.join('\n')}`;
  } else if (!isUser && msg.error && msg.errorKind) {
    displayPlain = true;
    if (msg.errorKind === 'failed') {
      displayContent = t('chat.errorFailed', { error: msg.errorDetail || t('common.unknownError') });
    } else {
      displayContent = t('chat.errorPrefix', { message: msg.errorDetail || '' });
    }
  } else if (!isUser && msg.error) {
    displayPlain = true;
    displayContent = typeof msg.content === 'string' ? msg.content : '';
  } else if (!isUser) {
    displayPlain = false;
    displayContent = typeof msg.content === 'string' ? msg.content : '';
  }

  return (
    <div style={{ ...styles.msgRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && (
        <div style={styles.avatar}>{msg.error ? '⚠️' : '🤖'}</div>
      )}
      <div
        style={{
          ...styles.bubble,
          ...(displayPlain ? styles.bubblePlain : {}),
          ...(isUser ? styles.bubbleUser : styles.bubbleAi),
          ...(msg.error ? styles.bubbleError : {}),
        }}
      >
        {displayPlain ? (
          displayContent
        ) : (
          <div className="chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
      <div style={styles.avatar}>🤖</div>
      <div style={{ ...styles.bubble, ...styles.bubbleAi, display: 'flex', gap: 4, padding: '14px 16px' }}>
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
        <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
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
  msgRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 30, height: 30, borderRadius: 8, background: 'var(--bg-tertiary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
  },
  bubble: {
    maxWidth: '76%', minWidth: 0, padding: '10px 14px', borderRadius: 14,
    fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
  },
  bubblePlain: { whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' },
  bubbleUser: { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 },
  bubbleAi: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 },
  bubbleError: { background: 'var(--danger-subtle)', borderColor: 'var(--danger)', color: 'var(--text-primary)' },
  inputBar: {
    display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0,
    marginTop: 16, padding: 10, background: 'var(--bg-card)',
    border: '1px solid var(--border-color)', borderRadius: 14,
  },
  input: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13,
    resize: 'none', maxHeight: 120, lineHeight: 1.5, padding: '6px 8px',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 9, border: 'none',
    background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'opacity var(--transition)',
  },
};
