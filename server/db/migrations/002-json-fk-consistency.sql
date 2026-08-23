-- Repair rows whose relational foreign-key columns were already cleared by
-- ON DELETE SET NULL while the compatibility JSON retained stale IDs.
UPDATE todos
SET data_json = json_set(data_json, '$.moduleId', '')
WHERE module_id IS NULL
  AND COALESCE(json_extract(data_json, '$.moduleId'), '') <> '';

UPDATE todos
SET data_json = json_set(data_json, '$.moodleCourseId', '')
WHERE moodle_course_id IS NULL
  AND COALESCE(json_extract(data_json, '$.moodleCourseId'), '') <> '';

UPDATE lectures
SET data_json = json_set(data_json, '$.moduleId', '')
WHERE module_id IS NULL
  AND COALESCE(json_extract(data_json, '$.moduleId'), '') <> '';

-- Keep JSON compatibility fields synchronized for all future FK deletions.
CREATE TRIGGER modules_clear_todo_json_fk
AFTER DELETE ON modules
BEGIN
  UPDATE todos
  SET data_json = json_set(data_json, '$.moduleId', '')
  WHERE module_id IS NULL
    AND json_extract(data_json, '$.moduleId') = OLD.id;
END;

CREATE TRIGGER modules_clear_lecture_json_fk
AFTER DELETE ON modules
BEGIN
  UPDATE lectures
  SET data_json = json_set(data_json, '$.moduleId', '')
  WHERE module_id IS NULL
    AND json_extract(data_json, '$.moduleId') = OLD.id;
END;

CREATE TRIGGER moodle_clear_todo_json_fk
AFTER DELETE ON moodle_courses
BEGIN
  UPDATE todos
  SET data_json = json_set(data_json, '$.moodleCourseId', '')
  WHERE moodle_course_id IS NULL
    AND json_extract(data_json, '$.moodleCourseId') = OLD.id;
END;
