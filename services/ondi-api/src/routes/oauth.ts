import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto, { generateKeyPairSync } from 'crypto';
import { JWT_SECRET } from '../lib/env.js';
import { createEphemeralStore } from '../lib/ephemeral-store.js';

// ─── Cryptographic RS256 Keypair ─────────────────────────────────────────────
// Load from env in production so the keypair survives restarts.
// Fall back to a freshly generated key in dev (tokens won't survive restarts,
// but JWKS stays consistent within the process lifetime).

let privateKeyPem: string;
let publicKeyObject: crypto.KeyObject;

if (process.env.OAUTH_PRIVATE_KEY_PEM && process.env.OAUTH_PUBLIC_KEY_PEM) {
  privateKeyPem  = process.env.OAUTH_PRIVATE_KEY_PEM;
  publicKeyObject = crypto.createPublicKey(process.env.OAUTH_PUBLIC_KEY_PEM);
} else {
  const generated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKeyPem   = generated.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  publicKeyObject = generated.publicKey;
}

const publicKeyJwk = publicKeyObject.export({ format: 'jwk' }) as any;

/** Verifies an RS256 OAuth access_token (issued by POST /oauth/token) and
 *  returns its decoded payload, or null if invalid/expired. Exported so
 *  routes outside oauth.ts (e.g. organizations.ts) can accept a relying
 *  party's own access_token alongside Ondi's first-party HS256 session
 *  token — the same dual-acceptance GET /oauth/userinfo already needed. */
export function verifyOauthAccessToken(token: string): any | null {
  try {
    return jwt.verify(token, publicKeyObject.export({ type: 'spki', format: 'pem' }) as string, {
      algorithms: ['RS256'],
      issuer: ISSUER,
    });
  } catch {
    return null;
  }
}

