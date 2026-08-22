const {
  MAX_RESULTS,
  canonicalToolCall,
  executeReadOnlyTool,
  getModule,
  getSchedule,
  searchExams,
  searchTodos,
} = require('../../public/aiRetrieval');

const dataStore = {
  modules: [{
    id: 'm1',
    name: 'Algorithmen',
    code: 'IN0007',
    semester: 'SS 2026',
    moodleUrl: 'https://example.invalid',
    slots: [{
      id: 's1',
      day: 'Mo',
      time: '10:00',
      end_time: '12:00',
      room: 'MI 00.08.038',
      lecturer: 'Ada',
    }],
  }],
  todos: [{
    id: 't1',
    title: 'Übungsblatt lösen',
    priority: 'high',
    due: '2026-08-24',
    moduleId: 'm1',
    notes: 'Aufgaben 1 bis 4',
    done: false,
  }],
  exams: [{
    id: 'e1',
    name: 'Algorithmen Klausur',
    date: '2026-09-01',
    time: '08:00',
    room: 'MW 2001',
    credits: 6,
  }],
  lectures: [{
    id: 'l1',
    name: 'Sondertermin',
    eventDate: '2026-08-25',
    day: 'Di',
    time: '14:00',
    room: 'Online',
  }],
};

describe('AI retrieval tools', () => {
  test('search_todos validiert strikt und liefert kompakte Treffer', () => {
    expect(searchTodos({ status: 'invalid' }, dataStore)).toEqual({
      success: false,
      error: 'status muss open, done oder all sein.',
    });
    expect(searchTodos({ unknown: true }, dataStore).success).toBe(false);

    const result = searchTodos({ query: 'Algorithmen', limit: 1 }, dataStore);
    expect(result.found).toBe(true);
    expect(result.results).toEqual([expect.objectContaining({
      id: 't1',
      moduleName: 'Algorithmen',
      title: 'Übungsblatt lösen',
    })]);
  });

  test('search_exams begrenzt Ergebnisse hart auf 20', () => {
    const many = {
      ...dataStore,
      exams: Array.from({ length: 25 }, (_, index) => ({
        id: `e${index}`,
        name: `Prüfung ${index}`,
        date: `2026-09-${String((index % 20) + 1).padStart(2, '0')}`,
      })),
    };
    const result = searchExams({ limit: MAX_RESULTS }, many);
    expect(result.results).toHaveLength(20);
    expect(searchExams({ limit: 21 }, many).success).toBe(false);
  });

  test('get_schedule expandiert wöchentliche und datierte Termine', () => {
    const result = getSchedule(
      { from: '2026-08-24', to: '2026-08-25', limit: 20 },
      dataStore,
      '2026-08-22'
    );
    expect(result.found).toBe(true);
    expect(result.results.map((row) => row.name)).toEqual(['Algorithmen', 'Sondertermin']);
    expect(getSchedule(
      { from: '2026-08-01', to: '2026-09-15' },
      dataStore,
      '2026-08-22'
    ).success).toBe(false);
  });

  test('get_module unterscheidet not-found und mehrdeutige Suche', () => {
    expect(getModule({ id: 'missing' }, dataStore)).toEqual(expect.objectContaining({
      success: true,
      found: false,
      results: [],
    }));
    const ambiguous = getModule({ query: 'algo' }, {
      ...dataStore,
      modules: [...dataStore.modules, { id: 'm2', name: 'Algorithmische Geometrie', slots: [] }],
    });
    expect(ambiguous).toEqual(expect.objectContaining({ ambiguous: true, found: false, count: 2 }));
  });

  test('Dispatcher meldet unbekannte Tools und Signaturen sind stabil', () => {
    expect(executeReadOnlyTool('delete_todo', {}, dataStore, '2026-08-22').success).toBe(false);
    expect(canonicalToolCall('search_todos', { status: 'open', query: 'x' }))
      .toBe(canonicalToolCall('search_todos', { query: 'x', status: 'open' }));
  });
});
