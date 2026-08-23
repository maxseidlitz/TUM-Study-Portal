import { useState, useEffect } from 'react';
import { api } from '../api';

export function useOllamaSetup() {
  const [state, setState] = useState(null);

  useEffect(() => {
    api.ollama.getSetupState().then(setState).catch(() => {});
    const unsubscribe = api.ollama.onSetupProgress(setState);
    return unsubscribe;
  }, []);

  return state;
}

export function isOllamaSetupActive(state) {
  if (!state) return false;
  return ['starting', 'downloading', 'error'].includes(state.phase);
}
