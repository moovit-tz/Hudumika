import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';
import { renderContractPdf } from '../services/contract-pdf.service.js';
import { logEvent, notifyRecipients, recipientsToNotify } from '../services/sign-notify.service.js';

// Real Contracts (migration 316) — M2a of the standalone Projects app's
// enterprise-parity program. Tenant-wide visibility for any staff user with
// the 'projects' entitlement (same simple model invoices.routes.ts uses —
// no per-contract ownership/role system the way Projects/Milestones has;
// Contracts is a FinOps-adjacent document, not a collaborative workspace).

const uuidSchema = z.string().uuid();
const CONTRACT_TYPES_SUGGESTED = [
  'Contracts under Seal', 'Implied Contracts', 'Bilateral and Unilateral Contracts',
  'Adhesion Contracts', 'Void and Voidable Contracts',
] as const;

const contractCreateSchema = z.object({
  id: uuidSchema,
  customerId: uuidSchema,
  projectId: uuidSchema.nullable().optional(),
  subject: z.string().trim().min(1).max(500),
  value: z.number().min(0).max(1000000000).nullable().optional(),
  currency: z.string().max(5).optional(),
  type: z.string().max(100).nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().max(20000).optional(),
  content: z.string().max(200000).optional(),
});
const contractPatchSchema = z.object({
  customerId: uuidSchema.optional(),
  projectId: uuidSchema.nullable().optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  value: z.number().min(0).max(1000000000).nullable().optional(),
  currency: z.string().max(5).optional(),
  type: z.string().max(100).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  content: z.string().max(200000).nullable().optional(),
  status: z.enum(['active', 'void']).optional(),
  trashed: z.boolean().optional(),
});
const commentCreateSchema = z.object({ content: z.string().trim().min(1).max(5000) });

