import { FastifyInstance } from 'fastify';
import { verifyTOTP } from '../utils/totp.js';
import crypto from 'crypto';
import { ADMIN_KEY } from '../lib/env.js';
import { createEphemeralStore } from '../lib/ephemeral-store.js';
import { decryptMfaSecret, encryptMfaSecret, isLegacyPlaintextSecret } from '../lib/mfa-crypto.js';

/**
 * Returns the plaintext TOTP secret for a stored MFA_APP credential,
 * transparently decrypting it — or, for a row enrolled before secrets were
 * encrypted at rest, migrating it to encrypted storage on this first touch
 * instead of requiring a separate batch migration. The DB write is
 * fire-and-forget: a hiccup there just means this same row gets migrated
 * again next time it's read, which is harmless since the plaintext secret
 * itself hasn't changed.
 */
function resolveSecret(app: FastifyInstance, credentialId: string, meta: { secret: string; [key: string]: unknown }): string {
  if (!isLegacyPlaintextSecret(meta.secret)) return decryptMfaSecret(meta.secret);

  const migrated = JSON.stringify({ ...meta, secret: encryptMfaSecret(meta.secret) });
  app.prisma.credential.update({ where: { id: credentialId }, data: { identifier: migrated } }).catch(() => {});
  return meta.secret;
}

const MFA_CHALLENGE_TTL_SECONDS = 2 * 60;

interface MfaChallenge {
  otpId:       string;
  phoneNumber: string;
  appName:     string;
  requestInfo: Record<string, unknown>;
  status:      'pending' | 'approved' | 'denied';
}

