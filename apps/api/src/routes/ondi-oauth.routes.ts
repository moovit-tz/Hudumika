import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { Redis } from 'ioredis';
import { dbPlatform, withTenant } from '../db/client.js';
import { verifyPassword } from '../lib/password.js';
import { signJwt, verifyJwt, verifyPkce, issuerUrl } from '../lib/oidc.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { env } from '../config/env.js';

/**
 * Ondi's OAuth 2.0 / OpenID Connect provider (M6) — authorization code +
 * PKCE, first-party client auto-approval, RS256 ID tokens. Makes Ondi
 * *capable* of being the platform's SSO; does not touch /auth/login or any
 * existing session — that cutover is M7, separate and later. Every route
 * here issues its own OAuth tokens, never a platform session cookie.
 */
let redisClient: Redis | null = null;
try {
  redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 1500, enableOfflineQueue: false });
  redisClient.on('error', () => { try { redisClient?.disconnect(); } catch { /* already gone */ } redisClient = null; });
} catch { redisClient = null; }

const AUTH_CODE_TTL = 120;
const ACCESS_TOKEN_TTL = 60 * 60;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;
const codeKey = (code: string) => `ondi:oauth:code:${code}`;
const refreshKey = (token: string) => `ondi:oauth:refresh:${token}`;
const revokedKey = (jti: string) => `ondi:oauth:revoked:${jti}`;

const authorizeQuerySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().default('openid'),
  state: z.string().optional(),
  nonce: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.enum(['S256']).optional(),
  response_type: z.literal('code').default('code'),
});

async function loadClient(clientId: string) {
  return dbPlatform.selectFrom('ondi_oauth_clients').selectAll().where('client_id', '=', clientId).executeTakeFirst();
}

function claimsForUser(user: any, scopes: string[]) {
  const claims: Record<string, unknown> = { sub: user.id, tenant_id: user.tenant_id, role: user.role };
  if (scopes.includes('profile')) claims.name = user.name;
  if (scopes.includes('email')) claims.email = user.email;
  return claims;
}

