import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { ProjectOsService } from '../services/project-os.service.js';
import { ProjectGovernanceService } from '../services/project-governance.service.js';
import { ProjectProcurementService } from '../services/project-procurement.service.js';
import { ProjectResourcesService } from '../services/project-resources.service.js';
import { ProjectIndustryService } from '../services/project-industry.service.js';

const uuidSchema = z.string().uuid();

export async function projectOsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('projects'));

  // ─── Command Center ───────────────────────────────────────────────

  fastify.get('/command-center', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.getCommandCenterMetrics(trx, user.tenant_id);
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
      status: z.enum(['active', 'planning', 'on_hold', 'archived']).optional(),
      strategic_alignment: z.record(z.any()).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
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
      target_benefits: z.array(z.string()).optional(),
      status: z.enum(['active', 'planning', 'on_hold', 'completed', 'cancelled']).optional(),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
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

  fastify.patch('/phases/:id/gate', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      passed: z.boolean(),
      status: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectOsService.updatePhaseGate(trx, user.tenant_id, params.id, body.passed, body.status);
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
      const deliv = await ProjectDeliverablesService(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(deliv);
    });
  });

  fastify.patch('/deliverables/:id/review', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      status: z.enum(['approved', 'rejected']),
      rejection_reason: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
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
      category: z.string().optional(),
      probability: z.enum(['unlikely', 'possible', 'likely', 'almost_certain']),
      impact: z.enum(['negligible', 'low', 'medium', 'high', 'critical']),
      financial_exposure: z.number().min(0).optional(),
      strategy: z.enum(['mitigate', 'avoid', 'transfer', 'accept']).optional(),
      mitigation_plan: z.string().optional().nullable(),
      contingency_plan: z.string().optional().nullable(),
      owner_id: uuidSchema.optional().nullable(),
      review_date: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const risk = await ProjectGovernanceService.createRisk(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(risk);
    });
  });

  fastify.patch('/risks/:id/status', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      status: z.enum(['open', 'monitoring', 'mitigated', 'closed']),
      mitigation_plan: z.string().optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
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
      const issue = await ProjectGovernanceService.createIssue(trx, user.tenant_id, params.id, body);
      return reply.code(201).send(issue);
    });
  });

  fastify.patch('/issues/:id/resolve', async (request) => {
    const user = request.user;
    const params = z.object({ id: uuidSchema }).parse(request.params);
    const body = z.object({
      resolution: z.string().trim().min(1),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
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
      scope_impact: z.string().optional().nullable(),
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

  fastify.get('/approvals', async (request) => {
    const user = request.user;
    const query = z.object({
      projectId: uuidSchema.optional(),
    }).parse(request.query);

    return withTenant(user.tenant_id, async (trx) => {
      return await ProjectGovernanceService.listApprovals(trx, user.tenant_id, query.projectId);
    });
  });

  fastify.post('/approvals/:id/steps/:stepId/decision', async (request) => {
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
      issue_date: z.string().optional().nullable(),
      closing_date: z.string().optional().nullable(),
      suppliers: z.array(z.object({
        supplier_name: z.string().trim().min(1),
        contact_email: z.string().email().optional().nullable(),
        quoted_amount: z.number().optional().nullable(),
        delivery_lead_time_days: z.number().int().optional().nullable(),
        technical_compliance_score: z.number().optional().nullable(),
        commercial_score: z.number().optional().nullable(),
      })).optional(),
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
      supplier_name: z.string().trim().min(1).max(200),
      supplier_id: uuidSchema.optional().nullable(),
      total_amount: z.number().min(0),
      currency: z.string().max(5).optional(),
      issue_date: z.string().optional(),
      expected_delivery_date: z.string().optional().nullable(),
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
      received_date: z.string().optional(),
      carrier_delivery_note_ref: z.string().optional().nullable(),
      status: z.enum(['pending_inspection', 'accepted', 'rejected', 'partially_accepted']).optional(),
      items_received: z.array(z.any()).optional(),
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
      code: z.string().optional().nullable(),
      make_model: z.string().optional().nullable(),
      serial_number: z.string().optional().nullable(),
      license_plate: z.string().optional().nullable(),
      capacity_rating: z.string().optional().nullable(),
      user_id: uuidSchema.optional().nullable(),
      cost_rate_hourly: z.number().min(0).optional(),
      cost_rate_daily: z.number().min(0).optional(),
      currency: z.string().max(5).optional(),
      telemetry_id: z.string().optional().nullable(),
      last_maintenance_date: z.string().optional().nullable(),
      next_maintenance_date: z.string().optional().nullable(),
      status: z.enum(['available', 'allocated', 'maintenance', 'decommissioned']).optional(),
      location: z.string().optional().nullable(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const res = await ProjectResourcesService.createResource(trx, user.tenant_id, body);
      return reply.code(201).send(res);
    });
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
      start_date: z.string(),
      end_date: z.string(),
      allocated_pct: z.number().min(1).max(100).optional(),
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
      data_type: z.string().trim().min(1),
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
      return await ProjectIndustryService.updateRecord(trx, user.tenant_id, params.id, body.record_data);
    });
  });
}

function ProjectDeliverablesService(trx: any, tenant_id: string, id: string, body: any) {
  return ProjectOsService.createDeliverable(trx, tenant_id, id, body);
}
