import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { applyAutoAssignRules, fireNotificationTrigger } from './support.routes.js';
import type { OrgJWTPayload, TicketPriority } from '@hudumika/types';

// Mirrors support.routes.ts's own SLA_HOURS — not exported from there (a
// module-private const), small enough to duplicate rather than couple the
// two files over one lookup table.
const SLA_HOURS: Record<TicketPriority, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, MEDIUM: 24, LOW: 48 };

// Same recipient set support.routes.ts's own MGMT_ROLES notifies for a new
// ticket — a new cross-tenant dispatch request is the SEAL equivalent of
// "someone outside your staff just created new work", so it goes to the same
// role tier rather than inventing a second notion of "who manages this".
const SEAL_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

/**
 * The cross-tenant read surface for an 'ORG'-role login (migration 230) —
 * "one login, every shipment across every agent handling them." Both routes
 * here are the only ones an ORG token may ever reach (see ORG_ALLOWED_ROUTES
 * in middleware/auth.ts); everything else 403s before this file is touched.
 *
 * `request.user` stays declared as JWTPayload everywhere in this codebase
 * (see the comment above ORG_ALLOWED_ROUTES) — an org token's real decoded
 * shape is OrgJWTPayload, not JWTPayload. The cast below is the one place
 * that's true, justified by the same guarantee: only a genuinely 'ORG'-role
 * token can reach this route at all.
 */
function orgUser(req: any): OrgJWTPayload {
  return req.user as OrgJWTPayload;
}

/** Every (tenant, customer) pair this organization has been linked to —
 *  the fan-out list every /v1/org/* aggregation below starts from. */
function getLinkedTenants(orgId: string) {
  return db.selectFrom('customers')
    .innerJoin('tenants', 'tenants.id', 'customers.tenant_id')
    .select(['customers.tenant_id', 'customers.id as customer_id', 'tenants.name as tenant_name'])
    .where('customers.organization_id', '=', orgId)
    .execute();
}

