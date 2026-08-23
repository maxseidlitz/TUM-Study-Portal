const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  buildAssets,
  renderServiceWorker,
} = require('../../scripts/generate-service-worker');

const template = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/service-worker.template.js'),
  'utf8',
);

function manifest(mainHash, cssHash = 'styles1') {
  return {
    files: {
      'main.js': `./static/js/main.${mainHash}.js`,
      'main.css': `./static/css/main.${cssHash}.css`,
      'main.js.map': `./static/js/main.${mainHash}.js.map`,
      'index.html': './index.html',
    },
  };
}

test('build ID is deterministic and changes with fingerprinted JavaScript or CSS', () => {
  const first = renderServiceWorker({ manifest: manifest('code1'), template });
  const repeated = renderServiceWorker({ manifest: manifest('code1'), template });
  const jsChanged = renderServiceWorker({ manifest: manifest('code2'), template });
  const cssChanged = renderServiceWorker({ manifest: manifest('code1', 'styles2'), template });
  const workerChanged = renderServiceWorker({ manifest: manifest('code1'), template: `${template}\n// policy change` });

  assert.equal(first.buildId, repeated.buildId);
  assert.notEqual(first.buildId, jsChanged.buildId);
  assert.notEqual(first.buildId, cssChanged.buildId);
  assert.notEqual(first.buildId, workerChanged.buildId);
  assert.match(first.source, new RegExp(`const BUILD_ID = '${first.buildId}'`));
  assert.doesNotMatch(first.source, /__BUILD_(?:ID|ASSETS)__/);
  assert.deepEqual(buildAssets(manifest('code1')), [
    '/static/css/main.styles1.css',
    '/static/js/main.code1.js',
  ]);
});

test('activation removes only old application caches after the new worker exists', async () => {
  const rendered = renderServiceWorker({ manifest: manifest('newcode'), template });
  const currentCache = `tum-study-static-${rendered.buildId}`;
  const handlers = {};
  const deleted = [];
  let claimed = false;
  const context = {
    URL,
    fetch: () => {},
    self: {
      location: { origin: 'https://portal.test' },
      clients: { claim: async () => { claimed = true; } },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => {},
    },
    caches: {
      keys: async () => ['tum-study-static-old', currentCache, 'another-app-cache'],
      delete: async name => { deleted.push(name); return true; },
      open: async () => ({ addAll: async () => {}, match: async () => null }),
    },
  };
  vm.runInNewContext(rendered.source, context);
  let activation;
  handlers.activate({ waitUntil: promise => { activation = promise; } });
  await activation;

  assert.deepEqual(deleted, ['tum-study-static-old']);
  assert.equal(claimed, true);
});
