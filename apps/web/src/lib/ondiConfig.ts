import { apiFetch } from './api.js';

export interface OndiConfig {
  google_client_id: string | null;
  microsoft_client_id: string | null;
  sso_enabled: boolean;
}

let cached: Promise<OndiConfig> | null = null;

/** GET /v1/ondi/auth/config, fetched once per page load and shared by every
 *  caller (GoogleSignInButton, MicrosoftSignInButton, App.tsx's SSO-default
 *  routing) rather than each firing its own request. */
export function getOndiConfig(): Promise<OndiConfig> {
  if (!cached) {
    cached = apiFetch('/v1/ondi/auth/config').catch(() => ({ google_client_id: null, microsoft_client_id: null, sso_enabled: false }));
  }
  return cached;
}
