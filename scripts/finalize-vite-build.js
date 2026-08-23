const fs = require('node:fs');
const path = require('node:path');
const { generate } = require('./generate-service-worker');

const buildDir = path.resolve('build');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = walk(buildDir)
  .map(file => path.relative(buildDir, file).split(path.sep).join('/'))
  .filter(file => file !== 'asset-manifest.json' && file !== 'service-worker.js')
  .sort();
const entrypoints = files
  .filter(file => /^static\/(?:css|js)\/.+\.(?:css|js)$/.test(file))
  .map(file => `./${file}`);
const manifest = {
  files: Object.fromEntries(files.map(file => [file, `./${file}`])),
  entrypoints,
};

fs.writeFileSync(
  path.join(buildDir, 'asset-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
generate({ buildDir });
