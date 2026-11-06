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
  try {
    return new URL(webauthnOrigin()).hostname;
  } catch {
    // Falling back silently used to hide a real deployment misconfiguration
    // (neither PUBLIC_APP_URL nor CORS_ORIGINS set/parseable): every passkey
    // would register against RP ID "localhost", which won't match the site's
    // actual domain and makes every WebAuthn ceremony fail there with no clue
    // why. Still degrades rather than crashing, but now says so loudly.
    console.error('[webauthn-config] Could not derive a WebAuthn RP ID from PUBLIC_APP_URL/CORS_ORIGINS — falling back to "localhost". Passkeys will not work correctly unless this is actually a local dev environment.');
    return 'localhost';
  }
}

export const WEBAUTHN_RP_NAME = 'Hudumika';

/**
 * Validates a request's `Origin`/`Referer`-derived value against
 * env.CORS_ORIGINS (the same static allowlist index.ts's own CORS plugin
 * checks first, before the SuperAdmin-configurable DB-backed list layered
 * on top of it) before using it to build a payment gateway's post-checkout
 * redirect URL. Several routes (developer.routes.ts's prepaid top-up,
 * billing.routes.ts's ESB top-up) built that URL straight from
 * `request.headers.origin || request.headers.referer` with no validation
 * at all — a header any non-browser caller sets freely — so a crafted
 * request could make the gateway send a real paying user back to an
 * attacker's domain after a genuine transaction. Returns the request's own
 * origin only when it's an origin this deployment actually trusts;
 * otherwise falls back to webauthnOrigin() (PUBLIC_APP_URL, or the first
 * configured CORS origin), the same safe default every other "build a
 * link back to our own app" call site in this codebase already uses.
 */
export function trustedRedirectOrigin(requestOrigin: string | string[] | undefined): string {
  const raw = (Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin ?? '').trim();
  if (!raw) return webauthnOrigin();
  // A Referer header carries a full URL with a path (unlike Origin, which
  // is already bare) — normalize both to just the origin before checking.
  let candidate: string;
  try { candidate = new URL(raw).origin; } catch { return webauthnOrigin(); }
  const allowed = env.CORS_ORIGINS.split(',').map(o => o.trim());
  return allowed.includes(candidate) ? candidate : webauthnOrigin();
}
