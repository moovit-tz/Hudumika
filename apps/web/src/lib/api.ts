const BASE_URL = 'http://localhost:3001';

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
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed with status ${response.status}`);
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
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed with status ${response.status}`);
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

/** Fetches a binary endpoint with the auth header attached and opens it in a new tab for inline viewing (no forced download). */
export async function apiViewBlob(path: string) {
  const token = localStorage.getItem('hudumika_token');
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${BASE_URL}${path}`, { headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Give the new tab time to load the resource before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
