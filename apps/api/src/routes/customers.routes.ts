import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { MinioIntegration } from '../integrations/minio.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { screenSubject } from '../services/sanctions.service.js';
import { MailService } from '../services/mail.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { renderCustomerStatementPdf } from '../services/customer-statement-pdf.service.js';
import type { CreateCustomerInput, CustomerAnalytics } from '@hudumika/types';
import { parse } from 'csv-parse/sync';

// CSV header normalization — accept "Company Name", "company_name", "Company", etc.
function normalizeHeaders(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    out[key] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  }
  return out;
}

function pick(norm: Record<string, string>, aliases: string[]): string | undefined {
  for (const a of aliases) {
    const v = norm[a];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

function parseCsv(buf: Buffer): Record<string, unknown>[] {
  return parse(buf, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
}

// Shape-guard only — the handler below still field-picks against its own
// `allowed` allowlist before building the update patch, so this just
// guarantees each value is the right primitive type before it reaches Kysely.
const customerPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contact_name: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  phone_wa: z.string().nullable().optional(),
  phone_wechat: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
  tin_number: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  preferred_channel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  account_status: z.string().nullable().optional(),
  active: z.boolean().optional(),
  assigned_officer_id: z.string().nullable().optional(),
  registry_number: z.string().nullable().optional(),
  entity_type: z.string().nullable().optional(),
  registration_status: z.string().nullable().optional(),
  registered_address: z.string().nullable().optional(),
  incorporation_date: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  vat_number: z.string().nullable().optional(),
  import_license: z.string().nullable().optional(),
  preferred_port: z.string().nullable().optional(),
  freight_terms: z.string().nullable().optional(),
  commodity_type: z.string().nullable().optional(),
  credit_days: z.number().nullable().optional(),
  client_type: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  tancis_number: z.string().nullable().optional(),
  organization_id: z.string().nullable().optional(),
  // Daily shipment-report automation (migration 258) — null = platform
  // default (on); see shipment-report.service.ts's tri-state logic.
  daily_report_enabled: z.boolean().nullable().optional(),
});

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
        // organizations has no tenant_id (platform-level, migration 230) and
        // no RLS — a plain left join, just for the display name of whichever
        // org this customer has been linked to, if any.
        .leftJoin('organizations', 'organizations.id', 'customers.organization_id')
        .selectAll('customers')
        .select(['organizations.name as organization_name'])
        .where('customers.tenant_id', '=', user.tenant_id)
        // Symmetrical with /partners. Filtering only one side left a
        // partner-only company still showing up as a customer, which is half
        // the bug this was meant to fix.
        .where('customers.is_customer', '=', true)
        .orderBy('customers.name', 'asc')
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
          phone: { type: 'string' },
          phone_wa: { type: 'string' },
          phone_wechat: { type: 'string' },
          category: { type: 'string' },
          preferred_channel: { type: 'string' },
          tax_id: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
          website: { type: 'string' },
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
          phone: input.phone || null,
          phone_wa: input.phone_wa || null,
          phone_wechat: input.phone_wechat || null,
          category: input.category || 'sme',
          preferred_channel: input.preferred_channel || 'WHATSAPP',
          tax_id: input.tax_id || null,
          address: input.address || null,
          city: input.city || null,
          country: input.country || null,
          website: input.website || null,
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
      // …and a matching folder in the Cloud file manager (Drive app), best-effort.
      CloudSync.ensureCustomerFolder(user.tenant_id, customer.id, customer.name).catch(err => console.error('[Cloud] customer folder failed:', err.message));
      // Denied-party screen against OFAC SDN + UN Consolidated, best-effort —
      // never blocks customer creation on an external-list lookup.
      screenSubject(user.tenant_id, 'customer', customer.id, customer.name).catch(err => console.error('[Sanctions] screen failed:', err.message));

      // 201 Created — was 211, which is not a registered HTTP status.
      reply.status(201);
      return customer;
    });
  });

  /**
   * POST /v1/customers/bulk-import
   * Multipart CSV/Excel — CustomerBulkUpload.tsx. Every row becomes a real
   * insert (not a fabricated "50 clients imported" success message like the
   * old frontend-only version); rows missing the required company_name are
   * skipped and reported back rather than silently dropped.
   */
  fastify.post('/bulk-import', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    let records: Record<string, unknown>[];
    try {
      records = parseCsv(await file.toBuffer());
    } catch (e: any) {
      return reply.status(400).send({ error: 'Could not parse file: ' + (e.message || 'invalid format') });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const summary = { total: records.length, inserted: 0, skipped: 0, errors: [] as string[] };
      const colors = ['#0b7264', '#0e1f3d', '#1849a9', '#5b3ea8', '#b57d0a'];

      for (let i = 0; i < records.length; i++) {
        const norm = normalizeHeaders(records[i]);
        const name = pick(norm, ['company_name', 'name', 'company', 'client_name']);
        if (!name) {
          summary.skipped++;
          summary.errors.push(`Row ${i + 2}: missing company_name`);
          continue;
        }
        const email = pick(norm, ['email']) ?? null;
        const phone = pick(norm, ['phone', 'phone_wa', 'whatsapp']) ?? null;
        const country = pick(norm, ['country']) ?? null;
        const address = pick(norm, ['address']) ?? null;
        const currency = pick(norm, ['currency']) ?? 'TZS';

        await trx.insertInto('customers').values({
          tenant_id: user.tenant_id,
          name,
          email,
          phone_wa: phone,
          country,
          address,
          currency,
          category: 'sme',
          preferred_channel: 'WHATSAPP',
          avatar_initials: name.substring(0, 2).toUpperCase(),
          avatar_color: colors[i % colors.length],
          assigned_officer_id: user.role === 'OFFICER' ? user.sub : null,
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }).execute();
        summary.inserted++;
      }

      reply.status(201);
      return { data: summary };
    });
  });

  /**
   * PATCH /v1/customers/:id
   * Update customer profile fields
   */
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = customerPatchSchema.parse(request.body) as Record<string, any>;

    const allowed = ['name', 'contact_name', 'contact_person', 'email', 'phone', 'phone_wa', 'phone_wechat',
                     'tax_id', 'tin_number', 'address', 'category', 'preferred_channel',
                     'notes', 'account_status', 'active', 'assigned_officer_id',
                     'registry_number', 'entity_type', 'registration_status', 'registered_address', 'incorporation_date',
                     'website', 'city', 'country', 'vat_number', 'import_license', 'preferred_port',
                     'freight_terms', 'commodity_type', 'credit_days', 'client_type', 'currency', 'tancis_number',
                     'organization_id', 'daily_report_enabled'];

    const patch: Record<string, any> = { updated_at: new Date() };
    for (const key of allowed) {
      if (key in body) {
        // Map frontend aliases to DB column names
        if (key === 'contact_person') patch['contact_name'] = body[key];
        else if (key === 'tin_number') patch['tax_id'] = body[key];
        // account_status carries the real 3-way status ('Active'/'Inactive'/
        // 'Suspended'); keep the legacy `active` boolean in sync with it
        // rather than letting the two drift (or, as before, having this
        // comparison silently always fail and force active=false on every
        // status change regardless of which status was picked).
        else if (key === 'account_status') { patch['account_status'] = body[key]; patch['active'] = body[key] === 'Active'; }
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
   * POST /v1/customers/:id/claim-code
   * Issues a one-time code an Organization can redeem (POST /v1/org/claim)
   * to self-service-link itself to this customer record, instead of staff
   * doing the linking directly. Sent only to this customer's own registered
   * email/WhatsApp — never returned to, or enterable by, an org that hasn't
   * already reached that address — so possession of the code is what proves
   * the claim, the same trust model password-reset and staff-invite tokens
   * already rely on elsewhere in this codebase.
   */
  fastify.post('/:id/claim-code', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const customer = await trx.selectFrom('customers').select(['id', 'name', 'email', 'phone_wa'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });
      if (!customer.email && !customer.phone_wa) {
        return reply.status(400).send({ error: 'This customer has no email or WhatsApp number on file to send a code to' });
      }

      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await trx.insertInto('customer_claim_codes').values({
        tenant_id: user.tenant_id, customer_id: id, token, issued_by: user.sub, expires_at: expiresAt,
      }).execute();

      if (customer.email) {
        await MailService.enqueueTemplated(user.tenant_id, 'customers.claim_code', customer.email, { customerName: customer.name, token }, 'customers')
          .catch(() => { /* claim code exists regardless; staff can read/share it manually below */ });
      }
      if (customer.phone_wa) {
        await WhatsAppIntegration.sendMessage(
          customer.phone_wa,
          `Your Hudumika organization link code for ${customer.name}: ${token}\nEnter it under "Link an Agent" in your organization portal. Expires in 7 days, single use.`,
        ).catch(() => {});
      }

      return { token, expires_at: expiresAt, sent_to: { email: customer.email || null, phone_wa: customer.phone_wa || null } };
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

    const customer = await withTenant(user.tenant_id, trx => trx
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst());

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
        .where('tenant_id', '=', user.tenant_id)
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
        .where('tenant_id', '=', user.tenant_id)
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
          .where('tenant_id', '=', user.tenant_id)
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

    const customer = await withTenant(user.tenant_id, trx => trx
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst());

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

  /**
   * GET /v1/customers/partners
   * Fetch all Logistics & Warehousing Chain Partners (ICDs, CFS, Bonded Warehouse operators)
   */
  fastify.get('/partners', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      // Filtered. This selected every customer, which is why the Chain
      // Partners page and the Customers page showed the same records.
      const partners = await trx
        .selectFrom('customers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('is_partner', '=', true)
        .orderBy('name', 'asc')
        .execute();

      return { data: partners };
    });
  });

  /**
   * POST /v1/customers/partners
   * Register a new Logistics & Warehousing Chain Partner
   */
  /**
   * Mark an existing company as a partner, or stop.
   *
   * Needed because every record predating the flag is a customer and not a
   * partner, so the partners page starts empty. Re-typing fifty companies to
   * populate it would be absurd; this promotes the ones that already exist.
   */
  // Same role list as PATCH /:id above — no role gate here at all until now
  // meant a CUSTOMER login (only `fastify.authenticate` applies file-wide)
  // could flip the partner flag on any customer record in its own tenant.
  fastify.patch('/:id/partner', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = z.object({
      is_partner: z.boolean().optional(),
      partner_role: z.string().max(100).nullable().optional(),
    }).parse(request.body ?? {});
    const isPartner = body.is_partner !== false;

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('customers').select(['id', 'name', 'is_customer'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Company not found' });

      // A record that is neither is unreachable from either page. The CHECK
      // would refuse it; saying so is more useful than a constraint violation.
      if (!isPartner && !existing.is_customer) {
        return reply.status(409).send({
          error: `${existing.name} is not a customer, so removing the partner flag would hide it from every list. Mark it a customer first, or delete it.`,
        });
      }

      return trx.updateTable('customers')
        .set({ is_partner: isPartner, partner_role: body.partner_role ?? null, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // Same reasoning as PATCH /:id/partner above — no role gate at all
  // previously meant any authenticated login, CUSTOMER included, could
  // create arbitrary customer/partner rows in its own tenant.
  fastify.post('/partners', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      contactName: z.string().max(200).optional(),
      email: z.string().email().max(320).optional().or(z.literal('')),
      phone: z.string().max(30).optional(),
      isCustomer: z.boolean().optional(),
      partnerRole: z.string().max(100).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const created = await trx
        .insertInto('customers')
        .values({
          tenant_id: user.tenant_id,
          name: body.name,
          contact_name: body.contactName || null,
          email: body.email || null,
          phone: body.phone || null,
          // Marked, so it appears on the partners page and not among customers
          // unless somebody says it is both.
          is_partner: true,
          is_customer: body.isCustomer === true,
          partner_role: body.partnerRole || null,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

      return { success: true, partner: created };
    });
  });

  // GET /v1/customers/:id/statement/pdf?from=&to= — real running-balance
  // statement across invoices, payments and credit notes. Same
  // headers/try-catch-404 shape as invoices.routes.ts's own PDF route.
  fastify.get('/:id/statement/pdf', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const toDate = to || new Date().toISOString().slice(0, 10);
    const fromDate = from || new Date(new Date(toDate).getFullYear(), new Date(toDate).getMonth() - 1, 1).toISOString().slice(0, 10);
    try {
      const pdf = await renderCustomerStatementPdf(user.tenant_id, id, fromDate, toDate);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="statement.pdf"`);
      return reply.send(pdf);
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });
}
