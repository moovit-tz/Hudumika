import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import type { Package, TenantPlan } from '@hudumika/types';

const packageCreateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  monthly_price: z.number().optional(),
  annual_price: z.number().optional(),
  max_users: z.number().int().optional(),
  price_per_seat: z.number().nullable().optional(),
  monthly_item_limit: z.number().int().nullable().optional(),
  storage_limit_bytes: z.number().nullable().optional(),
  features: z.array(z.any()).optional(),
  color: z.string().max(20).optional(),
  popular: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
const packagePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  monthly_price: z.number().optional(),
  annual_price: z.number().optional(),
  max_users: z.number().int().optional(),
  price_per_seat: z.number().nullable().optional(),
  monthly_item_limit: z.number().int().nullable().optional(),
  storage_limit_bytes: z.number().nullable().optional(),
  features: z.array(z.any()).optional(),
  color: z.string().max(20).optional(),
  popular: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

function toPackage(r: any): Package {
  return {
    id: r.id,
    code: r.code as TenantPlan,
    name: r.name,
    monthly_price: Number(r.monthly_price),
    annual_price: Number(r.annual_price),
    max_users: r.max_users,
    price_per_seat: r.price_per_seat !== null && r.price_per_seat !== undefined ? Number(r.price_per_seat) : null,
    monthly_item_limit: r.monthly_item_limit ?? null,
    storage_limit_bytes: r.storage_limit_bytes !== null && r.storage_limit_bytes !== undefined ? Number(r.storage_limit_bytes) : null,
    features: r.features,
    color: r.color || '#0d7a6b',
    popular: r.popular,
    is_active: r.is_active,
    sort_order: r.sort_order,
  };
}

export async function packagesRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/packages
   * Public — the signup wizard and Subscription/SuperAdmin pages fetch this
   * as the single source of truth for plan tiers and pricing.
   */
  fastify.get('/', async () => {
    const rows = await dbPlatform.selectFrom('packages').selectAll()
      .where('is_active', '=', true)
      .orderBy('sort_order', 'asc')
      .execute();

    return { data: rows.map(toPackage) };
  });

  /**
   * POST /v1/packages — create a new package (SuperAdmin only).
   */
  fastify.post('/', { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    const body = packageCreateSchema.parse(request.body);

    const row = await dbPlatform.insertInto('packages')
      .values({
        code: body.code.trim(),
        name: body.name.trim(),
        monthly_price: body.monthly_price ?? 0,
        annual_price: body.annual_price ?? 0,
        max_users: body.max_users ?? 0,
        price_per_seat: body.price_per_seat ?? null,
        monthly_item_limit: body.monthly_item_limit ?? null,
        storage_limit_bytes: body.storage_limit_bytes != null ? String(body.storage_limit_bytes) : null,
        features: JSON.stringify(body.features ?? []) as unknown as string[],
        color: body.color ?? '#0d7a6b',
        popular: body.popular ?? false,
        sort_order: body.sort_order ?? 99,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    reply.status(201);
    return toPackage(row);
  });

  /**
   * PATCH /v1/packages/:code — update pricing/features/display (SuperAdmin only).
   */
  fastify.patch<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] },
    async (request, reply) => {
      const { code } = request.params;
      const body = packagePatchSchema.parse(request.body);

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.monthly_price !== undefined) updates.monthly_price = body.monthly_price;
      if (body.annual_price !== undefined) updates.annual_price = body.annual_price;
      if (body.max_users !== undefined) updates.max_users = body.max_users;
      if (body.price_per_seat !== undefined) updates.price_per_seat = body.price_per_seat;
      if (body.monthly_item_limit !== undefined) updates.monthly_item_limit = body.monthly_item_limit;
      if (body.storage_limit_bytes !== undefined) updates.storage_limit_bytes = body.storage_limit_bytes != null ? String(body.storage_limit_bytes) : null;
      if (body.features !== undefined) updates.features = JSON.stringify(body.features);
      if (body.color !== undefined) updates.color = body.color;
      if (body.popular !== undefined) updates.popular = body.popular;
      if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
      if (body.is_active !== undefined) updates.is_active = body.is_active;

      const row = await dbPlatform.updateTable('packages').set(updates)
        .where('code', '=', code)
        .returningAll()
        .executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Package not found' });

      return toPackage(row);
    }
  );

  /**
   * DELETE /v1/packages/:code — soft delete (is_active=false), preserving
   * platform_transactions history that references this package_code.
   */
  fastify.delete<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] },
    async (request, reply) => {
      const { code } = request.params;
      const row = await dbPlatform.updateTable('packages').set({ is_active: false, updated_at: new Date() })
        .where('code', '=', code)
        .returningAll()
        .executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Package not found' });

      reply.status(204);
      return null;
    }
  );
}
