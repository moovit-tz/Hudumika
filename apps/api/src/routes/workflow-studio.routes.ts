import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { TRIGGERS, type AppId } from '../studio/triggers.js';
import { ACTIONS } from '../studio/actions.js';
import { TEMPLATES, TEMPLATES_BY_ID } from '../studio/templates.js';
import { executeAndRecord } from '../studio/executor.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same shape as workflows.triggers. Empty everywhere means "no restriction". */
const EMPTY_TARGETING = () => ({
  freightModes: [] as string[], consignmentTypes: [] as string[], customerIds: [] as string[],
  originCountries: [] as string[], destinationCountries: [] as string[],
});

const TargetingSchema = z.object({
  freightModes: z.array(z.string()).optional(),
  consignmentTypes: z.array(z.string()).optional(),
  customerIds: z.array(z.string()).optional(),
  originCountries: z.array(z.string()).optional(),
  destinationCountries: z.array(z.string()).optional(),
}).strict();

/** JSONB columns arrive as strings from some drivers and objects from others. */
function hydrate(row: any) {
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
  return {
    ...row,
    trigger_config: parse(row.trigger_config),
    nodes: parse(row.nodes),
    edges: parse(row.edges),
    // Rows created before migration 168 have the column default, but a row
    // selected without it would otherwise come back undefined and read as
    // "no targeting" in one place and crash in another.
    targeting: row.targeting !== undefined ? parse(row.targeting) : EMPTY_TARGETING(),
  };
}

const APP_META: Record<AppId, { name: string; color: string }> = {
  clearos:      { name: 'ClearOS',      color: '#ea580c' },
  finops:       { name: 'FinOps',       color: '#0284c7' },
  onepi:        { name: 'NexusHR',      color: '#0d9488' },
  bliss:        { name: 'Bliss',        color: '#7c3aed' },
  complyos:     { name: 'ComplyOS',     color: '#059669' },
  crm:          { name: 'CRM',          color: '#059669' },
  tracking:     { name: 'HuduFreight',  color: '#0891b2' },
  cargotracker: { name: 'CargoTracker', color: '#4f46e5' },
  seal:         { name: 'SEAL',         color: '#0f766e' },
  inventory:    { name: 'Inventory',    color: '#0f766e' },
  studio:       { name: 'Studio',       color: '#4361ee' },
};

/** Top-level field names of an action's input schema, for the UI's form builder. */
function describeInput(schema: z.ZodTypeAny): { name: string; required: boolean }[] {
  const unwrap = (s: any): any => (s?._def?.innerType ? unwrap(s._def.innerType) : s);
  const base = unwrap(schema);
  if (!(base instanceof z.ZodObject)) return [];
  return Object.entries(base.shape as Record<string, z.ZodTypeAny>).map(([name, field]) => ({
    name,
    required: !field.isOptional(),
  }));
}

