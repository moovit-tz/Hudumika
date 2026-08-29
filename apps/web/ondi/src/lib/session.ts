import { apiFetch } from './api';
import { clearCachedVaultSession } from './vaultSession';

interface RouterLike {
  replace: (href: string) => void;
}

/**
 * Persistent per-browser identifier used only to recognize "have we seen this
 * device before" for the new-device step-up policy — not a security secret,
 * just a stable id. Generated once and reused across logins/logouts.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('ondi_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('ondi_device_id', id);
  }
  return id;
}

function clearLocalAuth() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  clearCachedVaultSession();
}

/** Logs out only the current session/device — leaves the user signed in elsewhere. */
export async function logoutCurrentSession(router: RouterLike) {
  const refreshToken = localStorage.getItem('refresh_token');
  try {
    if (refreshToken) {
      await apiFetch('/oauth/revoke', { method: 'POST', body: JSON.stringify({ token: refreshToken }) });
    }
  } catch { /* ignore — clear local state regardless */ }
  clearLocalAuth();
  router.replace('/login');
}

/** Revokes every active session for this user, on every device and app. */
export async function logoutAllDevices(router: RouterLike) {
  try {
    await apiFetch('/sessions', { method: 'DELETE' });
  } catch { /* ignore — clear local state regardless */ }
  clearLocalAuth();
  router.replace('/login');
}
