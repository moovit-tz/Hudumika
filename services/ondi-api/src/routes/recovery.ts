import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { sendSMS, formatPhoneNumber } from './auth.js';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';

async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    );
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

const REQUEST_COOLDOWN_HOURS = 24;
const APPROVAL_COOLDOWN_HOURS = 36;

export async function recoveryRoutes(app: FastifyInstance) {

  // ─── DESIGNATING A RECOVERY CONTACT (mutual consent) ────────────────────────

  /**
   * POST /auth/recovery-contacts
   * Owner designates another Ondi user as a recovery contact. Looked up by
   * phone number or public Ondi ID. Starts PENDING — the contact must accept
   * separately before it becomes usable, so no one can be named without
   * their knowledge.
   * Body: { phoneNumber? , ondi? }
   */
  app.post('/recovery-contacts', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { phoneNumber, ondi } = req.body as { phoneNumber?: string; ondi?: string };
    if (!phoneNumber && !ondi) return reply.code(400).send({ error: 'phone_or_ondi_required' });

    const contact = phoneNumber
      ? await app.prisma.user.findUnique({ where: { phoneNumber: formatPhoneNumber(phoneNumber) } })
      : await app.prisma.user.findUnique({ where: { ondi } });
    if (!contact) return reply.code(404).send({ error: 'user_not_found' });
    if (contact.id === userId) return reply.code(400).send({ error: 'cannot_add_self' });

    const existing = await app.prisma.recoveryContact.findUnique({
      where: { userId_contactUserId: { userId, contactUserId: contact.id } },
    });
    if (existing && !existing.removedAt) return reply.code(409).send({ error: 'already_added' });

    const created = existing
      ? await app.prisma.recoveryContact.update({
          where: { id: existing.id },
          data:  { removedAt: null, confirmedAt: null, createdAt: new Date() },
        })
      : await app.prisma.recoveryContact.create({
          data: { userId, contactUserId: contact.id },
        });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'RECOVERY_CONTACT_ADDED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { contactUserId: contact.id },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({ id: created.id, status: 'pending' });
  });

  /**
   * GET /auth/recovery-contacts
   * Lists the contacts THIS user has designated (owner's own view).
   */
  app.get('/recovery-contacts', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const rows = await app.prisma.recoveryContact.findMany({
      where:   { userId, removedAt: null },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      contacts: rows.map(r => ({
        id:          r.id,
        status:      r.confirmedAt ? 'active' : 'pending',
        contactName: [r.contact.firstName, r.contact.lastName].filter(Boolean).join(' ') || null,
        contactPhone: r.contact.phoneNumber,
        addedAt:     r.createdAt,
        confirmedAt: r.confirmedAt,
      })),
    });
  });

  /**
   * GET /auth/recovery-contacts/pending
   * Lists invitations waiting for THIS user (as the contact) to accept.
   */
  app.get('/recovery-contacts/pending', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const rows = await app.prisma.recoveryContact.findMany({
      where:   { contactUserId: userId, confirmedAt: null, removedAt: null },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      invitations: rows.map(r => ({
        id:        r.id,
        ownerName: [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || null,
        ownerPhone: r.user.phoneNumber,
        requestedAt: r.createdAt,
      })),
    });
  });

  /**
   * POST /auth/recovery-contacts/:id/accept
   * The invited contact accepts, activating the relationship.
   */
  app.post('/recovery-contacts/:id/accept', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const row = await app.prisma.recoveryContact.findFirst({ where: { id, contactUserId: userId } });
    if (!row || row.removedAt) return reply.code(404).send({ error: 'invitation_not_found' });
    if (row.confirmedAt) return reply.send({ status: 'active' });

    await app.prisma.recoveryContact.update({ where: { id }, data: { confirmedAt: new Date() } });
    return reply.send({ status: 'active' });
  });

  /**
   * DELETE /auth/recovery-contacts/:id
   * Either side (the owner or the contact) can remove the relationship.
   */
  app.delete('/recovery-contacts/:id', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const row = await app.prisma.recoveryContact.findFirst({
      where: { id, OR: [{ userId }, { contactUserId: userId }] },
    });
    if (!row || row.removedAt) return reply.code(404).send({ error: 'not_found' });

    await app.prisma.recoveryContact.update({ where: { id }, data: { removedAt: new Date() } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     row.userId,
      action:       'RECOVERY_CONTACT_REMOVED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { contactUserId: row.contactUserId, removedBy: userId },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ removed: true });
  });

  // ─── THE RECOVERY REQUEST FLOW ───────────────────────────────────────────────

  /**
   * GET /auth/recovery/status?phoneNumber=...
   * Lets the locked-out requester (who has no requestId to reference,
   * deliberately — /request never returns one, to avoid leaking whether a
   * phone number is registered) check progress on their own open request.
   * Same trust model as /request itself: identified by phone number alone.
   */
  app.get('/recovery/status', async (req: any, reply) => {
    const { phoneNumber } = req.query as { phoneNumber?: string };
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const formatted = formatPhoneNumber(phoneNumber);
    const user = await app.prisma.user.findUnique({ where: { phoneNumber: formatted } });
    if (!user) return reply.send({ status: 'none' });

    const request = await app.prisma.recoveryRequest.findFirst({
      where:   { userId: user.id, completedAt: null, deniedAt: null, expiresAt: null },
      orderBy: { requestedAt: 'desc' },
    });
    if (!request) return reply.send({ status: 'none' });

    let status: string;
    if (request.finalConfirmedAt) status = 'ready_to_complete';
    else if (request.approvedAt && request.cooldownEndsAt && request.cooldownEndsAt <= new Date()) status = 'awaiting_contact_confirmation';
    else if (request.approvedAt) status = 'cooldown';
    else status = 'pending';

    return reply.send({ status, requestId: request.id, cooldownEndsAt: request.cooldownEndsAt });
  });

  /**
   * POST /auth/recovery/:requestId/send-completion-otp
   * Sends the real SMS OTP (purpose RESET) needed for the final /complete
   * call, only once the request is actually ready to complete.
   */
  app.post('/recovery/:requestId/send-completion-otp', async (req: any, reply) => {
    const { requestId } = req.params as { requestId: string };
    const request = await app.prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!request || request.completedAt || request.deniedAt || request.expiresAt)
      return reply.code(404).send({ error: 'request_not_found' });
    if (!request.finalConfirmedAt) return reply.code(400).send({ error: 'awaiting_contact_confirmation' });
    if (!request.cooldownEndsAt || request.cooldownEndsAt > new Date())
      return reply.code(400).send({ error: 'cooldown_not_elapsed' });

    const user = await app.prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const plainCode = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');
    await app.prisma.oTP.updateMany({ where: { phoneNumber: user.phoneNumber, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    await app.prisma.oTP.create({
      data: { phoneNumber: user.phoneNumber, codeHash, purpose: 'RESET', expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    app.log.info(`Recovery completion OTP for ${user.phoneNumber}: ${plainCode}`);
    await sendSMS(user.phoneNumber, `HUDUMIKA: Your account recovery code is ${plainCode}. Valid for 10 minutes.`, app.log);

    return reply.send({ sent: true });
  });

  /**
   * POST /auth/recovery/request
   * Unauthenticated by necessity — this is for a user who is actually locked
   * out. Rate-limited by mirroring the one existing precedent in this
   * codebase (auth.ts's OTP-request DB-count gate): at most one open request
   * per account, plus a cooldown after a deny/expiry. Never re-notifies
   * contacts on a duplicate call while a request is already open — that's
   * the harassment-vector guard.
   * Body: { phoneNumber }
   */
  app.post('/recovery/request', async (req: any, reply) => {
    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber) return reply.code(400).send({ error: 'phone_required' });

    const formatted = formatPhoneNumber(phoneNumber);
    const user = await app.prisma.user.findUnique({ where: { phoneNumber: formatted } });
    // Always return a generic response regardless of whether the account
    // exists, so this endpoint can't be used to probe which phone numbers
    // are registered.
    if (!user) return reply.send({ requested: true });

    // No background-job infra exists anywhere in this codebase, so a stale
    // request (never approved, sitting for days) is lazily expired here on
    // read rather than by a cron sweep — otherwise it would block new
    // requests forever if a contact never responds.
    await app.prisma.recoveryRequest.updateMany({
      where: {
        userId: user.id, completedAt: null, deniedAt: null, expiresAt: null, approvedAt: null,
        requestedAt: { lt: new Date(Date.now() - 72 * 60 * 60 * 1000) },
      },
      data: { expiresAt: new Date() },
    });

    const openRequest = await app.prisma.recoveryRequest.findFirst({
      where: { userId: user.id, completedAt: null, deniedAt: null, expiresAt: null },
      orderBy: { requestedAt: 'desc' },
    });
    if (openRequest) {
      // Already open — do not re-notify contacts, just acknowledge.
      return reply.send({ requested: true });
    }

    const recentClosed = await app.prisma.recoveryRequest.findFirst({
      where: {
        userId: user.id,
        OR: [{ deniedAt: { not: null } }, { expiresAt: { not: null } }],
        requestedAt: { gte: new Date(Date.now() - REQUEST_COOLDOWN_HOURS * 60 * 60 * 1000) },
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (recentClosed) return reply.send({ requested: true });

    const activeContacts = await app.prisma.recoveryContact.findMany({
      where:   { userId: user.id, confirmedAt: { not: null }, removedAt: null },
      include: { contact: true },
    });

    const request = await app.prisma.recoveryRequest.create({ data: { userId: user.id } });

    for (const rc of activeContacts) {
      await sendSMS(
        rc.contact.phoneNumber,
        `HUDUMIKA: ${user.firstName || 'An Ondi user'} has requested account recovery and named you as a trusted contact. Reply in the Ondi app to approve or deny. Request ID: ${request.id}`,
        app.log,
      );
    }
    // Heads-up to the owner's own phone too, in case they're not actually
    // locked out — the stronger fix is the auto-cancel-on-normal-login hook
    // in auth.ts, but this costs nothing extra.
    await sendSMS(
      user.phoneNumber,
      `HUDUMIKA: A recovery request was started on your Ondi account. If this wasn't you, simply log in normally to cancel it.`,
      app.log,
    );

    await app.audit.write({
      entityType:   'USER',
      entityId:     user.id,
      action:       'RECOVERY_REQUESTED',
      category:     'AUTH',
      performedBy:  user.id,
      metadata:     { requestId: request.id, notifiedContacts: activeContacts.length },
      severity:     'WARNING',
      isRegulatory: true,
    });

    return reply.send({ requested: true });
  });

  /**
   * POST /auth/recovery/:requestId/approve
   * A contact approves the request, starting the cooldown window.
   */
  app.post('/recovery/:requestId/approve', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { requestId } = req.params as { requestId: string };
    const request = await app.prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!request || request.completedAt || request.deniedAt || request.expiresAt)
      return reply.code(404).send({ error: 'request_not_found' });

    const isActiveContact = await app.prisma.recoveryContact.findFirst({
      where: { userId: request.userId, contactUserId: userId, confirmedAt: { not: null }, removedAt: null },
    });
    if (!isActiveContact) return reply.code(403).send({ error: 'not_a_recovery_contact' });

    const cooldownEndsAt = new Date(Date.now() + APPROVAL_COOLDOWN_HOURS * 60 * 60 * 1000);
    await app.prisma.recoveryRequest.update({
      where: { id: requestId },
      data:  { approvedAt: new Date(), approvedBy: userId, cooldownEndsAt },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     request.userId,
      action:       'RECOVERY_APPROVED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { requestId, cooldownEndsAt },
      severity:     'WARNING',
      isRegulatory: true,
    });

    return reply.send({ approved: true, cooldownEndsAt });
  });

  /**
   * POST /auth/recovery/:requestId/deny
   */
  app.post('/recovery/:requestId/deny', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { requestId } = req.params as { requestId: string };
    const request = await app.prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!request || request.completedAt || request.deniedAt || request.expiresAt)
      return reply.code(404).send({ error: 'request_not_found' });

    const isActiveContact = await app.prisma.recoveryContact.findFirst({
      where: { userId: request.userId, contactUserId: userId, confirmedAt: { not: null }, removedAt: null },
    });
    if (!isActiveContact) return reply.code(403).send({ error: 'not_a_recovery_contact' });

    await app.prisma.recoveryRequest.update({ where: { id: requestId }, data: { deniedAt: new Date() } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     request.userId,
      action:       'RECOVERY_DENIED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { requestId },
      severity:     'WARNING',
      isRegulatory: true,
    });

    return reply.send({ denied: true });
  });

  /**
   * POST /auth/recovery/:requestId/confirm-completion
   * The SAME approving contact re-confirms after the cooldown has passed.
   * This — not the completion OTP — is the real trust anchor: the phone-OTP
   * gate alone is weak against the primary threat this feature targets
   * (SIM-swap, where the attacker already controls the phone number).
   */
  app.post('/recovery/:requestId/confirm-completion', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { requestId } = req.params as { requestId: string };
    const request = await app.prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!request || request.completedAt || request.deniedAt || request.expiresAt)
      return reply.code(404).send({ error: 'request_not_found' });
    if (!request.approvedBy || request.approvedBy !== userId)
      return reply.code(403).send({ error: 'not_the_approving_contact' });
    if (!request.cooldownEndsAt || request.cooldownEndsAt > new Date())
      return reply.code(400).send({ error: 'cooldown_not_elapsed' });

    await app.prisma.recoveryRequest.update({ where: { id: requestId }, data: { finalConfirmedAt: new Date() } });
    return reply.send({ confirmed: true });
  });

  /**
   * POST /auth/recovery/:requestId/complete
   * Only proceeds once the cooldown has passed AND the contact's final
   * confirmation is on file. Revokes every existing session and previously-
   * trusted device, and wipes the TOTP credential to force re-enrollment —
   * without this, a still-valid pre-recovery session would let an attacker
   * keep access even after "recovery" completes.
   * Body: { phoneNumber, otp }
   */
  app.post('/recovery/:requestId/complete', async (req: any, reply) => {
    const { requestId } = req.params as { requestId: string };
    const { phoneNumber, otp } = req.body as { phoneNumber?: string; otp?: string };
    if (!phoneNumber || !otp) return reply.code(400).send({ error: 'missing_fields' });

    const request = await app.prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!request || request.completedAt || request.deniedAt || request.expiresAt)
      return reply.code(404).send({ error: 'request_not_found' });
    if (!request.finalConfirmedAt) return reply.code(400).send({ error: 'awaiting_contact_confirmation' });
    if (!request.cooldownEndsAt || request.cooldownEndsAt > new Date())
      return reply.code(400).send({ error: 'cooldown_not_elapsed' });

    const user = await app.prisma.user.findUnique({ where: { id: request.userId } });
    if (!user || formatPhoneNumber(phoneNumber) !== user.phoneNumber)
      return reply.code(400).send({ error: 'phone_mismatch' });

    const otpRecord = await app.prisma.oTP.findFirst({
      where: { phoneNumber: user.phoneNumber, status: 'PENDING', purpose: 'RESET' },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) return reply.code(404).send({ error: 'otp_not_found' });
    if (otpRecord.expiresAt < new Date()) {
      await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'EXPIRED' } });
      return reply.code(401).send({ error: 'otp_expired' });
    }
    const submittedHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (submittedHash !== otpRecord.codeHash) return reply.code(401).send({ error: 'invalid_otp' });
    await app.prisma.oTP.update({ where: { id: otpRecord.id }, data: { status: 'USED' } });

    // Revoke everything that could let a pre-recovery attacker retain access.
    await app.prisma.authSession.deleteMany({ where: { userId: user.id } });
    await app.prisma.device.updateMany({ where: { userId: user.id }, data: { isTrusted: false } });
    await app.prisma.credential.deleteMany({ where: { userId: user.id, type: 'OTP' } });

    const jwt = await import('jsonwebtoken');
    const accessToken = jwt.default.sign(
      { sub: user.id, one_id: user.ondi, verification_level: user.verificationLevel },
      JWT_SECRET,
      { expiresIn: '15m', issuer: JWT_ISSUER },
    );
    const refreshToken = crypto.randomBytes(48).toString('hex');
    await app.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        riskScore: 0,
        decision: 'allow',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await app.prisma.recoveryRequest.update({ where: { id: requestId }, data: { completedAt: new Date() } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     user.id,
      action:       'RECOVERY_COMPLETED',
      category:     'AUTH',
      performedBy:  user.id,
      metadata:     { requestId },
      severity:     'CRITICAL',
      isRegulatory: true,
    });

    return reply.send({ access_token: accessToken, refresh_token: refreshToken, mfaResetRequired: true });
  });
}
