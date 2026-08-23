const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { StudyDatabase } = require('./db/database');

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function restoreBackup({ source, destination, key }) {
  if (!source) throw new Error('Backup path is required');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('BACKUP_KEY must decode to 32 bytes');
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch {
    throw new Error('Backup file is unreadable or malformed');
  }
  if (payload.version !== 1 || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error('Unsupported backup format');
  }

  const directory = path.dirname(destination);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(destination)}.restore-${process.pid}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const previous = `${destination}.before-restore-${stamp}`;
  const moved = [];
  let validationDb;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    fs.writeFileSync(temporary, plain, { mode: 0o600, flag: 'wx' });
    validationDb = new StudyDatabase(temporary);
    if (validationDb.db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('SQLite integrity check failed');
    }
    if (validationDb.db.pragma('foreign_key_check').length) {
      throw new Error('SQLite foreign key check failed');
    }
    validationDb.db.prepare('DELETE FROM sessions').run();
    validationDb.db.pragma('wal_checkpoint(TRUNCATE)');
    validationDb.close();
    validationDb = null;

    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const current = `${destination}${suffix}`;
        if (!fs.existsSync(current)) continue;
        const backup = `${previous}${suffix}`;
        fs.renameSync(current, backup);
        moved.push([backup, current]);
      }
      fs.renameSync(temporary, destination);
      syncDirectory(directory);
    } catch (error) {
      if (moved.length && fs.existsSync(destination)) {
        fs.renameSync(destination, `${destination}.failed-restore-${stamp}`);
      }
      for (const [backup, original] of moved.reverse()) {
        if (fs.existsSync(backup)) fs.renameSync(backup, original);
      }
      throw error;
    }
    return { destination, previous: moved.length ? previous : null };
  } finally {
    if (validationDb) validationDb.close();
    fs.rmSync(temporary, { force: true });
    fs.rmSync(`${temporary}-wal`, { force: true });
    fs.rmSync(`${temporary}-shm`, { force: true });
  }
}

if (require.main === module) {
  const source = process.argv[2];
  const destination = process.env.DATABASE_PATH || path.resolve('data/study-portal.sqlite');
  const key = Buffer.from(process.env.BACKUP_KEY || '', 'base64');
  try {
    const outcome = restoreBackup({ source, destination, key });
    process.stdout.write(`Restore completed: ${outcome.destination}\n`);
  } catch (error) {
    process.stderr.write(`Restore failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { restoreBackup };
