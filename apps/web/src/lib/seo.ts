/**
 * Page title and meta description, applied in one place.
 *
 * Two callers write here and they must not fight:
 *
 *   usePageSEO(...)  a page stating its own title
 *   <AutoSEO/>       the fallback, derived from the route
 *
 * React runs child effects before parent ones, so on every navigation the
 * page's own call lands first and AutoSEO's second. Without a guard the
 * fallback would overwrite the specific title every time. A page therefore
 * *claims* the pathname it titled, and AutoSEO stands down for that path
 * only — on the next navigation the claim no longer matches, so the fallback
 * takes over again automatically. No cleanup, no ordering assumptions beyond
 * the one React guarantees.
 */

let suffix = 'Hudumika';
let claimedPath: string | null = null;
let lastTitle = '';

/**
 * The platform name, from tenant branding.
 *
 * Branding used to assign document.title directly, which clobbered the page's
 * own title every time it applied. It sets the suffix here instead, and the
 * current title is re-rendered so a rename takes effect immediately without
 * the page having to re-run.
 */
export function setTitleSuffix(next: string) {
  suffix = next || 'Hudumika';
  apply(lastTitle);
}

function apply(title: string, description?: string) {
  lastTitle = title;
  document.title = title ? `${title} · ${suffix}` : suffix;
  if (description === undefined) return;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', description);
}

/** A page stating its own title. Wins over the derived one for this path. */
export function claimSEO(pathname: string, title: string, description?: string) {
  claimedPath = pathname;
  apply(title, description);
}

/** The derived fallback. Silently defers to a page that titled this path. */
export function fallbackSEO(pathname: string, title: string, description?: string) {
  if (claimedPath === pathname) return;
  apply(title, description);
}

/**
 * Turns a route into something readable: the last meaningful segment, with
 * ids and other opaque segments skipped so a detail route reads as its
 * section rather than as a uuid.
 */
export function titleFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean).filter(s => !isOpaque(s));
  const last = segments[segments.length - 1];
  if (!last) return null;
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

/** uuids, numeric ids and hashes carry nothing a reader wants in a tab. */
function isOpaque(segment: string): boolean {
  return /^[0-9]+$/.test(segment)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
    || /^[0-9a-f]{16,}$/i.test(segment);
}
