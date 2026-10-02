import { requireEntitlement, requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { isTaxCodeUserError, resolveLineTax } from '../services/tax-code.service.js';
import crypto from 'crypto';

const FIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

// Real values — ProductsServices.tsx's own Product type / StatusPill toggle.
const productCreateSchema = z.object({
  id: z.string().max(50).optional(),
  code: z.string().max(50).optional(),
  name: z.string().trim().min(1).max(300),
  type: z.enum(['product', 'service']).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  unit: z.string().max(30).optional(),
  sale_price: z.number().optional(),
  purchase_price: z.number().optional(),
  compare_at_price: z.number().nullable().optional(),
  currency: z.string().max(10).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  tax_code_id: z.string().optional(),
  tax_rate: z.number().optional(),
  notes: z.string().max(5000).optional(),
  // Retail/POS expansion (migration 547)
  image_urls: z.array(z.string().url()).optional(),
  brand: z.string().max(100).nullable().optional(),
  vendor_name: z.string().max(200).nullable().optional(),
  stock_quantity: z.number().int().nullable().optional(),
  low_stock_threshold: z.number().int().optional(),
  track_inventory: z.boolean().optional(),
  weight_kg: z.number().nullable().optional(),
  dimensions_cm: z.object({ length: z.number(), width: z.number(), height: z.number() }).nullable().optional(),
  shipping_class: z.string().max(50).nullable().optional(),
  variants: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).optional(),
  meta_title: z.string().max(300).nullable().optional(),
  meta_description: z.string().nullable().optional(),
  url_handle: z.string().max(300).nullable().optional(),
  visibility: z.enum(['published', 'draft', 'scheduled']).optional(),
  channels: z.array(z.string()).optional(),
});
const productPatchSchema = productCreateSchema.partial();
const customerPricesSchema = z.object({
  prices: z.array(z.object({
    customer_id: z.string().min(1),
    price: z.number(),
    currency: z.string().max(10).optional(),
    note: z.string().max(2000).optional(),
  })).optional(),
});

