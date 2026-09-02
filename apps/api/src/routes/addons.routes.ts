import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbPlatform, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import type { Addon } from '@hudumika/types';

// Same MGMT convention billing.routes.ts uses for anything that changes what
// a tenant is charged for — a regular member can browse the catalog (GET /)
// but only these roles can actually add/remove an add-on for their tenant.
const MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const addonCreateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).optional(),
  featureKey: z.string().trim().min(1).max(100),
  monthlyPrice: z.number().optional(),
  annualPrice: z.number().optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
});
const addonPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  featureKey: z.string().trim().min(1).max(100).optional(),
  monthlyPrice: z.number().optional(),
  annualPrice: z.number().optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function toAddon(r: any, activeCompanies?: number, purchased?: boolean): Addon {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description || '',
    featureKey: r.feature_key,
    monthlyPrice: Number(r.monthly_price),
    annualPrice: Number(r.annual_price),
    color: r.color,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    ...(activeCompanies !== undefined ? { activeCompanies } : {}),
    ...(purchased !== undefined ? { purchased } : {}),
  };
}

/**
 * Add-ons — purchasable independent of which base Package a tenant is on
 * (376_package_addons.sql), the "Get more with add-ons" concept next to the
 * plan tiers (see packages.routes.ts, the sibling this deliberately mirrors
 * route-for-route). tenant_addons is the purchase/grant record; an add-on's
 * feature_key is checked in middleware/entitlement.ts alongside
 * package_features, so holding one grants the same real entitlement a base
 * package's own feature list would.
 */
export async function addonsRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/addons — public catalog, same as GET /v1/packages. SuperAdmin's
   * "Get more with add-ons" section and (once a tenant-facing purchase flow
   * exists) Workspace ▸ Billing both read this as the one source of truth.
   */
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = request.user!;
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const rows = await dbPlatform.selectFrom('package_addons').selectAll()
      .where('is_active', '=', true)
      .orderBy('sort_order', 'asc')
      .execute();

    // Which of these does the requesting user's own tenant currently hold —
    // every caller needs this (Subscription ▸ Plans' purchase UI), not just
    // the SuperAdmin catalog-management view.
    const mine = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('tenant_addons').select('addon_code')
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'active')
        .execute()
    );
    const purchasedCodes = new Set(mine.map(m => m.addon_code));

    // The real "X active companies" count only matters to the SuperAdmin
    // catalog view — an ordinary tenant browsing add-ons to buy has no
    // reason to see how many other tenants bought each one.
    if (!isSuperAdmin) return { data: rows.map(r => toAddon(r, undefined, purchasedCodes.has(r.code))) };

    const counts = await dbPlatform.selectFrom('tenant_addons')
      .select(['addon_code', ({ fn }) => fn.countAll<number>().as('count')])
      .where('status', '=', 'active')
      .groupBy('addon_code')
      .execute();
    const countByCode = new Map(counts.map(c => [c.addon_code, Number(c.count)]));

    return { data: rows.map(r => toAddon(r, countByCode.get(r.code) ?? 0, purchasedCodes.has(r.code))) };
  });

  /**
   * POST /v1/addons/:code/purchase — a tenant admin activates a purchasable
   * add-on for their own tenant (upserts an active tenant_addons row). Same
   * "instant activation, no separate checkout step" convention Plans ▸ Change
   * Plan already uses (Subscription.tsx's handleSelectPlan PATCHing
   * /v1/settings) — its cost is folded into the next generated subscription
   * invoice (billing.routes.ts) rather than charged in this call.
   */
  fastify.post<{ Params: { code: string } }>(
    '/:code/purchase',
    { preHandler: [fastify.authenticate, requireRole(...MGMT_ROLES)] },
    async (request, reply) => {
      const user = request.user!;
      const { code } = request.params;
      const addon = await dbPlatform.selectFrom('package_addons').select('id')
        .where('code', '=', code).where('is_active', '=', true).executeTakeFirst();
      if (!addon) return reply.status(404).send({ error: 'Add-on not found' });

      return withTenant(user.tenant_id, async (trx) => {
        const existing = await trx.selectFrom('tenant_addons').select('id')
          .where('tenant_id', '=', user.tenant_id).where('addon_code', '=', code).executeTakeFirst();
        if (existing) {
          return trx.updateTable('tenant_addons')
            .set({ status: 'active', started_at: new Date(), cancelled_at: null, updated_at: new Date() })
            .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
        }
        reply.status(201);
        return trx.insertInto('tenant_addons')
          .values({ tenant_id: user.tenant_id, addon_code: code, status: 'active' })
          .returningAll().executeTakeFirstOrThrow();
      });
    }
  );

  /** POST /v1/addons/:code/cancel — removes the add-on from the requesting tenant's own subscription. */
  fastify.post<{ Params: { code: string } }>(
    '/:code/cancel',
    { preHandler: [fastify.authenticate, requireRole(...MGMT_ROLES)] },
    async (request, reply) => {
      const user = request.user!;
      const { code } = request.params;
      return withTenant(user.tenant_id, async (trx) => {
        const row = await trx.updateTable('tenant_addons')
          .set({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() })
          .where('tenant_id', '=', user.tenant_id).where('addon_code', '=', code).where('status', '=', 'active')
          .returningAll().executeTakeFirst();
        if (!row) return reply.status(404).send({ error: 'This add-on is not active on your subscription.' });
        return row;
      });
    }
  );

  fastify.post('/', { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    const body = addonCreateSchema.parse(request.body);
    const row = await dbPlatform.insertInto('package_addons')
      .values({
        code: body.code.trim(),
        name: body.name.trim(),
        description: body.description?.trim() ?? '',
        feature_key: body.featureKey.trim(),
        monthly_price: body.monthlyPrice ?? 0,
        annual_price: body.annualPrice ?? 0,
        color: body.color ?? '#e8461a',
        sort_order: body.sortOrder ?? 99,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    reply.status(201);
    return toAddon(row, 0);
  });

  fastify.patch<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] },
    async (request, reply) => {
      const { code } = request.params;
      const body = addonPatchSchema.parse(request.body);

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.featureKey !== undefined) updates.feature_key = body.featureKey;
      if (body.monthlyPrice !== undefined) updates.monthly_price = body.monthlyPrice;
      if (body.annualPrice !== undefined) updates.annual_price = body.annualPrice;
      if (body.color !== undefined) updates.color = body.color;
      if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
      if (body.isActive !== undefined) updates.is_active = body.isActive;

      const row = await dbPlatform.updateTable('package_addons').set(updates)
        .where('code', '=', code)
        .returningAll()
        .executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Add-on not found' });

      return toAddon(row);
    }
  );

  /** DELETE /v1/addons/:code — soft delete, same convention as packages.routes.ts. */
  fastify.delete<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] },
    async (request, reply) => {
      const { code } = request.params;
      const row = await dbPlatform.updateTable('package_addons').set({ is_active: false, updated_at: new Date() })
        .where('code', '=', code)
        .returningAll()
        .executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Add-on not found' });

      reply.status(204);
      return null;
    }
  );
}
