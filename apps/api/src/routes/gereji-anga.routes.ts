import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

/**
 * Gereji port, Milestone 2 — ANGA PartsOS foundation (catalogue, parties,
 * locations). Ported from the standalone D:\Apps\Gereji\gereji-app's
 * anga_part/anga_customer/anga_aircraft/anga_supplier/anga_location tables,
 * now real RLS-governed Hudumika tables (migration 744) instead of the
 * source app's app-layer-only SQLite scoping.
 *
 * Gated by its own 'gereji.anga' entitlement sub-key, separate from the
 * base 'gereji' key the garage module uses — ANGA is a distinct business
 * line (aviation parts trading), not every automotive-workshop tenant
 * wants or is licensed for it.
 */

async function recordAudit(
  trx: Transaction<Database>, tenantId: string, actorId: string,
  entityType: string, entityId: string, action: string,
  before: unknown | null, after: unknown | null, reason?: string,
) {
  await trx.insertInto('gereji_anga_audit_events').values({
    tenant_id: tenantId, actor_id: actorId, entity_type: entityType, entity_id: entityId, action,
    before: before !== null ? JSON.stringify(before) : null,
    after: after !== null ? JSON.stringify(after) : null,
    reason: reason ?? null,
  } as any).execute();
}

const normalizePn = (pn: string) => pn.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function gerejiAngaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('gereji.anga'));

  fastify.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Parts catalogue
  // ═══════════════════════════════════════════════════════════════════

  const partSchema = z.object({
    pn: z.string().trim().min(1),
    description: z.string().optional(),
    manufacturer: z.string().optional(),
    cage_code: z.string().optional(),
    ata_chapter: z.string().optional(),
    uom: z.string().trim().min(1).default('EA'),
    serialised: z.boolean().default(false),
    rotable: z.boolean().default(false),
    shelf_life_controlled: z.boolean().default(false),
    hazmat_class: z.string().optional(),
    export_controlled: z.boolean().default(false),
    prohibited: z.boolean().default(false),
    hs_code: z.string().optional(),
    duty_suspension_eligible: z.boolean().default(false),
    certificate_required: z.boolean().default(false),
    lead_time_days: z.number().int().nonnegative().optional(),
  });

  fastify.get('/parts', async (request) => {
    const { q } = z.object({ q: z.string().optional() }).parse(request.query);
    return withTenant(request.user.tenant_id, async trx => {
      let query = trx.selectFrom('gereji_anga_parts').selectAll().where('tenant_id', '=', request.user.tenant_id);
      if (q?.trim()) {
        const like = `%${normalizePn(q)}%`;
        query = query.where(eb => eb.or([eb('pn_normalized', 'ilike', like), eb('description', 'ilike', `%${q.trim()}%`)]));
      }
      const parts = await query.orderBy('pn', 'asc').limit(200).execute();
      return { parts };
    });
  });

  fastify.post('/parts', async (request, reply) => {
    const body = partSchema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const existing = await trx.selectFrom('gereji_anga_parts').select('id')
        .where('tenant_id', '=', request.user.tenant_id).where('pn', '=', body.pn).executeTakeFirst();
      if (existing) throw { statusCode: 409, message: `Part ${body.pn} already exists.` };

      const [part] = await trx.insertInto('gereji_anga_parts')
        .values({ ...body, tenant_id: request.user.tenant_id, pn_normalized: normalizePn(body.pn) } as any)
        .returningAll().execute();
      await recordAudit(trx, request.user.tenant_id, request.user.sub, 'anga_part', part.id, 'create', null, part);
      reply.status(201);
      return part;
    });
  });

  fastify.patch('/parts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = partSchema.partial().parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const before = await trx.selectFrom('gereji_anga_parts').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!before) throw { statusCode: 404, message: 'Part not found' };

      const patch: Record<string, unknown> = { ...body, updated_at: new Date() };
      if (body.pn) patch.pn_normalized = normalizePn(body.pn);

      const [updated] = await trx.updateTable('gereji_anga_parts').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .returningAll().execute();
      await recordAudit(trx, request.user.tenant_id, request.user.sub, 'anga_part', id, 'update', before, updated);
      return updated;
    });
  });

  fastify.post('/parts/:id/alternates', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { alternate_part_id, relation } = z.object({
      alternate_part_id: z.string().uuid(), relation: z.string().default('alternate_two_way'),
    }).parse(request.body);
    if (alternate_part_id === id) throw { statusCode: 422, message: 'A part cannot alternate with itself.' };
    return withTenant(request.user.tenant_id, async trx => {
      for (const partId of [id, alternate_part_id]) {
        const found = await trx.selectFrom('gereji_anga_parts').select('id')
          .where('id', '=', partId).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
        if (!found) throw { statusCode: 404, message: 'Part not found' };
      }
      const [link] = await trx.insertInto('gereji_anga_part_alternates')
        .values({ tenant_id: request.user.tenant_id, part_id: id, alternate_part_id, relation })
        .returningAll().execute();
      reply.status(201);
      return link;
    });
  });

  fastify.get('/parts/:id/alternates', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const rows = await trx.selectFrom('gereji_anga_part_alternates as a')
        .innerJoin('gereji_anga_parts as p', 'p.id', 'a.alternate_part_id')
        .where('a.tenant_id', '=', request.user.tenant_id).where('a.part_id', '=', id)
        .select(['a.id', 'a.relation', 'p.id as part_id', 'p.pn', 'p.description'])
        .execute();
      return { alternates: rows };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Customers + fleet (aircraft)
  // ═══════════════════════════════════════════════════════════════════

  const customerSchema = z.object({
    name: z.string().trim().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    currency: z.string().length(3).default('USD'),
    credit_limit_minor: z.number().int().nonnegative().optional(),
    payment_terms_days: z.number().int().nonnegative().optional(),
    tax_id: z.string().optional(),
    escalation_contact_name: z.string().optional(),
    escalation_contact_phone: z.string().optional(),
    escalation_contact_email: z.string().email().optional(),
    notes: z.string().optional(),
  });

  fastify.get('/customers', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const customers = await trx.selectFrom('gereji_anga_customers').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('name', 'asc').limit(200).execute();
      return { customers };
    });
  });

  fastify.post('/customers', async (request, reply) => {
    const body = customerSchema.parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [customer] = await trx.insertInto('gereji_anga_customers')
        .values({ ...body, tenant_id: request.user.tenant_id, created_by: request.user.sub } as any)
        .returningAll().execute();
      await recordAudit(trx, request.user.tenant_id, request.user.sub, 'anga_customer', customer.id, 'create', null, customer);
      reply.status(201);
      return customer;
    });
  });

  fastify.patch('/customers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = customerSchema.partial().parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const before = await trx.selectFrom('gereji_anga_customers').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!before) throw { statusCode: 404, message: 'Customer not found' };
      const [updated] = await trx.updateTable('gereji_anga_customers').set({ ...body, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .returningAll().execute();
      await recordAudit(trx, request.user.tenant_id, request.user.sub, 'anga_customer', id, 'update', before, updated);
      return updated;
    });
  });

  fastify.post('/customers/:id/aircraft', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      registration: z.string().trim().min(1), aircraft_type: z.string().optional(),
      msn: z.string().optional(), base: z.string().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const customer = await trx.selectFrom('gereji_anga_customers').select('id')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!customer) throw { statusCode: 404, message: 'Customer not found' };
      const [aircraft] = await trx.insertInto('gereji_anga_aircraft')
        .values({ ...body, tenant_id: request.user.tenant_id, customer_id: id })
        .returningAll().execute();
      reply.status(201);
      return aircraft;
    });
  });

  fastify.get('/customers/:id/aircraft', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const aircraft = await trx.selectFrom('gereji_anga_aircraft').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).where('customer_id', '=', id)
        .orderBy('registration', 'asc').execute();
      return { aircraft };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Suppliers + Approved Vendor List certifications
  // ═══════════════════════════════════════════════════════════════════

  const APPROVAL_TRANSITIONS: Record<string, string[]> = {
    pending: ['approved', 'rejected'], approved: ['suspended'], suspended: ['approved', 'rejected'], rejected: [],
  };

  fastify.get('/suppliers', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const suppliers = await trx.selectFrom('gereji_anga_suppliers').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('name', 'asc').limit(200).execute();
      return { suppliers };
    });
  });

  fastify.post('/suppliers', async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(1), contact_email: z.string().email().optional(),
      contact_phone: z.string().optional(), notes: z.string().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [supplier] = await trx.insertInto('gereji_anga_suppliers')
        .values({ ...body, tenant_id: request.user.tenant_id, created_by: request.user.sub })
        .returningAll().execute();
      await recordAudit(trx, request.user.tenant_id, request.user.sub, 'anga_supplier', supplier.id, 'create', null, supplier);
      reply.status(201);
      return supplier;
    });
  });

  fastify.patch('/suppliers/:id/approval', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      approval_status: z.enum(['pending', 'approved', 'suspended', 'rejected']),
      approval_scope: z.string().optional(),
      approval_expiry: z.string().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const current = await trx.selectFrom('gereji_anga_suppliers').select('approval_status')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Supplier not found' };
      if (!APPROVAL_TRANSITIONS[current.approval_status]?.includes(body.approval_status)) {
        throw { statusCode: 422, message: `Cannot move approval status from ${current.approval_status} to ${body.approval_status}` };
      }
      const [updated] = await trx.updateTable('gereji_anga_suppliers')
        .set({
          approval_status: body.approval_status, approval_scope: body.approval_scope ?? null,
          approval_expiry: body.approval_expiry ? new Date(body.approval_expiry) : null, updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .returningAll().execute();
      await recordAudit(trx, request.user.tenant_id, request.user.sub, 'anga_supplier', id, 'approval_status_change', current, updated);
      return updated;
    });
  });

  fastify.post('/suppliers/:id/certifications', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ type: z.string().trim().min(1), reference: z.string().optional(), expiry: z.string().optional() }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const supplier = await trx.selectFrom('gereji_anga_suppliers').select('id')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!supplier) throw { statusCode: 404, message: 'Supplier not found' };
      const [cert] = await trx.insertInto('gereji_anga_supplier_certifications')
        .values({ tenant_id: request.user.tenant_id, supplier_id: id, type: body.type, reference: body.reference ?? null, expiry: body.expiry ? new Date(body.expiry) : null })
        .returningAll().execute();
      reply.status(201);
      return cert;
    });
  });

  fastify.get('/suppliers/:id/certifications', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const certs = await trx.selectFrom('gereji_anga_supplier_certifications').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).where('supplier_id', '=', id)
        .orderBy('created_at', 'desc').execute();
      return { certifications: certs };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Locations
  // ═══════════════════════════════════════════════════════════════════

  fastify.get('/locations', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const locations = await trx.selectFrom('gereji_anga_locations').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).where('is_active', '=', true)
        .orderBy('warehouse', 'asc').execute();
      return { locations };
    });
  });

  fastify.post('/locations', async (request, reply) => {
    const body = z.object({
      warehouse: z.string().trim().min(1).default('Main'), zone: z.string().optional(), rack: z.string().optional(),
      shelf: z.string().optional(), bin: z.string().optional(),
      customs_zone: z.enum(['DUTY_PAID', 'BONDED', 'FREE_ZONE']).default('DUTY_PAID'),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [location] = await trx.insertInto('gereji_anga_locations')
        .values({ ...body, tenant_id: request.user.tenant_id } as any)
        .returningAll().execute();
      reply.status(201);
      return location;
    });
  });
}
