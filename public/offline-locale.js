(() => {
  'use strict';

  const messages = {
    de: {
      documentTitle: 'Offline – TUM Study Portal',
      title: 'Du bist offline',
      body: 'Diese sichere Offline-Seite enthält keine persönlichen Daten. Stelle die Verbindung wieder her, um das Portal zu öffnen oder Änderungen zu speichern.',
      retry: 'Erneut versuchen',
    },
    en: {
      documentTitle: 'Offline – TUM Study Portal',
      title: 'You are offline',
      body: 'This secure offline page contains no personal data. Reconnect to open the portal or save changes.',
      retry: 'Try again',
    },
    tr: {
      documentTitle: 'Çevrimdışı – TUM Study Portal',
      title: 'Çevrimdışısınız',
      body: 'Bu güvenli çevrimdışı sayfa kişisel veri içermez. Portalı açmak veya değişiklikleri kaydetmek için yeniden bağlanın.',
      retry: 'Tekrar dene',
    },
  };

  const locale = [...(navigator.languages || []), navigator.language]
    .map(language => String(language || '').toLowerCase().split('-')[0])
    .find(language => language in messages) || 'de';
  const selected = messages[locale];

  document.documentElement.lang = locale;
  document.title = selected.documentTitle;
  document.getElementById('offline-title').textContent = selected.title;
  document.getElementById('offline-body').textContent = selected.body;
  document.getElementById('offline-retry').textContent = selected.retry;
})();
