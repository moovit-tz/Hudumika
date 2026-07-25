import { useState, useEffect, useCallback } from 'react';

// Persisted "which SEAL warehouse (compartment) am I viewing" selection —
// mirrors the localStorage + custom-event pattern useFullLayout.ts already
// uses for the boxed/full-width toggle, so every mounted component reading
// the same key stays in sync without a shared React context. null means
// "All Compartments" (no scope filter applied).
const STORAGE_KEY = 'seal-compartment-id';
const EVENT_NAME = 'seal-compartment-updated';

function readCompartmentId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function useSealCompartmentId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(readCompartmentId);

  useEffect(() => {
    const handler = () => setId(readCompartmentId());
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const update = useCallback((newId: string | null) => {
    if (newId) localStorage.setItem(STORAGE_KEY, newId);
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return [id, update];
}
