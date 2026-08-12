import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { callAI } from './ai.routes.js';

/**
 * HuduBI — the tenant's data layer surfaced as an executive snapshot.
 *
 * Every figure here is computed from the tenant's OWN rows (customs cases,
 * customers, declarations, finance). There are no invented numbers, no external
 * warehouses, and no fabricated "board narrative": the previous version returned
 * hardcoded constants ($28.4M revenue, 8,420 customers, Snowflake sources) that
 * belonged to no tenant. If a section has no data it returns empty, and the UI
 * says so rather than filling the gap.
 */

const STAGE_LABELS: Record<string, string> = {
  BL_AWB: 'BL / AWB', DOCS_RECEIVED: 'Docs received', PERMITS: 'Permits',
  ENTRY_PREP: 'Entry prep', ASSESSMENT: 'Assessment', INSPECTION_BOOKING: 'Inspection',
  TAX_PAYMENT: 'Tax payment', RELEASE: 'Release', TRANSPORT: 'Transport',
  DELIVERED: 'Delivered', CLOSED: 'Closed',
};
const MODE_LABELS: Record<string, string> = {
  SEA_FCL: 'Sea (FCL)', SEA_LCL: 'Sea (LCL)', AIR: 'Air', ROAD: 'Road', RAIL: 'Rail',
};
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

