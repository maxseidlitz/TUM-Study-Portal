import {
  INSTALL_HINT_DISMISSED_KEY,
  activateWaitingWorker,
  dismissIosInstallHint,
  registerServiceWorker,
  shouldShowIosInstallHint,
} from './pwa';

function iosWindow(overrides = {}) {
  const storage = new Map();
  return {
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
    },
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    ...overrides,
  };
}

test('shows and persistently dismisses the Safari iPhone install hint', () => {
  const target = iosWindow();
  expect(shouldShowIosInstallHint(target)).toBe(true);
  dismissIosInstallHint(target);
  expect(target.localStorage.getItem(INSTALL_HINT_DISMISSED_KEY)).toBe('1');
  expect(shouldShowIosInstallHint(target)).toBe(false);
  expect(shouldShowIosInstallHint(iosWindow({
    navigator: { userAgent: 'CriOS iPhone', maxTouchPoints: 5 },
  }))).toBe(false);
  expect(shouldShowIosInstallHint(iosWindow({
    navigator: { standalone: true, userAgent: 'iPhone Safari', maxTouchPoints: 5 },
  }))).toBe(false);
});

test('does not register a service worker for Electron file URLs', async () => {
  const register = jest.fn();
  await expect(registerServiceWorker({
    navigatorObject: { serviceWorker: { register } },
    locationObject: { protocol: 'file:' },
  })).resolves.toBeNull();
  expect(register).not.toHaveBeenCalled();
});

test('reports waiting workers and activates only on explicit request', async () => {
  const waiting = { postMessage: jest.fn() };
  const registration = {
    waiting,
    addEventListener: jest.fn(),
  };
  const onUpdate = jest.fn();
  const result = await registerServiceWorker({
    navigatorObject: {
      serviceWorker: {
        register: jest.fn().mockResolvedValue(registration),
      },
    },
    locationObject: { protocol: 'https:' },
    onUpdate,
  });

  expect(result).toBe(registration);
  expect(onUpdate).toHaveBeenCalledWith(registration);
  expect(waiting.postMessage).not.toHaveBeenCalled();
  expect(activateWaitingWorker(registration)).toBe(true);
  expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
});
