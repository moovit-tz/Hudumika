import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { MailService } from '../services/mail.service.js';
import { env } from '../config/env.js';
import { MinioIntegration } from '../integrations/minio.js';
import { extractKycDocument, extractKybDocument } from '../lib/kyc-ocr.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { requireRoleOrOrgPermission, hasOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';

const kybSubmitSchema = z.object({
  image_base64: z.string().min(1),
  media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
});
const orgRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.enum([
    ORG_PERMISSIONS.KYC_REVIEW,
    ORG_PERMISSIONS.ACCESS_REQUESTS_REVIEW,
    ORG_PERMISSIONS.API_KEYS_MANAGE,
    ORG_PERMISSIONS.ORG_CHART_MANAGE,
    ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE,
  ])).default([]),
});

const KYC_SUBMIT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const kycSubmitSchema = z.object({
  document_type: z.enum(['national_id', 'passport', 'drivers_license']),
  image_base64: z.string().min(1),
  media_type: z.enum(KYC_SUBMIT_MEDIA_TYPES).default('image/jpeg'),
});
// unverified → phone_verified → id_verified → enhanced: KYC approval should
// never move a user BACKWARDS from a tier they already hold (e.g. 'enhanced'
// from a future org/KYB milestone), only forward to at least 'id_verified'.
const VERIFICATION_RANK: Record<string, number> = { unverified: 0, phone_verified: 1, id_verified: 2, enhanced: 3 };

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'TENANT_ADMIN', 'OFFICER'] as const;

