import { assertApiContract } from './contract';

/**
 * Adapts the context-isolated preload bridge to the shared renderer contract.
 * The bridge itself remains the source of truth, so IPC argument and return
 * value semantics stay fully backwards compatible.
 */
export function createElectronApi(bridge) {
  return assertApiContract(bridge, 'Electron preload bridge');
}
