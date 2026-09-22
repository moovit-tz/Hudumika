import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireUuidParams } from '../middleware/uuid-params.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { resolveAiCredentials } from '../lib/platform-settings.js';
import { describeAiUnavailable } from '../lib/ai-credits.js';
import { loadMemory, memoryPromptSection, parseRememberCommand } from '../services/ai-memory.service.js';
import { AGENT_TOOL_REGISTRY, AGENT_TOOL_INPUT_SCHEMAS, runAgentTool } from '../services/agent-registry.js';
import { getTenantAgentUsage } from '../lib/agent-usage.js';
import { getAllowedToolIds, getToolLimits, listToolGrants, replaceToolGrants } from '../services/agent-grants.service.js';
import { runAgentLoop, appendRunSteps, nextStepSequence, getOrCreatePlatformAgentId, type AgentLoopResult } from '../services/agent-runtime.service.js';

/**
 * Milestone 2 of the agentic platform build — see
 * C:\Users\Viden\.claude\plans\ancient-bouncing-gem.md. New surface, gated
 * the same way ai.routes.ts already is (same 'ai' entitlement, same
 * CUSTOMER exclusion) since this reaches the exact same tenant data plus
 * everything agent-registry.ts adds on top. /v1/ai/chat is untouched by
 * this file — a tenant/session using either surface sees no difference in
 * the other.
 *
 * Scope note: this also includes a first-cut, single-approver
 * POST /v1/agent/approvals/:id/decision (formally milestone 3's own
 * deliverable) — without it, a run that ever needs approval could never be
 * resumed, which would make the policy-gating this milestone adds
 * untestable as anything but a dead end. Milestone 3 upgrades this same
 * endpoint to real quorum enforcement for required_approvals > 1, and adds
 * an approval-inbox listing endpoint (GET /approvals) plus an hourly expiry
 * sweep (jobs/agent-approval-expiry.job.ts) — see the plan file's
 * "Milestone 3" section for the full writeup.
 */

const createRunSchema = z.object({
  goal: z.string().trim().min(1).max(4000),
  appContext: z.string().max(100).optional(),
});
const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) });
const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
});

interface HistoryTurn { role: 'user' | 'assistant'; content: string }

async function loadHistory(trx: any, runId: string): Promise<HistoryTurn[]> {
  const rows = await trx.selectFrom('agent_run_steps')
    .select(['step_type', 'input', 'output'])
    .where('run_id', '=', runId).where('step_type', '=', 'message')
    .orderBy('sequence', 'asc').execute();
  return rows.map((r: any) => {
    const parsed = typeof r.input === 'string' ? JSON.parse(r.input) : r.input;
    return { role: parsed.role, content: parsed.content } as HistoryTurn;
  });
}

/** Role-based, matching how every other approval gate in this codebase
 *  checks "may this role decide" rather than a specific named person
 *  (hr_offers.approved_by is who did decide, not who was allowed to). A
 *  MANAGER-gated approval also admits every role above it in the hierarchy;
 *  a SUPER_ADMIN-gated one (the highest-risk tools) does not. */
function canDecideApproval(userRole: string, approverRole: string): boolean {
  return approverRole === 'MANAGER'
    ? ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(userRole)
    : userRole === approverRole;
}

async function recordMessage(trx: any, tenantId: string, runId: string, sequence: number, role: 'user' | 'assistant', content: string, usage?: { tokensIn: number | null; tokensOut: number | null }) {
  await trx.insertInto('agent_run_steps').values({
    tenant_id: tenantId, run_id: runId, sequence, step_type: 'message',
    tool_id: null, input: JSON.stringify({ role, content }), output: null, status: 'ok',
    tokens_in: usage?.tokensIn ?? null, tokens_out: usage?.tokensOut ?? null,
  }).execute();
}

/** What a caller actually needs to show a person after a round of the loop
 *  finishes — the raw AgentLoopResult is a server-internal shape (raw
 *  provider messages, tool-call payloads); this is the small, stable subset
 *  a UI renders: the assistant's own words, why a run failed, or what a
 *  pending approval is asking for. */
