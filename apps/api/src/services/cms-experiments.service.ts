import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { sanitizeBlock } from './cms-content.service.js';
import type { CmsExperiment, CreateCmsExperimentInput, UpdateCmsExperimentInput, CmsExperimentVariant } from '@hudumika/types';

export class ExperimentValidationError extends Error {}

function keySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'experiment';
}

function sanitizeVariantBlocks(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) throw new ExperimentValidationError('A variant\'s blocks must be a list.');
  return raw.slice(0, 200).map((b: any) => sanitizeBlock(b, 'experiment'));
}

function toExperiment(row: any): CmsExperiment {
  return {
    id: row.id, tenant_id: row.tenant_id, key: row.key, name: row.name, status: row.status,
    variant_a_blocks: typeof row.variant_a_blocks === 'string' ? JSON.parse(row.variant_a_blocks) : (row.variant_a_blocks ?? []),
    variant_b_blocks: typeof row.variant_b_blocks === 'string' ? JSON.parse(row.variant_b_blocks) : (row.variant_b_blocks ?? []),
    variant_a_views: row.variant_a_views, variant_b_views: row.variant_b_views,
    created_by: row.created_by,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}

/**
 * §35 of the CMS master brief — Experimentation. The map's own text
 * explicitly sequenced this behind §6 (the Designer, to author variants)
 * and §33 (Analytics, to measure them) — both real now, so this is
 * genuinely unblocked rather than theoretically so. Deliberately narrow:
 * two content-author-defined variants, a visitor sticky-assigned to one
 * (localStorage on the client — see BlockPreview.tsx's own
 * ExperimentBlockRenderer), a real view counter per variant incremented
 * server-side. No conversion tracking yet — a real, disclosed limitation:
 * this proves variant delivery and even reach, not which variant is
 * actually winning.
 */
export class CMSExperimentsService {
  static async listExperiments(tenantId: string): Promise<CmsExperiment[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_experiments').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute();
      return rows.map(toExperiment);
    });
  }

  static async getExperiment(tenantId: string, id: string): Promise<CmsExperiment> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('cms_experiments').selectAll()
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      return toExperiment(row);
    });
  }

  static async createExperiment(tenantId: string, userId: string, input: CreateCmsExperimentInput): Promise<CmsExperiment> {
    if (!input.name?.trim()) throw new ExperimentValidationError('Experiment name is required.');
    const variantA = sanitizeVariantBlocks(input.variant_a_blocks ?? []);
    const variantB = sanitizeVariantBlocks(input.variant_b_blocks ?? []);
    return withTenant(tenantId, async (trx) => {
      const base = input.key?.trim() || keySlug(input.name);
      let key = base, n = 2;
      while (await trx.selectFrom('cms_experiments').select('id').where('tenant_id', '=', tenantId).where('key', '=', key).executeTakeFirst()) {
        key = `${base}-${n}`; n++;
      }
      const row = await trx.insertInto('cms_experiments').values({
        tenant_id: tenantId, key, name: input.name.trim(),
        variant_a_blocks: JSON.stringify(variantA), variant_b_blocks: JSON.stringify(variantB),
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return toExperiment(row);
    });
  }

  static async updateExperiment(tenantId: string, id: string, input: UpdateCmsExperimentInput): Promise<CmsExperiment> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new ExperimentValidationError('Experiment name is required.');
        update['name'] = input.name.trim();
      }
      if (input.status !== undefined) update['status'] = input.status;
      if (input.variant_a_blocks !== undefined) update['variant_a_blocks'] = JSON.stringify(sanitizeVariantBlocks(input.variant_a_blocks));
      if (input.variant_b_blocks !== undefined) update['variant_b_blocks'] = JSON.stringify(sanitizeVariantBlocks(input.variant_b_blocks));
      const row = await trx.updateTable('cms_experiments').set(update)
        .where('id', '=', id).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
      return toExperiment(row);
    });
  }

  static async deleteExperiment(tenantId: string, id: string): Promise<void> {
    await withTenant(tenantId, trx => trx.deleteFrom('cms_experiments').where('id', '=', id).where('tenant_id', '=', tenantId).execute());
  }

  // ── Public (unauthenticated) ─────────────────────────────────────────

  private static async resolveTenantBySlug(tenantSlug: string) {
    return dbPlatform.selectFrom('tenants').select('id').where('slug', '=', tenantSlug).executeTakeFirst();
  }

  static async getPublicExperiment(tenantSlug: string, key: string) {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    return withTenant(tenant.id, async (trx) => {
      const row = await trx.selectFrom('cms_experiments').select(['id', 'key', 'status', 'variant_a_blocks', 'variant_b_blocks'])
        .where('tenant_id', '=', tenant.id).where('key', '=', key).executeTakeFirst();
      if (!row) return null;
      return {
        id: row.id, key: row.key, status: row.status,
        variant_a_blocks: typeof row.variant_a_blocks === 'string' ? JSON.parse(row.variant_a_blocks as any) : (row.variant_a_blocks ?? []),
        variant_b_blocks: typeof row.variant_b_blocks === 'string' ? JSON.parse(row.variant_b_blocks as any) : (row.variant_b_blocks ?? []),
      };
    });
  }

  /** Increments the chosen variant's own view counter — a real Postgres
   *  upsert-style `+1`, the same real-time-rather-than-batched posture
   *  §33's own pageview beacon already established. Returns false only
   *  when the tenant/experiment/variant can't be resolved (caller 404s) —
   *  a stopped experiment still records (a content author stopping an
   *  experiment doesn't retroactively invalidate what already ran), the
   *  client simply shouldn't be requesting a variant for one that's
   *  stopped in the first place. */
  static async recordView(tenantSlug: string, key: string, variant: CmsExperimentVariant): Promise<boolean> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return false;
    const column = variant === 'a' ? 'variant_a_views' : 'variant_b_views';
    return withTenant(tenant.id, async (trx) => {
      const result = await trx.updateTable('cms_experiments')
        .set({ [column]: sql`${sql.ref(column)} + 1` })
        .where('tenant_id', '=', tenant.id).where('key', '=', key)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    });
  }
}
