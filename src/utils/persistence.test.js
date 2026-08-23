import {
  ICalPersistenceError,
  persistIcalItems,
  replaceIcalItems,
} from './icalPersistence';
import {
  createStudyLog,
  deleteStudyLog,
  loadExamStudyLogs,
} from './studyLogPersistence';

describe('iCal persistence workflows', () => {
  test('replacement stops at the first failed delete', async () => {
    const actions = {
      deleteLecture: vi.fn().mockResolvedValue(false),
      deleteModule: vi.fn().mockResolvedValue(true),
      addModule: vi.fn(),
      addLectures: vi.fn(),
    };

    await expect(replaceIcalItems({
      importedLectures: [{ id: 'lecture-1' }, { id: 'lecture-2' }],
      importedModules: [{ id: 'module-1' }],
      nextItems: [],
      ...actions,
    })).rejects.toMatchObject({
      name: 'ICalPersistenceError',
      stage: 'delete-lecture',
    });

    expect(actions.deleteLecture).toHaveBeenCalledTimes(1);
    expect(actions.deleteModule).not.toHaveBeenCalled();
    expect(actions.addModule).not.toHaveBeenCalled();
    expect(actions.addLectures).not.toHaveBeenCalled();
  });

  test('creation stops after a failed module and does not create lectures', async () => {
    const recurring = [
      { name: 'Analysis', day: 'Mo', time: '10:00', eventDate: '2026-01-01' },
      { name: 'Analysis', day: 'Mo', time: '10:00', eventDate: '2026-01-08' },
      { name: 'One-off', day: 'Di', time: '12:00', eventDate: '2026-01-02' },
    ];
    const addModule = vi.fn().mockResolvedValue(null);
    const addLectures = vi.fn();

    await expect(persistIcalItems(recurring, { addModule, addLectures }))
      .rejects.toBeInstanceOf(ICalPersistenceError);

    expect(addModule).toHaveBeenCalledTimes(1);
    expect(addLectures).not.toHaveBeenCalled();
  });

  test('rejects partial bulk creation instead of reporting success', async () => {
    const oneOffs = [
      { name: 'Special', day: 'Di', time: '12:00', eventDate: '2026-01-02' },
      { name: 'Exam', day: 'Fr', time: '08:00', eventDate: '2026-01-09' },
    ];

    await expect(persistIcalItems(oneOffs, {
      addModule: vi.fn(),
      addLectures: vi.fn().mockResolvedValue([oneOffs[0]]),
    })).rejects.toMatchObject({ stage: 'create-lectures' });
  });

  test('delegates browser replacement to one atomic server command', async () => {
    const atomicReplace = vi.fn().mockResolvedValue({
      success: true,
      moduleCount: 1,
      lectureCount: 2,
    });
    const sequential = {
      deleteLecture: vi.fn(),
      deleteModule: vi.fn(),
      addModule: vi.fn(),
      addLectures: vi.fn(),
    };
    await expect(replaceIcalItems({
      importedLectures: [{ id: 'old-l' }],
      importedModules: [{ id: 'old-m' }],
      nextItems: [{ name: 'Next' }],
      atomicReplace,
      ...sequential,
    })).resolves.toMatchObject({ success: true, moduleCount: 1 });
    expect(atomicReplace).toHaveBeenCalledWith([{ name: 'Next' }]);
    Object.values(sequential).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });

  test('surfaces atomic replacement failures without falling back to partial writes', async () => {
    await expect(replaceIcalItems({
      importedLectures: [],
      importedModules: [],
      nextItems: [],
      atomicReplace: vi.fn().mockResolvedValue({ success: false, error: 'rolled back' }),
    })).rejects.toMatchObject({ stage: 'atomic-replace', message: 'rolled back' });
  });
});

describe('study-log persistence workflows', () => {
  test('loads only valid lists and propagates load failures', async () => {
    await expect(loadExamStudyLogs({
      getByExam: vi.fn().mockResolvedValue([{ id: '1' }]),
    }, 'exam-1')).resolves.toEqual([{ id: '1' }]);
    await expect(loadExamStudyLogs({
      getByExam: vi.fn().mockResolvedValue({ success: false }),
    }, 'exam-1')).rejects.toThrow('Invalid study-log response');
    await expect(loadExamStudyLogs({
      getByExam: vi.fn().mockRejectedValue(new Error('offline')),
    }, 'exam-1')).rejects.toThrow('offline');
  });

  test('does not apply create/delete UI callbacks after command failures', async () => {
    const created = vi.fn();
    const deleted = vi.fn();
    const failure = new Error('write failed');

    await expect(createStudyLog({
      create: vi.fn().mockRejectedValue(failure),
    }, { id: 'log-1' }, created)).rejects.toThrow('write failed');
    await expect(deleteStudyLog({
      delete: vi.fn().mockRejectedValue(failure),
    }, 'log-1', deleted)).rejects.toThrow('write failed');

    expect(created).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
  });

  test('applies study-log callbacks only after confirmed commands', async () => {
    const created = vi.fn();
    const deleted = vi.fn();
    const studyLogsApi = {
      create: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    };

    await createStudyLog(studyLogsApi, { id: 'log-1' }, created);
    await deleteStudyLog(studyLogsApi, 'log-1', deleted);

    expect(created).toHaveBeenCalledWith({ id: 'log-1' });
    expect(deleted).toHaveBeenCalledWith('log-1');
  });
});
