import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { withTenant, dbPlatform, db } from '../db/client.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';
import { ProjectOsService } from '../services/project-os.service.js';
import { ProjectGovernanceService } from '../services/project-governance.service.js';
import type { ProjectIndustry } from '@hudumika/types';

const catalog: { industry: ProjectIndustry; name: string; location: string; budget: number; outputs: string[]; risk: string; tags: string[] }[] = [
  { industry: 'construction', name: 'Community Health Centre Construction', location: 'Dodoma', budget: 850000000, outputs: ['Site survey and approved building design', 'Foundation, structure and utilities', 'Commissioned facility and handover pack'], risk: 'Heavy rainfall delays earthworks and material delivery', tags: ['civil-works', 'health-infrastructure', 'HSE'] },
  { industry: 'engineering', name: 'Water Pumping Station Engineering', location: 'Morogoro', budget: 240000000, outputs: ['Hydraulic calculations and equipment design', 'Installed pump and control systems', 'Performance test and operator training'], risk: 'Equipment sizing fails peak-demand requirements', tags: ['mechanical', 'electrical', 'water'] },
  { industry: 'real_estate', name: 'Mixed-Use Property Development Planning', location: 'Dar es Salaam', budget: 320000000, outputs: ['Feasibility and land due-diligence report', 'Master plan and tenant requirements', 'Investment case and development handover'], risk: 'Land-title or zoning findings require redesign', tags: ['property', 'feasibility', 'development'] },
  { industry: 'manufacturing', name: 'Packaging Line Modernisation', location: 'Arusha', budget: 460000000, outputs: ['Baseline capacity and line specification', 'Installed packaging line and safety controls', 'Validated throughput and maintenance plan'], risk: 'Installation downtime disrupts production commitments', tags: ['production', 'automation', 'quality'] },
  { industry: 'mining', name: 'Mine Water Management Improvement', location: 'Geita', budget: 610000000, outputs: ['Water balance and environmental baseline', 'Drainage and treatment infrastructure', 'Monitoring plan and operational handover'], risk: 'Seasonal water volumes exceed treatment design capacity', tags: ['environment', 'mine-operations', 'water'] },
  { industry: 'energy', name: 'Solar Microgrid Deployment', location: 'Singida', budget: 720000000, outputs: ['Load study and microgrid design', 'Solar array, storage and distribution installation', 'Commissioning report and maintenance training'], risk: 'Battery lead times delay commissioning', tags: ['renewables', 'solar', 'storage'] },
  { industry: 'agriculture', name: 'Irrigation and Farmer Training Programme', location: 'Mbeya', budget: 180000000, outputs: ['Farm survey and irrigation design', 'Installed irrigation network and demonstration plots', 'Farmer training and first-season monitoring plan'], risk: 'Water availability falls below irrigation assumptions', tags: ['irrigation', 'food-security', 'training'] },
  { industry: 'transport', name: 'Regional Distribution Route Optimisation', location: 'Dar es Salaam', budget: 95000000, outputs: ['Demand, fleet and route baseline', 'Pilot route schedules and dispatch procedures', 'Validated delivery KPIs and rollout playbook'], risk: 'Road closures invalidate planned route timing', tags: ['logistics', 'fleet', 'distribution'] },
  { industry: 'public_sector', name: 'Citizen Service Centre Digitisation', location: 'Dodoma', budget: 270000000, outputs: ['Service catalogue and accessibility requirements', 'Configured service desks and digital intake', 'Staff training and public-service acceptance report'], risk: 'Stakeholder approvals delay service standardisation', tags: ['citizen-services', 'accessibility', 'digital'] },
  { industry: 'ngo', name: 'Community Nutrition Outreach Programme', location: 'Mtwara', budget: 130000000, outputs: ['Community needs assessment and safeguarding plan', 'Outreach sessions and beneficiary monitoring', 'Outcome evaluation and donor reporting pack'], risk: 'Low participation reduces programme coverage', tags: ['community', 'nutrition', 'safeguarding'] },
  { industry: 'telecom', name: 'Rural Connectivity Network Expansion', location: 'Tabora', budget: 550000000, outputs: ['Coverage survey and radio design', 'Installed access sites and backhaul links', 'Coverage acceptance tests and operations handover'], risk: 'Site access or backhaul availability delays rollout', tags: ['connectivity', 'network', 'rural'] },
  { industry: 'it_software', name: 'Customer Portal Delivery', location: 'Dar es Salaam', budget: 160000000, outputs: ['User research and approved architecture', 'Portal implementation and security verification', 'User acceptance and monitored production rollout'], risk: 'Changing requirements cause scope and release delays', tags: ['software', 'security', 'customer-experience'] },
  { industry: 'aerospace', name: 'Aviation Maintenance Planning Improvement', location: 'Kilimanjaro', budget: 210000000, outputs: ['Maintenance-process baseline and requirements', 'Configured planning and parts-control procedures', 'Training, traceability review and acceptance pack'], risk: 'Incomplete maintenance records undermine planning accuracy', tags: ['aviation', 'maintenance', 'traceability'] },
  { industry: 'pharma', name: 'Pharmaceutical Cold Chain Qualification', location: 'Dar es Salaam', budget: 350000000, outputs: ['Temperature-control requirements and qualification plan', 'Installed monitoring and cold-storage controls', 'Qualification evidence and deviation-management training'], risk: 'Temperature excursions invalidate qualification runs', tags: ['cold-chain', 'quality', 'validation'] },
  { industry: 'professional_services', name: 'Finance Process Advisory Engagement', location: 'Dar es Salaam', budget: 75000000, outputs: ['Process assessment and control-gap report', 'Redesigned workflows and reporting templates', 'Client training and engagement close-out report'], risk: 'Delayed access to records limits assessment completeness', tags: ['advisory', 'finance', 'process-improvement'] },
  { industry: 'general', name: 'Workspace Operations Improvement', location: 'Dar es Salaam', budget: 45000000, outputs: ['Operational baseline and improvement priorities', 'Implemented procedures and staff training', 'Measured outcomes and ownership handover'], risk: 'Limited staff availability slows adoption', tags: ['operations', 'continuous-improvement', 'training'] },
];

