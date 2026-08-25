import { generateId } from './helpers';
import {
  collectSlotOverrides,
  groupImportedItemsToModules,
  slotOverrideKey,
} from './icalGrouping';

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

export async function persistIcalItems(items, { addModule, addLectures, importedModules = [] }) {
  const overrideMap = collectSlotOverrides(importedModules);
  const { modules, lectures } = groupImportedItemsToModules(items);

  for (const module of modules) {
    await requireSuccess(() => addModule({
      name: module.name,
      code: '',
      semester: '',
      moodleUrl: '',
      color: module.color,
      source: 'ical',
      slots: module.slots.map((slot) => {
        const overrides = overrideMap.get(slotOverrideKey(module.name, slot));
        return {
          ...slot,
          id: generateId(),
          ...(overrides ? { overrides } : {}),
        };
      }),
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
 * Browser/self-hosted mode supplies atomicReplace and delegates the complete
 * replacement to one transactional server command. Electron intentionally
 * keeps the local sequential fail-fast path because its JSON store has no
 * transaction primitive.
 */
export async function replaceIcalItems({
  importedLectures,
  importedModules,
  nextItems,
  deleteLecture,
  deleteModule,
  addModule,
  addLectures,
  atomicReplace,
}) {
  if (typeof atomicReplace === 'function') {
    const result = await requireSuccess(() => atomicReplace(nextItems), 'atomic-replace');
    if (result.success === false) {
      throw new ICalPersistenceError('atomic-replace', new Error(result.error || 'Atomic replacement failed'));
    }
    return result;
  }
  for (const lecture of importedLectures) {
    await requireSuccess(() => deleteLecture(lecture.id), 'delete-lecture');
  }
  for (const module of importedModules) {
    await requireSuccess(() => deleteModule(module.id), 'delete-module');
  }
  return persistIcalItems(nextItems, { addModule, addLectures, importedModules });
}
