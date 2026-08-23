const BACKUP_FORMAT = 'tum-study-portal-backup';
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_COLLECTIONS = Object.freeze([
  'exams',
  'lectures',
  'todos',
  'moodle_courses',
  'modules',
  'study_logs',
  'chat_sessions',
]);

class BackupFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateBackupStructure(input) {
  if (!isRecord(input)) throw new BackupFormatError('Invalid backup root');
  const hasFormatMetadata = Object.hasOwn(input, 'format') || Object.hasOwn(input, 'formatVersion');
  if (hasFormatMetadata) {
    if (input.format !== BACKUP_FORMAT || input.formatVersion !== BACKUP_FORMAT_VERSION) {
      throw new BackupFormatError('Unsupported backup format or version');
    }
    const missing = BACKUP_COLLECTIONS.filter(keyName => !Array.isArray(input[keyName]));
    if (missing.length) {
      throw new BackupFormatError(`Versioned backup is missing collections: ${missing.join(', ')}`);
    }
  } else if (!BACKUP_COLLECTIONS.some(keyName => (
    Array.isArray(input[keyName]) && input[keyName].length > 0
  ))) {
    throw new BackupFormatError('Legacy backup must contain at least one non-empty recognized collection');
  }
  if (input.settings !== undefined && !isRecord(input.settings)) {
    throw new BackupFormatError('Backup settings must be an object');
  }
  return { versioned: hasFormatMetadata };
}

function backupPayload(source) {
  const payload = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
  };
  for (const keyName of BACKUP_COLLECTIONS) {
    payload[keyName] = Array.isArray(source?.[keyName]) ? source[keyName] : [];
  }
  payload.settings = isRecord(source?.settings) ? { ...source.settings } : {};
  delete payload.settings.geminiApiKey;
  payload.modules_migration_v1 = source?.modules_migration_v1 === true;
  return payload;
}

function importStorePayload(input) {
  validateBackupStructure(input);
  const payload = {};
  for (const keyName of BACKUP_COLLECTIONS) {
    payload[keyName] = Array.isArray(input[keyName]) ? input[keyName] : [];
  }
  payload.settings = isRecord(input.settings) ? input.settings : {};
  payload.modules_migration_v1 = input.modules_migration_v1 === true;
  return payload;
}

module.exports = {
  BACKUP_COLLECTIONS,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  backupPayload,
  importStorePayload,
  validateBackupStructure,
};
