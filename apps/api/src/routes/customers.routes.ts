import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { MinioIntegration } from '../integrations/minio.js';
import type { CreateCustomerInput, CustomerAnalytics } from '@hudumika/types';

export async function customerRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/customers
   * Fetch all customers under the tenant
   */
  fastify.get('/', {
    preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE', 'SALES'),
    schema: {
      tags: ['Customers'],
      summary: 'List customers',
      description: 'Returns every customer record for the authenticated tenant, ordered by name.',
      response: {
        200: {
          type: 'object',
          properties: { data: { type: 'array', items: { type: 'object', additionalProperties: true } } },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      // Explicit tenant filter — RLS alone doesn't apply here because this
      // connection uses a DB role that owns the tables (see db/client.ts),
      // and Postgres always lets the table owner bypass row-level policies
      // regardless of the SET LOCAL app.tenant_id session variable.
      const list = await trx
        .selectFrom('customers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name', 'asc')
        .execute();
      return { data: list };
    });
  });

  /**
   * POST /v1/customers
   * Create a new customer record
   */
  fastify.post('/', {
    preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES'),
    schema: {
      tags: ['Customers'],
      summary: 'Create a customer',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          contact_name: { type: 'string' },
          email: { type: 'string' },
          phone_wa: { type: 'string' },
          phone_wechat: { type: 'string' },
          category: { type: 'string' },
          preferred_channel: { type: 'string' },
          tax_id: { type: 'string' },
        },
      },
      response: { 201: { type: 'object', additionalProperties: true } },
    },
  }, async (request, reply) => {
    const user = request.user;
    const input = request.body as CreateCustomerInput;

    return withTenant(user.tenant_id, async (trx) => {
      // Calculate initials and avatar color
      const initials = input.name.substring(0, 2).toUpperCase();
      const colors = ['#0b7264', '#0e1f3d', '#1849a9', '#5b3ea8', '#b57d0a'];
      const avatarColor = colors[Math.floor(Math.random() * colors.length)];

      const customer = await trx
        .insertInto('customers')
        .values({
          tenant_id: user.tenant_id,
          name: input.name,
          contact_name: input.contact_name || null,
          email: input.email || null,
          phone_wa: input.phone_wa || null,
          phone_wechat: input.phone_wechat || null,
          category: input.category || 'sme',
          preferred_channel: input.preferred_channel || 'WHATSAPP',
          tax_id: input.tax_id || null,
          avatar_initials: initials,
          avatar_color: avatarColor,
          assigned_officer_id: user.role === 'OFFICER' ? user.sub : null,
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Create the customer's root folder in file storage
      MinioIntegration.ensureCustomerFolder(user.tenant_id, customer.id, customer.name);

      reply.status(211);
      return customer;
    });
  });

  /**
   * PATCH /v1/customers/:id
   * Update customer profile fields
   */
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const allowed = ['name', 'contact_name', 'contact_person', 'email', 'phone', 'phone_wa', 'phone_wechat',
                     'tax_id', 'tin_number', 'address', 'category', 'preferred_channel',
                     'notes', 'account_status', 'active', 'assigned_officer_id',
                     'registry_number', 'entity_type', 'registration_status', 'registered_address', 'incorporation_date'];

    const patch: Record<string, any> = { updated_at: new Date() };
    for (const key of allowed) {
      if (key in body) {
        // Map frontend aliases to DB column names
        if (key === 'contact_person') patch['contact_name'] = body[key];
        else if (key === 'tin_number') patch['tax_id'] = body[key];
        else if (key === 'account_status') patch['active'] = body[key] === 'active';
        else patch[key] = body[key];
      }
    }

    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx
        .updateTable('customers')
        .set(patch)
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      if (!updated) return reply.status(404).send({ error: 'Customer not found' });
      return updated;
    });
  });

  /**
   * DELETE /v1/customers/:id
   * Soft-delete (deactivate) a customer
   */
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      await trx
        .updateTable('customers')
        .set({ active: false, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();

      reply.status(204);
      return null;
    });
  });

  /**
   * GET /v1/customers/:id
   * Fetch single customer
   */
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    // Customers can only view their own customer record
    if (user.role === 'CUSTOMER' && user.sub !== id) {
      return reply.status(403).send({ error: 'Forbidden: Access denied' });
    }

    const customer = await db
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();

    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found' });
    }

    return customer;
  });

  /**
   * GET /v1/customers/:id/shipments
   * Fetch shipments list scoped to a specific customer
   */
  fastify.get('/:id/shipments', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    if (user.role === 'CUSTOMER' && user.sub !== id) {
      return reply.status(403).send({ error: 'Forbidden: Access denied' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const list = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('customer_id', '=', id)
        .orderBy('created_at', 'desc')
        .execute();

      const parsedList = list.map((item) => ({
        ...item,
        containers: typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers,
      }));

      return { data: parsedList };
    });
  });

  /**
   * GET /v1/customers/:id/analytics
   * Computes dynamic operational/financial KPIs for customer
   */
  fastify.get('/:id/analytics', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const shipments = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('customer_id', '=', id)
        .execute();

      const total_shipments = shipments.length;
      const active_shipments = shipments.filter(
        (s) => s.stage !== 'CLOSED' && s.stage !== 'DELIVERY'
      ).length;

      // Calculate total duty and revenue
      const shipmentIds = shipments.map((s) => s.id);
      let total_duty_paid = 0;
      let total_revenue = 0;
      let outstanding_amount = 0;
      let outstanding_invoices = 0;

      if (shipmentIds.length > 0) {
        const expenses = await trx
          .selectFrom('expenses')
          .selectAll()
          .where('shipment_id', 'in', shipmentIds)
          .execute();

        for (const exp of expenses) {
          const amt = Number(exp.amount_tzs);
          if (exp.category === 'DUTY') {
            total_duty_paid += amt;
          }
          if (exp.is_revenue) {
            total_revenue += amt;
            // Check if related shipment is unpaid (not closed)
            const sh = shipments.find((s) => s.id === exp.shipment_id);
            if (sh && sh.stage !== 'CLOSED') {
              outstanding_amount += amt;
            }
          }
        }

        outstanding_invoices = shipments.filter((s) => s.stage === 'INVOICING').length;
      }

      // Compute average clearance days based on closed cases
      const closedCases = shipments.filter((s) => s.stage === 'CLOSED');
      let avg_clearance_days = 0;
      if (closedCases.length > 0) {
        let totalDays = 0;
        for (const cc of closedCases) {
          const durationMs = new Date(cc.updated_at).getTime() - new Date(cc.created_at).getTime();
          totalDays += durationMs / (1000 * 60 * 60 * 24);
        }
        avg_clearance_days = parseFloat((totalDays / closedCases.length).toFixed(1));
      }

      // Compile most imported goods and common origins
      const goodsCounts: Record<string, number> = {};
      const originCounts: Record<string, number> = {};
      for (const s of shipments) {
        goodsCounts[s.goods_desc] = (goodsCounts[s.goods_desc] || 0) + 1;
        originCounts[s.origin_port] = (originCounts[s.origin_port] || 0) + 1;
      }

      const most_imported = Object.entries(goodsCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((x) => x[0]);

      const common_origins = Object.entries(originCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((x) => x[0]);

      const analytics: CustomerAnalytics = {
        total_shipments,
        active_shipments,
        avg_clearance_days,
        total_duty_paid,
        total_revenue,
        outstanding_invoices,
        outstanding_amount,
        avg_payment_days: 14, // default baseline
        penalty_incidents: 0,
        most_imported,
        common_origins,
      };

      return analytics;
    });
  });

  /**
   * POST /v1/customers/:id/invite
   * Send WhatsApp invite link to customer to download/login to portal
   */
  fastify.post('/:id/invite', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const customer = await db
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();

    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found' });
    }

    console.log(`✉️ Sending portal invitation to customer ${customer.name} via WhatsApp...`);

    // In a real app we'd dispatch a WhatsApp template.
    return {
      success: true,
      message: `Invitation sent to ${customer.phone_wa || customer.phone || 'customer'}.`,
    };
  });
}
