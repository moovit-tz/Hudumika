const BASE_URL = 'http://localhost:3000';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('clearos_token');
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Only set JSON content type if it's not a FormData upload
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
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