const JWKS = {
  keys: [
    {
      kty: publicKeyJwk.kty,
      n:   publicKeyJwk.n,
      e:   publicKeyJwk.e,
      kid: 'ondi-key-1',
      use: 'sig',
      alg: 'RS256',
    }
  ]
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const ISSUER      = process.env.JWT_ISSUER  || 'https://ondi.hudumika.co.tz';
const BASE_URL    = process.env.ONDI_BASE_URL || ISSUER;
const ACCESS_TTL  = 15 * 60;        // 15 min
const REFRESH_TTL = 30 * 24 * 3600; // 30 days
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min

// Alias kept so token factories below still compile
const JWT_ISSUER = ISSUER;

interface PkceEntry {
  codeChallenge: string;
  codeChallengeMethod: string;
}

/** Hash a plain value with SHA-256 — used for refresh tokens & PKCE */
function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Validate PKCE: code_verifier → code_challenge must match */
function verifyPKCE(verifier: string, challenge: string) {
  const computed = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return computed === challenge;
}

/**
 * Verifies the caller's first-party session Bearer token (same one issued by
 * POST /auth/otp/verify et al, checked the same way as GET /auth/me) and
 * returns its subject userId. Routes that act on behalf of "the signed-in
 * user" must derive userId this way, never from the request body — a
 * body-supplied userId is just a claim, not proof of who's asking.
 */
function requireSessionUserId(req: any, reply: any): string | null {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'missing_token' });
    return null;
  }
  try {
    const payload: any = jwt.verify(authHeader.slice(7), JWT_SECRET, { issuer: JWT_ISSUER });
    return payload.sub;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

/** Mint a single-use auth code, optionally binding a PKCE challenge. Shared by POST /code and POST /launch. */
async function createAuthCode(
  app: FastifyInstance,
  userId: string,
  scope: string,
  codeChallenge?: string,
  orgId?: string | null,
): Promise<string> {
  const code = crypto.randomBytes(32).toString('hex');

  await app.prisma.authCode.create({
    data: { code, userId, scope, orgId: orgId ?? null, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });

  if (codeChallenge) {
    const pkceStore = createEphemeralStore<PkceEntry>(app, 'pkce');
    await pkceStore.set(code, { codeChallenge, codeChallengeMethod: 'S256' }, CODE_TTL_MS / 1000);
  }

  return code;
}

/**
 * Filter user data to only the requested scopes. `organizations` returns the
 * same real membership data as GET /organizations/mine (id/businessName/
 * role) — the only channel third-party OAuth clients (ClearOS, ComplyOS,
 * etc, who only ever hold the RS256 access/id token, never Ondi's own
 * first-party HS256 session) have to learn which real org a signed-in user
 * belongs to, instead of each product silently synthesizing its own fake
 * 1-person-1-org tenant.
 */
async function buildUserinfoClaims(app: FastifyInstance, user: any, profile: any, scopes: string[]) {
  const claims: Record<string, any> = { sub: user.id, one_id: user.ondi };

  if (scopes.includes('profile')) {
    claims.name      = [user.firstName, user.lastName].filter(Boolean).join(' ');
    claims.phone     = user.phoneNumber;
    claims.email     = user.email;
    claims.picture   = user.avatarUrl;
  }
  if (scopes.includes('trust') && profile) {
    claims.trust_score = profile.currentScore;
    claims.trust_tier  = profile.trustTier;
  }
  if (scopes.includes('kyc')) {
    claims.verification_level = user.verificationLevel;
    claims.kyc_status         = user.kycStatus;
  }
  if (scopes.includes('organizations')) {
    const memberships = await app.prisma.userRole.findMany({
      where: { userId: user.id, organizationId: { not: null } },
      include: { organization: true, role: true },
    });
    claims.organizations = memberships.map((m: any) => ({
      id:           m.organization!.id,
      businessName: m.organization!.businessName,
      role:         m.role.name,
    }));
  }
  return claims;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function oauthRoutes(app: FastifyInstance) {

  /**
   * GET /oauth/.well-known/openid-configuration
   * OpenID Connect Discovery metadata endpoint.
   */
  app.get('/.well-known/openid-configuration', async (req, reply) => {
    const o = `${BASE_URL}/v1/oauth`;
    return reply.send({
      issuer:                                ISSUER,
      authorization_endpoint:               `${o}/authorize`,
      token_endpoint:                        `${o}/token`,
      userinfo_endpoint:                     `${o}/userinfo`,
      jwks_uri:                              `${o}/jwks.json`,
      introspection_endpoint:               `${o}/introspect`,
      end_session_endpoint:                  `${o}/end_session`,
      response_types_supported:             ['code'],
      grant_types_supported:                ['authorization_code', 'refresh_token', 'client_credentials'],
      subject_types_supported:              ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported:                     ['openid', 'profile', 'email', 'phone', 'trust', 'kyc', 'organizations'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      claims_supported:                     ['sub', 'one_id', 'name', 'phone', 'email', 'trust_score', 'trust_tier', 'verification_level', 'kyc_status', 'organizations'],
    });
  });

  /**
   * GET /oauth/jwks.json
   * JSON Web Key Set containing the public keys for signature validation.
   */
  app.get('/jwks.json', async (req, reply) => {
    return reply.send(JWKS);
  });

  /**
   * GET /oauth/authorize
   * Starts the Authorization Code flow.
   * Validates client, redirectUri, scopes.
   */
  app.get('/authorize', async (req: any, reply) => {
    const {
      client_id, redirect_uri, scope = 'openid',
      state, code_challenge, code_challenge_method,
      // Subdomain hint from company.hudumika.tz — "sign in as this org."
      // Optional; a login started from app.hudumika.tz (no subdomain) omits it.
      organization,
    } = req.query;

    // 1. Validate client
    const client = await app.prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
    if (!client) return reply.code(400).send({ error: 'invalid_client' });
    if (!client.redirectUris.includes(redirect_uri))
      return reply.code(400).send({ error: 'invalid_redirect_uri' });

    // 2. Validate scopes — client can only request subset of its registered scopes
    const requestedScopes: string[] = scope.split(' ');
    const allowedScopes = requestedScopes.filter((s: string) => client.scopes.includes(s));
    if (!allowedScopes.includes('openid'))
      return reply.code(400).send({ error: 'invalid_scope', detail: 'openid scope required' });

    // 3. Require PKCE (S256 only)
    if (!code_challenge || code_challenge_method !== 'S256')
      return reply.code(400).send({ error: 'pkce_required' });

    // 4. Resolve the org hint, if any — a bad/unknown subdomain is not fatal
    // to the login itself, it just means no org gets stamped into the token.
    let organizationContext: { id: string; businessName: string; subdomain: string | null } | null = null;
    if (typeof organization === 'string' && organization) {
      const org = await app.prisma.organization.findUnique({ where: { subdomain: organization } });
      if (org) organizationContext = { id: org.id, businessName: org.businessName, subdomain: org.subdomain };
    }

    // Return consent context for the web UI
    return reply.send({
      action: 'CONSENT_REQUIRED',
      context: {
        clientId:        client_id,
        clientName:      client.name,
        clientLogoUrl:   client.logoUrl,
        requestedScopes: allowedScopes,
        isFirstParty:    client.isFirstParty,
        state,
        redirectUri:     redirect_uri,
        codeChallenge:   code_challenge,
        organization:    organizationContext,
      },
    });
  });

  /**
   * POST /oauth/code
   * Called internally after user successfully authenticates & consents.
   * Issues a single-use auth code (storing PKCE challenge in memory).
   */
  app.post('/code', async (req: any, reply) => {
    const userId = requireSessionUserId(req, reply);
    if (!userId) return;
    const { clientId, scope, codeChallenge, organizationId } = req.body;

    const client = await app.prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return reply.code(400).send({ error: 'invalid_client' });

    // App-scoped conditional access — this is the first point in the OAuth
    // flow that has both the authenticated userId and the target clientId
    // together (GET /authorize, above, has neither: it's unauthenticated and
    // only returns consent context). Only BLOCK is enforced here; STEP_UP
    // would need a new challenge/redirect UI this flow doesn't have yet —
    // documented follow-up, not silently dropped.
    // Resolves to a single org: the caller's subdomain hint if the user is
    // actually a member of it, else the user's sole membership if they only
    // belong to one org, else null (ambiguous — no picker UI exists yet, so
    // the resulting id_token simply carries no org_id, same as today).
    let resolvedOrgId: string | null = null;

    const user = await app.prisma.user.findUnique({ where: { id: userId }, include: { trustProfile: true } });
    if (user) {
      const memberships = await app.prisma.userRole.findMany({
        where: { userId, organizationId: { not: null } },
        select: { organizationId: true },
      });
      const membershipIds = memberships.map(m => m.organizationId!);
      if (organizationId && membershipIds.includes(organizationId)) {
        resolvedOrgId = organizationId;
      } else if (membershipIds.length === 1) {
        resolvedOrgId = membershipIds[0];
      }
      // No device/risk-factor signal exists at this point in the OAuth flow
      // (unlike /auth/otp/verify, which just ran the real device/risk check)
      // — so only minTrustTier / matchRiskFactors:[] conditions are
      // meaningful here; requireTrustedDevice/blockOnNewDevice policies
      // never match at this enforcement point.
      const policyResult = await app.accessPolicy.evaluate(
        memberships.map(m => m.organizationId!),
        userId,
        {
          trustTier: user.trustProfile?.trustTier ?? 'LOW',
          isNewDevice: false,
          deviceTrusted: true,
          riskFactors: [],
        },
        clientId,
      );
      if (policyResult.action === 'BLOCK') {
        await app.audit.write({
          entityType: 'USER', entityId: userId, action: 'ACCESS_DENIED', category: 'ACCESS',
          performedBy: userId, metadata: { reason: 'access_policy_block', clientId, matchedPolicyId: policyResult.matchedPolicyId },
          severity: 'WARNING', isRegulatory: false,
        });
        return reply.code(403).send({ error: 'access_blocked_by_policy' });
      }
    }

    // Auto-consent for first-party apps; check stored consent for third-party
    if (!client.isFirstParty) {
      const consent = await app.prisma.consent.findUnique({
        where: { userId_clientId: { userId, clientId: client.id } },
      });
      if (!consent || consent.revokedAt)
        return reply.code(403).send({ error: 'consent_required' });
    }

    const code = await createAuthCode(app, userId, scope || 'openid profile', codeChallenge, resolvedOrgId);
    return reply.send({ code });
  });

  /**
   * POST /oauth/token
   * Authorization Code → Access Token + ID Token + Refresh Token
   */
  app.post('/token', async (req: any, reply) => {
    const {
      grant_type, code,
      client_id, client_secret,
      redirect_uri, code_verifier,
      refresh_token,
    } = req.body;

    // ── Refresh Token Grant ─────────────────────────────────────────────────
    if (grant_type === 'refresh_token') {
      if (!refresh_token) return reply.code(400).send({ error: 'missing_refresh_token' });

      const session = await app.prisma.authSession.findFirst({
        where: { refreshTokenHash: sha256(refresh_token) },
        include: { user: { include: { trustProfile: true } } },
      });
      if (!session || session.expiresAt < new Date())
        return reply.code(401).send({ error: 'invalid_refresh_token' });

      const user = session.user;
      const newRefresh = crypto.randomBytes(48).toString('hex');

      // Rotate: invalidate old, issue new
      await app.prisma.authSession.update({
        where:  { id: session.id },
        data: {
          refreshTokenHash: sha256(newRefresh),
          expiresAt:        new Date(Date.now() + REFRESH_TTL * 1000),
        },
      });

      const accessToken = issueAccessToken(user, session.scope ?? 'openid profile trust', privateKeyPem, JWT_ISSUER);
      return reply.send(tokenResponse(accessToken, newRefresh));
    }

    // ── Client Credentials Grant (M2M) ─────────────────────────────────────
    if (grant_type === 'client_credentials') {
      if (!client_id || !client_secret)
        return reply.code(400).send({ error: 'client_credentials_required' });

      const client = await app.prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
      if (!client) return reply.code(401).send({ error: 'invalid_client' });
      if (client.clientSecret !== sha256(client_secret))
        return reply.code(401).send({ error: 'invalid_client_secret' });
      if (!(client as any).grantTypes?.includes('client_credentials'))
        return reply.code(400).send({ error: 'grant_type_not_allowed' });

      const scope  = req.body.scope || 'openid';
      const token  = jwt.sign(
        { sub: client.clientId, client_name: client.name, scope, client_credentials: true },
        privateKeyPem,
        { algorithm: 'RS256', keyid: 'ondi-key-1', expiresIn: ACCESS_TTL, issuer: ISSUER },
      );

      return reply.send({ access_token: token, token_type: 'Bearer', expires_in: ACCESS_TTL, scope });
    }

    // ── Authorization Code Grant ────────────────────────────────────────────
    if (grant_type !== 'authorization_code')
      return reply.code(400).send({ error: 'unsupported_grant_type' });

    const authCode = await app.prisma.authCode.findUnique({ where: { code } });
    if (!authCode || authCode.expiresAt < new Date())
      return reply.code(400).send({ error: 'invalid_grant' });

    // Validate client credentials
    const client = await app.prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
    if (!client || !client.redirectUris.includes(redirect_uri))
      return reply.code(400).send({ error: 'invalid_client' });

    // PKCE verification
    const pkceStore = createEphemeralStore<PkceEntry>(app, 'pkce');
    const pkce = await pkceStore.get(code);
    if (pkce) {
      if (!code_verifier) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'code_verifier required' });
      }
      const isValid = verifyPKCE(code_verifier, pkce.codeChallenge);
      if (!isValid) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }
      await pkceStore.delete(code); // consumed
    }

    const user = await app.prisma.user.findUnique({
      where:   { id: authCode.userId },
      include: { trustProfile: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const scopes = authCode.scope;

    let orgClaim: { id: string; subdomain: string | null; businessName: string; roleName: string | null } | null = null;
    if (authCode.orgId) {
      const org = await app.prisma.organization.findUnique({ where: { id: authCode.orgId } });
      if (org) {
        const membership = await app.prisma.userRole.findFirst({
          where: { userId: user.id, organizationId: org.id },
          include: { role: true },
        });
        orgClaim = { id: org.id, subdomain: org.subdomain, businessName: org.businessName, roleName: membership?.role.name ?? null };
      }
    }

    // Issue tokens
    const accessToken  = issueAccessToken(user, scopes, privateKeyPem, JWT_ISSUER);
    const idToken      = issueIdToken(user, client_id, privateKeyPem, JWT_ISSUER, orgClaim);
    const refreshPlain = crypto.randomBytes(48).toString('hex');

    // Create persistent session for refresh token rotation
    await app.prisma.authSession.create({
      data: {
        userId:           user.id,
        riskScore:        0,
        decision:         'allow',
        refreshTokenHash: sha256(refreshPlain),
        scope:            scopes,
        expiresAt:        new Date(Date.now() + REFRESH_TTL * 1000),
      },
    });

    // Consume auth code (single-use)
    await app.prisma.authCode.delete({ where: { code } });

    return reply.send({
      ...tokenResponse(accessToken, refreshPlain),
      id_token: idToken,
      scope: scopes,
    });
  });

  /**
   * GET /oauth/userinfo
   * Returns identity claims filtered by token scopes.
   */
  app.get('/userinfo', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });

    let payload: any;
    try {
      payload = jwt.verify(authHeader.slice(7), publicKeyObject.export({ type: 'spki', format: 'pem' }) as string, { algorithms: ['RS256'], issuer: JWT_ISSUER });
    } catch (err) {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const user = await app.prisma.user.findUnique({
      where:   { id: payload.sub },
      include: { trustProfile: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const scopes: string[] = (payload.scope || '').split(' ');
    return reply.send(await buildUserinfoClaims(app, user, user.trustProfile, scopes));
  });

  /**
   * POST /oauth/revoke
   * Revokes a refresh token (logs out session).
   */
  app.post('/revoke', async (req: any, reply) => {
    const { token } = req.body;
    if (!token) return reply.code(400).send({ error: 'missing_token' });

    await app.prisma.authSession.deleteMany({
      where: { refreshTokenHash: sha256(token) },
    });

    return reply.send({ revoked: true });
  });

  /**
   * POST /oauth/consent
   * Records user consent for third-party apps.
   */
  app.post('/consent', async (req: any, reply) => {
    const userId = requireSessionUserId(req, reply);
    if (!userId) return;
    const { clientId, scopes } = req.body;

    const client = await app.prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return reply.code(400).send({ error: 'invalid_client' });

    const consent = await app.prisma.consent.upsert({
      where:  { userId_clientId: { userId, clientId: client.id } },
      create: { userId, clientId: client.id, scopes },
      update: { scopes, revokedAt: null, grantedAt: new Date() },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'CONSENT_GRANTED',
      category:     'CONSENT',
      performedBy:  userId,
      metadata:     { clientId: client.clientId, scopes },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ granted: true, consentId: consent.id });
  });

  /**
   * POST /oauth/introspect  (RFC 7662)
   * Backend services call this to verify a token is active and fetch its claims.
   * Auth: client_id + client_secret in body.
   */
  app.post('/introspect', async (req: any, reply) => {
    const { token, client_id, client_secret } = req.body;
    if (!token || !client_id || !client_secret)
      return reply.code(400).send({ error: 'missing_fields' });

    // Authenticate the requesting client
    const client = await app.prisma.oAuthClient.findUnique({ where: { clientId: client_id } });
    if (!client || client.clientSecret !== sha256(client_secret))
      return reply.code(401).send({ error: 'invalid_client' });

    // Try decoding as JWT access token
    try {
      const pubPem = publicKeyObject.export({ type: 'spki', format: 'pem' }) as string;
      const payload: any = jwt.verify(token, pubPem, { algorithms: ['RS256'], issuer: ISSUER });

      // For user tokens, confirm the session is still active
      if (!payload.client_credentials) {
        const sessionActive = await app.prisma.authSession.findFirst({
          where: { userId: payload.sub, expiresAt: { gt: new Date() } },
        });
        if (!sessionActive) return reply.send({ active: false });
      }

      return reply.send({
        active:             true,
        sub:                payload.sub,
        one_id:             payload.one_id,
        scope:              payload.scope,
        client_id:          payload.client_credentials ? payload.sub : undefined,
        verification_level: payload.verification_level,
        trust_score:        payload.trust_score,
        trust_tier:         payload.trust_tier,
        exp:                payload.exp,
        iat:                payload.iat,
        iss:                payload.iss,
        token_type:         'Bearer',
      });
    } catch {
      // Could be a refresh token — check the hash
      const session = await app.prisma.authSession.findFirst({
        where: { refreshTokenHash: sha256(token), expiresAt: { gt: new Date() } },
      });
      if (!session) return reply.send({ active: false });

      return reply.send({
        active:     true,
        sub:        session.userId,
        token_type: 'refresh_token',
        exp:        Math.floor(session.expiresAt.getTime() / 1000),
      });
    }
  });

  /**
   * GET /oauth/end_session  (OIDC RP-Initiated Logout)
   * Called by a client app to log the user out of Ondi.
   * Params: id_token_hint, post_logout_redirect_uri, state
   */
  app.get('/end_session', async (req: any, reply) => {
    const { id_token_hint, post_logout_redirect_uri, state } = req.query;

    let userId: string | undefined;

    if (id_token_hint) {
      try {
        const pubPem = publicKeyObject.export({ type: 'spki', format: 'pem' }) as string;
        // id_token may be expired — skip expiry check for logout
        const payload: any = jwt.verify(id_token_hint, pubPem, {
          algorithms: ['RS256'],
          issuer: ISSUER,
          ignoreExpiration: true,
        });
        userId = payload.sub;
      } catch {
        // Invalid hint — still proceed with logout redirect
      }
    }

    if (userId) {
      await app.prisma.authSession.deleteMany({ where: { userId } });
    }

    if (post_logout_redirect_uri) {
      const redirectUrl = new URL(post_logout_redirect_uri);
      if (state) redirectUrl.searchParams.set('state', state);
      return reply.redirect(redirectUrl.toString());
    }

    return reply.send({ logged_out: true, userId: userId ?? null });
  });

  // ─── GET /oauth/apps — Launcher data source: only apps the user has
  // actually signed into at least once (a live consent record). First-party
  // status no longer forces an app onto the launcher before first use — an
  // app you've never connected to isn't "available" and shouldn't appear,
  // same as any real SSO launcher (OneLogin, Okta) only lists assigned apps
  // you've actually accessed, not every app that merely exists. ───────────
  app.get('/apps', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });
    try {
      const jwtLib = await import('jsonwebtoken');
      const payload: any = jwtLib.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      const userId = payload.sub;

      const consents = await app.prisma.consent.findMany({
        where: { userId, revokedAt: null },
        include: { client: true },
      });

      const apps = consents.map(c => ({
        clientId:     c.client.id,
        name:         c.client.name,
        logoUrl:      c.client.logoUrl,
        isFirstParty: c.client.isFirstParty,
        scopes:       c.scopes,
        connectedAt:  c.grantedAt,
      }));

      return reply.send({ apps });
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });

  // ─── POST /oauth/launch — one-click IdP-initiated SSO from Ondi's own
  // dashboard: mints a code and hands back the redirect URL to follow ────────
  app.post('/launch', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });
    try {
      const jwtLib = await import('jsonwebtoken');
      const payload: any = jwtLib.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      const userId = payload.sub;

      const { clientId } = req.body as { clientId?: string };
      if (!clientId) return reply.code(400).send({ error: 'missing_client_id' });

      const client = await app.prisma.oAuthClient.findUnique({ where: { id: clientId } });
      if (!client) return reply.code(404).send({ error: 'client_not_found' });
      if (!client.redirectUris[0]) return reply.code(400).send({ error: 'client_misconfigured' });

      let scope = client.scopes.join(' ') || 'openid';
      if (!client.isFirstParty) {
        const consent = await app.prisma.consent.findUnique({
          where: { userId_clientId: { userId, clientId: client.id } },
        });
        if (!consent || consent.revokedAt)
          return reply.code(403).send({ error: 'consent_required' });
        scope = consent.scopes.join(' ') || 'openid';
      }

      const code = await createAuthCode(app, userId, scope);

      await app.audit.write({
        entityType:   'USER',
        entityId:     userId,
        action:       'ACCESS_GRANTED',
        category:     'ACCESS',
        performedBy:  userId,
        metadata:     { clientId: client.clientId, launchedFrom: 'launcher' },
        severity:     'INFO',
        isRegulatory: false,
      });

      const separator  = client.redirectUris[0].includes('?') ? '&' : '?';
      const redirectUrl = `${client.redirectUris[0]}${separator}code=${code}&state=launcher`;

      return reply.send({ redirectUrl });
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });

  // ─── GET /oauth/consents — list apps the current user has authorized ────────
  app.get('/consents', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });
    try {
      const jwtLib = await import('jsonwebtoken');
      const payload: any = jwtLib.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      const consents = await app.prisma.consent.findMany({
        where: { userId: payload.sub, revokedAt: null },
        include: { client: { select: { id: true, name: true, logoUrl: true } } },
        orderBy: { grantedAt: 'desc' },
      });
      return reply.send({
        consents: consents.map(c => ({
          id: c.id,
          clientId: c.clientId,
          clientName: c.client.name,
          logoUri: c.client.logoUrl,
          scopes: c.scopes,
          consentedAt: c.grantedAt,
        })),
      });
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });

  // ─── DELETE /oauth/consents/:clientId — revoke a specific consent ───────────
  app.delete('/consents/:clientId', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });
    try {
      const jwtLib = await import('jsonwebtoken');
      const payload: any = jwtLib.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      const { clientId } = req.params as { clientId: string };
      await app.prisma.consent.updateMany({
        where: { userId: payload.sub, clientId },
        data: { revokedAt: new Date() },
      });
      // Also revoke all OAuth sessions for this client
      await app.prisma.authSession.deleteMany({
        where: { userId: payload.sub },
      });

      await app.audit.write({
        entityType:   'USER',
        entityId:     payload.sub,
        action:       'CONSENT_REVOKED',
        category:     'CONSENT',
        performedBy:  payload.sub,
        metadata:     { clientId },
        severity:     'INFO',
        isRegulatory: false,
      });

      return reply.send({ revoked: true });
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });

  // ─── PATCH /oauth/consents/:clientId — narrow an existing consent's scopes
  // without a full revoke ──────────────────────────────────────────────────
  app.patch('/consents/:clientId', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });
    try {
      const jwtLib = await import('jsonwebtoken');
      const payload: any = jwtLib.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      const userId = payload.sub;
      const { clientId } = req.params as { clientId: string };
      const { scopes: newScopes } = req.body as { scopes?: string[] };

      if (!Array.isArray(newScopes))
        return reply.code(400).send({ error: 'scopes_required' });

      const consent = await app.prisma.consent.findFirst({
        where: { userId, clientId },
      });
      if (!consent || consent.revokedAt)
        return reply.code(404).send({ error: 'consent_not_found' });

      if (newScopes.length === 0)
        return reply.code(400).send({ error: 'use_revoke_instead' });

      if (newScopes.includes('openid') === false && consent.scopes.includes('openid'))
        return reply.code(400).send({ error: 'openid_required' });

      const isSubset = newScopes.every(s => consent.scopes.includes(s));
      if (!isSubset)
        return reply.code(400).send({ error: 'cannot_widen_scope' });

      const previousScopes = consent.scopes;
      await app.prisma.consent.update({
        where: { id: consent.id },
        data:  { scopes: newScopes },
      });

      await app.audit.write({
        entityType:   'USER',
        entityId:     userId,
        action:       'CONSENT_GRANTED',
        category:     'CONSENT',
        performedBy:  userId,
        metadata:     { clientId, previousScopes, newScopes, action: 'narrowed' },
        severity:     'INFO',
        isRegulatory: false,
      });

      return reply.send({ updated: true, scopes: newScopes });
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });
}

