import { generateId } from './helpers';
import { groupImportedItemsToModules } from './icalGrouping';

export class ICalPersistenceError extends Error {
  constructor(stage, cause) {
    super(cause?.message || `iCal persistence failed during ${stage}`);
    this.name = 'ICalPersistenceError';
    this.stage = stage;
    this.cause = cause;
  }
}

async function requireSuccess(operation, stage) {
  try {
    const result = await operation();
    if (result === false || result == null) throw new Error(`Operation failed during ${stage}`);
    return result;
  } catch (error) {
    if (error instanceof ICalPersistenceError) throw error;
    throw new ICalPersistenceError(stage, error);
  }
}

export async function persistIcalItems(items, { addModule, addLectures }) {
  const { modules, lectures } = groupImportedItemsToModules(items);

  for (const module of modules) {
    await requireSuccess(() => addModule({
      name: module.name,
      code: '',
      semester: '',
      moodleUrl: '',
      color: module.color,
      source: 'ical',
      slots: module.slots.map(slot => ({ ...slot, id: generateId() })),
    }), 'create-module');
  }

  if (lectures.length > 0) {
    const created = await requireSuccess(() => addLectures(lectures), 'create-lectures');
    if (!Array.isArray(created) || created.length !== lectures.length) {
      throw new ICalPersistenceError('create-lectures', new Error('Not all lectures were created'));
    }
  }

  return { moduleCount: modules.length, lectureCount: lectures.length };
}

/**
 * Replaces imported data sequentially and stops at the first failed command.
 * Confirmed commands update both the backing store and React state through the
 * CRUD callbacks. Rollback/transactional replacement requires a future server
 * endpoint and cannot be guaranteed by this client-side orchestration.
 */
export async function replaceIcalItems({
  importedLectures,
  importedModules,
  nextItems,
  deleteLecture,
  deleteModule,
  addModule,
  addLectures,
}) {
  for (const lecture of importedLectures) {
    await requireSuccess(() => deleteLecture(lecture.id), 'delete-lecture');
  }
  for (const module of importedModules) {
    await requireSuccess(() => deleteModule(module.id), 'delete-module');
  }
  return persistIcalItems(nextItems, { addModule, addLectures });
}
