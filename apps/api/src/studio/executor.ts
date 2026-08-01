import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { ACTIONS_BY_ID, type ActionContext } from './actions.js';
import { TRIGGERS_BY_ID } from './triggers.js';
import { applyOperator, readField } from './conditions.js';
import { resolveContext } from './context.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';

/**
 * Executes a Studio workflow's node graph — for real.
 *
 * What this replaces: the old inline loop in workflow-studio.routes.ts pushed
 * `status: 'SUCCESS'` with `duration_ms: Math.floor(Math.random() * 45) + 20`
 * for every node and called nothing. Two rules follow from that history and are
 * not negotiable here:
 *
 *   - A node is only ever recorded SUCCESS when the thing it describes actually
 *     happened. Durations are measured, never generated.
 *   - A dry run is recorded as SIMULATED, never SUCCESS.
 */

export type NodeType = 'trigger' | 'condition' | 'action' | 'forEach';

export interface StudioNode {
  id: string;
  type: NodeType;
  title?: string;
  eventOrAction?: string;
  config?: Record<string, any>;
}

export interface StudioEdge { id?: string; source: string; target: string }

export type RunStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'SIMULATED';

export interface StepResult {
  node_id: string;
  node_type: NodeType;
  title: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'SIMULATED';
  duration_ms: number;
  output?: Record<string, unknown>;
  error?: string;
  /** 1-based position within a forEach, so a per-item failure is attributable. */
  iteration?: number;
}

export interface ExecuteOptions {
  tenantId: string;
  workflow: { id: string; trigger_event: string; nodes: unknown; edges: unknown };
  payload: Record<string, unknown>;
  entityId: string | null;
  /** Null for manual/dry runs; set for event-driven runs, where it is the idempotency key. */
  domainEventId: string | null;
  simulate: boolean;
}

export interface ExecuteResult {
  status: RunStatus;
  stepResults: StepResult[];
  errorMessage: string | null;
  durationMs: number;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return value as T;
}

/**
 * Orders nodes by following edges from the trigger. Falls back to declaration
 * order for nodes the graph never reaches, so a workflow with a broken edge
 * still runs its nodes rather than silently doing nothing.
 */
function orderNodes(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  for (const e of edges) outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);

  const start = nodes.find(n => n.type === 'trigger') ?? nodes[0];
  const ordered: StudioNode[] = [];
  const seen = new Set<string>();

  const visit = (id: string) => {
    if (seen.has(id)) return;                 // a cycle must not hang the executor
    const node = byId.get(id);
    if (!node) return;
    seen.add(id);
    ordered.push(node);
    for (const next of outgoing.get(id) ?? []) visit(next);
  };
  if (start) visit(start.id);
  for (const n of nodes) if (!seen.has(n.id)) ordered.push(n);
  return ordered;
}

/** What `{{…}}` references and condition fields are evaluated against. */
export interface RefScope {
  payload: Record<string, unknown>;
  /** Loaded by the trigger's context resolver — e.g. `{ shipment: {…} }`. */
  context: Record<string, unknown>;
  entityId: string | null;
}

/**
 * Resolves `{{shipment.refNumber}}` / `{{payload.foo}}` / `{{entityId}}` in an
 * action's config. Anything unmatched is left as-is so a mis-typed reference is
 * visible in the run log rather than silently blank.
 */
function resolveTemplates(value: unknown, ctx: RefScope): unknown {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(value);
    if (whole) return resolveRef(whole[1], ctx);      // keeps non-string types intact
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, ref) => {
      const v = resolveRef(ref, ctx);
      return v === undefined ? m : String(v);
    });
  }
  if (Array.isArray(value)) return value.map(v => resolveTemplates(v, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplates(v, ctx)]));
  }
  return value;
}

function resolveRef(ref: string, ctx: RefScope): unknown {
  if (ref === 'entityId') return ctx.entityId ?? undefined;
  if (ref.startsWith('payload.')) return readField(ctx.payload, ref.slice('payload.'.length));
  // Resolver-provided context (shipment.*, declaration.*) wins over payload:
  // it is the loaded record, where payload is only what the emitter chose to
  // include. Falls back to payload so a bare `stage` still works.
  const fromContext = readField(ctx.context, ref);
  return fromContext !== undefined ? fromContext : readField(ctx.payload, ref);
}