// ─── Token factories (RS256) ──────────────────────────────────────────────────

function issueAccessToken(user: any, scope: string, privateKey: string, issuer: string) {
  return jwt.sign(
    {
      sub:                user.id,
      one_id:             user.ondi,
      verification_level: user.verificationLevel,
      trust_score:        user.trustProfile?.currentScore ?? 300,
      trust_tier:         user.trustProfile?.trustTier    ?? 'LOW',
      scope,
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'ondi-key-1', expiresIn: ACCESS_TTL, issuer },
  );
}

function issueIdToken(
  user: any,
  audience: string,
  privateKey: string,
  issuer: string,
  org?: { id: string; subdomain: string | null; businessName: string; roleName: string | null } | null,
) {
  return jwt.sign(
    {
      sub:                user.id,
      one_id:             user.ondi,
      name:               [user.firstName, user.lastName].filter(Boolean).join(' '),
      phone:              user.phoneNumber,
      email:              user.email,
      verification_level: user.verificationLevel,
      // Standard OIDC `picture` claim — only ever set for a user who signed
      // in via a federated provider (currently Google; see routes/federated.ts
      // and User.avatarUrl), so most native Ondi accounts still carry no
      // picture here. Downstream services should always fall back to
      // initials, never assume this is present.
      ...(user.avatarUrl ? { picture: user.avatarUrl } : {}),
      // Present only when the login was resolved to an organization (see
      // GET /authorize's `organization` hint + POST /code) — absent for
      // legacy/personal logins so downstream services must treat a missing
      // org_id as "no org," never as an error. org_role is the caller's
      // Ondi Role name (Owner/Admin/Member, or an org's custom role) within
      // this org — consumers map it to their own local role vocabulary.
      ...(org
        ? {
            org_id: org.id,
            org_name: org.businessName,
            ...(org.subdomain ? { org_slug: org.subdomain } : {}),
            ...(org.roleName ? { org_role: org.roleName } : {}),
          }
        : {}),
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'ondi-key-1', expiresIn: ACCESS_TTL, issuer, audience },
  );
}

function tokenResponse(accessToken: string, refreshToken: string) {
  return {
    access_token:  accessToken,
    token_type:    'Bearer',
    expires_in:    ACCESS_TTL,
    refresh_token: refreshToken,
  };
}
