import { clearIdleLockState } from './idleLockKeys.js';

export const BASE_URL = 'http://localhost:3001';

/** Reads the non-httpOnly CSRF cookie the server sets alongside every
 *  session cookie (double-submit pattern — see apps/api/src/middleware/csrf.ts).
 *  Absent for a Bearer-header-only caller, which never needs it. */
export function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|; )hudumika_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Clears the cached user and bounces to the login page. Called whenever the
 * API rejects our session (expired/invalid) so the user gets a clean re-login
 * prompt instead of every page independently surfacing the raw 401 body. */
function handleUnauthorized() {
  // A visitor who was never signed in on this browser (no cached user) isn't
  // "logged out" — they were never logged in. useBranding.ts's tenant-
  // branding probe, for one, is fetched unconditionally by a provider that
  // mounts on every route (DesignSystemProvider/SeoAnalyticsProvider wrap
  // the whole app in App.tsx, above any auth check) and its own comment
  // says a 401 there is the ordinary case for an anonymous visitor — it's
  // already caught at the call site with .catch(() => {}). Redirecting
  // anyway broke every public page (why-complyos, /site/:tenantSlug, and
  // the M7 agency directory): load one with no session and it bounced
  // straight to /login before the page ever rendered. Same reasoning as the
  // existing hudumika_user gate on the 401-retry below, and generalizes the
  // /org carve-out (a separate session, same "never logged in here" case)
  // to every public route without needing a path allowlist.
  const hadSession = !!localStorage.getItem('hudumika_user');
  localStorage.removeItem('hudumika_user');
  if (!hadSession) return;
  // A session that just died 401'd is not "still locked" — the next login
  // (even in this same tab, no reload) must start with a clean idle clock,
  // not re-apply whatever lock state this session happened to be in.
  clearIdleLockState();

  // Best-effort — the session cookie is httpOnly and may already be the
  // thing that's invalid/expired, but this is what actually revokes the
  // device server-side (see auth.routes.ts's /logout) rather than just
  // bouncing the UI while the real session lingers.
  fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  const path = window.location.pathname;
  if (!path.startsWith('/login') && !path.startsWith('/org')) {
    window.location.href = '/login?expired=1';
  }
}

/**
 * Ask the server to renew the session from the httpOnly refresh cookie —
 * no body, no token to read or store, the Set-Cookie response does that.
 *
 * Access tokens carry a real expiry (an hour), and without a renewal path
 * every session would break after one — so a 401 is worth a single silent
 * retry before bouncing someone to the login page mid-task.
 *
 * The in-flight promise is shared: a page that fires eight requests at once
 * would otherwise send eight refreshes and race them against each other. One
 * refresh, eight retries.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const csrf = csrfToken();
      const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all share this attempt.
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();

  return refreshInFlight;
}

/** The whole platform is down for maintenance (Platform Settings ▸
 *  Maintenance Mode, enforced in middleware/auth.ts's authenticate()) —
 *  bounce to a real maintenance page instead of letting every call site
 *  surface its own generic fetch-failed error. Mirrors handleUnauthorized's
 *  redirect shape below. */
function handlePlatformMaintenance() {
  const path = window.location.pathname;
  if (!path.startsWith('/maintenance') && !path.startsWith('/login')) {
    window.location.href = '/maintenance';
  }
}

async function throwForErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) handleUnauthorized();
  const err = await response.json().catch(() => ({}));
  if (response.status === 503 && err.code === 'PLATFORM_MAINTENANCE') handlePlatformMaintenance();
  const thrown = new Error(err.message || err.error || err.detail || `Request failed with status ${response.status}`);
  // The rest of the error body (e.g. notes.routes.ts's 409 { code:
  // 'NOTE_CONFLICT', current }) used to be discarded — only .message
  // survived. Attached rather than thrown separately so every existing
  // caller (which only ever reads .message) keeps working unchanged.
  (thrown as Error & { status?: number; body?: unknown }).status = response.status;
  (thrown as Error & { status?: number; body?: unknown }).body = err;
  throw thrown;
}

