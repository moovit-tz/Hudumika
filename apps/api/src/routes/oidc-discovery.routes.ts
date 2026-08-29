import type { FastifyInstance } from 'fastify';
import { getJwks, issuerUrl } from '../lib/oidc.js';

/**
 * OIDC discovery + JWKS — registered with NO prefix (index.ts), since
 * `.well-known/openid-configuration` is a spec-fixed absolute path every
 * OIDC client library probes relative to the issuer root. Every other
 * endpoint it advertises below lives under /v1/ondi/oauth/* — a compliant
 * client always reads those URLs from this document rather than hardcoding
 * them, so versioning them under /v1 doesn't break spec compliance.
 */
export async function oidcDiscoveryRoutes(fastify: FastifyInstance) {
  fastify.get('/.well-known/openid-configuration', async () => {
    const issuer = issuerUrl();
    return {
      issuer,
      authorization_endpoint: `${issuer}/ondi/authorize`,
      token_endpoint: `${issuer}/v1/ondi/oauth/token`,
      userinfo_endpoint: `${issuer}/v1/ondi/oauth/userinfo`,
      introspection_endpoint: `${issuer}/v1/ondi/oauth/introspect`,
      revocation_endpoint: `${issuer}/v1/ondi/oauth/revoke`,
      jwks_uri: `${issuer}/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: ['sub', 'name', 'email', 'tenant_id', 'role'],
    };
  });

  fastify.get('/jwks.json', async () => getJwks());
}
