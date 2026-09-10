import { type Transaction } from 'kysely';
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
    const probMap: Record<ProjectRiskProbability, number> = {
      unlikely: 1,
      possible: 2,
      likely: 4,
      almost_certain: 5,
    };
    const impactMap: Record<ProjectRiskImpact, number> = {
      negligible: 1,
      low: 2,
      medium: 3,
      high: 4,
      critical: 5,
    };
    const p = probMap[probability] || 2;
    const i = impactMap[impact] || 3;
    return p * i;
  }

  static async listRisks(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_risks')
      .leftJoin('users', 'users.id', 'project_risks.owner_id')
      .where('project_risks.tenant_id', '=', tenantId)
      .where('project_risks.project_id', '=', projectId)
      .select([
        'project_risks.id',
        'project_risks.tenant_id',
        'project_risks.project_id',
        'project_risks.title',
        'project_risks.description',
        'project_risks.category',
        'project_risks.probability',
        'project_risks.impact',
        'project_risks.score',
        'project_risks.financial_exposure',
        'project_risks.strategy',
        'project_risks.mitigation_plan',
        'project_risks.contingency_plan',
        'project_risks.owner_id',
        'project_risks.status',
        'project_risks.review_date',
        'project_risks.created_at',
        'project_risks.updated_at',
        'users.name as owner_name',
      ])
      .orderBy('project_risks.score', 'desc')
      .execute();
  }

  static async createRisk(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    title: string;
    description?: string | null;
    category?: string;
    probability: ProjectRiskProbability;
    impact: ProjectRiskImpact;
    financial_exposure?: number;
    strategy?: ProjectRiskStrategy;
    mitigation_plan?: string | null;
    contingency_plan?: string | null;
    owner_id?: string | null;
    review_date?: string | null;
  }) {
    const score = this.calculateRiskScore(data.probability, data.impact);

    return await trx
      .insertInto('project_risks')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? 'operational',
        probability: data.probability,
        impact: data.impact,
        score,
        financial_exposure: data.financial_exposure ?? 0,
        strategy: data.strategy ?? 'mitigate',
        mitigation_plan: data.mitigation_plan ?? null,
        contingency_plan: data.contingency_plan ?? null,
        owner_id: data.owner_id ?? null,
        status: 'open',
        review_date: data.review_date ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async updateRiskStatus(trx: Transaction<Database>, tenantId: string, riskId: string, status: string, mitigationPlan?: string) {
    return await trx
      .updateTable('project_risks')
      .set({
        status,
        ...(mitigationPlan !== undefined ? { mitigation_plan: mitigationPlan } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', riskId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Issue Management ─────────────────────────────────────────────

  static async listIssues(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_issues')
      .leftJoin('users', 'users.id', 'project_issues.assigned_to')
      .where('project_issues.tenant_id', '=', tenantId)
      .where('project_issues.project_id', '=', projectId)
      .select([
        'project_issues.id',
        'project_issues.tenant_id',
        'project_issues.project_id',
        'project_issues.title',
        'project_issues.description',
        'project_issues.severity',
        'project_issues.status',
        'project_issues.assigned_to',
        'project_issues.impact_schedule_days',
        'project_issues.impact_cost',
        'project_issues.root_cause',
        'project_issues.resolution',
        'project_issues.resolved_at',
        'project_issues.created_at',
        'project_issues.updated_at',
        'users.name as assignee_name',
      ])
      .orderBy('project_issues.created_at', 'desc')
      .execute();
  }

  static async createIssue(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    title: string;
    description?: string | null;
    severity: ProjectIssueSeverity;
    assigned_to?: string | null;
    impact_schedule_days?: number;
    impact_cost?: number;
    root_cause?: string | null;
  }) {
    return await trx
      .insertInto('project_issues')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        title: data.title,
        description: data.description ?? null,
        severity: data.severity,
        status: 'open',
        assigned_to: data.assigned_to ?? null,
        impact_schedule_days: data.impact_schedule_days ?? 0,
        impact_cost: data.impact_cost ?? 0,
        root_cause: data.root_cause ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async resolveIssue(trx: Transaction<Database>, tenantId: string, issueId: string, resolution: string) {
    return await trx
      .updateTable('project_issues')
      .set({
        status: 'resolved',
        resolution,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', issueId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Change Request Management ────────────────────────────────────

  static async listChangeRequests(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_change_requests')
      .leftJoin('users as req', 'req.id', 'project_change_requests.requested_by')
      .leftJoin('users as app', 'app.id', 'project_change_requests.approved_by')
      .where('project_change_requests.tenant_id', '=', tenantId)
      .where('project_change_requests.project_id', '=', projectId)
      .select([
        'project_change_requests.id',
        'project_change_requests.tenant_id',
        'project_change_requests.project_id',
        'project_change_requests.cr_number',
        'project_change_requests.title',
        'project_change_requests.reason',
        'project_change_requests.scope_impact',
        'project_change_requests.cost_impact',
        'project_change_requests.schedule_impact_days',
        'project_change_requests.risk_impact',
        'project_change_requests.status',
        'project_change_requests.requested_by',
        'project_change_requests.evaluated_by',
        'project_change_requests.approved_by',
        'project_change_requests.approved_at',
        'project_change_requests.client_approval_required',
        'project_change_requests.client_approved_at',
        'project_change_requests.attachments',
        'project_change_requests.created_at',
        'project_change_requests.updated_at',
        'req.name as requester_name',
        'app.name as approver_name',
      ])
      .orderBy('project_change_requests.created_at', 'desc')
      .execute();
  }

  static async createChangeRequest(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    cr_number: string;
    title: string;
    reason: string;
    scope_impact?: string | null;
    cost_impact?: number;
    schedule_impact_days?: number;
    risk_impact?: string | null;
    client_approval_required?: boolean;
  }) {
    const cr = await trx
      .insertInto('project_change_requests')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        cr_number: data.cr_number,
        title: data.title,
        reason: data.reason,
        scope_impact: data.scope_impact ?? null,
        cost_impact: data.cost_impact ?? 0,
        schedule_impact_days: data.schedule_impact_days ?? 0,
        risk_impact: data.risk_impact ?? null,
        status: 'submitted',
        requested_by: userId,
        client_approval_required: data.client_approval_required ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Automatically spawn multi-step approval
    await this.initiateApprovalWorkflow(
      trx,
      tenantId,
      projectId,
      'change_request',
      cr.id,
      `Change Request: ${cr.cr_number} - ${cr.title}`,
      userId,
      [
        { step_order: 1, step_name: 'Lead Technical Review', required_role: 'ENGINEER' },
        { step_order: 2, step_name: 'Commercial & Budget Verification', required_role: 'COMMERCIAL_MANAGER' },
        { step_order: 3, step_name: 'Project Director Sign-Off', required_role: 'PROJECT_DIRECTOR' },
      ]
    );

    return cr;
  }

  // ─── Multi-step Approval Engine ───────────────────────────────────

  static async initiateApprovalWorkflow(
    trx: Transaction<Database>,
    tenantId: string,
    projectId: string | null,
    entityType: ProjectApprovalEntityType,
    entityId: string,
    title: string,
    requesterId: string,
    steps: Array<{ step_order: number; step_name: string; required_role?: string; assigned_user_id?: string }>
  ) {
    const approval = await trx
      .insertInto('project_approvals')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        entity_type: entityType,
        entity_id: entityId,
        title,
        current_step: 1,
        total_steps: steps.length,
        status: 'pending',
        requester_id: requesterId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const step of steps) {
      await trx
        .insertInto('project_approval_steps')
        .values({
          tenant_id: tenantId,
          approval_id: approval.id,
          step_order: step.step_order,
          step_name: step.step_name,
          required_role: step.required_role ?? null,
          assigned_user_id: step.assigned_user_id ?? null,
          status: step.step_order === 1 ? 'pending' : 'pending',
        })
        .execute();
    }

    return approval;
  }

  static async listApprovals(trx: Transaction<Database>, tenantId: string, projectId?: string) {
    let query = trx
      .selectFrom('project_approvals')
      .leftJoin('users', 'users.id', 'project_approvals.requester_id')
      .where('project_approvals.tenant_id', '=', tenantId);

    if (projectId) {
      query = query.where('project_approvals.project_id', '=', projectId);
    }

    const approvals = await query
      .select([
        'project_approvals.id',
        'project_approvals.tenant_id',
        'project_approvals.project_id',
        'project_approvals.entity_type',
        'project_approvals.entity_id',
        'project_approvals.title',
        'project_approvals.current_step',
        'project_approvals.total_steps',
        'project_approvals.status',
        'project_approvals.requester_id',
        'project_approvals.metadata',
        'project_approvals.completed_at',
        'project_approvals.created_at',
        'project_approvals.updated_at',
        'users.name as requester_name',
      ])
      .orderBy('project_approvals.created_at', 'desc')
      .execute();

    // Fetch steps
    const steps = await trx
      .selectFrom('project_approval_steps')
      .leftJoin('users as action_user', 'action_user.id', 'project_approval_steps.action_by')
      .where('project_approval_steps.tenant_id', '=', tenantId)
      .select([
        'project_approval_steps.id',
        'project_approval_steps.approval_id',
        'project_approval_steps.step_order',
        'project_approval_steps.step_name',
        'project_approval_steps.required_role',
        'project_approval_steps.assigned_user_id',
        'project_approval_steps.status',
        'project_approval_steps.action_by',
        'project_approval_steps.action_at',
        'project_approval_steps.comments',
        'action_user.name as action_user_name',
      ])
      .orderBy('project_approval_steps.step_order', 'asc')
      .execute();

    const stepsByApproval = new Map<string, typeof steps>();
    for (const s of steps) {
      const arr = stepsByApproval.get(s.approval_id) || [];
      arr.push(s);
      stepsByApproval.set(s.approval_id, arr);
    }

    return approvals.map(a => ({
      ...a,
      steps: stepsByApproval.get(a.id) || [],
    }));
  }

  static async submitApprovalDecision(
    trx: Transaction<Database>,
    tenantId: string,
    approvalId: string,
    stepId: string,
    userId: string,
    decision: 'approved' | 'rejected',
    comments?: string
  ) {
    const approval = await trx
      .selectFrom('project_approvals')
      .where('id', '=', approvalId)
      .where('tenant_id', '=', tenantId)
      .selectAll()
      .executeTakeFirstOrThrow();

    // Update current step
    await trx
      .updateTable('project_approval_steps')
      .set({
        status: decision,
        action_by: userId,
        action_at: new Date(),
        comments: comments ?? null,
      })
      .where('id', '=', stepId)
      .where('tenant_id', '=', tenantId)
      .execute();

    if (decision === 'rejected') {
      await trx
        .updateTable('project_approvals')
        .set({
          status: 'rejected',
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', approvalId)
        .where('tenant_id', '=', tenantId)
        .execute();

      // Update target entity if change request
      if (approval.entity_type === 'change_request') {
        await trx
          .updateTable('project_change_requests')
          .set({ status: 'rejected', updated_at: new Date() })
          .where('id', '=', approval.entity_id)
          .where('tenant_id', '=', tenantId)
          .execute();
      }
    } else {
      // Check if this was the last step
      if (approval.current_step >= approval.total_steps) {
        await trx
          .updateTable('project_approvals')
          .set({
            status: 'approved',
            completed_at: new Date(),
            updated_at: new Date(),
          })
          .where('id', '=', approvalId)
          .where('tenant_id', '=', tenantId)
          .execute();

        // Update target entity
        if (approval.entity_type === 'change_request') {
          await trx
            .updateTable('project_change_requests')
            .set({
              status: 'approved',
              approved_by: userId,
              approved_at: new Date(),
              updated_at: new Date(),
            })
            .where('id', '=', approval.entity_id)
            .where('tenant_id', '=', tenantId)
            .execute();
        }
      } else {
        // Advance to next step
        await trx
          .updateTable('project_approvals')
          .set({
            current_step: approval.current_step + 1,
            status: 'in_progress',
            updated_at: new Date(),
          })
          .where('id', '=', approvalId)
          .where('tenant_id', '=', tenantId)
          .execute();
      }
    }

    return { success: true, status: decision };
  }
}
