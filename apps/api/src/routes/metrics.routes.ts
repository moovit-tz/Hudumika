import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { listMetricDefinitions, computeMetricValue, METRICS_MGMT_ROLES } from '../services/metrics-registry.service.js';
import { listAlertRules, listAlertEvents, createAlertRule, setAlertRuleEnabled, deleteAlertRule } from '../services/metric-alerts.service.js';

import { listKpiTargets, createOrUpdateKpiTarget, deleteKpiTarget } from '../services/kpi-targets.service.js';

const createAlertSchema = z.object({
  metricKey: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  comparator: z.enum(['below', 'above']),
  threshold: z.number(),
  windowDays: z.number().int().min(1).max(365).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  notifyRoles: z.array(z.string()).optional(),
});

const createKpiTargetSchema = z.object({
  metricKey: z.string().trim().min(1),
  targetValue: z.number(),
  targetDirection: z.enum(['above', 'below']),
  warningThreshold: z.number().nullable().optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).optional(),
  notes: z.string().nullable().optional(),
});

/**
 * The cross-app Metric Registry's HTTP surface — the catalog HuduBI's new
 * Metric Explorer page reads, and the seam a future Query Builder "Metrics"
 * object or a new app's registration step would call into. Gated on the
 * same 'hudubi' entitlement as the rest of HuduBI, since that's where this
 * catalog is currently surfaced; not a SUPER_ADMIN-only surface — any
 * tenant user with HuduBI access can browse metric definitions and read
 * their own tenant's values, same as they already can for HuduBI's
 * existing dashboard widgets.
 */
export async function metricsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('hudubi'));
  // HUD-0024 continuation: matches HUD-0033's HuduBI finding — cross-
  // cutting BI/KPI data reachable by any entitled role, including CUSTOMER;
  // the file's own MGMT_ROLES gradient (restricted metrics, alert/KPI
  // writes) is preserved as-is, this only adds the customer-portal floor.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // GET /v1/metrics/definitions — the catalog. A 'restricted' metric
  // (financial/employee domain) is filtered out server-side for a caller
  // without an MGMT_ROLES-equivalent role, not just hidden client-side.
  fastify.get('/definitions', async (request) => {
    const role = request.user.role;
    const canSeeRestricted = METRICS_MGMT_ROLES.includes(role);
    const all = await listMetricDefinitions();
    const visible = all.filter(d => d.visibility === 'standard' || canSeeRestricted);
    return { data: visible };
  });

  // GET /v1/metrics/:key/value?days=30 — this tenant's current value.
  fastify.get<{ Params: { key: string }; Querystring: { days?: string } }>('/:key/value', async (request, reply) => {
    const user = request.user;
    const days = Math.min(Math.max(Number(request.query.days) || 30, 1), 365);
    const defs = await listMetricDefinitions();
    const def = defs.find(d => d.metric_key === request.params.key);
    if (!def) return reply.status(404).send({ error: 'Unknown metric' });
    if (def.visibility === 'restricted' && !METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'This metric is restricted to management roles' });
    }
    try {
      const result = await computeMetricValue(request.params.key, user.tenant_id, days);
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to compute metric' });
    }
  });

  // ── Alert rules (Milestone 3) ────────────────────────────────────────
  // Read is open to anyone with HuduBI access, same as /definitions;
  // create/enable/delete require an MGMT_ROLES-equivalent role, checked
  // here — not left to the frontend to hide the button.
  fastify.get('/alerts', async (request) => {
    return { data: await listAlertRules(request.user.tenant_id) };
  });

  fastify.get('/alerts/events', async (request) => {
    return { data: await listAlertEvents(request.user.tenant_id) };
  });

  fastify.post('/alerts', async (request, reply) => {
    const user = request.user;
    if (!METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'Only management roles can create alert rules' });
    }
    const body = createAlertSchema.parse(request.body);
    const def = await listMetricDefinitions().then(all => all.find(d => d.metric_key === body.metricKey));
    if (!def) return reply.status(404).send({ error: 'Unknown metric' });
    if (def.visibility === 'restricted' && !METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'This metric is restricted to management roles' });
    }
    try {
      const rule = await createAlertRule(user.tenant_id, user.sub, body);
      return reply.status(201).send(rule);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to create alert rule' });
    }
  });

  fastify.patch<{ Params: { id: string }; Body: { enabled: boolean } }>('/alerts/:id', async (request, reply) => {
    const user = request.user;
    if (!METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'Only management roles can edit alert rules' });
    }
    try {
      return await setAlertRuleEnabled(user.tenant_id, request.params.id, !!request.body.enabled);
    } catch (err: any) {
      return reply.status(404).send({ error: 'Alert rule not found' });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/alerts/:id', async (request, reply) => {
    const user = request.user;
    if (!METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'Only management roles can delete alert rules' });
    }
    await deleteAlertRule(user.tenant_id, request.params.id);
    return reply.status(204).send();
  });

  // ── KPI Targets (Milestone M2) ───────────────────────────────────────
  fastify.get('/kpi-targets', async (request) => {
    const targets = await listKpiTargets(request.user.tenant_id);
    return { data: targets };
  });

  fastify.post('/kpi-targets', async (request, reply) => {
    const user = request.user;
    if (!METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'Only management roles can set KPI targets' });
    }
    const body = createKpiTargetSchema.parse(request.body);
    const def = await listMetricDefinitions().then(all => all.find(d => d.metric_key === body.metricKey));
    if (!def) return reply.status(404).send({ error: 'Unknown metric' });
    if (def.visibility === 'restricted' && !METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'This metric is restricted to management roles' });
    }
    try {
      const target = await createOrUpdateKpiTarget(user.tenant_id, user.sub, body);
      return reply.status(201).send(target);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to save KPI target' });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/kpi-targets/:id', async (request, reply) => {
    const user = request.user;
    if (!METRICS_MGMT_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'Only management roles can delete KPI targets' });
    }
    await deleteKpiTarget(user.tenant_id, request.params.id);
    return reply.status(204).send();
  });
}