export async function seedIndustryProjects(tenantId: string, ownerId: string) {
  return withTenant(tenantId, async trx => {
    const owner = await trx.selectFrom('users').select(['id', 'name', 'role']).where('tenant_id', '=', tenantId).where('id', '=', ownerId).executeTakeFirstOrThrow();
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(owner.role)) throw new Error('Select a workspace administrator as sample-project owner');
    const results: { id: string; industry: string; created: boolean }[] = [];
    for (const item of catalog) {
      const name = `[Sample] ${item.name}`;
      const existing = await trx.selectFrom('projects').select('id').where('tenant_id', '=', tenantId).where('name', '=', name).executeTakeFirst();
      if (existing) { results.push({ id: existing.id, industry: item.industry, created: false }); continue; }
      const id = randomUUID();
      const tags = ['sample-project', item.industry, ...item.tags];
      const description = `SAMPLE PLANNING DATA — replace assumptions before operational use.\n\nObjective: deliver ${item.name.toLowerCase()} with documented acceptance and accountable handover.\nLocation: ${item.location}, Tanzania.\nScope: ${item.outputs.join('; ')}.\nOut of scope: unrelated expansion, financing commitments and ongoing operations after handover.\nSuccess criteria: all three deliverables accepted; planned budget respected; unresolved critical findings escalated before handover.\nStakeholders: ${owner.name} (project owner); technical lead, delivery team, finance reviewer and beneficiary representatives (roles awaiting assignment).\nPlanning assumptions: work starts 2 November 2026; resources and procurement require confirmation.\nDependencies: scope baseline, site/data access, required permissions and resource availability.\nReporting: weekly progress review, monthly budget review, named approval for scope changes.\nTags: ${tags.join(', ')}.`;
      await trx.insertInto('projects').values({ id, tenant_id: tenantId, owner_id: ownerId, name, description,
        ref: await getNextDocNumber(trx, tenantId, 'project'), industry: item.industry, project_type: 'customer_delivery',
        status: 'not_started', start_date: '2026-11-02', target_date: '2027-06-30', currency: 'TZS',
        billing_type: 'fixed', baseline_budget: item.budget, current_budget: item.budget, contract_value: 0,
        location_address: `${item.location}, Tanzania`, progress_pct: 0, actual_cost: 0,
      }).execute();
      await sql`update projects set custom_fields = ${JSON.stringify({ tags, sample: true, assumptions: 'Planning values only; no signed contract or expenditure', stakeholder_roles: ['Technical lead', 'Finance reviewer', 'Beneficiary representative'] })}::jsonb where tenant_id = ${tenantId} and id = ${id}`.execute(trx);
      await trx.insertInto('project_members').values({ id: randomUUID(), tenant_id: tenantId, project_id: id, user_id: ownerId, role: 'owner' }).execute();
      const listId = randomUUID();
      await trx.insertInto('task_lists').values({ id: listId, tenant_id: tenantId, user_id: ownerId, name: `${item.name} delivery` } as any).execute();
      for (let index = 0; index < 3; index++) {
        const dates = [{ start: '2026-11-02', end: '2026-12-18' }, { start: '2027-01-04', end: '2027-04-30' }, { start: '2027-05-03', end: '2027-06-30' }][index];
        const phase = await ProjectOsService.createPhase(trx, tenantId, id, { name: ['Initiation and design', 'Delivery and verification', 'Acceptance and handover'][index], sequence_order: index + 1, start_date: dates.start, end_date: dates.end, notes: item.outputs[index], gate_criteria: { scope: 'Deliverable reviewed and accepted', quality: 'No unresolved critical findings' } });
        const pack = await ProjectOsService.createWorkPackage(trx, tenantId, id, { phase_id: phase.id, wbs_code: `WP-${index + 1}`, name: item.outputs[index], description: `Plan, execute and verify: ${item.outputs[index]}`, lead_id: ownerId, planned_start: dates.start, planned_end: dates.end, planned_cost: item.budget * [0.2, 0.65, 0.15][index] });
        await ProjectOsService.createDeliverable(trx, tenantId, id, { title: item.outputs[index], phase_id: phase.id, work_package_id: pack.id, owner_id: ownerId, due_date: dates.end, description: `Evidence package for ${item.outputs[index]}`, acceptance_criteria: 'Owner review completed; evidence stored; critical defects resolved; handover recorded' });
        const milestoneId = randomUUID();
        await trx.insertInto('milestones').values({ id: milestoneId, tenant_id: tenantId, project_id: id, name: item.outputs[index], due_date: dates.end, sort_order: index } as any).execute();
        for (const action of ['Prepare', 'Verify']) await trx.insertInto('tasks').values({ id: randomUUID(), tenant_id: tenantId, user_id: ownerId, list_id: listId,
          project_id: id, milestone_id: milestoneId, title: `${action}: ${item.outputs[index]}`, notes: `Expected evidence: ${item.outputs[index]}. Tags: ${tags.join(', ')}.`,
          tags: JSON.stringify([...tags, action.toLowerCase()]) as unknown as string[], start_date: dates.start, due: dates.end, priority: index === 1 ? 'high' : 'medium',
        }).execute();
      }
      await ProjectGovernanceService.createRisk(trx, tenantId, id, { title: item.risk, category: 'operational', probability: 'possible', impact: 'high', owner_id: ownerId, mitigation_plan: 'Validate assumptions during design; track early indicators weekly; escalate deviation to owner', strategy: 'mitigate', review_date: '2026-11-13' });
      await ProjectGovernanceService.createChangeRequest(trx, tenantId, id, ownerId, { cr_number: 'CR-PLANNING-001', title: 'Confirm baseline after stakeholder review', original_scope: item.outputs.join('; '), requested_change: 'Revise scope only where stakeholder review identifies a confirmed need', reason: 'Sample draft for baseline review; requires actual review before submission', cost_impact: 0, schedule_impact_days: 0 });
      await trx.insertInto('project_activity_log').values({ id: randomUUID(), tenant_id: tenantId, project_id: id, actor_id: ownerId, action: 'created', detail: { source: 'industry-sample-projects', tags } }).execute();
      results.push({ id, industry: item.industry, created: true });
    }
    return results;
  });
}

if (process.argv[1]?.endsWith('seed-industry-projects.mts')) {
  const [tenantId, ownerId] = process.argv.slice(2);
  if (!tenantId || !ownerId) throw new Error('Usage: tsx src/scripts/seed-industry-projects.mts <tenant-id> <owner-user-id>');
  try { console.log(JSON.stringify(await seedIndustryProjects(tenantId, ownerId))); }
  finally { await dbPlatform.destroy(); await db.destroy(); }
}
