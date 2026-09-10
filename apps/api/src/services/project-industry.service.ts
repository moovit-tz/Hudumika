import { type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { ProjectIndustry, ProjectIndustryData } from '@hudumika/types';

export class ProjectIndustryService {
  /**
   * List modular industry records (BOQ lines, RFIs, Site Diaries, BOMs, Logframes, Sprints)
   */
  static async listRecords(trx: Transaction<Database>, tenantId: string, projectId: string, dataType?: string) {
    let query = trx
      .selectFrom('project_industry_data')
      .leftJoin('users', 'users.id', 'project_industry_data.created_by')
      .where('project_industry_data.tenant_id', '=', tenantId)
      .where('project_industry_data.project_id', '=', projectId);

    if (dataType) {
      query = query.where('project_industry_data.data_type', '=', dataType);
    }

    return await query
      .select([
        'project_industry_data.id',
        'project_industry_data.tenant_id',
        'project_industry_data.project_id',
        'project_industry_data.industry',
        'project_industry_data.data_type',
        'project_industry_data.record_data',
        'project_industry_data.created_by',
        'project_industry_data.created_at',
        'project_industry_data.updated_at',
        'users.name as creator_name',
      ])
      .orderBy('project_industry_data.created_at', 'desc')
      .execute();
  }

  /**
   * Create an industry record (Construction BOQ line, RFI, Daily Site Diary, Manufacturing BOM, NGO Logframe)
   */
  static async createRecord(
    trx: Transaction<Database>,
    tenantId: string,
    projectId: string,
    userId: string,
    industry: ProjectIndustry,
    dataType: string,
    recordData: Record<string, any>
  ) {
    return await trx
      .insertInto('project_industry_data')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        industry,
        data_type: dataType,
        record_data: recordData,
        created_by: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Update an industry record
   */
  static async updateRecord(
    trx: Transaction<Database>,
    tenantId: string,
    recordId: string,
    recordData: Record<string, any>
  ) {
    return await trx
      .updateTable('project_industry_data')
      .set({
        record_data: recordData,
        updated_at: new Date(),
      })
      .where('id', '=', recordId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
