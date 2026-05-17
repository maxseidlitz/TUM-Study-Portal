import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import de from '../locales/de.json';
import en from '../locales/en.json';
import tr from '../locales/tr.json';

const MESSAGES = { de, en, tr };
export const LOCALE_TO_INTL = { de: 'de-DE', en: 'en-US', tr: 'tr-TR' };
const VALID_LOCALES = new Set(['de', 'en', 'tr']);

const LocaleContext = createContext(null);

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function interpolate(template, vars) {
  if (!template || vars == null) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v != null ? String(v) : `{${key}}`;
  });
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState('de');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const get = window.api?.settings?.get;
        if (typeof get !== 'function') return;
        const s = await get();
        if (!cancelled && s?.locale && VALID_LOCALES.has(s.locale)) {
          setLocaleState(s.locale);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const intlLocale = LOCALE_TO_INTL[locale] || 'de-DE';
  const messages = MESSAGES[locale] || de;

  const t = useCallback(
    (key, vars) => {
      const val = getByPath(messages, key);
      if (typeof val === 'string') return interpolate(val, vars);
      return key;
    },
    [messages],
  );

  const setLocale = useCallback(async (code) => {
    if (!VALID_LOCALES.has(code)) return;
    setLocaleState(code);
    document.documentElement.lang = code;
    try {
      const save = window.api?.settings?.save;
      if (typeof save === 'function') await save({ locale: code });
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ locale, intlLocale, t, setLocale }),
    [locale, intlLocale, t, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
