import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

type CrmOwnedTable = 'customers' | 'leads' | 'deals' | 'users' | 'crm_territories' | 'quotations';

/** Refuse links to records the current workspace cannot own and resolve. */
export async function assertCrmReferencesInTenant(
  trx: Transaction<Database>,
  tenantId: string,
  references: Array<{ table: CrmOwnedTable; id: string | null | undefined }>,
) {
  for (const { table, id } of references) {
    if (!id) continue;
    const row = await trx.selectFrom(table as any).select('id')
      .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!row) {
      throw Object.assign(new Error('Linked record not found in this workspace.'), { statusCode: 400 });
    }
  }
}