export async function ondiOauthRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/ondi/oauth/authorize/info
   * Authenticated (existing Hudumika session) — what the consent screen
   * needs to render, or a signal to skip it entirely.
   */
  fastify.get('/authorize/info', { preHandler: fastify.authenticate }, async (request, reply) => {
    const q = authorizeQuerySchema.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Invalid authorization request', details: q.error.flatten() });
    const { client_id, redirect_uri, scope } = q.data;

    const client = await loadClient(client_id);
    if (!client) return reply.status(400).send({ error: 'Unknown client_id' });
    const redirectUris = Array.isArray(client.redirect_uris) ? client.redirect_uris : JSON.parse(client.redirect_uris ?? '[]');
    if (!redirectUris.includes(redirect_uri)) return reply.status(400).send({ error: 'redirect_uri is not registered for this client' });

    const scopes = scope.split(' ').filter(Boolean);
    const user = request.user;
    const existingConsent = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_oauth_consents')
      .select('scopes').where('user_id', '=', user.sub).where('client_id', '=', client_id).executeTakeFirst());
    const grantedScopes: string[] = existingConsent ? (Array.isArray(existingConsent.scopes) ? existingConsent.scopes : JSON.parse(existingConsent.scopes ?? '[]')) : [];
    const alreadyConsented = scopes.every(s => grantedScopes.includes(s));

    return {
      client: { name: client.name, logo_url: client.logo_url, first_party: client.first_party },
      scopes,
      auto_approve: client.first_party || alreadyConsented,
    };
  });

  /**
   * POST /v1/ondi/oauth/authorize/approve
   * Authenticated — issues a real authorization code and records consent.
   */
  fastify.post('/authorize/approve', { preHandler: fastify.authenticate }, async (request, reply) => {
    if (!redisClient) return reply.status(503).send({ error: 'Sign-in is temporarily unavailable. Try again shortly.' });
    const q = authorizeQuerySchema.safeParse(request.body);
    if (!q.success) return reply.status(400).send({ error: 'Invalid authorization request', details: q.error.flatten() });
    const { client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method } = q.data;

    const client = await loadClient(client_id);
    if (!client) return reply.status(400).send({ error: 'Unknown client_id' });
    const redirectUris = Array.isArray(client.redirect_uris) ? client.redirect_uris : JSON.parse(client.redirect_uris ?? '[]');
    if (!redirectUris.includes(redirect_uri)) return reply.status(400).send({ error: 'redirect_uri is not registered for this client' });

    const user = request.user;
    const scopes = scope.split(' ').filter(Boolean);

    await withTenant(user.tenant_id, trx => trx.insertInto('ondi_oauth_consents').values({
      tenant_id: user.tenant_id, user_id: user.sub, client_id, scopes: JSON.stringify(scopes),
    }).onConflict(oc => oc.columns(['user_id', 'client_id']).doUpdateSet({ scopes: JSON.stringify(scopes), granted_at: new Date() })).execute());

    const code = crypto.randomBytes(32).toString('base64url');
    await redisClient.set(codeKey(code), JSON.stringify({
      userId: user.sub, tenantId: user.tenant_id, clientId: client_id, redirectUri: redirect_uri,
      scope: scopes.join(' '), nonce, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method,
    }), 'EX', AUTH_CODE_TTL);

    await recordAuthEvent(user.tenant_id, user.sub, 'login_success', { metadata: { via: 'oauth_authorize', client_id } });

    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    return { redirect_url: url.toString() };
  });

  /**
   * POST /v1/ondi/oauth/token
   */
  fastify.post('/token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!redisClient) return reply.status(503).send({ error: 'temporarily_unavailable' });
    const body = z.object({
      grant_type: z.enum(['authorization_code', 'refresh_token']),
      code: z.string().optional(),
      redirect_uri: z.string().optional(),
      code_verifier: z.string().optional(),
      refresh_token: z.string().optional(),
      client_id: z.string().min(1),
      client_secret: z.string().optional(),
    }).parse(request.body);

    const client = await loadClient(body.client_id);
    if (!client) return reply.status(401).send({ error: 'invalid_client' });
    if (client.client_secret_hash) {
      if (!body.client_secret || !verifyPassword(body.client_secret, client.client_secret_hash)) {
        return reply.status(401).send({ error: 'invalid_client' });
      }
    }

    let userId: string, tenantId: string, scope: string, nonce: string | undefined;

    if (body.grant_type === 'authorization_code') {
      if (!body.code) return reply.status(400).send({ error: 'invalid_request', error_description: 'code is required' });
      const raw = await redisClient.get(codeKey(body.code));
      if (!raw) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Code is invalid or expired' });
      await redisClient.del(codeKey(body.code)); // single use

      const grant = JSON.parse(raw) as { userId: string; tenantId: string; clientId: string; redirectUri: string; scope: string; nonce?: string; codeChallenge?: string; codeChallengeMethod?: string };
      if (grant.clientId !== body.client_id) return reply.status(400).send({ error: 'invalid_grant' });
      if (body.redirect_uri && grant.redirectUri !== body.redirect_uri) return reply.status(400).send({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      if (grant.codeChallenge) {
        if (!body.code_verifier || !verifyPkce(body.code_verifier, grant.codeChallenge)) {
          return reply.status(400).send({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
        }
      }
      userId = grant.userId; tenantId = grant.tenantId; scope = grant.scope; nonce = grant.nonce;
    } else {
      if (!body.refresh_token) return reply.status(400).send({ error: 'invalid_request', error_description: 'refresh_token is required' });
      const raw = await redisClient.get(refreshKey(body.refresh_token));
      if (!raw) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired' });
      const grant = JSON.parse(raw) as { userId: string; tenantId: string; clientId: string; scope: string };
      if (grant.clientId !== body.client_id) return reply.status(400).send({ error: 'invalid_grant' });
      userId = grant.userId; tenantId = grant.tenantId; scope = grant.scope;
    }

    const user = await withTenant(tenantId, trx => trx.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst());
    if (!user || !user.active) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Account is no longer active' });

    const scopes = scope.split(' ').filter(Boolean);
    const now = Math.floor(Date.now() / 1000);
    const issuer = issuerUrl();
    const accessJti = crypto.randomUUID();

    const accessToken = await signJwt({
      iss: issuer, sub: user.id, aud: body.client_id, tenant_id: user.tenant_id, role: user.role,
      scope: scopes.join(' '), token_use: 'access', jti: accessJti, iat: now, exp: now + ACCESS_TOKEN_TTL,
    });

    let idToken: string | undefined;
    if (scopes.includes('openid')) {
      idToken = await signJwt({
        iss: issuer, aud: body.client_id, iat: now, exp: now + ACCESS_TOKEN_TTL,
        ...(nonce ? { nonce } : {}),
        ...claimsForUser(user, scopes),
      });
    }

    const newRefreshToken = crypto.randomBytes(32).toString('base64url');
    await redisClient.set(refreshKey(newRefreshToken), JSON.stringify({ userId: user.id, tenantId: user.tenant_id, clientId: body.client_id, scope: scopes.join(' ') }), 'EX', REFRESH_TOKEN_TTL);
    // Old refresh token, if this was a refresh grant, is single-use — issued
    // fresh above, and the one just spent was already deleted by whoever
    // reads it next; simplest correct behaviour is just not re-storing it.
    if (body.grant_type === 'refresh_token' && body.refresh_token) await redisClient.del(refreshKey(body.refresh_token));

    return {
      access_token: accessToken,
      ...(idToken ? { id_token: idToken } : {}),
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      scope: scopes.join(' '),
    };
  });

  /**
   * GET /v1/ondi/oauth/userinfo — Bearer access_token, not a platform
   * session cookie.
   */
  fastify.get('/userinfo', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth || !/^Bearer\s/i.test(auth)) return reply.status(401).send({ error: 'invalid_token' });
    const token = auth.slice(7);
    const claims = await verifyJwt(token);
    if (!claims || claims.token_use !== 'access') return reply.status(401).send({ error: 'invalid_token' });
    if (claims.jti && redisClient && await redisClient.get(revokedKey(claims.jti))) return reply.status(401).send({ error: 'invalid_token' });

    const user = await withTenant(claims.tenant_id, trx => trx.selectFrom('users').selectAll().where('id', '=', claims.sub).executeTakeFirst());
    if (!user || !user.active) return reply.status(401).send({ error: 'invalid_token' });

    const scopes = String(claims.scope ?? '').split(' ').filter(Boolean);
    return claimsForUser(user, scopes);
  });

  /**
   * POST /v1/ondi/oauth/introspect (RFC 7662)
   */
  fastify.post('/introspect', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.body);
    const claims = await verifyJwt(token);
    if (!claims) return { active: false };
    if (claims.jti && redisClient && await redisClient.get(revokedKey(claims.jti))) return { active: false };
    return { active: true, sub: claims.sub, aud: claims.aud, iss: claims.iss, exp: claims.exp, iat: claims.iat, scope: claims.scope, token_use: claims.token_use };
  });

  /**
   * POST /v1/ondi/oauth/revoke (RFC 7009)
   */
  fastify.post('/revoke', async (request) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.body);
    if (!redisClient) return { success: true };
    // A refresh token is opaque (not a JWT) — try deleting it as one directly.
    await redisClient.del(refreshKey(token));
    // An access token is a JWT — mark its jti revoked for however long it
    // would otherwise have been valid, rather than trying to delete
    // something that isn't stored anywhere to begin with.
    const claims = await verifyJwt(token);
    if (claims?.jti && typeof claims.exp === 'number') {
      const ttl = Math.max(1, claims.exp - Math.floor(Date.now() / 1000));
      await redisClient.set(revokedKey(claims.jti), '1', 'EX', ttl);
    }
    return { success: true };
  });
}
