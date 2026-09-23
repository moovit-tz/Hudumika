// Recently-viewed apps (header launcher's "Web Apps" panel, WorkspaceHome's
// own recent-apps row) — a single source of truth. This used to be tracked
// independently in two places: PageLayout.tsx's mount effect, which only
// fires for routes that actually wrap themselves in <PageLayout> — every
// full-screen app (Email, Drive, Calendar, Tasks, the Studio workflow
// builder) opts out of that wrapper per CLAUDE.md, so visiting any of them
// never got recorded — and WorkspaceHome.tsx's click handler, which only
// fires when the app was opened by clicking its tile on the home dashboard,
// missing sidebar navigation, deep links, and browser back/forward. Between
// the two, most real navigation never got recorded, which is why the
// launcher's "Recently Viewed" so often showed far fewer than 4 apps even
// after opening several. WorkspaceApp.tsx is the one wrapper every app shell
// actually mounts through regardless of its internal page structure, so
// that's the only correct place to record a visit.
const KEY = 'hudumika_recently_viewed';
// Stored with headroom past the 4 the launcher displays — AppLauncher.tsx
// filters out disabled/internal apps before slicing to 4, so a few extra
// stored entries keep that display full even when some recent apps get
// filtered out.
const MAX_STORED = 8;

export function recordRecentApp(appId: string): void {
  if (!appId) return;
  try {
    const prev = getRecentApps();
    const next = [appId, ...prev.filter(id => id !== appId)].slice(0, MAX_STORED);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore — localStorage can throw in a private window or with site data cleared
  }
}

export function getRecentApps(fallback: string[] = []): string[] {
  try {
    const saved = localStorage.getItem(KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}
