// Tracks which apps were launched most recently, purely client-side — the
// backend only knows when a consent was first granted (connectedAt), not
// which app you opened last. Powers the App Launcher's "Recently opened"
// row, same idea as Okta/OneLogin's most-used-apps shortcut.
const KEY = "ondi_recent_apps";
const MAX_ENTRIES = 12;

export function recordAppLaunch(clientId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [clientId, ...list.filter((id) => id !== clientId)].slice(
      0,
      MAX_ENTRIES,
    );
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Best-effort — a broken localStorage entry shouldn't block launching.
  }
}

export function getRecentAppIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
