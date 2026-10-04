import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const READ_ROLES  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

const TERM_KEYS = ['lead', 'leads', 'deal', 'deals', 'customer', 'customers', 'contact', 'contacts', 'pipeline'] as const;
type TermKey = typeof TERM_KEYS[number];

/** Platform defaults — returned when a tenant has no override for a key. */
const DEFAULTS: Record<TermKey, { singular: string; plural: string }> = {
  lead:      { singular: 'Lead',      plural: 'Leads'      },
  leads:     { singular: 'Lead',      plural: 'Leads'      },
  deal:      { singular: 'Deal',      plural: 'Deals'      },
  deals:     { singular: 'Deal',      plural: 'Deals'      },
  customer:  { singular: 'Customer',  plural: 'Customers'  },
  customers: { singular: 'Customer',  plural: 'Customers'  },
  contact:   { singular: 'Contact',   plural: 'Contacts'   },
  contacts:  { singular: 'Contact',   plural: 'Contacts'   },
  pipeline:  { singular: 'Pipeline',  plural: 'Pipelines'  },
};

/** Industry presets — a named set of term overrides. */
const PRESETS: Record<string, Partial<Record<TermKey, { singular: string; plural: string }>>> = {
  logistics: {
    customer:  { singular: 'Client',     plural: 'Clients'    },
    customers: { singular: 'Client',     plural: 'Clients'    },
    deal:      { singular: 'Shipment',   plural: 'Shipments'  },
    deals:     { singular: 'Shipment',   plural: 'Shipments'  },
    pipeline:  { singular: 'Cargo flow', plural: 'Cargo flows' },
  },
  agency: {
    customer:  { singular: 'Client',     plural: 'Clients'    },
    customers: { singular: 'Client',     plural: 'Clients'    },
    lead:      { singular: 'Prospect',   plural: 'Prospects'  },
    leads:     { singular: 'Prospect',   plural: 'Prospects'  },
    deal:      { singular: 'Brief',      plural: 'Briefs'     },
    deals:     { singular: 'Brief',      plural: 'Briefs'     },
  },
  saas: {
    lead:      { singular: 'Prospect',   plural: 'Prospects'  },
    leads:     { singular: 'Prospect',   plural: 'Prospects'  },
    deal:      { singular: 'Opportunity', plural: 'Opportunities' },
    deals:     { singular: 'Opportunity', plural: 'Opportunities' },
    contact:   { singular: 'End user',   plural: 'End users'  },
    contacts:  { singular: 'End user',   plural: 'End users'  },
  },
  retail: {
    customer:  { singular: 'Shopper',    plural: 'Shoppers'   },
    customers: { singular: 'Shopper',    plural: 'Shoppers'   },
    deal:      { singular: 'Order',      plural: 'Orders'     },
    deals:     { singular: 'Order',      plural: 'Orders'     },
    lead:      { singular: 'Subscriber', plural: 'Subscribers' },
    leads:     { singular: 'Subscriber', plural: 'Subscribers' },
  },
};

const termSchema = z.object({
  singular: z.string().trim().min(1).max(80),
  plural:   z.string().trim().min(1).max(80),
});
const putSchema = z.record(z.enum(TERM_KEYS), termSchema);
const presetSchema = z.object({ preset: z.enum(['logistics', 'agency', 'saas', 'retail']) });

export async function crmTerminologyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));

  /* GET /v1/crm/terminology — returns merged defaults + overrides */
  fastify.get('/', { preHandler: [requireRole(...READ_ROLES)] }, async (request: any) => {
    const tenantId = request.user.tenant_id;
    const rows = await withTenant(tenantId, trx =>
      trx.selectFrom('crm_terminology')
        .select(['term_key', 'singular', 'plural'])
        .where('tenant_id', '=', tenantId)
        .execute()
    );
    const overrides: Record<string, { singular: string; plural: string }> = {};
    for (const r of rows) overrides[r.term_key] = { singular: r.singular, plural: r.plural };
    const result: Record<string, { singular: string; plural: string; overridden: boolean }> = {};
    for (const key of TERM_KEYS) {
      result[key] = { ...(overrides[key] ?? DEFAULTS[key]), overridden: !!overrides[key] };
    }
    return result;
  });

  /* GET /v1/crm/terminology/presets — list available industry presets */
  fastify.get('/presets', { preHandler: [requireRole(...READ_ROLES)] }, async () => {
    return Object.entries(PRESETS).map(([key, terms]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      preview: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, v!.singular])),
    }));
  });

  /* PUT /v1/crm/terminology — upsert one or more overrides */
  fastify.put('/', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const updates = putSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, async trx => {
      for (const [key, val] of Object.entries(updates) as [TermKey, { singular: string; plural: string }][]) {
        await trx.insertInto('crm_terminology').values({
          tenant_id: tenantId, term_key: key, singular: val.singular, plural: val.plural, updated_at: new Date(),
        })
          .onConflict(oc => oc.columns(['tenant_id', 'term_key']).doUpdateSet({
            singular: val.singular, plural: val.plural, updated_at: new Date() as any,
          }))
          .execute();
      }
    });
    return reply.status(204).send();
  });

  /* POST /v1/crm/terminology/preset — apply an industry preset */
  fastify.post('/preset', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const { preset } = presetSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const terms = PRESETS[preset];
    if (!terms) return reply.status(400).send({ error: 'Unknown preset' });
    await withTenant(tenantId, async trx => {
      for (const [key, val] of Object.entries(terms) as [TermKey, { singular: string; plural: string }][]) {
        await trx.insertInto('crm_terminology').values({
          tenant_id: tenantId, term_key: key, singular: val.singular, plural: val.plural, updated_at: new Date(),
        })
          .onConflict(oc => oc.columns(['tenant_id', 'term_key']).doUpdateSet({
            singular: val.singular, plural: val.plural, updated_at: new Date() as any,
          }))
          .execute();
      }
    });
    return reply.status(204).send();
  });

  /* DELETE /v1/crm/terminology/:key — reset one term to platform default */
  fastify.delete('/:key', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const { key } = z.object({ key: z.enum(TERM_KEYS) }).parse(request.params);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_terminology')
        .where('tenant_id', '=', tenantId).where('term_key', '=', key).execute()
    );
    return reply.status(204).send();
  });

  /* DELETE /v1/crm/terminology — reset all overrides to platform defaults */
  fastify.delete('/', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_terminology').where('tenant_id', '=', tenantId).execute()
    );
    return reply.status(204).send();
  });
}
