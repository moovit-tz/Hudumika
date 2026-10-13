import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export async function validateOnsiteLinks(trx: Transaction<Database>, tenantId: string, links: { project_id?: string; domain_id?: string }): Promise<string | null> {
  if (links.project_id) {
    const project = await trx.selectFrom('onsite_projects').select('id').where('id', '=', links.project_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!project) return 'Project not found in this workspace';
  }
  if (links.domain_id) {
    const domain = await trx.selectFrom('onsite_domains').select('id').where('id', '=', links.domain_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!domain) return 'Domain not found in this workspace';
  }
  return null;
}
