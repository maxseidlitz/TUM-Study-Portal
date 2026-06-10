import { useState, useRef, useEffect, useCallback } from 'react';
import { generateId } from '../utils/helpers';

const SAVE_DEBOUNCE_MS = 500;

/**
 * IPC-basierte Chat-Sessions: Laden, Speichern, Wechseln, Löschen.
 * Synchronisiert mit globalem activeAiChat aus DataContext.
 */
export function useChatSessions({ activeAiChat, setActiveAiChat }) {
  const chatsPreload = typeof window !== 'undefined' && typeof window.api?.chats?.getAll === 'function';

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [persistReady, setPersistReady] = useState(false);
  const [ipcStaleHint, setIpcStaleHint] = useState(false);
  const [hydrated, setHydrated] = useState(!chatsPreload);
  const saveDebounceRef = useRef(null);

  const thinking = activeAiChat.sessionId === activeSessionId && activeAiChat.thinking;

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
    const sid = activeSessionId;
    const updatedAt = new Date().toISOString();
    const existing = sessions.find(s => s.id === sid);
    const startedAt =
      existing && typeof existing.startedAt === 'string' && existing.startedAt.trim()
        ? existing.startedAt.trim()
        : null;
    const payload = {
      id: sid,
      title: '',
      updatedAt,
      messages,
    };
    if (startedAt) payload.startedAt = startedAt;
    await window.api.chats.save(payload);
    const nextList = await window.api.chats.getAll();
    setSessions(nextList);
  }, [persistReady, activeSessionId, messages, sessions]);

  useEffect(() => {
    if (!persistReady || !hydrated || !activeSessionId) return undefined;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      flushSaveCurrentSession().catch(err => console.error(err));
    }, SAVE_DEBOUNCE_MS);
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
      const nextList = await window.api.chats.getAll();
      setSessions(nextList);
      setActiveSessionId(nid);
      setMessages([]);
    } else {
      setMessages([]);
    }
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
  }, [activeSessionId, thinking, persistReady, flushSaveCurrentSession, sessions]);

  const deleteSession = useCallback(async (ev, id, t) => {
    ev.stopPropagation();
    if (!persistReady || !window.confirm(t('chat.deleteSessionConfirm'))) return;

    if (id === activeSessionId && saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }

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
  }, [persistReady, activeSessionId]);

  // Global -> Lokal
  useEffect(() => {
    if (activeAiChat.sessionId === activeSessionId) {
      setMessages(activeAiChat.messages);
    }
  }, [activeAiChat.messages, activeAiChat.sessionId, activeSessionId]);

  // Lokal -> Global (Session-Wechsel)
  useEffect(() => {
    if (activeSessionId && activeAiChat.sessionId !== activeSessionId) {
      setActiveAiChat(prev => ({
        ...prev,
        sessionId: activeSessionId,
        messages,
        thinking: false,
        hasUnread: false,
      }));
    }
  }, [activeSessionId, messages, activeAiChat.sessionId, setActiveAiChat]);

  // Gelesen markieren
  useEffect(() => {
    if (activeAiChat.hasUnread && activeAiChat.sessionId === activeSessionId) {
      setActiveAiChat(prev => ({ ...prev, hasUnread: false }));
    }
  }, [activeSessionId, activeAiChat.hasUnread, activeAiChat.sessionId, setActiveAiChat]);

  return {
    chatsPreload,
    sessions,
    activeSessionId,
    messages,
    setMessages,
    persistReady,
    ipcStaleHint,
    hydrated,
    startNewChat,
    selectSession,
    deleteSession,
  };
}
