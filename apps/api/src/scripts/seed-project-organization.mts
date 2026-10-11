import { db, dbPlatform, withTenant } from '../db/client.js';
import { ProjectOsService } from '../services/project-os.service.js';

export async function seedProjectOrganization(tenantId: string, ownerId: string) {
  return withTenant(tenantId, async trx => {
    await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', '=', ownerId).executeTakeFirstOrThrow();
    const projects = await trx.selectFrom('projects').selectAll().where('tenant_id', '=', tenantId).where('name', 'like', '[Sample] %').execute();
    const result: { project: string; portfolio: string; program: string }[] = [];
    for (const currency of new Set(projects.map(project => project.currency))) {
      const currencyProjects = projects.filter(project => project.currency === currency);
      const portfolioCode = `DEMO-${currency}-INDUSTRIES`;
      let portfolio = await trx.selectFrom('project_portfolios').select('id').where('tenant_id', '=', tenantId).where('code', '=', portfolioCode).executeTakeFirst();
      if (!portfolio) portfolio = await ProjectOsService.createPortfolio(trx, tenantId, {
        code: portfolioCode, name: `[Example] Industry delivery portfolio (${currency})`, currency, owner_id: ownerId, status: 'planning',
        allocated_budget: currencyProjects.reduce((sum, project) => sum + Number(project.baseline_budget), 0),
        description: 'Fictional industry project portfolio. Planning values are grouped by their recorded currency; no exchange conversion or approved spending is implied.',
        strategic_alignment: { objective: 'Demonstrate scoped planning, evidence review and accountable project handover', example: true },
      });
      for (const project of currencyProjects) {
        const programCode = `DEMO-${currency}-${project.industry}`.toUpperCase();
        let program = await trx.selectFrom('project_programs').select('id').where('tenant_id', '=', tenantId).where('code', '=', programCode).executeTakeFirst();
        if (!program) program = await ProjectOsService.createProgram(trx, tenantId, {
          code: programCode, name: `[Example] ${project.industry.replaceAll('_', ' ')} delivery program`, portfolio_id: portfolio.id,
          program_manager_id: ownerId, budget: Number(project.baseline_budget), currency, status: 'planning',
          start_date: project.start_date, end_date: project.target_date,
          description: `Fictional program coordinating ${project.name.replace('[Sample] ', '')}. Confirm scope, resource availability and required approvals before operational use.`,
          target_benefits: ['Accepted project deliverables', 'Traceable scope and budget review', 'Documented handover evidence'],
        });
        if (!project.portfolio_id && !project.program_id) await trx.updateTable('projects').set({ portfolio_id: portfolio.id, program_id: program.id, updated_at: new Date(), custom_fields: { ...project.custom_fields, tags: Array.from(new Set([...(Array.isArray(project.custom_fields?.tags) ? project.custom_fields.tags : []), 'full-project'])) } })
          .where('tenant_id', '=', tenantId).where('id', '=', project.id).execute();
        result.push({ project: project.name, portfolio: portfolio.id, program: program.id });
      }
    }
    return result;
  });
}

if (process.argv[1]?.endsWith('seed-project-organization.mts')) {
  const [tenantId, ownerId] = process.argv.slice(2);
  if (!tenantId || !ownerId) throw new Error('Usage: tsx src/scripts/seed-project-organization.mts <tenant-id> <owner-user-id>');
  try { console.log(JSON.stringify(await seedProjectOrganization(tenantId, ownerId))); }
  finally { await dbPlatform.destroy(); await db.destroy(); }
}
