import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { ProjectOsService } from '../services/project-os.service.js';
import { ProjectGovernanceService } from '../services/project-governance.service.js';
import { ProjectProcurementService } from '../services/project-procurement.service.js';
import { ProjectResourcesService } from '../services/project-resources.service.js';
import { ProjectIndustryService } from '../services/project-industry.service.js';
import { resolveProjectAccess, canEditProject } from './task-projects.routes.js';

const uuidSchema = z.string().uuid();

export async function projectOsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('projects'));
  // Production-readiness audit HUD-0024/0031: Project OS had no role check
  // beyond entitlement. A CUSTOMER-role JWT hitting GET /portfolios wasn't
  // just an access-scope question — it produced an unhandled 500, meaning
  // this code path was never written to expect that role at all. This gate
  // is a minimal, additive change (one preHandler hook, no business-logic
  // edits) so it shouldn't conflict with the module's own active
  // development — flag/revert if it does.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions.url?.includes('/projects/:id/')) return;
    const projectId = uuidSchema.parse((request.params as { id: string }).id);
    const user = request.user;
    const access = await withTenant(user.tenant_id, (trx) =>
      resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, projectId));
    if (!access || (request.method !== 'GET' && !canEditProject(access.access))) {
      return reply.code(403).send({ error: 'You do not have access to this project operation.' });
    }
  });

  // ─── Command Center ───────────────────────────────────────────────

  fastify.get('/command-center', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.getCommandCenterMetrics(trx, user.tenant_id);
    });
  });

  // ─── Bookmarks (per-user favorites) ────────────────────────────────

  fastify.get('/bookmarks', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('project_bookmarks')
        .select('project_id')
        .where('user_id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(r => r.project_id);
    });
  });

  fastify.post('/bookmarks/:projectId', async (request, reply) => {
    const user = request.user;
    const projectId = uuidSchema.parse((request.params as { projectId: string }).projectId);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('project_bookmarks')
        .select('id')
        .where('project_id', '=', projectId)
        .where('user_id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (existing) {
        await trx.deleteFrom('project_bookmarks').where('id', '=', existing.id).execute();
        return { bookmarked: false };
      }
      await trx.insertInto('project_bookmarks').values({
        id: randomUUID(),
        tenant_id: user.tenant_id,
        project_id: projectId,
        user_id: user.sub,
      }).execute();
      return reply.code(201).send({ bookmarked: true });
    });
  });

  // ─── Portfolios ───────────────────────────────────────────────────

  fastify.get('/portfolios', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.listPortfolios(trx, user.tenant_id);
    });
  });

  fastify.post('/portfolios', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      code: z.string().trim().min(1).max(30),
      description: z.string().optional().nullable(),
      owner_id: uuidSchema.optional().nullable(),
      target_roi: z.number().optional().nullable(),
      allocated_budget: z.number().min(0).optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      status: z.enum(['active', 'planning', 'on_hold', 'completed', 'archived']).optional(),
      strategic_alignment: z.record(z.any()).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.owner_id && !await trx.selectFrom('users').select('id')
        .where('id', '=', body.owner_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()) {
        return reply.code(404).send({ error: 'Portfolio manager not found' });
      }
      const portfolio = await ProjectOsService.createPortfolio(trx, user.tenant_id, body);
      return reply.code(201).send(portfolio);
    });
  });

  // ─── Programs ─────────────────────────────────────────────────────

  fastify.get('/programs', async (request) => {
    const user = request.user;
    const query = z.object({
      portfolioId: uuidSchema.optional(),
    }).parse(request.query);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.listPrograms(trx, user.tenant_id, query.portfolioId);
    });
  });

  fastify.post('/programs', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      portfolio_id: uuidSchema.optional().nullable(),
      name: z.string().trim().min(1).max(200),
      code: z.string().trim().min(1).max(30),
      description: z.string().optional().nullable(),
      program_manager_id: uuidSchema.optional().nullable(),
      budget: z.number().min(0).optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      target_benefits: z.array(z.string()).optional(),
      status: z.enum(['active', 'planning', 'on_hold', 'completed', 'archived']).optional(),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.portfolio_id && !await trx.selectFrom('project_portfolios').select('id')
        .where('id', '=', body.portfolio_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()) {
        return reply.code(404).send({ error: 'Portfolio not found' });
      }
      if (body.program_manager_id && !await trx.selectFrom('users').select('id')
        .where('id', '=', body.program_manager_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()) {
        return reply.code(404).send({ error: 'Program manager not found' });
      }
      const program = await ProjectOsService.createProgram(trx, user.tenant_id, body);
      return reply.code(201).send(program);
    });
  });

  // ─── Project OS Detail & EVM ──────────────────────────────────────

  fastify.get('/projects/:id/detail', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      const detail = await ProjectOsService.getProjectDetail(trx, user.tenant_id, params.id);
      if (!detail) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      return detail;
    });
  });

  // ─── Phases & Stage Gates ─────────────────────────────────────────

  fastify.get('/projects/:id/phases', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.listPhases(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/phases', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      code: z.string().optional().nullable(),
      sequence_order: z.number().int().optional(),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
      gate_review_date: z.string().optional().nullable(),
      gate_approver_role: z.string().optional().nullable(),
      gate_criteria: z.record(z.any()).optional(),
      notes: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const phase = await ProjectOsService.createPhase(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(phase);
    });
  });

  fastify.patch('/phases/:id/gate', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      passed: z.boolean(),
      status: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.status && body.status !== (body.passed ? 'completed' : 'under_review')) return reply.code(400).send({ error: 'Gate status must match its decision' });
      const phase = await trx.selectFrom('project_phases').select('project_id').where('tenant_id', '=', user.tenant_id).where('id', '=', params.id).executeTakeFirst();
      if (!phase) return reply.code(404).send({ error: 'Phase not found' });
      const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, phase.project_id);
      if (!access || !['owner', 'admin'].includes(access.access)) return reply.code(403).send({ error: 'Only project owners and administrators can review gates' });
      return await ProjectOsService.updatePhaseGate(trx, user.tenant_id, params.id, body.passed);
    });
  });

  // ─── Work Packages / WBS ──────────────────────────────────────────

  fastify.get('/projects/:id/work-packages', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.listWorkPackages(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/work-packages', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      phase_id: uuidSchema.optional().nullable(),
      parent_id: uuidSchema.optional().nullable(),
      wbs_code: z.string().trim().min(1).max(50),
      name: z.string().trim().min(1).max(200),
      description: z.string().optional().nullable(),
      lead_id: uuidSchema.optional().nullable(),
      planned_start: z.string().optional().nullable(),
      planned_end: z.string().optional().nullable(),
      planned_cost: z.number().min(0).optional(),
      progress_pct: z.number().min(0).max(100).optional(),
      status: z.enum(['draft', 'approved', 'in_progress', 'completed', 'cancelled']).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.phase_id && !await trx.selectFrom('project_phases').select('id').where('tenant_id', '=', user.tenant_id).where('project_id', '=', params.id).where('id', '=', body.phase_id).executeTakeFirst())
        return reply.code(404).send({ error: 'Phase not found in this project' });
      if (body.parent_id && !await trx.selectFrom('project_work_packages').select('id').where('tenant_id', '=', user.tenant_id).where('project_id', '=', params.id).where('id', '=', body.parent_id).executeTakeFirst())
        return reply.code(404).send({ error: 'Parent package not found in this project' });
      if (body.lead_id && !await trx.selectFrom('users').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.lead_id).executeTakeFirst())
        return reply.code(404).send({ error: 'Manager not found' });
      const wp = await ProjectOsService.createWorkPackage(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(wp);
    });
  });

  // ─── Deliverables ─────────────────────────────────────────────────

  fastify.get('/projects/:id/deliverables', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.listDeliverables(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/deliverables', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      phase_id: uuidSchema.optional().nullable(),
      work_package_id: uuidSchema.optional().nullable(),
      title: z.string().trim().min(1).max(200),
      code: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
      owner_id: uuidSchema.optional().nullable(),
      due_date: z.string().optional().nullable(),
      acceptance_criteria: z.string().optional().nullable(),
      sign_document_id: uuidSchema.optional().nullable(),
      contract_id: uuidSchema.optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.sign_document_id) return reply.code(501).send({ error: 'Deliverable signing-document links are not configured' });
      if (body.phase_id && !await trx.selectFrom('project_phases').select('id').where('tenant_id', '=', user.tenant_id).where('project_id', '=', params.id).where('id', '=', body.phase_id).executeTakeFirst()) return reply.code(404).send({ error: 'Phase not found in this project' });
      const workPackage = body.work_package_id ? await trx.selectFrom('project_work_packages').select(['id', 'phase_id']).where('tenant_id', '=', user.tenant_id).where('project_id', '=', params.id).where('id', '=', body.work_package_id).executeTakeFirst() : null;
      if (body.work_package_id && !workPackage) return reply.code(404).send({ error: 'Work package not found in this project' });
      if (body.phase_id && workPackage?.phase_id && body.phase_id !== workPackage.phase_id) return reply.code(400).send({ error: 'Phase must match the work package' });
      const ownerId = body.owner_id ?? user.sub;
      if (!await trx.selectFrom('users').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', ownerId).executeTakeFirst()) return reply.code(404).send({ error: 'Owner not found' });
      if (body.contract_id && !await trx.selectFrom('contracts').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.contract_id).executeTakeFirst()) return reply.code(404).send({ error: 'Contract not found' });
      const deliv = await ProjectOsService.createDeliverable(trx, user.tenant_id, params.id, { ...body, owner_id: ownerId, phase_id: body.phase_id ?? workPackage?.phase_id ?? null });
      return reply.code(201).send(deliv);
    });
  });

  fastify.patch('/deliverables/:id/review', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      status: z.enum(['approved', 'rejected']),
      rejection_reason: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const deliverable = await trx.selectFrom('project_deliverables').select('project_id').where('tenant_id', '=', user.tenant_id).where('id', '=', params.id).executeTakeFirst();
      if (!deliverable) return reply.code(404).send({ error: 'Deliverable not found' });
      const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, deliverable.project_id);
      if (!access || !['owner', 'admin'].includes(access.access)) return reply.code(403).send({ error: 'Only project owners and administrators can review deliverables' });
      return await ProjectOsService.reviewDeliverable(trx, user.tenant_id, params.id, user.sub, body.status, body.rejection_reason);
    });
  });

  // ─── Risks ────────────────────────────────────────────────────────

  fastify.get('/projects/:id/risks', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectGovernanceService.listRisks(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/risks', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().optional().nullable(),
      category: z.enum(['technical', 'commercial', 'safety', 'environmental', 'legal', 'operational', 'schedule', 'cost', 'resource', 'external']).optional(),
      probability: z.enum(['unlikely', 'possible', 'moderate', 'likely', 'almost_certain']),
      impact: z.enum(['negligible', 'low', 'medium', 'high', 'critical']),
      financial_exposure: z.number().min(0).optional(),
      strategy: z.enum(['mitigate', 'avoid', 'transfer', 'accept']).optional(),
      mitigation_plan: z.string().optional().nullable(),
      contingency_plan: z.string().optional().nullable(),
      owner_id: uuidSchema.optional().nullable(),
      review_date: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.owner_id && !await trx.selectFrom('users').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', body.owner_id).executeTakeFirst()) return reply.code(404).send({ error: 'Risk owner not found' });
      const risk = await ProjectGovernanceService.createRisk(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(risk);
    });
  });

  fastify.patch('/risks/:id/status', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      status: z.enum(['open', 'monitoring', 'mitigated', 'closed']),
      mitigation_plan: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const entity = await trx.selectFrom('project_risks').select('project_id').where('tenant_id', '=', user.tenant_id).where('id', '=', params.id).executeTakeFirst();
      if (!entity) return reply.code(404).send({ error: 'Record not found' });
      const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, entity.project_id);
      if (!access || !canEditProject(access.access)) return reply.code(403).send({ error: 'Project edit access required' });
      return await ProjectGovernanceService.updateRiskStatus(trx, user.tenant_id, params.id, body.status, body.mitigation_plan);
    });
  });

  // ─── Issues ───────────────────────────────────────────────────────

  fastify.get('/projects/:id/issues', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectGovernanceService.listIssues(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/issues', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().optional().nullable(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      assigned_to: uuidSchema.optional().nullable(),
      impact_schedule_days: z.number().int().optional(),
      impact_cost: z.number().min(0).optional(),
      root_cause: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const ownerId = body.assigned_to ?? user.sub;
      if (!await trx.selectFrom('users').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', ownerId).executeTakeFirst()) return reply.code(404).send({ error: 'Issue owner not found' });
      const issue = await ProjectGovernanceService.createIssue(trx, user.tenant_id, params.id, { ...body, assigned_to: ownerId });
      return reply.code(201).send(issue);
    });
  });

  fastify.patch('/issues/:id/resolve', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      resolution: z.string().trim().min(1),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const entity = await trx.selectFrom('project_issues').select('project_id').where('tenant_id', '=', user.tenant_id).where('id', '=', params.id).executeTakeFirst();
      if (!entity) return reply.code(404).send({ error: 'Record not found' });
      const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, entity.project_id);
      if (!access || !canEditProject(access.access)) return reply.code(403).send({ error: 'Project edit access required' });
      return await ProjectGovernanceService.resolveIssue(trx, user.tenant_id, params.id, body.resolution);
    });
  });

  // ─── Change Requests ──────────────────────────────────────────────

  fastify.get('/projects/:id/change-requests', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectGovernanceService.listChangeRequests(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/change-requests', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      cr_number: z.string().trim().min(1).max(50),
      title: z.string().trim().min(1).max(200),
      reason: z.string().trim().min(1),
      original_scope: z.string().trim().min(1),
      requested_change: z.string().trim().min(1),
      cost_impact: z.number().optional(),
      schedule_impact_days: z.number().int().optional(),
      risk_impact: z.string().optional().nullable(),
      client_approval_required: z.boolean().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const cr = await ProjectGovernanceService.createChangeRequest(trx, user.tenant_id, params.id, user.sub, body);
      return reply.code(201).send(cr);
    });
  });

  // ─── Approvals ────────────────────────────────────────────────────

  fastify.get('/projects/:id/approval-approvers', async request => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    return withTenant(request.user.tenant_id, trx => ProjectGovernanceService.eligibleApprovers(trx, request.user.tenant_id, id));
  });

  fastify.patch('/projects/:id/change-requests/:changeId', async request => {
    const params = z.object({ id: uuidSchema, changeId: uuidSchema }).parse(request.params);
    const body = z.object({ title: z.string().trim().min(1).max(200), reason: z.string().trim().min(1),
      original_scope: z.string().trim().min(1), requested_change: z.string().trim().min(1),
      cost_impact: z.number().optional(), schedule_impact_days: z.number().int().optional(),
      risk_impact: z.string().nullable().optional(), client_approval_required: z.boolean().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, trx => ProjectGovernanceService.editChangeRequest(trx, request.user.tenant_id, params.id, params.changeId, body));
  });

  fastify.post('/projects/:id/change-requests/:changeId/submit', async (request, reply) => {
    const params = z.object({ id: uuidSchema, changeId: uuidSchema }).parse(request.params);
    const body = z.object({ steps: z.array(z.object({ step_name: z.string().trim().min(1).max(120), assigned_user_id: uuidSchema })).min(1).max(10) }).parse(request.body);
    const user = request.user;
    return withTenant(user.tenant_id, async trx => {
      const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, params.id);
      if (!access || !['owner', 'admin'].includes(access.access)) return reply.code(403).send({ error: 'Project owner or administrator access required to configure approvals' });
      return reply.code(201).send(await ProjectGovernanceService.initiateApprovalWorkflow(trx, user.tenant_id, params.id,
        'change_request', params.changeId, 'Change request review', user.sub,
        body.steps.map((step, index) => ({ ...step, step_order: index + 1 }))));
    });
  });

  fastify.get('/approvals', async (request, reply) => {
    const user = request.user;
    const query = z.object({
      projectId: uuidSchema.optional(),
    }).parse(request.query);

    return withTenant(user.tenant_id, async (trx) => {
      if (query.projectId && !await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, query.projectId)) return reply.code(403).send({ error: 'Project access required' });
      return await ProjectGovernanceService.listApprovals(trx, user.tenant_id, user.sub, user.role, query.projectId);
    });
  });

  fastify.post('/approvals/:id/steps/:stepId/decision', async (request, reply) => {
    const user = request.user;
    const params = z.object({
      id: uuidSchema,
      stepId: uuidSchema,
    }).parse(request.params);

    const body = z.object({
      decision: z.enum(['approved', 'rejected']),
      comments: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const approval = await trx.selectFrom('project_approvals').select(['project_id']).where('tenant_id', '=', user.tenant_id).where('id', '=', params.id).executeTakeFirst();
      if (!approval) return reply.code(404).send({ error: 'Approval not found' });
      if (approval.project_id) {
        const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, approval.project_id);
        if (!access || !canEditProject(access.access)) return reply.code(403).send({ error: 'Project edit access required' });
      }
      return await ProjectGovernanceService.submitApprovalDecision(
        trx,
        user.tenant_id,
        params.id,
        params.stepId,
        user.sub,
        body.decision,
        body.comments
      );
    });
  });

  // ─── Procurement: Purchase Requests ───────────────────────────────

  fastify.get('/projects/:id/purchase-requests', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectProcurementService.listPurchaseRequests(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/purchase-requests', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      pr_number: z.string().trim().min(1).max(50),
      work_package_id: uuidSchema.optional().nullable(),
      title: z.string().trim().min(1).max(200),
      justification: z.string().optional().nullable(),
      estimated_cost: z.number().min(0),
      required_date: z.string().optional().nullable(),
      items: z.array(z.any()).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const pr = await ProjectProcurementService.createPurchaseRequest(trx, user.tenant_id, params.id, user.sub, body);
      return reply.code(201).send(pr);
    });
  });

  // ─── Procurement: RFQs ────────────────────────────────────────────

  fastify.get('/projects/:id/rfqs', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectProcurementService.listRfqs(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/rfqs', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      purchase_request_id: uuidSchema.optional().nullable(),
      rfq_number: z.string().trim().min(1).max(50),
      title: z.string().trim().min(1).max(200),
      scope_description: z.string().optional().nullable(),
      issue_date: z.string().date().optional(),
      closing_date: z.string().date(),
      suppliers: z.array(z.object({
        supplier_id: uuidSchema,
        quoted_amount: z.number().min(0).optional().nullable(),
        delivery_lead_time_days: z.number().int().min(0).optional().nullable(),
        technical_compliance_score: z.number().min(0).max(100).optional().nullable(),
        commercial_score: z.number().min(0).max(100).optional().nullable(),
      })).min(1).max(50),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const rfq = await ProjectProcurementService.createRfq(trx, user.tenant_id, params.id, user.sub, body);
      return reply.code(201).send(rfq);
    });
  });

  // ─── Procurement: Purchase Orders ─────────────────────────────────

  fastify.get('/projects/:id/purchase-orders', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectProcurementService.listPurchaseOrders(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/purchase-orders', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      rfq_id: uuidSchema.optional().nullable(),
      purchase_request_id: uuidSchema.optional().nullable(),
      po_number: z.string().trim().min(1).max(50),
      supplier_id: uuidSchema,
      total_amount: z.number().min(0),
      currency: z.string().max(5).optional(),
      issue_date: z.string().date().optional(),
      expected_delivery_date: z.string().date().optional().nullable(),
      payment_terms: z.string().optional().nullable(),
      incoterms: z.string().optional().nullable(),
      delivery_location: z.string().optional().nullable(),
      items: z.array(z.any()).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const po = await ProjectProcurementService.createPurchaseOrder(trx, user.tenant_id, params.id, user.sub, body);
      return reply.code(201).send(po);
    });
  });

  // ─── Procurement: Goods Receipts (GRN) ────────────────────────────

  fastify.get('/projects/:id/goods-receipts', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectProcurementService.listGoodsReceipts(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/goods-receipts', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      po_id: uuidSchema,
      grn_number: z.string().trim().min(1).max(50),
      received_date: z.string().date().optional(),
      carrier_delivery_note_ref: z.string().optional().nullable(),
      status: z.enum(['pending_inspection', 'accepted', 'rejected', 'partially_accepted']).optional(),
      items_received: z.array(z.object({ description: z.string().trim().min(1).max(500), quantity: z.number().positive(), unit: z.string().trim().min(1).max(50) })).min(1).max(100),
      inspector_notes: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const grn = await ProjectProcurementService.createGoodsReceipt(trx, user.tenant_id, params.id, user.sub, body);
      return reply.code(201).send(grn);
    });
  });

  // ─── Resources & Fleet ────────────────────────────────────────────

  fastify.get('/resources', async (request) => {
    const user = request.user;
    const query = z.object({
      type: z.enum(['personnel', 'heavy_machinery', 'equipment', 'tool', 'facility', 'vehicle']).optional(),
    }).parse(request.query);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectResourcesService.listResources(trx, user.tenant_id, query.type as any);
    });
  });

  fastify.post('/resources', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      resource_type: z.enum(['personnel', 'heavy_machinery', 'equipment', 'tool', 'facility', 'vehicle']),
      name: z.string().trim().min(1).max(200),
      code: z.string().trim().max(50).optional().nullable(),
      make_model: z.string().optional().nullable(),
      serial_number: z.string().optional().nullable(),
      license_plate: z.string().optional().nullable(),
      capacity_rating: z.string().optional().nullable(),
      user_id: uuidSchema.optional().nullable(),
      cost_rate_hourly: z.number().min(0).optional(),
      cost_rate_daily: z.number().min(0).optional(),
      currency: z.string().max(5).optional(),
      telemetry_id: z.string().optional().nullable(),
      last_maintenance_date: z.string().date().optional().nullable(),
      next_maintenance_date: z.string().date().optional().nullable(),
      status: z.enum(['available', 'allocated', 'maintenance', 'decommissioned']).optional(),
      location: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const res = await ProjectResourcesService.createResource(trx, user.tenant_id, body);
      return reply.code(201).send(res);
    });
  });

  fastify.patch('/resources/:resourceId', async (request, reply) => {
    const user = request.user;
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(user.role)) return reply.code(403).send({ error: 'Only workspace administrators can edit fleet assets' });
    const params = z.object({ resourceId: uuidSchema }).parse(request.params);
    const body = z.object({ name: z.string().trim().min(1).max(200).optional(), make_model: z.string().max(1000).nullable().optional(), capacity_rating: z.string().max(1000).nullable().optional(), cost_rate_hourly: z.number().min(0).optional(), cost_rate_daily: z.number().min(0).optional(), status: z.enum(['available', 'allocated', 'maintenance', 'decommissioned']).optional() }).parse(request.body);
    return withTenant(user.tenant_id, trx => ProjectResourcesService.updateResource(trx, user.tenant_id, params.resourceId, body));
  });

  fastify.post('/projects/:id/allocations/:allocationId/release', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema, allocationId: uuidSchema }).parse(request.params);
    return withTenant(user.tenant_id, trx => ProjectResourcesService.releaseAllocation(trx, user.tenant_id, params.id, params.allocationId));
  });

  fastify.get('/projects/:id/allocations', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectResourcesService.listAllocations(trx, user.tenant_id, params.id);
    });
  });

  fastify.post('/projects/:id/allocations', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      work_package_id: uuidSchema.optional().nullable(),
      resource_id: uuidSchema,
      start_date: z.string().date(),
      end_date: z.string().date(),
      allocated_pct: z.number().int().min(1).max(100).optional(),
      hours_planned: z.number().min(0).optional(),
      operator_id: uuidSchema.optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const alloc = await ProjectResourcesService.createAllocation(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(alloc);
    });
  });

  // ─── Modular Industry Packs Data ──────────────────────────────────

  fastify.get('/projects/:id/industry-data', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const query = z.object({
      dataType: z.string().optional(),
    }).parse(request.query);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectIndustryService.listRecords(trx, user.tenant_id, params.id, query.dataType);
    });
  });

  fastify.post('/projects/:id/industry-data', async (request, reply) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      industry: z.string(),
      data_type: z.string().trim().min(1).max(50),
      record_data: z.record(z.any()),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const rec = await ProjectIndustryService.createRecord(
        trx,
        user.tenant_id,
        params.id,
        user.sub,
        body.industry as any,
        body.data_type,
        body.record_data
      );
      return reply.code(201).send(rec);
    });
  });

  fastify.put('/industry-data/:id', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      record_data: z.record(z.any()),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const record = await trx.selectFrom('project_industry_data').select('project_id').where('tenant_id', '=', user.tenant_id).where('id', '=', params.id).executeTakeFirst();
      if (!record) throw Object.assign(new Error('Industry record not found'), { statusCode: 404 });
      const access = await resolveProjectAccess(trx, user.tenant_id, user.sub, user.role, record.project_id);
      if (!access || !canEditProject(access.access)) throw Object.assign(new Error('You cannot edit this project record'), { statusCode: 403 });
      return await ProjectIndustryService.updateRecord(trx, user.tenant_id, params.id, body.record_data);
    });
  });
}