export async function productRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // ProductsServices.tsx is mounted in both ClearOS (/clearos/products) and
  // FinOps — gating on 'finops' alone 403'd any tenant holding clearos but
  // not finops the moment they clicked their own app's nav item. Same fix
  // shape as freight-booking.routes.ts's carrierGate.
  fastify.addHook('preHandler', requireAnyEntitlement(['clearos', 'finops']));

  // GET /v1/products
  // When `customer_id` is given, each product this customer has a contract
  // price for comes back with that price already substituted into sale_price
  // (and flagged), so any line-item picker that knows its customer prices the
  // catalog correctly with no per-line logic of its own.
  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request) => {
    const user = request.user;
    const { search, status, customer_id } = request.query as { search?: string; status?: string; customer_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('products').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      let rows: any[] = await q.orderBy('created_at', 'desc').execute();
      if (customer_id) {
        const overrides = await trx.selectFrom('customer_product_prices')
          .select(['product_id', 'price', 'currency'])
          .where('tenant_id', '=', user.tenant_id)
          .where('customer_id', '=', customer_id)
          .execute();
        if (overrides.length) {
          const byProduct = new Map(overrides.map(o => [o.product_id, o]));
          rows = rows.map(r => {
            const o = byProduct.get(r.id);
            if (!o) return r;
            // Keep the list price visible; the agreed one becomes the effective price.
            return { ...r, list_price: r.sale_price, sale_price: Number(o.price), currency: o.currency, has_agreed_price: true };
          });
        }
      }
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(r =>
          r.name.toLowerCase().includes(s) ||
          r.code.toLowerCase().includes(s) ||
          (r.category || '').toLowerCase().includes(s)
        );
      }
      return rows;
    });
  });

  // GET /v1/products/:id
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('products').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Product not found' });
      return row;
    });
  });

  // POST /v1/products
  fastify.post('/', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = productCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      // A tax code, when given, decides the rate — so the two can never
      // disagree on the same row.
      let tax: { tax_code_id: string | null; rate: number };
      try {
        tax = await resolveLineTax(trx, user.tenant_id,
          { tax_code_id: body.tax_code_id, tax_pct: body.tax_rate }, 0, 'SALES');
      } catch (e) {
        if (isTaxCodeUserError(e)) return reply.status(400).send({ error: e.message });
        throw e;
      }
      const row = await trx.insertInto('products').values({
        id: body.id || `PRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        tenant_id: user.tenant_id,
        code: body.code || '',
        name: body.name.trim(),
        type: body.type || 'service',
        description: body.description || null,
        category: body.category || null,
        unit: body.unit || 'each',
        sale_price: body.sale_price || 0,
        purchase_price: body.purchase_price || 0,
        currency: body.currency || 'TZS',
        tax_rate: tax.rate,
        tax_code_id: tax.tax_code_id,
        status: body.status || 'active',
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  // PATCH /v1/products/:id
  fastify.patch('/:id', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = productPatchSchema.parse(request.body);
    const b = body as Record<string, unknown>;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('products').select(['id', 'tax_rate', 'tax_code_id'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Product not found' });
      const updates: any = { updated_at: new Date() };
      const fields = ['code', 'name', 'type', 'description', 'category', 'unit', 'sale_price', 'purchase_price', 'currency', 'status'];
      for (const f of fields) if (b[f] !== undefined) updates[f] = b[f];

      // tax_rate and tax_code_id move together or not at all — patching one
      // without the other is how they drift apart.
      if (body.tax_code_id !== undefined) {
        try {
          const tax = await resolveLineTax(trx, user.tenant_id, { tax_code_id: body.tax_code_id }, 0, 'SALES');
          updates.tax_rate = tax.tax_code_id ? tax.rate : (body.tax_rate ?? existing.tax_rate);
          updates.tax_code_id = tax.tax_code_id;
        } catch (e) {
          if (isTaxCodeUserError(e)) return reply.status(400).send({ error: e.message });
          throw e;
        }
      } else if (body.tax_rate !== undefined) {
        // A bare rate change from an older client. Keep the treatment only if
        // it still agrees with the new rate; a code that no longer matches its
        // own rate is the exact ambiguity this table exists to remove.
        const newRate = Number(body.tax_rate) || 0;
        updates.tax_rate = newRate;
        if (existing.tax_code_id && Number(existing.tax_rate) !== newRate) {
          updates.tax_code_id = null;
        }
      }
      const row = await trx.updateTable('products').set(updates).where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
      return row;
    });
  });

  // DELETE /v1/products/:id
  fastify.delete('/:id', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('products').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Product not found' });
      await trx.deleteFrom('products').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return reply.status(204).send();
    });
  });

  // ── Customer-specific (contract) pricing ─────────────────────────────────
  // A product's catalog sale_price is the default; a customer may have a
  // negotiated price that overrides it on their documents. See migration 215.

  // GET /v1/products/:id/customer-prices — the contract overrides for one product.
  fastify.get('/:id/customer-prices', async (request) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('customer_product_prices as cpp')
        .innerJoin('customers as c', 'c.id', 'cpp.customer_id')
        .select(['cpp.id', 'cpp.customer_id', 'cpp.product_id', 'cpp.price', 'cpp.currency', 'cpp.note', 'c.name as customer_name'])
        .where('cpp.tenant_id', '=', user.tenant_id)
        .where('cpp.product_id', '=', id)
        .orderBy('c.name')
        .execute();
    });
  });

  // PUT /v1/products/:id/customer-prices — replace the whole override set for
  // this product in one call (what the product editor sends when saved).
  fastify.put('/:id/customer-prices', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = customerPricesSchema.parse(request.body);
    const incoming = Array.isArray(body.prices) ? body.prices : [];
    return withTenant(user.tenant_id, async (trx) => {
      const product = await trx.selectFrom('products').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!product) return reply.status(404).send({ error: 'Product not found' });

      // Replace: clear this product's overrides, then insert the provided set,
      // de-duped by customer (one agreed price per customer per product).
      await trx.deleteFrom('customer_product_prices')
        .where('tenant_id', '=', user.tenant_id).where('product_id', '=', id).execute();

      const seen = new Set<string>();
      const rows = incoming
        .filter(p => p.customer_id && !seen.has(p.customer_id) && seen.add(p.customer_id))
        .map(p => ({
          tenant_id: user.tenant_id,
          customer_id: p.customer_id,
          product_id: id,
          price: Number(p.price) || 0,
          currency: p.currency || 'TZS',
          note: p.note?.trim() || null,
        }));
      if (rows.length) await trx.insertInto('customer_product_prices').values(rows).execute();

      return trx.selectFrom('customer_product_prices as cpp')
        .innerJoin('customers as c', 'c.id', 'cpp.customer_id')
        .select(['cpp.id', 'cpp.customer_id', 'cpp.product_id', 'cpp.price', 'cpp.currency', 'cpp.note', 'c.name as customer_name'])
        .where('cpp.tenant_id', '=', user.tenant_id).where('cpp.product_id', '=', id)
        .orderBy('c.name').execute();
    });
  });

  // GET /v1/products/customer/:customerId/prices — the agreed-price map for one
  // customer ({ product_id: { price, currency } }). A document editor loads this
  // once when a customer is chosen, then triggers the override on each line.
  fastify.get('/customer/:customerId/prices', async (request) => {
    const user = request.user;
    const { customerId } = request.params as { customerId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('customer_product_prices')
        .select(['product_id', 'price', 'currency'])
        .where('tenant_id', '=', user.tenant_id)
        .where('customer_id', '=', customerId)
        .execute();
      const map: Record<string, { price: number; currency: string }> = {};
      for (const r of rows) map[r.product_id] = { price: Number(r.price), currency: r.currency };
      return map;
    });
  });

  // ── Product Categories ────────────────────────────────────────────────────

  const catSchema = z.object({
    name:        z.string().trim().min(1).max(200),
    slug:        z.string().max(200).nullable().optional(),
    parent_id:   z.string().uuid().nullable().optional(),
    image_url:   z.string().max(1000).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    is_featured: z.boolean().optional(),
    status:      z.enum(['active', 'inactive', 'draft']).optional(),
    sort_order:  z.number().int().optional(),
  });

  function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  fastify.get('/categories', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const cats = await trx.selectFrom('product_categories')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('sort_order').orderBy('name')
        .execute();
      // Attach product counts
      const counts = await trx.selectFrom('products')
        .select(['category', trx.fn.count('id').as('cnt')])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'active')
        .groupBy('category')
        .execute();
      const countMap: Record<string, number> = {};
      for (const r of counts) countMap[r.category ?? ''] = Number(r.cnt);
      return { data: cats, product_counts: countMap };
    });
  });

  fastify.post('/categories', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = catSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('product_categories').values({
        tenant_id:   user.tenant_id,
        name:        body.name,
        slug:        body.slug ?? slugify(body.name),
        parent_id:   body.parent_id ?? null,
        image_url:   body.image_url ?? null,
        description: body.description ?? null,
        is_featured: body.is_featured ?? false,
        status:      body.status ?? 'active',
        sort_order:  body.sort_order ?? 0,
      }).returningAll().executeTakeFirstOrThrow();
      reply.code(201);
      return row;
    });
  });

  fastify.patch('/categories/:cid', { preHandler: requireRole(...FIN_ROLES) }, async (request) => {
    const user = request.user;
    const { cid } = request.params as { cid: string };
    const body = catSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('product_categories')
        .set({ ...body, updated_at: new Date() } as any)
        .where('tenant_id', '=', user.tenant_id)
        .where('id', '=', cid)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/categories/:cid', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { cid } = request.params as { cid: string };
    await withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('product_categories')
        .where('tenant_id', '=', user.tenant_id)
        .where('id', '=', cid)
        .execute();
    });
    reply.code(204);
    return null;
  });

  // ── Product Reviews ───────────────────────────────────────────────────────

  const reviewSchema = z.object({
    product_id:    z.string().min(1),
    customer_id:   z.string().uuid().nullable().optional(),
    customer_name: z.string().min(1).max(200),
    rating:        z.number().int().min(1).max(5),
    title:         z.string().max(300).nullable().optional(),
    body:          z.string().nullable().optional(),
    status:        z.enum(['pending', 'approved', 'rejected']).optional(),
    reply:         z.string().nullable().optional(),
  });

  fastify.get('/reviews', async (request) => {
    const user = request.user;
    const { product_id, status } = request.query as { product_id?: string; status?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('product_reviews as r')
        .leftJoin('products as p', 'p.id', 'r.product_id')
        .select(['r.id', 'r.product_id', 'r.customer_id', 'r.customer_name', 'r.rating', 'r.title', 'r.body', 'r.status', 'r.reply', 'r.created_at', 'r.updated_at', 'p.name as product_name'])
        .where('r.tenant_id', '=', user.tenant_id)
        .orderBy('r.created_at', 'desc');
      if (product_id) q = q.where('r.product_id', '=', product_id) as any;
      if (status) q = q.where('r.status', '=', status) as any;
      return { data: await q.execute() };
    });
  });

  fastify.post('/reviews', async (request, reply) => {
    const user = request.user;
    const body = reviewSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('product_reviews').values({
        tenant_id:    user.tenant_id,
        product_id:   body.product_id,
        customer_id:  body.customer_id ?? null,
        customer_name: body.customer_name,
        rating:       body.rating,
        title:        body.title ?? null,
        body:         body.body ?? null,
        status:       body.status ?? 'pending',
        reply:        body.reply ?? null,
      }).returningAll().executeTakeFirstOrThrow();
      reply.code(201);
      return row;
    });
  });

  fastify.patch('/reviews/:rid', { preHandler: requireRole(...FIN_ROLES) }, async (request) => {
    const user = request.user;
    const { rid } = request.params as { rid: string };
    const body = reviewSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('product_reviews')
        .set({ ...body, updated_at: new Date() } as any)
        .where('tenant_id', '=', user.tenant_id)
        .where('id', '=', rid)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/reviews/:rid', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { rid } = request.params as { rid: string };
    await withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('product_reviews')
        .where('tenant_id', '=', user.tenant_id)
        .where('id', '=', rid)
        .execute();
    });
    reply.code(204);
    return null;
  });
}
