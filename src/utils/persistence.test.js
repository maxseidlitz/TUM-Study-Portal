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
      deleteLecture: jest.fn().mockResolvedValue(false),
      deleteModule: jest.fn().mockResolvedValue(true),
      addModule: jest.fn(),
      addLectures: jest.fn(),
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
    const addModule = jest.fn().mockResolvedValue(null);
    const addLectures = jest.fn();

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
      addModule: jest.fn(),
      addLectures: jest.fn().mockResolvedValue([oneOffs[0]]),
    })).rejects.toMatchObject({ stage: 'create-lectures' });
  });

  test('delegates browser replacement to one atomic server command', async () => {
    const atomicReplace = jest.fn().mockResolvedValue({
      success: true,
      moduleCount: 1,
      lectureCount: 2,
    });
    const sequential = {
      deleteLecture: jest.fn(),
      deleteModule: jest.fn(),
      addModule: jest.fn(),
      addLectures: jest.fn(),
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
      atomicReplace: jest.fn().mockResolvedValue({ success: false, error: 'rolled back' }),
    })).rejects.toMatchObject({ stage: 'atomic-replace', message: 'rolled back' });
  });
});

describe('study-log persistence workflows', () => {
  test('loads only valid lists and propagates load failures', async () => {
    await expect(loadExamStudyLogs({
      getByExam: jest.fn().mockResolvedValue([{ id: '1' }]),
    }, 'exam-1')).resolves.toEqual([{ id: '1' }]);
    await expect(loadExamStudyLogs({
      getByExam: jest.fn().mockResolvedValue({ success: false }),
    }, 'exam-1')).rejects.toThrow('Invalid study-log response');
    await expect(loadExamStudyLogs({
      getByExam: jest.fn().mockRejectedValue(new Error('offline')),
    }, 'exam-1')).rejects.toThrow('offline');
  });

  test('does not apply create/delete UI callbacks after command failures', async () => {
    const created = jest.fn();
    const deleted = jest.fn();
    const failure = new Error('write failed');

    await expect(createStudyLog({
      create: jest.fn().mockRejectedValue(failure),
    }, { id: 'log-1' }, created)).rejects.toThrow('write failed');
    await expect(deleteStudyLog({
      delete: jest.fn().mockRejectedValue(failure),
    }, 'log-1', deleted)).rejects.toThrow('write failed');

    expect(created).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
  });

  test('applies study-log callbacks only after confirmed commands', async () => {
    const created = jest.fn();
    const deleted = jest.fn();
    const studyLogsApi = {
      create: jest.fn().mockResolvedValue({ success: true }),
      delete: jest.fn().mockResolvedValue({ success: true }),
    };

    await createStudyLog(studyLogsApi, { id: 'log-1' }, created);
    await deleteStudyLog(studyLogsApi, 'log-1', deleted);

    expect(created).toHaveBeenCalledWith({ id: 'log-1' });
    expect(deleted).toHaveBeenCalledWith('log-1');
  });
});
