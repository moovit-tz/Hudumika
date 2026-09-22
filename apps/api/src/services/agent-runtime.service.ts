import { withTenant } from '../db/client.js';
import { AGENT_TOOL_REGISTRY, AGENT_TOOL_INPUT_SCHEMAS, runAgentTool, evidenceForTool, type AgentToolResult } from './agent-registry.js';
import { AI_PROVIDER_CONFIG, detectAiProvider, generationParams, providerErrorMessage } from '../lib/ai-providers.js';
import type { AgentApprovalPolicy } from '@hudumika/types';

/**
 * Milestone 2 of the agentic platform build (see
 * C:\Users\Viden\.claude\plans\ancient-bouncing-gem.md). A second, parallel
 * agentic loop to ai.routes.ts's runAgenticChat — deliberately not a shared
 * refactor of it. That function is live, working code /v1/ai/chat depends
 * on; the plan's own design principle ("additive, not a rewrite") means
 * this file mirrors its proven Anthropic/OpenAI wire-format handling rather
 * than risk regressing it. The two real differences this loop adds:
 *
 *   1. It calls the full 13-tool AGENT_TOOL_REGISTRY (agent-registry.ts),
 *      not just the 4 read-only AI_TOOL_DEFINITIONS — so a run can act, not
 *      only answer.
 *   2. Before executing a tool whose approvalPolicy requires it, it stops
 *      and hands back exactly what's needed to create a durable
 *      agent_approvals row and resume later — it never executes a
 *      consequential tool call a human hasn't cleared.
 */

const SYSTEM_PROMPT = `You are the Hudumika Workspace Agent, embedded across every app on the
platform. Use the tools provided to answer questions and carry out real work on the tenant's
own operational data — never guess a number or claim an action succeeded that you didn't
actually take. If a tool result says an approval is required, tell the user plainly that
you've asked for approval and are waiting on it. Keep answers concise and concrete.`;

const MAX_TOOL_ROUNDS = 6;

/** Providers only accept tool names matching ^[a-zA-Z0-9_-]{1,64}$ — Anthropic,
 *  OpenAI and Groq all reject a request outright otherwise — but our tool ids
 *  are dotted ("tasks.list_my_open"). The model sees a reversible wire name
 *  ('.' -> '__'); everything stored or matched internally (steps, evidence,
 *  grants, approvals) stays the canonical dotted id. No registered id
 *  contains '__', which agent-tools.test.ts asserts, so the mapping can't
 *  collide. */
const wireName = (id: string) => id.split('.').join('__');
const toolByWireName = (name: string) => AGENT_TOOL_REGISTRY.find(t => wireName(t.id) === name);

/** The loop handles ONE tool call per model turn (see the comment in the
 *  Anthropic branch). Both providers still reject the next request unless
 *  EVERY tool call the model made in that turn has a result, so any call
 *  beyond the first is answered with this explicit "not run" — the model can
 *  simply ask again next step. Without it, a model that requests two things
 *  at once gets a 400 and the whole run fails. */
const SKIPPED_CALL_RESULT = 'Not run: only one tool call is handled per step. Call it again if it is still needed.';
const anthropicSkipped = (blocks: any, exceptId: string) =>
  (Array.isArray(blocks) ? blocks : []).filter((b: any) => b?.type === 'tool_use' && b.id !== exceptId)
    .map((b: any) => ({ type: 'tool_result', tool_use_id: b.id, content: SKIPPED_CALL_RESULT, is_error: true }));
const openAiSkipped = (message: any, exceptId: string) =>
  (Array.isArray(message?.tool_calls) ? message.tool_calls : []).filter((c: any) => c?.id !== exceptId)
    .map((c: any) => ({ role: 'tool', tool_call_id: c.id, content: SKIPPED_CALL_RESULT }));

/** Management-tier roles proceed directly on a 'policy' tool; anyone else needs
 *  a human decision first. A first-cut heuristic — agent_tool_grants.conditions
 *  (migration 488) is where a real per-tenant/per-tool policy configuration
 *  belongs once one is needed; this is deliberately simple until it is. */
const POLICY_TRUSTED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

