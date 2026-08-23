export const INSTALL_HINT_DISMISSED_KEY = 'tum-pwa-install-hint-dismissed';

export function isStandalone(windowObject = window) {
  return windowObject.matchMedia?.('(display-mode: standalone)').matches
    || windowObject.navigator?.standalone === true;
}

export function shouldShowIosInstallHint(windowObject = window) {
  const userAgent = windowObject.navigator?.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent)
    || (userAgent.includes('Macintosh') && Number(windowObject.navigator?.maxTouchPoints) > 1);
  const isSafari = /Safari/.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(userAgent);
  if (!isIos || !isSafari || isStandalone(windowObject)) return false;
  try {
    return windowObject.localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) !== '1';
  } catch {
    return true;
  }
}

export function dismissIosInstallHint(windowObject = window) {
  try {
    windowObject.localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1');
  } catch {
    // The hint can still be dismissed for the current render.
  }
}

export function activateWaitingWorker(registration) {
  if (!registration?.waiting) return false;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export async function registerServiceWorker({
  navigatorObject = navigator,
  locationObject = window.location,
  onUpdate = () => {},
} = {}) {
  if (!navigatorObject.serviceWorker || locationObject.protocol === 'file:') return null;

  const registration = await navigatorObject.serviceWorker.register('/service-worker.js');
  if (registration.waiting) onUpdate(registration);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigatorObject.serviceWorker.controller) {
        onUpdate(registration);
      }
    });
  });
  return registration;
}