export async function workflowStudioRoutes(server: FastifyInstance) {
  server.addHook('preHandler', server.authenticate);

  // ── GET /v1/workflow-studio/triggers ─────────────────────────────────────────
  server.get('/triggers', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      data: TRIGGERS.map(t => ({
        id: t.id, kind: t.kind, app: t.app, appName: APP_META[t.app].name, color: APP_META[t.app].color,
        label: t.label, description: t.description, entityType: t.entityType,
        samplePayload: t.samplePayload,
      })),
    });
  });

  // ── GET /v1/workflow-studio/actions ──────────────────────────────────────────
  server.get('/actions', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      data: ACTIONS.map(a => ({
        id: a.id, app: a.app, appName: APP_META[a.app].name, color: APP_META[a.app].color,
        label: a.label, description: a.description,
        restricted: a.restricted ?? false,
        requiredEntitlement: a.requiredEntitlement ?? null,
        inputs: describeInput(a.inputSchema),
      })),
    });
  });

  // ── GET /v1/workflow-studio/stats ────────────────────────────────────────────
  // Every figure here is counted from this tenant's own rows. There is no
  // success-rate or throughput metric because nothing computes one — inventing
  // a plausible percentage on an automation console is worse than omitting it.
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const registered = new Set(TRIGGERS.map(t => t.id));

    const data = await withTenant(tenantId, async (trx) => {
      const apps = await trx.selectFrom('workflow_studio_apps')
        .select(['status', 'trigger_event', 'run_count'])
        .where('tenant_id', '=', tenantId).execute();

      const runs = await trx.selectFrom('workflow_studio_runs')
        .select(['status', 'created_at'])
        .where('tenant_id', '=', tenantId).execute();

      const since = Date.now() - 30 * 24 * 3600_000;
      const recent = runs.filter(r => new Date(r.created_at).getTime() >= since);
      const tally = (rows: { status: string }[]) => rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
      }, {});

      // Workflows whose trigger is not registered are grouped separately rather
      // than filed under a vague "unknown" — they are the ones that can never
      // run, and the label should say so.
      const byTriggerApp = new Map<string, number>();
      for (const a of apps) {
        const app = TRIGGERS.find(t => t.id === a.trigger_event)?.app ?? '__unregistered__';
        byTriggerApp.set(app, (byTriggerApp.get(app) ?? 0) + 1);
      }

      return {
        workflows: {
          total: apps.length,
          active: apps.filter(a => a.status === 'ACTIVE').length,
          draft: apps.filter(a => a.status === 'DRAFT').length,
          paused: apps.filter(a => a.status === 'PAUSED').length,
          unrunnable: apps.filter(a => !registered.has(a.trigger_event)).length,
        },
        runs: {
          total: runs.length,
          last30d: recent.length,
          byStatus: tally(runs),
          byStatusLast30d: tally(recent),
        },
        byApp: [...byTriggerApp.entries()]
          .map(([app, workflows]) => ({
            app,
            name: app === '__unregistered__' ? 'Trigger not registered' : (APP_META[app as AppId]?.name ?? app),
            color: app === '__unregistered__' ? '#dc2626' : (APP_META[app as AppId]?.color ?? '#64748b'),
            workflows,
          }))
          .sort((a, b) => b.workflows - a.workflows),
        catalogue: { triggers: TRIGGERS.length, actions: ACTIONS.length, templates: TEMPLATES.length },
      };
    });

    return reply.send({ data });
  });

  // ── GET /v1/workflow-studio/runs ─────────────────────────────────────────────
  // Recent runs across every workflow, for the monitoring view.
  server.get('/runs', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const limit = Math.min(Number(request.query.limit) || 60, 200);

    const rows = await withTenant(tenantId, trx => trx
      .selectFrom('workflow_studio_runs as r')
      .leftJoin('workflow_studio_apps as a', 'a.id', 'r.workflow_id')
      .select(['r.id', 'r.workflow_id', 'r.status', 'r.trigger_source', 'r.duration_ms',
               'r.error_message', 'r.domain_event_id', 'r.created_at', 'a.name as workflow_name'])
      .where('r.tenant_id', '=', tenantId)
      .orderBy('r.created_at', 'desc')
      .limit(limit)
      .execute());

    return reply.send({ data: rows });
  });

  // ── GET /v1/workflow-studio/templates ────────────────────────────────────────
  server.get('/templates', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      data: TEMPLATES.map(t => {
        const trigger = TRIGGERS.find(x => x.id === t.triggerEvent);
        const steps = t.nodes.filter(n => n.type !== 'trigger').length;
        return {
          id: t.id, name: t.name, description: t.description,
          app: t.app, appName: APP_META[t.app]?.name ?? t.app, color: t.color,
          triggerEvent: t.triggerEvent,
          triggerLabel: trigger?.label ?? null,
          // Surfaced rather than hidden: a template bound to a missing trigger
          // must never look installable.
          triggerRegistered: !!trigger,
          steps,
          needs: t.needs,
        };
      }),
    });
  });

  // ── POST /v1/workflow-studio/templates/:id/install ───────────────────────────
  server.post('/templates/:id/install', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const tpl = TEMPLATES_BY_ID.get(request.params.id);
    if (!tpl) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Unknown template.' });
    if (!TRIGGERS.some(t => t.id === tpl.triggerEvent)) {
      return reply.status(409).send({ error: 'DEAD_TRIGGER', message: `This template's trigger "${tpl.triggerEvent}" is not registered, so it could never run.` });
    }

    const name = (request.body as any)?.name || tpl.name;
    const created = await withTenant(tenantId, trx => trx.insertInto('workflow_studio_apps').values({
      tenant_id: tenantId,
      name,
      description: tpl.description,
      icon: tpl.icon,
      color: tpl.color,
      // Always DRAFT: installing a template must never switch automation on
      // behind someone's back, least of all one with blanks still to fill.
      status: 'DRAFT',
      trigger_event: tpl.triggerEvent,
      trigger_config: JSON.stringify({}),
      nodes: JSON.stringify(tpl.nodes),
      edges: JSON.stringify(tpl.edges),
      created_by: UUID_RE.test(request.user.sub ?? '') ? request.user.sub : null,
    } as any).returningAll().executeTakeFirstOrThrow());

    return reply.status(201).send({ data: hydrate(created) });
  });

  // ── GET /v1/workflow-studio/apps ─────────────────────────────────────────────
  server.get('/apps', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;

    const rawApps = await withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('workflow_studio_apps')
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();
    });

    const apps = rawApps.map(app => ({
      ...app,
      trigger_config: typeof app.trigger_config === 'string' ? JSON.parse(app.trigger_config) : app.trigger_config,
      nodes: typeof app.nodes === 'string' ? JSON.parse(app.nodes) : app.nodes,
      edges: typeof app.edges === 'string' ? JSON.parse(app.edges) : app.edges,
    }));

    return reply.send({ data: apps });
  });

  // ── POST /v1/workflow-studio/apps ────────────────────────────────────────────
  server.post('/apps', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const body = request.body as any;

    if (!body.name || !body.trigger_event) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Name and trigger_event are required' });
    }

    const targetingParsed = TargetingSchema.safeParse(body.targeting ?? {});
    if (!targetingParsed.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Invalid targeting: ' + targetingParsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ') });
    }

    const defaultNodes = body.nodes || [
      { id: 'node-1', type: 'trigger', title: 'Trigger Event', subtitle: `Event: ${body.trigger_event}`, eventOrAction: body.trigger_event, position: { x: 100, y: 80 }, config: {} },
      { id: 'node-2', type: 'action', title: 'Action Step', subtitle: 'Action: send_email', eventOrAction: 'send_email', position: { x: 100, y: 220 }, config: {} }
    ];

    const defaultEdges = body.edges || [
      { id: 'edge-1', source: 'node-1', target: 'node-2' }
    ];

    const rawApp = await withTenant(tenantId, async (trx) => {
      return await trx
        .insertInto('workflow_studio_apps')
        .values({
          tenant_id: tenantId,
          name: body.name,
          description: body.description || null,
          icon: body.icon || 'zap',
          color: body.color || '#4361ee',
          status: body.status || 'ACTIVE',
          trigger_event: body.trigger_event,
          trigger_config: JSON.stringify(body.trigger_config || {}),
          nodes: JSON.stringify(defaultNodes),
          edges: JSON.stringify(defaultEdges),
          targeting: JSON.stringify({ ...EMPTY_TARGETING(), ...targetingParsed.data }),
          created_by: request.user.sub || null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    const newApp = hydrate(rawApp);

    return reply.status(201).send({ data: newApp });
  });

  // ── GET /v1/workflow-studio/apps/:id ──────────────────────────────────────────
  server.get('/apps/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params;

    const rawApp = await withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('workflow_studio_apps')
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirst();
    });

    if (!rawApp) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Workflow app not found' });
    }

    return reply.send({ data: hydrate(rawApp) });
  });

  // ── PATCH /v1/workflow-studio/apps/:id ────────────────────────────────────────
  server.patch('/apps/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params;
    const body = request.body as any;

    const updateData: any = {
      updated_at: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.trigger_event !== undefined) updateData.trigger_event = body.trigger_event;
    if (body.trigger_config !== undefined) updateData.trigger_config = JSON.stringify(body.trigger_config);
    if (body.nodes !== undefined) updateData.nodes = JSON.stringify(body.nodes);
    if (body.edges !== undefined) updateData.edges = JSON.stringify(body.edges);
    if (body.targeting !== undefined) {
      const parsed = TargetingSchema.safeParse(body.targeting ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Invalid targeting: ' + parsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ') });
      }
      updateData.targeting = JSON.stringify({ ...EMPTY_TARGETING(), ...parsed.data });
    }

    const rawUpdated = await withTenant(tenantId, async (trx) => {
      return await trx
        .updateTable('workflow_studio_apps')
        .set(updateData)
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
    });

    if (!rawUpdated) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Workflow app not found' });
    }

    return reply.send({ data: hydrate(rawUpdated) });
  });

  // ── DELETE /v1/workflow-studio/apps/:id ───────────────────────────────────────
  server.delete('/apps/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params;

    const deleted = await withTenant(tenantId, async (trx) => {
      return await trx
        .deleteFrom('workflow_studio_apps')
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .returning('id')
        .executeTakeFirst();
    });

    if (!deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Workflow app not found' });
    }

    return reply.send({ success: true, message: 'Workflow app deleted' });
  });

  // ── POST /v1/workflow-studio/apps/:id/run ─────────────────────────────────────
  server.post('/apps/:id/run', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params;
    const payload = (request.body as any)?.payload || {};

    const app = await withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('workflow_studio_apps')
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirst();
    });

    if (!app) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Workflow app not found' });
    }

    // Manual runs default to a dry run. Executing real actions — opening a
    // ticket, booking an expense, releasing bonded cargo — from a "Run Test"
    // button is not a safe default; the caller has to ask for it.
    const simulate = (request.body as any)?.simulate !== false;

    const outcome = await executeAndRecord({
      tenantId,
      workflow: app,
      payload,
      entityId: (request.body as any)?.entityId ?? null,
      domainEventId: null,          // manual runs are always allowed to repeat
      simulate,
      triggerSource: simulate ? 'manual_dry_run' : 'manual_run',
    });
    if (!outcome) return reply.status(409).send({ error: 'CONFLICT', message: 'This event already produced a run for this workflow.' });

    const rawRun = await withTenant(tenantId, trx => trx
      .selectFrom('workflow_studio_runs')
      .selectAll()
      .where('id', '=', outcome.runId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow());

    return reply.send({
      data: {
        ...rawRun,
        payload: typeof rawRun.payload === 'string' ? JSON.parse(rawRun.payload) : rawRun.payload,
        step_results: typeof rawRun.step_results === 'string' ? JSON.parse(rawRun.step_results) : rawRun.step_results,
      },
    });
  });

  // ── GET /v1/workflow-studio/apps/:id/runs ─────────────────────────────────────
  server.get('/apps/:id/runs', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params;

    const rawRuns = await withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('workflow_studio_runs')
        .where('workflow_id', '=', id)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(50)
        .execute();
    });

    const runs = rawRuns.map(r => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      step_results: typeof r.step_results === 'string' ? JSON.parse(r.step_results) : r.step_results,
    }));

    return reply.send({ data: runs });
  });

  // ── GET /v1/workflow-studio/integrations ──────────────────────────────────────
  // Derived from the registries rather than hand-listed. The previous version
  // was a literal array whose event/action counts were invented — it advertised
  // a "Landed Cost Calculator" integration with 3 events and 3 actions when the
  // platform emits no landed-cost events and exposes no landed-cost actions.
  // An app now appears here only because it really contributes a trigger or an
  // action, and the counts are those lists' lengths.
  server.get('/integrations', async (_request: FastifyRequest, reply: FastifyReply) => {
    const byApp = new Map<AppId, { events: number; actions: number }>();
    for (const t of TRIGGERS) {
      const e = byApp.get(t.app) ?? { events: 0, actions: 0 };
      e.events++; byApp.set(t.app, e);
    }
    for (const a of ACTIONS) {
      const e = byApp.get(a.app) ?? { events: 0, actions: 0 };
      e.actions++; byApp.set(a.app, e);
    }

    const data = [...byApp.entries()].map(([app, counts]) => ({
      id: app,
      name: APP_META[app].name,
      color: APP_META[app].color,
      status: 'CONNECTED',
      events_count: counts.events,
      actions_count: counts.actions,
    })).sort((a, b) => (b.events_count + b.actions_count) - (a.events_count + a.actions_count));

    return reply.send({ data });
  });

  // ── POST /v1/workflow-studio/trigger-event ────────────────────────────────────
  // Fans a synthetic event at every ACTIVE workflow bound to it. Real
  // production events arrive through the domain bus (subscribers/studio.
  // subscribers.ts), not here — this endpoint exists so a workflow can be
  // exercised end to end against a chosen payload.
  //
  // Defaults to a dry run for the same reason /run does: firing a real event
  // name should not silently open tickets or move bonded cargo.
  server.post('/trigger-event', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const { event, payload, entityId } = request.body as any;
    const simulate = (request.body as any)?.simulate !== false;

    if (!event) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Event name is required' });
    }
    if (!TRIGGERS.some(t => t.id === event)) {
      return reply.status(400).send({
        error: 'UNKNOWN_TRIGGER',
        message: `"${event}" is not a registered trigger. A workflow bound to it could never run.`,
      });
    }

    const activeWorkflows = await withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('workflow_studio_apps')
        .select(['id', 'name', 'trigger_event', 'nodes', 'edges'])
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'ACTIVE')
        .where('trigger_event', '=', event)
        .execute();
    });

    const runs: any[] = [];
    for (const workflow of activeWorkflows) {
      const outcome = await executeAndRecord({
        tenantId, workflow, payload: payload || {}, entityId: entityId ?? null,
        domainEventId: null, simulate, triggerSource: `${simulate ? 'test' : 'manual'}:${event}`,
      });
      if (outcome) runs.push({ workflow_id: workflow.id, name: workflow.name, run_id: outcome.runId, status: outcome.status });
    }

    return reply.send({ success: true, simulated: simulate, triggered_count: runs.length, runs });
  });
}