export function decideToolPolicy(approvalPolicy: AgentApprovalPolicy, actorRole: string): 'allow' | 'require_approval' {
  if (approvalPolicy === 'always') return 'require_approval';
  if (approvalPolicy === 'never') return 'allow';
  return POLICY_TRUSTED_ROLES.includes(actorRole) ? 'allow' : 'require_approval';
}

/** Per-tool limits from agent_tool_grants.conditions (agent-grants.service.ts). */
export type ToolLimits = Record<string, { maxAmountTzs?: number }>;

/** True when a call is over a granted limit. A limit only ever adds a human
 *  check (it turns "allow" into "require approval") — it never lets anything
 *  through that policy would have held. An unreadable amount counts as over. */
export function exceedsToolLimit(toolId: string, input: Record<string, unknown> | null | undefined, limits: ToolLimits): boolean {
  const max = limits[toolId]?.maxAmountTzs;
  if (max === undefined) return false;
  const amount = Number((input as any)?.amountTzs);
  return !Number.isFinite(amount) || amount > max;
}

export interface AgentLoopStepRecord {
  stepType: 'tool_call' | 'tool_result' | 'message';
  toolId: string | null;
  input: Record<string, unknown> | null;
  output: unknown;
  status: 'ok' | 'error' | 'simulated';
  latencyMs: number | null;
  error: string | null;
  /** Real token usage the provider reported for the model call behind this step — never estimated. */
  tokensIn?: number | null;
  tokensOut?: number | null;
}

/** Token usage as reported by the provider (null when it didn't report any). */
export interface TokenUsage { tokensIn: number | null; tokensOut: number | null }

export interface AgentLoopPendingApproval {
  toolId: string;
  input: Record<string, unknown>;
  preview: unknown;
  /** Raw provider message + tool-call id, opaque here — replayed verbatim on
   *  resume so the model sees its own prior tool_use/tool_call unchanged,
   *  regardless of how long the approval sits pending. */
  rawAssistantMessage: unknown;
  toolUseId: string;
}

export interface AgentLoopResult {
  status: 'completed' | 'awaiting_approval' | 'failed';
  finalText: string | null;
  steps: AgentLoopStepRecord[];
  pendingApproval?: AgentLoopPendingApproval;
  errorMessage?: string;
  /** Usage of the final model call (the one that produced finalText) — earlier calls' usage sits on their tool_call steps. */
  finalUsage?: TokenUsage;
}

interface HistoryTurn { role: 'user' | 'assistant'; content: string }

/** Anthropic branch. `resumeWith`, when set, is appended before the fresh
 *  user turn — the exact assistant tool_use block an approval just cleared,
 *  plus its real tool_result — so the model continues the same reasoning
 *  rather than starting over having forgotten it ever asked. */
