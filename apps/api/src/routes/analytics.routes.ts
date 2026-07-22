import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { Redis } from 'ioredis';
import { sql } from 'kysely';
import { env } from '../config/env.js';
import type { KPIResponse, StageBottleneck, OfficerPerformance, ClearanceStage } from '@hudumika/types';

// Expected max duration per stage (hours) — business SLA policy used to
// flag real breaches against actual stage_history durations, not a guess.
const STAGE_SLA_HOURS: Record<ClearanceStage, number> = {
  DOCS_RECEIVED: 24, VALIDATION: 24, PERMITS: 72, ENTRY_PREP: 24,
  TANCIS_REG: 12, ASSESSMENT: 48, TAX_PAYMENT: 24, DO_APPLICATION: 24,
  INSPECTION_BOOKING: 24, INSPECTION: 48, GOV_REMARKS: 24, RELEASE: 24,
  ICD_PAYMENT: 12, GATE_PASS: 12, TRANSPORT: 48, DELIVERY: 24,
  EMPTY_RETURN: 48, INVOICING: 24, CLOSED: 0,
};

// Connect to Redis for KPI Caching
let redisClient: Redis | null = null;
try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 1500,
    enableOfflineQueue: false,
  });
  redisClient.on('error', () => {
    // Graceful silent fail for caching
    try {
      redisClient?.disconnect();
    } catch (err) {}
    redisClient = null;
  });
} catch (e) {
  redisClient = null;
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/analytics/kpi
   * Command Center live KPI stats. Cached 60 seconds in Redis.
   */
  fastify.get('/kpi', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SENIOR') }, async (request, reply) => {
    const user = request.user;
    const cacheKey = `tenant:${user.tenant_id}:kpis`;

    // Try cache lookup
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log('⚡ KPI analytics cache HIT');
          return JSON.parse(cached) as KPIResponse;
        }
      } catch (e) {
        // Cache miss
      }
    }

    console.log('🗃️ KPI analytics cache MISS. Computing values...');

    const kpis = await withTenant(user.tenant_id, async (trx) => {
      const now = new Date();
      const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // Active cases
      const activeCountResult = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
        .executeTakeFirst();
      const active_cases = Number(activeCountResult?.cnt ?? 0);

      // Demurrage risk: free_time_end in next 48 hours and not delivered
      const demurrageResult = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
        .where('free_time_end', 'is not', null)
        .where('free_time_end', '<=', next48h)
        .executeTakeFirst();
      const demurrage_risk = Number(demurrageResult?.cnt ?? 0);

      // SLA Breached: stage SLA deadline exceeded
      const slaResult = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
        .where('sla_deadline', '<', now)
        .executeTakeFirst();
      const sla_breached = Number(slaResult?.cnt ?? 0);

      // Delivered today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const deliveredResult = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .where((eb) =>
          eb.or([
            eb('stage', '=', 'DELIVERY'),
            eb('stage', '=', 'CLOSED'),
          ])
        )
        .where('updated_at', '>=', todayStart)
        .executeTakeFirst();
      const delivered_today = Number(deliveredResult?.cnt ?? 0);

      // Penalty exposure (demurrage costs accumulating right now)
      const shipments = await trx
        .selectFrom('shipment_cases')
        .select(['free_time_end', 'stage'])
        .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
        .where('free_time_end', '<', now)
        .execute();

      let penalty_exposure_tzs = 0;
      for (const sh of shipments) {
        if (sh.free_time_end) {
          const ft = new Date(sh.free_time_end);
          const days = Math.ceil((now.getTime() - ft.getTime()) / (1000 * 60 * 60 * 24));
          penalty_exposure_tzs += days * 100000; // 100k TZS per day penalty baseline
        }
      }

      // Cases this month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyCount = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .where('created_at', '>=', monthStart)
        .executeTakeFirst();
      const cases_this_month = Number(monthlyCount?.cnt ?? 0);

      // On-time rate: % of closed cases that never had an SLA_BREACH risk flag raised
      const closedResult = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .where('stage', '=', 'CLOSED')
        .executeTakeFirst();
      const closed_cases = Number(closedResult?.cnt ?? 0);

      let on_time_rate_pct = 100;
      if (closed_cases > 0) {
        const breachedResult = await trx
          .selectFrom('risk_flags')
          .innerJoin('shipment_cases', 'shipment_cases.id', 'risk_flags.shipment_id')
          .select(sql<string>`count(distinct risk_flags.shipment_id)`.as('cnt'))
          .where('risk_flags.type', '=', 'SLA_BREACH')
          .where('shipment_cases.stage', '=', 'CLOSED')
          .executeTakeFirst();
        const breached_closed = Number(breachedResult?.cnt ?? 0);
        on_time_rate_pct = Math.round(((closed_cases - breached_closed) / closed_cases) * 100);
      }

      // CO2 / carbon credits — aggregated across shipments that have been calculated
      const co2Result = await trx
        .selectFrom('shipment_cases')
        .select([
          sql<string>`coalesce(sum(co2_emissions_kg), 0)`.as('total_co2'),
          sql<string>`coalesce(sum(carbon_credits_saved), 0)`.as('total_credits'),
        ])
        .executeTakeFirst();
      const total_co2_emissions_kg = Math.round(Number(co2Result?.total_co2 ?? 0) * 100) / 100;
      const total_carbon_credits_saved = Math.round(Number(co2Result?.total_credits ?? 0) * 10000) / 10000;

      const computed: KPIResponse = {
        active_cases,
        demurrage_risk,
        sla_breached,
        delivered_today,
        penalty_exposure_tzs,
        on_time_rate_pct,
        cases_this_month,
        total_co2_emissions_kg,
        total_carbon_credits_saved,
      };

      return computed;
    });

    // Save to Cache
    if (redisClient) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(kpis), 'EX', 60);
      } catch (e) {
        // Cache set fail
      }
    }

    return kpis;
  });

  /**
   * GET /v1/analytics/bottlenecks
   * Analyzes stage history durations to identify high cycle times
   */
  fastify.get('/bottlenecks', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR') }, async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      // Aggregate avg/p90 duration and case count from stage_history
      const history = await trx
        .selectFrom('stage_history')
        .select([
          'stage',
          trx.fn.avg('duration_h').as('avg_h'),
          sql<number>`percentile_cont(0.9) within group (order by duration_h)`.as('p90_h'),
          trx.fn.count('id').as('cnt'),
        ])
        .where('duration_h', 'is not', null)
        .groupBy('stage')
        .execute();

      // Real breach counts: stage_history rows that exceeded the stage's SLA
      // hours. Two branches — legacy stage_history rows (stage is one of the
      // 18 ClearanceStage literals) use the static STAGE_SLA_HOURS table;
      // custom-workflow rows (stage is a workflow_steps.id) join that table
      // for its own sla_hours instead, since a step UUID has no entry in
      // STAGE_SLA_HOURS.
      const legacyBreaches = await trx
        .selectFrom('stage_history')
        .select(['stage', trx.fn.count('id').as('cnt')])
        .where('duration_h', 'is not', null)
        .where((eb) =>
          eb.or(
            (Object.keys(STAGE_SLA_HOURS) as ClearanceStage[]).map((st) =>
              eb.and([eb('stage', '=', st), eb('duration_h', '>', STAGE_SLA_HOURS[st])])
            )
          )
        )
        .groupBy('stage')
        .execute();

      const customBreaches = await trx
        .selectFrom('stage_history')
        .innerJoin('workflow_steps', 'workflow_steps.id', 'stage_history.stage')
        .select(['stage_history.stage as stage', trx.fn.count('stage_history.id').as('cnt')])
        .where('stage_history.duration_h', 'is not', null)
        .where('stage_history.tenant_id', '=', user.tenant_id)
        .whereRef('stage_history.duration_h', '>', 'workflow_steps.sla_hours')
        .groupBy('stage_history.stage')
        .execute();

      const breachByStage = new Map([...legacyBreaches, ...customBreaches].map((b) => [b.stage, Number(b.cnt)]));

      const bottlenecks: StageBottleneck[] = history.map((h) => ({
        stage: h.stage,
        avg_hours: parseFloat(Number(h.avg_h || 0).toFixed(1)),
        p90_hours: parseFloat(Number(h.p90_h || 0).toFixed(1)),
        case_count: Number(h.cnt),
        sla_breaches: breachByStage.get(h.stage) ?? 0,
      }));

      return { data: bottlenecks };
    });
  });

  /**
   * GET /v1/analytics/officers
   * Track performance metrics across operational clearing officers
   */
  fastify.get('/officers', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      const officers = await trx
        .selectFrom('users')
        .select(['id', 'name', 'role'])
        .where('role', 'in', ['OFFICER', 'JUNIOR', 'SENIOR'])
        .where('active', '=', true)
        .execute();

      const shipments = await trx
        .selectFrom('shipment_cases')
        .select(['id', 'assigned_to', 'stage', 'created_at'])
        .execute();

      // Real close timestamps per shipment, from stage_history's CLOSED entry
      const closedEntries = await trx
        .selectFrom('stage_history')
        .select(['shipment_id', 'entered_at'])
        .where('stage', '=', 'CLOSED')
        .execute();
      const closedAtByShipment = new Map(closedEntries.map((c) => [c.shipment_id, c.entered_at]));

      // Real demurrage incidents per shipment
      const demurrageFlags = await trx
        .selectFrom('risk_flags')
        .select(['shipment_id'])
        .where('type', '=', 'DEMURRAGE')
        .execute();
      const demurrageShipmentIds = new Set(demurrageFlags.map((f) => f.shipment_id));

      const performanceList: OfficerPerformance[] = [];

      for (const off of officers) {
        const offShipments = shipments.filter((s) => s.assigned_to === off.id);
        const active_cases = offShipments.filter((s) => s.stage !== 'CLOSED').length;
        const closedShipments = offShipments.filter((s) => s.stage === 'CLOSED');
        const cases_closed = closedShipments.length;

        const cycleDays = closedShipments
          .map((s) => {
            const closedAt = closedAtByShipment.get(s.id);
            if (!closedAt) return null;
            return (new Date(closedAt).getTime() - new Date(s.created_at).getTime()) / 86_400_000;
          })
          .filter((d): d is number => d !== null && d >= 0);
        const avg_days = cycleDays.length > 0
          ? parseFloat((cycleDays.reduce((s, d) => s + d, 0) / cycleDays.length).toFixed(1))
          : 0;

        const penalties_caused = offShipments.filter((s) => demurrageShipmentIds.has(s.id)).length;

        performanceList.push({
          user_id: off.id,
          name: off.name,
          cases_closed,
          active_cases,
          avg_days,
          penalties_caused,
        });
      }

      return { data: performanceList };
    });
  });

  /**
   * GET /v1/analytics/customer-overview
   * Backs the CRM "Customer Overview" dashboard: shipment status mix,
   * declaration activity, top customers, and a lines-based financial
   * summary — all computed from real rows, not display copy.
   */
  fastify.get('/customer-overview', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SENIOR') }, async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const overdueThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // ── Shipment status breakdown ──────────────────────────────
      // Bucketed by lifecycle stage — DOCS_RECEIVED..GATE_PASS are still
      // physically at the port; ASSESSMENT..GOV_REMARKS are customs-side
      // holds; TRANSPORT is on the road; DELIVERY onward is cleared.
      const STAGE_BUCKET: Record<string, 'AT_PORT' | 'CUSTOMS_HOLD' | 'IN_TRANSIT' | 'CLEARED'> = {
        DOCS_RECEIVED: 'AT_PORT', VALIDATION: 'AT_PORT', PERMITS: 'AT_PORT', ENTRY_PREP: 'AT_PORT',
        TANCIS_REG: 'AT_PORT', RELEASE: 'AT_PORT', ICD_PAYMENT: 'AT_PORT', GATE_PASS: 'AT_PORT',
        ASSESSMENT: 'CUSTOMS_HOLD', TAX_PAYMENT: 'CUSTOMS_HOLD', DO_APPLICATION: 'CUSTOMS_HOLD',
        INSPECTION_BOOKING: 'CUSTOMS_HOLD', INSPECTION: 'CUSTOMS_HOLD', GOV_REMARKS: 'CUSTOMS_HOLD',
        TRANSPORT: 'IN_TRANSIT',
        DELIVERY: 'CLEARED', EMPTY_RETURN: 'CLEARED', INVOICING: 'CLEARED', CLOSED: 'CLEARED',
      };

      const shipments = await trx.selectFrom('shipment_cases')
        .select(['id', 'stage', 'customer_id', 'created_at', 'free_time_end', 'sla_deadline'])
        .execute();

      const shipmentStatus = { IN_TRANSIT: 0, AT_PORT: 0, CUSTOMS_HOLD: 0, CLEARED: 0 };
      shipments.forEach(s => { shipmentStatus[STAGE_BUCKET[s.stage] ?? 'AT_PORT']++; });

      const activeShipments = shipments.filter(s => s.stage !== 'CLOSED');
      const clearedThisMonth = shipments.filter(s => (s.stage === 'DELIVERY' || s.stage === 'CLOSED') && s.created_at >= monthStart).length;
      const pendingCustoms = shipments.filter(s => STAGE_BUCKET[s.stage] === 'CUSTOMS_HOLD').length;
      const demurrageRisk = activeShipments.filter(s => s.free_time_end && s.free_time_end <= next48h).length;
      const slaBreached = activeShipments.filter(s => s.sla_deadline && s.sla_deadline < now).length;

      // ── Declarations today / pending ───────────────────────────
      const declarations = await trx.selectFrom('declarations')
        .select(['id', 'status', 'created_at', 'updated_at'])
        .execute();
      const declFiledToday = declarations.filter(d => d.created_at >= todayStart).length;
      const declApprovedToday = declarations.filter(d => ['ACCEPTED', 'RELEASED'].includes(d.status) && d.updated_at >= todayStart).length;
      const declPendingReview = declarations.filter(d => ['VALIDATED', 'SAVED', 'TRANSFERRED', 'ASSESSED'].includes(d.status)).length;
      const declCancelled = declarations.filter(d => d.status === 'CANCELLED' && d.updated_at >= todayStart).length;

      // Document compliance: % of this month's declarations with at least one attachment on file.
      const monthDeclIds = declarations.filter(d => d.created_at >= monthStart).map(d => d.id);
      let documentCompliancePct = 100;
      if (monthDeclIds.length > 0) {
        const withAttachments = await trx.selectFrom('declaration_attachments')
          .select(sql<string>`count(distinct declaration_id)`.as('cnt'))
          .where('declaration_id', 'in', monthDeclIds)
          .executeTakeFirst();
        documentCompliancePct = Math.round((Number(withAttachments?.cnt ?? 0) / monthDeclIds.length) * 100);
      }

      // ── Financial summary (this month's sales invoices) ────────
      const invoices = await trx.selectFrom('sales_invoices')
        .select(['id', 'customer_id', 'client_name', 'status', 'received', 'due_date', 'bill_date'])
        .where('bill_date', '>=', monthStart)
        .execute();
      const invoiceIds = invoices.map(i => i.id);
      const lines = invoiceIds.length > 0
        ? await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', 'in', invoiceIds).execute()
        : [];
      const totalByInvoice = new Map<string, number>();
      lines.forEach(l => {
        const amt = Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100);
        totalByInvoice.set(l.invoice_id, (totalByInvoice.get(l.invoice_id) ?? 0) + amt);
      });

      let totalInvoiced = 0, totalCollected = 0, totalOverdue = 0;
      const shipmentsByCustomer = new Map<string, number>();
      const invoicedByCustomer = new Map<string, number>();
      shipments.filter(s => s.created_at >= monthStart).forEach(s => {
        shipmentsByCustomer.set(s.customer_id, (shipmentsByCustomer.get(s.customer_id) ?? 0) + 1);
      });
      invoices.forEach(inv => {
        const total = totalByInvoice.get(inv.id) ?? 0;
        totalInvoiced += total;
        totalCollected += Number(inv.received || 0);
        if (inv.customer_id) invoicedByCustomer.set(inv.customer_id, (invoicedByCustomer.get(inv.customer_id) ?? 0) + total);
        if (inv.due_date && new Date(inv.due_date) < overdueThreshold && total > Number(inv.received || 0)) {
          totalOverdue += total - Number(inv.received || 0);
        }
      });
      const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);

      // ── Top customers by shipment volume this month ────────────
      const topCustomerIds = [...shipmentsByCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
      const customerRows = topCustomerIds.length > 0
        ? await trx.selectFrom('customers').select(['id', 'name']).where('id', 'in', topCustomerIds).execute()
        : [];
      const customerNameById = new Map(customerRows.map(c => [c.id, c.name]));
      const topCustomers = topCustomerIds.map(id => ({
        name: customerNameById.get(id) ?? 'Unknown Customer',
        shipments: shipmentsByCustomer.get(id) ?? 0,
        invoiced_mtd: Math.round(invoicedByCustomer.get(id) ?? 0),
      }));

      // ── On-time clearance rate (mirrors /kpi) ───────────────────
      const closedCases = shipments.filter(s => s.stage === 'CLOSED');
      let onTimeRatePct = 100;
      if (closedCases.length > 0) {
        const closedIds = closedCases.map(s => s.id);
        const breached = await trx.selectFrom('risk_flags')
          .select(sql<string>`count(distinct shipment_id)`.as('cnt'))
          .where('type', '=', 'SLA_BREACH')
          .where('shipment_id', 'in', closedIds)
          .executeTakeFirst();
        onTimeRatePct = Math.round(((closedCases.length - Number(breached?.cnt ?? 0)) / closedCases.length) * 100);
      }

      return {
        kpis: {
          active_shipments: activeShipments.length,
          cleared_this_month: clearedThisMonth,
          pending_customs: pendingCustoms,
          outstanding_duties_tzs: Math.round(totalOverdue),
        },
        status_cards: {
          on_time_clearance_pct: onTimeRatePct,
          document_compliance_pct: documentCompliancePct,
          at_risk_shipments: demurrageRisk + slaBreached,
          active_shipment_count: activeShipments.length,
          freight_revenue_mtd_tzs: Math.round(totalInvoiced),
        },
        shipment_status: shipmentStatus,
        declarations_today: {
          filed: declFiledToday,
          approved: declApprovedToday,
          pending_review: declPendingReview,
          cancelled: declCancelled,
        },
        top_customers: topCustomers,
        finance_summary: {
          total_invoiced_mtd: Math.round(totalInvoiced),
          collected_mtd: Math.round(totalCollected),
          outstanding_mtd: Math.round(totalOutstanding),
          overdue_30d: Math.round(totalOverdue),
        },
      };
    });
  });

  /**
   * GET /v1/analytics/carbon
   * Carbon portfolio — rolls up the per-shipment GLEC emissions estimate
   * (co2.service.ts) by transport mode, customer, and month. This is an
   * internal ESG reporting figure, not a registry-issued tradeable credit.
   */
  fastify.get('/carbon', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SENIOR') }, async (request, reply) => {
    const user = request.user;

    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx
        .selectFrom('shipment_cases as sc')
        .leftJoin('customers as c', 'c.id', 'sc.customer_id')
        .select([
          'sc.id', 'sc.type', 'sc.customer_id', 'c.name as customer_name',
          'sc.co2_emissions_kg', 'sc.carbon_credits_saved', 'sc.created_at',
        ])
        .where('sc.deleted_at', 'is', null)
        .execute();

      const calculated = rows.filter((r) => r.co2_emissions_kg != null);
      const uncalculated_shipment_count = rows.length - calculated.length;

      const total_co2_kg = calculated.reduce((s, r) => s + Number(r.co2_emissions_kg ?? 0), 0);
      const total_credits = calculated.reduce((s, r) => s + Number(r.carbon_credits_saved ?? 0), 0);

      // Bucket ShipmentType (SEA_FCL/SEA_LCL/AIR/ROAD/RAIL/BULK) into transport mode
      const modeOf = (type: string) => type.startsWith('SEA') ? 'SEA' : type.startsWith('AIR') ? 'AIR' : type.startsWith('ROAD') ? 'ROAD' : type.startsWith('RAIL') ? 'RAIL' : type;

      const byMode = new Map<string, { co2_kg: number; credits: number; shipment_count: number }>();
      const byCustomer = new Map<string, { customer_name: string; co2_kg: number; credits: number; shipment_count: number }>();
      const byMonth = new Map<string, { co2_kg: number; credits: number; shipment_count: number }>();

      for (const r of calculated) {
        const mode = modeOf(r.type);
        const m = byMode.get(mode) ?? { co2_kg: 0, credits: 0, shipment_count: 0 };
        m.co2_kg += Number(r.co2_emissions_kg ?? 0);
        m.credits += Number(r.carbon_credits_saved ?? 0);
        m.shipment_count += 1;
        byMode.set(mode, m);

        const custKey = r.customer_id || 'unknown';
        const cu = byCustomer.get(custKey) ?? { customer_name: r.customer_name || 'Unknown', co2_kg: 0, credits: 0, shipment_count: 0 };
        cu.co2_kg += Number(r.co2_emissions_kg ?? 0);
        cu.credits += Number(r.carbon_credits_saved ?? 0);
        cu.shipment_count += 1;
        byCustomer.set(custKey, cu);

        const created = new Date(r.created_at);
        const monthKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
        const mo = byMonth.get(monthKey) ?? { co2_kg: 0, credits: 0, shipment_count: 0 };
        mo.co2_kg += Number(r.co2_emissions_kg ?? 0);
        mo.credits += Number(r.carbon_credits_saved ?? 0);
        mo.shipment_count += 1;
        byMonth.set(monthKey, mo);
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const round4 = (n: number) => Math.round(n * 10000) / 10000;

      return {
        total_co2_kg: round2(total_co2_kg),
        total_credits: round4(total_credits),
        calculated_shipment_count: calculated.length,
        uncalculated_shipment_count,
        avg_co2_per_shipment_kg: calculated.length > 0 ? round2(total_co2_kg / calculated.length) : 0,
        by_mode: [...byMode.entries()]
          .map(([mode, v]) => ({ mode, co2_kg: round2(v.co2_kg), credits: round4(v.credits), shipment_count: v.shipment_count }))
          .sort((a, b) => b.co2_kg - a.co2_kg),
        by_customer: [...byCustomer.entries()]
          .map(([customer_id, v]) => ({ customer_id, customer_name: v.customer_name, co2_kg: round2(v.co2_kg), credits: round4(v.credits), shipment_count: v.shipment_count }))
          .sort((a, b) => b.co2_kg - a.co2_kg),
        by_month: [...byMonth.entries()]
          .map(([month, v]) => ({ month, co2_kg: round2(v.co2_kg), credits: round4(v.credits), shipment_count: v.shipment_count }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    });
  });
}
