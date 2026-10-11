import { db, dbPlatform, withTenant } from '../db/client.js';
import { ProjectIndustryService } from '../services/project-industry.service.js';
import type { ProjectIndustry } from '@hudumika/types';

const recordTypes: Record<ProjectIndustry, string> = {
  construction: 'RFI', engineering: 'ENGINEERING_REVIEW', real_estate: 'HANDOVER',
  manufacturing: 'WORK_ORDER', mining: 'ENVIRONMENTAL_REVIEW', energy: 'SAFETY_GATE',
  agriculture: 'FIELD_LOG', transport: 'ROUTE_REVIEW', public_sector: 'PUBLIC_REPORT',
  ngo: 'DONOR_REPORT', telecom: 'COMMISSIONING', it_software: 'RELEASE_GATE',
  aerospace: 'VALIDATION', pharma: 'SOP_VALIDATION', professional_services: 'CLIENT_REVIEW',
  general: 'REVIEW',
};

export async function seedProjectIndustryRecords(tenantId: string, ownerId: string) {
  return withTenant(tenantId, async trx => {
    await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', '=', ownerId).executeTakeFirstOrThrow();
    const projects = await trx.selectFrom('projects').select(['id', 'name', 'industry'])
      .where('tenant_id', '=', tenantId).where('name', 'like', '[Sample] %').execute();
    const results: { project: string; created: boolean }[] = [];
    for (const project of projects) {
      await trx.updateTable('tasks').set({ assignee_id: ownerId, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('project_id', '=', project.id)
        .where('title', 'like', 'Prepare:%').where('assignee_id', 'is', null).execute();
      const existing = await trx.selectFrom('project_industry_data').select('id')
        .where('tenant_id', '=', tenantId).where('project_id', '=', project.id).executeTakeFirst();
      if (!existing) {
        const industry = (project.industry ?? 'general') as ProjectIndustry;
        await ProjectIndustryService.createRecord(trx, tenantId, project.id, ownerId, industry, recordTypes[industry], {
          title: `[Example] ${project.name.replace('[Sample] ', '')} readiness review`,
          description: 'Fictional planning record. Confirm evidence, responsible people and acceptance criteria before operational use.',
          reference: 'DEMO-READINESS-001', owner: 'Project lead — role awaiting assignment', status: 'draft',
          required_evidence: 'Approved scope, design or procedure; verification results; documented handover criteria.',
        });
      }
      results.push({ project: project.name, created: !existing });
    }
    return results;
  });
}

if (process.argv[1]?.endsWith('seed-project-industry-records.mts')) {
  const [tenantId, ownerId] = process.argv.slice(2);
  if (!tenantId || !ownerId) throw new Error('Usage: tsx src/scripts/seed-project-industry-records.mts <tenant-id> <owner-user-id>');
  try { console.log(JSON.stringify(await seedProjectIndustryRecords(tenantId, ownerId))); }
  finally { await dbPlatform.destroy(); await db.destroy(); }
}
