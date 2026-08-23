import { createElectronApi } from './electronApi';
import { createHttpApi } from './httpApi';

export { API_METHODS, assertApiContract } from './contract';
export { createElectronApi } from './electronApi';
export { ApiError, createHttpApi, createHttpRequest } from './httpApi';

export function createApiClient({
  electronBridge = typeof window !== 'undefined' ? window.api : undefined,
  httpOptions,
} = {}) {
  return electronBridge
    ? createElectronApi(electronBridge)
    : createHttpApi(httpOptions);
}

/**
 * The only API dependency renderer code imports. Electron is selected when
 * the preload bridge exists; a normal browser uses the HTTP adapter.
 */
export const api = createApiClient({
  httpOptions: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  },
});