// Ondi (Identity & Access) — presents the existing users/invitations/login-history
// data (owned by the HR tables) as its own app, plus SSO provider configuration
// that doesn't exist anywhere else. See hr.routes.ts for the underlying HR-facing
// endpoints this mirrors; kept separate rather than migrated to avoid regressing
// the working HR module.
export async function oneidRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('oneid'));

  // ── Users ────────────────────────────────────────────────────

  fastify.get('/users', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('users')
        .select(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at', 'last_login_at'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name')
        .execute();
    });
  });

  fastify.patch('/users/:id/role', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    // Same fix as hr.routes.ts PATCH /staff/:id/role — this route is
    // reachable by ADMIN/TENANT_ADMIN (both tenant-scoped), and an
    // unvalidated role let either self-grant SUPER_ADMIN on any user in
    // their own tenant.
    const { role } = z.object({ role: z.enum(STAFF_ROLES) }).parse(req.body);
    if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only a SUPER_ADMIN can grant SUPER_ADMIN' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('users').set({ role, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'role'])
        .executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/users/:id/status', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('users').set({ active, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'active'])
        .executeTakeFirstOrThrow();
    });
  });

  // ── Invitations (same hr_invitations table/flow as HR) ─────────

  fastify.get('/invitations', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_invitations as i')
        .leftJoin('users as u', 'u.id', 'i.invited_by')
        .select(['i.id', 'i.email', 'i.role', 'i.status', 'i.expires_at', 'i.created_at', 'u.name as invited_by_name'])
        .where('i.tenant_id', '=', user.tenant_id)
        .orderBy('i.created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/invitations', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    // Same fix as hr.routes.ts POST /invitations — the invite's role becomes
    // the accepted user's real role, so this needed the identical guard.
    const body = z.object({
      email: z.string().trim().email().max(320),
      role: z.enum(STAFF_ROLES),
    }).parse(req.body);
    if (body.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only a SUPER_ADMIN can invite a SUPER_ADMIN' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await trx.insertInto('hr_invitations').values({
        tenant_id: user.tenant_id, email: body.email, role: body.role,
        token, invited_by: user.sub, expires_at: expiresAt,
      }).returningAll().executeTakeFirstOrThrow();

      const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${token}`;
      // Same template key HR's own /invitations uses (hr.routes.ts) — this
      // was byte-identical duplicated HTML before; one template, two callers.
      await MailService.enqueueTemplated(user.tenant_id, 'hr.staff_invitation', body.email, { role: body.role, acceptUrl }, 'oneid')
        .catch(() => { /* invite row exists regardless; can still be resent below */ });

      return invite;
    });
  });

  // HR's own invitations page (hr.routes.ts POST /invitations/:id/resend)
  // used to be the only place this action existed; now that Ondi is the
  // one live home for invitations, it needs its own copy of the same call.
  fastify.post('/invitations/:id/resend', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const invite = await trx.selectFrom('hr_invitations').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!invite) throw Object.assign(new Error('Invitation not found'), { statusCode: 404 });
      const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${invite.token}`;
      await MailService.enqueueTemplated(user.tenant_id, 'hr.staff_invitation_reminder', invite.email, { acceptUrl }, 'oneid')
        .catch(() => {});
      return { ok: true };
    });
  });

  fastify.delete('/invitations/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('hr_invitations')
        .set({ status: 'REVOKED' })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Login history (already populated by auth.routes.ts on every login) ─

  fastify.get('/login-history', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_login_history as l')
        .innerJoin('users as u', 'u.id', 'l.user_id')
        .select(['l.id', 'l.ip', 'l.user_agent', 'l.status', 'l.created_at', 'u.name as user_name'])
        .where('l.tenant_id', '=', user.tenant_id)
        .orderBy('l.created_at', 'desc')
        .limit(200)
        .execute();
    });
  });

  fastify.get('/devices', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_devices as d')
        .innerJoin('users as u', 'u.id', 'd.user_id')
        .select(['d.id', 'd.device_label', 'd.device_type', 'd.trusted', 'd.last_used_at', 'u.name as user_name'])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.last_used_at', 'desc')
        .execute();
    });
  });

  fastify.patch('/devices/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { trusted } = req.body as { trusted: boolean };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_devices').set({ trusted })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── SSO providers (config registry — see migration 053 header comment:
  //    this is NOT a working SAML/OIDC federation implementation) ────────

  fastify.get('/sso-providers', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('sso_providers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/sso-providers', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as { provider_type: string; name: string; config?: Record<string, any> };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('sso_providers').values({
        tenant_id: user.tenant_id,
        provider_type: body.provider_type,
        name: body.name,
        config: JSON.stringify(body.config ?? {}),
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/sso-providers/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; config?: Record<string, any>; enabled?: boolean };
    return withTenant(user.tenant_id, async (trx) => {
      const updates: Record<string, any> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.config !== undefined) updates.config = JSON.stringify(body.config);
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      return trx.updateTable('sso_providers').set(updates)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/sso-providers/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('sso_providers')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Outbound SSO Clients (Ondi M6) ───────────────────────────

  fastify.get('/oauth-clients', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async () => {
    return dbPlatform.selectFrom('ondi_oauth_clients')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  });

  fastify.post('/oauth-clients', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const body = z.object({
      client_id: z.string().trim().min(3).max(80),
      name: z.string().trim().min(1).max(100),
      redirect_uris: z.array(z.string()),
      logo_url: z.string().url().optional().nullable(),
      first_party: z.boolean().default(false),
      client_secret: z.string().trim().max(100).optional().nullable(),
    }).parse(req.body);

    const clientSecretHash = body.client_secret ? crypto.createHash('sha256').update(body.client_secret).digest('hex') : null;

    return dbPlatform.insertInto('ondi_oauth_clients').values({
      client_id: body.client_id,
      client_secret_hash: clientSecretHash,
      name: body.name,
      redirect_uris: JSON.stringify(body.redirect_uris) as any,
      logo_url: body.logo_url || null,
      first_party: body.first_party,
    }).returningAll().executeTakeFirstOrThrow();
  });

  fastify.patch('/oauth-clients/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      redirect_uris: z.array(z.string()).optional(),
      logo_url: z.string().url().optional().nullable(),
      first_party: z.boolean().optional(),
      client_secret: z.string().trim().max(100).optional().nullable(),
    }).parse(req.body);

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.redirect_uris !== undefined) updates.redirect_uris = JSON.stringify(body.redirect_uris);
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
    if (body.first_party !== undefined) updates.first_party = body.first_party;
    if (body.client_secret !== undefined) {
      updates.client_secret_hash = body.client_secret ? crypto.createHash('sha256').update(body.client_secret).digest('hex') : null;
    }

    return dbPlatform.updateTable('ondi_oauth_clients')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  fastify.delete('/oauth-clients/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const { id } = req.params as { id: string };
    await dbPlatform.deleteFrom('ondi_oauth_clients').where('id', '=', id).execute();
    return { ok: true };
  });

  // ── KYC (Ondi M4) — real Gemini-vision OCR (same key/engine as
  // ocr.routes.ts/comply-ocr.routes.ts, no separate integration) + MRZ
  // checksum validation for passports. No simulated fallback: a fabricated
  // identity extraction is a materially different risk than a fabricated
  // demo shipping document, so this 503s honestly instead. ─────────────

  fastify.post('/kyc/submit', async (req, reply) => {
    const user = req.user;
    const { document_type, image_base64, media_type } = kycSubmitSchema.parse(req.body);

    let extraction;
    try {
      extraction = await extractKycDocument(image_base64, media_type);
    } catch (err: any) {
      if (err.message === 'DOCUMENT_READING_UNAVAILABLE') {
        return reply.status(503).send({
          error: 'DOCUMENT_READING_UNAVAILABLE',
          message: 'Identity verification needs an OCR key, which is not configured. A SuperAdmin sets it under Platform Settings → OCR / Document Scanning.',
        });
      }
      req.log.error(err, 'KYC extraction failed');
      return reply.status(500).send({ error: 'Could not read that document. Try a clearer photo.' });
    }

    if (extraction.flags.includes('NOT_AN_ID_DOCUMENT')) {
      return reply.status(422).send({ error: 'That does not look like a government ID document. Try again with a clear photo of your ID.' });
    }

    const buffer = Buffer.from(image_base64, 'base64');
    const ext = media_type === 'image/png' ? 'png' : media_type === 'image/webp' ? 'webp' : 'jpg';
    const { storageKey } = await MinioIntegration.uploadKycDocument(user.tenant_id, user.sub, `${document_type}.${ext}`, buffer);

    const created = await withTenant(user.tenant_id, async (trx) => {
      const submission = await trx.insertInto('ondi_kyc_submissions').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        document_type,
        document_storage_key: storageKey,
        extracted_full_name: extraction.fullName,
        extracted_dob: extraction.dob,
        extracted_document_number: extraction.documentNumber,
        extracted_nationality: extraction.nationality,
        extracted_expiry: extraction.expiry,
        mrz_raw: extraction.mrzRaw,
        mrz_valid: extraction.mrzValid,
        ocr_confidence: extraction.confidence !== null ? String(extraction.confidence) : null,
      }).returning(['id', 'status', 'created_at']).executeTakeFirstOrThrow();

      await trx.updateTable('users').set({ kyc_status: 'pending' }).where('id', '=', user.sub).execute();
      return submission;
    });

    await recordAuthEvent(user.tenant_id, user.sub, 'kyc_submitted', {
      metadata: { submission_id: created.id, document_type, mrz_valid: extraction.mrzValid, flags: extraction.flags },
    });

    return {
      id: created.id,
      status: created.status,
      created_at: created.created_at,
      extracted: {
        full_name: extraction.fullName,
        date_of_birth: extraction.dob,
        document_number: extraction.documentNumber,
        nationality: extraction.nationality,
        expiry_date: extraction.expiry,
        mrz_valid: extraction.mrzValid,
        confidence: extraction.confidence,
        flags: extraction.flags,
      },
    };
  });

  fastify.get('/kyc/status', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const account = await trx.selectFrom('users').select(['kyc_status', 'verification_level'])
        .where('id', '=', user.sub).executeTakeFirstOrThrow();
      const latest = await trx.selectFrom('ondi_kyc_submissions')
        .select(['id', 'document_type', 'status', 'rejection_reason', 'created_at', 'reviewed_at',
                 'extracted_full_name', 'extracted_dob', 'extracted_document_number', 'extracted_nationality', 'extracted_expiry', 'mrz_valid'])
        .where('user_id', '=', user.sub)
        .orderBy('created_at', 'desc')
        .executeTakeFirst();
      return { kyc_status: account.kyc_status, verification_level: account.verification_level, latest_submission: latest ?? null };
    });
  });

  // Admin review queue — pending submissions across the tenant.
  fastify.get('/kyc/queue', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.KYC_REVIEW, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('ondi_kyc_submissions as k')
        .innerJoin('users as u', 'u.id', 'k.user_id')
        .select(['k.id', 'k.document_type', 'k.status', 'k.created_at',
                 'k.extracted_full_name', 'k.extracted_dob', 'k.extracted_document_number',
                 'k.extracted_nationality', 'k.extracted_expiry', 'k.mrz_valid',
                 'u.id as user_id', 'u.name as user_name', 'u.email as user_email'])
        .where('k.tenant_id', '=', user.tenant_id)
        .where('k.status', '=', 'pending')
        .orderBy('k.created_at', 'asc')
        .execute();
    });
  });

  // Authenticated fetch-through for the uploaded document image — own
  // submission or an admin reviewing it, never a public URL. Same
  // convention as files.routes.ts's download route.
  fastify.get('/kyc/:id/document', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    // Same reviewer check as the approve/reject routes below (role OR the
    // kyc.review org permission) — this used to be role-only, so a custom-role
    // holder could approve/reject a submission but not view the document image
    // being reviewed.
    const isReviewer = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role)
      || await hasOrgPermission(user.tenant_id, user.sub, ORG_PERMISSIONS.KYC_REVIEW);
    const submission = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_kyc_submissions')
      .select(['user_id', 'document_storage_key'])
      .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!submission) return reply.status(404).send({ error: 'Not found' });
    if (submission.user_id !== user.sub && !isReviewer) return reply.status(403).send({ error: 'Forbidden' });

    const bytes = MinioIntegration.readFile(submission.document_storage_key);
    if (!bytes) return reply.status(404).send({ error: 'Document not found' });
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(bytes);
  });

  fastify.post('/kyc/:id/approve', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.KYC_REVIEW, 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const result = await withTenant(user.tenant_id, async (trx) => {
      const submission = await trx.updateTable('ondi_kyc_submissions')
        .set({ status: 'approved', reviewed_by: user.sub, reviewed_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'pending')
        .returning(['user_id']).executeTakeFirst();
      if (!submission) return null;

      const account = await trx.selectFrom('users').select('verification_level').where('id', '=', submission.user_id).executeTakeFirstOrThrow();
      const nextLevel = VERIFICATION_RANK[account.verification_level] < VERIFICATION_RANK.id_verified ? 'id_verified' : account.verification_level;
      await trx.updateTable('users').set({ kyc_status: 'approved', verification_level: nextLevel as any })
        .where('id', '=', submission.user_id).execute();
      return submission;
    });
    if (!result) return reply.status(404).send({ error: 'Submission not found or already reviewed' });

    await recordAuthEvent(user.tenant_id, result.user_id, 'kyc_approved', { metadata: { submission_id: id, reviewed_by: user.sub } });
    return { success: true };
  });

  fastify.post('/kyc/:id/reject', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.KYC_REVIEW, 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    const result = await withTenant(user.tenant_id, async (trx) => {
      const submission = await trx.updateTable('ondi_kyc_submissions')
        .set({ status: 'rejected', reviewed_by: user.sub, reviewed_at: new Date(), rejection_reason: reason })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'pending')
        .returning(['user_id']).executeTakeFirst();
      if (!submission) return null;
      // Don't let a later resubmission's rejection undo an already-approved
      // account — a person who's already verified stays verified even if a
      // subsequent (e.g. document-upgrade) attempt is rejected; only their
      // account is 'not_started'/'pending'/already-'rejected' moves to 'rejected'.
      await trx.updateTable('users').set({ kyc_status: 'rejected' })
        .where('id', '=', submission.user_id).where('kyc_status', '!=', 'approved').execute();
      return submission;
    });
    if (!result) return reply.status(404).send({ error: 'Submission not found or already reviewed' });

    await recordAuthEvent(user.tenant_id, result.user_id, 'kyc_rejected', { metadata: { submission_id: id, reviewed_by: user.sub, reason } });
    return { success: true };
  });

  // ── Org KYB (Ondi M5) — the tenant's own business registration, reviewed
  // by the platform SuperAdmin, not a tenant admin (see superadmin-kyb.routes.ts
  // for why). Same Gemini-OCR engine as personal KYC, different prompt/target. ──

  fastify.post('/org/kyb/submit', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { image_base64, media_type } = kybSubmitSchema.parse(req.body);

    let extraction;
    try {
      extraction = await extractKybDocument(image_base64, media_type);
    } catch (err: any) {
      if (err.message === 'DOCUMENT_READING_UNAVAILABLE') {
        return reply.status(503).send({
          error: 'DOCUMENT_READING_UNAVAILABLE',
          message: 'Business verification needs an OCR key, which is not configured. A SuperAdmin sets it under Platform Settings → OCR / Document Scanning.',
        });
      }
      req.log.error(err, 'KYB extraction failed');
      return reply.status(500).send({ error: 'Could not read that document. Try a clearer photo.' });
    }
    if (extraction.flags.includes('NOT_A_REGISTRATION_DOCUMENT')) {
      return reply.status(422).send({ error: 'That does not look like a business registration document.' });
    }

    const buffer = Buffer.from(image_base64, 'base64');
    const ext = media_type === 'image/png' ? 'png' : media_type === 'image/webp' ? 'webp' : 'jpg';
    const { storageKey } = await MinioIntegration.uploadOrgKybDocument(user.tenant_id, `kyb.${ext}`, buffer);

    const created = await withTenant(user.tenant_id, async (trx) => {
      const submission = await trx.insertInto('ondi_org_kyb').values({
        tenant_id: user.tenant_id,
        submitted_by: user.sub,
        document_storage_key: storageKey,
        extracted_company_name: extraction.companyName,
        extracted_registry_number: extraction.registryNumber,
        extracted_entity_type: extraction.entityType,
        extracted_status: extraction.registrationStatus,
        extracted_incorporation_date: extraction.incorporationDate,
      }).returning(['id', 'status', 'created_at']).executeTakeFirstOrThrow();
      await trx.updateTable('tenants').set({ kyb_status: 'pending' }).where('id', '=', user.tenant_id).execute();
      return submission;
    });

    await recordAuthEvent(user.tenant_id, user.sub, 'kyb_submitted', { metadata: { submission_id: created.id } });
    return { id: created.id, status: created.status, created_at: created.created_at, extracted: extraction };
  });

  fastify.get('/org/kyb/status', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const tenant = await trx.selectFrom('tenants').select('kyb_status').where('id', '=', user.tenant_id).executeTakeFirstOrThrow();
      const latest = await trx.selectFrom('ondi_org_kyb')
        .select(['id', 'status', 'rejection_reason', 'created_at', 'reviewed_at', 'extracted_company_name', 'extracted_registry_number', 'extracted_entity_type'])
        .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').executeTakeFirst();
      return { kyb_status: tenant.kyb_status, latest_submission: latest ?? null };
    });
  });

  // ── Custom roles & groups (Ondi M5) — additive layer on top of
  // users.role; see org-rbac.ts's ORG_PERMISSIONS for what a role can
  // actually be granted, and its own comment on why role administration
  // itself (this section) stays ADMIN/TENANT_ADMIN-only rather than being
  // gated by one of those permissions. ──

  fastify.get('/org/roles', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const roles = await trx.selectFrom('ondi_org_roles').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name').execute();
      const members = await trx.selectFrom('ondi_org_role_members as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.role_id', 'm.user_id', 'u.name as user_name', 'u.email as user_email', 'm.expires_at'])
        .where('m.tenant_id', '=', user.tenant_id).execute();
      return roles.map(r => ({ ...r, members: members.filter(m => m.role_id === r.id) }));
    });
  });

  fastify.post('/org/roles', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = orgRoleSchema.parse(req.body);
    try {
      const role = await withTenant(user.tenant_id, trx => trx.insertInto('ondi_org_roles').values({
        tenant_id: user.tenant_id, name: body.name, description: body.description ?? null,
        permissions: JSON.stringify(body.permissions), created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow());
      await recordAuthEvent(user.tenant_id, user.sub, 'org_role_created', { metadata: { role_id: role.id, name: role.name } });
      reply.status(201);
      return role;
    } catch (err: any) {
      if (String(err.message || '').includes('unique')) return reply.status(409).send({ error: 'A role with this name already exists.' });
      throw err;
    }
  });

  fastify.delete('/org/roles/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx.deleteFrom('ondi_org_roles').where('id', '=', id).where('tenant_id', '=', user.tenant_id).returning('id').executeTakeFirst();
      if (!deleted) { reply.status(404); return { error: 'Role not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'org_role_deleted', { metadata: { role_id: id } });
      return { success: true };
    });
  });

  fastify.post('/org/roles/:id/members', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    // Just-in-Time-lite access (migration 364): expires_in_hours is optional —
    // omitted/undefined means a permanent grant, same as before this existed.
    const { user_id, expires_in_hours } = z.object({
      user_id: z.string().uuid(),
      expires_in_hours: z.number().positive().max(24 * 365).optional(),
    }).parse(req.body);
    const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600_000) : null;
    return withTenant(user.tenant_id, async (trx) => {
      const role = await trx.selectFrom('ondi_org_roles').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!role) { reply.status(404); return { error: 'Role not found' }; }
      await trx.insertInto('ondi_org_role_members').values({
        tenant_id: user.tenant_id, role_id: id, user_id, granted_by: user.sub, expires_at: expiresAt,
      }).onConflict(oc => oc.columns(['role_id', 'user_id']).doUpdateSet({ expires_at: expiresAt, granted_by: user.sub })).execute();
      await recordAuthEvent(user.tenant_id, user_id, 'org_role_granted', { metadata: { role_id: id, granted_by: user.sub, expires_at: expiresAt?.toISOString() ?? null } });
      return { success: true };
    });
  });

  fastify.delete('/org/roles/:id/members/:userId', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id, userId } = req.params as { id: string; userId: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('ondi_org_role_members').where('role_id', '=', id).where('user_id', '=', userId).where('tenant_id', '=', user.tenant_id).execute();
      await recordAuthEvent(user.tenant_id, userId, 'org_role_revoked', { metadata: { role_id: id, revoked_by: user.sub } });
      return { success: true };
    });
  });

  // ── Self-service access requests (Ondi M5) ──────────────────────

  fastify.get('/org/roles/available', async (req) => {
    // Every member can see the role catalog (names/descriptions only, not
    // membership) so they know what to ask for.
    const user = req.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('ondi_org_roles')
      .select(['id', 'name', 'description']).where('tenant_id', '=', user.tenant_id).orderBy('name').execute());
  });

  fastify.get('/org/access-requests/mine', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const mine = await trx.selectFrom('ondi_org_access_requests as a')
        .innerJoin('ondi_org_roles as r', 'r.id', 'a.role_id')
        .select(['a.id', 'a.status', 'a.reason', 'a.created_at', 'a.reviewed_at', 'a.break_glass', 'a.required_approvals', 'r.name as role_name'])
        .where('a.user_id', '=', user.sub).orderBy('a.created_at', 'desc').execute();
      const ids = mine.map(m => m.id);
      const approvals = ids.length > 0
        ? await trx.selectFrom('ondi_org_access_request_approvals').select(['request_id', 'decision']).where('request_id', 'in', ids).execute()
        : [];
      return mine.map(m => ({ ...m, approvals_count: approvals.filter(a => a.request_id === m.id && a.decision === 'approve').length }));
    });
  });

  // Dual-control / break-glass (migration 365): break_glass=true forces
  // required_approvals=2 and a mandatory, capped expiry — no single admin
  // can grant, or self-grant, emergency access alone, and the grant it
  // produces can never be permanent. Every other request keeps the
  // pre-existing single-approval (required_approvals=1) behavior.
  const accessRequestSchema = z.object({
    role_id: z.string().uuid(),
    reason: z.string().trim().max(300).optional(),
    break_glass: z.boolean().optional(),
    expires_in_hours: z.number().positive().max(24).optional(),
  });

  fastify.post('/org/access-requests', async (req, reply) => {
    const user = req.user;
    const { role_id, reason, break_glass, expires_in_hours } = accessRequestSchema.parse(req.body);
    const isBreakGlass = break_glass === true;
    return withTenant(user.tenant_id, async (trx) => {
      const role = await trx.selectFrom('ondi_org_roles').select('id').where('id', '=', role_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!role) { reply.status(404); return { error: 'Role not found' }; }
      const existing = await trx.selectFrom('ondi_org_role_members').select('id').where('role_id', '=', role_id).where('user_id', '=', user.sub).executeTakeFirst();
      if (existing) { reply.status(400); return { error: 'You already have this role.' }; }
      const created = await trx.insertInto('ondi_org_access_requests').values({
        tenant_id: user.tenant_id, user_id: user.sub, role_id, reason: reason ?? null,
        break_glass: isBreakGlass, required_approvals: isBreakGlass ? 2 : 1,
        expires_in_hours: isBreakGlass ? (expires_in_hours ?? 4) : null,
      }).returningAll().executeTakeFirstOrThrow();
      await recordAuthEvent(user.tenant_id, user.sub, 'access_request_submitted', { metadata: { request_id: created.id, role_id, break_glass: isBreakGlass } });
      reply.status(201);
      return created;
    });
  });

  fastify.get('/org/access-requests', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REQUESTS_REVIEW, 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('ondi_org_access_requests as a')
        .innerJoin('ondi_org_roles as r', 'r.id', 'a.role_id')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .select(['a.id', 'a.user_id', 'a.reason', 'a.created_at', 'a.break_glass', 'a.required_approvals', 'a.expires_in_hours', 'r.id as role_id', 'r.name as role_name', 'u.name as user_name', 'u.email as user_email'])
        .where('a.tenant_id', '=', user.tenant_id).where('a.status', '=', 'pending')
        .orderBy('a.created_at', 'asc').execute();
      const ids = rows.map(r => r.id);
      const approvals = ids.length > 0
        ? await trx.selectFrom('ondi_org_access_request_approvals').select(['request_id', 'approver_id', 'decision']).where('request_id', 'in', ids).execute()
        : [];
      return rows.map(r => ({
        ...r,
        approvals_count: approvals.filter(a => a.request_id === r.id && a.decision === 'approve').length,
        my_decision: approvals.find(a => a.request_id === r.id && a.approver_id === user.sub)?.decision ?? null,
      }));
    });
  });

  fastify.post('/org/access-requests/:id/approve', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REQUESTS_REVIEW, 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const outcome = await withTenant(user.tenant_id, async (trx) => {
      const request = await trx.selectFrom('ondi_org_access_requests')
        .selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'pending').executeTakeFirst();
      if (!request) return { kind: 'not_found' as const };

      try {
        await trx.insertInto('ondi_org_access_request_approvals').values({
          tenant_id: user.tenant_id, request_id: id, approver_id: user.sub, decision: 'approve',
        }).execute();
      } catch (err: any) {
        if (String(err.message || '').includes('unique')) return { kind: 'already_decided' as const };
        throw err;
      }

      const approvals = await trx.selectFrom('ondi_org_access_request_approvals')
        .select('id').where('request_id', '=', id).where('decision', '=', 'approve').execute();
      if (approvals.length < request.required_approvals) {
        return { kind: 'partial' as const, request, have: approvals.length };
      }

      await trx.updateTable('ondi_org_access_requests')
        .set({ status: 'approved', reviewed_by: user.sub, reviewed_at: new Date() })
        .where('id', '=', id).execute();
      const expiresAt = request.expires_in_hours ? new Date(Date.now() + request.expires_in_hours * 3600_000) : null;
      await trx.insertInto('ondi_org_role_members').values({
        tenant_id: user.tenant_id, role_id: request.role_id, user_id: request.user_id, granted_by: user.sub, expires_at: expiresAt,
      }).onConflict(oc => oc.columns(['role_id', 'user_id']).doUpdateSet({ expires_at: expiresAt, granted_by: user.sub })).execute();
      return { kind: 'final' as const, request };
    });

    if (outcome.kind === 'not_found') return reply.status(404).send({ error: 'Request not found or already reviewed' });
    if (outcome.kind === 'already_decided') return reply.status(409).send({ error: "You've already recorded a decision on this request." });
    if (outcome.kind === 'partial') {
      await recordAuthEvent(user.tenant_id, outcome.request.user_id, 'access_request_approved', { metadata: { request_id: id, role_id: outcome.request.role_id, partial: true, approved_by: user.sub, have: outcome.have, need: outcome.request.required_approvals } });
      return { success: true, finalized: false, approvals: outcome.have, required: outcome.request.required_approvals };
    }
    await recordAuthEvent(user.tenant_id, outcome.request.user_id, 'access_request_approved', { metadata: { request_id: id, role_id: outcome.request.role_id, reviewed_by: user.sub, break_glass: outcome.request.break_glass } });
    return { success: true, finalized: true };
  });

  fastify.post('/org/access-requests/:id/deny', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REQUESTS_REVIEW, 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    // A single reviewer can always shut a request down — dual control gates
    // granting emergency access, not blocking it; requiring two people to
    // say no would be backwards.
    const result = await withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('ondi_org_access_requests')
        .set({ status: 'denied', reviewed_by: user.sub, reviewed_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'pending')
        .returning(['user_id', 'role_id']).executeTakeFirst();
      if (!updated) return null;
      try {
        await trx.insertInto('ondi_org_access_request_approvals').values({
          tenant_id: user.tenant_id, request_id: id, approver_id: user.sub, decision: 'deny',
        }).execute();
      } catch { /* already had a decision recorded — the denial itself still stands */ }
      return updated;
    });
    if (!result) return reply.status(404).send({ error: 'Request not found or already reviewed' });
    await recordAuthEvent(user.tenant_id, result.user_id, 'access_request_denied', { metadata: { request_id: id, role_id: result.role_id, reviewed_by: user.sub } });
    return { success: true };
  });
}
