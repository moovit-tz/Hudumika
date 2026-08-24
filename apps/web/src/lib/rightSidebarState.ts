// Shared collapse state for the Google-Workspace-style right companion
// sidebar (GoogleWorkspaceRightSidebar.tsx) — read/toggled from AppHeader.tsx
// too, which isn't a parent of it (AppHeader is used across every shell, the
// sidebar only in Calendar's), so a DOM CustomEvent is the loose-coupling
// mechanism rather than a prop/store import.
//
// The new value travels in the event's own `detail` rather than being
// re-derived by each listener from localStorage: two listeners on the same
// event fire synchronously in registration order, so a listener that reads
// localStorage instead of `detail` can read it before the *other* listener
// (the one whose button was actually clicked) has finished writing the new
// value — leaving that listener's own state permanently one toggle stale.
const KEY = 'gws_right_sidebar_collapsed';
export const RIGHT_SIDEBAR_TOGGLE_EVENT = 'gws-sidebar:toggle';

export function isRightSidebarCollapsed(): boolean {
  return localStorage.getItem(KEY) === 'true';
}

export function toggleRightSidebar(): void {
  const next = !isRightSidebarCollapsed();
  localStorage.setItem(KEY, String(next));
  window.dispatchEvent(new CustomEvent<boolean>(RIGHT_SIDEBAR_TOGGLE_EVENT, { detail: next }));
}
