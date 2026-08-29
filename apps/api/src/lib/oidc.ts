import crypto from 'crypto';
import { dbPlatform } from '../db/client.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';
import { webauthnOrigin } from './webauthn-config.js';

/**
 * Ondi's OAuth/OIDC provider signing (M6) — a real, working RS256
 * implementation over Node's built-in crypto, same "no dependency for
 * something Node already does" convention as lib/totp.ts. Deliberately its
 * own key, not the existing platform_signing_identities PKCS#12/CAdES
 * document-signing certificate (see this migration's own header comment) —
 * OIDC needs a kid-addressable, rotatable, JWK-exportable key, a different
 * shape than a password-protected P12 bundle.
 */

interface SigningKey { kid: string; publicKeyPem: string; privateKeyPem: string }

let cachedKey: SigningKey | null = null;

async function getSigningKey(): Promise<SigningKey> {
  if (cachedKey) return cachedKey;

  const row = await dbPlatform.selectFrom('ondi_oidc_signing_keys').selectAll()
    .where('enabled', '=', true).orderBy('created_at', 'desc').executeTakeFirst();
  if (row) {
    cachedKey = { kid: row.kid, publicKeyPem: row.public_key_pem, privateKeyPem: decryptSecret(row.encrypted_private_key) };
    return cachedKey;
  }

  // First use on this platform — generate and persist once. 2048-bit RSA
  // matches this codebase's own existing convention (pdf-signing-identity.service.ts).
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const kid = crypto.randomBytes(8).toString('hex');
  await dbPlatform.insertInto('ondi_oidc_signing_keys').values({
    kid, public_key_pem: publicKey, encrypted_private_key: encryptSecret(privateKey), algorithm: 'RS256', enabled: true,
  }).execute();
  cachedKey = { kid, publicKeyPem: publicKey, privateKeyPem: privateKey };
  return cachedKey;
}

export function issuerUrl(): string {
  return webauthnOrigin();
}

export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const key = await getSigningKey();
  const header = { alg: 'RS256', typ: 'JWT', kid: key.kid };
  const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encHeader}.${encPayload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key.privateKeyPem);
  return `${signingInput}.${signature.toString('base64url')}`;
}

/** Verifies signature + expiry only — callers that need to distinguish
 *  "expired" from "malformed" from "revoked" check those separately
 *  (see ondi-oauth.routes.ts's /introspect, which layers a Redis
 *  revocation check on top of this). */
export async function verifyJwt(token: string): Promise<Record<string, any> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSig] = parts;
  try {
    const key = await getSigningKey();
    const signingInput = `${encHeader}.${encPayload}`;
    const signature = Buffer.from(encSig, 'base64url');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(signingInput), key.publicKeyPem, signature);
    if (!ok) return null;
    const payload = JSON.parse(Buffer.from(encPayload, 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getJwks(): Promise<{ keys: Record<string, unknown>[] }> {
  const key = await getSigningKey();
  const jwk = crypto.createPublicKey(key.publicKeyPem).export({ format: 'jwk' }) as Record<string, unknown>;
  return { keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: key.kid }] };
}

/** PKCE (RFC 7636) S256 check — every first-party client is a public SPA
 *  client, so PKCE is how token exchange proves possession instead of a
 *  client secret. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}
