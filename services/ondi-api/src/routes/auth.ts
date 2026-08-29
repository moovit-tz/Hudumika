import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { verifyTOTP } from '../utils/totp.js';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';
import { createEphemeralStore } from '../lib/ephemeral-store.js';
import { extractUserId } from '../lib/org-auth.js';
import { requireAdmin } from '../lib/admin-auth.js';
import { sendCodeEmail, hasDeliverablePhone } from '../lib/mailer.js';
import type { AuditAction } from '@ondi/db';

const PUSH_SESSION_TTL_SECONDS = 90;
interface PushSession {
  id: string;
  phoneNumber: string;
  status: 'pending' | 'approved' | 'denied';
  location: string;
  device: string;
  deviceFingerprint?: string;
}

const STEP_UP_TOTP_TTL_SECONDS = 2 * 60;
const STEP_UP_OTP_TTL_SECONDS  = 5 * 60;
interface StepUpChallenge {
  userId: string;
  type: 'totp' | 'otp';
  otpId?: string; // only for type: 'otp'
}

export async function signTokens(userId: string, app: FastifyInstance, deviceId?: string) {
  const jwt = await import('jsonwebtoken');
  const user = await app.prisma.user.findUnique({
    where: { id: userId },
    include: { trustProfile: true },
  });
  if (!user) throw new Error('user_not_found');

  const accessToken = jwt.default.sign(
    {
      sub:                user.id,
      one_id:             user.ondi,
      verification_level: user.verificationLevel,
      trust_score:        user.trustProfile?.currentScore ?? 300,
      trust_tier:         user.trustProfile?.trustTier ?? 'LOW',
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
      expiresAt:        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return { accessToken, refreshToken: plainRefresh, user };
}

export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '255' + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * If the owner can still complete a normal login, any open recovery request
 * against their account was never legitimate — this is the real self-healing
 * mechanism (stronger than the passive heads-up SMS recovery/request sends).
 */
async function cancelOpenRecoveryRequests(app: FastifyInstance, userId: string) {
  const open = await app.prisma.recoveryRequest.findMany({
    where: { userId, completedAt: null, deniedAt: null, expiresAt: null },
  });
  if (open.length === 0) return;

  await app.prisma.recoveryRequest.updateMany({
    where: { id: { in: open.map(r => r.id) } },
    data:  { expiresAt: new Date() },
  });

  for (const r of open) {
    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'RECOVERY_DENIED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { requestId: r.id, reason: 'auto_cancelled_by_normal_login' },
      severity:     'INFO',
      isRegulatory: true,
    });
  }
}

/**
 * Dispatched through services/feed-api's shared POST /dispatch — the one
 * place on the platform holding the KilaKona credentials and send logic
 * (moved out of here, and out of services/sign-api's own copy, into
 * feed-api/src/lib/kilakona.ts). This function's signature is unchanged
 * so none of its six call sites below needed to change.
 */
