PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX exams_date_idx ON exams(date);

CREATE TABLE moodle_courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX moodle_courses_name_idx ON moodle_courses(name);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX modules_name_idx ON modules(name);

CREATE TABLE module_slots (
  module_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY(module_id, id),
  FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE TABLE module_slot_overrides (
  module_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY(module_id, slot_id, event_date),
  FOREIGN KEY(module_id, slot_id) REFERENCES module_slots(module_id, id) ON DELETE CASCADE
);

CREATE TABLE lectures (
  id TEXT PRIMARY KEY,
  module_id TEXT,
  event_date TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE SET NULL
);
CREATE INDEX lectures_event_date_idx ON lectures(event_date);

CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  module_id TEXT,
  moodle_course_id TEXT,
  due TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  data_json TEXT NOT NULL,
  FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE SET NULL,
  FOREIGN KEY(moodle_course_id) REFERENCES moodle_courses(id) ON DELETE SET NULL
);
CREATE INDEX todos_due_idx ON todos(due);

CREATE TABLE study_logs (
  id TEXT PRIMARY KEY,
  exam_id TEXT,
  todo_id TEXT,
  date TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  CHECK((exam_id IS NOT NULL) <> (todo_id IS NOT NULL)),
  FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY(todo_id) REFERENCES todos(id) ON DELETE CASCADE
);
CREATE INDEX study_logs_exam_idx ON study_logs(exam_id, date);
CREATE INDEX study_logs_todo_idx ON study_logs(todo_id, date);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  updated_at TEXT NOT NULL,
  messages_json TEXT NOT NULL
);

CREATE TABLE import_history (
  digest TEXT PRIMARY KEY,
  imported_at TEXT NOT NULL,
  warnings_json TEXT NOT NULL
);
