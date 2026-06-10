import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocale } from './LocaleContext';
import { useToast } from './ToastContext';
import { useEntityCrud } from '../hooks/useEntityCrud';
import { messagesForApi, buildAiContext, deriveSessionTitle } from '../utils/chat';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { locale, intlLocale, t } = useLocale();
  const showToast = useToast();
  const [exams, setExams] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [todos, setTodos] = useState([]);
  const [moodleCourses, setMoodleCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeAiChat, setActiveAiChat] = useState({
    sessionId: null,
    messages: [],
    thinking: false,
    hasUnread: false,
  });

  const crudError = useCallback((err) => {
    showToast(err?.message || t('common.unknownError'), 'error');
  }, [showToast, t]);

  const examCrud = useEntityCrud(window.api?.exams, setExams, {
    sortFn: (a, b) => a.date.localeCompare(b.date),
    onError: crudError,
  });
  const lectureCrud = useEntityCrud(window.api?.lectures, setLectures, {
    sortFn: (a, b) => {
      const dayOrder = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      const da = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      if (da !== 0) return da;
      return (a.time || '').localeCompare(b.time || '');
    },
    onError: crudError,
  });
  const todoCrud = useEntityCrud(window.api?.todos, setTodos, {
    mapOnCreate: (item) => ({ ...item, done: false }),
    mapOnLoad: (item) => ({ ...item, done: Boolean(item.done) }),
    onError: crudError,
  });
  const moodleCrud = useEntityCrud(window.api?.moodle, setMoodleCourses, { onError: crudError });
  const moduleCrud = useEntityCrud(window.api?.modules, setModules, {
    sortFn: (a, b) => (a.name || '').localeCompare(b.name || ''),
    mapOnCreate: (item) => ({
      ...item,
      slots: Array.isArray(item.slots) ? item.slots : [],
    }),
    onError: crudError,
  });

  const sortExams = (list) => [...list].sort((a, b) => a.date.localeCompare(b.date));
  const sortLectures = (list) => {
    const dayOrder = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    return [...list].sort((a, b) => {
      const da = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      if (da !== 0) return da;
      return (a.time || '').localeCompare(b.time || '');
    });
  };
  const sortModules = (list) => [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const loadAll = useCallback(async () => {
    try {
      const [e, l, td, m, mods] = await Promise.all([
        window.api.exams.getAll(),
        window.api.lectures.getAll(),
        window.api.todos.getAll(),
        window.api.moodle.getAll(),
        window.api.modules.getAll(),
      ]);
      setExams(sortExams(e));
      setLectures(sortLectures(l));
      setTodos(td.map(item => ({ ...item, done: Boolean(item.done) })));
      setMoodleCourses(m);
      setModules(sortModules(mods));
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast(t('common.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleTodo = useCallback(async (id) => {
    setTodos(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, done: !item.done } : item);
      const todo = updated.find(item => item.id === id);
      window.api.todos.update(todo);
      return updated;
    });
  }, []);

  const sendAiMessage = useCallback(async (content, sessionId, history) => {
    const userMsg = { role: 'user', content: content.trim() };
    const newHistory = [...history, userMsg];

    setActiveAiChat({
      sessionId,
      messages: newHistory,
      thinking: true,
      hasUnread: false,
    });

    if (!window.api?.ai?.chat) {
      const errorMsg = {
        role: 'assistant',
        content: t('chat.onlyElectron'),
        error: true,
      };
      setActiveAiChat(prev => ({
        ...prev,
        messages: [...prev.messages, errorMsg],
        thinking: false,
      }));
      return;
    }

    try {
      const context = buildAiContext({ exams, lectures, todos, modules, locale, intlLocale });

      const result = await window.api.ai.chat({
        messages: messagesForApi(newHistory),
        context,
      });

      const todoActions = Array.isArray(result.todoActions) ? result.todoActions : [];
      const replyText = typeof result.content === 'string' ? result.content.trim() : '';

      const nextMessages = [...newHistory];
      if (result.success) {
        if (replyText) {
          nextMessages.push({ role: 'assistant', content: replyText });
        }
        if (todoActions.length > 0) {
          nextMessages.push({ role: 'assistant', variant: 'todo_saved', todoActions });
        }
        if (!replyText && todoActions.length === 0) {
          nextMessages.push({ role: 'assistant', content: '...' });
        }
      } else {
        nextMessages.push({
          role: 'assistant',
          error: true,
          errorKind: 'failed',
          errorDetail: result.error || '',
        });
      }

      setActiveAiChat({
        sessionId,
        messages: nextMessages,
        thinking: false,
        hasUnread: true,
      });

      if (sessionId) {
        await window.api.chats.save({
          id: sessionId,
          title: deriveSessionTitle(nextMessages),
          updatedAt: new Date().toISOString(),
          messages: nextMessages,
        });
      }

      if (todoActions.length > 0) {
        await loadAll();
      }
    } catch (e) {
      setActiveAiChat(prev => ({
        ...prev,
        messages: [...prev.messages, {
          role: 'assistant',
          error: true,
          errorKind: 'exception',
          errorDetail: e.message,
        }],
        thinking: false,
      }));
    }
  }, [exams, lectures, todos, modules, locale, intlLocale, t, loadAll]);

  return (
    <DataContext.Provider value={{
      exams, lectures, todos, moodleCourses, modules, loading,
      refreshData: loadAll,
      addExam: examCrud.add,
      updateExam: examCrud.update,
      deleteExam: examCrud.remove,
      addLecture: lectureCrud.add,
      updateLecture: lectureCrud.update,
      deleteLecture: lectureCrud.remove,
      addLectures: lectureCrud.addMany,
      addTodo: todoCrud.add,
      updateTodo: todoCrud.update,
      toggleTodo,
      deleteTodo: todoCrud.remove,
      addMoodleCourse: moodleCrud.add,
      updateMoodleCourse: moodleCrud.update,
      deleteMoodleCourse: moodleCrud.remove,
      addModule: moduleCrud.add,
      updateModule: moduleCrud.update,
      deleteModule: moduleCrud.remove,
      activeAiChat, setActiveAiChat, sendAiMessage,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
