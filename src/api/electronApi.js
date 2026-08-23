import {
  API_METHODS,
  COMMAND_METHODS,
  RESULT_METHODS,
  assertApiContract,
  valueAtPath,
} from './contract';
import { ApiError } from './httpApi';

/**
 * Adapts the context-isolated preload bridge to the shared renderer contract.
 * Domain-result methods keep Electron's { success, error } envelopes. Failed
 * commands reject, preventing optimistic renderer state from being updated.
 */
export function createElectronApi(bridge) {
  assertApiContract(bridge, 'Electron preload bridge');

  const api = { runtime: 'electron' };
  const resultMethods = new Set(RESULT_METHODS);
  const commandMethods = new Set(COMMAND_METHODS);

  API_METHODS.forEach((path) => {
    const parts = path.split('.');
    const methodName = parts.pop();
    const target = parts.reduce((owner, part) => (owner[part] ||= {}), api);
    const bridgeMethod = valueAtPath(bridge, path);

    if (path === 'ollama.onSetupProgress') {
      target[methodName] = (...args) => bridgeMethod(...args);
    } else if (path === 'openExternal') {
      target[methodName] = async (...args) => {
        try {
          return Boolean(await bridgeMethod(...args));
        } catch {
          return false;
        }
      };
    } else if (resultMethods.has(path)) {
      target[methodName] = async (...args) => {
        try {
          return await bridgeMethod(...args);
        } catch (error) {
          return { success: false, error: error?.message || 'IPC request failed' };
        }
      };
    } else if (commandMethods.has(path)) {
      target[methodName] = async (...args) => {
        const result = await bridgeMethod(...args);
        if (result?.success === false) {
          throw new ApiError(result.error || 'IPC command failed', { body: result });
        }
        return result;
      };
    } else {
      target[methodName] = (...args) => bridgeMethod(...args);
    }
  });

  return assertApiContract(api, 'Electron API adapter');
}
