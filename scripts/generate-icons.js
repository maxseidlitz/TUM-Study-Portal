#!/usr/bin/env node
/**
 * Rasterizes the TUM Study Portal mark into PWA, shortcut, Electron and favicon assets.
 * Requires rsvg-convert (librsvg) and Python Pillow.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const iconsDir = path.join(root, 'public/icons');
const TUM_BLUE = '#0065BD';
const PAGE_LEFT = '#FFFFFF';
const PAGE_RIGHT = '#E4F0FA';

function bookMark({ scale = 1, cx = 32, cy = 32 } = {}) {
  const s = (value, origin) => origin + (value - origin) * scale;
  const l = (x, y) => `${s(x, cx).toFixed(2)} ${s(y, cy).toFixed(2)}`;
  return `
    <path fill="${PAGE_LEFT}" d="M${l(30.7, 22.2)} L${l(12.2, 30.8)} L${l(12.2, 49.4)} L${l(30.7, 40.8)} Z"/>
    <path fill="${PAGE_RIGHT}" d="M${l(33.3, 22.2)} L${l(51.8, 30.8)} L${l(51.8, 49.4)} L${l(33.3, 40.8)} Z"/>
  `;
}

function appSvg({ rounded = false, padded = false, size = 64 } = {}) {
  const radius = rounded ? (size * 0.22).toFixed(2) : 0;
  const mark = bookMark({ scale: padded ? 0.78 : 1 });
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" rx="${radius}" fill="${TUM_BLUE}"/>
  ${mark.trim()}
</svg>
`;
}

function shortcutSvg(kind) {
  const glyphs = {
    today: `
      <rect x="18" y="20" width="28" height="26" rx="4" fill="none" stroke="#fff" stroke-width="2.4"/>
      <path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" d="M24 17v6M40 17v6M18 28h28"/>
      <rect x="28" y="33" width="8" height="8" rx="1.6" fill="#fff"/>
    `,
    todos: `
      <rect x="17" y="17" width="30" height="30" rx="6" fill="none" stroke="#fff" stroke-width="2.4"/>
      <path fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="M24 33l5.2 5.2L41 26.4"/>
    `,
    lectures: `
      <path fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" d="M16 46.5A5 5 0 0 1 21 41.5h27V16H21a5 5 0 0 0-5 5z"/>
      <path fill="none" stroke="#fff" stroke-width="2.4" d="M21 16v25.5"/>
    `,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="96" height="96">
  <rect width="64" height="64" rx="14" fill="${TUM_BLUE}"/>
  ${glyphs[kind]}
</svg>
`;
}

function rasterize(svg, dest, size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', dest], {
    input: svg,
    encoding: 'utf8',
  });
}

function writeIco(pngPath, icoPath) {
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert('RGBA')
im.save(${JSON.stringify(icoPath)}, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
`]);
}

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(iconsDir, { recursive: true });

const roundedSvg = appSvg({ rounded: true });
const squareSvg = appSvg({ rounded: false });
const maskableSvg = appSvg({ rounded: false, padded: true });

fs.writeFileSync(path.join(assetsDir, 'logo.svg'), roundedSvg);
fs.writeFileSync(path.join(iconsDir, 'logo.svg'), roundedSvg);

rasterize(roundedSvg, path.join(iconsDir, 'icon-192.png'), 192);
rasterize(roundedSvg, path.join(iconsDir, 'icon-512.png'), 512);
rasterize(maskableSvg, path.join(iconsDir, 'icon-maskable-192.png'), 192);
rasterize(maskableSvg, path.join(iconsDir, 'icon-maskable-512.png'), 512);
rasterize(squareSvg, path.join(iconsDir, 'apple-touch-icon.png'), 180);
rasterize(squareSvg, path.join(assetsDir, 'icon.png'), 1024);

for (const kind of ['today', 'todos', 'lectures']) {
  rasterize(shortcutSvg(kind), path.join(iconsDir, `shortcut-${kind}-96.png`), 96);
}

const faviconPng = path.join(iconsDir, 'favicon-32.png');
rasterize(roundedSvg, faviconPng, 32);
writeIco(faviconPng, path.join(root, 'public/favicon.ico'));

console.log('Generated app icons in public/icons, assets/icon.png and public/favicon.ico');
