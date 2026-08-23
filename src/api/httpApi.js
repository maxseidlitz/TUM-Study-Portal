import { assertApiContract } from './contract';

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const trimTrailingSlash = value => value.replace(/\/+$/, '');
const encode = value => encodeURIComponent(String(value));

function entityApi(request, resource) {
  return {
    getAll: () => request(`/${resource}`),
    create: item => request(`/${resource}`, { method: 'POST', body: item }),
    update: item => request(`/${resource}/${encode(item.id)}`, { method: 'PUT', body: item }),
    delete: id => request(`/${resource}/${encode(id)}`, { method: 'DELETE' }),
  };
}

export function createHttpRequest({
  baseUrl = '/api/v1',
  fetchImpl = typeof window !== 'undefined' ? window.fetch?.bind(window) : undefined,
} = {}) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  return async function request(path, { method = 'GET', body, headers } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new ApiError('API request failed: fetch is unavailable');
    }
    let response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new ApiError('API request failed: network unavailable', { body: cause });
    }

    const contentType = response.headers?.get?.('content-type') || '';
    let responseBody = null;
    if (response.status !== 204) {
      responseBody = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
    }

    if (!response.ok) {
      const detail = responseBody?.error || responseBody?.message || response.statusText;
      throw new ApiError(
        `API request failed (${response.status})${detail ? `: ${detail}` : ''}`,
        { status: response.status, body: responseBody },
      );
    }
    return responseBody;
  };
}

/**
 * HTTP implementation of the renderer API contract.
 *
 * Resource routes are rooted at /api/v1 by default. Cookies are included for
 * the future server-side session model; callers never handle auth tokens.
 */
export function createHttpApi(options = {}) {
  const request = createHttpRequest(options);
  const baseUrl = trimTrailingSlash(options.baseUrl || '/api/v1');
  const EventSourceImpl = options.EventSourceImpl
    ?? (typeof window !== 'undefined' ? window.EventSource : undefined);
  const openWindow = options.openWindow
    ?? (typeof window !== 'undefined' ? window.open?.bind(window) : undefined);

  const api = {
    exams: entityApi(request, 'exams'),
    lectures: entityApi(request, 'lectures'),
    todos: entityApi(request, 'todos'),
    moodle: entityApi(request, 'moodle'),
    modules: entityApi(request, 'modules'),
    studyLogs: {
      getByExam: examId => request(`/study-logs?examId=${encode(examId)}`),
      getByTodo: todoId => request(`/study-logs?todoId=${encode(todoId)}`),
      create: log => request('/study-logs', { method: 'POST', body: log }),
      delete: id => request(`/study-logs/${encode(id)}`, { method: 'DELETE' }),
    },
    settings: {
      get: () => request('/settings'),
      save: settings => request('/settings', { method: 'PATCH', body: settings }),
    },
    ical: {
      fetch: url => request('/ical/fetch', { method: 'POST', body: { url } }),
    },
    ai: {
      recommend: context => request('/ai/recommend', { method: 'POST', body: context }),
      chat: payload => request('/ai/chat', { method: 'POST', body: payload }),
      models: optionsArg => request('/ai/models', { method: 'POST', body: optionsArg }),
    },
    chats: {
      getAll: () => request('/chats'),
      get: id => request(`/chats/${encode(id)}`),
      save: session => request(`/chats/${encode(session.id)}`, { method: 'PUT', body: session }),
      delete: id => request(`/chats/${encode(id)}`, { method: 'DELETE' }),
    },
    mensa: {
      fetch: canteenId => request(`/mensa/${encode(canteenId)}`),
    },
    ollama: {
      getSetupState: () => request('/ollama/setup'),
      retrySetup: () => request('/ollama/setup/retry', { method: 'POST' }),
      onSetupProgress: callback => {
        if (typeof EventSourceImpl !== 'function') return () => {};
        const source = new EventSourceImpl(`${baseUrl}/ollama/setup/events`, { withCredentials: true });
        source.onmessage = event => {
          try {
            callback(JSON.parse(event.data));
          } catch {
            // Ignore malformed progress events; the next state remains usable.
          }
        };
        return () => source.close();
      },
    },
    openExternal: url => {
      if (typeof openWindow !== 'function') return false;
      return Boolean(openWindow(url, '_blank', 'noopener,noreferrer'));
    },
    backup: {
      export: () => request('/backup/export'),
      import: json => request('/backup/import', { method: 'POST', body: { data: json } }),
    },
  };

  return assertApiContract(api, 'HTTP API adapter');
}
