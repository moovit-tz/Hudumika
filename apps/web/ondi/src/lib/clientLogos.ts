// Real product marks for Hudumika's own first-party apps — shared between
// /authorize (consent screen) and the personal App Launcher, which both need
// to show a client's actual logo rather than a generic icon. Falls back to
// nothing (callers render a generic icon/initial) for third-party/unknown
// clients, never a broken image.
export const CLIENT_LOGOS: Record<string, string> = {
  clearos: "/brand/clearos-icon.svg",
  complyos: "/brand/complyos-icon.png",
  hudufreight: "/brand/hudufreight-icon.png",
  // The workspace app's startOndiSignIn sends productName "Hudumika" (see
  // apps/web/workspace/src/lib/session.ts) — the client's own DB row is
  // named "Hudumika Workspace", but the client_name query param on the
  // /authorize redirect is whatever the caller passed, so match both.
  hudumika: "/brand/hudumika-icon.png",
  "hudumika workspace": "/brand/hudumika-icon.png",
};

export function clientLogoFor(name?: string | null): string | undefined {
  if (!name) return undefined;
  return CLIENT_LOGOS[name.toLowerCase()];
}
