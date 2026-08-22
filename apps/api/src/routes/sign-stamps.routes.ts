// ─── eSign — saved stamps ───────────────────────────────────────────────────
// Prefix: /v1/sign (registered alongside sign.routes.ts, same /v1/sign
// prefix, split into its own file so the already-large sign.routes.ts
// doesn't keep growing with an unrelated concern).
//
// Two kinds of saved stamp, one table (sign_stamps, migration 277):
//   - The tenant's own company stamp — one per tenant, managed from
//     Settings ▸ E-Sign (Settings.tsx's EsignSection).
//   - A person's own personal signature/stamp — any number, managed from
//     their own NexusHR profile (StaffDetail.tsx's Signature tab); a
//     read-only view of someone else's lives at GET /v1/hr/staff/:id/signature.
//
// Access-level gating on *applying* a stamp (M5) and the generic cross-app
// apply endpoint (M6) are separate, later additions on top of this CRUD.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { NotificationService } from '../services/notification.service.js';
import { MailService } from '../services/mail.service.js';
import { SmsIntegration } from '../integrations/sms.js';
import { applyStamp, StampAccessDeniedError } from '../services/stamp.service.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}
function userId(req: FastifyRequest): string {
  return (req.user as { sub: string }).sub;
}
function userRole(req: FastifyRequest): string {
  return (req.user as { role: string }).role;
}
function userName(req: FastifyRequest): string {
  return (req.user as { name?: string }).name ?? 'Someone';
}

function isValidImageDataUrl(s: unknown): s is string {
  return typeof s === 'string' && /^data:image\/(png|jpe?g);base64,/.test(s);
}

// Deliberately a role allow-list in tenant_settings, not the global
// org_permissions resource/action grid (permissions.routes.ts) — that grid's
// fixed RESOURCES list (shipments/clearance/finance/hr/sales/crm/documents/
// reports/settings) has no natural "stamp" slot, and extending a shared,
// platform-wide permission matrix for one app's own access gate is a bigger,
// riskier change than this feature needs. Mirrors the role checks
// notification.service.ts's own MANAGER/FINANCE matrix already uses.
const DEFAULT_STAMP_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'];
const STAMP_SETTINGS_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

async function getStampRoles(trx: Kysely<Database> | Transaction<Database>, tid: string): Promise<string[]> {
  const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tid).executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  const configured = settings?.esign?.stamp_roles;
  return Array.isArray(configured) && configured.length ? configured : DEFAULT_STAMP_ROLES;
}

/** Exported for the M6 generic apply-stamp route to reuse — the exact same
 *  gate, not a second copy that could drift. */
export async function canApplyTenantStamp(trx: Kysely<Database> | Transaction<Database>, tid: string, role: string): Promise<boolean> {
  const roles = await getStampRoles(trx, tid);
  return roles.includes(role);
}