interface LoopResultSummary {
  finalText?: string;
  errorMessage?: string;
  pendingApproval?: { id: string; toolId: string; toolLabel: string; requestedEffect: string; approverRole: string; requiredApprovals: number };
}

/** Saved tenant + personal memory as a system-prompt section — the same
 *  ai_memory facts /v1/ai/chat injects, so the assistant keeps everything
 *  users have taught it when the sidebar moves onto this runtime. */
async function loadMemorySection(tenantId: string, userId: string): Promise<string> {
  return memoryPromptSection(await withTenant(tenantId, trx => loadMemory(trx, tenantId, userId)));
}

/** "Remember that …" — answered by this code, not a model, so it needs no
 *  API key and costs no AI credit (same rule ai.routes.ts's chat follows:
 *  confirming a save is only honest if the code that saved it says so).
 *  Records the exchange on the run like any other turn. */
async function saveRememberedFact(tenantId: string, userId: string, runId: string, sequence: number, incoming: string, fact: string): Promise<string> {
  const text = `Saved. I'll remember: ${fact}`;
  await withTenant(tenantId, async (trx) => {
    await trx.insertInto('ai_memory').values({ tenant_id: tenantId, user_id: userId, content: fact, source: 'user', source_conversation_id: null }).execute();
    await recordMessage(trx, tenantId, runId, sequence, 'user', incoming);
    await recordMessage(trx, tenantId, runId, sequence + 1, 'assistant', text);
  });
  return text;
}

/** Applies one loop result to a run: persists its steps, and either closes
 *  the run out (completed/failed) or opens a durable approval gate
 *  (awaiting_approval) — the one place both POST /runs and POST /runs/:id/
 *  messages and the approval-decision resume path all funnel through, so
 *  the three can't drift on what "finishing a round" means. */
