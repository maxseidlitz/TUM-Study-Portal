const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PRIVATE_KEY_PATTERNS = [
  new RegExp(['-----BEGIN ', '(?:RSA |EC |DSA |OPENSSH )?', 'PRIVATE KEY-----'].join('')),
  new RegExp(['-----BEGIN PGP ', 'PRIVATE KEY BLOCK-----'].join('')),
  new RegExp(['PuTTY-User-', 'Key-File-\\d+:'].join('')),
  new RegExp(['AGE-SECRET-', 'KEY-[A-Z0-9-]+'].join('')),
];

function isForbiddenEnv(filename) {
  const basename = path.basename(filename);
  return (basename === '.env' || basename.startsWith('.env.'))
    && !basename.endsWith('.example');
}

function trackedFiles(cwd = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z'], { cwd })
    .toString('utf8').split('\0').filter(Boolean);
}

function containsPrivateKey(content) {
  return PRIVATE_KEY_PATTERNS.some(pattern => pattern.test(content));
}

function scanRepository(cwd = process.cwd()) {
  const findings = [];
  for (const filename of trackedFiles(cwd)) {
    if (isForbiddenEnv(filename)) findings.push(`${filename}: tracked environment file`);
    const absolute = path.join(cwd, filename);
    let content;
    try {
      content = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    if (containsPrivateKey(content)) {
      findings.push(`${filename}: private key material`);
    }
  }
  return findings;
}

if (require.main === module) {
  const findings = scanRepository();
  if (findings.length) {
    process.stderr.write(`Repository secret check failed:\n- ${findings.join('\n- ')}\n`);
    process.exit(1);
  }
  process.stdout.write('Repository secret check passed\n');
}

module.exports = { containsPrivateKey, isForbiddenEnv, scanRepository };
