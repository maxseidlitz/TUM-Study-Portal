const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const source = process.argv[2];
const destination = process.env.DATABASE_PATH || path.resolve('data/study-portal.sqlite');
if (!source) fail('Usage: npm run server:restore -- /path/to/backup.enc');
const key = Buffer.from(process.env.BACKUP_KEY || '', 'base64');
if (key.length !== 32) fail('BACKUP_KEY must be a base64 encoded 32-byte key');

let payload;
try {
  payload = JSON.parse(fs.readFileSync(source, 'utf8'));
} catch {
  fail('Backup file is unreadable or malformed');
}
if (payload.version !== 1 || !payload.ciphertext || !payload.iv || !payload.authTag) {
  fail('Unsupported backup format');
}

const temporary = `${destination}.restore-${process.pid}`;
try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, plain, { mode: 0o600 });
  const db = new Database(temporary);
  db.pragma('foreign_keys = ON');
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('SQLite integrity check failed');
  if (db.pragma('foreign_key_check').length) throw new Error('SQLite foreign key check failed');
  db.prepare('DELETE FROM sessions').run();
  db.close();
  if (fs.existsSync(destination)) fs.renameSync(destination, `${destination}.before-restore`);
  fs.renameSync(temporary, destination);
  process.stdout.write(`Restore completed: ${destination}\n`);
} catch (error) {
  fs.rmSync(temporary, { force: true });
  fail(`Restore failed: ${error.message}`);
}