export async function executeWorkflow(opts: ExecuteOptions): Promise<ExecuteResult> {
  const startedAt = Date.now();
  const nodes = parseJson<StudioNode[]>(opts.workflow.nodes, []);
  const edges = parseJson<StudioEdge[]>(opts.workflow.edges, []);
  const ordered = orderNodes(nodes, edges);

  // Loaded once per run, before any node executes: every node sees the same
  // snapshot, so a condition and the action it guards can never disagree
  // because a row changed between them.
  const context = await resolveContext(opts.workflow.trigger_event, opts.tenantId, {
    entityId: opts.entityId,
    payload: opts.payload,
  });
  const scope: RefScope = { payload: opts.payload, context, entityId: opts.entityId };

  const stepResults: StepResult[] = [];
  let errorMessage: string | null = null;
  let anyActionRan = false;
  let failed = false;

  /**
   * Runs one node. `iteration` is set inside a forEach body so a failure on
   * item 3 of 7 is attributable in the run log. Returns false to stop the
   * current path (a condition that did not match).
   */
  const runNode = async (node: StudioNode, scope: RefScope, iteration?: number): Promise<boolean> => {
    const nodeStart = Date.now();
    const title = node.title || node.eventOrAction || node.id;
    const tag = iteration ? { iteration } : {};

    try {
      if (node.type === 'trigger') {
        const trigger = TRIGGERS_BY_ID.get(node.eventOrAction ?? opts.workflow.trigger_event);
        if (!trigger) throw new Error(`Unknown trigger "${node.eventOrAction ?? opts.workflow.trigger_event}" — it is not in the trigger registry.`);
        const parsed = trigger.payloadSchema.safeParse(opts.payload);
        if (!parsed.success) throw new Error(`Trigger payload did not match ${trigger.id}: ${parsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ')}`);
        stepResults.push({
          node_id: node.id, node_type: 'trigger', title, status: opts.simulate ? 'SIMULATED' : 'SUCCESS',
          duration_ms: Date.now() - nodeStart, output: { event: trigger.id }, ...tag,
        });
        return true;
      }

      if (node.type === 'condition') {
        const field = node.config?.field;
        const operator = node.config?.operator ?? 'not_empty';
        if (!field) throw new Error('Condition node has no field configured.');
        const actual = resolveRef(String(field), scope);
        const { ok, unknownOperator } = applyOperator(actual, String(operator), node.config?.value);
        if (unknownOperator) throw new Error(`Condition uses an unrecognised operator "${operator}".`);

        stepResults.push({
          node_id: node.id, node_type: 'condition', title,
          status: opts.simulate ? 'SIMULATED' : 'SUCCESS',
          duration_ms: Date.now() - nodeStart,
          output: { field, operator, matched: ok }, ...tag,
        });
        // A false condition is not a failure — the workflow simply does not
        // apply here. The caller marks the rest of this path SKIPPED.
        return ok;
      }

      // action
      const action = ACTIONS_BY_ID.get(node.eventOrAction ?? '');
      if (!action) throw new Error(`Unknown action "${node.eventOrAction}" — it is not in the action registry.`);

      // Entitlement is enforced here, not only in the UI. A workflow authored
      // while a tenant had SEAL must stop releasing bonded cargo the moment
      // that entitlement lapses — the route guard never sees an event-driven run.
      if (action.requiredEntitlement && !(await tenantHasEntitlement(opts.tenantId, action.requiredEntitlement))) {
        throw new Error(`This organization is not entitled to "${action.requiredEntitlement}", which ${action.id} requires.`);
      }

      const rawInput = resolveTemplates(node.config?.input ?? node.config ?? {}, scope);
      const parsed = action.inputSchema.safeParse(rawInput);
      if (!parsed.success) throw new Error(`Input for ${action.id} is invalid: ${parsed.error.issues.map(i => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);

      const ctx: ActionContext = {
        tenantId: opts.tenantId,
        entityId: opts.entityId,
        payload: opts.payload,
        simulate: opts.simulate,
      };
      const result = await action.execute(ctx, parsed.data);
      if (!opts.simulate && result.ok) anyActionRan = true;

      stepResults.push({
        node_id: node.id, node_type: 'action', title,
        status: result.ok ? (opts.simulate ? 'SIMULATED' : 'SUCCESS') : 'FAILED',
        duration_ms: Date.now() - nodeStart,
        output: { detail: result.detail, ...(result.output ?? {}) },
        ...(result.ok ? {} : { error: result.detail }), ...tag,
      });
      if (!result.ok) { failed = true; errorMessage = result.detail; }
      return true;
    } catch (err: any) {
      failed = true;
      errorMessage = err?.message ?? String(err);
      stepResults.push({
        node_id: node.id, node_type: node.type, title, status: 'FAILED',
        duration_ms: Date.now() - nodeStart, error: errorMessage ?? undefined, ...tag,
      });
      return true;
    }
  };

  const markSkipped = (rest: StudioNode[], iteration?: number) => {
    for (const n of rest) {
      stepResults.push({
        node_id: n.id, node_type: n.type, title: n.title || n.id,
        status: 'SKIPPED', duration_ms: 0, ...(iteration ? { iteration } : {}),
      });
    }
  };

  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i];
    if (failed) { markSkipped([node]); continue; }

    if (node.type === 'forEach') {
      // Iterates a collection supplied by a context resolver — never a query
      // Studio composes itself. `over` is a context path, `as` names each item.
      const path = String(node.config?.over ?? '');
      const alias = String(node.config?.as ?? 'item');
      const raw = readField(scope.context, path);
      const items = Array.isArray(raw) ? raw : [];
      const body = ordered.slice(i + 1);

      stepResults.push({
        node_id: node.id, node_type: 'forEach', title: node.title || path,
        status: opts.simulate ? 'SIMULATED' : 'SUCCESS', duration_ms: 0,
        output: { over: path, as: alias, count: items.length, ...(Array.isArray(raw) ? {} : { note: `"${path}" is not a collection — nothing to iterate.` }) },
      });

      if (items.length === 0) { markSkipped(body); break; }

      for (let k = 0; k < items.length; k++) {
        if (failed) { markSkipped(body, k + 1); continue; }
        const itemScope: RefScope = { ...scope, context: { ...scope.context, [alias]: items[k] } };
        for (let b = 0; b < body.length; b++) {
          if (failed) { markSkipped(body.slice(b), k + 1); break; }
          const carryOn = await runNode(body[b], itemScope, k + 1);
          if (!carryOn) { markSkipped(body.slice(b + 1), k + 1); break; }
        }
      }
      // The body has been consumed by the loop. Nested forEach is not
      // supported: the first one owns every node after it.
      break;
    }

    const carryOn = await runNode(node, scope);
    if (!carryOn) { markSkipped(ordered.slice(i + 1)); break; }
  }

  // Failure dominates, including in a dry run: a simulation that hit a real
  // error (bad input, missing entitlement, unknown action) must not report
  // SIMULATED as though it had passed. PARTIAL is only meaningful for a real
  // run where some actions genuinely completed before one failed.
  const status: RunStatus = failed
    ? (!opts.simulate && anyActionRan ? 'PARTIAL' : 'FAILED')
    : opts.simulate ? 'SIMULATED' : 'SUCCESS';

  return { status, stepResults, errorMessage, durationMs: Date.now() - startedAt };
}

/**
 * Runs a workflow and records it. Returns null when the event already produced
 * a run for this workflow — the unique index on (workflow_id, domain_event_id)
 * is what makes redelivery safe, so a duplicate is a normal outcome, not an error.
 */
export async function executeAndRecord(opts: ExecuteOptions & { triggerSource: string }): Promise<{ runId: string; status: RunStatus } | null> {
  if (opts.domainEventId) {
    const existing = await withTenant(opts.tenantId, trx => trx
      .selectFrom('workflow_studio_runs')
      .select('id')
      .where('tenant_id', '=', opts.tenantId)
      .where('workflow_id', '=', opts.workflow.id)
      .where('domain_event_id', '=', opts.domainEventId)
      .executeTakeFirst());
    if (existing) return null;
  }

  const result = await executeWorkflow(opts);

  return withTenant(opts.tenantId, async (trx) => {
    if (!opts.simulate) {
      // Incremented in SQL, not read-modify-write: two events landing at once
      // would otherwise both write the same count and lose a run.
      await trx.updateTable('workflow_studio_apps')
        .set({ last_run_at: new Date(), updated_at: new Date(), run_count: sql`run_count + 1` as any })
        .where('id', '=', opts.workflow.id)
        .where('tenant_id', '=', opts.tenantId)
        .execute();
    }

    const row = await trx.insertInto('workflow_studio_runs').values({
      tenant_id: opts.tenantId,
      workflow_id: opts.workflow.id,
      trigger_source: opts.triggerSource,
      status: result.status,
      payload: JSON.stringify(opts.payload),
      step_results: JSON.stringify(result.stepResults),
      error_message: result.errorMessage,
      duration_ms: result.durationMs,
      domain_event_id: opts.domainEventId,
    } as any).returning('id').executeTakeFirstOrThrow();

    return { runId: row.id, status: result.status };
  });
}
