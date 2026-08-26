import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * AP approval (M9 of the corporate-tax build-out) — opt-in, off unless
 * `tenant_settings.ap_approval_required` is explicitly set. Two existing
 * tenant behaviors (auto-post on create, no gate at all) would otherwise
 * break silently on deploy day, which is why this reads a flag rather than
 * always applying once the feature ships.
 */

export async function isApApprovalRequired(trx: Transaction<Database>, tenantId: string): Promise<boolean> {
  const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!row) return false;
  const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
  return settings?.ap_approval_required === true;
}

/** The workflow a bill of this amount qualifies for — the active workflow
 * with the highest min_amount that the amount still clears. Null if
 * nothing qualifies (no workflows configured, or all thresholds exceed
 * the amount). */
export async function resolveApprovalWorkflow(trx: Transaction<Database>, tenantId: string, amount: number) {
  return trx.selectFrom('ap_approval_workflows').selectAll()
    .where('tenant_id', '=', tenantId).where('active', '=', true).where('min_amount', '<=', String(amount))
    .orderBy('min_amount', 'desc').executeTakeFirst();
}

/** True if this user may act (approve/reject) on a resolved workflow —
 * the named approver or their named backup, never a role. */
export function canActOnWorkflow(workflow: { approver_user_id: string; approver_backup_user_id: string | null }, userId: string): boolean {
  return workflow.approver_user_id === userId || workflow.approver_backup_user_id === userId;
}