/**
 * Shared by every helper below: sends the session cookie + CSRF header,
 * retries once on a 401 (via a fresh session), throws the server's own
 * message on any other non-2xx. Returns the raw Response — callers that
 * need JSON parse it themselves (apiFetch), callers that need
 * headers/text/blob read the Response directly (apiFetchRaw and everything
 * built on it).
 */
async function doFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const csrf = csrfToken();
  if (csrf) headers.set('X-CSRF-Token', csrf);

  // Only set JSON content type when there's an actual body to send — Fastify's
  // default JSON body parser rejects an empty body when Content-Type is set
  // to application/json (FST_ERR_CTP_EMPTY_JSON_BODY), which would otherwise
  // break every body-less POST/DELETE call (e.g. duplicate/invite actions).
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // One silent renewal before giving up — only when there's some evidence a
  // session ever existed here (the cached user). Without that gate, every
  // 401 from a caller that was never authenticated at all (e.g. a
  // background probe on the org portal, which has no staff session — see
  // handleUnauthorized's own comment) would still round-trip to /refresh
  // first, harmlessly but noisily 400ing with no refresh cookie to act on.
  // A 403 (CSRF/permission) is a different answer than a stale credential,
  // and retrying it would ask the same question twice.
  if (response.status === 401 && localStorage.getItem('hudumika_user')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // The refresh rotated the CSRF cookie too — re-read it for the retry.
      const freshCsrf = csrfToken();
      if (freshCsrf) headers.set('X-CSRF-Token', freshCsrf);
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
    }
  }

  if (!response.ok) {
    await throwForErrorResponse(response);
  }
  return response;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await doFetch(path, options);
  // 204 No Content (e.g. a DELETE) has no body — response.json() would throw
  // "Unexpected end of JSON input" on it, so return null for an empty response.
  if (response.status === 204) return null;
  return response.json();
}

/**
 * Retries `fn` a few times with exponential backoff, but only for failures
 * a retry can plausibly fix: a raw network failure (fetch's own TypeError,
 * no `.status` at all — offline, DNS hiccup, or a dev server mid-restart
 * under `tsx watch`, which is what motivated this) or a 5xx from the
 * server. A 4xx thrown by throwForErrorResponse (it attaches `.status`) is
 * never retried — the request was rejected on its merits (validation,
 * permission, a 409 conflict), not because it didn't arrive, and resending
 * it unchanged would either fail identically or, for a conflict, be
 * actively wrong.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 500): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status;
      const retriable = status === undefined || status >= 500;
      if (!retriable || attempt === attempts - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
}

/**
 * Like apiFetch, but hands back the raw Response instead of parsed JSON —
 * for callers that need a response header (e.g. Content-Disposition) or a
 * non-JSON body (.text()/.blob()) that apiFetch/apiFetchBlob don't expose.
 */
export async function apiFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  return doFetch(path, options);
}

/** Fetches a binary endpoint with the session cookie attached and triggers a browser download. */
export async function apiDownload(path: string, filename: string) {
  const response = await doFetch(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Fetches a binary endpoint with the session cookie attached and returns the raw blob (for callers that need the bytes themselves, e.g. re-encoding to base64). */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await doFetch(path);
  return response.blob();
}

/** Fetches a binary endpoint with the session cookie attached and opens it in a new tab for inline viewing (no forced download). */
export async function apiViewBlob(path: string) {
  const response = await doFetch(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Give the new tab time to load the resource before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Multipart upload with real per-file byte progress. plain fetch() has no
 * upload-progress event at all — XMLHttpRequest is the only web platform API
 * that exposes one, so this is a deliberate, narrow exception to the
 * fetch()-based helpers above, used only where a caller actually renders a
 * percentage (see cloud-context.tsx's uploadFiles/uploadFolder).
 */
export function apiUploadWithProgress(path: string, form: FormData, onProgress: (pct: number) => void): { promise: Promise<any>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<any>((resolve, reject) => {
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    const csrf = csrfToken();
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let body: any = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        if (xhr.status === 401) handleUnauthorized();
        reject(new Error(body?.message || body?.error || `Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}
