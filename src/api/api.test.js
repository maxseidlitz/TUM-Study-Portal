import { API_METHODS, assertApiContract } from './contract';
import { createElectronApi } from './electronApi';
import { ApiError, createHttpApi } from './httpApi';
import { createApiClient } from './index';

function createBridge() {
  const bridge = {};
  API_METHODS.forEach((path) => {
    const parts = path.split('.');
    const method = parts.pop();
    const owner = parts.reduce((current, part) => {
      current[part] ||= {};
      return current[part];
    }, bridge);
    owner[method] = jest.fn();
  });
  return bridge;
}

function jsonResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('shared API contract', () => {
  test('Electron adapter delegates to the complete preload bridge unchanged', async () => {
    const bridge = createBridge();
    bridge.settings.get.mockResolvedValue({ locale: 'de' });

    const electronApi = createElectronApi(bridge);

    await expect(electronApi.settings.get()).resolves.toEqual({ locale: 'de' });
    expect(electronApi).toBe(bridge);
    expect(bridge.settings.get).toHaveBeenCalledTimes(1);
    expect(createApiClient({ electronBridge: bridge })).toBe(bridge);
  });

  test('contract validation reports missing methods', () => {
    expect(() => assertApiContract({}, 'Test adapter'))
      .toThrow(/Test adapter does not implement: exams\.getAll/);
  });
});

describe('HTTP API adapter', () => {
  test('maps CRUD and partial settings updates to authenticated REST requests', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse([{ id: '1' }]))
      .mockResolvedValueOnce(jsonResponse({ id: 'a/b', name: 'Changed' }))
      .mockResolvedValueOnce(jsonResponse({ locale: 'en' }));
    const httpApi = createHttpApi({ baseUrl: '/custom/', fetchImpl });

    await expect(httpApi.exams.getAll()).resolves.toEqual([{ id: '1' }]);
    await httpApi.todos.update({ id: 'a/b', name: 'Changed' });
    await httpApi.settings.save({ locale: 'en' });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/custom/exams', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/custom/todos/a%2Fb', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ id: 'a/b', name: 'Changed' }),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(3, '/custom/settings', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ locale: 'en' }),
    }));
  });

  test('turns HTTP and network failures into actionable ApiError instances', async () => {
    const rejectedFetch = jest.fn().mockRejectedValue(new TypeError('offline'));
    const failedFetch = jest.fn().mockResolvedValue(jsonResponse(
      { error: 'Session expired' },
      { ok: false, status: 401, statusText: 'Unauthorized' },
    ));

    await expect(createHttpApi({ fetchImpl: rejectedFetch }).settings.get())
      .rejects.toMatchObject({ name: 'ApiError', status: 0 });

    const request = createHttpApi({ fetchImpl: failedFetch }).settings.get();
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 401,
      body: { error: 'Session expired' },
      message: expect.stringContaining('Session expired'),
    });
  });

  test('uses EventSource for setup progress and closes subscriptions', () => {
    const close = jest.fn();
    const EventSourceImpl = jest.fn(() => ({ close, onmessage: null }));
    const callback = jest.fn();
    const httpApi = createHttpApi({
      fetchImpl: jest.fn(),
      EventSourceImpl,
      baseUrl: '/api/v1/',
    });

    const unsubscribe = httpApi.ollama.onSetupProgress(callback);
    const source = EventSourceImpl.mock.results[0].value;
    source.onmessage({ data: JSON.stringify({ phase: 'downloading', percent: 25 }) });
    source.onmessage({ data: 'invalid' });
    unsubscribe();

    expect(EventSourceImpl).toHaveBeenCalledWith('/api/v1/ollama/setup/events', {
      withCredentials: true,
    });
    expect(callback).toHaveBeenCalledWith({ phase: 'downloading', percent: 25 });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
