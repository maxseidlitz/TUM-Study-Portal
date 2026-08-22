import { CHAT_API_HISTORY_MAX, buildAiContext, messagesForApi } from './chat';

describe('chat API payload', () => {
  test('begrenzt die verwertbare Historie auf 16 Nachrichten', () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Nachricht ${index}`,
    }));
    const result = messagesForApi(messages);
    expect(CHAT_API_HISTORY_MAX).toBe(16);
    expect(result).toHaveLength(16);
    expect(result[0].content).toBe('Nachricht 4');
  });

  test('entfernt UI-Nachrichten und leere Assistentenantworten', () => {
    expect(messagesForApi([
      { role: 'assistant', content: '' },
      { role: 'assistant', variant: 'todo_saved' },
      { role: 'system', content: 'intern' },
      { role: 'user', content: 'Hallo' },
    ])).toEqual([{ role: 'user', content: 'Hallo' }]);
  });

  test('sendet keine persönlichen Studienarrays im Kontextpayload', () => {
    const context = buildAiContext({
      exams: [{ id: 'e1' }],
      lectures: [{ id: 'l1' }],
      todos: [{ id: 't1' }],
      modules: [{ id: 'm1' }],
      locale: 'de',
      intlLocale: 'de-DE',
    });
    expect(context.locale).toBe('de');
    expect(context.today).toEqual(expect.any(String));
    expect(context.todayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context).not.toHaveProperty('exams');
    expect(context).not.toHaveProperty('lectures');
    expect(context).not.toHaveProperty('todos');
    expect(context).not.toHaveProperty('modules');
  });
});