export async function hudubiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('hudubi'));

  const count = async (trx: any, table: string, tenantId: string) => {
    try {
      const r: any = await sql`SELECT count(*)::int AS n FROM ${sql.table(table)} WHERE tenant_id = ${tenantId}`.execute(trx);
      return Number(r.rows?.[0]?.n ?? 0);
    } catch { return 0; }
  };
  const scalar = async (trx: any, q: any) => { try { const r: any = await q.execute(trx); return Number(r.rows?.[0]?.v ?? 0); } catch { return 0; } };

  // ── Executive dashboard over real tenant data ─────────────────────
  fastify.get('/dashboard', async (req) => {
    const user = req.user;
    const tenantId = user.tenant_id;

    return withTenant(tenantId, async (trx) => {
      const [customers, activeCases, declarations, invoices] = await Promise.all([
        count(trx, 'customers', tenantId),
        count(trx, 'shipment_cases', tenantId),
        count(trx, 'declarations', tenantId),
        count(trx, 'sales_invoices', tenantId),
      ]);

      const consignmentValueUsd = await scalar(trx, sql`SELECT coalesce(sum(cif_value_usd),0)::float AS v FROM shipment_cases WHERE tenant_id = ${tenantId}`);
      const revenueTzs = await scalar(trx, sql`SELECT coalesce(sum(tra_total_incl),0)::float AS v FROM sales_invoices WHERE tenant_id = ${tenantId}`);
      const expensesTzs = (await scalar(trx, sql`SELECT coalesce(sum(amount_tzs),0)::float AS v FROM expenses WHERE tenant_id = ${tenantId}`))
        + (await scalar(trx, sql`SELECT coalesce(sum(amount),0)::float AS v FROM finance_expenses WHERE tenant_id = ${tenantId}`));

      // Records HuduBI is reading across the core tables — the "data layer" size.
      const layerTables = ['customers', 'shipment_cases', 'declarations', 'sales_invoices', 'expenses', 'finance_expenses', 'users', 'hr_attendance', 'payroll_payslips'];
      const layerCounts = await Promise.all(layerTables.map(t => count(trx, t, tenantId)));
      const totalRecords = layerCounts.reduce((s, n) => s + n, 0);

      // Shipment pipeline by stage — custom-workflow UUID stages folded together.
      const stageRows: any = await sql`SELECT stage, count(*)::int AS n FROM shipment_cases WHERE tenant_id = ${tenantId} GROUP BY stage`.execute(trx);
      const stageMap = new Map<string, number>();
      for (const r of (stageRows.rows || [])) {
        const key = isUuid(r.stage) ? 'Custom workflow' : (STAGE_LABELS[r.stage] || r.stage);
        stageMap.set(key, (stageMap.get(key) || 0) + Number(r.n));
      }
      const shipmentPipeline = [...stageMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

      const modeRows: any = await sql`SELECT type, count(*)::int AS n FROM shipment_cases WHERE tenant_id = ${tenantId} GROUP BY type ORDER BY n DESC`.execute(trx);
      const shipmentsByMode = (modeRows.rows || []).map((r: any) => ({ mode: r.type, label: MODE_LABELS[r.type] || r.type, count: Number(r.n) }));

      const segRows: any = await sql`SELECT coalesce(category,'unset') AS category, count(*)::int AS n FROM customers WHERE tenant_id = ${tenantId} GROUP BY 1 ORDER BY n DESC`.execute(trx);
      const customersBySegment = (segRows.rows || []).map((r: any) => ({ segment: r.category, count: Number(r.n) }));

      const monthRows: any = await sql`SELECT to_char(created_at,'YYYY-MM') AS m, count(*)::int AS n FROM shipment_cases WHERE tenant_id = ${tenantId} GROUP BY 1 ORDER BY 1 DESC LIMIT 6`.execute(trx);
      const monthlyVolume = (monthRows.rows || []).map((r: any) => ({ month: r.m, count: Number(r.n) })).reverse();

      const now = new Date();
      return {
        period: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        generatedAt: now.toISOString(),
        dataLayer: { totalRecords, tables: layerTables.length },
        kpis: { consignmentValueUsd, activeCases, customers, declarations, revenueTzs, expensesTzs },
        shipmentPipeline,
        shipmentsByMode,
        customersBySegment,
        monthlyVolume,
      };
    });
  });

  // ── What HuduBI is reading (real connected source) ────────────────
  fastify.get('/data-sources', async (req) => {
    const user = req.user;
    const tenantId = user.tenant_id;
    return withTenant(tenantId, async (trx) => {
      const tables = ['customers', 'shipment_cases', 'declarations', 'sales_invoices', 'expenses', 'users', 'hr_attendance', 'payroll_payslips'];
      const counts = await Promise.all(tables.map(t => count(trx, t, tenantId)));
      const total = counts.reduce((s, n) => s + n, 0);
      // One real source: this platform's own operational database, scoped to the
      // tenant. No Snowflake / BigQuery / S3 — those never existed here.
      return {
        sources: [
          { name: 'Hudumika operational database', type: 'DATABASE', status: 'CONNECTED', recordsCount: total, lastSync: 'Live' },
        ],
        breakdown: tables.map((t, i) => ({ table: t, records: counts[i] })),
      };
    });
  });

  // ── Deeper analytics over real rows ───────────────────────────────
  fastify.get('/analytics', async (req) => {
    const user = req.user;
    const tenantId = user.tenant_id;
    return withTenant(tenantId, async (trx) => {
      const topCustomers: any = await sql`
        SELECT c.name, count(*)::int AS cases, coalesce(sum(s.cif_value_usd),0)::float AS cif
        FROM shipment_cases s JOIN customers c ON c.id = s.customer_id
        WHERE s.tenant_id = ${tenantId} GROUP BY c.name ORDER BY cases DESC, cif DESC LIMIT 6`.execute(trx);
      const cifByMode: any = await sql`
        SELECT type, coalesce(sum(cif_value_usd),0)::float AS cif, count(*)::int AS cases
        FROM shipment_cases WHERE tenant_id = ${tenantId} GROUP BY type ORDER BY cif DESC`.execute(trx);
      const byOrigin: any = await sql`
        SELECT coalesce(nullif(origin_port,''),'Unspecified') AS port, count(*)::int AS n
        FROM shipment_cases WHERE tenant_id = ${tenantId} GROUP BY 1 ORDER BY n DESC LIMIT 6`.execute(trx);
      return {
        topCustomers: (topCustomers.rows || []).map((r: any) => ({ name: r.name, cases: Number(r.cases), cifUsd: Number(r.cif) })),
        cifByMode: (cifByMode.rows || []).map((r: any) => ({ mode: r.type, cifUsd: Number(r.cif), cases: Number(r.cases) })),
        byOriginPort: (byOrigin.rows || []).map((r: any) => ({ port: r.port, count: Number(r.n) })),
      };
    });
  });

  // ── Executive AI narrative over the real figures (BYO key, gated) ──
  fastify.get('/ai-insights', async (req, reply) => {
    const user = req.user;
    const tenantId = user.tenant_id;

    const settings = await withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
      return (row?.settings as any) ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings › Integrations › AI Integration.' });
    }

    const signals = await withTenant(tenantId, async (trx) => {
      const one = async (q: any) => { try { const r: any = await q.execute(trx); return r.rows?.[0] ?? {}; } catch { return {}; } };
      const rows = async (q: any) => { try { const r: any = await q.execute(trx); return r.rows ?? []; } catch { return []; } };
      const kpis = await one(sql`SELECT
        (SELECT count(*) FROM customers WHERE tenant_id=${tenantId})::int AS customers,
        (SELECT count(*) FROM shipment_cases WHERE tenant_id=${tenantId})::int AS active_cases,
        (SELECT count(*) FROM declarations WHERE tenant_id=${tenantId})::int AS declarations,
        (SELECT coalesce(sum(cif_value_usd),0) FROM shipment_cases WHERE tenant_id=${tenantId})::float AS cif_usd,
        (SELECT coalesce(sum(amount_tzs),0) FROM expenses WHERE tenant_id=${tenantId})::float AS expenses_tzs`);
      const modes = await rows(sql`SELECT type AS mode, count(*)::int AS cases FROM shipment_cases WHERE tenant_id=${tenantId} GROUP BY type ORDER BY cases DESC`);
      const segments = await rows(sql`SELECT coalesce(category,'unset') AS segment, count(*)::int AS n FROM customers WHERE tenant_id=${tenantId} GROUP BY 1 ORDER BY n DESC`);
      return { kpis, shipmentsByMode: modes, customersBySegment: segments };
    });

    try {
      const digest = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [{
          role: 'user',
          content: `You are an executive analyst for a customs-clearance and logistics operator. Given this real, computed data (JSON below), write a short board digest (3-5 bullet points, plain text with "- " prefixes, no markdown headers) on the state of the business. Use only the numbers provided; never invent figures, customers, forecasts or trends the data does not contain. If a section is empty or zero, say so plainly rather than embellishing.\n\n${JSON.stringify(signals, null, 2)}`,
        }],
        512, 0.3,
      );
      return { digest, signals };
    } catch (e: any) {
      return reply.status(500).send({ error: e?.message || 'AI request failed' });
    }
  });

  // ── How the snapshot is produced (honest, no fake confidence score) ──
  fastify.get('/explain', async () => {
    return {
      modelName: 'HuduBI aggregation',
      description: 'Direct SQL aggregation over the tenant\'s own operational and finance tables — no external model, no forecast.',
      rationale: 'Every figure is a live count or sum scoped to this tenant. Percentages are shares of the tenant\'s own totals.',
      note: 'HuduBI reports what the data says; it does not predict or invent figures.',
    };
  });
}
