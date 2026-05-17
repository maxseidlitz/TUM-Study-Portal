import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { generateId } from '../utils/helpers';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [exams, setExams] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [todos, setTodos] = useState([]);
  const [moodleCourses, setMoodleCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [e, l, t, m, mods] = await Promise.all([
        window.api.exams.getAll(),
        window.api.lectures.getAll(),
        window.api.todos.getAll(),
        window.api.moodle.getAll(),
        window.api.modules.getAll(),
      ]);
      setExams(e);
      setLectures(l);
      setTodos(t.map(item => ({ ...item, done: Boolean(item.done) })));
      setMoodleCourses(m);
      setModules(mods);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Exams ---
  const addExam = useCallback(async (data) => {
    const exam = { id: generateId(), ...data };
    await window.api.exams.create(exam);
    setExams(prev => [...prev, exam].sort((a, b) => a.date.localeCompare(b.date)));
  }, []);

  const updateExam = useCallback(async (exam) => {
    await window.api.exams.update(exam);
    setExams(prev => prev.map(e => e.id === exam.id ? exam : e).sort((a, b) => a.date.localeCompare(b.date)));
  }, []);

  const deleteExam = useCallback(async (id) => {
    await window.api.exams.delete(id);
    setExams(prev => prev.filter(e => e.id !== id));
  }, []);

  // --- Lectures ---
  const addLecture = useCallback(async (data) => {
    const lecture = { id: generateId(), ...data };
    await window.api.lectures.create(lecture);
    await loadAll();
  }, [loadAll]);

  const updateLecture = useCallback(async (lecture) => {
    await window.api.lectures.update(lecture);
    await loadAll();
  }, [loadAll]);

  const deleteLecture = useCallback(async (id) => {
    await window.api.lectures.delete(id);
    await loadAll();
  }, [loadAll]);

  const addLectures = useCallback(async (newLectures) => {
    const withIds = newLectures.map(l => ({ id: generateId(), ...l }));
    for (const l of withIds) await window.api.lectures.create(l);
    await loadAll();
  }, [loadAll]);

  // --- Todos ---
  const addTodo = useCallback(async (data) => {
    const todo = { id: generateId(), done: false, ...data };
    await window.api.todos.create(todo);
    setTodos(prev => [...prev, todo]);
  }, []);

  const updateTodo = useCallback(async (todo) => {
    await window.api.todos.update(todo);
    setTodos(prev => prev.map(t => t.id === todo.id ? todo : t));
  }, []);

  const toggleTodo = useCallback(async (id) => {
    setTodos(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, done: !t.done } : t);
      const todo = updated.find(t => t.id === id);
      window.api.todos.update(todo);
      return updated;
    });
  }, []);

  const deleteTodo = useCallback(async (id) => {
    await window.api.todos.delete(id);
    setTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Moodle ---
  const addMoodleCourse = useCallback(async (data) => {
    const course = { id: generateId(), ...data };
    await window.api.moodle.create(course);
    setMoodleCourses(prev => [...prev, course]);
  }, []);

  const updateMoodleCourse = useCallback(async (course) => {
    await window.api.moodle.update(course);
    setMoodleCourses(prev => prev.map(c => c.id === course.id ? course : c));
  }, []);

  const deleteMoodleCourse = useCallback(async (id) => {
    await window.api.moodle.delete(id);
    setMoodleCourses(prev => prev.filter(c => c.id !== id));
  }, []);

  const addModule = useCallback(async (data) => {
    const { slots, ...rest } = data;
    const mod = {
      id: generateId(),
      ...rest,
      slots: Array.isArray(slots) ? slots : [],
    };
    await window.api.modules.create(mod);
    await loadAll();
  }, [loadAll]);

  const updateModule = useCallback(async (mod) => {
    await window.api.modules.update(mod);
    await loadAll();
  }, [loadAll]);

  const deleteModule = useCallback(async (id) => {
    await window.api.modules.delete(id);
    await loadAll();
  }, [loadAll]);

  return (
    <DataContext.Provider value={{
      exams, lectures, todos, moodleCourses, modules, loading,
      refreshData: loadAll,
      addExam, updateExam, deleteExam,
      addLecture, updateLecture, deleteLecture, addLectures,
      addTodo, updateTodo, toggleTodo, deleteTodo,
      addMoodleCourse, updateMoodleCourse, deleteMoodleCourse,
      addModule, updateModule, deleteModule,
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
