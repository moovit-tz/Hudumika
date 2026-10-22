import { useState, useEffect, useCallback } from 'react';

/**
 * Drop-in useState replacement that persists to sessionStorage.
 * Survives full-page reloads within the same tab (the 401 → /login?returnTo=
 * round-trip), so in-progress work is waiting when the user logs back in.
 *
 * For object states, new fields added to `initial` since the draft was saved
 * are merged in — a code update won't crash on a stale draft missing a key.
 */
export function useSessionDraft<T>(key: string, initial: T) {
  const storageKey = `draft:${key}`;

  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (typeof initial === 'object' && initial !== null && !Array.isArray(initial)) {
          return { ...initial, ...parsed };
        }
        return parsed as T;
      }
    } catch { /* private browsing / storage full / corrupt JSON */ }
    return initial;
  });

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }, [storageKey, state]);

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  return [state, setState, clear] as const;
}

/** Remove every draft whose key starts with `prefix`. */
export function clearSessionDrafts(prefix: string) {
  try {
    const full = `draft:${prefix}`;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(full)) sessionStorage.removeItem(key);
    }
  } catch {}
}
