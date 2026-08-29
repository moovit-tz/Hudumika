// DashboardShell's sidebar workspace list only loads once on mount, and
// creating an organization from a separate full page (not a modal owned by
// the shell) doesn't remount it — ClientLayout deliberately skips remounting
// the shell on /dashboard/* navigations to avoid the black-flash/relogin
// bugs that used to cause. This tiny event bridges the gap: the create-org
// page fires it after a successful creation, and DashboardShell listens for
// it to refetch its workspace list without needing a shared store.
const ORGS_CHANGED_EVENT = "ondi:orgs-changed";

export function notifyOrgsChanged(): void {
  window.dispatchEvent(new Event(ORGS_CHANGED_EVENT));
}

export function onOrgsChanged(handler: () => void): () => void {
  window.addEventListener(ORGS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ORGS_CHANGED_EVENT, handler);
}
