/**
 * Hands a signed-in user's access token back to whichever first-party
 * Hudumika product sent them to /login — the other half of the round trip
 * apps/web/ngao and apps/web/pesatrail (web + Flutter) already implement on
 * their side (see their AuthContext / AuthNotifier reading `?ondi_token=`).
 *
 * The access token minted by signTokens() in services/ondi-api's auth routes
 * (sub/one_id/trust_tier, signed with JWT_SECRET, issuer JWT_ISSUER) is
 * exactly the shape those products' POST /auth/sso/ondi already verifies —
 * no separate "product token" minting needed, this just forwards it.
 *
 * SECURITY: redirect_uri is attacker-controllable input (it's a query
 * param). Forwarding a live access token to an arbitrary origin would be a
 * token-leak-via-open-redirect vulnerability, so it's checked against an
 * allow-list before ever being used — an unrecognized redirect_uri is
 * silently ignored and the caller falls back to Ondi's own dashboard.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3018', // apps/web/pesatrail dev
  'http://localhost:5173', // apps/web/ngao dev
  'http://localhost:3006', // apps/web/complyos dev
  'http://localhost:3012', // apps/web/finops dev
  'http://localhost:3020', // apps/web/seal dev
];

// Custom URL schemes used by first-party mobile apps for the deep-link
// callback (see pesatrail/app/lib/core/app_config.dart's ondiCallbackScheme).
const DEFAULT_ALLOWED_SCHEMES = ['pesatrail'];

function configuredOrigins(): string[] {
  const extra = process.env.NEXT_PUBLIC_SSO_ALLOWED_REDIRECT_ORIGINS;
  return extra ? extra.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function configuredSchemes(): string[] {
  const extra = process.env.NEXT_PUBLIC_SSO_ALLOWED_REDIRECT_SCHEMES;
  return extra ? extra.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Validates `redirectUri` against the allow-list and, if valid, returns the
 * URL to send the browser to with `ondi_token` attached. Returns null for
 * anything not on the allow-list (missing, malformed, or untrusted) — the
 * caller should fall back to normal in-app navigation in that case.
 */
export function buildProductRedirectUrl(redirectUri: string | null, accessToken: string): string | null {
  if (!redirectUri) return null;

  // Custom URL scheme (mobile deep link) — e.g. "pesatrail://auth-callback".
  const schemeMatch = redirectUri.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    const allowedSchemes = [...DEFAULT_ALLOWED_SCHEMES, ...configuredSchemes()];
    if (!allowedSchemes.includes(scheme)) return null;

    // Custom schemes aren't parseable by the URL class's origin logic reliably
    // across engines, so append the token manually.
    const separator = redirectUri.includes('?') ? '&' : '?';
    return `${redirectUri}${separator}ondi_token=${encodeURIComponent(accessToken)}`;
  }

  // Regular http(s) origin (web app).
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return null;
  }

  const allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins()];
  if (!allowedOrigins.includes(parsed.origin)) return null;

  parsed.searchParams.set('ondi_token', accessToken);
  return parsed.toString();
}
