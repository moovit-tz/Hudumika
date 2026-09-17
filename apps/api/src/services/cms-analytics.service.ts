import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import type { CmsAnalyticsResourceType, CmsPageviewSummary } from '@hudumika/types';

async function resolveTenantBySlug(tenantSlug: string) {
  return dbPlatform.selectFrom('tenants').select('id').where('slug', '=', tenantSlug).executeTakeFirst();
}

/**
 * §33 of the CMS master brief — Analytics. Deliberately just a count: no
 * IP address, no user agent, no cookie, no per-visitor identity at all,
 * per the brief's own "privacy-conscious" framing and avoiding a
 * third-party analytics dependency it also asks for. One row per
 * (resource, day) — migration 479's own UNIQUE constraint — incremented
 * in place on each beacon hit via a real upsert, rather than one row per
 * raw view event plus a separate nightly aggregation job: the same
 * bounded-storage goal "aggregate nightly" was reaching for, reached more
 * directly with no second moving part to keep correct.
 */
export class CMSAnalyticsService {
  /** Public — no tenant auth, the same "resolve by slug, no session"
   *  shape every other public route in this file family uses. Returns
   *  false only when the tenant itself can't be resolved (caller 404s);
   *  a stale or fabricated resourceId is never validated against a real
   *  row — it just accumulates a harmless, orphaned count, no different
   *  from any client-side analytics beacon on the web being spoofable,
   *  and checking existence on every hit would be real DB load for no
   *  real benefit, since this number is never trusted for anything but a
   *  display figure. */
  static async recordView(tenantSlug: string, resourceType: CmsAnalyticsResourceType, resourceId: string): Promise<boolean> {
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) return false;
    const today = new Date().toISOString().slice(0, 10);
    await withTenant(tenant.id, trx =>
      trx.insertInto('cms_pageview_daily')
        .values({ tenant_id: tenant.id, resource_type: resourceType, resource_id: resourceId, day: today, count: 1 })
        .onConflict(oc => oc.columns(['tenant_id', 'resource_type', 'resource_id', 'day'])
          .doUpdateSet({ count: sql`cms_pageview_daily.count + 1` }))
        .execute());
    return true;
  }

  /** One resource's own full picture — total plus its last 30 stored
   *  days, oldest first. A day with zero views has no row at all (never
   *  zero-filled), so `daily` can legitimately be shorter than 30. */
  static async getSummary(tenantId: string, resourceType: CmsAnalyticsResourceType, resourceId: string): Promise<CmsPageviewSummary> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_pageview_daily').select(['day', 'count'])
        .where('tenant_id', '=', tenantId).where('resource_type', '=', resourceType).where('resource_id', '=', resourceId)
        .orderBy('day', 'asc').execute();
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      const daily = rows.slice(-30).map(r => ({ day: String(r.day), count: r.count }));
      return { resource_type: resourceType, resource_id: resourceId, total, daily };
    });
  }

  /** All-time totals for many resources of the same type in one query —
   *  what a Posts/Pages/Entries list view actually needs (a "Views"
   *  column), not N+1 queries per row. */
  static async getTotals(tenantId: string, resourceType: CmsAnalyticsResourceType, resourceIds: string[]): Promise<Record<string, number>> {
    if (!resourceIds.length) return {};
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_pageview_daily')
        .select(['resource_id', sql<string>`sum(count)`.as('total')])
        .where('tenant_id', '=', tenantId).where('resource_type', '=', resourceType).where('resource_id', 'in', resourceIds)
        .groupBy('resource_id').execute();
      return Object.fromEntries(rows.map(r => [r.resource_id, Number(r.total)]));
    });
  }
}
