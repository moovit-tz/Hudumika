import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { disposeFixedAsset } from '../services/fixed-assets.service.js';
import { GLService } from '../services/gl.service.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(300),
  category: z.string().max(50).optional(),
  asset_account_code: z.enum(['1501', '1502']).optional(),
  acquisition_date: z.string(),
  cost: z.number().positive(),
  salvage_value: z.number().min(0).optional(),
  useful_life_months: z.number().int().positive(),
  notes: z.string().max(2000).optional(),
  // M5 of the corporate-tax build-out — acquisition now posts to the GL;
  // this decides which side of the entry funds it. Paid outright vs bought
  // on credit are genuinely different facts, not a cosmetic choice.
  funded_by: z.enum(['CASH', 'AP']).default('CASH'),
});

export async function fixedAssetRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const assets = await trx.selectFrom('fixed_assets').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('acquisition_date', 'desc').execute();
      const ids = assets.map(a => a.id);
      const deprRows = ids.length
        ? await trx.selectFrom('fixed_asset_depreciation_entries').select(['asset_id', 'amount']).where('asset_id', 'in', ids).execute()
        : [];
      const accumByAsset = new Map<string, number>();
      for (const r of deprRows) accumByAsset.set(r.asset_id, (accumByAsset.get(r.asset_id) ?? 0) + Number(r.amount));
      return assets.map(a => {
        const accumulated = accumByAsset.get(a.id) ?? 0;
        return { ...a, accumulated_depreciation: accumulated, net_book_value: Number(a.cost) - accumulated };
      });
    });
  });

  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const body = createSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const assetAccountCode = body.asset_account_code || '1501';
      const asset = await trx.insertInto('fixed_assets').values({
        tenant_id: user.tenant_id,
        name: body.name,
        category: body.category || 'OTHER',
        asset_account_code: assetAccountCode,
        acquisition_date: body.acquisition_date,
        cost: body.cost,
        salvage_value: body.salvage_value ?? 0,
        useful_life_months: body.useful_life_months,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      // Acquisition posting (M5) — debit the asset account for its cost,
      // credit cash or AP depending on how it was funded. Without this the
      // asset account never carries a real debit, so a later disposal
      // (which does post) drives it net-credit, and the balance sheet is
      // wrong the whole time an asset is held.
      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: asset.acquisition_date,
        description: `Fixed asset acquired: ${asset.name}`,
        sourceModule: 'MANUAL', sourceId: asset.id, createdBy: user.sub,
        lines: [
          { accountCode: assetAccountCode, debit: Number(asset.cost), credit: 0, description: `Acquisition: ${asset.name}` },
          { accountCode: body.funded_by === 'AP' ? '2000' : '1010', debit: 0, credit: Number(asset.cost), description: `Acquisition: ${asset.name}` },
        ],
      });
      const updated = await trx.updateTable('fixed_assets').set({ acquisition_journal_entry_id: journalEntryId })
        .where('id', '=', asset.id).returningAll().executeTakeFirstOrThrow();

      return reply.status(201).send(updated);
    });
  });

  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = z.object({ name: z.string().max(300).optional(), category: z.string().max(50).optional(), notes: z.string().max(2000).optional() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('fixed_assets').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Fixed asset not found' });
      const asset = await trx.updateTable('fixed_assets').set({ ...body, updated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return asset;
    });
  });

  // Computed projection, not stored data — what the schedule WILL look
  // like if depreciation runs every month from here on, not a record of
  // what already happened (that's fixed_asset_depreciation_entries).
  fastify.get('/:id/schedule', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const asset = await trx.selectFrom('fixed_assets').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!asset) return reply.status(404).send({ error: 'Fixed asset not found' });
      const depreciableBase = Number(asset.cost) - Number(asset.salvage_value);
      const monthly = depreciableBase / asset.useful_life_months;
      const schedule: { period: string; amount: number; accumulated: number; net_book_value: number }[] = [];
      const start = new Date(asset.acquisition_date);
      let accumulated = 0;
      for (let m = 0; m < asset.useful_life_months; m++) {
        const d = new Date(start.getFullYear(), start.getMonth() + m + 1, 1);
        const amount = Math.round(Math.min(monthly, depreciableBase - accumulated) * 100) / 100;
        accumulated = Math.round((accumulated + amount) * 100) / 100;
        schedule.push({ period: d.toISOString().slice(0, 7), amount, accumulated, net_book_value: Number(asset.cost) - accumulated });
      }
      return { asset, schedule };
    });
  });

  fastify.post('/:id/dispose', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { disposed_at, proceeds } = z.object({ disposed_at: z.string(), proceeds: z.number().min(0) }).parse(request.body);
    try {
      await disposeFixedAsset(user.tenant_id, id, disposed_at, proceeds);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const existing = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('fixed_assets').select(['id', 'acquisition_journal_entry_id']).where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
    );
    if (!existing) return reply.status(404).send({ error: 'Fixed asset not found' });
    const posted = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('fixed_asset_depreciation_entries').select('id').where('asset_id', '=', id).executeTakeFirst()
    );
    if (posted) return reply.status(409).send({ error: 'This asset already has depreciation posted — dispose it instead of deleting it.' });

    // The acquisition posting (M5) must be reversed, not left dangling — a
    // deleted asset with no offsetting entry would sit on the balance
    // sheet forever with nothing behind it. Safe to reverse unconditionally
    // here: the depreciation guard above already proves no other entry
    // (depreciation or disposal) shares this asset's sourceId yet.
    if (existing.acquisition_journal_entry_id) {
      await GLService.reverseBySource(user.tenant_id, 'MANUAL', id, user.sub, 'Fixed asset deleted before any depreciation was posted');
    }
    return withTenant(user.tenant_id, async (trx) => {
      const r = await trx.deleteFrom('fixed_assets').where('id', '=', id).execute();
      return { success: true, deleted: Number(r[0]?.numDeletedRows ?? 0) };
    });
  });
}
