import { withTenant } from '../db/client.js';
import type { ToolLimits } from './agent-runtime.service.js';

/**
 * Per-agent tool grants (agent_tool_grants, migration 488) — lets a tenant
 * admin narrow what the Workspace Agent may do.
 *
 * Semantics, chosen so turning this on can never silently break an existing
 * tenant:
 *   - An agent with NO grant rows is unrestricted (today's behaviour — every
 *     tool in the registry is available, still subject to the normal
 *     approval policy).
 *   - The moment any grant row exists, the agent is restricted to an
 *     allow-list: only tools with an unexpired grant are offered to the
 *     model, and any other call is refused at execution time too (the model
 *     is never trusted to only call what it was shown).
 *   - Expired grants stop counting but still make the agent "restricted" — a
 *     fully expired list means no tools, never a silent fall back to
 *     unrestricted.
 *   - Grants only ever narrow. They cannot bypass an approval gate; a granted
 *     tool with approvalPolicy 'always' still needs a human.
 */

/** null = unrestricted; otherwise the set of tool ids this agent may use right now. */
export async function getAllowedToolIds(tenantId: string, agentId: string | null): Promise<Set<string> | null> {
  if (!agentId) return null;
  const rows = await withTenant(tenantId, trx => trx.selectFrom('agent_tool_grants')
    .select(['tool_id', 'expires_at'])
    .where('tenant_id', '=', tenantId).where('agent_id', '=', agentId).execute());
  if (rows.length === 0) return null;
  const now = Date.now();
  return new Set(rows.filter(r => !r.expires_at || new Date(r.expires_at).getTime() > now).map(r => r.tool_id));
}

export interface ToolGrantView { toolId: string; expiresAt: string | null; maxAmountTzs: number | null }

/** The one condition understood today: a cap on a call's `amountTzs`. Anything
 *  else in the stored JSON — or a non-positive/garbage value — is ignored. */
function readMaxAmount(conditions: unknown): number | null {
  let c: any = conditions;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { return null; } }
  const n = Number(c?.maxAmountTzs);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Limits from the agent's unexpired grants, keyed by tool id. Empty = no caps. */
export async function getToolLimits(tenantId: string, agentId: string | null): Promise<ToolLimits> {
  if (!agentId) return {};
  const rows = await withTenant(tenantId, trx => trx.selectFrom('agent_tool_grants')
    .select(['tool_id', 'expires_at', 'conditions'])
    .where('tenant_id', '=', tenantId).where('agent_id', '=', agentId).execute());
  const now = Date.now();
  const limits: ToolLimits = {};
  for (const r of rows) {
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
    const max = readMaxAmount(r.conditions);
    if (max !== null) limits[r.tool_id] = { maxAmountTzs: max };
  }
  return limits;
}

export async function listToolGrants(tenantId: string, agentId: string): Promise<ToolGrantView[]> {
  const rows = await withTenant(tenantId, trx => trx.selectFrom('agent_tool_grants')
    .select(['tool_id', 'expires_at', 'conditions']).where('tenant_id', '=', tenantId).where('agent_id', '=', agentId)
    .orderBy('tool_id', 'asc').execute());
  return rows.map(r => ({ toolId: r.tool_id, expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null, maxAmountTzs: readMaxAmount(r.conditions) }));
}

/** Replaces the agent's whole allow-list in one transaction. `toolIds: null`
 *  clears every grant, returning the agent to unrestricted. `maxAmountTzs`
 *  maps a granted tool id to its cap. */
export async function replaceToolGrants(
  tenantId: string, agentId: string, toolIds: string[] | null, grantedBy: string, expiresAt: Date | null,
  maxAmountTzs: Record<string, number> = {},
): Promise<void> {
  await withTenant(tenantId, async (trx) => {
    await trx.deleteFrom('agent_tool_grants').where('tenant_id', '=', tenantId).where('agent_id', '=', agentId).execute();
    if (toolIds && toolIds.length > 0) {
      await trx.insertInto('agent_tool_grants').values(
        [...new Set(toolIds)].map(toolId => ({
          tenant_id: tenantId, agent_id: agentId, tool_id: toolId, granted_by: grantedBy, expires_at: expiresAt,
          conditions: JSON.stringify(maxAmountTzs[toolId] ? { maxAmountTzs: maxAmountTzs[toolId] } : {}),
        })),
      ).execute();
    }
  });
}
