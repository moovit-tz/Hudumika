import { withTenant } from '../db/client.js';

/**
 * Whether a tenant has an ACTIVE Studio workflow that replaces a given code
 * subscriber (see migration 165).
 *
 * Guards the handover from hardcoded subscribers to tenant-editable workflows.
 * Without it, activating a migrated workflow means both run and every effect
 * lands twice — two tickets, two notifications, two ledger lines.
 *
 * Fails CLOSED on error: if this query throws we cannot tell whether Studio is
 * handling the event, and the wrong guess in the other direction is a silent
 * double-charge. A missed notification is recoverable; a duplicated bonded-cargo
 * release is not.
 */
export async function isSupersededByStudio(tenantId: string, subscriberKey: string): Promise<boolean> {
  try {
    const row = await withTenant(tenantId, trx => trx
      .selectFrom('workflow_studio_apps')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'ACTIVE')
      .where('supersedes_subscriber', '=', subscriberKey)
      .executeTakeFirst());
    return !!row;
  } catch (err: any) {
    console.error(`[Studio] supersession check for "${subscriberKey}" failed, standing the subscriber down:`, err?.message ?? err);
    return true;
  }
}
