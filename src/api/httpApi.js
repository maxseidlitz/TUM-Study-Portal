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
const SAFE_METHODS = new Set(['GET', 'HEAD']);

function defaultCsrfToken() {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')?.trim() || '';
}

function browserSettingsDto(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  const { geminiApiKey: _secret, ...safeSettings } = settings;
  return safeSettings;
}

function browserSettingsWriteDto(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  const dto = { ...settings };
  if (typeof dto.geminiApiKey !== 'string' || !dto.geminiApiKey.trim()) {
    delete dto.geminiApiKey;
  }
  delete dto.geminiApiKeyConfigured;
  delete dto.ollamaServerManaged;
  return dto;
}

export { browserSettingsDto, browserSettingsWriteDto };

function entityApi(request, commandRequest, resource) {
  return {
    getAll: () => request(`/${resource}`),
    create: item => commandRequest(`/${resource}`, { method: 'POST', body: item }),
    update: item => commandRequest(`/${resource}/${encode(item.id)}`, { method: 'PUT', body: item }),
    delete: id => commandRequest(`/${resource}/${encode(id)}`, { method: 'DELETE' }),
  };
}

export function createHttpRequest({
  baseUrl = '/api/v1',
  fetchImpl = typeof window !== 'undefined' ? window.fetch?.bind(window) : undefined,
  csrf = true,
  csrfHeaderName = 'X-CSRF-Token',
  csrfToken,
} = {}) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  return async function request(path, { method = 'GET', body, headers } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new ApiError('API request failed: fetch is unavailable');
    }
    const normalizedMethod = String(method).toUpperCase();
    const requestHeaders = {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    };

    if (csrf && !SAFE_METHODS.has(normalizedMethod)) {
      const configuredToken = typeof csrfToken === 'function' ? csrfToken() : csrfToken;
      const token = configuredToken === undefined ? defaultCsrfToken() : String(configuredToken).trim();
      if (!token) {
        throw new ApiError(`API request blocked: missing CSRF token for ${normalizedMethod}`);
      }
      requestHeaders[csrfHeaderName] = token;
    }

    let response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method: normalizedMethod,
        credentials: 'include',
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new ApiError('API request failed: network unavailable', { body: cause });
    }

    const contentType = response.headers?.get?.('content-type') || '';
    let responseBody = null;
    if (response.status !== 204) {
      try {
        responseBody = contentType.includes('application/json')
          ? await response.json()
          : await response.text();
      } catch (cause) {
        throw new ApiError(`API request failed (${response.status}): invalid response body`, {
          status: response.status,
          body: cause,
        });
      }
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
 * Resource routes are rooted at /api/v1 by default. Cookies carry the opaque
 * server-side session; callers never handle auth tokens.
 */
export function createHttpApi(options = {}) {
  const request = createHttpRequest(options);
  const baseUrl = trimTrailingSlash(options.baseUrl || '/api/v1');
  const EventSourceImpl = options.EventSourceImpl
    ?? (typeof window !== 'undefined' ? window.EventSource : undefined);
  const openWindow = options.openWindow
    ?? (typeof window !== 'undefined' ? window.open?.bind(window) : undefined);

  const resultRequest = async (path, requestOptions) => {
    try {
      return await request(path, requestOptions);
    } catch (error) {
      return { success: false, error: error?.message || 'API request failed' };
    }
  };

  const commandRequest = async (path, requestOptions) => {
    const result = await request(path, requestOptions);
    if (result?.success === false) {
      throw new ApiError(result.error || 'API command failed', { body: result });
    }
    return result;
  };

  const isSafeExternalUrl = value => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  };

  const api = {
    runtime: 'browser',
    exams: entityApi(request, commandRequest, 'exams'),
    lectures: entityApi(request, commandRequest, 'lectures'),
    todos: entityApi(request, commandRequest, 'todos'),
    moodle: entityApi(request, commandRequest, 'moodle'),
    modules: entityApi(request, commandRequest, 'modules'),
    studyLogs: {
      getByExam: examId => request(`/study-logs?examId=${encode(examId)}`),
      getByTodo: todoId => request(`/study-logs?todoId=${encode(todoId)}`),
      create: log => commandRequest('/study-logs', { method: 'POST', body: log }),
      delete: id => commandRequest(`/study-logs/${encode(id)}`, { method: 'DELETE' }),
    },
    settings: {
      get: async () => browserSettingsDto(await request('/settings')),
      save: async settings => browserSettingsDto(await commandRequest('/settings', {
          method: 'PATCH',
          body: browserSettingsWriteDto(settings),
        })),
    },
    auth: {
      logout: () => commandRequest('/auth/logout', { method: 'POST' }),
    },
    ical: {
      fetch: url => resultRequest('/ical/fetch', { method: 'POST', body: { url } }),
      replace: items => resultRequest('/ical/replace', { method: 'POST', body: { items } }),
    },
    ai: {
      recommend: context => resultRequest('/ai/recommend', { method: 'POST', body: context }),
      chat: payload => resultRequest('/ai/chat', { method: 'POST', body: payload }),
      models: optionsArg => resultRequest('/ai/models', { method: 'POST', body: optionsArg }),
    },
    chats: {
      getAll: () => request('/chats'),
      get: id => request(`/chats/${encode(id)}`),
      save: session => commandRequest(`/chats/${encode(session.id)}`, { method: 'PUT', body: session }),
      delete: id => commandRequest(`/chats/${encode(id)}`, { method: 'DELETE' }),
    },
    mensa: {
      fetch: canteenId => resultRequest(`/mensa/${encode(canteenId)}`),
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
      if (typeof openWindow !== 'function' || !isSafeExternalUrl(url)) return false;
      const opened = openWindow(url, '_blank', 'noopener,noreferrer');
      if (!opened) return false;
      try {
        opened.opener = null;
      } catch {
        // noopener is already requested; cross-origin WindowProxy may reject assignment.
      }
      return true;
    },
    backup: {
      export: () => resultRequest('/backup/export'),
      import: json => resultRequest('/backup/import', { method: 'POST', body: { data: json } }),
    },
  };

  return assertApiContract(api, 'HTTP API adapter');
}
