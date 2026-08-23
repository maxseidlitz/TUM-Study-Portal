const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const BetterSqlite3 = require('better-sqlite3');
const { StudyDatabase } = require('./db/database');

function syncPath(target, filesystem = fs) {
  const descriptor = filesystem.openSync(target, 'r');
  try {
    filesystem.fsyncSync(descriptor);
  } finally {
    filesystem.closeSync(descriptor);
  }
}

function removeSidecars(filename, filesystem = fs) {
  for (const suffix of ['-wal', '-shm']) filesystem.rmSync(`${filename}${suffix}`, { force: true });
}

function requireCheckpoint(db) {
  const [checkpoint] = db.pragma('wal_checkpoint(TRUNCATE)');
  if (checkpoint?.busy) throw new Error('SQLite database is busy; stop the server before restore');
}

function verifyDatabase(filename, { checkpoint = false } = {}) {
  const db = new BetterSqlite3(filename, checkpoint ? {} : { readonly: true, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('SQLite integrity check failed');
    }
    if (db.pragma('foreign_key_check').length) throw new Error('SQLite foreign key check failed');
    if (checkpoint) requireCheckpoint(db);
  } finally {
    db.close();
  }
}

function preservePrevious(destination, previous, directory, filesystem = fs) {
  verifyDatabase(destination, { checkpoint: true });
  syncPath(destination, filesystem);
  removeSidecars(destination, filesystem);
  syncPath(directory, filesystem);
  try {
    filesystem.linkSync(destination, previous);
  } catch {
    filesystem.copyFileSync(destination, previous, fs.constants.COPYFILE_EXCL);
  }
  syncPath(previous, filesystem);
  syncPath(directory, filesystem);
  try {
    verifyDatabase(previous);
  } catch (error) {
    filesystem.rmSync(previous, { force: true });
    syncPath(directory, filesystem);
    throw error;
  }
}

function restoreBackup({
  source, destination, key, filesystem = fs, now = () => new Date(),
}) {
  if (!source) throw new Error('Backup path is required');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('BACKUP_KEY must decode to 32 bytes');
  let payload;
  try {
    payload = JSON.parse(filesystem.readFileSync(source, 'utf8'));
  } catch {
    throw new Error('Backup file is unreadable or malformed');
  }
  if (payload.version !== 1 || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error('Unsupported backup format');
  }

  const directory = path.dirname(destination);
  filesystem.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(destination)}.restore-${process.pid}`);
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const previous = `${destination}.before-restore-${stamp}`;
  let validationDb;
  let installed = false;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    filesystem.writeFileSync(temporary, plain, { mode: 0o600, flag: 'wx' });
    validationDb = new StudyDatabase(temporary);
    if (validationDb.db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('SQLite integrity check failed');
    }
    if (validationDb.db.pragma('foreign_key_check').length) {
      throw new Error('SQLite foreign key check failed');
    }
    validationDb.db.prepare('DELETE FROM sessions').run();
    requireCheckpoint(validationDb.db);
    validationDb.close();
    validationDb = null;
    syncPath(temporary, filesystem);
    removeSidecars(temporary, filesystem);
    syncPath(directory, filesystem);

    let previousPath = null;
    if (filesystem.existsSync(destination)) {
      preservePrevious(destination, previous, directory, filesystem);
      previousPath = previous;
    }
    // POSIX rename in the same directory replaces the existing name atomically:
    // DATABASE_PATH always resolves to either the complete old or complete new DB.
    filesystem.renameSync(temporary, destination);
    installed = true;
    syncPath(destination, filesystem);
    syncPath(directory, filesystem);
    return { destination, previous: previousPath };
  } finally {
    if (validationDb) validationDb.close();
    if (!installed) filesystem.rmSync(temporary, { force: true });
    removeSidecars(temporary, filesystem);
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

module.exports = { preservePrevious, restoreBackup };
