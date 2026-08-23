const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  containsPrivateKey,
  isForbiddenEnv,
  scanRepository,
} = require('../../scripts/check-repository-secrets');

const root = path.resolve(__dirname, '../..');

function ignored(filename) {
  return spawnSync('git', ['check-ignore', '--no-index', '--quiet', filename], { cwd: root }).status === 0;
}

test('runtime env files are ignored while examples remain trackable', () => {
  assert.equal(ignored('.env'), true);
  assert.equal(ignored('.env.server'), true);
  assert.equal(ignored('.env.production'), true);
  assert.equal(ignored('.env.local'), true);
  assert.equal(ignored('.env.server.example'), false);
  assert.equal(ignored('.env.example'), false);
  assert.equal(isForbiddenEnv('.env.server'), true);
  assert.equal(isForbiddenEnv('.env.server.example'), false);
});

test('tracked repository has no runtime env or typical private keys', () => {
  assert.deepEqual(scanRepository(root), []);
  assert.doesNotThrow(() => execFileSync('node', ['scripts/check-repository-secrets.js'], {
    cwd: root,
    stdio: 'pipe',
  }));
});

test('private key scanner recognizes common key formats', () => {
  assert.equal(containsPrivateKey(['-----BEGIN OPENSSH ', 'PRIVATE KEY-----\nredacted'].join('')), true);
  assert.equal(containsPrivateKey(['-----BEGIN PGP ', 'PRIVATE KEY BLOCK-----\nredacted'].join('')), true);
  assert.equal(containsPrivateKey('ordinary documentation without key material'), false);
});

test('CI actions and mutable upstream image tags are digest pinned', () => {
  for (const workflow of ['ci.yml', 'build-desktop.yml']) {
    const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    for (const match of source.matchAll(/uses:\s*\S+@([^\s#]+)/g)) {
      assert.match(match[1], /^[a-f0-9]{40}$/, `${workflow}: ${match[0]}`);
    }
  }
  assert.match(
    fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'),
    /node:22\.14\.0-bookworm-slim@sha256:[a-f0-9]{64}/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8'),
    /ollama\/ollama:0\.24\.0@sha256:[a-f0-9]{64}/,
  );
});

test('application and Ollama containers drop capabilities and prevent privilege escalation', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  for (const service of ['app', 'ollama']) {
    const block = compose.match(new RegExp(`\\n  ${service}:([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:|\\nvolumes:)`))?.[1] || '';
    assert.match(block, /security_opt:\s*\n\s+- no-new-privileges:true/);
    assert.match(block, /cap_drop:\s*\n\s+- ALL/);
  }
});
