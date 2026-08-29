/**
 * routes/federated.ts
 *
 * Federated / Social Login — "Sign in with X"
 *
 * Supported providers:
 *   google    — Google Sign-In (OIDC, RS256/ES256)
 *   microsoft — Microsoft identity platform (OIDC, RS256)
 *   apple     — Sign in with Apple (OIDC, ES256)
 *   github    — GitHub OAuth (access_token → /user API, not OIDC)
 *   baidu     — Baidu OAuth 2.0 (for Chinese clients)
 *
 * Flow (all providers):
 *   1. App handles its own OAuth/OIDC redirect with the provider
 *   2. App receives provider token (id_token or access_token)
 *   3. App calls POST /auth/federated/:provider  { token }
 *   4. Ondi verifies the token with the provider's public keys / API
 *   5. Ondi upserts a FederatedIdentity + User record
 *   6. Ondi returns its own access_token + refresh_token
 *
 * Linking:
 *   Authenticated users can link/unlink provider identities via
 *   POST /auth/federated/link  and  DELETE /auth/federated/:provider
 */

import { FastifyInstance } from 'fastify';
import crypto              from 'crypto';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';

// ─── JWKS cache (5-min TTL) ──────────────────────────────────────────────────
const jwksCache = new Map<string, { keys: any[]; at: number }>();

async function getJWKS(url: string): Promise<any[]> {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.at < 300_000) return cached.keys;
  const res  = await fetch(url);
  const data = await res.json() as { keys: any[] };
  jwksCache.set(url, { keys: data.keys, at: Date.now() });
  return data.keys;
}

const PROVIDER_JWKS: Record<string, string> = {
  google:    'https://www.googleapis.com/oauth2/v3/certs',
  microsoft: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  apple:     'https://appleid.apple.com/auth/keys',
};

// Expected audience (aud) claim per provider — prevents token reuse across services
const PROVIDER_AUDIENCE: Record<string, () => string | undefined> = {
  google:    () => process.env.GOOGLE_CLIENT_ID,
  microsoft: () => process.env.MICROSOFT_CLIENT_ID,
  apple:     () => process.env.APPLE_CLIENT_ID,
};

/**
 * Verify a provider-signed ID token (OIDC / JWT).
 * Fetches the provider's JWKS, finds the matching key by kid, verifies signature + audience.
 */
async function verifyIdToken(provider: string, idToken: string): Promise<any> {
  const jwksUrl = PROVIDER_JWKS[provider];
  if (!jwksUrl) throw new Error('unsupported_provider');

  const [headerB64] = idToken.split('.');
  const header      = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { kid?: string; alg?: string };

  const keys = await getJWKS(jwksUrl);
  const jwk  = header.kid ? keys.find((k: any) => k.kid === header.kid) : keys[0];
  if (!jwk) throw new Error('provider_key_not_found');

  const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  const jwtLib    = await import('jsonwebtoken');

  const audience = PROVIDER_AUDIENCE[provider]?.();

  return jwtLib.default.verify(idToken, publicKey, {
    algorithms: [(header.alg as any) || 'RS256'],
    ...(audience ? { audience } : {}),  // only validate aud if env var is set
  });
}

/**
 * Normalize provider-specific claims into a common shape.
 */
function extractClaims(provider: string, payload: any): {
  sub: string; email?: string; name?: string; firstName?: string; lastName?: string; workspaceDomain?: string; avatarUrl?: string;
} {
  switch (provider) {
    case 'google':
      return {
        sub:       payload.sub,
        email:     payload.email,
        name:      payload.name,
        firstName: payload.given_name,
        lastName:  payload.family_name,
        // `hd` (hosted domain) is only present for Google Workspace–managed accounts,
        // never for personal @gmail.com accounts — lets us recognize org users at signup.
        workspaceDomain: payload.hd,
        // The same Google Account photo shown across every Google product —
        // carried through so it can follow the user across every Hudumika
        // product too (see User.avatarUrl).
        avatarUrl: payload.picture,
      };
    case 'microsoft':
      return {
        sub:       payload.sub || payload.oid,
        email:     payload.email || payload.preferred_username,
        name:      payload.name,
        firstName: payload.given_name,
        lastName:  payload.family_name,
      };
    case 'apple':
      return {
        sub:   payload.sub,
        email: payload.email,
        // Apple sends name only on first auth — caller can pass it in body
      };
    default:
      return { sub: payload.sub || payload.id, email: payload.email, name: payload.name };
  }
}

