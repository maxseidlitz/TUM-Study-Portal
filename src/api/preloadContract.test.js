import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { API_METHODS } from './contract';

function valueAtPath(object, methodPath) {
  return methodPath.split('.').reduce((value, part) => value?.[part], object);
}

function loadRealPreload() {
  let exposed;
  const ipcRenderer = {
    invoke: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const contextBridge = {
    exposeInMainWorld: vi.fn((_name, api) => { exposed = api; }),
  };
  const source = fs.readFileSync(path.resolve(process.cwd(), 'public/preload.js'), 'utf8');

  vm.runInNewContext(source, {
    require: moduleName => {
      if (moduleName !== 'electron') throw new Error(`Unexpected preload dependency: ${moduleName}`);
      return { contextBridge, ipcRenderer };
    },
    Boolean,
  }, { filename: 'public/preload.js' });

  return { api: exposed, contextBridge, ipcRenderer };
}

describe('real preload bridge contract', () => {
  test('exposes every shared API method from public/preload.js', () => {
    const { api, contextBridge } = loadRealPreload();

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', api);
    expect(API_METHODS.filter(methodPath => typeof valueAtPath(api, methodPath) !== 'function'))
      .toEqual([]);
  });

  test('uses the expected IPC channel and contains openExternal rejections', async () => {
    const { api, ipcRenderer } = loadRealPreload();

    await api.todos.update({ id: 'todo-1' });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('todos:update', { id: 'todo-1' });

    ipcRenderer.invoke.mockRejectedValueOnce(new Error('denied'));
    await expect(api.openExternal('https://example.test')).resolves.toBe(false);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      'shell:openExternal',
      'https://example.test',
    );
  });

  test('registers and removes the exact Ollama progress listener', () => {
    const { api, ipcRenderer } = loadRealPreload();
    const callback = vi.fn();
    const unsubscribe = api.ollama.onSetupProgress(callback);
    const listener = ipcRenderer.on.mock.calls[0][1];

    listener({}, { phase: 'ready' });
    unsubscribe();

    expect(callback).toHaveBeenCalledWith({ phase: 'ready' });
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      'ollama:setup-progress',
      listener,
    );
  });

  test('keeps server-only session and atomic calendar methods safe on Electron', async () => {
    const { api, ipcRenderer } = loadRealPreload();
    await expect(api.auth.logout()).resolves.toEqual({ success: true, noop: true });
    await expect(api.ical.replace([])).resolves.toMatchObject({ success: false });
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });
});

describe('Electron external URL policy', () => {
  test('the packaged main-process validator allows only absolute http(s) URLs', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'public/externalUrl.js'), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, URL }, {
      filename: 'public/externalUrl.js',
    });

    const { isSafeExternalUrl } = module.exports;
    expect(isSafeExternalUrl('https://example.test')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///tmp/private')).toBe(false);
    expect(isSafeExternalUrl('//example.test')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });
});
