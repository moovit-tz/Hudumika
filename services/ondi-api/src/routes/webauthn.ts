import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { extractUserId } from '../lib/org-auth.js';
import { createEphemeralStore } from '../lib/ephemeral-store.js';
import { signTokens } from './auth.js';

// Not secrets — sensible localhost defaults for dev, must be set correctly
// (real domain + https origin) for a production deployment or every
// ceremony will fail RP-ID/origin verification by design.
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Ondi';
const RP_ID   = process.env.WEBAUTHN_RP_ID   || 'localhost';
const ORIGIN  = process.env.WEBAUTHN_ORIGIN  || 'http://localhost:3000';

const CHALLENGE_TTL_SECONDS = 5 * 60;

interface RegChallenge { challenge: string }
interface AuthChallenge { userId: string; challenge: string }

export async function webauthnRoutes(app: FastifyInstance) {
  const regChallenges  = createEphemeralStore<RegChallenge>(app, 'webauthn-reg');
  const authChallenges = createEphemeralStore<AuthChallenge>(app, 'webauthn-auth');

  /**
   * GET /webauthn/credentials
   * List the caller's registered passkeys — never exposes the public key.
   */
  app.get('/credentials', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const creds = await app.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceName: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
    });
    return reply.send({ credentials: creds });
  });

  /**
   * DELETE /webauthn/credentials/:id
   */
  app.delete('/credentials/:id', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const cred = await app.prisma.webAuthnCredential.findUnique({ where: { id } });
    if (!cred || cred.userId !== userId) return reply.code(404).send({ error: 'credential_not_found' });

    await app.prisma.webAuthnCredential.delete({ where: { id } });

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'PASSKEY_REMOVED', category: 'AUTH',
      performedBy: userId, metadata: { credentialId: id, deviceName: cred.deviceName },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ removed: true });
  });

  /**
   * POST /webauthn/register/options
   * Caller must already be logged in (adding a passkey to an existing
   * account) — passkey registration is never how you create an Ondi account.
   */
  app.post('/register/options', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: { webAuthnCredentials: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.phoneNumber,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.phoneNumber,
      attestationType: 'none',
      excludeCredentials: user.webAuthnCredentials.map(c => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    await regChallenges.set(userId, { challenge: options.challenge }, CHALLENGE_TTL_SECONDS);
    return reply.send(options);
  });

  /**
   * POST /webauthn/register/verify
   * Body: { response: RegistrationResponseJSON, deviceName?: string }
   */
  app.post('/register/verify', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { response, deviceName } = req.body as { response: RegistrationResponseJSON; deviceName?: string };
    if (!response) return reply.code(400).send({ error: 'response_required' });

    const pending = await regChallenges.get(userId);
    if (!pending) return reply.code(400).send({ error: 'no_pending_registration_or_expired' });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });
    } catch (err: any) {
      return reply.code(400).send({ error: 'verification_failed', details: err.message });
    }
    await regChallenges.delete(userId);

    if (!verification.verified || !verification.registrationInfo)
      return reply.code(400).send({ error: 'verification_failed' });

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const saved = await app.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        deviceName: deviceName || 'Passkey',
      },
    });

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'PASSKEY_ADDED', category: 'AUTH',
      performedBy: userId, metadata: { credentialId: saved.id, deviceName: saved.deviceName },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ verified: true, credentialId: saved.id });
  });

  /**
   * POST /webauthn/authenticate/options
   * Body: { phoneNumber }
   * Returns a requestId the client must round-trip in /authenticate/verify —
   * there's no bearer token yet at this point in the login flow, so the
   * challenge can't be keyed by userId the way registration's is.
   */
  app.post('/authenticate/options', async (req: any, reply) => {
    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const user = await app.prisma.user.findUnique({
      where: { phoneNumber },
      include: { webAuthnCredentials: true },
    });
    if (!user || user.webAuthnCredentials.length === 0)
      return reply.code(404).send({ error: 'no_passkeys_registered' });

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: user.webAuthnCredentials.map(c => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      userVerification: 'preferred',
    });

    const requestId = crypto.randomUUID();
    await authChallenges.set(requestId, { userId: user.id, challenge: options.challenge }, CHALLENGE_TTL_SECONDS);

    return reply.send({ requestId, options });
  });

  /**
   * POST /webauthn/authenticate/verify
   * Body: { requestId, response: AuthenticationResponseJSON }
   * On success, issues access + refresh tokens like any other login endpoint.
   */
  app.post('/authenticate/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { requestId, response } = req.body as { requestId?: string; response?: AuthenticationResponseJSON };
    if (!requestId || !response) return reply.code(400).send({ error: 'missing_fields' });

    const pending = await authChallenges.get(requestId);
    if (!pending) return reply.code(400).send({ error: 'request_not_found_or_expired' });

    const cred = await app.prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
    if (!cred || cred.userId !== pending.userId)
      return reply.code(401).send({ error: 'credential_not_recognized' });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: cred.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch (err: any) {
      return reply.code(401).send({ error: 'verification_failed', details: err.message });
    }
    await authChallenges.delete(requestId);

    if (!verification.verified) return reply.code(401).send({ error: 'verification_failed' });

    await app.prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });

    const { accessToken, refreshToken } = await signTokens(pending.userId, app);

    await app.audit.write({
      entityType: 'USER', entityId: pending.userId, action: 'LOGIN_SUCCESS', category: 'AUTH',
      performedBy: pending.userId, metadata: { method: 'webauthn', credentialId: cred.id },
      severity: 'INFO', isRegulatory: true,
    });

    return reply.send({ success: true, access_token: accessToken, refresh_token: refreshToken });
  });
}
