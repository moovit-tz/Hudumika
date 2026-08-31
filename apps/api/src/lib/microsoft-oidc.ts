import crypto from 'crypto';

/**
 * Verifies a Microsoft identity platform (Azure AD v2.0) id_token — the
 * Microsoft counterpart to the Google tokeninfo check in
 * ondi-auth.routes.ts's /google/verify. Google publishes a simple
 * tokeninfo REST endpoint that does this for you; Microsoft doesn't, so
 * this hand-rolls the same RS256-over-JWKS verification lib/oidc.ts
 * already does for this platform's own OIDC provider — same "no
 * dependency for something Node already does" convention, just pointed
 * at Microsoft's published keys instead of a key this platform owns.
 */

const JWKS_URL = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

interface Jwk { kid: string; n: string; e: string; kty: string }

let cachedJwks: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwks(): Promise<Jwk[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) return cachedJwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    if (cachedJwks) return cachedJwks.keys; // serve the stale set rather than fail every login on one bad fetch
    throw new Error('Could not fetch Microsoft signing keys');
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
 * audience or expiry don't check out. `iss` is checked as a pattern
 * (`login.microsoftonline.com/<tenant-guid>/v2.0`) rather than one fixed
 * string, because the app registration's authority is `common` — any
 * work, school or personal Microsoft account can sign in, and each one's
 * token is issued by *its own* home tenant, not a single shared issuer.
 */
export async function verifyMicrosoftIdToken(idToken: string, clientId: string): Promise<Record<string, any> | null> {
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
  if (typeof payload.iss !== 'string' || !/^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(payload.iss)) return null;
  const now = Date.now() / 1000;
  if (typeof payload.exp === 'number' && now > payload.exp) return null;
  if (typeof payload.nbf === 'number' && now < payload.nbf) return null;

  return payload;
}
