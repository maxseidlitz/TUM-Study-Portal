export async function loadExamStudyLogs(studyLogsApi, examId) {
  const logs = await studyLogsApi.getByExam(examId);
  if (!Array.isArray(logs)) throw new Error('Invalid study-log response');
  return logs;
}

export async function createStudyLog(studyLogsApi, log, onCreated) {
  await studyLogsApi.create(log);
  onCreated?.(log);
  return log;
}

export async function deleteStudyLog(studyLogsApi, id, onDeleted) {
  await studyLogsApi.delete(id);
  onDeleted?.(id);
  return id;
}