export async function contractsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('projects'));

  // ── List + stats + charts ────────────────────────────────────────────
  fastify.get('/', async (request) => {
    const user = request.user;
    const { trash } = request.query as { trash?: string };
    const showTrash = trash === 'true';
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('contracts')
        .leftJoin('customers', 'customers.id', 'contracts.customer_id')
        .leftJoin('projects', 'projects.id', 'contracts.project_id')
        .leftJoin('sign_envelopes', 'sign_envelopes.id', 'contracts.sign_envelope_id')
        .where('contracts.tenant_id', '=', user.tenant_id)
        .where('contracts.deleted_at', showTrash ? 'is not' : 'is', null)
        .select([
          'contracts.id', 'contracts.ref', 'contracts.customer_id', 'contracts.project_id',
          'contracts.subject', 'contracts.value', 'contracts.currency', 'contracts.type',
          'contracts.start_date', 'contracts.end_date', 'contracts.status', 'contracts.sign_envelope_id',
          'contracts.created_at', 'contracts.updated_at',
          'customers.name as customer_name', 'projects.name as project_name',
          // Live-joined, never a stored/synced copy — the envelope's own
          // status is the single source of truth for "is this signed",
          // so there's nothing that can drift out of sync with it.
          'sign_envelopes.status as envelope_status', 'sign_envelopes.completed_at as signed_at',
        ])
        .orderBy('contracts.end_date', 'asc').execute();

      // Stats bar mirrors the reference exactly: Active/Expired/About to
      // Expire (end_date within 30 days)/Recently Added (created in the
      // last 7 days)/Trash — computed live, not stored, since "expired" and
      // "about to expire" are just today() vs end_date, and storing them
      // would drift out of sync with the calendar by the next day.
      const allActive = await trx.selectFrom('contracts')
        .where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .select(['status', 'end_date', 'created_at']).execute();
      const today = new Date().toISOString().slice(0, 10);
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const stats = {
        active: allActive.filter(c => c.status === 'active' && (!c.end_date || c.end_date >= today)).length,
        expired: allActive.filter(c => c.status === 'active' && c.end_date && c.end_date < today).length,
        aboutToExpire: allActive.filter(c => c.status === 'active' && c.end_date && c.end_date >= today && c.end_date <= in30Days).length,
        recentlyAdded: allActive.filter(c => new Date(c.created_at) >= sevenDaysAgo).length,
        trash: await trx.selectFrom('contracts').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is not', null).executeTakeFirst().then(r => Number(r?.c || 0)),
      };

      // Charts: by-type count + value-by-type sum, over active (non-trashed) contracts.
      const byType = new Map<string, { count: number; value: number }>();
      for (const c of rows) {
        const key = c.type || 'Uncategorized';
        const entry = byType.get(key) || { count: 0, value: 0 };
        entry.count += 1;
        entry.value += Number(c.value || 0);
        byType.set(key, entry);
      }

      return {
        data: rows, stats,
        charts: { byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })) },
        suggestedTypes: CONTRACT_TYPES_SUGGESTED,
      };
    });
  });

  fastify.post('/', async (request, reply) => {
    const user = request.user;
    const body = contractCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const customer = await trx.selectFrom('customers').select('id')
        .where('id', '=', body.customerId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });
      const ref = await getNextDocNumber(trx, user.tenant_id, 'contract');
      const row = await trx.insertInto('contracts').values({
        id: body.id, tenant_id: user.tenant_id, ref, customer_id: body.customerId,
        project_id: body.projectId || null, subject: body.subject.trim(),
        value: body.value != null ? String(body.value) : null, currency: body.currency || 'TZS',
        type: body.type || null, start_date: body.startDate || null, end_date: body.endDate || null,
        description: body.description || null, content: body.content || null, owner_id: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: row };
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('contracts')
        .leftJoin('customers', 'customers.id', 'contracts.customer_id')
        .leftJoin('projects', 'projects.id', 'contracts.project_id')
        .leftJoin('sign_envelopes', 'sign_envelopes.id', 'contracts.sign_envelope_id')
        .where('contracts.id', '=', request.params.id).where('contracts.tenant_id', '=', user.tenant_id)
        .selectAll('contracts')
        .select([
          'customers.name as customer_name', 'customers.email as customer_email', 'projects.name as project_name',
          'sign_envelopes.status as envelope_status', 'sign_envelopes.completed_at as signed_at',
        ])
        .executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Contract not found' });
      const renewals = await trx.selectFrom('contract_renewals')
        .innerJoin('users', 'users.id', 'contract_renewals.actor_id')
        .where('contract_id', '=', request.params.id)
        .select(['contract_renewals.id', 'contract_renewals.previous_end_date', 'contract_renewals.new_end_date',
          'contract_renewals.note', 'contract_renewals.created_at', 'users.name as actor_name'])
        .orderBy('contract_renewals.created_at', 'desc').execute();
      return { data: { ...row, renewals } };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const body = contractPatchSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('contracts').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Contract not found' });

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.customerId !== undefined) updates.customer_id = body.customerId;
      if (body.projectId !== undefined) updates.project_id = body.projectId;
      if (body.subject !== undefined) updates.subject = body.subject.trim();
      if (body.value !== undefined) updates.value = body.value != null ? String(body.value) : null;
      if (body.currency !== undefined) updates.currency = body.currency;
      if (body.type !== undefined) updates.type = body.type;
      if (body.startDate !== undefined) updates.start_date = body.startDate || null;
      if (body.endDate !== undefined) updates.end_date = body.endDate || null;
      if (body.description !== undefined) updates.description = body.description;
      if (body.content !== undefined) updates.content = body.content;
      if (body.status !== undefined) updates.status = body.status;
      if (body.trashed !== undefined) updates.deleted_at = body.trashed ? new Date() : null;

      const row = await trx.updateTable('contracts').set(updates)
        .where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow();
      return { data: row };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('contracts').select(['id', 'deleted_at'])
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) { reply.status(204); return null; }
      // Permanent delete only from Trash — matches the reference's
      // Trash-checkbox-then-delete two-step; a single-click delete from the
      // active list would be one accidental click away from data loss.
      if (!existing.deleted_at) {
        return reply.status(409).send({ error: 'Move this contract to Trash first, then delete it permanently.' });
      }
      await trx.deleteFrom('contracts').where('id', '=', request.params.id).execute();
      reply.status(204);
      return null;
    });
  });

  // ── E-signature (M2c) ────────────────────────────────────────────────
  // Reuses the platform's real, already-shipped Sign engine
  // (sign_envelopes/sign_recipients/sign_fields) via the shared helpers
  // sign.routes.ts itself calls (services/sign-notify.service.ts) — not a
  // parallel signing implementation. The generated contract PDF is a
  // programmatically-laid-out document (contract-pdf.service.ts), so a
  // fixed signature-field position is safe to predetermine rather than
  // needing a human to place it in Sign's own field editor.
  fastify.post<{ Params: { id: string } }>('/:id/send-for-signature', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const contract = await trx.selectFrom('contracts')
        .leftJoin('customers', 'customers.id', 'contracts.customer_id')
        .where('contracts.id', '=', request.params.id).where('contracts.tenant_id', '=', user.tenant_id)
        .select(['contracts.id', 'contracts.ref', 'contracts.subject', 'contracts.sign_envelope_id',
          'customers.name as customer_name', 'customers.email as customer_email'])
        .executeTakeFirst();
      if (!contract) return reply.status(404).send({ error: 'Contract not found' });
      if (contract.sign_envelope_id) return reply.status(409).send({ error: 'This contract has already been sent for signature.' });
      if (!contract.customer_email) return reply.status(400).send({ error: 'This customer has no email on file — add one before sending for signature.' });

      const pdfBuffer = await renderContractPdf(user.tenant_id, contract.id);
      const documentData = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

      const envelope = await trx.insertInto('sign_envelopes').values({
        tenant_id: user.tenant_id, created_by: user.sub,
        title: `${contract.ref || 'Contract'} — ${contract.subject}`,
        document_data: documentData, file_name: `${contract.ref || 'contract'}.pdf`,
        order_mode: 'sequential',
      }).returningAll().executeTakeFirstOrThrow();

      const recipient = await trx.insertInto('sign_recipients').values({
        envelope_id: envelope.id, tenant_id: user.tenant_id,
        name: contract.customer_name || 'Customer', email: contract.customer_email, sign_order: 1,
      }).returningAll().executeTakeFirstOrThrow();

      // One default signature field near the bottom of page 1 — the
      // contract PDF's own layout is short and deterministic enough that a
      // fixed position is a reasonable default; a human can still move it
      // in Sign's own envelope editor afterward if needed.
      await trx.insertInto('sign_fields').values({
        envelope_id: envelope.id, tenant_id: user.tenant_id, recipient_id: recipient.id,
        field_type: 'signature', page: 1, x: 0.55, y: 0.85, width: 0.35, height: 0.07, required: true,
      }).execute();

      await logEvent(trx, envelope.id, user.tenant_id, 'created', { actorName: user.name, actorEmail: user.email, note: `Created from contract ${contract.ref || contract.id}` });
      await trx.updateTable('sign_envelopes').set({ status: 'sent', sent_at: new Date() }).where('id', '=', envelope.id).execute();
      await logEvent(trx, envelope.id, user.tenant_id, 'sent', { actorName: user.name, actorEmail: user.email });

      await trx.updateTable('contracts').set({ sign_envelope_id: envelope.id, updated_at: new Date() })
        .where('id', '=', contract.id).execute();

      await notifyRecipients(user.tenant_id, envelope, recipientsToNotify([recipient], 'sequential'), 'invite');

      reply.status(201);
      return { data: { sign_envelope_id: envelope.id, signing_url: `/sign/public/${recipient.token}` } };
    });
  });

  // ── Renewal history ──────────────────────────────────────────────────
  const renewSchema = z.object({ newEndDate: z.string(), note: z.string().max(2000).optional() });
  fastify.post<{ Params: { id: string } }>('/:id/renew', async (request, reply) => {
    const user = request.user;
    const body = renewSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const contract = await trx.selectFrom('contracts').select(['id', 'end_date'])
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!contract) return reply.status(404).send({ error: 'Contract not found' });
      const renewal = await trx.insertInto('contract_renewals').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, contract_id: contract.id, actor_id: user.sub,
        previous_end_date: contract.end_date, new_end_date: body.newEndDate, note: body.note || null,
      }).returningAll().executeTakeFirstOrThrow();
      await trx.updateTable('contracts').set({ end_date: body.newEndDate, updated_at: new Date() })
        .where('id', '=', contract.id).execute();
      reply.status(201);
      return { data: renewal };
    });
  });

  // ── Comments ──────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const exists = await trx.selectFrom('contracts').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!exists) return reply.status(404).send({ error: 'Contract not found' });
      const rows = await trx.selectFrom('contract_comments')
        .innerJoin('users', 'users.id', 'contract_comments.author_id')
        .where('contract_id', '=', request.params.id)
        .select(['contract_comments.id', 'contract_comments.content', 'contract_comments.created_at',
          'contract_comments.author_id', 'users.name as author_name'])
        .orderBy('contract_comments.created_at', 'asc').execute();
      return { data: rows };
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const user = request.user;
    const body = commentCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const exists = await trx.selectFrom('contracts').select('id')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!exists) return reply.status(404).send({ error: 'Contract not found' });
      const row = await trx.insertInto('contract_comments').values({
        id: crypto.randomUUID(), tenant_id: user.tenant_id, contract_id: request.params.id,
        author_id: user.sub, content: body.content.trim(),
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return { data: { ...row, author_name: user.name } };
    });
  });

  // ── PDF ───────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/pdf', async (request, reply) => {
    const user = request.user;
    const exists = await withTenant(user.tenant_id, trx =>
      trx.selectFrom('contracts').select('id').where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!exists) return reply.status(404).send({ error: 'Contract not found' });
    const buffer = await renderContractPdf(user.tenant_id, request.params.id);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="contract-${request.params.id}.pdf"`);
    return reply.send(buffer);
  });
}