async function applyLoopResult(tenantId: string, runId: string, loop: AgentLoopResult): Promise<LoopResultSummary> {
  const start = await nextStepSequence(tenantId, runId);
  await appendRunSteps(tenantId, runId, start, loop.steps);

  return withTenant(tenantId, async (trx) => {
    if (loop.status === 'completed') {
      const seq = start + loop.steps.length;
      if (loop.finalText) await recordMessage(trx, tenantId, runId, seq, 'assistant', loop.finalText, loop.finalUsage);
      await trx.updateTable('agent_runs').set({ status: 'completed', updated_at: new Date(), completed_at: new Date() })
        .where('id', '=', runId).where('tenant_id', '=', tenantId).execute();
      return { finalText: loop.finalText ?? undefined };
    }
    if (loop.status === 'failed') {
      const errorMessage = loop.errorMessage ?? 'Unknown error';
      await trx.updateTable('agent_runs').set({ status: 'failed', error_message: errorMessage, updated_at: new Date(), completed_at: new Date() })
        .where('id', '=', runId).where('tenant_id', '=', tenantId).execute();
      return { errorMessage };
    }
    // awaiting_approval
    const pending = loop.pendingApproval!;
    const tool = AGENT_TOOL_REGISTRY.find(t => t.id === pending.toolId)!;
    const requestedEffect = `${tool.label} — ${pending.preview && typeof pending.preview === 'object' && 'detail' in (pending.preview as any) ? (pending.preview as any).detail : 'see preview'}`;
    const approverRole = tool.risk === 'critical' ? 'SUPER_ADMIN' : 'MANAGER';
    // Dual control for the highest-risk tools only, mirroring Ondi's
    // break-glass quorum (migration 365, `isBreakGlass ? 2 : 1`) — a
    // regulated ledger write like seal.release_lot needs two distinct
    // SUPER_ADMINs to agree, not one person twice (agent_approval_
    // decisions.UNIQUE(approval_id, approver_id) already guarantees that).
    const requiredApprovals = tool.risk === 'critical' ? 2 : 1;
    const approval = await trx.insertInto('agent_approvals').values({
      tenant_id: tenantId, run_id: runId, step_id: null, tool_id: pending.toolId,
      requested_effect: requestedEffect,
      preview: JSON.stringify({ input: pending.input, preview: pending.preview, rawAssistantMessage: pending.rawAssistantMessage, toolUseId: pending.toolUseId }),
      approver_role: approverRole,
      required_approvals: requiredApprovals,
      expires_at: new Date(Date.now() + 24 * 3600_000),
    }).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('agent_runs').set({ status: 'awaiting_approval', updated_at: new Date() })
      .where('id', '=', runId).where('tenant_id', '=', tenantId).execute();
    return { pendingApproval: { id: approval.id, toolId: tool.id, toolLabel: tool.label, requestedEffect, approverRole, requiredApprovals } };
  });
}

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('ai'));
  requireUuidParams(fastify);
  // Mirrors ai.routes.ts exactly — same tenant data, same reason.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/tools', async () => AGENT_TOOL_REGISTRY);

  // ── Tool grants — what the workspace agent may use. Tenant admins only. ──
  const GRANT_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
  const grantsBodySchema = z.object({
    /** null clears every grant (agent returns to unrestricted); otherwise the complete allow-list. */
    toolIds: z.array(z.string().min(1)).min(1).nullable(),
    /** Optional expiry applied to every listed grant. */
    expiresAt: z.string().datetime().nullable().optional(),
    /** toolId → largest amountTzs the agent may spend without a human approving. */
    maxAmountTzs: z.record(z.number().positive()).optional(),
  });

  fastify.get('/usage', async (request: any, reply) => {
    const user = request.user;
    if (!GRANT_ADMIN_ROLES.includes(user.role)) return reply.status(403).send({ error: 'Only an administrator can view agent usage.' });
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query);
    return getTenantAgentUsage(user.tenant_id, days);
  });

  fastify.get('/grants', async (request: any, reply) => {
    const user = request.user;
    if (!GRANT_ADMIN_ROLES.includes(user.role)) return reply.status(403).send({ error: 'Only an administrator can view tool grants.' });
    const agentId = await getOrCreatePlatformAgentId(user.tenant_id);
    const grants = await listToolGrants(user.tenant_id, agentId);
    const allowed = await getAllowedToolIds(user.tenant_id, agentId);
    const amountCappable = AGENT_TOOL_REGISTRY.filter(t => (AGENT_TOOL_INPUT_SCHEMAS[t.id] as any)?.properties?.amountTzs).map(t => t.id);
    return { agentId, restricted: allowed !== null, grants, tools: AGENT_TOOL_REGISTRY, amountCappable };
  });

  fastify.put('/grants', async (request: any, reply) => {
    const user = request.user;
    if (!GRANT_ADMIN_ROLES.includes(user.role)) return reply.status(403).send({ error: 'Only an administrator can change tool grants.' });
    const body = grantsBodySchema.parse(request.body);
    const known = new Set(AGENT_TOOL_REGISTRY.map(t => t.id));
    const unknown = (body.toolIds ?? []).filter(id => !known.has(id));
    if (unknown.length > 0) return reply.status(400).send({ error: `Unknown tool id(s): ${unknown.join(', ')}` });
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) return reply.status(400).send({ error: 'expiresAt must be in the future.' });
    const agentId = await getOrCreatePlatformAgentId(user.tenant_id);
    const caps = body.maxAmountTzs ?? {};
    const badCap = Object.keys(caps).find(id => !(body.toolIds ?? []).includes(id) || !(AGENT_TOOL_INPUT_SCHEMAS[id] as any)?.properties?.amountTzs);
    if (badCap) return reply.status(400).send({ error: `${badCap} cannot have an amount cap — it must be a granted tool that takes an amountTzs.` });
    await replaceToolGrants(user.tenant_id, agentId, body.toolIds, user.sub, expiresAt, caps);
    return { agentId, restricted: body.toolIds !== null, grants: await listToolGrants(user.tenant_id, agentId) };
  });

  fastify.post('/runs', async (request: any, reply) => {
    const user = request.user;
    const body = createRunSchema.parse(request.body);

    const remember = parseRememberCommand(body.goal);
    if (remember) {
      const agentId = await getOrCreatePlatformAgentId(user.tenant_id);
      const run = await withTenant(user.tenant_id, trx => trx.insertInto('agent_runs').values({
        tenant_id: user.tenant_id, agent_id: agentId, initiator_user_id: user.sub,
        status: 'completed', goal: body.goal, app_context: body.appContext ?? null, completed_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow());
      const text = await saveRememberedFact(user.tenant_id, user.sub, run.id, 1, body.goal, remember);
      reply.status(201);
      return { id: run.id, status: 'completed', finalText: text, remembered: remember };
    }

    const settings = await withTenant(user.tenant_id, trx =>
      trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    const aiCfg = (settings?.settings as any)?.['int-ai'] ?? {};
    const creds = await resolveAiCredentials(user.tenant_id, aiCfg, user.role);
    if (!creds) return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });

    const agentId = await getOrCreatePlatformAgentId(user.tenant_id);
    const run = await withTenant(user.tenant_id, trx => trx.insertInto('agent_runs').values({
      tenant_id: user.tenant_id, agent_id: agentId, initiator_user_id: user.sub,
      status: 'running', goal: body.goal, app_context: body.appContext ?? null,
      provider: creds.provider, model: creds.model,
    }).returningAll().executeTakeFirstOrThrow());

    await withTenant(user.tenant_id, trx => recordMessage(trx, user.tenant_id, run.id, 1, 'user', body.goal));

    const memorySection = await loadMemorySection(user.tenant_id, user.sub);
    const loop = await runAgentLoop(user.tenant_id, user.sub, creds.apiKey, creds.model, creds.provider, user.role, [{ role: 'user', content: body.goal }], undefined, memorySection, await getAllowedToolIds(user.tenant_id, agentId), await getToolLimits(user.tenant_id, agentId));
    const summary = await applyLoopResult(user.tenant_id, run.id, loop);

    reply.status(201);
    return { id: run.id, status: loop.status, ...summary };
  });

  fastify.get('/runs/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params;
    return withTenant(user.tenant_id, async (trx) => {
      const run = await trx.selectFrom('agent_runs').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        // A run is the initiator's own — same "your own thread" scoping
        // ai_conversations already uses. A management-visible cross-user
        // run list is a later refinement, not this milestone's job.
        .where('initiator_user_id', '=', user.sub)
        .executeTakeFirst();
      if (!run) return reply.status(404).send({ error: 'Run not found' });

      const [steps, approvalRows, artifacts, evidence] = await Promise.all([
        trx.selectFrom('agent_run_steps').selectAll().where('run_id', '=', id).orderBy('sequence', 'asc').execute(),
        trx.selectFrom('agent_approvals').selectAll().where('run_id', '=', id).orderBy('created_at', 'asc').execute(),
        trx.selectFrom('agent_artifacts').selectAll().where('run_id', '=', id).orderBy('created_at', 'asc').execute(),
        trx.selectFrom('agent_evidence').selectAll().where('run_id', '=', id).orderBy('created_at', 'asc').execute(),
      ]);
      // decisionsSoFar (packages/types/src/agent.ts's AgentApproval contract)
      // — a real count of distinct approved decisions, not just the raw row,
      // so a run's own detail view can show "1 of 2" progress on a
      // dual-control approval the same way the /approvals inbox does.
      const approvalIds = approvalRows.map(a => a.id);
      const decisions = approvalIds.length > 0
        ? await trx.selectFrom('agent_approval_decisions').select(['approval_id', 'decision'])
            .where('approval_id', 'in', approvalIds).execute()
        : [];
      const approvals = approvalRows.map(a => ({
        ...a,
        decisionsSoFar: decisions.filter(d => d.approval_id === a.id && d.decision === 'approved').length,
      }));
      return { ...run, steps, approvals, artifacts, evidence };
    });
  });

  fastify.post('/runs/:id/messages', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params;
    const body = messageSchema.parse(request.body);

    const run = await withTenant(user.tenant_id, trx => trx.selectFrom('agent_runs').selectAll()
      .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('initiator_user_id', '=', user.sub).executeTakeFirst());
    if (!run) return reply.status(404).send({ error: 'Run not found' });
    if (!['completed', 'failed'].includes(run.status)) {
      return reply.status(409).send({
        error: run.status === 'awaiting_approval'
          ? 'This run is waiting on an approval decision before it can continue.'
          : `This run is ${run.status} — it can't take a new message right now.`,
      });
    }

    const rememberMsg = parseRememberCommand(body.message);
    if (rememberMsg) {
      const seq0 = await nextStepSequence(user.tenant_id, id);
      const text = await saveRememberedFact(user.tenant_id, user.sub, id, seq0, body.message, rememberMsg);
      await withTenant(user.tenant_id, trx => trx.updateTable('agent_runs').set({ status: 'completed', updated_at: new Date(), completed_at: new Date() }).where('id', '=', id).execute());
      return { id, status: 'completed', finalText: text, remembered: rememberMsg };
    }

    const settings = await withTenant(user.tenant_id, trx =>
      trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    const aiCfg = (settings?.settings as any)?.['int-ai'] ?? {};
    const creds = await resolveAiCredentials(user.tenant_id, aiCfg, user.role);
    if (!creds) return reply.status(400).send({ error: await describeAiUnavailable(user.tenant_id) });

    const history = await withTenant(user.tenant_id, trx => loadHistory(trx, id));
    const seq = await nextStepSequence(user.tenant_id, id);
    await withTenant(user.tenant_id, trx => recordMessage(trx, user.tenant_id, id, seq, 'user', body.message));
    await withTenant(user.tenant_id, trx => trx.updateTable('agent_runs').set({ status: 'running', updated_at: new Date() }).where('id', '=', id).execute());

    const loop = await runAgentLoop(user.tenant_id, user.sub, creds.apiKey, creds.model, creds.provider, user.role, [...history, { role: 'user', content: body.message }], undefined, await loadMemorySection(user.tenant_id, user.sub), await getAllowedToolIds(user.tenant_id, run.agent_id), await getToolLimits(user.tenant_id, run.agent_id));
    const summary = await applyLoopResult(user.tenant_id, id, loop);

    return { id, status: loop.status, ...summary };
  });

  fastify.post('/runs/:id/cancel', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params;
    return withTenant(user.tenant_id, async (trx) => {
      const run = await trx.selectFrom('agent_runs').select(['status'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('initiator_user_id', '=', user.sub).executeTakeFirst();
      if (!run) return reply.status(404).send({ error: 'Run not found' });
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        return reply.status(409).send({ error: `This run is already ${run.status}.` });
      }
      // Stops future steps only — never claims to have rolled back a tool
      // call already executed, which is precisely what the ADR's
      // decommission notes warn against ("never pretend completed side
      // effects were rolled back").
      const updated = await trx.updateTable('agent_runs').set({ status: 'cancelled', updated_at: new Date(), completed_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
      return updated;
    });
  });

  /** Approval inbox — every pending approval in this tenant the current
   *  user's role is actually eligible to decide (same canDecideApproval gate
   *  the decision endpoint enforces), enriched with run context and how far
   *  along a multi-approver quorum already is. Modeled directly on Ondi's
   *  GET /org/access-requests (ondi.routes.ts) — same "count approvals, flag
   *  my own prior decision" shape, since agent_approvals is the same kind of
   *  durable decision-gate table Ondi's break-glass requests already are. */
  fastify.get('/approvals', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('agent_approvals as a')
        .innerJoin('agent_runs as r', 'r.id', 'a.run_id')
        .leftJoin('users as u', 'u.id', 'r.initiator_user_id')
        .select([
          'a.id', 'a.run_id', 'a.tool_id', 'a.requested_effect', 'a.preview',
          'a.approver_role', 'a.required_approvals', 'a.status', 'a.expires_at', 'a.created_at',
          'r.goal as run_goal', 'r.initiator_user_id', 'u.name as initiator_name',
        ])
        .where('a.tenant_id', '=', user.tenant_id)
        .where('a.status', '=', 'pending')
        .orderBy('a.created_at', 'asc')
        .execute();

      const eligible = rows.filter(r => canDecideApproval(user.role, r.approver_role));
      if (eligible.length === 0) return [];

      const ids = eligible.map(r => r.id);
      const decisions = await trx.selectFrom('agent_approval_decisions')
        .select(['approval_id', 'approver_id', 'decision'])
        .where('approval_id', 'in', ids).execute();

      return eligible.map(r => ({
        ...r,
        decisionsSoFar: decisions.filter(d => d.approval_id === r.id && d.decision === 'approved').length,
        myDecision: decisions.find(d => d.approval_id === r.id && d.approver_id === user.sub)?.decision ?? null,
      }));
    });
  });

  fastify.post('/approvals/:id/decision', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params;
    const body = decisionSchema.parse(request.body);

    const approval = await withTenant(user.tenant_id, trx => trx.selectFrom('agent_approvals').selectAll()
      .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!approval) return reply.status(404).send({ error: 'Approval not found' });
    if (approval.status !== 'pending') return reply.status(409).send({ error: `This approval was already ${approval.status}.` });
    if (new Date(approval.expires_at).getTime() <= Date.now()) {
      await withTenant(user.tenant_id, trx => trx.updateTable('agent_approvals').set({ status: 'expired' })
        .where('id', '=', id).where('status', '=', 'pending').execute());
      return reply.status(409).send({ error: 'This approval has expired.' });
    }
    if (!canDecideApproval(user.role, approval.approver_role)) {
      return reply.status(403).send({ error: `Only a ${approval.approver_role.toLowerCase()} can decide this.` });
    }

    // agent_approval_decisions.UNIQUE(approval_id, approver_id) is the real
    // guard against the same person deciding twice — caught here the same
    // way ondi.routes.ts's break-glass approve endpoint catches it, rather
    // than a separate pre-check that could race with a concurrent request.
    try {
      await withTenant(user.tenant_id, trx => trx.insertInto('agent_approval_decisions').values({
        tenant_id: user.tenant_id, approval_id: id, approver_id: user.sub, decision: body.decision, note: body.note ?? null,
      }).execute());
    } catch (err: any) {
      if (err?.code === '23505' || String(err?.message || '').toLowerCase().includes('unique')) {
        return reply.status(409).send({ error: "You've already recorded a decision on this approval." });
      }
      throw err;
    }

    if (body.decision === 'rejected') {
      // A single rejection vetoes outright, regardless of required_approvals
      // — that field only ever raises the bar to *approve* (dual control for
      // the highest-risk tools), never how many people must agree to block.
      await withTenant(user.tenant_id, trx => trx.updateTable('agent_approvals').set({
        status: 'rejected', decided_by: user.sub, decided_at: new Date(), decision_note: body.note ?? null,
      }).where('id', '=', id).execute());
      await withTenant(user.tenant_id, trx => trx.updateTable('agent_runs').set({ status: 'cancelled', updated_at: new Date(), completed_at: new Date(), error_message: `Approval rejected: ${body.note ?? 'no reason given'}` })
        .where('id', '=', approval.run_id).execute());
      return { status: 'rejected' };
    }

    // Approved — but only finalize once enough *distinct* approvers have
    // said so. required_approvals is 1 for almost every tool (agent-
    // registry.ts), so this resolves on the very first approval exactly as
    // before; it only actually holds for the critical/dual-control tier
    // (e.g. seal.release_lot), where a second, different approver's
    // decision still needs to land before anything executes.
    const approvedCount = await withTenant(user.tenant_id, trx => trx.selectFrom('agent_approval_decisions')
      .select(trx.fn.count('id').as('n'))
      .where('approval_id', '=', id).where('decision', '=', 'approved').executeTakeFirstOrThrow());
    const approvalsReceived = Number(approvedCount.n);
    if (approvalsReceived < approval.required_approvals) {
      return { status: 'pending', approvalsReceived, approvalsRequired: approval.required_approvals };
    }

    await withTenant(user.tenant_id, trx => trx.updateTable('agent_approvals').set({
      status: 'approved', decided_by: user.sub, decided_at: new Date(), decision_note: body.note ?? null,
    }).where('id', '=', id).execute());

    // Quorum met — execute the held tool call for real and resume the loop
    // exactly where it left off (see agent-runtime.service.ts's header for
    // why replaying the raw stored assistant message is what makes this
    // faithful regardless of how long the approval sat pending).
    const preview = typeof approval.preview === 'string' ? JSON.parse(approval.preview) : approval.preview;
    const run = await withTenant(user.tenant_id, trx => trx.selectFrom('agent_runs').selectAll()
      .where('id', '=', approval.run_id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow());

    // The tool acts on behalf of the run's own initiator, not whoever
    // happens to be approving it — a "my own X" tool (e.g. tasks.list_
    // my_open) means the initiator's "my", regardless of who cleared the gate.
    const allowedNow = await getAllowedToolIds(user.tenant_id, run.agent_id);
    if (allowedNow && !allowedNow.has(approval.tool_id)) {
      const reason = `${approval.tool_id} is no longer enabled for this agent, so it was not run.`;
      await withTenant(user.tenant_id, trx => trx.updateTable('agent_runs').set({ status: 'failed', error_message: reason, updated_at: new Date(), completed_at: new Date() }).where('id', '=', approval.run_id).execute());
      return reply.status(409).send({ error: reason });
    }

    const result = await runAgentTool({ tenantId: user.tenant_id, userId: run.initiator_user_id }, approval.tool_id, preview.input || {});
    const seq = await nextStepSequence(user.tenant_id, approval.run_id);
    await appendRunSteps(user.tenant_id, approval.run_id, seq, [
      { stepType: 'tool_result', toolId: approval.tool_id, input: preview.input, output: result.output ?? result.detail, status: result.ok ? 'ok' : 'error', latencyMs: null, error: result.ok ? null : result.detail },
    ]);

    const history = await withTenant(user.tenant_id, trx => loadHistory(trx, approval.run_id));
    const settings = await withTenant(user.tenant_id, trx =>
      trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    const aiCfg = (settings?.settings as any)?.['int-ai'] ?? {};
    const creds = await resolveAiCredentials(user.tenant_id, aiCfg, user.role);
    if (!creds) {
      const reason = await describeAiUnavailable(user.tenant_id);
      await withTenant(user.tenant_id, trx => trx.updateTable('agent_runs').set({ status: 'failed', error_message: reason, updated_at: new Date(), completed_at: new Date() }).where('id', '=', approval.run_id).execute());
      return reply.status(400).send({ error: reason });
    }
    const resumed = await runAgentLoop(
      user.tenant_id, run.initiator_user_id, creds.apiKey, creds.model || run.model || creds.model, creds.provider, user.role, history,
      { toolId: approval.tool_id, result, rawAssistantMessage: preview.rawAssistantMessage, toolUseId: preview.toolUseId },
      await loadMemorySection(user.tenant_id, run.initiator_user_id), allowedNow, await getToolLimits(user.tenant_id, run.agent_id),
    );
    const summary = await applyLoopResult(user.tenant_id, approval.run_id, resumed);

    return { status: 'approved', runStatus: resumed.status, approvalsReceived, approvalsRequired: approval.required_approvals, ...summary };
  });
}