async function runAnthropicLoop(
  tenantId: string, userId: string, apiKey: string, model: string, actorRole: string,
  history: HistoryTurn[], resumeWith?: { rawAssistantMessage: any; toolUseId: string; result: AgentToolResult },
  memorySection = '',
  allowedToolIds: Set<string> | null = null,
  toolLimits: ToolLimits = {},
): Promise<AgentLoopResult> {
  const systemPrompt = SYSTEM_PROMPT + memorySection;
  const steps: AgentLoopStepRecord[] = [];
  const messages: any[] = history.map(m => ({ role: m.role, content: m.content }));
  if (resumeWith) {
    messages.push({ role: 'assistant', content: resumeWith.rawAssistantMessage });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: resumeWith.toolUseId, content: JSON.stringify(resumeWith.result.output ?? resumeWith.result.detail) }, ...anthropicSkipped(resumeWith.rawAssistantMessage, resumeWith.toolUseId)] });
  }
  const tools = AGENT_TOOL_REGISTRY.filter(t => !allowedToolIds || allowedToolIds.has(t.id)).map(t => ({ name: wireName(t.id), description: t.description, input_schema: AGENT_TOOL_INPUT_SCHEMAS[t.id] }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const started = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...generationParams('anthropic', model, 1024), system: systemPrompt, messages, ...(tools.length ? { tools } : {}) }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      return { status: 'failed', finalText: null, steps, errorMessage: providerErrorMessage(err, res.status, 'Anthropic') };
    }
    const data: any = await res.json();
    const latency = Date.now() - started;
    const usage: TokenUsage = { tokensIn: data.usage?.input_tokens ?? null, tokensOut: data.usage?.output_tokens ?? null };

    const toolUseBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      return { status: 'completed', finalText: text, steps, finalUsage: usage };
    }

    // One tool call handled per round, deliberately — a batch of parallel
    // tool_use blocks where one needs approval would otherwise force an
    // awkward choice between executing the others anyway (a partial run
    // hidden inside what looks like one step) or discarding real results.
    const block = toolUseBlocks[0];
    const tool = toolByWireName(block.name);
    if (!tool) {
      steps.push({ stepType: 'tool_call', toolId: block.name, input: block.input, output: null, status: 'error', latencyMs: latency, error: `Unknown tool: ${block.name}` });
      return { status: 'failed', finalText: null, steps, errorMessage: `Unknown tool: ${block.name}` };
    }
    steps.push({ stepType: 'tool_call', toolId: tool.id, input: block.input, output: null, status: 'ok', latencyMs: latency, error: null, ...usage });

    // The model is never trusted to call only what it was shown.
    if (allowedToolIds && !allowedToolIds.has(tool.id)) {
      const denied = { ok: false, detail: `Tool ${tool.id} is not enabled for this agent.` };
      steps.push({ stepType: 'tool_result', toolId: tool.id, input: block.input, output: denied.detail, status: 'error', latencyMs: 0, error: denied.detail });
      messages.push({ role: 'assistant', content: data.content });
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: denied.detail, is_error: true }, ...anthropicSkipped(data.content, block.id)] });
      continue;
    }

    const decision = exceedsToolLimit(tool.id, block.input, toolLimits) ? 'require_approval' : decideToolPolicy(tool.approvalPolicy, actorRole);
    if (decision === 'require_approval') {
      const preview = await runAgentTool({ tenantId, userId, simulate: true }, tool.id, block.input || {});
      return {
        status: 'awaiting_approval', finalText: null, steps,
        pendingApproval: { toolId: tool.id, input: block.input || {}, preview, rawAssistantMessage: data.content, toolUseId: block.id },
      };
    }

    const toolStarted = Date.now();
    const result = await runAgentTool({ tenantId, userId }, tool.id, block.input || {});
    steps.push({ stepType: 'tool_result', toolId: tool.id, input: block.input, output: result.output ?? result.detail, status: result.ok ? 'ok' : 'error', latencyMs: Date.now() - toolStarted, error: result.ok ? null : result.detail });

    messages.push({ role: 'assistant', content: data.content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result.output ?? result.detail) }, ...anthropicSkipped(data.content, block.id)] });
  }
  return { status: 'completed', finalText: "I wasn't able to finish that — try narrowing the request.", steps };
}

/** OpenAI-compatible branch — same shape as runAnthropicLoop, mirroring the
 *  wire format difference the same way ai.routes.ts's runAgenticChat already
 *  does. Shared by OpenAI, Groq and Google's Gemini (lib/ai-providers.ts) —
 *  all three speak the same chat/completions + tool-calling shape, just at a
 *  different base URL. */
