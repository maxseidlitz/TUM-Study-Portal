import { useCallback } from 'react';
import { generateId } from '../utils/helpers';

/**
 * Generische CRUD-Callbacks für Entitäten des gemeinsamen API-Vertrags.
 */
export function useEntityCrud(api, setState, options = {}) {
  const {
    sortFn,
    mapOnCreate,
    mapOnLoad,
    onError,
    getId = (item) => item.id,
  } = options;

  const applySort = useCallback((list) => {
    if (!sortFn) return list;
    return [...list].sort(sortFn);
  }, [sortFn]);

  const handleError = useCallback((err) => {
    console.error('[CRUD]', err);
    if (onError) onError(err);
  }, [onError]);

  const add = useCallback(async (data) => {
    let item = { id: generateId(), ...data };
    if (mapOnCreate) item = mapOnCreate(item);
    try {
      await api.create(item);
    } catch (err) { handleError(err); return null; }
    setState(prev => applySort([...prev, item]));
    return item;
  }, [api, setState, applySort, mapOnCreate, handleError]);

  const update = useCallback(async (item) => {
    try {
      await api.update(item);
    } catch (err) { handleError(err); return false; }
    setState(prev => applySort(prev.map(x => (getId(x) === getId(item) ? item : x))));
    return true;
  }, [api, setState, applySort, getId, handleError]);

  const remove = useCallback(async (id) => {
    try {
      await api.delete(id);
    } catch (err) { handleError(err); return false; }
    setState(prev => prev.filter(x => getId(x) !== id));
    return true;
  }, [api, setState, getId, handleError]);

  const addMany = useCallback(async (items) => {
    const withIds = items.map(data => {
      let item = { id: generateId(), ...data };
      if (mapOnCreate) item = mapOnCreate(item);
      return item;
    });
    const created = [];
    for (const item of withIds) {
      try {
        await api.create(item);
      } catch (err) {
        handleError(err);
        return created;
      }
      created.push(item);
      // Keep local state aligned with every server-confirmed step even when a
      // later item in this non-transactional batch fails.
      setState(prev => applySort([...prev, item]));
    }
    return created;
  }, [api, setState, applySort, mapOnCreate, handleError]);

  const mapLoaded = mapOnLoad
    ? (list) => list.map(mapOnLoad)
    : (list) => list;

  return { add, update, remove, addMany, mapLoaded, applySort };
}
