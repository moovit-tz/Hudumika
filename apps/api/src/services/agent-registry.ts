import { z } from 'zod';
import type { AgentApprovalPolicy, AgentToolEffect, AgentToolRisk, AgentToolSummary } from '@hudumika/types';
import { AI_TOOL_DEFINITIONS, runAiTool } from './ai-tools.service.js';
import { ACTIONS, type ActionContext } from '../studio/actions.js';
import { zodToJsonSchema, EMPTY_OBJECT_SCHEMA } from '../lib/zod-json-schema.js';
import { listMyOpenTasks, listDeals, addCrmNote, listUnpaidInvoices, listMyOpenTickets } from './agent-tools-extra.service.js';

/**
 * Milestone 1 of the agentic platform build (see
 * docs/architecture/HUDUMIKA_AGENTIC_IMPLEMENTATION_2026-09-19.html and
 * C:\Users\Viden\.claude\plans\ancient-bouncing-gem.md).
 *
 * Merges two previously disconnected typed-tool systems into one registry
 * an agent runtime can enumerate and call generically:
 *
 *   - ai-tools.service.ts's AI_TOOL_DEFINITIONS — 4 read-only tools the AI
 *     chat already calls, scoped to ClearOS shipments/receivables/customers.
 *   - studio/actions.ts's ACTIONS — 8 write-capable actions Studio workflows
 *     already call, spanning notifications/support/finance/HR/tasks/seal.
 *
 * Neither underlying system is changed or replaced. /v1/ai/chat keeps
 * calling runAiTool directly; the Studio executor keeps calling ACTIONS
 * directly. This file is a second, additive read of the same definitions —
 * risk/approval metadata layered on top, not a rewrite of either.
 *
 * A tool's risk/approvalPolicy here is a judgement call about what it does,
 * not something the wrapped function reports about itself:
 *   - low/never    — read-only, or a routine write with no real consequence
 *                    if wrong (an in-app notification, a to-do item).
 *   - medium/policy — a real business record that's easy to reverse.
 *   - high/policy   — reassigns accountability (who owns this ticket).
 *   - critical/always — matches the wrapped action's own `restricted: true`
 *                        (studio/actions.ts's flag for a regulated ledger
 *                        write) — never runs without a human decision.
 */

/** A real record a tool result was built from — what a run's "evidence" list shows. */
export interface EvidenceRef { claim: string; entityType: string; entityId: string }

interface AgentToolWrapper extends AgentToolSummary {
  /** Turns this tool's own output into the records it grounds — recorded to agent_evidence automatically. Every value comes straight from the output (or the call's own input for a tool whose output carries no id), nothing inferred. */
  evidence?(output: unknown, input?: Record<string, unknown>): EvidenceRef[];
  /** JSON Schema for this tool's arguments, sent to the model so it knows what to pass. Server-only — deliberately stripped from AGENT_TOOL_REGISTRY. */
  inputSchema: Record<string, unknown>;
  run(ctx: AgentToolContext, input: Record<string, unknown>): Promise<AgentToolResult>;
}

export interface AgentToolContext {
  tenantId: string;
  /** The user on whose behalf this call is being made — the run's own
   *  initiator, not necessarily whoever is at the keyboard right now (an
   *  approval-resume call passes the initiator's id, not the approver's).
   *  Optional because most existing tools are tenant-wide, not "mine" —
   *  only a "my own X" tool (e.g. tasks.list_my_open, milestone 4) needs it. */
  userId?: string;
  /** Dry-run — only meaningful for a write tool (Studio actions already support this). */
  simulate?: boolean;
}

export interface AgentToolResult {
  ok: boolean;
  /** Human-readable outcome, real and specific — never invented. */
  detail: string;
  output?: unknown;
}

function summarise(output: unknown): string {
  if (output && typeof output === 'object' && 'error' in (output as Record<string, unknown>)) {
    return String((output as Record<string, unknown>).error);
  }
  if (Array.isArray(output)) return `Returned ${output.length} result${output.length === 1 ? '' : 's'}.`;
  return 'Returned a result.';
}