async function runOpenAiLoop(
  tenantId: string, userId: string, apiKey: string, model: string, provider: string, actorRole: string,
  history: HistoryTurn[], resumeWith?: { rawAssistantMessage: any; toolCallId: string; result: AgentToolResult },
  memorySection = '',
  allowedToolIds: Set<string> | null = null,
  toolLimits: ToolLimits = {},
): Promise<AgentLoopResult> {
  const systemPrompt = SYSTEM_PROMPT + memorySection;
  const providerCfg = AI_PROVIDER_CONFIG[detectAiProvider(provider, model)];
  const steps: AgentLoopStepRecord[] = [];
  const messages: any[] = [{ role: 'system', content: systemPrompt }, ...history];
  if (resumeWith) {
    messages.push(resumeWith.rawAssistantMessage);
    messages.push({ role: 'tool', tool_call_id: resumeWith.toolCallId, content: JSON.stringify(resumeWith.result.output ?? resumeWith.result.detail) });
    messages.push(...openAiSkipped(resumeWith.rawAssistantMessage, resumeWith.toolCallId));
  }
  const tools = AGENT_TOOL_REGISTRY.filter(t => !allowedToolIds || allowedToolIds.has(t.id)).map(t => ({ type: 'function', function: { name: wireName(t.id), description: t.description, parameters: providerCfg.toolSchema ? providerCfg.toolSchema(AGENT_TOOL_INPUT_SCHEMAS[t.id]) : AGENT_TOOL_INPUT_SCHEMAS[t.id] } }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const started = Date.now();
    const res = await fetch(providerCfg.baseUrl, {
      method: 'POST',
      headers: { ...providerCfg.authHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, ...generationParams(detectAiProvider(provider, model), model, 1024), messages, ...(tools.length ? { tools } : {}) }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      return { status: 'failed', finalText: null, steps, errorMessage: providerErrorMessage(err, res.status, providerCfg.label) };
    }
    const data: any = await res.json();
    const latency = Date.now() - started;
    const message = data.choices?.[0]?.message;
    // Some OpenAI-compatible layers omit tool_call ids; the result message must reference one, so give it one (also on the stored raw message that gets replayed).
    if (Array.isArray(message?.tool_calls)) message.tool_calls.forEach((c: any, i: number) => { if (!c.id) c.id = `call_${round}_${i}`; });
    const usage: TokenUsage = { tokensIn: data.usage?.prompt_tokens ?? null, tokensOut: data.usage?.completion_tokens ?? null };

    if (!message?.tool_calls?.length) {
      return { status: 'completed', finalText: message?.content || '', steps, finalUsage: usage };
    }

    const call = message.tool_calls[0];
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(call.function.arguments || '{}'); } catch { /* malformed args — treated as empty input */ }
    const tool = toolByWireName(call.function.name);
    if (!tool) {
      steps.push({ stepType: 'tool_call', toolId: call.function.name, input, output: null, status: 'error', latencyMs: latency, error: `Unknown tool: ${call.function.name}` });
      return { status: 'failed', finalText: null, steps, errorMessage: `Unknown tool: ${call.function.name}` };
    }
    steps.push({ stepType: 'tool_call', toolId: tool.id, input, output: null, status: 'ok', latencyMs: latency, error: null, ...usage });

    if (allowedToolIds && !allowedToolIds.has(tool.id)) {
      const denied = `Tool ${tool.id} is not enabled for this agent.`;
      steps.push({ stepType: 'tool_result', toolId: tool.id, input, output: denied, status: 'error', latencyMs: 0, error: denied });
      messages.push(message);
      messages.push({ role: 'tool', tool_call_id: call.id, content: denied });
      messages.push(...openAiSkipped(message, call.id));
      continue;
    }

    const decision = exceedsToolLimit(tool.id, input, toolLimits) ? 'require_approval' : decideToolPolicy(tool.approvalPolicy, actorRole);
    if (decision === 'require_approval') {
      const preview = await runAgentTool({ tenantId, userId, simulate: true }, tool.id, input);
      return {
        status: 'awaiting_approval', finalText: null, steps,
        pendingApproval: { toolId: tool.id, input, preview, rawAssistantMessage: message, toolUseId: call.id },
      };
    }

    const toolStarted = Date.now();
    const result = await runAgentTool({ tenantId, userId }, tool.id, input);
    steps.push({ stepType: 'tool_result', toolId: tool.id, input, output: result.output ?? result.detail, status: result.ok ? 'ok' : 'error', latencyMs: Date.now() - toolStarted, error: result.ok ? null : result.detail });

    messages.push(message);
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.output ?? result.detail) });
    messages.push(...openAiSkipped(message, call.id));
  }
  return { status: 'completed', finalText: "I wasn't able to finish that — try narrowing the request.", steps };
}

