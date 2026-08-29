import { env } from '../config/env.js';

/** Same "public origin the app is actually reachable at" derivation
 *  landed-cost-share.routes.ts already uses for its QR codes — PUBLIC_APP_URL
 *  if set, else the first configured CORS origin (already the frontend URL
 *  in every real deployment). WebAuthn ties every credential to this origin
 *  and its hostname (the RP ID) for the life of that credential, so it must
 *  be stable, not derived from a spoofable request header. */
export function webauthnOrigin(): string {
  return (env.PUBLIC_APP_URL || env.CORS_ORIGINS.split(',')[0] || '').trim().replace(/\/+$/, '');
}

export function webauthnRpID(): string {
  try { return new URL(webauthnOrigin()).hostname; } catch { return 'localhost'; }
}

export const WEBAUTHN_RP_NAME = 'Hudumika';