export async function signStampsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('sign'));

  // ── Tenant (company) stamp — one slot per tenant ───────────────────────────
  fastify.get('/stamps/tenant', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const stamp = await trx.selectFrom('sign_stamps').selectAll()
        .where('tenant_id', '=', tid).where('owner_type', '=', 'tenant').executeTakeFirst();
      return reply.send(stamp ?? null);
    });
  });

  fastify.put('/stamps/tenant', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { image_data?: string; label?: string };
    if (!isValidImageDataUrl(body.image_data)) {
      return reply.status(400).send({ error: 'A real signature/stamp image is required' });
    }
    return withTenant(tid, async (trx) => {
      const existing = await trx.selectFrom('sign_stamps').select('id')
        .where('tenant_id', '=', tid).where('owner_type', '=', 'tenant').executeTakeFirst();
      const row = existing
        ? await trx.updateTable('sign_stamps').set({ image_data: body.image_data!, label: body.label ?? null })
            .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('sign_stamps').values({
            tenant_id: tid, owner_type: 'tenant', owner_user_id: null,
            image_data: body.image_data!, label: body.label ?? null, created_by: uid,
          }).returningAll().executeTakeFirstOrThrow();
      return reply.send(row);
    });
  });

  fastify.delete('/stamps/tenant', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      await trx.deleteFrom('sign_stamps').where('tenant_id', '=', tid).where('owner_type', '=', 'tenant').execute();
      return reply.send({ ok: true });
    });
  });

  // ── Personal stamps — any number, self-managed ─────────────────────────────
  fastify.get('/stamps/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    return withTenant(tid, async (trx) => {
      const stamps = await trx.selectFrom('sign_stamps').selectAll()
        .where('tenant_id', '=', tid).where('owner_type', '=', 'user').where('owner_user_id', '=', uid)
        .orderBy('created_at', 'desc').execute();
      return reply.send(stamps);
    });
  });

  fastify.post('/stamps/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { image_data?: string; label?: string };
    if (!isValidImageDataUrl(body.image_data)) {
      return reply.status(400).send({ error: 'A real signature/stamp image is required' });
    }
    return withTenant(tid, async (trx) => {
      const row = await trx.insertInto('sign_stamps').values({
        tenant_id: tid, owner_type: 'user', owner_user_id: uid,
        image_data: body.image_data!, label: body.label ?? null, created_by: uid,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  fastify.delete('/stamps/mine/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    return withTenant(tid, async (trx) => {
      const result = await trx.deleteFrom('sign_stamps')
        .where('id', '=', req.params.id).where('tenant_id', '=', tid)
        .where('owner_type', '=', 'user').where('owner_user_id', '=', uid)
        .executeTakeFirst();
      if (!result.numDeletedRows) return reply.status(404).send({ error: 'Stamp not found' });
      return reply.send({ ok: true });
    });
  });

  // ── Access gate ─────────────────────────────────────────────────────────────
  fastify.get('/stamps/access', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const stampRoles = await getStampRoles(trx, tid);
      return reply.send({ allowed: stampRoles.includes(userRole(req)), stampRoles });
    });
  });

  fastify.put('/stamps/access', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    if (!STAMP_SETTINGS_ADMIN_ROLES.includes(userRole(req))) {
      return reply.status(403).send({ error: 'Only an admin can change who has stamp access' });
    }
    const body = req.body as { stamp_roles?: string[] };
    if (!Array.isArray(body.stamp_roles) || !body.stamp_roles.length) {
      return reply.status(400).send({ error: 'At least one role must have stamp access' });
    }
    return withTenant(tid, async (trx) => {
      const existing = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tid).executeTakeFirst();
      const settings = existing ? (typeof existing.settings === 'string' ? JSON.parse(existing.settings) : existing.settings) : {};
      settings.esign = { ...settings.esign, stamp_roles: body.stamp_roles };
      if (existing) {
        await trx.updateTable('tenant_settings').set({ settings: JSON.stringify(settings) }).where('tenant_id', '=', tid).execute();
      } else {
        await trx.insertInto('tenant_settings').values({ tenant_id: tid, settings: JSON.stringify(settings) }).execute();
      }
      return reply.send({ stamp_roles: body.stamp_roles });
    });
  });

  // ── Stamp requests — for someone whose role doesn't clear the gate ─────────
  fastify.post('/stamp-requests', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { approver_id?: string; target_type?: string; target_ref?: string; note?: string };
    if (!body.approver_id) return reply.status(400).send({ error: 'Tag who should approve this request' });

    return withTenant(tid, async (trx) => {
      const approver = await trx.selectFrom('users').select(['id', 'name', 'email', 'phone'])
        .where('id', '=', body.approver_id!).where('tenant_id', '=', tid).executeTakeFirst();
      if (!approver) return reply.status(404).send({ error: 'That person was not found in this workspace' });

      const row = await trx.insertInto('sign_stamp_requests').values({
        tenant_id: tid, requested_by: uid, approver_id: approver.id,
        target_type: body.target_type ?? null, target_ref: body.target_ref ?? null, note: body.note ?? null,
      }).returningAll().executeTakeFirstOrThrow();

      const title = `Stamp request from ${userName(req)}`;
      const message = body.note || body.target_ref || 'Requesting the company stamp be applied to a document.';
      await NotificationService.createNotification({
        tenantId: tid, userId: approver.id, app: 'sign', type: 'task', title, message,
        link: '/workspace/settings?s=other-esign', entityType: 'sign_stamp_request', entityId: row.id,
      }).catch(err => console.error('[Sign] Failed to notify stamp-request approver:', err.message));
      await MailService.sendNow(tid, {
        to: approver.email, subject: title,
        bodyHtml: `<p>Hi ${approver.name},</p><p>${userName(req)} is requesting the company stamp for: <strong>${message}</strong></p>`,
        sourceApp: 'sign',
      }).catch(err => console.error('[Sign] Failed to email stamp-request approver:', err.message));
      if (approver.phone) {
        await SmsIntegration.sendSms(tid, approver.phone, `${userName(req)} is requesting the company stamp: ${message}`).catch(err => {
          console.error('[Sign] Failed to SMS stamp-request approver:', err.message);
        });
      }

      return reply.status(201).send(row);
    });
  });

  fastify.get('/stamp-requests', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const { box } = req.query as { box?: 'incoming' | 'mine' };
    return withTenant(tid, async (trx) => {
      let q = trx.selectFrom('sign_stamp_requests').selectAll().where('tenant_id', '=', tid);
      q = box === 'mine' ? q.where('requested_by', '=', uid) : q.where('approver_id', '=', uid);
      const rows = await q.orderBy('created_at', 'desc').execute();
      return reply.send(rows);
    });
  });

  fastify.post('/stamp-requests/:id/decide', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { decision?: 'approved' | 'declined'; note?: string };
    if (body.decision !== 'approved' && body.decision !== 'declined') {
      return reply.status(400).send({ error: 'decision must be approved or declined' });
    }
    return withTenant(tid, async (trx) => {
      const request = await trx.selectFrom('sign_stamp_requests').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!request) return reply.status(404).send({ error: 'Request not found' });
      if (request.approver_id !== uid) return reply.status(403).send({ error: 'Only the tagged approver can decide this request' });
      if (request.status !== 'pending') return reply.status(409).send({ error: 'This request has already been decided' });

      const updated = await trx.updateTable('sign_stamp_requests')
        .set({ status: body.decision, decision_note: body.note ?? null, decided_at: new Date() })
        .where('id', '=', req.params.id).returningAll().executeTakeFirstOrThrow();

      const requester = await trx.selectFrom('users').select(['name', 'email']).where('id', '=', request.requested_by).executeTakeFirst();
      const title = body.decision === 'approved' ? 'Your stamp request was approved' : 'Your stamp request was declined';
      await NotificationService.createNotification({
        tenantId: tid, userId: request.requested_by, app: 'sign', type: body.decision === 'approved' ? 'success' : 'info',
        title, message: body.note ?? undefined, entityType: 'sign_stamp_request', entityId: request.id,
      }).catch(err => console.error('[Sign] Failed to notify stamp requester of decision:', err.message));
      if (requester?.email) {
        await MailService.sendNow(tid, { to: requester.email, subject: title, bodyHtml: `<p>${title}${body.note ? `: ${body.note}` : '.'}</p>`, sourceApp: 'sign' })
          .catch(err => console.error('[Sign] Failed to email stamp requester of decision:', err.message));
      }

      return reply.send(updated);
    });
  });

  // ── Generic cross-app apply ─────────────────────────────────────────────────
  // Callable from any app/tenant that needs "put our stamp on this PDF" —
  // e.g. FinOps' invoice "Sign & Stamp" action (invoice-pdf.service.ts +
  // CustomerInvoices.tsx). Never trusts a client-side "I'm allowed" flag —
  // applyStamp() re-checks the role gate itself, from this same request's
  // own authenticated user.
  fastify.post('/stamps/apply', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      pdf_data?: string;
      position?: { page?: number; x: number; y: number; width: number; height: number };
      owner_type?: 'tenant' | 'user';
      owner_user_id?: string;
    };
    if (!body.pdf_data || !body.position || !body.owner_type) {
      return reply.status(400).send({ error: 'pdf_data, position and owner_type are required' });
    }
    const pdfMatch = body.pdf_data.match(/^data:application\/pdf;base64,(.+)$/);
    const pdfBytes = Buffer.from(pdfMatch ? pdfMatch[1] : body.pdf_data, 'base64');

    try {
      const stamped = await applyStamp({
        tenantId: tenantId(req), userId: userId(req), userRole: userRole(req),
        pdfBytes, position: body.position, ownerType: body.owner_type, ownerUserId: body.owner_user_id,
      });
      return reply.send({ pdf_data: `data:application/pdf;base64,${stamped.toString('base64')}` });
    } catch (err) {
      if (err instanceof StampAccessDeniedError) return reply.status(403).send({ error: err.message });
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