/** Evidence for the ClearOS read tools — only those returning real records with ids (aged receivables is an aggregate, so it grounds no single record). */
const AI_TOOL_EVIDENCE: Record<string, (out: any) => EvidenceRef[]> = {
  get_at_risk_shipments: out => out.map((r: any) => ({ claim: `Shipment ${r.ref_number} (${r.customer}) is at stage ${r.stage}${r.sla_breached ? ', SLA breached' : ''}${r.demurrage_risk ? ', demurrage risk' : ''}`, entityType: 'shipment', entityId: r.id })),
  search_shipments: out => out.map((r: any) => ({ claim: `Shipment ${r.ref_number} (${r.customer}) is at stage ${r.stage}`, entityType: 'shipment', entityId: r.id })),
  get_customer_info: out => out.id ? [{ claim: `Customer ${out.customer}: ${out.total_shipments} shipments, ${out.outstanding_balance} outstanding`, entityType: 'customer', entityId: out.id }] : [],
};

/** The 4 existing AI chat tools — always read-only, never gated behind approval. */
const AI_TOOL_WRAPPERS: AgentToolWrapper[] = AI_TOOL_DEFINITIONS.map(def => ({
  id: def.name,
  appId: 'clearos',
  label: def.name.replace(/_/g, ' '),
  description: def.description,
  effect: 'read' as AgentToolEffect,
  risk: 'low' as AgentToolRisk,
  approvalPolicy: 'never' as AgentApprovalPolicy,
  inputSchema: def.input_schema as unknown as Record<string, unknown>,
  evidence: AI_TOOL_EVIDENCE[def.name],
  async run(ctx, input) {
    const output = await runAiTool(ctx.tenantId, def.name, input);
    const isError = !!(output && typeof output === 'object' && 'error' in (output as Record<string, unknown>));
    return { ok: !isError, detail: summarise(output), output };
  },
}));

/** Per-action risk assignment for the 8 Studio actions — restricted:true
 *  (studio/actions.ts) always maps to critical/always; everything else is
 *  judged by what the action actually does (see file header). */
const STUDIO_ACTION_POLICY: Record<string, { risk: AgentToolRisk; approvalPolicy: AgentApprovalPolicy }> = {
  'notification.send_in_app':  { risk: 'low',      approvalPolicy: 'never' },
  'support.create_ticket':     { risk: 'low',      approvalPolicy: 'never' },
  'support.assign_ticket':     { risk: 'medium',   approvalPolicy: 'policy' },
  'finance.record_expense':    { risk: 'medium',   approvalPolicy: 'policy' },
  'hr.log_activity':           { risk: 'low',      approvalPolicy: 'never' },
  'hr.find_available_staff':   { risk: 'low',      approvalPolicy: 'never' },
  'hr.post_announcement':      { risk: 'medium',   approvalPolicy: 'policy' },
  'tasks.create_task':         { risk: 'low',      approvalPolicy: 'never' },
  'seal.release_lot':          { risk: 'critical', approvalPolicy: 'always' },
};

/** Evidence for the write/lookup actions — only records a real action left behind, taken from the action's own output or, where it returns none, the id it was asked to act on (and only when its detail says it really happened). */
const STUDIO_EVIDENCE: Record<string, (output: any, input?: Record<string, unknown>) => EvidenceRef[]> = {
  'support.create_ticket':   out => out?.ticketId ? [{ claim: 'Opened a support ticket', entityType: 'ticket', entityId: out.ticketId }] : [],
  'finance.record_expense':  out => out?.expenseId ? [{ claim: 'Recorded an expense', entityType: 'expense', entityId: out.expenseId }] : [],
  'hr.post_announcement':    out => out?.announcementId ? [{ claim: 'Posted an announcement', entityType: 'announcement', entityId: out.announcementId }] : [],
  'tasks.create_task':       out => out?.taskId ? [{ claim: 'Created a task', entityType: 'task', entityId: out.taskId }] : [],
  'hr.find_available_staff': out => out?.userId ? [{ claim: `${out.name ?? 'A colleague'} was available`, entityType: 'user', entityId: out.userId }] : [],
  'support.assign_ticket':   (out, input) => typeof out === 'string' && out.startsWith('Assigned') && typeof input?.ticketId === 'string' ? [{ claim: 'Assigned a support ticket', entityType: 'ticket', entityId: input.ticketId }] : [],
  'seal.release_lot':        (out, input) => typeof out === 'string' && out.startsWith('Released') && typeof input?.lotId === 'string' ? [{ claim: 'Released a lot', entityType: 'lot', entityId: input.lotId }] : [],
};

