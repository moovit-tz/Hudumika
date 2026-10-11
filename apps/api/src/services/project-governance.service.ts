import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type {
  ProjectRisk,
  ProjectRiskProbability,
  ProjectRiskImpact,
  ProjectRiskStrategy,
  ProjectIssue,
  ProjectIssueSeverity,
  ProjectChangeRequest,
  ProjectApproval,
  ProjectApprovalEntityType,
} from '@hudumika/types';

export class ProjectGovernanceService {
  // ─── Risk Management ──────────────────────────────────────────────

  static calculateRiskScore(probability: ProjectRiskProbability, impact: ProjectRiskImpact): number {
    return ({ unlikely: 1, possible: 2, moderate: 3, likely: 4, almost_certain: 5 })[probability]
      * ({ negligible: 1, low: 2, medium: 3, high: 4, critical: 5 })[impact];
  }

  static riskResponse(row: any) {
    const categories: Record<string, string> = { SAFETY_HSE: 'safety', LEGAL_REGULATORY: 'legal' };
    return { ...row, score: row.probability * row.impact, category: row.metadata.category ?? categories[row.category] ?? row.category.toLowerCase(),
      probability: ['', 'unlikely', 'possible', 'moderate', 'likely', 'almost_certain'][row.probability],
      impact: ['', 'negligible', 'low', 'medium', 'high', 'critical'][row.impact],
      financial_exposure: Number(row.financial_exposure), strategy: row.metadata.strategy ?? null,
      mitigation_plan: row.mitigation_strategy, review_date: row.metadata.review_date ?? null,
      status: row.metadata.workflow_status ?? ({ IDENTIFIED: 'open', ANALYZING: 'open', MITIGATING: 'open', MONITORING: 'monitoring', OCCURRED: 'open', CLOSED: 'closed' } as Record<string, string>)[row.status] };
  }

  static async listRisks(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_risks')
      .leftJoin('users', join => join.on(sql<boolean>`users.id = project_risks.owner_id and users.tenant_id = ${tenantId}`))
      .where('project_risks.tenant_id', '=', tenantId).where('project_risks.project_id', '=', projectId)
      .selectAll('project_risks').select('users.name as owner_name').orderBy(sql<number>`project_risks.probability * project_risks.impact`, 'desc').execute();
    return rows.map(this.riskResponse);
  }

