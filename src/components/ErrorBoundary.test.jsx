import { errorMessagesForLocale, resolveErrorLocale } from './ErrorBoundary';

describe('ErrorBoundary localization', () => {
  afterEach(() => {
    document.documentElement.lang = '';
    delete document.documentElement.dataset.uiLocale;
  });

  test('prefers the active document language and falls back through browser locales', () => {
    expect(resolveErrorLocale({
      documentObject: { documentElement: { dataset: { uiLocale: 'tr-TR' } } },
      navigatorObject: { language: 'en-US', languages: ['en-US'] },
    })).toBe('tr');
    expect(resolveErrorLocale({
      documentObject: { documentElement: { dataset: {} } },
      navigatorObject: { language: 'fr-FR', languages: ['fr-FR', 'en-GB'] },
    })).toBe('en');
    expect(resolveErrorLocale({
      documentObject: { documentElement: { dataset: {} } },
      navigatorObject: { language: 'fr-FR', languages: ['fr-FR'] },
    })).toBe('de');
  });

  test('provides complete localized fallback copy', () => {
    expect(errorMessagesForLocale('de').reload).toBe('App neu laden');
    expect(errorMessagesForLocale('en').title).toBe('Something went wrong');
    expect(errorMessagesForLocale('tr').reload).toBe('Uygulamayı yeniden yükle');
    expect(errorMessagesForLocale('fr')).toEqual(errorMessagesForLocale('de'));
  });
});
