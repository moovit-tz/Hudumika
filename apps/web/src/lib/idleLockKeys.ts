// Shared by useIdleLock.tsx (owns the lock/activity state) and every place a
// session actually ends — useAuth.tsx's clearSessionLocally (logout, and the
// cross-tab "another tab signed out" listener) and api.ts's handleUnauthorized
// (a 401-forced logout). Kept in its own dependency-free module so api.ts can
// import it without creating api.ts -> useIdleLock.tsx -> api.ts cycle
// (useIdleLock.tsx already imports BASE_URL/csrfToken from api.ts).
//
// Found live: neither logout path used to clear these. hudumika_locked
// survives in localStorage (and, worse, IdleLockProvider's own in-memory
// `locked` state survives too, since it's mounted once for the app's
// lifetime) across a same-tab logout -> re-login cycle with no page reload —
// e.g. the LockScreen's own "Log out instead" button. The very next login
// then re-applies the stale lock instantly, before any real inactivity.
export const IDLE_LOCK_KEYS = {
  lastActivity: 'hudumika_last_activity',
  locked: 'hudumika_locked',
} as const;

// Same-tab signal only (a plain DOM event, not `storage`) — cross-tab
// propagation already works via the native `storage` event IdleLockProvider
// listens for, since removing the key below fires that event in every OTHER
// tab automatically. This event exists only to reach the CURRENT tab, whose
// own `storage` listener never fires for changes it makes itself.
export const IDLE_LOCK_RESET_EVENT = 'hudumika:idle-lock-reset';

export function clearIdleLockState() {
  localStorage.removeItem(IDLE_LOCK_KEYS.locked);
  localStorage.removeItem(IDLE_LOCK_KEYS.lastActivity);
  window.dispatchEvent(new Event(IDLE_LOCK_RESET_EVENT));
}