  static async createRisk(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    title: string; description?: string | null; category?: string; probability: ProjectRiskProbability; impact: ProjectRiskImpact;
    financial_exposure?: number; strategy?: ProjectRiskStrategy; mitigation_plan?: string | null;
    contingency_plan?: string | null; owner_id?: string | null; review_date?: string | null;
  }) {
    const score = this.calculateRiskScore(data.probability, data.impact);
    const categories: Record<string, string> = { technical: 'TECHNICAL', commercial: 'COMMERCIAL', safety: 'SAFETY_HSE',
      environmental: 'ENVIRONMENTAL', legal: 'LEGAL_REGULATORY', operational: 'RESOURCE', schedule: 'SCHEDULE', cost: 'COST', resource: 'RESOURCE', external: 'EXTERNAL' };
    const row = await trx.insertInto('project_risks').values({ tenant_id: tenantId, project_id: projectId,
      risk_code: `RK-${randomUUID()}`, title: data.title, description: data.description ?? null,
      category: categories[data.category ?? 'operational'], probability: ({ unlikely: 1, possible: 2, moderate: 3, likely: 4, almost_certain: 5 })[data.probability],
      impact: ({ negligible: 1, low: 2, medium: 3, high: 4, critical: 5 })[data.impact], score,
      severity: score >= 20 ? 'CRITICAL' : score >= 15 ? 'HIGH' : score >= 8 ? 'MEDIUM' : 'LOW',
      financial_exposure: data.financial_exposure ?? 0, mitigation_strategy: data.mitigation_plan ?? null,
      contingency_plan: data.contingency_plan ?? null, owner_id: data.owner_id ?? null, status: 'IDENTIFIED',
      metadata: { category: data.category ?? 'operational', strategy: data.strategy ?? 'mitigate', review_date: data.review_date ?? null },
    }).returningAll().executeTakeFirstOrThrow();
    return this.riskResponse(row);
  }

  static async updateRiskStatus(trx: Transaction<Database>, tenantId: string, riskId: string, status: string, mitigationPlan?: string) {
    // A mitigated risk remains monitored; metadata preserves the client's residual-risk decision.
    const row = await trx.updateTable('project_risks').set({
      status: ({ open: 'IDENTIFIED', monitoring: 'MONITORING', mitigated: 'MONITORING', closed: 'CLOSED' } as Record<string, string>)[status],
      metadata: sql`metadata || ${JSON.stringify({ workflow_status: status })}::jsonb`,
      ...(mitigationPlan !== undefined ? { mitigation_strategy: mitigationPlan } : {}), updated_at: new Date(),
    }).where('id', '=', riskId).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
    return this.riskResponse(row);
  }

  static issueResponse(row: any) {
    return { ...row, severity: row.severity.toLowerCase(), status: row.status.toLowerCase(), assigned_to: row.owner_id,
      impact_schedule_days: Number(row.metadata.impact_schedule_days ?? 0), impact_cost: Number(row.metadata.impact_cost ?? 0),
      resolution: row.resolution_notes };
  }

  static async listIssues(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_issues')
      .leftJoin('users', join => join.on(sql<boolean>`users.id = project_issues.owner_id and users.tenant_id = ${tenantId}`))
      .where('project_issues.tenant_id', '=', tenantId).where('project_issues.project_id', '=', projectId)
      .selectAll('project_issues').select('users.name as assignee_name').orderBy('project_issues.created_at', 'desc').execute();
    return rows.map(this.issueResponse);
  }

  static async createIssue(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    title: string; description?: string | null; severity: ProjectIssueSeverity; assigned_to: string;
    impact_schedule_days?: number; impact_cost?: number; root_cause?: string | null;
  }) {
    const row = await trx.insertInto('project_issues').values({ tenant_id: tenantId, project_id: projectId,
      issue_code: `IS-${randomUUID()}`, title: data.title, description: data.description ?? null,
      severity: data.severity.toUpperCase(), status: 'OPEN', owner_id: data.assigned_to, root_cause: data.root_cause ?? null,
      metadata: { impact_schedule_days: data.impact_schedule_days ?? 0, impact_cost: data.impact_cost ?? 0 },
    }).returningAll().executeTakeFirstOrThrow();
    return this.issueResponse(row);
  }

  static async resolveIssue(trx: Transaction<Database>, tenantId: string, issueId: string, resolution: string) {
    const row = await trx.updateTable('project_issues').set({ status: 'RESOLVED', resolution_notes: resolution,
      resolved_at: new Date(), updated_at: new Date(),
    }).where('id', '=', issueId).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
    return this.issueResponse(row);
  }

  // ─── Change Request Management ────────────────────────────────────

  static changeRequestResponse(row: any) {
    return { ...row, cr_number: row.change_code, reason: row.justification,
      scope_impact: row.requested_change, requested_by: row.requester_id,
      cost_impact: Number(row.cost_impact), status: row.status.toLowerCase(),
      evaluated_by: null, client_approval_required: row.metadata.client_approval_required ?? false,
      client_approved_at: null, attachments: row.metadata.attachments ?? {} };
  }

  static async listChangeRequests(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_change_requests')
      .leftJoin('users as req', join => join.on(sql<boolean>`req.id = project_change_requests.requester_id and req.tenant_id = ${tenantId}`))
      .leftJoin('users as app', join => join.on(sql<boolean>`app.id = project_change_requests.approved_by and app.tenant_id = ${tenantId}`))
      .where('project_change_requests.tenant_id', '=', tenantId).where('project_change_requests.project_id', '=', projectId)
      .selectAll('project_change_requests').select(['req.name as requester_name', 'app.name as approver_name'])
      .orderBy('project_change_requests.created_at', 'desc').execute();
    return rows.map(this.changeRequestResponse);
  }

  static async createChangeRequest(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    cr_number: string; title: string; reason: string; original_scope: string; requested_change: string;
    cost_impact?: number; schedule_impact_days?: number; risk_impact?: string | null; client_approval_required?: boolean;
  }) {
    const existing = await trx.selectFrom('project_change_requests').select('id').where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId).where('change_code', '=', data.cr_number).executeTakeFirst();
    if (existing) throw Object.assign(new Error('Change request number already exists in this project'), { statusCode: 409 });
    const row = await trx.insertInto('project_change_requests').values({ tenant_id: tenantId, project_id: projectId,
      change_code: data.cr_number, title: data.title, original_scope: data.original_scope,
      requested_change: data.requested_change, justification: data.reason, requester_id: userId,
      cost_impact: data.cost_impact ?? 0, schedule_impact_days: data.schedule_impact_days ?? 0,
      risk_impact: data.risk_impact ?? null, status: 'DRAFT',
      metadata: { client_approval_required: data.client_approval_required ?? false },
    }).returningAll().executeTakeFirstOrThrow();
    return this.changeRequestResponse(row);
  }

  static approvalResponse(row: any) {
    return { ...row, entity_type: row.entity_type.toLowerCase(), status: row.status.toLowerCase(), metadata: {} };
  }

  static async editChangeRequest(trx: Transaction<Database>, tenantId: string, projectId: string, id: string,
    data: { title: string; reason: string; original_scope: string; requested_change: string; cost_impact?: number;
      schedule_impact_days?: number; risk_impact?: string | null; client_approval_required?: boolean }) {
    const row = await trx.selectFrom('project_change_requests').selectAll().where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId).where('id', '=', id).forUpdate().executeTakeFirst();
    if (!row) throw Object.assign(new Error('Change request not found'), { statusCode: 404 });
    if (row.status !== 'DRAFT') throw Object.assign(new Error('Only draft change requests can be edited'), { statusCode: 409 });
    const updated = await trx.updateTable('project_change_requests').set({ title: data.title,
      justification: data.reason, original_scope: data.original_scope, requested_change: data.requested_change,
      cost_impact: data.cost_impact ?? row.cost_impact, schedule_impact_days: data.schedule_impact_days ?? row.schedule_impact_days,
      risk_impact: data.risk_impact === undefined ? row.risk_impact : data.risk_impact,
      metadata: { ...row.metadata, ...(data.client_approval_required === undefined ? {} : { client_approval_required: data.client_approval_required }) },
      updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    return this.changeRequestResponse(updated);
  }

  static async eligibleApprovers(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return trx.selectFrom('users').select(['id', 'name', 'role']).where('tenant_id', '=', tenantId)
      .where('role', '!=', 'CUSTOMER')
      .where(sql<boolean>`((users.role in ('SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN') and not exists
        (select 1 from project_members v where v.tenant_id = ${tenantId} and v.project_id = ${projectId} and v.user_id = users.id and v.role = 'viewer')) or exists
        (select 1 from project_members m where m.tenant_id = ${tenantId} and m.project_id = ${projectId}
          and m.user_id = users.id and m.role in ('owner', 'member')))`)
      .orderBy('name').execute();
  }

  static stepResponse(row: any) {
    return { ...row, step_order: row.step_number, step_name: row.metadata.step_name ?? `Step ${row.step_number}`,
      required_role: row.approver_role, assigned_user_id: row.approver_user_id, status: row.status.toLowerCase(),
      action_by: row.decided_at ? row.approver_user_id : null, action_at: row.decided_at };
  }

  static async initiateApprovalWorkflow(trx: Transaction<Database>, tenantId: string, projectId: string | null,
    entityType: ProjectApprovalEntityType, entityId: string, title: string, requesterId: string,
    steps: Array<{ step_order: number; step_name: string; required_role?: string; assigned_user_id?: string }>
  ) {
    if (!steps.length || steps.some((step, index) => step.step_order !== index + 1 || !step.assigned_user_id))
      throw Object.assign(new Error('Configure a named approver for every ordered approval step'), { statusCode: 503 });
    if (entityType !== 'change_request' || !projectId) throw Object.assign(new Error('Approval workflow creation is not configured for this entity'), { statusCode: 503 });
    const target = await trx.selectFrom('project_change_requests').select(['id', 'status']).where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', entityId).forUpdate().executeTakeFirst();
    if (!target) throw Object.assign(new Error('Change request not found in this project'), { statusCode: 404 });
    for (const step of steps) {
      const user = await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', '=', step.assigned_user_id!).executeTakeFirst();
      if (!user) throw Object.assign(new Error('Approver not found'), { statusCode: 404 });
    }
    if (!['DRAFT', 'SUBMITTED'].includes(target.status)) throw Object.assign(new Error('Change request cannot enter approval from its current status'), { statusCode: 409 });
    const existing = await trx.selectFrom('project_approvals').select('id').where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId).where('entity_type', '=', 'CHANGE_REQUEST').where('entity_id', '=', entityId).executeTakeFirst();
    if (existing) throw Object.assign(new Error('This change request already has an approval workflow'), { statusCode: 409 });
    const eligible = await this.eligibleApprovers(trx, tenantId, projectId);
    if (steps.some(step => !eligible.some(user => user.id === step.assigned_user_id)))
      throw Object.assign(new Error('Approvers must have project edit access'), { statusCode: 403 });
    if (new Set(steps.map(step => step.assigned_user_id)).size !== steps.length)
      throw Object.assign(new Error('Choose a different approver for each step'), { statusCode: 400 });
    const approval = await trx.insertInto('project_approvals').values({ tenant_id: tenantId, project_id: projectId,
      entity_type: entityType.toUpperCase(), entity_id: entityId, title, requester_id: requesterId,
      current_step: 1, total_steps: steps.length, status: 'PENDING', workflow_type: 'SEQUENTIAL',
    }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('project_approval_steps').values(steps.map(step => ({ tenant_id: tenantId, approval_id: approval.id,
      step_number: step.step_order, approver_user_id: step.assigned_user_id!, approver_role: step.required_role ?? null,
      metadata: { step_name: step.step_name }, status: 'PENDING',
    }))).execute();
    await trx.updateTable('project_change_requests').set({ status: 'UNDER_REVIEW', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', entityId).execute();
    return this.approvalResponse(approval);
  }

  static async listApprovals(trx: Transaction<Database>, tenantId: string, userId: string, userRole: string, projectId?: string) {
    const admin = ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(userRole);
    let query = trx.selectFrom('project_approvals')
      .leftJoin('users', join => join.on(sql<boolean>`users.id = project_approvals.requester_id and users.tenant_id = ${tenantId}`))
      .where('project_approvals.tenant_id', '=', tenantId);
    if (projectId) query = query.where('project_approvals.project_id', '=', projectId);
    query = query.where(sql<boolean>`(
      exists (select 1 from projects p where p.id = project_approvals.project_id and p.tenant_id = ${tenantId}
        and (${admin} or exists (select 1 from project_members m where m.project_id = p.id and m.tenant_id = ${tenantId} and m.user_id = ${userId})))
      or (project_approvals.project_id is null and (${admin} or project_approvals.requester_id = ${userId}
        or exists (select 1 from project_approval_steps s where s.approval_id = project_approvals.id and s.tenant_id = ${tenantId} and s.approver_user_id = ${userId})))
    )`);
    const approvals = await query.selectAll('project_approvals').select('users.name as requester_name')
      .orderBy('project_approvals.created_at', 'desc').execute();
    if (!approvals.length) return [];
    const steps = await trx.selectFrom('project_approval_steps').selectAll().where('tenant_id', '=', tenantId)
      .where('approval_id', 'in', approvals.map(a => a.id)).orderBy('step_number').execute();
    return approvals.map(a => ({ ...this.approvalResponse(a), steps: steps.filter(step => step.approval_id === a.id).map(this.stepResponse) }));
  }

  static async submitApprovalDecision(trx: Transaction<Database>, tenantId: string, approvalId: string,
    stepId: string, userId: string, decision: 'approved' | 'rejected', comments?: string
  ) {
    const approval = await trx.selectFrom('project_approvals').selectAll().where('id', '=', approvalId)
      .where('tenant_id', '=', tenantId).forUpdate().executeTakeFirst();
    if (!approval) throw Object.assign(new Error('Approval not found'), { statusCode: 404 });
    const step = await trx.selectFrom('project_approval_steps').selectAll().where('id', '=', stepId)
      .where('approval_id', '=', approvalId).where('tenant_id', '=', tenantId).forUpdate().executeTakeFirst();
    if (!step) throw Object.assign(new Error('Approval step not found'), { statusCode: 404 });
    if (!step.approver_user_id || step.approver_user_id !== userId) throw Object.assign(new Error('Only the assigned approver can decide this step'), { statusCode: 403 });
    if (!['SEQUENTIAL', 'SINGLE_SIGNER'].includes(approval.workflow_type)) throw Object.assign(new Error('This approval workflow type is not supported'), { statusCode: 409 });
    if (approval.status !== 'PENDING' || step.status !== 'PENDING' || step.step_number !== approval.current_step)
      throw Object.assign(new Error('This approval step is not active'), { statusCode: 409 });
    const steps = await trx.selectFrom('project_approval_steps').select(['step_number', 'status']).where('tenant_id', '=', tenantId).where('approval_id', '=', approvalId).orderBy('step_number').execute();
    if (steps.length !== approval.total_steps || steps.some((s, index) => s.step_number !== index + 1 || (s.step_number < approval.current_step && s.status !== 'APPROVED')))
      throw Object.assign(new Error('Approval steps are inconsistent'), { statusCode: 409 });
    const complete = decision === 'rejected' || approval.current_step === approval.total_steps;
    if (complete && approval.entity_type === 'CHANGE_REQUEST') {
      const target = await trx.selectFrom('project_change_requests').select(['id', 'status']).where('tenant_id', '=', tenantId)
        .where('id', '=', approval.entity_id).where('project_id', '=', approval.project_id!).forUpdate().executeTakeFirst();
      if (!target) throw Object.assign(new Error('Approval target not found in this project'), { statusCode: 404 });
      if (target.status !== 'UNDER_REVIEW') throw Object.assign(new Error('Approval target is no longer under review'), { statusCode: 409 });
      await trx.updateTable('project_change_requests').set({ status: decision.toUpperCase(),
        approved_by: decision === 'approved' ? userId : null, approved_at: decision === 'approved' ? new Date() : null, updated_at: new Date(),
      }).where('id', '=', approval.entity_id).where('project_id', '=', approval.project_id!).where('tenant_id', '=', tenantId).execute();
    }
    const now = new Date();
    await trx.updateTable('project_approval_steps').set({ status: decision.toUpperCase(), decision: decision.toUpperCase(),
      decided_at: now, comments: comments ?? null,
    }).where('id', '=', stepId).where('approval_id', '=', approvalId).where('tenant_id', '=', tenantId).execute();
    const row = await trx.updateTable('project_approvals').set({ status: complete ? decision.toUpperCase() : 'PENDING',
      current_step: complete ? approval.current_step : approval.current_step + 1, completed_at: complete ? now : null, updated_at: now,
    }).where('id', '=', approvalId).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
    return { success: true, status: decision, approval: this.approvalResponse(row) };
  }
}
