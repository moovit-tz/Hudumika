import { randomUUID } from 'node:crypto';
import { type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { ProjectIndustry } from '@hudumika/types';
const response = (row: any) => ({ ...row, data_type: row.entity_type, record_data: row.data });
export class ProjectIndustryService {
  static async listRecords(trx: Transaction<Database>, tenantId: string, projectId: string, dataType?: string) {
    let query = trx.selectFrom('project_industry_data').where('tenant_id', '=', tenantId).where('project_id', '=', projectId);
    if (dataType) query = query.where('entity_type', '=', dataType);
    return (await query.selectAll().orderBy('created_at', 'desc').execute()).map(response);
  }
  static async createRecord(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, industry: ProjectIndustry, dataType: string, recordData: Record<string, any>) {
    const project = await trx.selectFrom('projects').select('industry').where('tenant_id', '=', tenantId).where('id', '=', projectId).executeTakeFirstOrThrow();
    if (project.industry !== industry) throw Object.assign(new Error('Record industry must match its project'), { statusCode: 400 });
    return response(await trx.insertInto('project_industry_data').values({ tenant_id: tenantId, project_id: projectId,
      industry, entity_type: dataType, entity_code: `REC-${randomUUID()}`,
      title: String(recordData.title || recordData.subject || recordData.description || dataType).slice(0, 255),
      data: recordData, created_by: userId,
    }).returningAll().executeTakeFirstOrThrow());
  }
  static async updateRecord(trx: Transaction<Database>, tenantId: string, recordId: string, recordData: Record<string, any>) {
    const row = await trx.updateTable('project_industry_data').set({ data: recordData,
      title: String(recordData.title || recordData.subject || recordData.description || 'Industry record').slice(0, 255), updated_at: new Date() })
      .where('id', '=', recordId).where('tenant_id', '=', tenantId).returningAll().executeTakeFirst();
    if (!row) throw Object.assign(new Error('Industry record not found'), { statusCode: 404 });
    return response(row);
  }
}
