const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STATIC_ASSET_PATTERN = /^\.?\/?static\/.+\.(?:css|js)$/;
const STABLE_PRECACHE_FILES = ['offline.html', 'offline-locale.js'];

function buildAssets(manifest) {
  return [...new Set(Object.values(manifest.files || {})
    .filter(value => typeof value === 'string' && STATIC_ASSET_PATTERN.test(value))
    .map(value => `/${value.replace(/^\.?\//, '')}`))]
    .sort();
}

function contentFingerprints(buildDir, files = STABLE_PRECACHE_FILES) {
  return Object.fromEntries(files.map(file => [
    file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(buildDir, file))).digest('hex'),
  ]));
}

function buildIdForAssets(assets, template = '', stableContent = {}) {
  if (!assets.length) throw new Error('asset-manifest contains no fingerprinted JavaScript or CSS assets');
  const templateHash = crypto.createHash('sha256').update(template).digest('hex');
  return crypto.createHash('sha256')
    .update(JSON.stringify({ assets, stableContent, templateHash }))
    .digest('hex')
    .slice(0, 20);
}

function renderServiceWorker({ manifest, template, stableContent = {} }) {
  const assets = buildAssets(manifest);
  const buildId = buildIdForAssets(assets, template, stableContent);
  if (!template.includes('__BUILD_ID__') || !template.includes('__BUILD_ASSETS__')) {
    throw new Error('service-worker template placeholders are missing');
  }
  return {
    assets,
    buildId,
    source: template
      .replaceAll('__BUILD_ID__', buildId)
      .replace('__BUILD_ASSETS__', JSON.stringify(assets, null, 2)),
  };
}

function generate({
  buildDir = path.resolve('build'),
  templatePath = path.resolve('scripts/service-worker.template.js'),
} = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, 'asset-manifest.json'), 'utf8'));
  const template = fs.readFileSync(templatePath, 'utf8');
  const rendered = renderServiceWorker({
    manifest,
    template,
    stableContent: contentFingerprints(buildDir),
  });
  fs.writeFileSync(path.join(buildDir, 'service-worker.js'), rendered.source);
  process.stdout.write(`Generated service worker for build ${rendered.buildId}\n`);
  return rendered;
}

if (require.main === module) generate();

module.exports = {
  buildAssets, buildIdForAssets, contentFingerprints, generate, renderServiceWorker,
};