export async function orgRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/org/workspaces — any tenant that has self-declared this same
  // Organization as its own identity (tenants.organization_id, set from that
  // tenant's own Workspace ▸ Settings ▸ Company Information — self-service,
  // unlike customers.organization_id, since a tenant admin describing their
  // own company carries no cross-tenant claim). Distinct from /customers:
  // this is "you also run a workspace here", not "you're a client of one".
  fastify.get('/workspaces', async (req) => {
    const user = orgUser(req);
    return db.selectFrom('tenants')
      .select(['id as tenant_id', 'name as tenant_name', 'slug'])
      .where('organization_id', '=', user.org_id)
      .orderBy('name')
      .execute();
  });

  // GET /v1/org/customers — every tenant this organization has been linked
  // to as a customer, staff-initiated only (see organizations.routes.ts).
  fastify.get('/customers', async (req) => {
    const user = orgUser(req);
    return db.selectFrom('customers')
      .innerJoin('tenants', 'tenants.id', 'customers.tenant_id')
      .select([
        'customers.id as customer_id', 'customers.name as customer_name',
        'customers.account_status',
        'tenants.id as tenant_id', 'tenants.name as tenant_name',
      ])
      .where('customers.organization_id', '=', user.org_id)
      .orderBy('tenants.name')
      .execute();
  });

  // POST /v1/org/claim — redeem a one-time code (migration 231) issued by a
  // tenant's staff to self-service-link this organization to one customer
  // record, without staff having to proactively go find and link it first.
  // The code is only ever delivered to that customer's own registered
  // email/WhatsApp (see customers.routes.ts POST /:id/claim-code) — this
  // route only ever trusts possession of the code itself, never anything
  // the org asserts about who it is.
  fastify.post('/claim', async (req, reply) => {
    const user = orgUser(req);
    const code = (req.body as { code?: string }).code?.trim();
    if (!code) return reply.status(400).send({ error: 'A code is required' });

    const claim = await db.selectFrom('customer_claim_codes').selectAll()
      .where('token', '=', code).executeTakeFirst();
    if (!claim) return reply.status(400).send({ error: 'Invalid code' });
    if (claim.used_at) return reply.status(400).send({ error: 'This code has already been used' });
    if (claim.expires_at.getTime() < Date.now()) return reply.status(400).send({ error: 'This code has expired' });

    return withTenant(claim.tenant_id, async trx => {
      const customer = await trx.updateTable('customers')
        .set({ organization_id: user.org_id, updated_at: new Date() })
        .where('id', '=', claim.customer_id).where('tenant_id', '=', claim.tenant_id)
        .returningAll().executeTakeFirst();
      if (!customer) return reply.status(404).send({ error: 'Customer no longer exists' });

      await trx.updateTable('customer_claim_codes')
        .set({ used_at: new Date(), used_by_org_id: user.org_id })
        .where('id', '=', claim.id).execute();

      return { linked: true, customer_name: customer.name };
    });
  });

  // GET /v1/org/shipments — every shipment across every linked tenant,
  // tagged with which one handled it. A real customer is linked to a
  // handful of agents, not the whole platform, so one withTenant() call per
  // linked tenant (small, bounded fan-out) keeps this inside the same
  // tenant-scoping discipline as every other customer-facing route, rather
  // than the platform-operator-only "plain db, no filter" style
  // superadmin.routes.ts uses for its whole-platform aggregation.
  fastify.get('/shipments', async (req) => {
    const user = orgUser(req);
    const links = await getLinkedTenants(user.org_id);
    if (links.length === 0) return { data: [] };

    const perTenant = await Promise.all(links.map(link =>
      withTenant(link.tenant_id, trx =>
        trx.selectFrom('shipment_cases')
          .selectAll()
          .where('tenant_id', '=', link.tenant_id)
          .where('customer_id', '=', link.customer_id)
          .where('deleted_at', 'is', null)
          .orderBy('created_at', 'desc')
          .execute()
      ).then(rows => rows.map(r => ({ ...r, tenant_name: link.tenant_name })))
    ));

    return { data: perTenant.flat() };
  });

  // GET /v1/org/invoices — same fan-out shape as /shipments. Each invoice
  // carries its line items (as `items`) the same way GET /v1/invoices does,
  // since the frontend's invoiceTotals() helper needs them to compute a
  // grand total — not selectable from sales_invoices alone.
  fastify.get('/invoices', async (req) => {
    const user = orgUser(req);
    const links = await getLinkedTenants(user.org_id);
    if (links.length === 0) return { data: [] };

    const perTenant = await Promise.all(links.map(link =>
      withTenant(link.tenant_id, async trx => {
        const rows = await trx.selectFrom('sales_invoices').selectAll()
          .where('tenant_id', '=', link.tenant_id)
          .where('customer_id', '=', link.customer_id)
          .orderBy('created_at', 'desc')
          .execute();
        const ids = rows.map(r => r.id);
        const lines = ids.length > 0
          ? await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', 'in', ids).orderBy('sort_order', 'asc').execute()
          : [];
        const linesByInvoice = new Map<string, typeof lines>();
        for (const l of lines) {
          const arr = linesByInvoice.get(l.invoice_id) ?? [];
          arr.push(l);
          linesByInvoice.set(l.invoice_id, arr);
        }
        return rows.map(r => ({ ...r, items: linesByInvoice.get(r.id) ?? [], tenant_name: link.tenant_name }));
      })
    ));

    return { data: perTenant.flat() };
  });

  // GET /v1/org/documents — files a tenant's staff have linked to this
  // organization's customer record there (see the entity_type/entity_id
  // pattern on cloud_files, migration 229), fanned out the same way. Also
  // includes files linked to that customer's own shipments, same reasoning
  // as the direct-customer-login fix in files.routes.ts GET / — an org is
  // the same underlying customer, just viewed cross-tenant.
  fastify.get('/documents', async (req) => {
    const user = orgUser(req);
    const links = await getLinkedTenants(user.org_id);
    if (links.length === 0) return { data: [] };

    const perTenant = await Promise.all(links.map(link =>
      withTenant(link.tenant_id, async trx => {
        const shipmentIds = (await trx.selectFrom('shipment_cases').select('id')
          .where('tenant_id', '=', link.tenant_id).where('customer_id', '=', link.customer_id).execute()).map(s => s.id);
        return trx.selectFrom('cloud_files').selectAll()
          .where('tenant_id', '=', link.tenant_id)
          .where('is_trash', '=', false)
          .where(eb => eb.or([
            eb.and([eb('entity_type', '=', 'customer'), eb('entity_id', '=', link.customer_id)]),
            ...(shipmentIds.length > 0 ? [eb.and([eb('entity_type', '=', 'shipment'), eb('entity_id', 'in', shipmentIds)])] : []),
            // A file explicitly shared with this organization (migration
            // 233) — read-only; the org portal never gets share-editing
            // rights, only files.routes.ts (direct customer + staff) does.
            eb('id', 'in', eb.selectFrom('cloud_file_shares').select('file_id')
              .where('principal_type', '=', 'organization').where('principal_id', '=', user.org_id)),
          ]))
          .orderBy('created_at', 'desc')
          .execute();
      }).then(rows => rows.map(r => ({ ...r, tenant_id: link.tenant_id, tenant_name: link.tenant_name })))
    ));

    return { data: perTenant.flat() };
  });

  // GET /v1/org/documents/:id/download?tenant_id= — tenant_id is required
  // (unlike the CUSTOMER-role download, a single file id isn't unique across
  // every tenant an org is linked to) and is verified against this org's own
  // linked-tenant list, then the file's ownership is verified within that
  // tenant — an org can never download a file it isn't actually linked to.
  fastify.get('/documents/:id/download', async (req, reply) => {
    const user = orgUser(req);
    const { id } = req.params as { id: string };
    const { tenant_id } = req.query as { tenant_id?: string };
    if (!tenant_id) return reply.status(400).send({ error: 'tenant_id is required' });

    const links = await getLinkedTenants(user.org_id);
    const link = links.find(l => l.tenant_id === tenant_id);
    if (!link) return reply.status(404).send({ error: 'Not found' });

    return withTenant(tenant_id, async trx => {
      const file = await trx.selectFrom('cloud_files').selectAll()
        .where('id', '=', id).where('tenant_id', '=', tenant_id).executeTakeFirst();
      const isOwnFile = file?.entity_type === 'customer' && file.entity_id === link.customer_id;
      const isOwnShipmentDoc = file?.entity_type === 'shipment' && await trx.selectFrom('shipment_cases').select('id')
        .where('id', '=', file.entity_id!).where('tenant_id', '=', tenant_id).where('customer_id', '=', link.customer_id).executeTakeFirst();
      const isSharedWithOrg = file && await trx.selectFrom('cloud_file_shares').select('id')
        .where('file_id', '=', id).where('principal_type', '=', 'organization').where('principal_id', '=', user.org_id).executeTakeFirst();
      if (!file || !file.storage_key || (!isOwnFile && !isOwnShipmentDoc && !isSharedWithOrg)) {
        return reply.status(404).send({ error: 'File content not available' });
      }
      const buf = MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      reply.header('Content-Disposition', `attachment; filename="${file.name.replace(/"/g, '')}"`);
      reply.header('Content-Type', file.mime_type || 'application/octet-stream');
      return reply.send(buf);
    });
  });

  // GET /v1/org/tickets — same fan-out shape as the others, over
  // support_tickets. No thread/messages here (that's per-ticket, fetched on
  // open — see GET /tickets/:id below), just enough to render a list.
  fastify.get('/tickets', async (req) => {
    const user = orgUser(req);
    const links = await getLinkedTenants(user.org_id);
    if (links.length === 0) return { data: [] };

    const perTenant = await Promise.all(links.map(link =>
      withTenant(link.tenant_id, trx =>
        trx.selectFrom('support_tickets')
          .select(['id', 'ref_number as ref', 'subject', 'description', 'status', 'priority', 'category', 'created_at', 'updated_at'])
          .where('tenant_id', '=', link.tenant_id)
          .where('customer_id', '=', link.customer_id)
          .orderBy('created_at', 'desc')
          .execute()
      ).then(rows => rows.map(r => ({ ...r, tenant_id: link.tenant_id, tenant_name: link.tenant_name })))
    ));

    return { data: perTenant.flat() };
  });

  // POST /v1/org/tickets?tenant_id= — open a new ticket with one of this
  // org's linked agents. tenant_id must be one of them; customer_id is
  // always the org's own linked customer row there, never caller-supplied.
  fastify.post('/tickets', async (req, reply) => {
    const user = orgUser(req);
    const { tenant_id } = req.query as { tenant_id?: string };
    if (!tenant_id) return reply.status(400).send({ error: 'tenant_id is required' });
    const links = await getLinkedTenants(user.org_id);
    const link = links.find(l => l.tenant_id === tenant_id);
    if (!link) return reply.status(404).send({ error: 'Not linked to this agent' });

    const b = req.body as { subject?: string; description?: string; category?: string; priority?: TicketPriority };
    if (!b.subject?.trim()) return reply.status(400).send({ error: 'Subject is required' });
    const priority = b.priority ?? 'NORMAL';

    return withTenant(tenant_id, async trx => {
      const slaDeadline = new Date(Date.now() + SLA_HOURS[priority] * 3600_000);
      let ticket = await trx.insertInto('support_tickets').values({
        tenant_id, customer_id: link.customer_id,
        ref_number: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
        subject: b.subject!.trim(), description: b.description || null,
        channel: 'IN_APP', priority, category: b.category || 'Other',
        status: 'OPEN', tags: JSON.stringify([]), sla_deadline: slaDeadline,
      }).returningAll().executeTakeFirstOrThrow();

      const assignedTo = await applyAutoAssignRules(trx, tenant_id, ticket);
      if (assignedTo) ticket = { ...ticket, assigned_to: assignedTo };
      await fireNotificationTrigger(trx, tenant_id, 'new_ticket', ticket);

      reply.status(201);
      return { ...ticket, tenant_name: link.tenant_name };
    });
  });

  // GET /v1/org/tickets/:id?tenant_id= — full thread. tenant_id is required
  // and cross-checked the same way as the document download above: an org
  // can only ever read a ticket that both (a) belongs to one of its linked
  // tenants and (b) is actually filed under its own customer_id there.
  fastify.get('/tickets/:id', async (req, reply) => {
    const user = orgUser(req);
    const { id } = req.params as { id: string };
    const { tenant_id } = req.query as { tenant_id?: string };
    if (!tenant_id) return reply.status(400).send({ error: 'tenant_id is required' });
    const links = await getLinkedTenants(user.org_id);
    const link = links.find(l => l.tenant_id === tenant_id);
    if (!link) return reply.status(404).send({ error: 'Not found' });

    return withTenant(tenant_id, async trx => {
      const ticket = await trx.selectFrom('support_tickets')
        .select(['id', 'ref_number as ref', 'subject', 'description', 'status', 'priority', 'category', 'customer_id', 'tenant_id', 'created_at', 'updated_at'])
        .where('id', '=', id).where('tenant_id', '=', tenant_id).executeTakeFirst();
      if (!ticket || ticket.customer_id !== link.customer_id) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }
      const messages = await trx.selectFrom('support_messages').selectAll()
        .where('ticket_id', '=', ticket.id).where('tenant_id', '=', tenant_id)
        .orderBy('created_at', 'asc').execute();
      return { ...ticket, tenant_name: link.tenant_name, messages };
    });
  });

  // POST /v1/org/tickets/:id/reply?tenant_id= — an org-authored reply.
  // Deliberately separate from support.routes.ts's staff dispatchOutbound
  // (external channel send, author_type 'OFFICER') and its own
  // customer-reply route (single-tenant, resolveCustomerId-scoped) — this
  // one needs the same explicit tenant_id + linked-tenant check as every
  // other org route, since an org token has no tenant_id claim to infer it from.
  fastify.post('/tickets/:id/reply', async (req, reply) => {
    const user = orgUser(req);
    const { id } = req.params as { id: string };
    const { tenant_id } = req.query as { tenant_id?: string };
    if (!tenant_id) return reply.status(400).send({ error: 'tenant_id is required' });
    const content = (req.body as { content?: string }).content?.trim();
    if (!content) return reply.status(400).send({ error: 'Message is required' });

    const links = await getLinkedTenants(user.org_id);
    const link = links.find(l => l.tenant_id === tenant_id);
    if (!link) return reply.status(404).send({ error: 'Not found' });

    return withTenant(tenant_id, async trx => {
      const ticket = await trx.selectFrom('support_tickets')
        .select(['id', 'ref_number', 'subject', 'customer_id', 'assigned_to'])
        .where('id', '=', id).where('tenant_id', '=', tenant_id).executeTakeFirst();
      if (!ticket || ticket.customer_id !== link.customer_id) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const message = await trx.insertInto('support_messages').values({
        tenant_id, ticket_id: ticket.id, channel: 'IN_APP', direction: 'INBOUND',
        author_id: user.sub, author_name: user.name, author_type: 'ORG', content,
      }).returningAll().executeTakeFirstOrThrow();

      if (ticket.assigned_to) {
        await trx.insertInto('notifications').values({
          tenant_id, user_id: ticket.assigned_to, app: 'bliss', type: 'support',
          title: `New reply on ${ticket.ref_number}`, message: content.slice(0, 200),
          link: `/bliss/tickets?id=${ticket.id}`, metadata: '{}',
          entity_type: 'support_ticket', entity_id: ticket.id, entity_label: ticket.subject,
          shipment_id: null, customer_id: link.customer_id, trigger_type: null,
          channel: null, recipient: null, content: null,
        } as any).execute();
      }

      await trx.updateTable('support_tickets').set({ updated_at: new Date() }).where('id', '=', ticket.id).execute();
      return message;
    });
  });

  // GET /v1/org/seal-lots — same fan-out shape as the others, over SEAL's
  // seal_lots. Read-only: an org session never writes to SEAL's own tables
  // (see seal-dispatch-requests's own routes below) — this only lets an org
  // see goods it owns sitting in a warehouse tenant it's linked to.
  fastify.get('/seal-lots', async (req) => {
    const user = orgUser(req);
    const links = await getLinkedTenants(user.org_id);
    if (links.length === 0) return { data: [] };

    const perTenant = await Promise.all(links.map(link =>
      withTenant(link.tenant_id, trx =>
        trx.selectFrom('seal_lots')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_lots.compartment_id')
          .select([
            'seal_lots.id', 'seal_lots.description', 'seal_lots.hs_code', 'seal_lots.customs_status',
            'seal_lots.qty_on_hand', 'seal_lots.qty_allocated', 'seal_lots.uom',
            'seal_lots.batch', 'seal_lots.serial', 'seal_lots.created_at',
            'seal_compartments.name as compartment_name',
          ])
          .where('seal_lots.tenant_id', '=', link.tenant_id)
          .where('seal_lots.owner_id', '=', link.customer_id)
          .orderBy('seal_lots.created_at', 'desc')
          .execute()
      ).then(rows => rows.map(r => ({ ...r, tenant_id: link.tenant_id, tenant_name: link.tenant_name })))
    ));

    return { data: perTenant.flat() };
  });

  // POST /v1/org/seal-lots/:lotId/dispatch-request?tenant_id= — an org can
  // never write to seal_lots/seal_fulfillment_orders directly; this only
  // ever creates a same-tenant-owned request row (migration 232) that the
  // warehouse tenant's own staff act on (seal-fulfillment.routes.ts
  // GET/PATCH /dispatch-requests) through the existing, already-proven
  // fulfillment-order insert path. Same tenant_id-required-and-cross-checked
  // pattern as the document download / ticket routes above.
  fastify.post('/seal-lots/:lotId/dispatch-request', async (req, reply) => {
    const user = orgUser(req);
    const { lotId } = req.params as { lotId: string };
    const { tenant_id } = req.query as { tenant_id?: string };
    if (!tenant_id) return reply.status(400).send({ error: 'tenant_id is required' });
    const b = req.body as { qty?: number; note?: string };
    if (typeof b.qty !== 'number' || b.qty <= 0) return reply.status(400).send({ error: 'A positive qty is required' });

    const links = await getLinkedTenants(user.org_id);
    const link = links.find(l => l.tenant_id === tenant_id);
    if (!link) return reply.status(404).send({ error: 'Not linked to this warehouse' });

    const org = await db.selectFrom('organizations').select('name').where('id', '=', user.org_id).executeTakeFirst();

    return withTenant(tenant_id, async trx => {
      const lot = await trx.selectFrom('seal_lots').select(['id', 'owner_id', 'qty_on_hand', 'description'])
        .where('id', '=', lotId).where('tenant_id', '=', tenant_id).executeTakeFirst();
      if (!lot || lot.owner_id !== link.customer_id) return reply.status(404).send({ error: 'Lot not found' });
      if (b.qty! > Number(lot.qty_on_hand)) {
        return reply.status(422).send({ error: `Requested qty (${b.qty}) exceeds qty on hand (${lot.qty_on_hand}) for this lot.` });
      }

      const row = await trx.insertInto('seal_dispatch_requests').values({
        tenant_id, lot_id: lotId, requested_by_org_id: user.org_id,
        qty_requested: String(b.qty), note: b.note?.trim() || null,
      }).returningAll().executeTakeFirstOrThrow();

      // Nothing else prompts a warehouse tenant's staff to look at this new
      // request — unlike the fulfillment orders they create themselves, this
      // one originates outside their own staff activity entirely.
      const managers = await trx.selectFrom('users').select('id')
        .where('tenant_id', '=', tenant_id).where('role', 'in', SEAL_MGMT_ROLES).execute();
      for (const m of managers) {
        await trx.insertInto('notifications').values({
          tenant_id, user_id: m.id, app: 'seal', type: 'seal_dispatch_request',
          title: `${org?.name ?? 'An organization'} requested dispatch of ${b.qty} ${lot.description}`,
          message: b.note?.trim() || null,
          link: '/seal/dispatch-requests', metadata: '{}',
          entity_type: 'seal_dispatch_request', entity_id: row.id, entity_label: lot.description,
          shipment_id: null, customer_id: link.customer_id, trigger_type: null,
          channel: null, recipient: null, content: null,
        } as any).execute();
      }

      return { ...row, tenant_name: link.tenant_name };
    });
  });

  // GET /v1/org/dispatch-requests — every dispatch request this org has
  // filed, across every linked tenant, so it can check the status of a
  // request instead of it disappearing into a black hole after submission.
  // Same fan-out shape as every other /v1/org/* list.
  fastify.get('/dispatch-requests', async (req) => {
    const user = orgUser(req);
    const links = await getLinkedTenants(user.org_id);
    if (links.length === 0) return { data: [] };

    const perTenant = await Promise.all(links.map(link =>
      withTenant(link.tenant_id, trx =>
        trx.selectFrom('seal_dispatch_requests')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_dispatch_requests.lot_id')
          .select([
            'seal_dispatch_requests.id', 'seal_dispatch_requests.lot_id', 'seal_dispatch_requests.qty_requested',
            'seal_dispatch_requests.note', 'seal_dispatch_requests.status', 'seal_dispatch_requests.decided_at',
            'seal_dispatch_requests.fulfillment_order_id', 'seal_dispatch_requests.created_at',
            'seal_lots.description as lot_description', 'seal_lots.uom as lot_uom',
          ])
          .where('seal_dispatch_requests.tenant_id', '=', link.tenant_id)
          .where('seal_dispatch_requests.requested_by_org_id', '=', user.org_id)
          .orderBy('seal_dispatch_requests.created_at', 'desc')
          .execute()
      ).then(rows => rows.map(r => ({ ...r, tenant_name: link.tenant_name })))
    ));

    return { data: perTenant.flat() };
  });
}
