const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function pngSize(filename) {
  const data = fs.readFileSync(filename);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

test('web app manifest is installable and references real correctly sized icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.equal(manifest.scope, '/');
  assert.match(manifest.start_url, /^\//);
  assert.ok(manifest.shortcuts.length >= 3);
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable' && icon.sizes === '512x512'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'any' && icon.sizes === '192x192'));

  for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(shortcut => shortcut.icons)]) {
    const expected = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(path.join(root, 'public', icon.src)), expected, icon.src);
  }
  assert.deepEqual(pngSize(path.join(root, 'public/icons/apple-touch-icon.png')), [180, 180]);
});

test('service worker cache policy excludes dynamic HTML, auth, APIs and writes', () => {
  const source = fs.readFileSync(path.join(root, 'public/service-worker.js'), 'utf8');
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /request\.mode === 'navigate'/);
  assert.match(source, /fetch\(request\)\.catch\(async \(\) =>/);
  assert.match(source, /cache\.match\(OFFLINE_URL\)/);
  assert.match(source, /url\.pathname\.startsWith\('\/static\/'\)/);
  assert.match(source, /asset-manifest\.json.*cache: 'no-store'/s);
  const precache = source.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(precache, /['"]\/(?:index\.html|login|api)/);
  assert.doesNotMatch(source, /sync['"]/);
});