async function signTokens(userId: string, app: FastifyInstance, deviceId?: string) {
  const jwtLib = await import('jsonwebtoken');
  const user   = await app.prisma.user.findUnique({
    where:   { id: userId },
    include: { trustProfile: true },
  });
  if (!user) throw new Error('user_not_found');

  const accessToken = jwtLib.default.sign(
    {
      sub:                user.id,
      one_id:             user.ondi,
      verification_level: user.verificationLevel,
      trust_score:        user.trustProfile?.currentScore ?? 300,
      trust_tier:         user.trustProfile?.trustTier    ?? 'LOW',
    },
    JWT_SECRET,
    { expiresIn: '15m', issuer: JWT_ISSUER },
  );

  const plainRefresh = crypto.randomUUID();
  const refreshHash  = crypto.createHash('sha256').update(plainRefresh).digest('hex');

  await app.prisma.authSession.create({
    data: {
      userId,
      deviceId,
      refreshTokenHash: refreshHash,
      riskScore:        0,
      decision:         'allow',
      expiresAt:        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken: plainRefresh, user };
}

/**
 * Same device upsert auth.ts's /otp/verify does — federated logins used to
 * skip this entirely, so AuthSession.deviceId was always null and every
 * Google sign-in showed up as "Unknown device" on Sessions/Devices.
 */
async function upsertDevice(
  app: FastifyInstance,
  userId: string,
  deviceFingerprint: string | undefined,
  deviceName: string | undefined,
  userAgent: string | undefined,
  ipAddress: string | undefined,
) {
  if (!deviceFingerprint) return undefined;
  const existing = await app.prisma.device.findUnique({ where: { deviceId: deviceFingerprint } });
  if (existing) {
    await app.prisma.device.update({
      where: { id: existing.id },
      data: { lastUsedAt: new Date(), ipAddress, deviceName: deviceName ?? undefined, userAgent: userAgent ?? undefined },
    });
    return existing;
  }
  return app.prisma.device.create({
    data: { userId, deviceId: deviceFingerprint, deviceName, userAgent, ipAddress },
  });
}

async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwtLib  = await import('jsonwebtoken');
    const payload = jwtLib.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    ) as any;
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function federatedRoutes(app: FastifyInstance) {

  /**
   * GET /auth/federated/providers
   * Returns the list of enabled social providers + their OAuth config.
   * Apps use this to build their "Sign in with X" buttons dynamically.
   */
  app.get('/providers', async (_req, reply) => {
    return reply.send({
      providers: [
        {
          id:       'google',
          name:     'Google',
          enabled:  true,
          authUrl:  'https://accounts.google.com/o/oauth2/v2/auth',
          scopes:   ['openid', 'email', 'profile'],
          clientId: process.env.GOOGLE_CLIENT_ID || null,
        },
        {
          id:       'microsoft',
          name:     'Microsoft',
          enabled:  true,
          authUrl:  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          scopes:   ['openid', 'email', 'profile'],
          clientId: process.env.MICROSOFT_CLIENT_ID || null,
        },
        {
          id:       'apple',
          name:     'Apple',
          enabled:  true,
          authUrl:  'https://appleid.apple.com/auth/authorize',
          scopes:   ['openid', 'email', 'name'],
          clientId: process.env.APPLE_CLIENT_ID || null,
        },
        {
          id:       'github',
          name:     'GitHub',
          enabled:  true,
          authUrl:  'https://github.com/login/oauth/authorize',
          scopes:   ['read:user', 'user:email'],
          clientId: process.env.GITHUB_CLIENT_ID || null,
        },
        {
          id:       'baidu',
          name:     'Baidu',
          enabled:  true,
          authUrl:  'https://openapi.baidu.com/oauth/2.0/authorize',
          scopes:   ['basic', 'email'],
          clientId: process.env.BAIDU_API_KEY || null,
        },
      ],
    });
  });

  // ─── OIDC providers (Google, Microsoft, Apple) ───────────────────────────────

  for (const provider of ['google', 'microsoft', 'apple'] as const) {
    /**
     * POST /auth/federated/google|microsoft|apple
     * Body: { idToken, firstName?, lastName? }
     * (firstName/lastName needed for Apple which only sends them on first sign-in)
     */
    app.post(`/${provider}`, async (req: any, reply) => {
      const { idToken, firstName, lastName, deviceFingerprint, deviceName } = req.body as {
        idToken?: string; firstName?: string; lastName?: string;
        deviceFingerprint?: string; deviceName?: string;
      };
      if (!idToken) return reply.code(400).send({ error: 'id_token_required' });

      let payload: any;
      try {
        payload = await verifyIdToken(provider, idToken);
      } catch (err: any) {
        app.log.warn(err, `${provider} token verification failed`);
        return reply.code(401).send({ error: 'invalid_provider_token', provider });
      }

      const claims = extractClaims(provider, payload);

      return handleFederatedLogin(app, reply, {
        provider,
        providerSub:     claims.sub,
        email:           claims.email,
        name:            claims.name || [firstName, lastName].filter(Boolean).join(' ') || undefined,
        firstName:       claims.firstName || firstName,
        lastName:        claims.lastName  || lastName,
        workspaceDomain: claims.workspaceDomain,
        avatarUrl:       claims.avatarUrl,
        deviceFingerprint,
        deviceName,
        userAgent: req.headers['user-agent'] as string | undefined,
        ipAddress: req.ip as string | undefined,
      });
    });
  }

  // ─── GitHub (access_token → /user API) ──────────────────────────────────────

  /**
   * POST /auth/federated/github
   * Body: { accessToken }
   * GitHub does not issue OIDC tokens; we verify via API call.
   */
  app.post('/github', async (req: any, reply) => {
    const { accessToken: ghToken } = req.body as { accessToken?: string };
    if (!ghToken) return reply.code(400).send({ error: 'access_token_required' });

    try {
      const [userRes, emailRes] = await Promise.all([
        fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'Ondi-IdP' },
        }),
        fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'Ondi-IdP' },
        }),
      ]);

      if (!userRes.ok) return reply.code(401).send({ error: 'invalid_github_token' });

      const ghUser   = await userRes.json() as any;
      const ghEmails = emailRes.ok ? await emailRes.json() as any[] : [];
      const primary  = ghEmails.find((e: any) => e.primary && e.verified)?.email ?? ghUser.email;

      return handleFederatedLogin(app, reply, {
        provider:    'github',
        providerSub: String(ghUser.id),
        email:       primary,
        name:        ghUser.name || ghUser.login,
        firstName:   ghUser.name?.split(' ')[0],
        lastName:    ghUser.name?.split(' ').slice(1).join(' ') || undefined,
      });
    } catch (err: any) {
      app.log.warn(err, 'GitHub token verification failed');
      return reply.code(401).send({ error: 'invalid_github_token' });
    }
  });

  // ─── Baidu (for Chinese clients) ─────────────────────────────────────────────

  /**
   * POST /auth/federated/baidu
   * Body: { accessToken }
   * Verifies via Baidu's /rest/2.0/passport/users/getInfo API.
   */
  app.post('/baidu', async (req: any, reply) => {
    const { accessToken: baiduToken } = req.body as { accessToken?: string };
    if (!baiduToken) return reply.code(400).send({ error: 'access_token_required' });

    try {
      const res = await fetch(
        `https://openapi.baidu.com/rest/2.0/passport/users/getInfo?access_token=${encodeURIComponent(baiduToken)}`,
        { headers: { 'User-Agent': 'Ondi-IdP' } },
      );
      const data = await res.json() as any;

      if (data.error || !data.userid) {
        return reply.code(401).send({ error: 'invalid_baidu_token', detail: data.error_description });
      }

      return handleFederatedLogin(app, reply, {
        provider:    'baidu',
        providerSub: String(data.userid),
        email:       undefined, // Baidu does not expose email by default
        name:        data.realname || data.username,
        firstName:   undefined,
        lastName:    undefined,
      });
    } catch (err: any) {
      app.log.warn(err, 'Baidu token verification failed');
      return reply.code(401).send({ error: 'invalid_baidu_token' });
    }
  });

  // ─── Identity linking (authenticated user) ───────────────────────────────────

  /**
   * GET /auth/federated/identities
   * List all federated identities linked to the current user.
   */
  app.get('/identities', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const identities = await app.prisma.federatedIdentity.findMany({
      where:   { userId },
      select:  { id: true, provider: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ identities });
  });

  /**
   * POST /auth/federated/link
   * Link a provider identity to the currently authenticated Ondi account.
   * Body: { provider, idToken } or { provider, accessToken }
   */
  app.post('/link', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { provider, idToken, accessToken: providerToken } = req.body as {
      provider?: string; idToken?: string; accessToken?: string;
    };
    if (!provider) return reply.code(400).send({ error: 'provider_required' });

    let providerSub: string;
    let email: string | undefined;
    let name: string | undefined;

    if (['google', 'microsoft', 'apple'].includes(provider)) {
      if (!idToken) return reply.code(400).send({ error: 'id_token_required' });
      try {
        const payload = await verifyIdToken(provider, idToken);
        const claims  = extractClaims(provider, payload);
        providerSub   = claims.sub;
        email         = claims.email;
        name          = claims.name;
      } catch {
        return reply.code(401).send({ error: 'invalid_provider_token' });
      }
    } else if (provider === 'github') {
      if (!providerToken) return reply.code(400).send({ error: 'access_token_required' });
      const res    = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${providerToken}`, 'User-Agent': 'Ondi-IdP' },
      });
      if (!res.ok) return reply.code(401).send({ error: 'invalid_github_token' });
      const ghUser = await res.json() as any;
      providerSub  = String(ghUser.id);
      email        = ghUser.email;
      name         = ghUser.name || ghUser.login;
    } else if (provider === 'baidu') {
      if (!providerToken) return reply.code(400).send({ error: 'access_token_required' });
      const res  = await fetch(`https://openapi.baidu.com/rest/2.0/passport/users/getInfo?access_token=${encodeURIComponent(providerToken)}`);
      const data = await res.json() as any;
      if (data.error || !data.userid) return reply.code(401).send({ error: 'invalid_baidu_token' });
      providerSub = String(data.userid);
      name        = data.realname || data.username;
    } else {
      return reply.code(400).send({ error: 'unsupported_provider' });
    }

    // Check not already linked to another account
    const providerEnum = provider.toUpperCase() as any;
    const existing = await app.prisma.federatedIdentity.findUnique({
      where: { provider_providerSub: { provider: providerEnum, providerSub } },
    });
    if (existing && existing.userId !== userId)
      return reply.code(409).send({ error: 'identity_already_linked_to_another_account' });

    await app.prisma.federatedIdentity.upsert({
      where:  { userId_provider: { userId, provider: providerEnum } },
      create: { userId, provider: providerEnum, providerSub, email, name },
      update: { providerSub, email, name },
    });

    return reply.send({ linked: true, provider });
  });

  /**
   * DELETE /auth/federated/:provider
   * Unlink a provider from the current user's account.
   */
  app.delete('/:provider', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { provider: providerRaw } = req.params as { provider: string };
    const provider = providerRaw.toUpperCase() as any;

    const identity = await app.prisma.federatedIdentity.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!identity) return reply.code(404).send({ error: 'identity_not_found' });

    await app.prisma.federatedIdentity.delete({ where: { id: identity.id } });
    return reply.send({ unlinked: true, provider });
  });
}