export async function runAgentLoop(
  tenantId: string, userId: string, apiKey: string, model: string, provider: string, actorRole: string,
  history: HistoryTurn[],
  resumeApproval?: { toolId: string; result: AgentToolResult; rawAssistantMessage: unknown; toolUseId: string },
  /** Saved tenant/personal memory (ai-memory.service.ts's memoryPromptSection), appended to the system prompt. */
  memorySection = '',
  /** null = unrestricted; otherwise the only tools this agent may use (agent-grants.service.ts). */
  allowedToolIds: Set<string> | null = null,
  /** Per-tool caps (e.g. maxAmountTzs) that force human approval when exceeded. */
  toolLimits: ToolLimits = {},
): Promise<AgentLoopResult> {
  const providerCfg = AI_PROVIDER_CONFIG[detectAiProvider(provider, model)];
  if (providerCfg.kind === 'anthropic') {
    return runAnthropicLoop(tenantId, userId, apiKey, model, actorRole, history, resumeApproval && { rawAssistantMessage: resumeApproval.rawAssistantMessage, toolUseId: resumeApproval.toolUseId, result: resumeApproval.result }, memorySection, allowedToolIds, toolLimits);
  }
  return runOpenAiLoop(tenantId, userId, apiKey, model, provider, actorRole, history, resumeApproval && { rawAssistantMessage: resumeApproval.rawAssistantMessage, toolCallId: resumeApproval.toolUseId, result: resumeApproval.result }, memorySection, allowedToolIds, toolLimits);
}

// ── Persistence ─────────────────────────────────────────────────────────

/** The tenant's one built-in "Workspace Agent" identity (kind='platform',
 *  migration 490's partial unique index), created on first use so every
 *  run is attributed to a real agent_identities row instead of a null
 *  agent_id. Safe under concurrent first runs: the insert is a no-op if
 *  another request won the race, then both re-read the same row. */
export async function getOrCreatePlatformAgentId(tenantId: string): Promise<string> {
  return withTenant(tenantId, async (trx) => {
    const find = () => trx.selectFrom('agent_identities').select('id')
      .where('tenant_id', '=', tenantId).where('kind', '=', 'platform').executeTakeFirst();
    const existing = await find();
    if (existing) return existing.id;
    await trx.insertInto('agent_identities')
      .values({ tenant_id: tenantId, name: 'Workspace Agent', kind: 'platform' })
      .onConflict(oc => oc.column('tenant_id').where('kind', '=', 'platform').doNothing())
      .execute();
    return (await find())!.id;
  });
}

export async function appendRunSteps(tenantId: string, runId: string, startSequence: number, steps: AgentLoopStepRecord[]): Promise<void> {
  if (steps.length === 0) return;
  // Evidence recorded per run, capped so one broad list-everything call can't flood it.
  const MAX_EVIDENCE_PER_STEP = 10;
  await withTenant(tenantId, async (trx) => {
    const inserted = await trx.insertInto('agent_run_steps').values(
    steps.map((s, i) => ({
      tenant_id: tenantId, run_id: runId, sequence: startSequence + i,
      step_type: s.stepType, tool_id: s.toolId,
      input: s.input ? JSON.stringify(s.input) : null,
      output: s.output !== undefined && s.output !== null ? JSON.stringify(s.output) : null,
      status: s.status, latency_ms: s.latencyMs, error: s.error,
      tokens_in: s.tokensIn ?? null, tokens_out: s.tokensOut ?? null,
    })),
    ).returning(['id', 'sequence']).execute();

    const idBySequence = new Map(inserted.map(r => [r.sequence, r.id]));
    const evidenceRows = steps.flatMap((s, i) => {
      if (s.stepType !== 'tool_result' || s.status !== 'ok' || !s.toolId) return [];
      const stepId = idBySequence.get(startSequence + i) ?? null;
      return evidenceForTool(s.toolId, s.output, s.input ?? undefined).slice(0, MAX_EVIDENCE_PER_STEP).map(e => ({
        tenant_id: tenantId, run_id: runId, step_id: stepId,
        claim: e.claim, entity_type: e.entityType, entity_id: e.entityId,
      }));
    });
    if (evidenceRows.length > 0) await trx.insertInto('agent_evidence').values(evidenceRows).execute();
  });
}

export async function nextStepSequence(tenantId: string, runId: string): Promise<number> {
  return withTenant(tenantId, async trx => {
    const row = await trx.selectFrom('agent_run_steps').select(eb => eb.fn.max('sequence').as('n'))
      .where('run_id', '=', runId).executeTakeFirst();
    return (row?.n ?? 0) + 1;
  });
}
