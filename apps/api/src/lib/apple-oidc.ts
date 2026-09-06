import crypto from 'crypto';

/**
 * Verifies a "Sign in with Apple" identity token — the Apple counterpart to
 * microsoft-oidc.ts's verifyMicrosoftIdToken, same hand-rolled RS256-over-JWKS
 * check (no dependency for something Node's own crypto module already does),
 * just pointed at Apple's published keys. Unlike Microsoft's authority
 * (`common`, any tenant's own issuer), Apple issues every token from exactly
 * one fixed issuer, so `iss` is checked as an equality, not a pattern.
 *
 * Apple's id_token deliberately carries no `name` claim (unlike Google's and
 * Microsoft's) — the only place a user's name ever appears is the `user`
 * object Apple's JS SDK hands the *client* on the very first authorization,
 * never again after that and never server-side. /apple/verify in
 * ondi-auth.routes.ts accepts that name as a separate, optional field from
 * the frontend rather than expecting it on the token, and only uses it for
 * a first-time join request's display name.
 */

const JWKS_URL = 'https://appleid.apple.com/auth/keys';
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const APPLE_ISSUER = 'https://appleid.apple.com';

interface Jwk { kid: string; n: string; e: string; kty: string }

let cachedJwks: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwks(): Promise<Jwk[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) return cachedJwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    if (cachedJwks) return cachedJwks.keys; // serve the stale set rather than fail every login on one bad fetch
    throw new Error('Could not fetch Apple signing keys');
  }
  const data: any = await res.json();
  cachedJwks = { keys: data.keys as Jwk[], fetchedAt: Date.now() };
  return cachedJwks.keys;
}

function b64urlToJson(part: string): any {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * Returns the verified payload, or null if the token's signature, issuer,
 * audience or expiry don't check out. `clientId` here is the Services ID
 * registered for "Sign in with Apple" (not an app's Bundle ID) — that's what
 * Apple puts in `aud` for a web/JS-SDK sign-in.
 */
export async function verifyAppleIdToken(idToken: string, clientId: string): Promise<Record<string, any> | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSig] = parts;

  let header: any, payload: any;
  try {
    header = b64urlToJson(encHeader);
    payload = b64urlToJson(encPayload);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  const keys = await getJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const publicKey = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
    const signingInput = `${encHeader}.${encPayload}`;
    const signature = Buffer.from(encSig, 'base64url');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature);
    if (!ok) return null;
  } catch {
    return null;
  }

  if (payload.aud !== clientId) return null;
  if (payload.iss !== APPLE_ISSUER) return null;
  const now = Date.now() / 1000;
  if (typeof payload.exp === 'number' && now > payload.exp) return null;
  if (typeof payload.iat === 'number' && now < payload.iat - 60) return null;

  return payload;
}
