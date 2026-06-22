import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import type { KPIResponse, StageBottleneck, OfficerPerformance, ClearanceStage } from '@clearos/types';

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

      const computed: KPIResponse = {
        active_cases,
        demurrage_risk,
        sla_breached,
        delivered_today,
        penalty_exposure_tzs,
        on_time_rate_pct: 85, // baseline
        cases_this_month,
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
      // Aggregate avg duration and case count from stage_history
      const history = await trx
        .selectFrom('stage_history')
        .select([
          'stage',
          trx.fn.avg('duration_h').as('avg_h'),
          trx.fn.count('id').as('cnt'),
        ])
        .where('duration_h', 'is not', null)
        .groupBy('stage')
        .execute();

      const bottlenecks: StageBottleneck[] = history.map((h) => ({
        stage: h.stage as ClearanceStage,
        avg_hours: parseFloat(Number(h.avg_h || 0).toFixed(1)),
        p90_hours: parseFloat((Number(h.avg_h || 0) * 1.5).toFixed(1)), // mock percentile
        case_count: Number(h.cnt),
        sla_breaches: Math.floor(Number(h.cnt) * 0.15), // mock breach count
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
        .select(['id', 'name'])
        .where('role', '=', 'OFFICER')
        .where('active', '=', true)
        .execute();

      const shipments = await trx
        .selectFrom('shipment_cases')
        .select(['id', 'assigned_to', 'stage'])
        .execute();

      const performanceList: OfficerPerformance[] = [];

      for (const off of officers) {
        const offShipments = shipments.filter((s) => s.assigned_to === off.id);
        const active_cases = offShipments.filter((s) => s.stage !== 'CLOSED').length;
        const cases_closed = offShipments.filter((s) => s.stage === 'CLOSED').length;

        performanceList.push({
          user_id: off.id,
          name: off.name,
          cases_closed,
          active_cases,
          avg_days: 8.5, // baseline
          penalties_caused: 0,
        });
      }

      return { data: performanceList };
    });
  });
}