export async function mfaRoutes(app: FastifyInstance) {
  // Redis-backed push MFA challenges (2-min TTL) — was an in-process Map.
  const mfaChallenges = createEphemeralStore<MfaChallenge>(app, 'mfa-challenge');

  /**
   * POST /mfa/enroll
   * Personal authenticator use (Ondi generating codes FOR another service,
   * "like Google Authenticator, built in"): the client supplies the secret
   * it scanned/typed from that service's own 2FA setup screen — Ondi can't
   * generate a secret on the user's behalf here, since the code has to
   * match whatever GitHub/AWS/etc. is actually expecting.
   *
   * Also still doubles as the original "external app adds Ondi as an MFA
   * provider" flow for API integrators: omit `secret` and Ondi generates
   * one, same as before.
   *
   * Body: { phoneNumber, appId, appName, issuer?, method: 'totp' | 'push', secret? }
   */
  app.post('/enroll', async (req: any, reply) => {
    const { phoneNumber, appId, appName, issuer, method = 'totp', secret: providedSecret } = req.body;
    if (!phoneNumber || !appName) return reply.code(400).send({ error: 'missing_fields' });

    const user = await app.prisma.user.upsert({
      where: { phoneNumber },
      create: { phoneNumber },
      update: {}
    });

    let secret: string;
    if (providedSecret) {
      // Base32 (RFC 4648) with optional padding — the standard TOTP secret
      // alphabet every authenticator export uses. Reject anything else here
      // rather than silently storing a secret that can never produce a
      // matching code.
      secret = String(providedSecret).replace(/\s+/g, '').toUpperCase();
      if (!/^[A-Z2-7]{16,}=*$/.test(secret)) {
        return reply.code(400).send({ error: 'invalid_secret_format' });
      }
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      secret = '';
      for (let i = 0; i < 32; i++) secret += chars[Math.floor(Math.random() * chars.length)];
    }

    const resolvedIssuer = issuer || appName;

    // Detect the same service already enrolled (same issuer + secret) —
    // re-adding it would just produce a second identical row. Secrets are
    // encrypted at rest, so this compares against each row's decrypted
    // plaintext rather than the stored ciphertext (which differs per row
    // even for an identical secret, since encryption uses a fresh IV).
    const existing = await app.prisma.credential.findMany({
      where: { userId: user.id, type: 'MFA_APP' },
    });
    const duplicate = existing.find(c => {
      try {
        const meta = JSON.parse(c.identifier);
        return resolveSecret(app, c.id, meta) === secret && (meta.issuer || meta.appName) === resolvedIssuer;
      } catch { return false; }
    });
    if (duplicate) return reply.code(409).send({ error: 'already_enrolled', enrollmentId: duplicate.id });

    // Store as Credential with type MFA_APP, identifier is JSON — secret is
    // encrypted at rest (AES-256-GCM, see lib/mfa-crypto.ts) so a DB
    // dump/backup leak doesn't hand over a live, still-valid 2FA seed for
    // every service a user has ever enrolled.
    const credential = await app.prisma.credential.create({
      data: {
        userId: user.id,
        type: 'MFA_APP',
        identifier: JSON.stringify({ appId: appId || crypto.randomUUID(), appName, issuer: resolvedIssuer, secret: encryptMfaSecret(secret), method }),
        verified: true
      }
    });

    const otpAuthUri = `otpauth://totp/${encodeURIComponent(resolvedIssuer)}:${encodeURIComponent(appName)}?secret=${secret}&issuer=${encodeURIComponent(resolvedIssuer)}`;

    await app.audit.write({
      entityType: 'USER', entityId: user.id, action: 'MFA_ENROLLED',
      category: 'AUTH', performedBy: user.id,
      metadata: { appName, method, enrollmentId: credential.id },
      severity: 'INFO', isRegulatory: true,
    });

    return reply.send({ enrollmentId: credential.id, secret, otpAuthUri, method });
  });

  /**
   * GET /mfa/apps?phoneNumber=xxx
   * Lists all MFA-enrolled apps for a user (for mobile authenticator display).
   */
  app.get('/apps', async (req: any, reply) => {
    const { phoneNumber } = req.query as { phoneNumber?: string };
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const user = await app.prisma.user.findUnique({
      where: { phoneNumber },
      include: { credentials: { where: { type: 'MFA_APP' } } }
    });

    if (!user) return reply.send({ apps: [] });

    const apps = user.credentials.map(c => {
      try {
        const meta = JSON.parse(c.identifier);
        return {
          id: c.id,
          appId: meta.appId,
          appName: meta.appName,
          issuer: meta.issuer || meta.appName,
          secret: resolveSecret(app, c.id, meta),
          method: meta.method || 'totp',
          enrolledAt: c.createdAt,
          lastUsed: c.lastUsedAt,
        };
      } catch { return null; }
    }).filter(Boolean);

    return reply.send({ apps });
  });

  /**
   * POST /mfa/verify
   * External app verifies a TOTP code submitted by their user.
   * Body: { enrollmentId, code } OR { phoneNumber, appId, code }
   */
  app.post('/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { enrollmentId, phoneNumber, appId, code } = req.body;
    if (!code) return reply.code(400).send({ error: 'code_required' });

    let cred: any;
    if (enrollmentId) {
      cred = await app.prisma.credential.findUnique({ where: { id: enrollmentId } });
    } else if (phoneNumber && appId) {
      const user = await app.prisma.user.findUnique({
        where: { phoneNumber },
        include: { credentials: { where: { type: 'MFA_APP' } } }
      });
      cred = user?.credentials.find(c => {
        try { return JSON.parse(c.identifier).appId === appId; } catch { return false; }
      });
    }

    if (!cred) return reply.code(404).send({ error: 'enrollment_not_found' });

    const meta = JSON.parse(cred.identifier);
    const valid = verifyTOTP(resolveSecret(app, cred.id, meta), code);

    if (valid) {
      await app.prisma.credential.update({ where: { id: cred.id }, data: { lastUsedAt: new Date() } });
    }

    await app.audit.write({
      entityType: 'CREDENTIAL', entityId: cred.id, action: valid ? 'MFA_VERIFIED' : 'MFA_FAILED',
      category: 'AUTH', performedBy: cred.userId,
      metadata: { appName: meta.appName, valid },
      severity: valid ? 'INFO' : 'WARNING', isRegulatory: true,
    });

    return reply.send({ valid, appName: meta.appName });
  });

  /**
   * DELETE /mfa/apps/:enrollmentId
   * User revokes MFA for a specific app.
   */
  app.delete('/apps/:enrollmentId', async (req: any, reply) => {
    const { enrollmentId } = req.params as { enrollmentId: string };
    await app.prisma.credential.delete({ where: { id: enrollmentId } });
    return reply.send({ revoked: true });
  });

  /**
   * GET /mfa/stats
   * Admin stats — protected by x-admin-key header.
   */
  app.get('/stats', async (req: any, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== (ADMIN_KEY)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [totpCount, pushCount, recent] = await Promise.all([
      app.prisma.credential.count({ where: { type: 'MFA_APP', identifier: { contains: '"method":"totp"' } } }),
      app.prisma.credential.count({ where: { type: 'MFA_APP', identifier: { contains: '"method":"push"' } } }),
      app.prisma.credential.findMany({
        where: { type: 'MFA_APP' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { phoneNumber: true, firstName: true, lastName: true } } }
      })
    ]);

    return reply.send({
      totalEnrollments: totpCount + pushCount,
      byMethod: { totp: totpCount, push: pushCount },
      recentActivity: recent.map(c => {
        const meta = (() => { try { return JSON.parse(c.identifier); } catch { return {}; } })();
        return {
          enrollmentId: c.id, appName: meta.appName, method: meta.method,
          phone: c.user?.phoneNumber, enrolledAt: c.createdAt, lastUsed: c.lastUsedAt
        };
      })
    });
  });

  /**
   * POST /mfa/challenge
   * External app creates a push-based MFA challenge (alternative to TOTP).
   * Body: { phoneNumber, appName, requestInfo }
   * Returns: { challengeId }
   */
  app.post('/challenge', async (req: any, reply) => {
    const { phoneNumber, appName, requestInfo } = req.body;
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const user = await app.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    // Store challenge in OTP table with purpose MFA_PUSH
    const challengeId = crypto.randomUUID();
    const otpRecord = await app.prisma.oTP.create({
      data: {
        phoneNumber, codeHash: challengeId, purpose: 'MFA_PUSH',
        expiresAt: new Date(Date.now() + 2 * 60_000),
      }
    });

    // Track challenge for fast polling
    await mfaChallenges.set(challengeId, {
      otpId:      otpRecord.id,
      phoneNumber,
      appName:    appName || 'Unknown App',
      requestInfo: requestInfo || {},
      status:     'pending',
    }, MFA_CHALLENGE_TTL_SECONDS);

    return reply.send({ challengeId, expiresIn: MFA_CHALLENGE_TTL_SECONDS });
  });

  /**
   * GET /mfa/challenge/:challengeId
   * Poll the status of a push MFA challenge.
   * Called by the external app waiting for the user to respond.
   */
  app.get('/challenge/:challengeId', async (req: any, reply) => {
    const { challengeId } = req.params as { challengeId: string };
    const challenge = await mfaChallenges.get(challengeId);

    if (!challenge) return reply.send({ status: 'expired' });

    return reply.send({
      status:      challenge.status,
      appName:     challenge.appName,
      requestInfo: challenge.requestInfo,
      expiresIn:   Math.max(0, await mfaChallenges.ttl(challengeId)),
    });
  });

  /**
   * POST /mfa/challenge/:challengeId/respond
   * Mobile user approves or denies an MFA push challenge.
   * Body: { approved: boolean, phoneNumber }
   */
  app.post('/challenge/:challengeId/respond', async (req: any, reply) => {
    const { challengeId } = req.params as { challengeId: string };
    const { approved, phoneNumber } = req.body as { approved?: boolean; phoneNumber?: string };

    if (typeof approved !== 'boolean') return reply.code(400).send({ error: 'approved_boolean_required' });
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const challenge = await mfaChallenges.get(challengeId);
    if (!challenge) return reply.code(404).send({ error: 'challenge_not_found_or_expired' });
    if (challenge.phoneNumber !== phoneNumber)
      return reply.code(403).send({ error: 'phone_mismatch' });
    if (challenge.status !== 'pending')
      return reply.code(409).send({ error: 'challenge_already_resolved' });

    challenge.status = approved ? 'approved' : 'denied';
    const remainingTtl = await mfaChallenges.ttl(challengeId);
    await mfaChallenges.set(challengeId, challenge, remainingTtl > 0 ? remainingTtl : MFA_CHALLENGE_TTL_SECONDS);

    // Mark OTP as used in DB
    await app.prisma.oTP.update({
      where: { id: challenge.otpId },
      data:  { status: approved ? 'USED' : 'EXPIRED' },
    });

    const user = await app.prisma.user.findUnique({ where: { phoneNumber } });
    if (user) {
      await app.audit.write({
        entityType:   'USER',
        entityId:     user.id,
        action:       approved ? 'MFA_VERIFIED' : 'MFA_FAILED',
        category:     'AUTH',
        performedBy:  user.id,
        metadata:     { appName: challenge.appName, challengeId, approved },
        severity:     approved ? 'INFO' : 'WARNING',
        isRegulatory: true,
      });
    }

    return reply.send({ success: true, status: challenge.status });
  });
}
