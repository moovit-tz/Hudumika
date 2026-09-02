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
import { computeOrgTrust } from '../lib/trust-score.js';
import { computeComplianceRollup } from '../lib/compliance-rollup.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

// Ondi feature-gap pass (M5) — same escaping convention hr.routes.ts's own
// timesheet export already uses; kept local rather than newly shared, same
// as that file's own copy.
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

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
    ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE,
    ORG_PERMISSIONS.ORG_TRUST_VIEW,
    ORG_PERMISSIONS.AUTOMATION_MANAGE,
    ORG_PERMISSIONS.COMPLIANCE_REVIEW,
    ORG_PERMISSIONS.POLICIES_MANAGE,
    ORG_PERMISSIONS.ASSETS_MANAGE,
    ORG_PERMISSIONS.INTEGRATIONS_MANAGE,
    ORG_PERMISSIONS.VISITORS_MANAGE,
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

  // Was ADMIN/TENANT_ADMIN-only (missing SUPER_ADMIN, unlike every other
  // admin gate in this file) — fixed while touching this route to add the
  // deactivation event below, since a SUPER_ADMIN using Ondi's own Users
  // page couldn't otherwise deactivate anyone.
  fastify.patch('/users/:id/status', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('users').set({ active, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'active'])
        .executeTakeFirstOrThrow();

      // hr.routes.ts's own /staff/:id/status already emits this same event
      // type for the NexusHR path — reusing it here (not a second event
      // type) so Ondi's leaver automation (subscribers/ondi.subscribers.ts)
      // reacts the same way regardless of which app someone was deactivated from.
      if (!active) {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.staff_deactivated', sourceApp: 'oneid', entityType: 'user', entityId: updated.id,
          payload: { userId: updated.id, name: updated.name, active: updated.active, changedBy: user.sub },
          actorId: user.sub,
        }).catch(err => console.error('[Ondi] staff_deactivated emit failed:', err?.message));
      }

      return updated;
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

  fastify.get('/sso-providers', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('sso_providers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/sso-providers', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
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

  fastify.patch('/sso-providers/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
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

  fastify.delete('/sso-providers/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('sso_providers')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Outbound SSO Clients (Ondi M6) ───────────────────────────

  fastify.get('/oauth-clients', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async () => {
    return dbPlatform.selectFrom('ondi_oauth_clients')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  });

  fastify.post('/oauth-clients', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
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

  fastify.patch('/oauth-clients/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
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

  fastify.delete('/oauth-clients/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
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

  // ── Org groups — dynamic/rule-based membership ──────────────────
  // Ondi feature-gap pass, continued. A group is: a name, a membership list
  // (typed by hand, or computed from a rule), and zero or more roles
  // attached to it. Attaching a role to a group, or a person joining one
  // (by hand or by rule match), writes ordinary ondi_org_role_members rows
  // — the exact same table/shape a direct grant above already uses — just
  // tagged with granted_via_group_id so it can be cleanly un-done later.
  // hasOrgPermission() itself (org-rbac.ts) never learns a new concept.

  const GROUP_RULE_ATTRIBUTES = ['role', 'active'] as const;
  const groupRuleSchema = z.object({
    attribute: z.enum(GROUP_RULE_ATTRIBUTES),
    operator: z.enum(['equals', 'in']),
    value: z.union([z.string(), z.array(z.string())]),
  });
  const orgGroupFields = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    membership_type: z.enum(['static', 'dynamic']).default('static'),
    rule: groupRuleSchema.optional(),
  });
  const orgGroupSchema = orgGroupFields.refine(v => v.membership_type === 'static' || !!v.rule, { message: 'A dynamic group needs a rule.' });
  const orgGroupUpdateSchema = orgGroupFields.partial();

  /** Users currently matching a dynamic group's rule — deliberately just the
   *  one condition, one attribute (role / location_id / active), no AND/OR
   *  composition yet. Every attribute here is a real, directly-queryable
   *  `users` column; nothing speculative like a department field this
   *  platform doesn't reliably capture for every tenant. */
  async function evaluateGroupRule(tenantId: string, rule: { attribute: string; operator: string; value: string | string[] }): Promise<string[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId);
      const col = rule.attribute as 'role' | 'active';
      if (rule.operator === 'in' && Array.isArray(rule.value)) {
        q = q.where(col, 'in', rule.value as any);
      } else {
        const v = Array.isArray(rule.value) ? rule.value[0] : rule.value;
        q = q.where(col, '=', (col === 'active' ? v === 'true' : v) as any);
      }
      const rows = await q.execute();
      return rows.map(r => r.id);
    });
  }

  /** Reconciles ondi_org_role_members against a group's CURRENT member list
   *  for every role attached to the group: grants the role (source-tagged)
   *  to members who don't already have it from anywhere, and revokes only
   *  the grants this exact group is responsible for, for people no longer
   *  in memberUserIds. A grant that already existed for another reason
   *  (direct, or via a different group) is never touched — ON CONFLICT DO
   *  NOTHING on the way in, and the DELETE below only ever matches rows
   *  this group itself created. */
  async function syncGroupRoleGrants(tenantId: string, groupId: string, memberUserIds: string[]): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const roleLinks = await trx.selectFrom('ondi_org_group_roles').select('role_id').where('group_id', '=', groupId).execute();
      for (const { role_id } of roleLinks) {
        if (memberUserIds.length > 0) {
          await trx.insertInto('ondi_org_role_members')
            .values(memberUserIds.map(user_id => ({
              tenant_id: tenantId, role_id, user_id, granted_by: null, expires_at: null, granted_via_group_id: groupId,
            })))
            .onConflict(oc => oc.columns(['role_id', 'user_id']).doNothing())
            .execute();
        }
        let del = trx.deleteFrom('ondi_org_role_members')
          .where('role_id', '=', role_id).where('granted_via_group_id', '=', groupId);
        if (memberUserIds.length > 0) del = del.where('user_id', 'not in', memberUserIds);
        await del.execute();
      }
    });
  }

  fastify.get('/org/groups', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const groups = await trx.selectFrom('ondi_org_groups').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('name').execute();
      const memberCounts = await trx.selectFrom('ondi_org_group_members').select(['group_id', trx.fn.countAll().as('count')])
        .where('tenant_id', '=', user.tenant_id).groupBy('group_id').execute();
      const roleLinks = await trx.selectFrom('ondi_org_group_roles as gr')
        .innerJoin('ondi_org_roles as r', 'r.id', 'gr.role_id')
        .select(['gr.group_id', 'r.id as role_id', 'r.name as role_name'])
        .where('gr.tenant_id', '=', user.tenant_id).execute();
      return groups.map(g => ({
        ...g,
        member_count: Number(memberCounts.find(m => m.group_id === g.id)?.count ?? 0),
        roles: roleLinks.filter(r => r.group_id === g.id).map(r => ({ id: r.role_id, name: r.role_name })),
      }));
    });
  });

  fastify.get('/org/groups/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const group = await trx.selectFrom('ondi_org_groups').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!group) { reply.status(404); return { error: 'Not found' }; }
      const members = await trx.selectFrom('ondi_org_group_members as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.user_id', 'u.name as user_name', 'u.email as user_email', 'm.source', 'm.added_at'])
        .where('m.group_id', '=', id).orderBy('u.name').execute();
      const roles = await trx.selectFrom('ondi_org_group_roles as gr')
        .innerJoin('ondi_org_roles as r', 'r.id', 'gr.role_id')
        .select(['r.id', 'r.name', 'r.description']).where('gr.group_id', '=', id).execute();
      return { ...group, members, roles };
    });
  });

  fastify.post('/org/groups', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = orgGroupSchema.parse(req.body);
    try {
      const group = await withTenant(user.tenant_id, trx => trx.insertInto('ondi_org_groups').values({
        tenant_id: user.tenant_id, name: body.name, description: body.description ?? null,
        membership_type: body.membership_type, rule: body.rule ? JSON.stringify(body.rule) : null, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow());
      await recordAuthEvent(user.tenant_id, user.sub, 'org_group_created', { metadata: { group_id: group.id, name: group.name } });
      reply.status(201);
      return group;
    } catch (err: any) {
      if (String(err.message || '').includes('unique')) return reply.status(409).send({ error: 'A group with this name already exists.' });
      throw err;
    }
  });

  fastify.patch('/org/groups/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = orgGroupUpdateSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (body.name !== undefined) patch.name = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.membership_type !== undefined) patch.membership_type = body.membership_type;
      if (body.rule !== undefined) patch.rule = JSON.stringify(body.rule);
      const updated = await trx.updateTable('ondi_org_groups').set(patch)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'org_group_updated', { metadata: { group_id: id } });
      return updated;
    });
  });

  fastify.delete('/org/groups/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      // The FK on ondi_org_role_members.granted_via_group_id is ON DELETE
      // CASCADE — deleting the group also revokes every grant it made,
      // in one statement, with no orphaned access left behind.
      const deleted = await trx.deleteFrom('ondi_org_groups').where('id', '=', id).where('tenant_id', '=', user.tenant_id).returning(['id', 'name']).executeTakeFirst();
      if (!deleted) { reply.status(404); return { error: 'Not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'org_group_deleted', { metadata: { group_id: id, name: deleted.name } });
      return { success: true };
    });
  });

  fastify.post('/org/groups/:id/members', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(req.body);
    const memberIds = await withTenant(user.tenant_id, async (trx) => {
      const group = await trx.selectFrom('ondi_org_groups').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!group) return null;
      await trx.insertInto('ondi_org_group_members').values({ tenant_id: user.tenant_id, group_id: id, user_id, source: 'manual' })
        .onConflict(oc => oc.columns(['group_id', 'user_id']).doUpdateSet({ source: 'manual' })).execute();
      const rows = await trx.selectFrom('ondi_org_group_members').select('user_id').where('group_id', '=', id).execute();
      return rows.map(r => r.user_id);
    });
    if (memberIds === null) { reply.status(404); return { error: 'Not found' }; }
    await syncGroupRoleGrants(user.tenant_id, id, memberIds);
    await recordAuthEvent(user.tenant_id, user_id, 'org_group_member_added', { metadata: { group_id: id, added_by: user.sub } });
    return { success: true };
  });

  fastify.delete('/org/groups/:id/members/:userId', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id, userId } = req.params as { id: string; userId: string };
    const memberIds = await withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('ondi_org_group_members').where('group_id', '=', id).where('user_id', '=', userId).where('tenant_id', '=', user.tenant_id).execute();
      const rows = await trx.selectFrom('ondi_org_group_members').select('user_id').where('group_id', '=', id).execute();
      return rows.map(r => r.user_id);
    });
    await syncGroupRoleGrants(user.tenant_id, id, memberIds);
    await recordAuthEvent(user.tenant_id, userId, 'org_group_member_removed', { metadata: { group_id: id, removed_by: user.sub } });
    return { success: true };
  });

  fastify.post('/org/groups/:id/roles', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { role_id } = z.object({ role_id: z.string().uuid() }).parse(req.body);
    const memberIds = await withTenant(user.tenant_id, async (trx) => {
      const group = await trx.selectFrom('ondi_org_groups').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!group) return null;
      await trx.insertInto('ondi_org_group_roles').values({ tenant_id: user.tenant_id, group_id: id, role_id })
        .onConflict(oc => oc.columns(['group_id', 'role_id']).doNothing()).execute();
      const rows = await trx.selectFrom('ondi_org_group_members').select('user_id').where('group_id', '=', id).execute();
      return rows.map(r => r.user_id);
    });
    if (memberIds === null) { reply.status(404); return { error: 'Not found' }; }
    await syncGroupRoleGrants(user.tenant_id, id, memberIds);
    await recordAuthEvent(user.tenant_id, user.sub, 'org_group_role_attached', { metadata: { group_id: id, role_id } });
    reply.status(201);
    return { success: true };
  });

  fastify.delete('/org/groups/:id/roles/:roleId', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id, roleId } = req.params as { id: string; roleId: string };
    await withTenant(user.tenant_id, trx => trx.deleteFrom('ondi_org_group_roles')
      .where('group_id', '=', id).where('role_id', '=', roleId).where('tenant_id', '=', user.tenant_id).execute());
    // The role is no longer attached, so every grant this group made for it
    // should go too — pass an empty member list so syncGroupRoleGrants'
    // DELETE branch clears all of them (roleLinks below no longer includes
    // this role, so nothing re-grants it on the same pass).
    await withTenant(user.tenant_id, trx => trx.deleteFrom('ondi_org_role_members')
      .where('role_id', '=', roleId).where('granted_via_group_id', '=', id).execute());
    await recordAuthEvent(user.tenant_id, user.sub, 'org_group_role_detached', { metadata: { group_id: id, role_id: roleId } });
    return { success: true };
  });

  // Re-evaluates a dynamic group's rule against real user data right now —
  // deliberately on-demand (a button, not a background job on every users
  // write) so this milestone doesn't have to reason about every place a
  // user's role/location can change across the whole platform to stay
  // correct; "stale until you ask" is honest, "silently wrong" would not be.
  fastify.post('/org/groups/:id/recalculate', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.GROUPS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const group = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_org_groups').selectAll()
      .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!group) { reply.status(404); return { error: 'Not found' }; }
    if (group.membership_type !== 'dynamic' || !group.rule) { reply.status(400); return { error: 'Not a dynamic group.' }; }

    const rule = typeof group.rule === 'string' ? JSON.parse(group.rule) : group.rule;
    const matchedUserIds = await evaluateGroupRule(user.tenant_id, rule);

    const memberIds = await withTenant(user.tenant_id, async (trx) => {
      const current = await trx.selectFrom('ondi_org_group_members').select(['user_id', 'source']).where('group_id', '=', id).execute();
      const currentRuleIds = new Set(current.filter(m => m.source === 'rule').map(m => m.user_id));
      const currentManualIds = new Set(current.filter(m => m.source === 'manual').map(m => m.user_id));

      const toAdd = matchedUserIds.filter(uid => !currentRuleIds.has(uid) && !currentManualIds.has(uid));
      const toRemove = [...currentRuleIds].filter(uid => !matchedUserIds.includes(uid));

      if (toAdd.length > 0) {
        await trx.insertInto('ondi_org_group_members').values(toAdd.map(user_id => ({
          tenant_id: user.tenant_id, group_id: id, user_id, source: 'rule',
        }))).onConflict(oc => oc.columns(['group_id', 'user_id']).doNothing()).execute();
      }
      if (toRemove.length > 0) {
        await trx.deleteFrom('ondi_org_group_members').where('group_id', '=', id).where('source', '=', 'rule').where('user_id', 'in', toRemove).execute();
      }
      const rows = await trx.selectFrom('ondi_org_group_members').select('user_id').where('group_id', '=', id).execute();
      return rows.map(r => r.user_id);
    });

    await syncGroupRoleGrants(user.tenant_id, id, memberIds);
    await recordAuthEvent(user.tenant_id, user.sub, 'org_group_recalculated', { metadata: { group_id: id, member_count: memberIds.length } });
    return { member_count: memberIds.length };
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

  // ── Access review campaigns (Ondi M5) ───────────────────────────
  // The sweep-and-reattest counterpart to access-requests above: instead
  // of waiting for someone to ask for a role, a reviewer periodically
  // walks every CURRENT grant and re-confirms it's still warranted.

  fastify.get('/org/access-reviews', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const campaigns = await trx.selectFrom('ondi_access_review_campaigns as c')
        .leftJoin('users as u', 'u.id', 'c.created_by')
        .select(['c.id', 'c.name', 'c.status', 'c.created_at', 'c.completed_at', 'u.name as created_by_name'])
        .orderBy('c.created_at', 'desc')
        .execute();
      if (campaigns.length === 0) return [];

      const ids = campaigns.map(c => c.id);
      const items = await trx.selectFrom('ondi_access_review_items')
        .select(['campaign_id', 'decision'])
        .where('campaign_id', 'in', ids)
        .execute();
      const counts = new Map<string, { total: number; pending: number; approved: number; revoked: number }>();
      for (const it of items) {
        const c = counts.get(it.campaign_id) ?? { total: 0, pending: 0, approved: 0, revoked: 0 };
        c.total++; c[it.decision as 'pending' | 'approved' | 'revoked']++;
        counts.set(it.campaign_id, c);
      }
      return campaigns.map(c => ({ ...c, ...( counts.get(c.id) ?? { total: 0, pending: 0, approved: 0, revoked: 0 }) }));
    });
  });

  // Snapshots every currently-active (non-expired) role grant into a fresh
  // set of review items — the campaign is a point-in-time sweep, not a live
  // view, so a grant made after this only appears in the *next* campaign.
  fastify.post('/org/access-reviews', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = z.object({ name: z.string().trim().min(1).max(160) }).parse(req.body);

    return withTenant(user.tenant_id, async (trx) => {
      const campaign = await trx.insertInto('ondi_access_review_campaigns').values({
        tenant_id: user.tenant_id, name: body.name, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      const grants = await trx.selectFrom('ondi_org_role_members as m')
        .innerJoin('ondi_org_roles as r', 'r.id', 'm.role_id')
        .select(['m.id as role_member_id', 'm.user_id', 'm.role_id', 'r.name as role_name'])
        .where('m.tenant_id', '=', user.tenant_id)
        .where(eb => eb.or([eb('m.expires_at', 'is', null), eb('m.expires_at', '>', new Date())]))
        .execute();

      if (grants.length > 0) {
        await trx.insertInto('ondi_access_review_items').values(
          grants.map(g => ({
            tenant_id: user.tenant_id, campaign_id: campaign.id,
            role_member_id: g.role_member_id, user_id: g.user_id, role_id: g.role_id, role_name: g.role_name,
          })),
        ).execute();
      }

      await recordAuthEvent(user.tenant_id, user.sub, 'access_review_campaign_started', { metadata: { campaign_id: campaign.id, name: campaign.name, item_count: grants.length } });
      reply.status(201);
      return { ...campaign, total: grants.length, pending: grants.length, approved: 0, revoked: 0 };
    });
  });

  fastify.get<{ Params: { id: string } }>('/org/access-reviews/:id', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const campaign = await trx.selectFrom('ondi_access_review_campaigns')
        .selectAll().where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!campaign) { reply.status(404); return { error: 'Campaign not found' }; }

      const items = await trx.selectFrom('ondi_access_review_items as i')
        .innerJoin('users as u', 'u.id', 'i.user_id')
        .leftJoin('users as d', 'd.id', 'i.decided_by')
        .select(['i.id', 'i.role_id', 'i.role_name', 'i.decision', 'i.decided_at', 'i.created_at',
          'i.user_id', 'u.name as user_name', 'u.email as user_email', 'd.name as decided_by_name'])
        .where('i.campaign_id', '=', campaign.id)
        .orderBy('u.name', 'asc')
        .execute();

      return { campaign, items };
    });
  });

  fastify.post<{ Params: { id: string; itemId: string }; Body: { decision: 'approved' | 'revoked' } }>(
    '/org/access-reviews/:id/items/:itemId/decide',
    { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (req, reply) => {
      const user = req.user;
      const body = z.object({ decision: z.enum(['approved', 'revoked']) }).parse(req.body);

      return withTenant(user.tenant_id, async (trx) => {
        const item = await trx.selectFrom('ondi_access_review_items')
          .selectAll()
          .where('id', '=', req.params.itemId).where('campaign_id', '=', req.params.id).where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();
        if (!item) { reply.status(404); return { error: 'Review item not found' }; }

        const updated = await trx.updateTable('ondi_access_review_items')
          .set({ decision: body.decision, decided_by: user.sub, decided_at: new Date() })
          .where('id', '=', item.id)
          .returningAll().executeTakeFirstOrThrow();

        // "Revoked" has a real effect, not just a record — deletes the
        // underlying grant, same as manually removing a role member would.
        if (body.decision === 'revoked' && item.role_member_id) {
          await trx.deleteFrom('ondi_org_role_members').where('id', '=', item.role_member_id).execute();
        }

        await recordAuthEvent(user.tenant_id, item.user_id, body.decision === 'revoked' ? 'access_review_item_revoked' : 'access_review_item_approved',
          { metadata: { campaign_id: req.params.id, item_id: item.id, role_name: item.role_name, decided_by: user.sub } });
        return updated;
      });
    },
  );

  // Bulk variant of the single-item decide route above, for reviewing a
  // whole page of grants at once rather than one click per row.
  fastify.post<{ Params: { id: string }; Body: { item_ids: string[]; decision: 'approved' | 'revoked' } }>(
    '/org/access-reviews/:id/bulk-decide',
    { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (req, reply) => {
      const user = req.user;
      const body = z.object({ item_ids: z.array(z.string().uuid()).min(1).max(500), decision: z.enum(['approved', 'revoked']) }).parse(req.body);

      return withTenant(user.tenant_id, async (trx) => {
        const items = await trx.selectFrom('ondi_access_review_items')
          .selectAll()
          .where('id', 'in', body.item_ids).where('campaign_id', '=', req.params.id).where('tenant_id', '=', user.tenant_id)
          .where('decision', '=', 'pending')
          .execute();
        if (items.length === 0) return { decided: 0 };

        await trx.updateTable('ondi_access_review_items')
          .set({ decision: body.decision, decided_by: user.sub, decided_at: new Date() })
          .where('id', 'in', items.map(i => i.id))
          .execute();

        if (body.decision === 'revoked') {
          const memberIds = items.map(i => i.role_member_id).filter((x): x is string => !!x);
          if (memberIds.length > 0) await trx.deleteFrom('ondi_org_role_members').where('id', 'in', memberIds).execute();
        }

        for (const item of items) {
          await recordAuthEvent(user.tenant_id, item.user_id, body.decision === 'revoked' ? 'access_review_item_revoked' : 'access_review_item_approved',
            { metadata: { campaign_id: req.params.id, item_id: item.id, role_name: item.role_name, decided_by: user.sub, bulk: true } });
        }
        return { decided: items.length };
      });
    },
  );

  fastify.post<{ Params: { id: string } }>('/org/access-reviews/:id/complete', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ACCESS_REVIEWS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('ondi_access_review_campaigns')
        .set({ status: 'completed', completed_at: new Date() })
        .where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id).where('status', '=', 'active')
        .returning(['id', 'name']).executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Campaign not found or already closed' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'access_review_campaign_completed', { metadata: { campaign_id: updated.id, name: updated.name } });
      return { success: true };
    });
  });

  // ── Org-wide Trust (Ondi M6) ─────────────────────────────────────
  // Aggregate over the same per-user formula OneIdPersonal.tsx/OneIdTrust.tsx
  // already show individually — see trust-score.ts's computeOrgTrust().
  fastify.get('/org/trust', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.ORG_TRUST_VIEW, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return computeOrgTrust(user.tenant_id);
  });

  // ── Enterprise Activity feed (Ondi M6) ────────────────────────────
  // ondi_auth_events already existed (M0/M3's hash-chained audit log) but
  // only had a tamper-verify endpoint (/v1/security/audit/verify-chain) —
  // nothing let an admin actually browse it. This is that browsable feed,
  // tenant-wide. Same role gate as the existing /login-history above.
  // ── Automation (Ondi M7) ──────────────────────────────────────────
  // Configuration for subscribers/ondi.subscribers.ts's joiner/leaver
  // rules — the default-role setting lives in tenant_settings (same JSONB
  // blob Session Policy already uses), read directly here rather than
  // through /v1/settings so this page doesn't need its own separate fetch
  // of the whole settings object just for one nested field.
  fastify.get('/org/automation', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.AUTOMATION_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [settingsRow, roles, log] = await Promise.all([
        trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('ondi_org_roles').select(['id', 'name']).where('tenant_id', '=', user.tenant_id).orderBy('name').execute(),
        trx.selectFrom('ondi_automation_log as l')
          .innerJoin('users as u', 'u.id', 'l.user_id')
          .select(['l.id', 'l.rule', 'l.summary', 'l.created_at', 'u.name as user_name'])
          .where('l.tenant_id', '=', user.tenant_id)
          .orderBy('l.created_at', 'desc')
          .limit(100)
          .execute(),
      ]);
      const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      return { default_role_id: settings?.automation?.defaultRoleId ?? null, available_roles: roles, log };
    });
  });

  fastify.patch<{ Body: { default_role_id: string | null } }>('/org/automation', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.AUTOMATION_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({ default_role_id: z.string().uuid().nullable() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = existing ? (typeof existing.settings === 'string' ? JSON.parse(existing.settings) : existing.settings) : {};
      settings.automation = { ...(settings.automation ?? {}), defaultRoleId: body.default_role_id };

      await trx.insertInto('tenant_settings').values({ tenant_id: user.tenant_id, settings: JSON.stringify(settings) })
        .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify(settings) }))
        .execute();
      return { success: true };
    });
  });

  // ── Compliance (Ondi M8) ──────────────────────────────────────────
  fastify.get('/org/compliance', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.COMPLIANCE_REVIEW, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return computeComplianceRollup(user.tenant_id);
  });

  // ── Policies (Ondi M8) — the same tenant_settings.sessionPolicy
  // OneIdSessions.tsx's "Session Policy" card already read/wrote, moved
  // here so it has its own permission gate and its own full page rather
  // than living inside "Sessions & Security". Same storage, same shape.
  fastify.get('/org/policies', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.POLICIES_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      return {
        timeout_minutes: settings?.sessionPolicy?.timeoutMinutes ?? 60,
        mfa_required: !!settings?.sessionPolicy?.mfaRequired,
      };
    });
  });

  fastify.patch<{ Body: { timeout_minutes: number; mfa_required: boolean } }>('/org/policies', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.POLICIES_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({ timeout_minutes: z.number().int().min(5).max(1440), mfa_required: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = existing ? (typeof existing.settings === 'string' ? JSON.parse(existing.settings) : existing.settings) : {};
      settings.sessionPolicy = { timeoutMinutes: body.timeout_minutes, mfaRequired: body.mfa_required };
      await trx.insertInto('tenant_settings').values({ tenant_id: user.tenant_id, settings: JSON.stringify(settings) })
        .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify(settings) }))
        .execute();
      return { success: true };
    });
  });

  // ── Integrations (Ondi M9) ────────────────────────────────────────
  // Governs which apps this tenant has already installed (Store's own
  // store_installed_apps) may actually RECEIVE live domain-event webhooks
  // — tenant_marketplace_installs (migration 156) already existed and
  // domain-events.service.ts already dispatches to it, but nothing ever
  // wrote to it: there was no way for a tenant to turn delivery on for an
  // app they installed. This is that missing write path, not a second
  // app browser (that's Store) — Store owns discovery/installing, this
  // owns "can this installed app actually receive our events."
  fastify.get('/org/integrations', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.INTEGRATIONS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const installed = await trx.selectFrom('store_installed_apps as si')
        .innerJoin('marketplace_apps as a', 'a.id', 'si.app_id')
        .select(['a.id', 'a.name', 'a.developer_name', 'a.category', 'a.icon_url', 'a.webhook_url', 'si.installed_at'])
        .where('si.tenant_id', '=', user.tenant_id)
        .orderBy('a.name')
        .execute();
      if (installed.length === 0) return [];

      const grants = await trx.selectFrom('tenant_marketplace_installs')
        .select(['app_id', 'events_enabled', 'revoked_at', 'installed_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('app_id', 'in', installed.map(a => a.id))
        .execute();
      const grantByApp = new Map(grants.map(g => [g.app_id, g]));

      return installed.map(app => {
        const grant = grantByApp.get(app.id);
        return {
          ...app,
          webhook_capable: !!app.webhook_url,
          events_enabled: !!grant && !grant.revoked_at && grant.events_enabled,
          granted_at: grant && !grant.revoked_at ? grant.installed_at : null,
        };
      });
    });
  });

  fastify.post<{ Params: { appId: string } }>('/org/integrations/:appId/enable', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.INTEGRATIONS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const app = await trx.selectFrom('store_installed_apps as si')
        .innerJoin('marketplace_apps as a', 'a.id', 'si.app_id')
        .select(['a.id', 'a.webhook_url'])
        .where('si.tenant_id', '=', user.tenant_id).where('si.app_id', '=', req.params.appId)
        .executeTakeFirst();
      if (!app) { reply.status(404); return { error: 'Install this app from Store first.' }; }
      if (!app.webhook_url) { reply.status(400); return { error: 'This app has no webhook endpoint to deliver events to.' }; }

      // tenant_marketplace_installs' own uniqueness (migration 156) is a
      // PARTIAL index — unique only among non-revoked rows, precisely so a
      // revoke-then-re-enable can leave the old row as history rather than
      // overwrite it — so a plain ON CONFLICT (tenant_id, app_id) doesn't
      // match it at the Postgres level ("no unique or exclusion constraint
      // matching the ON CONFLICT specification", caught live while testing
      // this exact route). Check-then-branch instead, matching what the
      // partial index actually models: at most one *active* row per app.
      const existing = await trx.selectFrom('tenant_marketplace_installs').select('id')
        .where('tenant_id', '=', user.tenant_id).where('app_id', '=', app.id).where('revoked_at', 'is', null)
        .executeTakeFirst();
      if (existing) {
        await trx.updateTable('tenant_marketplace_installs').set({ events_enabled: true }).where('id', '=', existing.id).execute();
      } else {
        const webhookSecret = crypto.randomBytes(32).toString('hex');
        await trx.insertInto('tenant_marketplace_installs').values({
          tenant_id: user.tenant_id, app_id: app.id, webhook_secret: webhookSecret,
          events_enabled: true, installed_by: user.sub,
        }).execute();
      }
      return { success: true };
    });
  });

  fastify.patch<{ Params: { appId: string }; Body: { events_enabled: boolean } }>('/org/integrations/:appId', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.INTEGRATIONS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = z.object({ events_enabled: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('tenant_marketplace_installs').set({ events_enabled: body.events_enabled })
        .where('tenant_id', '=', user.tenant_id).where('app_id', '=', req.params.appId).where('revoked_at', 'is', null)
        .returning('id').executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Not enabled yet' }; }
      return { success: true };
    });
  });

  fastify.delete<{ Params: { appId: string } }>('/org/integrations/:appId', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.INTEGRATIONS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('tenant_marketplace_installs').set({ revoked_at: new Date() })
        .where('tenant_id', '=', user.tenant_id).where('app_id', '=', req.params.appId).execute();
      return { success: true };
    });
  });

  // ── Visitors (Ondi M9) ─────────────────────────────────────────────
  fastify.get('/org/visitors', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.VISITORS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('ondi_visitors as v')
      .leftJoin('users as h', 'h.id', 'v.host_user_id')
      .select(['v.id', 'v.name', 'v.company', 'v.purpose', 'v.badge_code', 'v.checked_in_at', 'v.checked_out_at', 'v.host_user_id', 'h.name as host_name'])
      .where('v.tenant_id', '=', user.tenant_id)
      .orderBy('v.checked_in_at', 'desc')
      .limit(200)
      .execute());
  });

  fastify.post<{ Body: { name: string; company?: string; purpose?: string; host_user_id?: string } }>('/org/visitors', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.VISITORS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = z.object({
      name: z.string().trim().min(1).max(160),
      company: z.string().trim().max(160).optional(),
      purpose: z.string().trim().max(300).optional(),
      host_user_id: z.string().uuid().optional(),
    }).parse(req.body);

    const badgeCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const created = await withTenant(user.tenant_id, trx => trx.insertInto('ondi_visitors').values({
      tenant_id: user.tenant_id, name: body.name, company: body.company || null, purpose: body.purpose || null,
      host_user_id: body.host_user_id || null, badge_code: badgeCode, created_by: user.sub,
    }).returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return created;
  });

  fastify.post<{ Params: { id: string } }>('/org/visitors/:id/check-out', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.VISITORS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('ondi_visitors').set({ checked_out_at: new Date() })
        .where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id).where('checked_out_at', 'is', null)
        .returning('id').executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Not found or already checked out' }; }
      return { success: true };
    });
  });

  fastify.get('/org/activity', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { limit, format } = req.query as { limit?: string; format?: string };
    // Ondi feature-gap pass (M5): the org activity/audit feed was on-screen
    // only — the fork's own benchmark doc lists CSV export as real. PDF is
    // deliberately dropped from scope: this is already tabular rows, not a
    // layout worth a new PDF dependency for.
    const rowLimit = format === 'csv' ? 2000 : Math.min(Number(limit) || 200, 500);
    const rows = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_auth_events as e')
      .leftJoin('users as u', 'u.id', 'e.user_id')
      .select(['e.id', 'e.event_type', 'e.ip', 'e.user_agent', 'e.metadata', 'e.created_at', 'e.user_id', 'u.name as user_name'])
      .where('e.tenant_id', '=', user.tenant_id)
      .orderBy('e.created_at', 'desc')
      .limit(rowLimit)
      .execute());

    if (format !== 'csv') return rows;

    const lines = ['Timestamp,Event,User,IP,User Agent,Metadata'];
    for (const r of rows) {
      lines.push([
        new Date(r.created_at).toISOString(),
        r.event_type,
        r.user_name ?? '',
        r.ip ?? '',
        r.user_agent ?? '',
        r.metadata ? JSON.stringify(r.metadata) : '',
      ].map(csvCell).join(','));
    }

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="ondi_activity_${new Date().toISOString().slice(0, 10)}.csv"`);
    return lines.join('\n');
  });
}
