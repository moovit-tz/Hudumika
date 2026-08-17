export const BASE_URL = 'http://localhost:3001';

/** Clears the stored session and bounces to the login page. Called whenever the
 * API rejects our token (expired/invalid) so the user gets a clean re-login
 * prompt instead of every page independently surfacing the raw 401 body. */
function handleUnauthorized() {
  localStorage.removeItem('hudumika_token');
  // Or a "signed out" browser keeps a live 30-day credential in storage.
  localStorage.removeItem('hudumika_refresh');
  localStorage.removeItem('hudumika_user');
  localStorage.removeItem('hudumika_super_token');
  localStorage.removeItem('hudumika_super_user');
  // The org portal (see useOrgAuth.tsx) is a completely separate session
  // from this one, reached at /org/*. A background call made by a provider
  // that mounts regardless of route (e.g. useDesignSystem.ts's unconditional
  // design-tokens fetch) has no staff token there and 401s — that must not
  // bounce an org-portal visitor into the staff login page.
  const path = window.location.pathname;
  if (!path.startsWith('/login') && !path.startsWith('/org')) {
    window.location.href = '/login?expired=1';
  }
}

/**
 * Swap the refresh token for a fresh access token.
 *
 * Access tokens used to carry no expiry at all, so nothing needed this. They
 * now last an hour, and without a renewal path every session would break after
 * one — so a 401 is worth a single silent retry before bouncing someone to the
 * login page mid-task.
 *
 * The in-flight promise is shared: a page that fires eight requests at once
 * would otherwise send eight refreshes and race them against each other. One
 * refresh, eight retries.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = localStorage.getItem('hudumika_refresh');
    if (!refresh) return null;
    try {
      const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.access_token) return null;
      localStorage.setItem('hudumika_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('hudumika_refresh', data.refresh_token);
      return data.access_token as string;
    } catch {
      return null;
    } finally {
      // Cleared on the next tick so concurrent callers all share this attempt.
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();

  return refreshInFlight;
}

async function throwForErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) handleUnauthorized();
  const err = await response.json().catch(() => ({}));
  throw new Error(err.message || err.error || err.detail || `Request failed with status ${response.status}`);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('hudumika_token');
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

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
  });

  // One silent renewal before giving up. Only for a 401, and only when we hold
  // a refresh token — a 403 is a permission answer, not a stale credential, and
  // retrying it would ask the same question twice.
  if (response.status === 401 && localStorage.getItem('hudumika_refresh')) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      headers.set('Authorization', `Bearer ${fresh}`);
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    }
  }

  if (!response.ok) {
    await throwForErrorResponse(response);
  }

  // 204 No Content (e.g. a DELETE) has no body — response.json() would throw
  // "Unexpected end of JSON input" on it, so return null for an empty response.
  if (response.status === 204) return null;
  return response.json();
}

/** Fetches a binary endpoint with the auth header attached and triggers a browser download. */
export async function apiDownload(path: string, filename: string) {
  const token = localStorage.getItem('hudumika_token');
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}${path}`, { headers });
  if (!response.ok) {
    await throwForErrorResponse(response);
  }

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

/** Fetches a binary endpoint with the auth header attached and returns the raw blob (for callers that need the bytes themselves, e.g. re-encoding to base64). */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = localStorage.getItem('hudumika_token');
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}${path}`, { headers });
  if (!response.ok) {
    await throwForErrorResponse(response);
  }

  return response.blob();
}

/** Fetches a binary endpoint with the auth header attached and opens it in a new tab for inline viewing (no forced download). */
export async function apiViewBlob(path: string) {
  const token = localStorage.getItem('hudumika_token');
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}${path}`, { headers });
  if (!response.ok) {
    await throwForErrorResponse(response);
  }

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
    const token = localStorage.getItem('hudumika_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

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
