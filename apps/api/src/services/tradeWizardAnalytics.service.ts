import { sql } from 'kysely';
import { db } from '../db/client.js';

/**
 * SuperAdmin-only, cross-tenant analytics over the Trade Compliance Wizard's
 * search/run logs (trade_wizard_searches, trade_wizard_runs). Deliberately
 * separate from tradeWizard.service.ts (tenant-scoped, per-request logic) —
 * this service intentionally aggregates ACROSS tenants, which only
 * SuperAdmin-gated routes should ever call.
 */

export interface AnalyticsFilters {
  date_from?: string;
  date_to?: string;
  tenant_id?: string;
}

function applyDateFilters<T extends { where: any }>(qb: any, column: string, filters: AnalyticsFilters) {
  let q = qb;
  if (filters.date_from) q = q.where(column, '>=', new Date(filters.date_from));
  if (filters.date_to) q = q.where(column, '<=', new Date(filters.date_to));
  if (filters.tenant_id) q = q.where('tenant_id', '=', filters.tenant_id);
  return q;
}

export const tradeWizardAnalyticsService = {
  async getSummary(filters: AnalyticsFilters) {
    let searchQ = db.selectFrom('trade_wizard_searches').select(eb => [
      eb.fn.countAll().as('total_searches'),
      eb.fn.count('tenant_id').distinct().as('unique_tenants'),
      sql<number>`COUNT(*) FILTER (WHERE results_count = 0)`.as('no_result_searches'),
    ]);
    searchQ = applyDateFilters(searchQ, 'created_at', filters);
    const searchRow = await searchQ.executeTakeFirst();

    let runQ = db.selectFrom('trade_wizard_runs').select(eb => eb.fn.countAll().as('total_runs'));
    runQ = applyDateFilters(runQ, 'created_at', filters);
    const runRow = await runQ.executeTakeFirst();

    const totalSearches = Number(searchRow?.total_searches ?? 0);
    const totalRuns = Number(runRow?.total_runs ?? 0);
    const noResultSearches = Number(searchRow?.no_result_searches ?? 0);

    return {
      total_searches: totalSearches,
      total_runs: totalRuns,
      unique_tenants: Number(searchRow?.unique_tenants ?? 0),
      no_result_searches: noResultSearches,
      no_result_rate: totalSearches > 0 ? Math.round((noResultSearches / totalSearches) * 1000) / 10 : 0,
      conversion_rate: totalSearches > 0 ? Math.round((totalRuns / totalSearches) * 1000) / 10 : 0,
    };
  },

  async getTopSearchTerms(filters: AnalyticsFilters, limit = 20) {
    let q = db.selectFrom('trade_wizard_searches')
      .select(eb => [
        sql<string>`lower(trim(query))`.as('term'),
        eb.fn.countAll().as('count'),
        sql<number>`COUNT(*) FILTER (WHERE results_count = 0)`.as('no_result_count'),
      ])
      .where('query', 'is not', null)
      .where(sql<boolean>`trim(query) <> ''`);
    q = applyDateFilters(q, 'created_at', filters);
    const rows = await q.groupBy(sql`lower(trim(query))`).orderBy('count', 'desc').limit(limit).execute();
    return rows.map(r => ({ term: r.term, count: Number(r.count), no_result_count: Number(r.no_result_count) }));
  },

  async getTopProcedures(filters: AnalyticsFilters, limit = 20) {
    let q = db.selectFrom('trade_wizard_runs')
      .innerJoin('trade_procedures', 'trade_procedures.id', 'trade_wizard_runs.procedure_id')
      .select(eb => [
        'trade_procedures.id as procedure_id', 'trade_procedures.name', 'trade_procedures.kind',
        eb.fn.countAll().as('run_count'),
      ]);
    q = applyDateFilters(q, 'trade_wizard_runs.created_at' as any, filters);
    const rows = await q.groupBy(['trade_procedures.id', 'trade_procedures.name', 'trade_procedures.kind']).orderBy('run_count', 'desc').limit(limit).execute();
    return rows.map(r => ({ procedure_id: r.procedure_id, name: r.name, kind: r.kind, run_count: Number(r.run_count) }));
  },

  async getSearchesByKind(filters: AnalyticsFilters) {
    let q = db.selectFrom('trade_wizard_searches').select(eb => ['kind', eb.fn.countAll().as('count')]);
    q = applyDateFilters(q, 'created_at', filters);
    const rows = await q.groupBy('kind').orderBy('count', 'desc').execute();
    return rows.map(r => ({ kind: r.kind ?? 'unspecified', count: Number(r.count) }));
  },

  async getDailyTrend(filters: AnalyticsFilters, days = 30) {
    const from = filters.date_from ?? new Date(Date.now() - days * 86_400_000).toISOString();
    let searchQ = db.selectFrom('trade_wizard_searches')
      .select(eb => [sql<string>`date(created_at)`.as('day'), eb.fn.countAll().as('searches')])
      .where('created_at', '>=', new Date(from));
    if (filters.tenant_id) searchQ = searchQ.where('tenant_id', '=', filters.tenant_id);
    const searchRows = await searchQ.groupBy(sql`date(created_at)`).orderBy('day').execute();

    let runQ = db.selectFrom('trade_wizard_runs')
      .select(eb => [sql<string>`date(created_at)`.as('day'), eb.fn.countAll().as('runs')])
      .where('created_at', '>=', new Date(from));
    if (filters.tenant_id) runQ = runQ.where('tenant_id', '=', filters.tenant_id);
    const runRows = await runQ.groupBy(sql`date(created_at)`).orderBy('day').execute();

    const byDay = new Map<string, { day: string; searches: number; runs: number }>();
    for (const r of searchRows) byDay.set(r.day, { day: r.day, searches: Number(r.searches), runs: 0 });
    for (const r of runRows) {
      const existing = byDay.get(r.day);
      if (existing) existing.runs = Number(r.runs);
      else byDay.set(r.day, { day: r.day, searches: 0, runs: Number(r.runs) });
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  },

  async getByTenant(filters: AnalyticsFilters, limit = 25) {
    let searchQ = db.selectFrom('trade_wizard_searches')
      .innerJoin('tenants', 'tenants.id', 'trade_wizard_searches.tenant_id')
      .select(eb => ['tenants.id as tenant_id', 'tenants.name as tenant_name', eb.fn.countAll().as('search_count')]);
    searchQ = applyDateFilters(searchQ, 'trade_wizard_searches.created_at' as any, filters);
    const searchRows = await searchQ.groupBy(['tenants.id', 'tenants.name']).orderBy('search_count', 'desc').limit(limit).execute();

    const runCounts = await db.selectFrom('trade_wizard_runs')
      .select(['tenant_id', db.fn.countAll().as('run_count')])
      .groupBy('tenant_id')
      .execute();
    const runsByTenant = new Map(runCounts.map(r => [r.tenant_id, Number(r.run_count)]));

    return searchRows.map(r => ({
      tenant_id: r.tenant_id, tenant_name: r.tenant_name,
      search_count: Number(r.search_count), run_count: runsByTenant.get(r.tenant_id) ?? 0,
    }));
  },

  /** The most actionable view: real searches that found nothing — tells you which procedures to research next. */
  async getNoResultSearches(filters: AnalyticsFilters, limit = 30) {
    let q = db.selectFrom('trade_wizard_searches')
      .select(eb => [sql<string>`lower(trim(query))`.as('term'), eb.fn.countAll().as('count')])
      .where('results_count', '=', 0)
      .where('query', 'is not', null)
      .where(sql<boolean>`trim(query) <> ''`);
    q = applyDateFilters(q, 'created_at', filters);
    const rows = await q.groupBy(sql`lower(trim(query))`).orderBy('count', 'desc').limit(limit).execute();
    return rows.map(r => ({ term: r.term, count: Number(r.count) }));
  },
};
