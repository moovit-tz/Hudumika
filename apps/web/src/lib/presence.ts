/**
 * Real, API-linked presence for the platform-wide status dot on PersonAvatar.
 *
 * Mirrors identity.ts's own reasoning: a staff list of forty people must not
 * cost forty requests. Every mounted dot registers interest here; a single
 * debounced batch call resolves everyone currently on screen, and a shared
 * poll keeps them current while at least one dot is still mounted.
 */
import { apiFetch } from './api.js';

export type PresenceStatus = 'offline' | 'online' | 'clocked_in';

const POLL_MS = 25_000;
const FLUSH_DEBOUNCE_MS = 250;

const cache = new Map<string, PresenceStatus>();
const subs = new Map<string, Set<(status: PresenceStatus) => void>>();
let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function notify(id: string, status: PresenceStatus) {
  cache.set(id, status);
  subs.get(id)?.forEach(fn => {
    try { fn(status); } catch { /* one bad subscriber must not break the rest */ }
  });
}

async function flush() {
  flushTimer = null;
  const ids = Array.from(pending);
  pending = new Set();
  if (!ids.length) return;
  try {
    const result = await apiFetch(`/v1/presence?ids=${ids.map(encodeURIComponent).join(',')}`);
    for (const id of ids) notify(id, (result?.[id] as PresenceStatus) ?? 'offline');
  } catch {
    // Leave cached values as-is — a failed poll shouldn't flip anyone
    // offline; it just retries next cycle.
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
}

function ensurePolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    for (const id of subs.keys()) pending.add(id);
    scheduleFlush();
  }, POLL_MS);
}

function stopPollingIfIdle() {
  if (subs.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Subscribe one dot to one person's status. Returns an unsubscribe. */
export function subscribePresence(userId: string, cb: (status: PresenceStatus) => void): () => void {
  let set = subs.get(userId);
  if (!set) { set = new Set(); subs.set(userId, set); }
  set.add(cb);

  const cached = cache.get(userId);
  if (cached) cb(cached);
  pending.add(userId);
  scheduleFlush();
  ensurePolling();

  return () => {
    set!.delete(cb);
    if (set!.size === 0) subs.delete(userId);
    stopPollingIfIdle();
  };
}
