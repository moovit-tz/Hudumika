export const BASE_URL = 'http://localhost:3001';

/** Clears the stored session and bounces to the login page. Called whenever the
 * API rejects our token (expired/invalid) so the user gets a clean re-login
 * prompt instead of every page independently surfacing the raw 401 body. */
function handleUnauthorized() {
  localStorage.removeItem('hudumika_token');
  localStorage.removeItem('hudumika_user');
  localStorage.removeItem('hudumika_super_token');
  localStorage.removeItem('hudumika_super_user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login?expired=1';
  }
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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await throwForErrorResponse(response);
  }

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
