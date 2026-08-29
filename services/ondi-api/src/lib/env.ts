/**
 * Central secret/config loader. Import JWT_SECRET / ADMIN_KEY from here instead of
 * reading process.env directly — every route used to fall back to a hardcoded
 * default ('ondi_dev_secret' / 'ondi_admin_2026') when the env var was unset,
 * which meant a misconfigured deployment would sign and accept tokens with a
 * publicly-known secret. This module fails startup instead.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  throw new Error(
    `[ondi-api] Missing required environment variable: ${name}. ` +
    `Set it in services/ondi-api/.env (see .env.example) before starting the server.`,
  );
}

export const JWT_SECRET = requireEnv('JWT_SECRET');
export const ADMIN_KEY = requireEnv('ADMIN_KEY');
export const JWT_ISSUER = process.env.JWT_ISSUER || 'https://ondi.hudumika.co.tz';

// AES-256-GCM key for MFA_APP TOTP secrets at rest (see lib/mfa-crypto.ts) —
// base64-encoded, must decode to exactly 32 bytes. Same fail-closed
// reasoning as the secrets above: this key existing only as an
// easy-to-forget optional env var would mean a deployment silently kept
// storing live 2FA seeds in plaintext with nothing surfacing that fact.
export const MFA_SECRET_KEY = (() => {
  const key = Buffer.from(requireEnv('MFA_SECRET_KEY_B64'), 'base64');
  if (key.length !== 32) {
    throw new Error(
      `[ondi-api] MFA_SECRET_KEY_B64 must decode to 32 bytes for AES-256-GCM, got ${key.length}. ` +
      `Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
})();

// SAML IdP signing key material — base64-encoded PEM (see .env.example for
// how to generate). Required: an IdP that silently fell back to no signing
// key, or a shared one, would produce unsigned or forgeable assertions.
export const SAML_IDP_SIGNING_CERT = Buffer.from(requireEnv('SAML_IDP_SIGNING_CERT_B64'), 'base64').toString('utf-8');
export const SAML_IDP_SIGNING_KEY = Buffer.from(requireEnv('SAML_IDP_SIGNING_KEY_B64'), 'base64').toString('utf-8');
export const SAML_IDP_ENTITY_ID = process.env.SAML_IDP_ENTITY_ID || `${JWT_ISSUER}/saml/metadata`;
