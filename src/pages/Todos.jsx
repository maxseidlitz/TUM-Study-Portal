import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useLocale } from '../context/LocaleContext';
import { formatDate, getDaysUntil, resolveTodoCourseLabel } from '../utils/helpers';
import TodoDetail from '../components/todos/TodoDetail';
import { api } from '../api';

const SECTION_KEYS = ['high', 'medium', 'low'];
const SECTION_COLORS = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };

export default function Todos() {
  const { t, intlLocale } = useLocale();
  const { todos, modules, moodleCourses, addTodo, updateTodo, toggleTodo, deleteTodo, loading } = useData();
  const sections = useMemo(
    () => SECTION_KEYS.map(key => ({ key, label: t(`priority.${key}`), color: SECTION_COLORS[key] })),
    [t],
  );

  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [completing, setCompleting] = useState(new Set());
  const [hideCompleted, setHideCompleted] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.settings.get();
        if (!cancelled) setHideCompleted(Boolean(s?.todosHideCompleted));
      } catch {
        if (!cancelled) setHideCompleted(false);
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persistHideCompleted = async (next) => {
    setHideCompleted(next);
    try {
      const prev = await api.settings.get();
      await api.settings.save({ ...prev, todosHideCompleted: next });
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || !settingsLoaded) return <div className="loading">{t('common.loading')}</div>;

  const selected = todos.find(t => t.id === selectedId) || null;

  const openOf = (priority) =>
    todos
      .filter(t => !t.done && (t.priority || 'medium') === priority && !completing.has(t.id))
      .sort((a, b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99'));

  const completingTodos = todos.filter(t => !t.done && completing.has(t.id));
  const doneTodos = todos.filter(t => t.done);
  const openCount = todos.filter(t => !t.done).length;

  const toggleSection = (key) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Animate completion: show as done for 280ms, then persist + move to "Erledigt"
  const handleComplete = (todo) => {
    if (todo.done) { toggleTodo(todo.id); return; }
    setCompleting(prev => new Set(prev).add(todo.id));
    setTimeout(() => {
      toggleTodo(todo.id);
      setCompleting(prev => { const n = new Set(prev); n.delete(todo.id); return n; });
    }, 280);
  };

  const handleAdd = (priority, title) => {
    addTodo({
      title: title.trim(),
      priority,
      subject: '',
      due: '',
      notes: '',
      moduleId: '',
      moodleCourseId: '',
    });
  };

  const handleDelete = (id) => {
    deleteTodo(id);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div>
      <div style={styles.pageHeader}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{t('todos.title')}</h1>
          <p>{t('todos.summary', { open: openCount, done: doneTodos.length })}</p>
        </div>
        <label style={styles.toggleRow}>
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => persistHideCompleted(e.target.checked)}
          />
          <span>{t('todos.hideCompleted')}</span>
        </label>
      </div>

      <div style={styles.layout}>
        {/* Task list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {sections.map(section => {
            const items = openOf(section.key);
            const animating = completingTodos.filter(t => (t.priority || 'medium') === section.key);
            const isCollapsed = collapsed.has(section.key);
            return (
              <Section
                key={section.key}
                section={section}
                count={items.length}
                collapsed={isCollapsed}
                onToggleCollapse={() => toggleSection(section.key)}
              >
                {items.map(todo => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    modules={modules}
                    moodleCourses={moodleCourses}
                    selected={selectedId === todo.id}
                    onSelect={() => setSelectedId(todo.id)}
                    onComplete={() => handleComplete(todo)}
                    intlLocale={intlLocale}
                    t={t}
                  />
                ))}
                {animating.map(todo => (
                  <TodoRow key={todo.id} todo={todo} modules={modules} moodleCourses={moodleCourses} completing onSelect={() => {}} onComplete={() => {}} intlLocale={intlLocale} t={t} />
                ))}
                <InlineAdd onAdd={(title) => handleAdd(section.key, title)} t={t} />
              </Section>
            );
          })}

          {hideCompleted && doneTodos.length > 0 && (
            <div style={styles.hiddenDoneHint}>
              {t('todos.hiddenDoneHint', { count: doneTodos.length })}
            </div>
          )}

          {/* Done section */}
          {!hideCompleted && doneTodos.length > 0 && (
            <Section
              section={{ key: 'done', label: t('todos.done'), color: 'var(--text-muted)' }}
              count={doneTodos.length}
              collapsed={collapsed.has('done')}
              onToggleCollapse={() => toggleSection('done')}
            >
              {doneTodos.map(todo => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  modules={modules}
                  moodleCourses={moodleCourses}
                  done
                  selected={selectedId === todo.id}
                  onSelect={() => setSelectedId(todo.id)}
                  onComplete={() => handleComplete(todo)}
                  intlLocale={intlLocale}
                  t={t}
                />
              ))}
            </Section>
          )}

          {openCount === 0 && doneTodos.length === 0 && (
            <div className="empty-state">
              <span style={{ fontSize: 48 }}>✅</span>
              <p>{t('todos.empty')}</p>
            </div>
          )}
        </div>

        {/* Detail pane */}
        {selected && (
          <TodoDetail
            todo={selected}
            onUpdate={updateTodo}
            onToggle={(id) => {
              const todoItem = todos.find(x => x.id === id);
              if (todoItem) handleComplete(todoItem);
            }}
            onDelete={handleDelete}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function Section({ section, count, collapsed, onToggleCollapse, children }) {
  return (
    <div style={styles.section}>
      <button style={styles.sectionHeader} onClick={onToggleCollapse}>
        <Chevron collapsed={collapsed} />
        <span style={{ ...styles.sectionDot, background: section.color }} />
        <span style={styles.sectionLabel}>{section.label}</span>
        <span style={styles.sectionCount}>{count}</span>
      </button>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}

function TodoRow({ todo, modules, moodleCourses, selected, done, completing, onSelect, onComplete, intlLocale, t }) {
  const isDone = done || completing;
  const days = todo.due ? getDaysUntil(todo.due) : null;
  const overdue = days !== null && days < 0 && !isDone;
  const courseLabel = resolveTodoCourseLabel(todo, modules, moodleCourses);

  return (
    <div
      className={`todo-row ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      style={{ opacity: isDone ? 0.55 : 1 }}
    >
      <button
        className={`todo-check ${isDone ? 'done' : ''}`}
        onClick={(e) => { e.stopPropagation(); onComplete(); }}
        title={isDone ? t('todos.markOpen') : t('todos.complete')}
      >
        <CheckIcon />
      </button>

      <span style={{ ...styles.rowTitle, textDecoration: isDone ? 'line-through' : 'none' }}>
        {todo.title}
      </span>

      <div style={styles.rowMeta}>
        {courseLabel && <span style={styles.subjectTag}>{courseLabel}</span>}
        {days !== null && !done && (
          <span style={{
            ...styles.dueTag,
            color: overdue ? 'var(--danger)' : days === 0 ? 'var(--warning)' : 'var(--text-muted)',
          }}>
            {overdue ? t('todos.overdue', { days: Math.abs(days) }) : days === 0 ? t('todos.todayDue') : formatDate(todo.due, intlLocale)}
          </span>
        )}
        <span style={{ ...styles.priorityDot, background: priorityColor(todo.priority) }} />
      </div>
    </div>
  );
}

function InlineAdd({ onAdd, t }) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const activate = () => {
    setActive(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = () => {
    if (text.trim()) {
      onAdd(text);
      setText('');
      // Keep input open and focused for the next task (Asana behaviour)
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { setText(''); setActive(false); }
  };

  if (!active) {
    return (
      <button className="todo-inline-add" onClick={activate}>
        <span style={styles.addPlus}>+</span>
        <span>{t('todos.addTask')}</span>
      </button>
    );
  }

  return (
    <div className="todo-row" style={{ cursor: 'default' }}>
      <span className="todo-check" style={{ pointerEvents: 'none', opacity: 0.4 }} />
      <input
        ref={inputRef}
        style={styles.addInput}
        placeholder={t('todos.addPlaceholder')}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (!text.trim()) setActive(false); }}
      />
    </div>
  );
}

function Chevron({ collapsed }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform var(--transition)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}

function priorityColor(p) {
  return { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' }[p] || 'var(--text-muted)';
}

const styles = {
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', marginTop: 4 },
  hiddenDoneHint: { fontSize: 12, color: 'var(--text-muted)', padding: '0 12px 10px' },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  section: { marginBottom: 18 },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 12px', background: 'transparent', border: 'none',
    cursor: 'pointer', color: 'var(--text-muted)',
  },
  sectionDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  sectionLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  sectionCount: { fontSize: 12, color: 'var(--text-muted)' },
  rowTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  subjectTag: {
    fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)',
    padding: '2px 8px', borderRadius: 999,
  },
  dueTag: { fontSize: 11, fontWeight: 500 },
  priorityDot: { width: 8, height: 8, borderRadius: '50%' },
  addInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13,
  },
  addPlus: { fontSize: 15, fontWeight: 400, width: 20, textAlign: 'center' },
};
