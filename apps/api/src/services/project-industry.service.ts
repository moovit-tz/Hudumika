import { randomUUID } from 'node:crypto';
import { type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { ProjectIndustry } from '@hudumika/types';

interface IndustryConfig {
  label: string;
  dataTypes: string[];
  requiredDataTypes: string[];
  requiredFields: string[];
  riskCategories: string[];
}

const INDUSTRY_CONFIGS: Record<string, IndustryConfig> = {
  construction: { label: 'Construction', dataTypes: ['boq', 'rfi', 'site_diary', 'variation_order', 'ipc', 'snag_list', 'safety_report'], requiredDataTypes: ['boq', 'safety_report'], requiredFields: ['location_address'], riskCategories: ['safety', 'environmental', 'schedule', 'cost'] },
  engineering: { label: 'Engineering', dataTypes: ['rfi', 'technical_spec', 'design_review', 'test_report', 'site_diary'], requiredDataTypes: ['technical_spec'], requiredFields: [], riskCategories: ['technical', 'safety', 'schedule'] },
  mining: { label: 'Mining', dataTypes: ['safety_report', 'environmental_assessment', 'blast_plan', 'ore_grade_report', 'site_diary'], requiredDataTypes: ['safety_report', 'environmental_assessment'], requiredFields: ['location_address'], riskCategories: ['safety', 'environmental', 'operational'] },
  manufacturing: { label: 'Manufacturing', dataTypes: ['bom', 'quality_report', 'production_log', 'defect_report'], requiredDataTypes: ['bom'], requiredFields: [], riskCategories: ['cost', 'schedule', 'technical'] },
  it_software: { label: 'IT / Software', dataTypes: ['sprint', 'user_story', 'release_note', 'incident_report', 'retrospective'], requiredDataTypes: [], requiredFields: [], riskCategories: ['technical', 'schedule', 'resource'] },
  ngo: { label: 'NGO / Development', dataTypes: ['logframe', 'outcome_report', 'beneficiary_data', 'donor_report', 'field_visit'], requiredDataTypes: ['logframe'], requiredFields: [], riskCategories: ['operational', 'external', 'cost'] },
  energy: { label: 'Energy', dataTypes: ['safety_report', 'environmental_assessment', 'generation_log', 'maintenance_schedule'], requiredDataTypes: ['safety_report', 'environmental_assessment'], requiredFields: ['location_address'], riskCategories: ['safety', 'environmental', 'technical'] },
  agriculture: { label: 'Agriculture', dataTypes: ['crop_plan', 'yield_report', 'soil_analysis', 'weather_log'], requiredDataTypes: ['crop_plan'], requiredFields: ['location_address'], riskCategories: ['environmental', 'external', 'cost'] },
  real_estate: { label: 'Real Estate', dataTypes: ['boq', 'valuation_report', 'title_deed', 'snag_list'], requiredDataTypes: [], requiredFields: ['location_address'], riskCategories: ['commercial', 'legal', 'schedule'] },
  general: { label: 'General', dataTypes: ['note', 'report', 'meeting_minutes'], requiredDataTypes: [], requiredFields: [], riskCategories: [] },
};

const response = (row: any) => ({ ...row, data_type: row.entity_type, record_data: row.data });
export class ProjectIndustryService {
  static getIndustryConfig(industry: string): IndustryConfig {
    return INDUSTRY_CONFIGS[industry] || INDUSTRY_CONFIGS.general;
  }

  static listIndustryConfigs() {
    return Object.entries(INDUSTRY_CONFIGS).map(([key, cfg]) => ({ industry: key, ...cfg }));
  }

  static async listRecords(trx: Transaction<Database>, tenantId: string, projectId: string, dataType?: string) {
    let query = trx.selectFrom('project_industry_data').where('tenant_id', '=', tenantId).where('project_id', '=', projectId);
    if (dataType) query = query.where('entity_type', '=', dataType);
    return (await query.selectAll().orderBy('created_at', 'desc').execute()).map(response);
  }
  static async createRecord(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, industry: ProjectIndustry, dataType: string, recordData: Record<string, any>) {
    const project = await trx.selectFrom('projects').select('industry').where('tenant_id', '=', tenantId).where('id', '=', projectId).executeTakeFirstOrThrow();
    if (project.industry !== industry) throw Object.assign(new Error('Record industry must match its project'), { statusCode: 400 });
    const cfg = this.getIndustryConfig(industry);
    if (cfg.dataTypes.length > 0 && !cfg.dataTypes.includes(dataType)) throw Object.assign(new Error(`Data type '${dataType}' is not valid for ${cfg.label} projects. Valid types: ${cfg.dataTypes.join(', ')}`), { statusCode: 400 });
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
