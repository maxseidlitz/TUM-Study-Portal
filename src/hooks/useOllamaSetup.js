import { useState, useEffect } from 'react';

export function useOllamaSetup() {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!window.api?.ollama) return undefined;
    window.api.ollama.getSetupState().then(setState).catch(() => {});
    const unsubscribe = window.api.ollama.onSetupProgress(setState);
    return unsubscribe;
  }, []);

  return state;
}

export function isOllamaSetupActive(state) {
  if (!state) return false;
  return ['starting', 'downloading', 'error'].includes(state.phase);
}