// ─── Shared upsert + token issuance ──────────────────────────────────────────

async function handleFederatedLogin(
  app:   FastifyInstance,
  reply: any,
  data: {
    provider:        string;
    providerSub:     string;
    email?:          string;
    name?:           string;
    firstName?:      string;
    lastName?:       string;
    workspaceDomain?: string;
    avatarUrl?:      string;
    deviceFingerprint?: string;
    deviceName?:     string;
    userAgent?:      string;
    ipAddress?:      string;
  },
) {
  const { providerSub, email, name, firstName, lastName, workspaceDomain, avatarUrl, deviceFingerprint, deviceName, userAgent, ipAddress } = data;
  // Prisma FederatedProvider enum is uppercase (GOOGLE, MICROSOFT, etc.)
  const provider = data.provider.toUpperCase() as any;

  // Find existing linked identity
  let fedId = await app.prisma.federatedIdentity.findUnique({
    where: { provider_providerSub: { provider: provider as any, providerSub } },
    include: { user: true },
  });

  let userId: string;
  let isNewUser = false;

  if (fedId) {
    // Known identity — just log in. Re-syncs avatarUrl every sign-in (not
    // just on first link) so a changed Google Account photo follows through,
    // the same way it does across Google's own products.
    userId = fedId.userId;
    await app.prisma.federatedIdentity.update({
      where: { id: fedId.id },
      data:  { email, name },
    });
    if (avatarUrl) {
      await app.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    }
  } else {
    // Unknown identity — find or create user by email, then link
    let user = email
      ? await app.prisma.user.findUnique({ where: { email } })
      : null;

    if (!user) {
      // Brand new user — create with no phone (phone added during KYC)
      user = await app.prisma.user.create({
        data: {
          // phoneNumber must be unique & non-null in schema — use a placeholder
          // real phone collected during onboarding
          phoneNumber: `federated_${provider}_${providerSub}`,
          email,
          firstName:   firstName || name?.split(' ')[0],
          lastName:    lastName  || name?.split(' ').slice(1).join(' ') || undefined,
          avatarUrl,
        },
      });
      isNewUser = true;
    }

    userId = user.id;

    // Link the federated identity
    await app.prisma.federatedIdentity.create({
      data: { userId, provider: provider as any, providerSub, email, name },
    });

    // Update profile fields if missing
    await app.prisma.user.update({
      where: { id: userId },
      data: {
        email:     email     ?? undefined,
        firstName: firstName ?? undefined,
        lastName:  lastName  ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      },
    });
  }

  const device = await upsertDevice(app, userId, deviceFingerprint, deviceName, userAgent, ipAddress);
  const { accessToken, refreshToken, user } = await signTokens(userId, app, device?.id);

  // The Activity screen (GET /auth/logins) reads AuthEvent, not the audit
  // log below — federated logins never wrote one, so a Google sign-in never
  // showed up there even though it clearly happened (visible via Devices/
  // Sessions timestamps). Same row shape auth.ts's /otp/verify creates.
  await app.prisma.authEvent.create({
    data: {
      userId,
      deviceId:  device?.id,
      location:  ipAddress,
      success:   true,
      riskLevel: 'allow',
    },
  });

  await app.audit.write({
    entityType:   'USER',
    entityId:     userId,
    action:       'LOGIN_SUCCESS',
    category:     'AUTH',
    performedBy:  userId,
    metadata:     { provider, method: 'federated' },
    severity:     'INFO',
    isRegulatory: true,
  });

  return reply.send({
    success:       true,
    access_token:  accessToken,
    refresh_token: refreshToken,
    provider,
    // True only when this call just created the User row — lets the client
    // route a first-time federated signup through the same onboarding chain
    // (KYC, PIN, biometrics) a phone signup goes through, instead of landing
    // straight on Home like a returning user.
    isNewUser,
    // Present only for Google Workspace–managed accounts; frontend uses this to offer
    // organization setup instead of asking "individual or business" upfront.
    workspaceDomain,
    user: {
      id:                user.id,
      ondi:              user.ondi,
      email:             user.email,
      firstName:         user.firstName,
      lastName:          user.lastName,
      phoneNumber:       user.phoneNumber,
      verificationLevel: user.verificationLevel,
      // Was already persisted from the provider's `picture` claim (see
      // extractClaims above) but never echoed back — clients had to make a
      // separate /auth/me round trip just to get the avatar they just sent.
      avatarUrl:         user.avatarUrl,
    },
  });
}