const STUDIO_TOOL_WRAPPERS: AgentToolWrapper[] = ACTIONS.map(action => {
  const policy = STUDIO_ACTION_POLICY[action.id];
  if (!policy) {
    // Fails loudly at import time rather than silently defaulting an
    // un-triaged action to "safe" — a new Studio action must be assigned a
    // risk here before an agent can reach it at all.
    throw new Error(`agent-registry.ts: no risk policy assigned for Studio action "${action.id}"`);
  }
  const readOnly = action.id === 'hr.find_available_staff';
  return {
    id: action.id,
    appId: action.app,
    label: action.label,
    description: action.description,
    effect: (readOnly ? 'read' : 'create') as AgentToolEffect,
    risk: policy.risk,
    approvalPolicy: policy.approvalPolicy,
    inputSchema: zodToJsonSchema(action.inputSchema),
    evidence: STUDIO_EVIDENCE[action.id],
    async run(ctx, input) {
      const parsed = action.inputSchema.parse(input);
      const actionCtx: ActionContext = { tenantId: ctx.tenantId, entityId: null, payload: {}, simulate: !!ctx.simulate };
      const result = await action.execute(actionCtx, parsed);
      return { ok: result.ok, detail: result.detail, output: result.output };
    },
  };
});

/**
 * Milestone 4 — new tools closing two gaps found live during milestone 5's
 * verification: there was no way for the agent to answer "what tasks do I
 * have" (only tasks.create_task existed), and zero CRM coverage at all. See
 * agent-tools-extra.service.ts's own header for exactly which of these call
 * a genuinely shared existing function vs. deliberately duplicate an
 * existing route's read-only query logic, and why.
 */
const listDealsInput = z.object({
  ownerId: z.string().uuid().optional().describe('Only deals owned by this user id'),
  onlyMine: z.boolean().optional().describe("Set true to list only the calling user's own deals"),
});
const addCrmNoteInput = z.object({
  subjectType: z.enum(['lead', 'deal']).describe('Whether the note is on a lead or a deal'),
  subjectId: z.string().uuid().describe('The id of that lead or deal'),
  body: z.string().trim().min(1).max(2000).describe('The note text'),
});
const listUnpaidInvoicesInput = z.object({
  overdueOnly: z.boolean().optional().describe('Set true to list only overdue invoices'),
});

const listMyOpenTasksTool: AgentToolWrapper = {
  id: 'tasks.list_my_open', appId: 'tasks',
  label: 'List my open tasks',
  description: "Lists the calling user's own open (not completed) tasks — owned, assigned, on a shared list, or from a project they belong to.",
  effect: 'read', risk: 'low', approvalPolicy: 'never',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  evidence: out => (out as { id: string; title: string }[]).map(t => ({ claim: `Open task: "${t.title}"`, entityType: 'task', entityId: t.id })),
  async run(ctx) {
    if (!ctx.userId) return { ok: false, detail: 'No user context for this call.' };
    const tasks = await listMyOpenTasks(ctx.tenantId, ctx.userId);
    return { ok: true, detail: `${tasks.length} open task${tasks.length === 1 ? '' : 's'}.`, output: tasks };
  },
};

const listDealsTool: AgentToolWrapper = {
  id: 'crm.list_deals', appId: 'crm',
  label: 'List CRM deals',
  description: "Lists open deals in the CRM pipeline, optionally filtered to a specific owner's own deals.",
  effect: 'read', risk: 'low', approvalPolicy: 'never',
  inputSchema: zodToJsonSchema(listDealsInput),
  evidence: out => (out as { id: string; name: string; stage: string }[]).map(d => ({ claim: `Deal "${d.name}" is at stage ${d.stage}`, entityType: 'deal', entityId: d.id })),
  async run(ctx, input) {
    const parsed = listDealsInput.parse(input);
    const ownerId = parsed.onlyMine ? ctx.userId : parsed.ownerId;
    const deals = await listDeals(ctx.tenantId, { ownerId });
    return { ok: true, detail: `${deals.length} deal${deals.length === 1 ? '' : 's'}.`, output: deals };
  },
};

const addCrmNoteTool: AgentToolWrapper = {
  id: 'crm.add_note', appId: 'crm',
  label: 'Add a CRM note',
  description: 'Adds a permanent activity note to a lead or deal — visible in that record\'s real activity timeline.',
  effect: 'create', risk: 'low', approvalPolicy: 'never',
  inputSchema: zodToJsonSchema(addCrmNoteInput),
  async run(ctx, input) {
    const parsed = addCrmNoteInput.parse(input);
    return addCrmNote(ctx.tenantId, parsed);
  },
};

