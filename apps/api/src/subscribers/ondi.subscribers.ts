import { registerSubscriber } from '../services/domain-events.service.js';
import { isSupersededByStudio } from '../studio/supersession.js';
import { withTenant } from '../db/client.js';
import { recordAuthEvent } from '../lib/audit-chain.js';

/**
 * Ondi's joiner/leaver automation (M7, house-style expansion) — two
 * specific, hardcoded reactions to domain events already emitted
 * elsewhere, not a generic workflow engine (Studio already is that; see
 * isSupersededByStudio below for how a tenant opts a specific rule out in
 * favor of their own Studio workflow). Every action either rule takes is
 * also written to ondi_automation_log so an admin can see what automation
 * actually did, not just that it ran.
 */

async function getDefaultRoleId(tenantId: string): Promise<string | null> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) return null;
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    return settings?.automation?.defaultRoleId ?? null;
  });
}

// Joiner: a new employee accepting their invitation (auth.routes.ts
// POST /accept-invite) automatically gets whatever role a tenant has
// configured as the default for new joiners — nothing happens if none is
// configured, which is the honest default (no invented role assignment).
registerSubscriber('user.joined', async (tenantId, event) => {
  if (await isSupersededByStudio(tenantId, 'ondi.joiner_default_role')) return;

  const userId = event.payload.userId as string;
  const roleId = await getDefaultRoleId(tenantId);
  if (!roleId) return;

  await withTenant(tenantId, async (trx) => {
    const role = await trx.selectFrom('ondi_org_roles').select(['id', 'name']).where('id', '=', roleId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!role) return; // configured role was since deleted — nothing to grant

    await trx.insertInto('ondi_org_role_members').values({
      tenant_id: tenantId, role_id: role.id, user_id: userId,
    }).onConflict(oc => oc.columns(['role_id', 'user_id']).doNothing()).execute();

    await trx.insertInto('ondi_automation_log').values({
      tenant_id: tenantId, rule: 'joiner_default_role', user_id: userId,
      summary: `Granted "${role.name}" as the default role for new joiners.`,
    }).execute();
  });

  await recordAuthEvent(tenantId, userId, 'org_role_granted', { metadata: { via: 'automation', rule: 'joiner_default_role' } });
});

// Leaver: deactivating a user (from either hr.routes.ts's own status route
// or ondi.routes.ts's, which now both emit this event) revokes standing
// access rather than leaving it live against a deactivated account —
// mirrors what a manual access-review revoke already does (ondi.routes.ts
// POST /org/access-reviews/:id/items/:itemId/decide), just triggered by
// deactivation instead of a reviewer's decision.
registerSubscriber('hr.staff_deactivated', async (tenantId, event) => {
  if (await isSupersededByStudio(tenantId, 'ondi.leaver_revoke_access')) return;

  const userId = event.payload.userId as string;

  const summary = await withTenant(tenantId, async (trx) => {
    const [roles, consents, devices] = await Promise.all([
      trx.deleteFrom('ondi_org_role_members').where('tenant_id', '=', tenantId).where('user_id', '=', userId)
        .returning('id').execute(),
      trx.deleteFrom('ondi_oauth_consents').where('tenant_id', '=', tenantId).where('user_id', '=', userId)
        .returning('id').execute(),
      trx.updateTable('hr_devices').set({ revoked_at: new Date() })
        .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('revoked_at', 'is', null)
        .returning('id').execute(),
    ]);

    if (roles.length === 0 && consents.length === 0 && devices.length === 0) return null;

    const parts: string[] = [];
    if (roles.length) parts.push(`${roles.length} role grant${roles.length === 1 ? '' : 's'}`);
    if (consents.length) parts.push(`${consents.length} authorized app${consents.length === 1 ? '' : 's'}`);
    if (devices.length) parts.push(`${devices.length} active session${devices.length === 1 ? '' : 's'}`);
    const text = `Revoked ${parts.join(', ')} on deactivation.`;

    await trx.insertInto('ondi_automation_log').values({
      tenant_id: tenantId, rule: 'leaver_revoke_access', user_id: userId, summary: text,
    }).execute();
    return text;
  });

  if (summary) await recordAuthEvent(tenantId, userId, 'session_revoked', { metadata: { via: 'automation', rule: 'leaver_revoke_access', summary } });
});
