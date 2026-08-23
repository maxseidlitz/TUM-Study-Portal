import { API_METHODS, assertApiContract } from './contract';
import { createElectronApi } from './electronApi';
import {
  ApiError,
  browserSettingsDto,
  browserSettingsWriteDto,
  createHttpApi,
  createHttpRequest,
} from './httpApi';
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
  test('Electron adapter preserves reads and classifies command/result failures', async () => {
    const bridge = createBridge();
    bridge.settings.get.mockResolvedValue({ locale: 'de' });
    bridge.todos.update.mockResolvedValue({ success: false, error: 'write failed' });
    bridge.ai.chat.mockRejectedValue(new Error('provider unavailable'));
    bridge.openExternal.mockRejectedValue(new Error('launch failed'));

    const electronApi = createElectronApi(bridge);

    await expect(electronApi.settings.get()).resolves.toEqual({ locale: 'de' });
    await expect(electronApi.todos.update({ id: '1' }))
      .rejects.toMatchObject({ name: 'ApiError', message: 'write failed' });
    await expect(electronApi.ai.chat({})).resolves.toEqual({
      success: false,
      error: 'provider unavailable',
    });
    await expect(electronApi.openExternal('https://example.test')).resolves.toBe(false);
    expect(electronApi.runtime).toBe('electron');
    expect(bridge.settings.get).toHaveBeenCalledTimes(1);
    expect(createApiClient({ electronBridge: bridge }).runtime).toBe('electron');
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
    const httpApi = createHttpApi({ baseUrl: '/custom/', fetchImpl, csrfToken: 'token-1' });

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
      headers: expect.objectContaining({ 'X-CSRF-Token': 'token-1' }),
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

  test('keeps result-envelope HTTP failures non-rejecting but command failures rejecting', async () => {
    const failedFetch = jest.fn().mockResolvedValue(jsonResponse(
      { error: 'No session' },
      { ok: false, status: 403, statusText: 'Forbidden' },
    ));
    const resultApi = createHttpApi({ fetchImpl: failedFetch });

    await expect(resultApi.mensa.fetch('422')).resolves.toEqual({
      success: false,
      error: expect.stringContaining('No session'),
    });

    const commandApi = createHttpApi({ fetchImpl: failedFetch, csrfToken: 'csrf' });
    await expect(commandApi.todos.delete('1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
  });

  test.each([
    ['entity create', api => api.exams.create({ id: '1' })],
    ['entity update', api => api.todos.update({ id: '1' })],
    ['entity delete', api => api.modules.delete('1')],
    ['study-log create', api => api.studyLogs.create({ id: '1' })],
    ['study-log delete', api => api.studyLogs.delete('1')],
    ['settings save', api => api.settings.save({ locale: 'de' })],
    ['chat save', api => api.chats.save({ id: '1' })],
    ['chat delete', api => api.chats.delete('1')],
  ])('rejects 2xx {success:false} for %s like Electron', async (_label, invoke) => {
    const failure = { success: false, error: 'domain write failed' };
    const httpApi = createHttpApi({
      fetchImpl: jest.fn().mockResolvedValue(jsonResponse(failure)),
      csrfToken: 'csrf',
    });

    await expect(invoke(httpApi)).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      body: failure,
      message: 'domain write failed',
    });
  });

  test('preserves 2xx result envelopes for callers that inspect success', async () => {
    const failure = { success: false, error: 'calendar rejected' };
    const httpApi = createHttpApi({
      fetchImpl: jest.fn().mockResolvedValue(jsonResponse(failure)),
      csrfToken: 'csrf',
    });

    await expect(httpApi.ical.fetch('https://example.test/calendar.ics'))
      .resolves.toEqual(failure);
  });

  test('requires CSRF only for mutating requests and supports the browser meta default', async () => {
    document.head.innerHTML = '<meta name="csrf-token" content=" meta-token ">';
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(null, { status: 204 }));
    const request = createHttpRequest({ fetchImpl });

    await request('/read');
    await request('/write', { method: 'POST', body: { ok: true } });

    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('X-CSRF-Token');
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ 'X-CSRF-Token': 'meta-token' });
    await expect(createHttpRequest({ fetchImpl, csrfToken: '' })('/write', { method: 'DELETE' }))
      .rejects.toThrow(/missing CSRF token/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('handles 204 responses without parsing a body and reports malformed JSON', async () => {
    const noContent = {
      ...jsonResponse(null, { status: 204 }),
      json: jest.fn(() => { throw new Error('must not parse'); }),
    };
    const malformed = {
      ...jsonResponse(null),
      json: jest.fn().mockRejectedValue(new SyntaxError('bad json')),
    };

    await expect(createHttpRequest({ fetchImpl: jest.fn().mockResolvedValue(noContent) })('/x'))
      .resolves.toBeNull();
    expect(noContent.json).not.toHaveBeenCalled();
    await expect(createHttpRequest({ fetchImpl: jest.fn().mockResolvedValue(malformed) })('/x'))
      .rejects.toMatchObject({ name: 'ApiError', status: 200 });
  });

  test('enforces the self-hosted write-only Gemini settings DTO', async () => {
    expect(browserSettingsDto({
      locale: 'de',
      geminiApiKey: 'server-secret',
      geminiApiKeyConfigured: true,
    })).toEqual({ locale: 'de', geminiApiKeyConfigured: true });
    expect(browserSettingsWriteDto({ locale: 'de', geminiApiKey: '' }))
      .toEqual({ locale: 'de' });

    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ geminiApiKey: 'must-not-escape', geminiApiKeyConfigured: true }))
      .mockResolvedValueOnce(jsonResponse({ geminiApiKey: 'must-not-escape', geminiApiKeyConfigured: true }));
    const httpApi = createHttpApi({ fetchImpl, csrfToken: 'csrf' });

    await expect(httpApi.settings.get()).resolves.toEqual({ geminiApiKeyConfigured: true });
    await expect(httpApi.settings.save({ geminiApiKey: 'new-secret', geminiApiKeyConfigured: true }))
      .resolves.toEqual({ geminiApiKeyConfigured: true });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ geminiApiKey: 'new-secret' });
  });

  test('maps central action routes and payloads', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true }));
    const httpApi = createHttpApi({ baseUrl: '/api/v1', fetchImpl, csrfToken: 'csrf' });

    await httpApi.ical.fetch('https://example.test/calendar.ics');
    await httpApi.ai.chat({ messages: [], context: {} });
    await httpApi.chats.save({ id: 'chat/1' });
    await httpApi.backup.import('{"ok":true}');

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method, JSON.parse(options.body)]))
      .toEqual([
        ['/api/v1/ical/fetch', 'POST', { url: 'https://example.test/calendar.ics' }],
        ['/api/v1/ai/chat', 'POST', { messages: [], context: {} }],
        ['/api/v1/chats/chat%2F1', 'PUT', { id: 'chat/1' }],
        ['/api/v1/backup/import', 'POST', { data: '{"ok":true}' }],
      ]);
  });

  test('opens only http(s) URLs without an opener', () => {
    const opened = { opener: {} };
    const openWindow = jest.fn(() => opened);
    const httpApi = createHttpApi({ fetchImpl: jest.fn(), openWindow });

    expect(httpApi.openExternal('javascript:alert(1)')).toBe(false);
    expect(httpApi.openExternal('file:///tmp/private')).toBe(false);
    expect(httpApi.openExternal('https://example.test/path')).toBe(true);
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith(
      'https://example.test/path',
      '_blank',
      'noopener,noreferrer',
    );
    expect(opened.opener).toBeNull();
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
