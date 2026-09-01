/**
 * A tiny, deliberately separate fetch helper for the public guest-meeting
 * pages (GuestMeetingJoin/GuestMeetingRoom) — NOT api.ts's apiFetch.
 *
 * apiFetch is wired into the whole staff-session lifecycle: it retries a 401
 * against /v1/auth/refresh, and a 401 that survives that calls /auth/logout
 * and clears the cached staff user. None of that belongs on a page a
 * completely anonymous visitor (or a staff member who happens to open a
 * guest link in the same browser as their own real session) can land on —
 * a guest-flow error should never have a chance of touching someone else's
 * real session. calls-public's routes also never return 401 for anything
 * (400/403/404/410 instead — see calls.routes.ts), so there is nothing this
 * helper needs to retry in the first place.
 */
import { BASE_URL } from './api.js';

async function throwForErrorResponse(response: Response): Promise<never> {
  const err = await response.json().catch(() => ({}));
  const thrown = new Error(err.message || err.error || `Request failed with status ${response.status}`);
  (thrown as Error & { status?: number; body?: unknown }).status = response.status;
  (thrown as Error & { status?: number; body?: unknown }).body = err;
  throw thrown;
}

export async function guestFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // credentials: 'include' — the one thing this DOES need from apiFetch's
  // playbook: the guest cookie calls-public's /join sets has to ride along
  // on every later call this page makes (waiting-room polling, leave).
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) await throwForErrorResponse(response);
  if (response.status === 204) return null;
  return response.json();
}