export async function sendSMS(to: string, message: string, log: any) {
  const url = process.env.FEED_API_URL;
  const key = process.env.FEED_SERVICE_KEY;

  if (!url) {
    log.warn('FEED_API_URL not set. SMS not sent.');
    return;
  }

  try {
    const response = await fetch(`${url}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': key ?? '' },
      body: JSON.stringify({ sourceApp: 'ondi', channel: 'sms', to, message }),
    });

    const responseData = await response.text();
    if (!response.ok) {
      log.error(`Failed to dispatch SMS to ${to} via Feed: Status ${response.status}, Response: ${responseData}`);
    } else {
      log.info(`SMS dispatched to ${to} via Feed: ${responseData}`);
    }
  } catch (error) {
    log.error(`Error dispatching SMS to ${to} via Feed:`, error);
  }
}

/**
 * Every OTP issuance sends a real, billed SMS via Kilakona — this is the
 * one shared gate all three OTP-issuing routes (/request-otp, /initiate,
 * /otp/resend) go through before calling sendSMS, so a gap in one route
 * can't quietly bleed SMS spend. Three layers, cheapest-to-check first:
 *   1. Per-phone burst (3 / 5 min)   — stops rapid-fire resend spam.
 *   2. Per-phone daily cap (10 / 24h) — stops slow-drip abuse that stays
 *      under the burst window.
 *   3. Per-IP hourly budget (20 / hour, Redis) — stops one attacker from
 *      working through many different phone numbers, which per-phone
 *      limits alone can't catch since each number individually stays
 *      under its own cap.
 * Counts every OTP row regardless of status (PENDING/EXPIRED/VERIFIED) —
 * each row represents one SMS already sent, so status doesn't matter for
 * a cost-based budget the way it does for "is there a live code" checks.
 */
async function enforceOtpBudget(
  app: FastifyInstance,
  reply: any,
  phoneNumber: string,
  ip: string,
): Promise<boolean> {
  const fiveMinWindow = 5 * 60_000;
  const fiveMinAgo = new Date(Date.now() - fiveMinWindow);
  const recentOtps = await app.prisma.oTP.findMany({
    where: { phoneNumber, createdAt: { gte: fiveMinAgo } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (recentOtps.length >= 3) {
    // Retry-after tracks when the *oldest* of the 3 ages out of the window
    // (not a flat 5 minutes) so the message the person sees is always true,
    // whether they're 10 seconds or 4 minutes into the cooldown.
    const retryAfter = secondsUntil(recentOtps[0].createdAt, fiveMinWindow);
    reply.code(429).send({ error: 'rate_limit', retryAfter });
    return false;
  }

  const dayWindow = 24 * 60 * 60_000;
  const dayAgo = new Date(Date.now() - dayWindow);
  const dailyOtps = await app.prisma.oTP.findMany({
    where: { phoneNumber, createdAt: { gte: dayAgo } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (dailyOtps.length >= 10) {
    const retryAfter = secondsUntil(dailyOtps[0].createdAt, dayWindow);
    reply.code(429).send({ error: 'daily_rate_limit', retryAfter });
    return false;
  }

  const ipWindowSeconds = 3600;
  const ipKey = `otp-budget:ip:${ip}`;
  const ipCount = await app.redis.incr(ipKey);
  if (ipCount === 1) await app.redis.expire(ipKey, ipWindowSeconds);
  if (ipCount > 20) {
    const ttl = await app.redis.ttl(ipKey);
    reply.code(429).send({ error: 'ip_rate_limit', retryAfter: ttl > 0 ? ttl : ipWindowSeconds });
    return false;
  }

  return true;
}

function secondsUntil(from: Date, windowMs: number): number {
  return Math.max(1, Math.ceil((from.getTime() + windowMs - Date.now()) / 1000));
}

export async function authRoutes(app: FastifyInstance) {
  const pushSessions = createEphemeralStore<PushSession>(app, 'push-session');
  const stepUpChallenges = createEphemeralStore<StepUpChallenge>(app, 'step-up');

  /**
   * POST /auth/request-otp
   * Rate-limited by enforceOtpBudget: 3/phone/5min, 10/phone/day, 20/ip/hour.
   */
  app.post('/request-otp', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { phoneNumber, purpose = 'LOGIN' } = req.body;
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });
    if (!(await enforceOtpBudget(app, reply, phoneNumber, req.ip))) return;

    // Generate 6-digit OTP
    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash  = crypto.createHash('sha256').update(plainCode).digest('hex');

    await app.prisma.oTP.create({
      data: {
        phoneNumber,
        codeHash,
        purpose,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    // Audit: OTP issued — regulatory trail
    await app.audit.write({
      entityType:   'USER',
      entityId:     phoneNumber,
      action:       'OTP_ISSUED',
      category:     'AUTH',
      performedBy:  'system',
      metadata:     { purpose },
      severity:     'INFO',
      isRegulatory: true,
    });

    app.log.info(`OTP for ${phoneNumber}: ${plainCode}`); // dev only
    await sendSMS(phoneNumber, `HUDUMIKA Verification Code: ${plainCode}. Valid for 5 minutes.`, app.log);
    return reply.send({ sent: true, expiresIn: 300 });
  });


  /**
   * POST /auth/verify-otp
   * Validates OTP, upserts user at L0, evaluates device risk, returns session decision.
   */
  app.post('/verify-otp', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { phoneNumber, code, deviceFingerprint, userAgent, ipAddress } = req.body;
    if (!phoneNumber || !code)
      return reply.code(400).send({ error: 'missing_fields' });

    // Find the most recent pending OTP for this phone
    const otp = await app.prisma.oTP.findFirst({
      where:   { phoneNumber, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) return reply.code(404).send({ error: 'otp_not_found' });
    if (otp.expiresAt < new Date()) {
      await app.prisma.oTP.update({ where: { id: otp.id }, data: { status: 'EXPIRED' } });
      return reply.code(401).send({ error: 'otp_expired' });
    }
    if (otp.attempts >= 5) {
      return reply.code(429).send({ error: 'max_attempts_exceeded' });
    }

    // Increment attempts regardless
    await app.prisma.oTP.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });

    // Verify hash
    const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
    if (submittedHash !== otp.codeHash) {
      await app.audit.write({
        entityType:   'USER',
        entityId:     phoneNumber,
        action:       'LOGIN_FAILED',
        category:     'AUTH',
        performedBy:  'system',
        ipAddress,
        metadata:     { reason: 'invalid_otp', attemptsLeft: 5 - (otp.attempts + 1) },
        severity:     'WARNING',
        isRegulatory: true,
      });
      return reply.code(401).send({ error: 'invalid_otp', attemptsLeft: 5 - (otp.attempts + 1) });
    }

    // Mark OTP used
    await app.prisma.oTP.update({ where: { id: otp.id }, data: { status: 'USED' } });

    // Upsert user — creates at L0 on first login
    const user = await app.prisma.user.upsert({
      where:  { phoneNumber },
      create: { phoneNumber },
      update: { lastIp: ipAddress },
      include: { trustProfile: true, devices: true },
    });

    // Register or update device
    let device = await app.prisma.device.findUnique({ where: { deviceId: deviceFingerprint } });
    if (device && (device as any).isLocked) {
      return reply.code(403).send({ error: 'device_locked', message: 'This device has been locked. Contact support or unlock it from another device.' });
    }
    const isNewDevice = !device;
    if (!device) {
      device = await app.prisma.device.create({
        data: { userId: user.id, deviceId: deviceFingerprint, userAgent, ipAddress },
      });
    } else {
      await app.prisma.device.update({
        where: { id: device.id },
        data:  { lastUsedAt: new Date(), ipAddress },
      });
    }

    // Risk assessment
    const risk = await app.riskEngine.assess({
      userId:               user.id,
      deviceFingerprint,
      isNewDevice,
      trustScore:           user.trustProfile?.currentScore ?? 300,
      recentFailedAttempts: user.failedAttempts,
      ipAddress,
      lastKnownIp:          user.lastIp,
    });

    // Log auth event for Trust Engine signal ingestion
    await app.prisma.authEvent.create({
      data: {
        userId:    user.id,
        deviceId:  device.id,
        location:  ipAddress,
        success:   true,
        riskLevel: risk.decision,
      },
    });

    // Audit: login success — regulatory chain entry
    await app.audit.write({
      entityType:   'USER',
      entityId:     user.id,
      action:       risk.decision === 'allow' ? 'LOGIN_SUCCESS' : 'STEP_UP_TRIGGERED',
      category:     'AUTH',
      performedBy:  user.id,
      ipAddress,
      userAgent,
      metadata:     { deviceId: device.id, isNewDevice, decision: risk.decision, factors: risk.factors },
      severity:     risk.decision === 'block' ? 'CRITICAL' : 'INFO',
      isRegulatory: true,
    });

    // Workforce SCIM JOINER dynamic trigger
    if (user.email && user.verificationLevel === 'L2_GOV_VERIFIED' && risk.decision === 'allow') {
      try {
        await app.authentik.provisionUser({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
        });
      } catch (err) {
        app.log.error(err, 'Failed to provision workforce user in authentik during login');
      }
    }

    return reply.send({
      userId:     user.id,
      ondi:      user.ondi,
      decision:   risk.decision,   // allow | otp | biometric | block
      factors:    risk.factors,
      isNewDevice,
      deviceId:   device.id,
    });
  });


  /**
   * GET /auth/me
   * Returns current user profile from Bearer token.
   */
  app.get('/me', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });

    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );

      const user = await app.prisma.user.findUnique({
        where:   { id: payload.sub },
        include: {
          trustProfile: true,
          kycRecords:   { orderBy: { createdAt: 'desc' } },
          credentials:  true,
          roles:        { include: { organization: true, role: true } },
        },
      });
      if (!user) return reply.code(404).send({ error: 'user_not_found' });

      // Dedupe roles by organization (a user can hold >1 role per org)
      const orgsById = new Map<string, { id: string; name: string; role: string }>();
      for (const r of user.roles) {
        if (!r.organization) continue;
        if (!orgsById.has(r.organization.id)) {
          orgsById.set(r.organization.id, {
            id:   r.organization.id,
            name: r.organization.businessName,
            role: r.role.name,
          });
        }
      }

      return reply.send({
        id:                user.id,
        ondi:             user.ondi,
        firstName:         user.firstName,
        lastName:          user.lastName,
        phoneNumber:       user.phoneNumber,
        email:             user.email,
        profileImage:      user.avatarUrl,
        dateOfBirth:       user.dateOfBirth,
        gender:            user.gender,
        nationality:       user.nationality,
        occupation:        user.occupation,
        employer:          user.employer,
        streetAddress:     user.streetAddress,
        city:              user.city,
        region:            user.region,
        postalCode:        user.postalCode,
        verificationLevel: user.verificationLevel,
        kycStatus:         user.kycStatus,
        trustScore:        user.trustProfile?.currentScore ?? 300,
        trustTier:         user.trustProfile?.trustTier    ?? 'LOW',
        kycRecords: user.kycRecords.map(k => ({
          documentType:       k.documentType,
          documentNumber:     k.documentNumber,
          status:             k.status,
          verificationSource: k.verificationSource,
          createdAt:          k.createdAt,
        })),
        credentials: user.credentials.map(c => ({
          type:       c.type,
          verified:   c.verified,
          lastUsedAt: c.lastUsedAt,
        })),
        organizations: Array.from(orgsById.values()),
      });
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });


  /**
   * POST /auth/logout
   * Revokes all sessions for a device.
   */
  app.post('/logout', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { deviceId } = req.body;
    await app.prisma.authSession.deleteMany({ where: { userId, deviceId } });
    return reply.send({ loggedOut: true });
  });

  /**
   * POST /auth/onboard
   * Dynamic JOINER trigger: Provisions/onboards a workforce user into authentik SCIM.
   */
  app.post('/onboard', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { userId, department, orgId } = req.body;
    if (!userId) return reply.code(400).send({ error: 'user_id_required' });

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    try {
      const res = await app.authentik.provisionUser({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
      }, orgId, department);

      await app.audit.write({
        entityType: 'USER',
        entityId: user.id,
        action: 'ACCESS_GRANTED',
        category: 'ACCESS',
        performedBy: 'admin',
        metadata: {
          provisionedUserId: user.id,
          authentikResult: res,
          department,
          orgId
        },
        severity: 'INFO',
        isRegulatory: true,
      });

      return reply.send({ onboarded: true, result: res });
    } catch (err: any) {
      app.log.error(err, 'SCIM onboarding error');
      return reply.code(500).send({ error: 'onboarding_failed', details: err.message });
    }
  });

  /**
   * POST /auth/offboard
   * Dynamic LEAVER trigger: deprovisions user via SCIM, revokes all sessions, deactivates core user.
   */
  app.post('/offboard', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { userId } = req.body;
    if (!userId) return reply.code(400).send({ error: 'user_id_required' });

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    try {
      const userPk = await app.authentik.getUserPkByEmailOrEmployeeId(user.email || undefined, user.id);
      
      let deprovisioned = false;
      let sessionsRevoked = false;

      if (userPk) {
        deprovisioned = await app.authentik.deprovisionUser(userPk);
        sessionsRevoked = await app.authentik.revokeSessions(user.email || `${user.phoneNumber}@ondi.internal`, userPk);
      }

      // Revoke local DB sessions
      await app.prisma.authSession.deleteMany({
        where: { userId: user.id },
      });

      // Write regulatory audit trail
      await app.audit.write({
        entityType: 'USER',
        entityId: user.id,
        action: 'SESSION_REVOKED',
        category: 'AUTH',
        performedBy: 'admin',
        metadata: {
          offboardedUserId: user.id,
          authentikUserPk: userPk,
          deprovisioned,
          sessionsRevoked
        },
        severity: 'CRITICAL',
        isRegulatory: true
      });

      return reply.send({
        offboarded: true,
        authentikUserPk: userPk || null,
        deprovisioned,
        sessionsRevoked,
        timestamp: Date.now()
      });
    } catch (err: any) {
      app.log.error(err, 'SCIM offboarding error');
      return reply.code(500).send({ error: 'offboarding_failed', details: err.message });
    }
  });

  // ─── ONDI AUTHENTICATOR (TOTP & PUSH) ───────────────────────────────────────────

  /**
   * GET /auth/mfa-status
   * Checks if user has verified TOTP MFA setup
   */
  app.get('/mfa-status', async (req: any, reply) => {
    const { phoneNumber, deviceFingerprint } = req.query;
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const user = await app.prisma.user.findUnique({
      where: { phoneNumber },
      include: { credentials: true }
    });

    if (!user) {
      return reply.send({ enabled: false, setupRequired: true });
    }

    const mfaCred = user.credentials.find(c => c.type === 'OTP' && c.verified);
    const setupRequired = !mfaCred;

    // Additive step-up only — never a way to skip the MFA below, only a way
    // to add one extra SMS confirmation ahead of it for a browser we've never
    // seen for this account.
    let requireDeviceStepUp = false;
    if (!setupRequired && deviceFingerprint && user.requireStepUpNewDevice) {
      const device = await app.prisma.device.findUnique({ where: { deviceId: deviceFingerprint } });
      requireDeviceStepUp = !device || device.userId !== user.id;
    }

    return reply.send({
      enabled: !!mfaCred,
      setupRequired,
      requireDeviceStepUp,
    });
  });

  /**
   * POST /auth/otp/verify-device
   * Verifies an SMS OTP as a new-device step-up check only — does NOT issue
   * tokens (the usual TOTP/Push MFA still has to complete afterward). Used
   * by the login page when GET /auth/mfa-status flags requireDeviceStepUp.
   */
  app.post('/otp/verify-device', async (req: any, reply) => {
    const { phone, otp: code } = req.body;
    if (!phone || !code) return reply.code(400).send({ error: 'missing_fields' });

    const otpRecord = await app.prisma.oTP.findFirst({
      where: { phoneNumber: phone, status: 'PENDING' }, orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) return reply.code(404).send({ error: 'otp_not_found' });
    if (otpRecord.expiresAt < new Date()) {
      await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'EXPIRED' } });
      return reply.code(401).send({ error: 'otp_expired' });
    }
    if (otpRecord.attempts >= 5) return reply.code(429).send({ error: 'max_attempts_exceeded' });
    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { attempts: { increment: 1 } } });

    const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
    if (submittedHash !== otpRecord.codeHash) {
      return reply.code(401).send({ error: 'invalid_otp', attemptsLeft: 5 - (otpRecord.attempts + 1) });
    }
    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'USED' } });

    return reply.send({ verified: true });
  });

  /**
   * POST /auth/totp/setup
   * Generates new TOTP secret (in base32) and registers unverified credential.
   */
  app.post('/totp/setup', async (req: any, reply) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    // Ensure user exists
    const user = await app.prisma.user.upsert({
      where: { phoneNumber },
      create: { phoneNumber },
      update: {}
    });

    // Generate random base32 secret
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }

    // Delete any unverified TOTP setup for the user
    await app.prisma.credential.deleteMany({
      where: { userId: user.id, type: 'OTP', verified: false }
    });

    // Save as unverified credential
    await app.prisma.credential.create({
      data: {
        userId: user.id,
        type: 'OTP',
        identifier: secret,
        verified: false
      }
    });

    const otpAuthUri = `otpauth://totp/Ondi:${phoneNumber}?secret=${secret}&issuer=Ondi`;
    return reply.send({ secret, otpAuthUri });
  });

  /**
   * POST /auth/totp/verify
   * Verifies the TOTP code. If not verified yet, completes setup.
   * If already setup, verifies and returns signed session token.
   */
  app.post('/totp/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { phoneNumber, code, deviceFingerprint, deviceName } = req.body;
    const userAgent = req.headers['user-agent'] as string | undefined;
    if (!phoneNumber || !code) return reply.code(400).send({ error: 'missing_fields' });

    const user = await app.prisma.user.findUnique({
      where: { phoneNumber },
      include: { credentials: true, trustProfile: true }
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    // Look for verified or unverified OTP credential
    const otpCred = user.credentials.find(c => c.type === 'OTP');
    if (!otpCred) return reply.code(400).send({ error: 'totp_not_configured' });

    const isValid = verifyTOTP(otpCred.identifier, code);
    if (!isValid) {
      return reply.code(401).send({ error: 'invalid_totp_code' });
    }

    // If it was setup (unverified), mark verified
    if (!otpCred.verified) {
      await app.prisma.credential.update({
        where: { id: otpCred.id },
        data: { verified: true, lastUsedAt: new Date() }
      });
    } else {
      await app.prisma.credential.update({
        where: { id: otpCred.id },
        data: { lastUsedAt: new Date() }
      });
    }

    // Recognize this device for future logins now that MFA fully succeeded.
    // deviceName/userAgent are captured here (not just deviceId) so Active
    // Sessions / device-management screens can show a real device instead
    // of falling back to "Unknown device" for every session.
    let device: { id: string } | null = null;
    if (deviceFingerprint) {
      device = await app.prisma.device.upsert({
        where:  { deviceId: deviceFingerprint },
        create: { userId: user.id, deviceId: deviceFingerprint, deviceName, userAgent },
        update: { lastUsedAt: new Date(), deviceName: deviceName ?? undefined, userAgent: userAgent ?? undefined },
        select: { id: true },
      });
    }
    await cancelOpenRecoveryRequests(app, user.id);

    const { accessToken, refreshToken } = await signTokens(user.id, app, device?.id);

    return reply.send({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        ondi: user.ondi,
        phone: user.phoneNumber,
        verificationLevel: user.verificationLevel,
      },
    });
  });

  /**
   * POST /auth/push/request
   * Initiates a push approval session from the web login client.
   */
  app.post('/push/request', async (req: any, reply) => {
    const { phoneNumber, location, device, deviceFingerprint } = req.body;
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const user = await app.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const sessionId = crypto.randomUUID();
    const session: PushSession = {
      id: sessionId,
      phoneNumber,
      status: 'pending',
      location: location || 'Dar es Salaam, Tanzania',
      device: device || 'Chrome on macOS',
      deviceFingerprint,
    };
    await pushSessions.set(sessionId, session, PUSH_SESSION_TTL_SECONDS);
    await pushSessions.index.add(phoneNumber, sessionId, PUSH_SESSION_TTL_SECONDS);

    return reply.send({ sessionId });
  });

  /**
   * GET /auth/push/pending/:phoneNumber
   * Lists any active pending push sessions for the mobile client.
   */
  app.get('/push/pending/:phoneNumber', async (req: any, reply) => {
    const { phoneNumber } = req.params;
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const sessionIds = await pushSessions.index.members(phoneNumber);
    const candidates = await Promise.all(sessionIds.map(id => pushSessions.get(id)));
    const sessions = candidates.filter((s): s is PushSession => !!s && s.status === 'pending');

    return reply.send({ sessions });
  });

  /**
   * POST /auth/push/approve
   * Approved or Denied action from the mobile client.
   */
  app.post('/push/approve', async (req: any, reply) => {
    const { sessionId, approved } = req.body;
    if (!sessionId) return reply.code(400).send({ error: 'session_id_required' });

    const session = await pushSessions.get(sessionId);
    if (!session) return reply.code(404).send({ error: 'session_not_found' });

    session.status = approved ? 'approved' : 'denied';
    const remainingTtl = await pushSessions.ttl(sessionId);
    await pushSessions.set(sessionId, session, remainingTtl > 0 ? remainingTtl : PUSH_SESSION_TTL_SECONDS);

    return reply.send({ success: true, status: session.status });
  });

  // ─── Mobile app compatibility aliases ─────────────────────────────────────

  app.post('/initiate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { phone, deviceFingerprint, channel = 'sms', firstName, lastName, email } = req.body;
    if (!phone) return reply.code(400).send({ error: 'phone_required' });
    if (!(await enforceOtpBudget(app, reply, phone, req.ip))) return;

    const existingUser = await app.prisma.user.findUnique({ where: { phoneNumber: phone } });
    const cleanEmail = typeof email === 'string' && email.trim() ? email.trim() : undefined;
    // Capture the registration form's profile fields on the user record now — otherwise
    // they're never persisted anywhere (OTP verify only ever upserts by phoneNumber).
    const user = existingUser
      ? await app.prisma.user.update({
          where: { phoneNumber: phone },
          data: {
            firstName: existingUser.firstName ?? firstName ?? undefined,
            lastName:  existingUser.lastName  ?? lastName  ?? undefined,
            email:     existingUser.email     ?? cleanEmail,
          },
        })
      : await app.prisma.user.create({
          data: { phoneNumber: phone, firstName, lastName, email: cleanEmail },
        });
    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');
    await app.prisma.oTP.create({ data: { phoneNumber: phone, codeHash, purpose: 'LOGIN', expiresAt: new Date(Date.now() + 5 * 60_000) } });

    app.log.info(`OTP for ${phone}: ${plainCode}`);
    await sendSMS(phone, `HUDUMIKA Verification Code: ${plainCode}. Valid for 5 minutes.`, app.log);
    await app.audit.write({
      entityType:   'USER',
      entityId:     phone,
      action:       'OTP_ISSUED',
      category:     'AUTH',
      performedBy:  'system',
      metadata:     { purpose: 'LOGIN', channel },
      severity:     'INFO',
      isRegulatory: true,
    });
    return reply.send({ sent: true, registered: !!existingUser, exists: !!existingUser, expiresIn: 300 });
  });

  app.post('/otp/resend', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { phone, channel = 'sms' } = req.body;
    if (!phone) return reply.code(400).send({ error: 'phone_required' });
    if (!(await enforceOtpBudget(app, reply, phone, req.ip))) return;

    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');
    await app.prisma.oTP.updateMany({ where: { phoneNumber: phone, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    await app.prisma.oTP.create({ data: { phoneNumber: phone, codeHash, purpose: 'LOGIN', expiresAt: new Date(Date.now() + 5 * 60_000) } });

    app.log.info(`Resent OTP for ${phone}: ${plainCode}`);
    await sendSMS(phone, `HUDUMIKA Verification Code: ${plainCode}. Valid for 5 minutes.`, app.log);
    await app.audit.write({
      entityType:   'USER',
      entityId:     phone,
      action:       'OTP_ISSUED',
      category:     'AUTH',
      performedBy:  'system',
      metadata:     { purpose: 'LOGIN', channel, isResend: true },
      severity:     'INFO',
      isRegulatory: true,
    });
    return reply.send({ sent: true, expiresIn: 300 });
  });

  app.post('/otp/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { phone, otp: code, deviceFingerprint = 'mobile', deviceName } = req.body;
    if (!phone || !code) return reply.code(400).send({ error: 'missing_fields' });
    // The client-supplied ipAddress this used to trust was never actually
    // sent by any real caller (trivially spoofable anyway) — now that
    // trustProxy is on, req.ip is the real client IP forwarded by nginx.
    const ipAddress = req.ip as string;
    const userAgent = (req.body.userAgent as string | undefined) ?? (req.headers['user-agent'] as string | undefined);

    const otpRecord = await app.prisma.oTP.findFirst({
      where: { phoneNumber: phone, status: 'PENDING' }, orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) return reply.code(404).send({ error: 'otp_not_found' });
    if (otpRecord.expiresAt < new Date()) {
      await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'EXPIRED' } });
      return reply.code(401).send({ error: 'otp_expired' });
    }
    if (otpRecord.attempts >= 5) return reply.code(429).send({ error: 'max_attempts_exceeded' });
    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { attempts: { increment: 1 } } });

    const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
    if (submittedHash !== otpRecord.codeHash) {
      return reply.code(401).send({ error: 'invalid_otp', attemptsLeft: 5 - (otpRecord.attempts + 1) });
    }
    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'USED' } });

    const user = await app.prisma.user.upsert({
      where:  { phoneNumber: phone },
      create: { phoneNumber: phone },
      update: { lastIp: ipAddress },
      include: { trustProfile: true },
    });

    // Upsert device
    let device = await app.prisma.device.findUnique({ where: { deviceId: deviceFingerprint } });
    if (device && (device as any).isLocked) {
      return reply.code(403).send({ error: 'device_locked' });
    }
    const isNewDevice = !device;
    if (!device) {
      device = await app.prisma.device.create({
        data: { userId: user.id, deviceId: deviceFingerprint, deviceName, userAgent, ipAddress },
      });
    } else {
      await app.prisma.device.update({
        where: { id: device.id },
        // deviceName/userAgent refresh on every login too — a browser
        // update or the client computing a better name shouldn't require
        // deleting and re-pairing the device to pick it up.
        data: { lastUsedAt: new Date(), ipAddress, deviceName: deviceName ?? undefined, userAgent: userAgent ?? undefined },
      });
    }

    // Real-time risk assessment + this user's orgs' conditional-access
    // policies (lib org-auth memberships) — this is the actual token-issuing
    // login path every real client calls (unlike the dead /verify-otp route
    // above, which computes the same risk signal but never mints a session).
    const risk = await app.riskEngine.assess({
      userId: user.id, deviceFingerprint, isNewDevice,
      trustScore: user.trustProfile?.currentScore ?? 300,
      recentFailedAttempts: user.failedAttempts,
      ipAddress, lastKnownIp: user.lastIp,
    });

    const memberships = await app.prisma.userRole.findMany({
      where: { userId: user.id, organizationId: { not: null } },
      select: { organizationId: true },
    });
    const policyResult = await app.accessPolicy.evaluate(
      memberships.map(m => m.organizationId!),
      user.id,
      {
        trustTier: user.trustProfile?.trustTier ?? 'LOW',
        isNewDevice,
        deviceTrusted: device.isTrusted,
        riskFactors: risk.factors,
      },
    );

    // Only BLOCK is hard-enforced here — STEP_UP/FLAG are recorded (audit +
    // FraudAlert, see plugins/access-policy.ts) but don't interrupt this
    // already-OTP-verified login, since forcing a second step-up gate here
    // would change this endpoint's response contract for every existing
    // client. Documented follow-up, not silently dropped.
    if (risk.decision === 'block' || policyResult.action === 'BLOCK') {
      await app.audit.write({
        entityType:   'USER',
        entityId:     user.id,
        action:       'LOGIN_FAILED',
        category:     'AUTH',
        performedBy:  user.id,
        ipAddress,
        metadata:     { reason: 'risk_or_policy_block', deviceFingerprint, riskFactors: risk.factors, matchedPolicyId: policyResult.matchedPolicyId },
        severity:     'CRITICAL',
        isRegulatory: true,
      });
      return reply.code(403).send({ error: 'access_blocked', factors: risk.factors });
    }

    const stepUpRecommended = risk.decision !== 'allow' || policyResult.action === 'STEP_UP';

    // device.id (not deviceFingerprint) is what AuthSession.deviceId and
    // AuthEvent.deviceId actually reference — this used to be omitted here,
    // so every phone-OTP login's session/event rows had a null device link
    // and GET /sessions + GET /devices/activity could never show anything
    // beyond "Unknown device".
    const { accessToken, refreshToken } = await signTokens(user.id, app, device.id);

    await app.prisma.authEvent.create({
      data: {
        userId:    user.id,
        deviceId:  device.id,
        location:  ipAddress,
        success:   true,
        riskLevel: risk.decision,
      },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     user.id,
      action:       stepUpRecommended ? 'STEP_UP_TRIGGERED' : 'LOGIN_SUCCESS',
      category:     'AUTH',
      performedBy:  user.id,
      ipAddress,
      metadata:     { deviceFingerprint, channel: 'otp', riskDecision: risk.decision, factors: risk.factors, policyAction: policyResult.action },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({
      success:       true,
      access_token:  accessToken,
      refresh_token: refreshToken,
      stepUpRecommended,
      user: { id: user.id, ondi: user.ondi, phoneNumber: user.phoneNumber, verificationLevel: user.verificationLevel },
    });
  });

  /**
   * GET /auth/push/poll/:sessionId
   * Polled by web login client to wait for approval and fetch access token.
   */
  app.get('/push/poll/:sessionId', async (req: any, reply) => {
    const { sessionId } = req.params;
    const session = await pushSessions.get(sessionId);

    if (!session) return reply.send({ status: 'expired' });

    if (session.status === 'pending') {
      return reply.send({ status: 'pending' });
    }

    if (session.status === 'denied') {
      await pushSessions.delete(sessionId);
      return reply.send({ status: 'denied' });
    }

    // Approved: fetch user and sign JWT
    const user = await app.prisma.user.findUnique({
      where: { phoneNumber: session.phoneNumber },
      include: { trustProfile: true }
    });

    if (!user) {
      await pushSessions.delete(sessionId);
      return reply.code(404).send({ error: 'user_not_found' });
    }

    // Recognize this device for future logins now that push approval succeeded.
    let approvedDevice = null;
    if (session.deviceFingerprint) {
      approvedDevice = await app.prisma.device.upsert({
        where:  { deviceId: session.deviceFingerprint },
        create: { userId: user.id, deviceId: session.deviceFingerprint },
        update: { lastUsedAt: new Date() },
      });
    }
    await cancelOpenRecoveryRequests(app, user.id);

    // Same shared session issuance every other login path uses (OTP/TOTP) —
    // this route used to sign its own one-off 7-day JWT with no refresh
    // token and no AuthSession row, so a push-approved sign-in could never
    // silently renew and always hard-logged-out once that JWT expired.
    const { accessToken, refreshToken } = await signTokens(user.id, app, approvedDevice?.id);

    // Clean up session
    await pushSessions.delete(sessionId);

    return reply.send({
      status: 'approved',
      token: accessToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        ondi: user.ondi,
        phoneNumber: user.phoneNumber,
        verificationLevel: user.verificationLevel
      }
    });
  });

  // ─── TOKEN MANAGEMENT ───────────────────────────────────────────────────────

  /**
   * POST /auth/token/refresh
   * Exchange a valid refresh token for a new access token + rotated refresh token.
   * Body: { refreshToken }
   */
  app.post('/token/refresh', async (req: any, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) return reply.code(400).send({ error: 'refresh_token_required' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await app.prisma.authSession.findFirst({
      where: { refreshTokenHash: tokenHash },
    });

    if (!session) return reply.code(401).send({ error: 'invalid_refresh_token' });
    if (session.expiresAt < new Date()) {
      await app.prisma.authSession.delete({ where: { id: session.id } });
      return reply.code(401).send({ error: 'refresh_token_expired' });
    }

    // Org session-timeout policy: if this user belongs to any org with a
    // shorter sessionTimeoutMins than this session's idle time, force re-login
    // instead of silently rotating past the org's configured limit.
    const orgIds = (await app.prisma.userRole.findMany({
      where: { userId: session.userId },
      select: { organizationId: true },
    })).map(r => r.organizationId).filter((id): id is string => id !== null);

    if (orgIds.length > 0) {
      const policies = await app.prisma.orgSecuritySettings.findMany({
        where: { organizationId: { in: orgIds } },
        select: { sessionTimeoutMins: true },
      });
      if (policies.length > 0) {
        const strictestMins = Math.min(...policies.map(p => p.sessionTimeoutMins));
        const idleMins = (Date.now() - session.lastActivityAt.getTime()) / 60_000;
        if (idleMins > strictestMins) {
          await app.prisma.authSession.delete({ where: { id: session.id } });
          return reply.code(401).send({ error: 'session_expired_by_org_policy' });
        }
      }
    }

    // Rotate: delete old session, issue new tokens. Carries the old
    // session's deviceId forward — access tokens are short-lived (15 min),
    // so every session goes through this refresh path within minutes of
    // login; without this, the device link set at sign-in (Devices/Sessions
    // "which device") got silently dropped on the very first rotation and
    // every session looked device-less almost immediately.
    await app.prisma.authSession.delete({ where: { id: session.id } });
    const { accessToken, refreshToken: newRefresh } = await signTokens(session.userId, app, session.deviceId ?? undefined);

    await app.audit.write({
      entityType:   'USER',
      entityId:     session.userId,
      action:       'TOKEN_REFRESHED',
      category:     'AUTH',
      performedBy:  session.userId,
      metadata:     { sessionId: session.id },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ access_token: accessToken, refresh_token: newRefresh });
  });

  // ─── STEP-UP AUTHENTICATION ──────────────────────────────────────────────────

  /**
   * POST /auth/step-up/challenge
   * Initiate a step-up challenge after risk engine returns decision != 'allow'.
   * Body: { userId, type: 'totp' | 'otp' }
   * For 'otp': sends SMS. For 'totp': confirms user has TOTP registered.
   */
  app.post('/step-up/challenge', async (req: any, reply) => {
    const { userId, type = 'totp' } = req.body as { userId?: string; type?: 'totp' | 'otp' };
    if (!userId) return reply.code(400).send({ error: 'user_id_required' });
    if (type !== 'totp' && type !== 'otp') return reply.code(400).send({ error: 'invalid_type' });

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: { credentials: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const challengeId = crypto.randomUUID();

    const hasTOTP = user.credentials.some(c => c.type === 'OTP' && c.verified);

    if (type === 'totp') {
      if (!hasTOTP) return reply.code(400).send({ error: 'totp_not_configured', hint: 'Use type: otp instead' });
      await stepUpChallenges.set(challengeId, { userId, type: 'totp' }, STEP_UP_TOTP_TTL_SECONDS);
      return reply.send({ challengeId, type: 'totp', expiresIn: STEP_UP_TOTP_TTL_SECONDS });
    }

    // type === 'otp': reject in favor of the Authenticator when the user's
    // policy requires it and they actually have one enrolled — never blocks
    // a user who hasn't set up TOTP at all.
    if (user.requireAuthenticatorHighRisk && hasTOTP) {
      return reply.code(403).send({ error: 'authenticator_required', hint: 'Use type: totp instead' });
    }

    // type === 'otp': send SMS OTP with purpose VERIFY
    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash  = crypto.createHash('sha256').update(plainCode).digest('hex');
    const otpRecord = await app.prisma.oTP.create({
      data: { phoneNumber: user.phoneNumber, codeHash, purpose: 'VERIFY', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    app.log.info(`Step-up OTP for ${user.phoneNumber}: ${plainCode}`);
    await sendSMS(user.phoneNumber, `HUDUMIKA Step-Up Code: ${plainCode}. Valid for 5 minutes.`, app.log);

    await stepUpChallenges.set(challengeId, { userId, type: 'otp', otpId: otpRecord.id }, STEP_UP_OTP_TTL_SECONDS);

    return reply.send({ challengeId, type: 'otp', expiresIn: STEP_UP_OTP_TTL_SECONDS });
  });

  /**
   * POST /auth/step-up/verify
   * Complete a step-up challenge. On success, issues access + refresh tokens.
   * Body: { challengeId, code }
   */
  app.post('/step-up/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { challengeId, code } = req.body as { challengeId?: string; code?: string };
    if (!challengeId || !code) return reply.code(400).send({ error: 'missing_fields' });

    const challenge = await stepUpChallenges.get(challengeId);
    if (!challenge) return reply.code(404).send({ error: 'challenge_not_found_or_expired' });

    const { userId, type } = challenge;

    if (type === 'totp') {
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        include: { credentials: { where: { type: 'OTP', verified: true } } },
      });
      if (!user) return reply.code(404).send({ error: 'user_not_found' });
      const totpCred = user.credentials[0];
      if (!totpCred) return reply.code(400).send({ error: 'totp_not_configured' });

      if (!verifyTOTP(totpCred.identifier, code)) {
        return reply.code(401).send({ error: 'invalid_totp_code' });
      }
      await app.prisma.credential.update({ where: { id: totpCred.id }, data: { lastUsedAt: new Date() } });
    } else {
      // OTP step-up
      const otpId = challenge.otpId;
      if (!otpId) return reply.code(404).send({ error: 'challenge_not_found' });

      const otpRecord = await app.prisma.oTP.findUnique({ where: { id: otpId } });
      if (!otpRecord || otpRecord.status !== 'PENDING')
        return reply.code(401).send({ error: 'otp_invalid_or_used' });
      if (otpRecord.expiresAt < new Date())
        return reply.code(401).send({ error: 'otp_expired' });

      const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
      if (submittedHash !== otpRecord.codeHash)
        return reply.code(401).send({ error: 'invalid_otp_code' });

      await app.prisma.oTP.update({ where: { id: otpId }, data: { status: 'USED' } });
    }

    await stepUpChallenges.delete(challengeId);

    const { accessToken, refreshToken } = await signTokens(userId, app);

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'STEP_UP_COMPLETED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { type, challengeId },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({ success: true, access_token: accessToken, refresh_token: refreshToken });
  });

  // ─── PROFILE MANAGEMENT ──────────────────────────────────────────────────────

  /**
   * PATCH /auth/me
   * Update the authenticated user's profile.
   * Body: { firstName?, lastName?, email?, dateOfBirth?, gender?, nationality?,
   *         occupation?, employer?, streetAddress?, city?, region?, postalCode? }
   */
  app.patch('/me', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const {
      firstName, lastName, email, dateOfBirth, gender, nationality,
      occupation, employer, streetAddress, city, region, postalCode,
    } = req.body as {
      firstName?: string; lastName?: string; email?: string; dateOfBirth?: string;
      gender?: string; nationality?: string; occupation?: string; employer?: string;
      streetAddress?: string; city?: string; region?: string; postalCode?: string;
    };
    const updates: any = {};
    if (firstName     !== undefined) updates.firstName     = firstName;
    if (lastName       !== undefined) updates.lastName       = lastName;
    if (email          !== undefined) updates.email          = email;
    if (gender         !== undefined) updates.gender         = gender;
    if (nationality    !== undefined) updates.nationality    = nationality;
    if (occupation     !== undefined) updates.occupation     = occupation;
    if (employer       !== undefined) updates.employer       = employer;
    if (streetAddress  !== undefined) updates.streetAddress  = streetAddress;
    if (city           !== undefined) updates.city           = city;
    if (region         !== undefined) updates.region         = region;
    if (postalCode     !== undefined) updates.postalCode     = postalCode;
    if (dateOfBirth !== undefined) {
      const parsed = new Date(dateOfBirth);
      if (isNaN(parsed.getTime())) return reply.code(400).send({ error: 'invalid_date_of_birth' });
      updates.dateOfBirth = parsed;
    }

    if (Object.keys(updates).length === 0)
      return reply.code(400).send({ error: 'no_fields_to_update' });

    const user = await app.prisma.user.update({ where: { id: userId }, data: updates });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'PROFILE_UPDATED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { fields: Object.keys(updates) },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({
      id:            user.id,
      firstName:     user.firstName,
      lastName:      user.lastName,
      email:         user.email,
      dateOfBirth:   user.dateOfBirth,
      gender:        user.gender,
      nationality:   user.nationality,
      occupation:    user.occupation,
      employer:      user.employer,
      streetAddress: user.streetAddress,
      city:          user.city,
      region:        user.region,
      postalCode:    user.postalCode,
    });
  });

  // ─── ADAPTIVE-AUTH POLICY PREFERENCES ────────────────────────────────────────

  /**
   * GET /auth/policy/preferences
   * Returns the authenticated user's adaptive-auth security preferences.
   */
  app.get('/policy/preferences', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    return reply.send({
      requireStepUpNewDevice:      user.requireStepUpNewDevice,
      requireAuthenticatorHighRisk: user.requireAuthenticatorHighRisk,
      invisibleMode:               user.invisibleMode,
      trustScoreDisclosure:        user.trustScoreDisclosure,
      notifyIdentityRequests:      user.notifyIdentityRequests,
      notifySecurityLogins:        user.notifySecurityLogins,
      notifyComplianceReminders:   user.notifyComplianceReminders,
      notifyTrustScoreTips:        user.notifyTrustScoreTips,
    });
  });

  /**
   * PATCH /auth/policy/preferences
   * Updates the authenticated user's adaptive-auth, privacy, and
   * notification preferences.
   * Body: { requireStepUpNewDevice?, requireAuthenticatorHighRisk?, invisibleMode?, trustScoreDisclosure?,
   *         notifyIdentityRequests?, notifySecurityLogins?, notifyComplianceReminders?, notifyTrustScoreTips? }
   */
  app.patch('/policy/preferences', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const {
      requireStepUpNewDevice, requireAuthenticatorHighRisk, invisibleMode, trustScoreDisclosure,
      notifyIdentityRequests, notifySecurityLogins, notifyComplianceReminders, notifyTrustScoreTips,
    } = req.body as {
      requireStepUpNewDevice?: boolean;
      requireAuthenticatorHighRisk?: boolean;
      invisibleMode?: boolean;
      trustScoreDisclosure?: boolean;
      notifyIdentityRequests?: boolean;
      notifySecurityLogins?: boolean;
      notifyComplianceReminders?: boolean;
      notifyTrustScoreTips?: boolean;
    };

    const existing = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) return reply.code(404).send({ error: 'user_not_found' });

    const updates: any = {};
    if (requireStepUpNewDevice !== undefined) updates.requireStepUpNewDevice = requireStepUpNewDevice;
    if (requireAuthenticatorHighRisk !== undefined) updates.requireAuthenticatorHighRisk = requireAuthenticatorHighRisk;
    if (invisibleMode !== undefined) updates.invisibleMode = invisibleMode;
    if (trustScoreDisclosure !== undefined) updates.trustScoreDisclosure = trustScoreDisclosure;
    if (notifyIdentityRequests !== undefined) updates.notifyIdentityRequests = notifyIdentityRequests;
    if (notifySecurityLogins !== undefined) updates.notifySecurityLogins = notifySecurityLogins;
    if (notifyComplianceReminders !== undefined) updates.notifyComplianceReminders = notifyComplianceReminders;
    if (notifyTrustScoreTips !== undefined) updates.notifyTrustScoreTips = notifyTrustScoreTips;

    if (Object.keys(updates).length === 0)
      return reply.code(400).send({ error: 'no_fields_to_update' });

    const user = await app.prisma.user.update({ where: { id: userId }, data: updates });

    for (const field of Object.keys(updates)) {
      await app.audit.write({
        entityType:   'USER',
        entityId:     userId,
        action:       'PROFILE_UPDATED',
        category:     'IDENTITY',
        performedBy:  userId,
        metadata:     { field, from: (existing as any)[field], to: (user as any)[field] },
        severity:     'INFO',
        isRegulatory: false,
      });
    }

    return reply.send({
      requireStepUpNewDevice:      user.requireStepUpNewDevice,
      requireAuthenticatorHighRisk: user.requireAuthenticatorHighRisk,
      invisibleMode:               user.invisibleMode,
      trustScoreDisclosure:        user.trustScoreDisclosure,
      notifyIdentityRequests:      user.notifyIdentityRequests,
      notifySecurityLogins:        user.notifySecurityLogins,
      notifyComplianceReminders:   user.notifyComplianceReminders,
      notifyTrustScoreTips:        user.notifyTrustScoreTips,
    });
  });

  // ─── BREACH MONITORING ────────────────────────────────────────────────────────

  /**
   * GET /auth/breach-status
   * Returns the last stored breach-check result without triggering a new
   * external call — what the Security page loads passively on mount.
   */
  app.get('/breach-status', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    return reply.send({
      configured: !!process.env.HIBP_API_KEY,
      checkedAt:  user.breachCheckedAt,
      detected:   user.breachDetected,
      count:      user.breachCount,
    });
  });

  /**
   * POST /auth/breach-check
   * Triggers a real check of the user's linked emails against HaveIBeenPwned.
   * Deliberately never runs automatically at login — a third-party HTTP call
   * has no business sitting inside the login critical path. On-demand only.
   */
  app.post('/breach-check', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const apiKey = process.env.HIBP_API_KEY;
    if (!apiKey) {
      return reply.send({ configured: false });
    }

    const user = await app.prisma.user.findUnique({
      where:   { id: userId },
      include: { federatedIdentities: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const emails = new Set<string>();
    if (user.email) emails.add(user.email);
    for (const fi of user.federatedIdentities) {
      if (fi.email) emails.add(fi.email);
    }

    if (emails.size === 0) {
      const updated = await app.prisma.user.update({
        where: { id: userId },
        data:  { breachCheckedAt: new Date(), breachDetected: false, breachCount: 0 },
      });
      return reply.send({ configured: true, checkedAt: updated.breachCheckedAt, detected: false, count: 0 });
    }

    let totalBreaches = 0;
    try {
      for (const email of emails) {
        const res = await fetch(
          `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=true`,
          { headers: { 'hibp-api-key': apiKey, 'User-Agent': 'Ondi-IdP' } },
        );
        if (res.status === 404) continue; // no breaches on file for this email
        if (!res.ok) throw new Error(`HIBP responded ${res.status}`);
        const breaches = await res.json() as unknown[];
        totalBreaches += breaches.length;
      }
    } catch (err) {
      app.log.warn(err, 'breach check failed');
      return reply.code(502).send({ error: 'breach_check_failed' });
    }

    const detected = totalBreaches > 0;
    const updated = await app.prisma.user.update({
      where: { id: userId },
      data:  { breachCheckedAt: new Date(), breachDetected: detected, breachCount: totalBreaches },
    });

    return reply.send({ configured: true, checkedAt: updated.breachCheckedAt, detected, count: totalBreaches });
  });

  // ─── PHONE LINKING (for accounts created without a real phone, e.g. via Google) ──

  /**
   * POST /auth/phone/link/initiate
   * Sends a real SMS OTP to verify and attach a phone number to the authenticated account.
   * Body: { phoneNumber }
   */
  app.post('/phone/link/initiate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const owner = await app.prisma.user.findUnique({ where: { phoneNumber } });
    if (owner && owner.id !== userId)
      return reply.code(409).send({ error: 'phone_already_in_use' });

    if (!(await enforceOtpBudget(app, reply, phoneNumber, req.ip))) return;

    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash  = crypto.createHash('sha256').update(plainCode).digest('hex');
    await app.prisma.oTP.create({
      data: { phoneNumber, codeHash, purpose: 'VERIFY', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    app.log.info(`Phone-link OTP for ${phoneNumber}: ${plainCode}`);
    await sendSMS(phoneNumber, `HUDUMIKA Verification Code: ${plainCode}. Valid for 5 minutes.`, app.log);

    return reply.send({ sent: true, expiresIn: 300 });
  });

  /**
   * POST /auth/phone/link/verify
   * Confirms the SMS code and attaches the verified phone number to the authenticated account.
   * Body: { phoneNumber, code }
   */
  app.post('/phone/link/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const { phoneNumber, code } = req.body as { phoneNumber?: string; code?: string };
    if (!phoneNumber || !code) return reply.code(400).send({ error: 'missing_fields' });

    const otpRecord = await app.prisma.oTP.findFirst({
      where: { phoneNumber, purpose: 'VERIFY', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) return reply.code(404).send({ error: 'otp_not_found' });
    if (otpRecord.expiresAt < new Date()) {
      await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'EXPIRED' } });
      return reply.code(401).send({ error: 'otp_expired' });
    }
    if (otpRecord.attempts >= 5) return reply.code(429).send({ error: 'max_attempts_exceeded' });
    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { attempts: { increment: 1 } } });

    const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
    if (submittedHash !== otpRecord.codeHash)
      return reply.code(401).send({ error: 'invalid_otp', attemptsLeft: 5 - (otpRecord.attempts + 1) });

    const owner = await app.prisma.user.findUnique({ where: { phoneNumber } });
    if (owner && owner.id !== userId)
      return reply.code(409).send({ error: 'phone_already_in_use' });

    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'USED' } });
    const user = await app.prisma.user.update({ where: { id: userId }, data: { phoneNumber } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'PROFILE_UPDATED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { fields: ['phoneNumber'] },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({ success: true, phoneNumber: user.phoneNumber });
  });

  // ─── LOGIN HISTORY ────────────────────────────────────────────────────────────

  /**
   * GET /auth/logins
   * Fetch login history for the authenticated user.
   * Query: ?limit=20&offset=0
   */
  app.get('/logins', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });

    let userId: string;
    try {
      const jwt = await import('jsonwebtoken');
      const payload: any = jwt.default.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
      userId = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const limit    = Math.min(Number((req.query as any).limit  ?? 20), 100);
    const offset   = Number((req.query as any).offset ?? 0);
    const deviceId = (req.query as any).deviceId as string | undefined;

    // deviceId here is Device.id (the internal row id, as returned by
    // GET /devices), not the deviceFingerprint string.
    const where = deviceId ? { userId, deviceId } : { userId };

    const events = await app.prisma.authEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take:    limit,
      skip:    offset,
    });

    const total = await app.prisma.authEvent.count({ where });

    // AuthEvent.deviceId isn't a Prisma relation (plain string column), so
    // there's no `include` for it — look the names up in one extra query
    // instead of the client having to show a bare location string for what
    // the person actually reads as "which device did this."
    const deviceIds = [...new Set(events.map(e => e.deviceId).filter((id): id is string => !!id))];
    const devices = deviceIds.length
      ? await app.prisma.device.findMany({
          where: { id: { in: deviceIds } },
          select: { id: true, deviceName: true, userAgent: true },
        })
      : [];
    const deviceById = new Map(devices.map(d => [d.id, d]));

    return reply.send({
      total,
      limit,
      offset,
      events: events.map(e => ({
        id:         e.id,
        success:    e.success,
        riskLevel:  e.riskLevel,
        location:   e.location,
        deviceId:   e.deviceId,
        deviceName: e.deviceId ? deviceById.get(e.deviceId)?.deviceName ?? deviceById.get(e.deviceId)?.userAgent ?? null : null,
        timestamp:  e.timestamp,
      })),
    });
  });

  /**
   * GET /auth/security-events
   * Self-service "what happened to my security settings recently" feed —
   * the Security screen's own view, distinct from GET /logins (sign-ins).
   * Reuses the tamper-evident audit log rather than a parallel table, but
   * scoped to this user's own USER-entity rows and a small allowlist of
   * actions that are actually meaningful to see here (not every audit
   * action is security-relevant or safe to show verbatim to the subject).
   */
  const SECURITY_EVENT_ACTIONS: AuditAction[] = [
    'SECURITY_CODE_SET',
    'PASSKEY_ADDED',
    'PASSKEY_REMOVED',
    'DEVICE_TRUSTED',
    'DEVICE_REMOVED',
    'DEVICE_LOCKED',
    'DEVICE_UNLOCKED',
    'ACCOUNT_DELETION_REQUESTED',
  ];
  const SECURITY_EVENT_LABELS: Record<string, string> = {
    SECURITY_CODE_SET: 'Security PIN changed',
    PASSKEY_ADDED: 'Passkey added',
    PASSKEY_REMOVED: 'Passkey removed',
    DEVICE_TRUSTED: 'Device trusted',
    DEVICE_REMOVED: 'Device removed',
    DEVICE_LOCKED: 'Device locked',
    DEVICE_UNLOCKED: 'Device unlocked',
    ACCOUNT_DELETION_REQUESTED: 'Account deletion requested',
  };
  app.get('/security-events', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const limit = Math.min(Number((req.query as any).limit ?? 10), 50);
    const events = await app.prisma.auditLog.findMany({
      where: { entityType: 'USER', entityId: userId, action: { in: SECURITY_EVENT_ACTIONS } },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { id: true, action: true, timestamp: true },
    });

    return reply.send({
      events: events.map(e => ({ id: e.id, label: SECURITY_EVENT_LABELS[e.action] ?? e.action, timestamp: e.timestamp })),
    });
  });

  // ─── SECURITY CODE (APP-LOCK PIN) ────────────────────────────────────────────

  /**
   * POST /auth/security-code/set
   * Set or reset a 6-digit security PIN used for app-lock.
   * Body: { userId, code }
   */
  app.post('/security-code/set', async (req: any, reply) => {
    const { userId, code } = req.body as { userId?: string; code?: string };
    if (!userId || !code) return reply.code(400).send({ error: 'missing_fields' });
    if (!/^\d{6}$/.test(code)) return reply.code(400).send({ error: 'code_must_be_6_digits' });

    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash(code, 10);

    // Replace any existing security code credential
    await app.prisma.credential.deleteMany({ where: { userId, type: 'PASSWORD' } });
    await app.prisma.credential.create({
      data: { userId, type: 'PASSWORD', identifier: hash, verified: true },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'SECURITY_CODE_SET',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     {},
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ set: true });
  });

  /**
   * POST /auth/security-code/verify
   * Verify the app-lock security PIN.
   * Body: { userId, code }
   */
  app.post('/security-code/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { userId, code } = req.body as { userId?: string; code?: string };
    if (!userId || !code) return reply.code(400).send({ error: 'missing_fields' });

    const cred = await app.prisma.credential.findFirst({
      where: { userId, type: 'PASSWORD', verified: true },
    });
    if (!cred) return reply.code(404).send({ error: 'security_code_not_set' });

    const bcrypt = await import('bcryptjs');
    const valid  = await bcrypt.default.compare(code, cred.identifier);

    if (!valid) {
      await app.audit.write({
        entityType:   'USER',
        entityId:     userId,
        action:       'LOGIN_FAILED',
        category:     'AUTH',
        performedBy:  userId,
        metadata:     { reason: 'invalid_security_code' },
        severity:     'WARNING',
        isRegulatory: false,
      });
    }

    return reply.send({ valid });
  });

  // ─── ACCOUNT DELETION (self-service, soft delete) ────────────────────────────
  // Personal identifiers are wiped and all auth material revoked, but
  // KYCRecord/AuditLog/credit/trust history rows stay attached to the
  // User row (never hard-deleted) to satisfy KYC/AML record-retention duties.

  const ACCOUNT_DELETION_OTP_TTL_SECONDS = 5 * 60;
  const accountDeletionChallenges = createEphemeralStore<{ userId: string; otpId: string }>(app, 'account-deletion');

  /**
   * POST /auth/account/delete/request
   * Sends a fresh OTP as re-auth confirmation before an irreversible account
   * deletion — by SMS for a real phone, by email otherwise. Federated
   * (Google/Microsoft/Apple) signups without a linked phone have a
   * non-deliverable placeholder in User.phoneNumber (see hasDeliverablePhone
   * in lib/mailer.ts); sending SMS to that placeholder always silently
   * no-ops, which used to leave those accounts with no way to ever pass
   * this step and delete themselves.
   */
  app.post('/account/delete/request', { config: { rateLimit: { max: 3, timeWindow: '5 minutes' } } }, async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) return reply.code(404).send({ error: 'user_not_found' });

    const viaPhone = hasDeliverablePhone(user.phoneNumber);
    if (!viaPhone && !user.email) {
      return reply.code(422).send({ error: 'no_delivery_method' });
    }

    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash  = crypto.createHash('sha256').update(plainCode).digest('hex');
    const otpRecord = await app.prisma.oTP.create({
      data: { phoneNumber: user.phoneNumber, codeHash, purpose: 'VERIFY', expiresAt: new Date(Date.now() + ACCOUNT_DELETION_OTP_TTL_SECONDS * 1000) },
    });

    if (viaPhone) {
      app.log.info(`Account deletion OTP for ${user.phoneNumber}: ${plainCode}`);
      await sendSMS(user.phoneNumber, `HUDUMIKA: Your account deletion code is ${plainCode}. This will permanently close your account. Valid for 5 minutes.`, app.log);
    } else {
      app.log.info(`Account deletion OTP for ${user.email}: ${plainCode}`);
      await sendCodeEmail(
        user.email as string,
        plainCode,
        { subject: 'Your Ondi account deletion code', bodyText: 'Enter this code to confirm permanently closing your Ondi account.' },
        app.log,
      );
    }

    const challengeId = crypto.randomUUID();
    await accountDeletionChallenges.set(challengeId, { userId, otpId: otpRecord.id }, ACCOUNT_DELETION_OTP_TTL_SECONDS);

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'ACCOUNT_DELETION_REQUESTED', category: 'AUTH',
      performedBy: userId, metadata: { channel: viaPhone ? 'sms' : 'email' }, severity: 'WARNING', isRegulatory: true,
    });

    return reply.send({
      challengeId,
      expiresIn: ACCOUNT_DELETION_OTP_TTL_SECONDS,
      channel: viaPhone ? 'sms' : 'email',
      destination: viaPhone ? user.phoneNumber : user.email,
    });
  });

  /**
   * POST /auth/account/delete/confirm
   * Body: { challengeId, code }
   */
  app.post('/account/delete/confirm', { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { challengeId, code } = req.body as { challengeId?: string; code?: string };
    if (!challengeId || !code) return reply.code(400).send({ error: 'missing_fields' });

    const challenge = await accountDeletionChallenges.get(challengeId);
    if (!challenge || challenge.userId !== userId) return reply.code(404).send({ error: 'challenge_not_found_or_expired' });

    const otpRecord = await app.prisma.oTP.findUnique({ where: { id: challenge.otpId } });
    if (!otpRecord || otpRecord.status !== 'PENDING') return reply.code(401).send({ error: 'otp_invalid_or_used' });
    if (otpRecord.expiresAt < new Date()) return reply.code(401).send({ error: 'otp_expired' });

    const submittedHash = crypto.createHash('sha256').update(code).digest('hex');
    if (submittedHash !== otpRecord.codeHash) return reply.code(401).send({ error: 'invalid_otp_code' });

    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'USED' } });
    await accountDeletionChallenges.delete(challengeId);

    const tombstonePhone = `deleted_${userId}`;

    await app.prisma.$transaction([
      app.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: null, lastName: null, dateOfBirth: null, email: null,
          phoneNumber: tombstonePhone,
          vaultPublicKeyJwk: null,
          deletedAt: new Date(),
        },
      }),
      app.prisma.credential.deleteMany({ where: { userId } }),
      app.prisma.webAuthnCredential.deleteMany({ where: { userId } }),
      app.prisma.device.deleteMany({ where: { userId } }),
      app.prisma.authSession.deleteMany({ where: { userId } }),
      app.prisma.federatedIdentity.deleteMany({ where: { userId } }),
      app.prisma.recoveryContact.deleteMany({ where: { OR: [{ userId }, { contactUserId: userId }] } }),
      app.prisma.userRole.deleteMany({ where: { userId } }),
      app.prisma.vaultConfig.deleteMany({ where: { userId } }),
      app.prisma.vaultItem.deleteMany({ where: { userId } }), // cascades owned VaultShare rows
      app.prisma.vaultShare.updateMany({ where: { sharedWithId: userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      app.prisma.consent.deleteMany({ where: { userId } }),
    ]);

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'ACCOUNT_DELETED', category: 'AUTH',
      performedBy: userId, metadata: {}, severity: 'WARNING', isRegulatory: true,
    });

    return reply.send({ deleted: true });
  });
}
