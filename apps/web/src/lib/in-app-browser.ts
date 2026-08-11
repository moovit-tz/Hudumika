/**
 * In-app browser — a shared, app-wide web-view panel.
 *
 * Same singleton pub/sub shape as lib/alert.ts: pages call openInAppBrowser()
 * imperatively, and one <InAppBrowserHost/> mounted at the app root renders the
 * request as a right-hand slide-over with an <iframe>. The point is to open an
 * outbound link (a TRA/TANCIS verification page, a tracking portal, a document
 * URL) *inside* Hudumika rather than punting the user out to a new browser tab.
 *
 * Reality check baked into the UI, not hidden here: many government / banking
 * portals send `X-Frame-Options: SAMEORIGIN` or `frame-ancestors 'self'`, so
 * the browser refuses to embed them. The host always keeps an "Open in new
 * tab" affordance for exactly those, and shipping a blocked page inside the
 * frame is expected, not a bug.
 */

export interface InAppBrowserRequest {
  /** Absolute http(s) URL to load. */
  url: string;
  /** Human label for the panel header + a11y title. Falls back to the host. */
  title?: string;
}

type Listener = (req: InAppBrowserRequest | null) => void;

let listeners: Listener[] = [];
let current: InAppBrowserRequest | null = null;

/** Open a URL in the in-app browser panel. */
export function openInAppBrowser(req: InAppBrowserRequest): void {
  current = req;
  listeners.forEach((l) => l(current));
}

export function closeInAppBrowser(): void {
  current = null;
  listeners.forEach((l) => l(current));
}

export function subscribeInAppBrowser(fn: Listener): () => void {
  listeners.push(fn);
  fn(current);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

/**
 * Should this href be routed through the in-app browser instead of a real tab?
 * True only for an external http(s) page. Everything the frame can't or
 * shouldn't hold — mailto:/tel:, blob:/data: downloads, javascript:, and
 * same-origin app routes — stays on its native behaviour.
 */
export function shouldInterceptHref(rawHref: string, base: string = window.location.href): boolean {
  let u: URL;
  try { u = new URL(rawHref, base); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.origin === window.location.origin) return false;
  return true;
}