const listUnpaidInvoicesTool: AgentToolWrapper = {
  id: 'finops.list_unpaid_invoices', appId: 'finops',
  label: 'List unpaid invoices',
  description: 'Lists customer invoices still owing money (unpaid, partly paid or overdue) with total, amount received and outstanding balance, soonest due first. Set overdueOnly to see just the overdue ones.',
  effect: 'read', risk: 'low', approvalPolicy: 'never',
  inputSchema: zodToJsonSchema(listUnpaidInvoicesInput),
  evidence: out => (out as { id: string; invoiceNumber: string; clientName: string | null; currency: string; outstanding: number }[]).map(i => ({ claim: `Invoice ${i.invoiceNumber}${i.clientName ? ` (${i.clientName})` : ''} has ${i.currency} ${i.outstanding} outstanding`, entityType: 'invoice', entityId: i.id })),
  async run(ctx, input) {
    const parsed = listUnpaidInvoicesInput.parse(input);
    const invoices = await listUnpaidInvoices(ctx.tenantId, { overdueOnly: parsed.overdueOnly });
    return { ok: true, detail: `${invoices.length} unpaid invoice${invoices.length === 1 ? '' : 's'}.`, output: invoices };
  },
};

const listMyOpenTicketsTool: AgentToolWrapper = {
  id: 'bliss.list_my_open_tickets', appId: 'bliss',
  label: 'List my open support tickets',
  description: "Lists open support tickets (Bliss) assigned to the calling user, most urgent SLA deadline first.",
  effect: 'read', risk: 'low', approvalPolicy: 'never',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  evidence: out => (out as { id: string; ref: string; subject: string }[]).map(t => ({ claim: `Ticket ${t.ref}: ${t.subject}`, entityType: 'ticket', entityId: t.id })),
  async run(ctx) {
    if (!ctx.userId) return { ok: false, detail: 'No user context for this call.' };
    const tickets = await listMyOpenTickets(ctx.tenantId, ctx.userId);
    return { ok: true, detail: `${tickets.length} open ticket${tickets.length === 1 ? '' : 's'} assigned to you.`, output: tickets };
  },
};

const MILESTONE_4_TOOL_WRAPPERS: AgentToolWrapper[] = [listMyOpenTasksTool, listDealsTool, addCrmNoteTool, listUnpaidInvoicesTool, listMyOpenTicketsTool];

export const AGENT_TOOL_WRAPPERS: AgentToolWrapper[] = [...AI_TOOL_WRAPPERS, ...STUDIO_TOOL_WRAPPERS, ...MILESTONE_4_TOOL_WRAPPERS];

/** Client-safe catalogue — never the schema or execution logic. */
export const AGENT_TOOL_REGISTRY: AgentToolSummary[] = AGENT_TOOL_WRAPPERS.map(
  ({ run: _run, inputSchema: _schema, ...summary }) => summary,
);

/** Argument schemas for the model (server-only), keyed by tool id. */
export const AGENT_TOOL_INPUT_SCHEMAS: Record<string, Record<string, unknown>> =
  Object.fromEntries(AGENT_TOOL_WRAPPERS.map(w => [w.id, w.inputSchema]));

const WRAPPERS_BY_ID = new Map(AGENT_TOOL_WRAPPERS.map(w => [w.id, w]));

/** The records a successful tool result grounds (see AgentToolWrapper.evidence). Never throws — a tool whose output has an unexpected shape simply records no evidence. */
export function evidenceForTool(toolId: string, output: unknown, input?: Record<string, unknown>): EvidenceRef[] {
  const tool = WRAPPERS_BY_ID.get(toolId);
  if (!tool?.evidence || output === null || output === undefined) return [];
  try { return tool.evidence(output, input).filter(e => e.entityId); } catch { return []; }
}

export async function runAgentTool(ctx: AgentToolContext, toolId: string, input: Record<string, unknown>): Promise<AgentToolResult> {
  const tool = WRAPPERS_BY_ID.get(toolId);
  if (!tool) return { ok: false, detail: `Unknown tool: ${toolId}` };
  // A model can emit malformed arguments. That must come back to it as an
  // ordinary failed tool result it can correct on the next round — never as
  // a thrown error that takes down the whole run.
  try {
    return await tool.run(ctx, input);
  } catch (err) {
    const e = err as { name?: string; issues?: { path: (string | number)[]; message: string }[]; message?: string };
    if (e?.name === 'ZodError' && Array.isArray(e.issues)) {
      const detail = e.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
      return { ok: false, detail: `Invalid arguments for ${toolId} — ${detail}` };
    }
    return { ok: false, detail: `${toolId} failed: ${e?.message || 'unknown error'}` };
  }
}
