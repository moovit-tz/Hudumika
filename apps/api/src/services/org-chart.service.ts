import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export interface DirectManager {
  user_id: string;
  name: string;
  email: string | null;
}

/**
 * Walk the org_chart_nodes parent chain to find the nearest ancestor with a
 * real linked user_id. Skips placeholder/department nodes that have no user.
 * Returns null when the person is not on the chart, has no parent, or no
 * ancestor (up to 10 levels) has a real account linked.
 */
export async function resolveDirectManager(
  trx: Transaction<Database>,
  tenantId: string,
  userId: string,
): Promise<DirectManager | null> {
  const node = await trx.selectFrom('org_chart_nodes')
    .select('parent_id')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!node?.parent_id) return null;

  let parentId: string | null = node.parent_id;
  for (let depth = 0; depth < 10 && parentId; depth++) {
    const parent = await trx
      .selectFrom('org_chart_nodes as n')
      .leftJoin('users as u', 'u.id', 'n.user_id')
      .select(['n.user_id', 'n.label', 'n.parent_id as next_parent_id', 'u.name as user_name', 'u.email as user_email'])
      .where('n.id', '=', parentId)
      .where('n.tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!parent) return null;
    if (parent.user_id) {
      return {
        user_id: parent.user_id,
        name: parent.user_name ?? parent.label,
        email: parent.user_email ?? null,
      };
    }
    parentId = parent.next_parent_id;
  }
  return null;
}

/**
 * Return the user_ids of all direct reports of a given user (one level only).
 * A report is an org_chart_nodes row whose parent is the manager's node and
 * that has a real user_id linked.
 */
export async function resolveDirectReports(
  trx: Transaction<Database>,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const managerNode = await trx.selectFrom('org_chart_nodes')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!managerNode) return [];

  const reports = await trx.selectFrom('org_chart_nodes')
    .select('user_id')
    .where('tenant_id', '=', tenantId)
    .where('parent_id', '=', managerNode.id)
    .where('user_id', 'is not', null)
    .execute();

  return reports.map(r => r.user_id as string);
}
