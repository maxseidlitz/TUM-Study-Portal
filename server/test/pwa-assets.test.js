const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
    assert.match(icon.src, /^\.\/icons\//);
    const expected = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(path.join(root, 'public', icon.src)), expected, icon.src);
  }
  assert.deepEqual(pngSize(path.join(root, 'public/icons/apple-touch-icon.png')), [180, 180]);
});

test('service worker cache policy excludes dynamic HTML, auth, APIs and writes', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/service-worker.template.js'), 'utf8');
  assert.match(source, /CACHE_NAME = `\$\{CACHE_PREFIX\}\$\{BUILD_ID\}`/);
  assert.match(source, /cache\.addAll\(PRECACHE_URLS\)/);
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /request\.mode === 'navigate'/);
  assert.match(source, /fetch\(request\)\.catch\(async \(\) =>/);
  assert.match(source, /cache\.match\(OFFLINE_URL\)/);
  assert.match(source, /url\.pathname\.startsWith\('\/static\/'\)/);
  assert.doesNotMatch(source, /asset-manifest\.json|index\.html/);
  const precache = source.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(precache, /['"]\/(?:index\.html|login|api)/);
  assert.doesNotMatch(source, /sync['"]/);
});

test('PWA document assets are relative and do not load external fonts', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /rel="manifest" href="\.\/manifest\.json"/);
  assert.match(source, /rel="apple-touch-icon"[^>]+href="\.\/icons\/apple-touch-icon\.png"/);
  assert.doesNotMatch(source, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(source, /rel="(?:manifest|apple-touch-icon)"[^>]+href="\//);
});

test('offline page uses a CSP-compatible cached locale script for de/en/tr', () => {
  const html = fs.readFileSync(path.join(root, 'public/offline.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public/offline-locale.js'), 'utf8');
  assert.match(html, /<script src="\.\/offline-locale\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  for (const [language, expectedTitle] of [
    ['de-DE', 'Du bist offline'],
    ['en-US', 'You are offline'],
    ['tr-TR', 'Çevrimdışısınız'],
  ]) {
    const elements = {
      'offline-title': { textContent: '' },
      'offline-body': { textContent: '' },
      'offline-retry': { textContent: '' },
    };
    const document = {
      documentElement: { lang: '' },
      title: '',
      getElementById: id => elements[id],
    };
    vm.runInNewContext(script, {
      document,
      navigator: { language, languages: [language] },
    });
    assert.equal(document.documentElement.lang, language.slice(0, 2));
    assert.equal(elements['offline-title'].textContent, expectedTitle);
  }
});
