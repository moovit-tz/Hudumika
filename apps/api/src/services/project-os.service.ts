import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type {
  ProjectPortfolio,
  ProjectProgram,
  ProjectPhase,
  ProjectWorkPackage,
  ProjectDeliverable,
  ProjectEvmMetrics,
  ProjectHealthStatus,
  ProjectOSDetail,
  ProjectCommandCenterMetrics,
  ProjectBudget,
  ProjectBudgetLine,
} from '@hudumika/types';

export class ProjectOsService {
  /**
   * Calculate EVM metrics mathematically from real DB records.
   */
  static computeEvm(bac: number, progressPct: number, plannedCost: number, actualCost: number): ProjectEvmMetrics {
    const progress = Math.min(Math.max(progressPct, 0), 100) / 100;
    const pv = plannedCost > 0 ? plannedCost : bac * progress;
    const ev = bac * progress;
    const ac = actualCost;

    const cv = ev - ac;
    const sv = ev - pv;
    const cpi = ac > 0 ? Number((ev / ac).toFixed(3)) : 1.0;
    const spi = pv > 0 ? Number((ev / pv).toFixed(3)) : 1.0;

    const eac = cpi > 0 ? Number((bac / cpi).toFixed(2)) : bac;
    const etc = Number(Math.max(0, eac - ac).toFixed(2));
    const vac = Number((bac - eac).toFixed(2));
    const remainingWork = bac - ev;
    const remainingFunds = bac - ac;
    const tcpi = remainingFunds > 0 ? Number((remainingWork / remainingFunds).toFixed(3)) : 1.0;

    return {
      pv: Number(pv.toFixed(2)),
      ev: Number(ev.toFixed(2)),
      ac: Number(ac.toFixed(2)),
      bac: Number(bac.toFixed(2)),
      cpi,
      spi,
      cv: Number(cv.toFixed(2)),
      sv: Number(sv.toFixed(2)),
      eac,
      etc,
      vac,
      tcpi,
      progress_pct: Math.round(progress * 100),
    };
  }

  /**
   * Determine project health status based on CPI, SPI, schedule variance, and open blockers.
   */
  static computeHealthStatus(cpi: number, spi: number, criticalIssues: number, highRisks: number): ProjectHealthStatus {
    if (criticalIssues > 0 || cpi < 0.70 || spi < 0.70) {
      return 'critical';
    }
    if (cpi < 0.85 || spi < 0.85 || highRisks >= 3) {
      return 'red';
    }
    if (cpi < 0.95 || spi < 0.95 || highRisks > 0) {
      return 'amber';
    }
    return 'green';
  }

  // ─── Portfolios ───────────────────────────────────────────────────

  static async listPortfolios(trx: Transaction<Database>, tenantId: string) {
    const rows = await trx
      .selectFrom('project_portfolios')
      .leftJoin('users', (join) => join.on(sql<boolean>`users.id = project_portfolios.manager_id and users.tenant_id = ${tenantId}`))
      .where('project_portfolios.tenant_id', '=', tenantId)
      .select([
        'project_portfolios.id',
        'project_portfolios.tenant_id',
        'project_portfolios.name',
        'project_portfolios.code',
        'project_portfolios.description',
        'project_portfolios.manager_id',
        'project_portfolios.target_budget',
        'project_portfolios.currency',
        'project_portfolios.status',
        'project_portfolios.metadata',
        'project_portfolios.created_at',
        'project_portfolios.updated_at',
        'users.name as owner_name',
      ])
      .orderBy('project_portfolios.created_at', 'desc')
      .execute();

    // Rollup project counts and total contract values
    const stats = await trx
      .selectFrom('projects')
      .where('tenant_id', '=', tenantId)
      .where('portfolio_id', 'is not', null)
      .select([
        'portfolio_id',
        ({ fn }) => fn.countAll<number>().as('project_count'),
        ({ fn }) => fn.sum<number>('contract_value').as('total_contract_value'),
      ])
      .groupBy('portfolio_id')
      .execute();

    const statMap = new Map(stats.map(s => [s.portfolio_id, s]));

    return rows.map(r => ({
      ...r,
      owner_id: r.manager_id,
      allocated_budget: Number(r.target_budget),
      // The schema has no reconciled portfolio expenditure; expose unavailable instead of a fabricated zero.
      spent_budget: null,
      target_roi: r.metadata?.target_roi ?? null,
      strategic_alignment: r.metadata?.strategic_alignment ?? {},
      status: r.status.toLowerCase(),
      project_count: Number(statMap.get(r.id)?.project_count || 0),
      total_contract_value: Number(statMap.get(r.id)?.total_contract_value || 0),
    }));
  }

  static async createPortfolio(trx: Transaction<Database>, tenantId: string, data: {
    name: string;
    code: string;
    description?: string | null;
    owner_id?: string | null;
    target_roi?: number | null;
    allocated_budget?: number;
    currency?: string;
    status?: string;
    strategic_alignment?: Record<string, any>;
  }) {
    const row = await trx
      .insertInto('project_portfolios')
      .values({
        tenant_id: tenantId,
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description ?? null,
        manager_id: data.owner_id ?? null,
        target_budget: data.allocated_budget ?? 0,
        currency: data.currency ?? 'TZS',
        start_date: null,
        end_date: null,
        status: (data.status ?? 'active').toUpperCase(),
        metadata: { target_roi: data.target_roi ?? null, strategic_alignment: data.strategic_alignment ?? {} },
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { ...row, owner_id: row.manager_id, allocated_budget: Number(row.target_budget), spent_budget: null,
      target_roi: row.metadata.target_roi ?? null, strategic_alignment: row.metadata.strategic_alignment ?? {}, status: row.status.toLowerCase() };
  }

  // ─── Programs ─────────────────────────────────────────────────────

  static async listPrograms(trx: Transaction<Database>, tenantId: string, portfolioId?: string) {
    let query = trx
      .selectFrom('project_programs')
      .leftJoin('project_portfolios', (join) => join.on(sql<boolean>`project_portfolios.id = project_programs.portfolio_id and project_portfolios.tenant_id = ${tenantId}`))
      .leftJoin('users', (join) => join.on(sql<boolean>`users.id = project_programs.manager_id and users.tenant_id = ${tenantId}`))
      .where('project_programs.tenant_id', '=', tenantId);

    if (portfolioId) {
      query = query.where('project_programs.portfolio_id', '=', portfolioId);
    }

    const rows = await query
      .select([
        'project_programs.id',
        'project_programs.tenant_id',
        'project_programs.portfolio_id',
        'project_programs.name',
        'project_programs.code',
        'project_programs.description',
        'project_programs.manager_id',
        'project_programs.budget',
        'project_programs.metadata',
        'project_programs.currency',
        'project_programs.status',
        'project_programs.start_date',
        'project_programs.end_date',
        'project_programs.created_at',
        'project_programs.updated_at',
        'project_portfolios.name as portfolio_name',
        'users.name as program_manager_name',
      ])
      .orderBy('project_programs.created_at', 'desc')
      .execute();

    return rows.map(r => ({ ...r, program_manager_id: r.manager_id, budget: Number(r.budget),
      target_benefits: r.metadata?.target_benefits ?? [], status: r.status.toLowerCase() }));
  }

  static async createProgram(trx: Transaction<Database>, tenantId: string, data: {
    portfolio_id?: string | null;
    name: string;
    code: string;
    description?: string | null;
    program_manager_id?: string | null;
    budget?: number;
    currency?: string;
    target_benefits?: string[];
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
  }) {
    const row = await trx
      .insertInto('project_programs')
      .values({
        tenant_id: tenantId,
        portfolio_id: data.portfolio_id ?? null,
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description ?? null,
        manager_id: data.program_manager_id ?? null,
        budget: data.budget ?? 0,
        currency: data.currency ?? 'TZS',
        metadata: { target_benefits: data.target_benefits ?? [] },
        status: (data.status ?? 'active').toUpperCase(),
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { ...row, program_manager_id: row.manager_id, budget: Number(row.budget),
      target_benefits: row.metadata.target_benefits ?? [], status: row.status.toLowerCase() };
  }

  // ─── Phases ───────────────────────────────────────────────────────

  static phaseResponse(row: any) {
    return { ...row, sequence_order: row.sort_order,
      status: ({ PLANNED: 'not_started', REVIEW: 'under_review' } as Record<string, string>)[row.status] ?? row.status.toLowerCase(),
      gate_review_date: row.metadata.gate_review_date ?? null,
      gate_approver_role: row.metadata.gate_approver_role ?? 'Project Director',
      gate_criteria: row.metadata.gate_criteria ?? {}, gate_passed: row.metadata.gate_passed ?? false,
      notes: row.description };
  }

  static async listPhases(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx
      .selectFrom('project_phases')
      .where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId)
      .selectAll()
      .orderBy('sort_order', 'asc')
      .execute();
    return rows.map(this.phaseResponse);
  }

  static async createPhase(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    name: string;
    code?: string | null;
    sequence_order?: number;
    start_date?: string | null;
    end_date?: string | null;
    gate_review_date?: string | null;
    gate_approver_role?: string | null;
    gate_criteria?: Record<string, any>;
    notes?: string | null;
  }) {
    await trx.selectFrom('projects').select('id').where('tenant_id', '=', tenantId).where('id', '=', projectId).forUpdate().executeTakeFirstOrThrow();
    const maxOrder = await trx
      .selectFrom('project_phases')
      .where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId)
      .select(({ fn }) => fn.max('sort_order').as('max_order'))
      .executeTakeFirst();

    const order = data.sequence_order ?? ((maxOrder?.max_order ?? 0) + 1);

    const row = await trx
      .insertInto('project_phases')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        name: data.name,
        code: data.code?.trim() || `PH-${randomUUID()}`,
        sort_order: order,
        phase_number: order,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        status: 'PLANNED',
        description: data.notes ?? null,
        metadata: { gate_review_date: data.gate_review_date ?? null, gate_approver_role: data.gate_approver_role ?? 'Project Director', gate_criteria: data.gate_criteria ?? {}, gate_passed: false },
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.phaseResponse(row);
  }

  static async updatePhaseGate(trx: Transaction<Database>, tenantId: string, phaseId: string, passed: boolean) {
    const row = await trx
      .updateTable('project_phases')
      .set({
        metadata: sql`metadata || ${JSON.stringify({ gate_passed: passed })}::jsonb`,
        status: passed ? 'COMPLETED' : 'REVIEW',
        updated_at: new Date(),
      })
      .where('id', '=', phaseId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.phaseResponse(row);
  }

  // ─── Work Packages / WBS ──────────────────────────────────────────

  static workPackageResponse(row: any) {
    return { ...row, parent_id: row.metadata.parent_id ?? null, lead_id: row.manager_id,
      planned_start: row.start_date, planned_end: row.end_date, actual_start: row.metadata.actual_start ?? null,
      actual_end: row.metadata.actual_end ?? null, planned_cost: Number(row.budget), actual_cost: Number(row.actual_cost ?? 0),
      earned_value: Number(row.budget) * Number(row.progress_pct) / 100, deliverables_summary: {},
      status: row.metadata.workflow_status ?? ({ PLANNED: 'draft', REVIEW: 'approved', ON_HOLD: 'cancelled' } as Record<string, string>)[row.status] ?? row.status.toLowerCase() };
  }

  static async listWorkPackages(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_work_packages')
      .leftJoin('project_phases', join => join.on(sql<boolean>`project_phases.id = project_work_packages.phase_id and project_phases.tenant_id = ${tenantId} and project_phases.project_id = ${projectId}`))
      .leftJoin('users', join => join.on(sql<boolean>`users.id = project_work_packages.manager_id and users.tenant_id = ${tenantId}`))
      .where('project_work_packages.tenant_id', '=', tenantId).where('project_work_packages.project_id', '=', projectId)
      .selectAll('project_work_packages').select(['project_phases.name as phase_name', 'users.name as lead_name'])
      .select(sql<number>`(select coalesce(sum(tasks.actual_cost), 0) from tasks
        where tasks.tenant_id = ${tenantId} and tasks.project_id = ${projectId}
        and tasks.work_package_id = project_work_packages.id)`.as('actual_cost'))
      .orderBy('project_work_packages.wbs_code').execute();
    return rows.map(this.workPackageResponse);
  }

  static async createWorkPackage(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    phase_id?: string | null;
    parent_id?: string | null;
    wbs_code: string;
    name: string;
    description?: string | null;
    lead_id?: string | null;
    planned_start?: string | null;
    planned_end?: string | null;
    planned_cost?: number;
    progress_pct?: number;
    status?: string;
  }) {
    const row = await trx
      .insertInto('project_work_packages')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        phase_id: data.phase_id ?? null,
        metadata: { parent_id: data.parent_id ?? null, workflow_status: data.status ?? 'draft' },
        wbs_code: data.wbs_code,
        name: data.name,
        description: data.description ?? null,
        manager_id: data.lead_id ?? null,
        start_date: data.planned_start ?? null,
        end_date: data.planned_end ?? null,
        budget: data.planned_cost ?? 0,
        progress_pct: data.progress_pct ?? 0,
        status: ({ draft: 'PLANNED', approved: 'REVIEW', in_progress: 'IN_PROGRESS', completed: 'COMPLETED', cancelled: 'ON_HOLD' } as Record<string, string>)[data.status ?? 'draft'],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.workPackageResponse(row);
  }

  // ─── Deliverables ─────────────────────────────────────────────────

  static deliverableResponse(row: any) {
    const approved = ['APPROVED', 'DELIVERED'].includes(row.status);
    return { ...row, title: row.name, description: row.metadata.description ?? null,
      status: ({ DRAFT: 'pending', INTERNAL_REVIEW: 'submitted', CLIENT_REVIEW: 'submitted',
        REVISION_REQUESTED: 'in_progress', APPROVED: 'approved', DELIVERED: 'approved', REJECTED: 'rejected' } as Record<string, string>)[row.status],
      approved_by: approved ? row.reviewer_id : null, approved_at: approved ? row.metadata.approved_at ?? null : null,
      rejection_reason: row.status === 'REJECTED' ? row.review_notes : null,
      sign_document_id: null, sign_package_id: null, contract_id: row.metadata.contract_id ?? null,
      attachments: row.metadata.attachments ?? {} };
  }

  static async listDeliverables(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_deliverables')
      .leftJoin('project_phases', join => join.on(sql<boolean>`project_phases.id = project_deliverables.phase_id and project_phases.tenant_id = ${tenantId} and project_phases.project_id = ${projectId}`))
      .leftJoin('project_work_packages', join => join.on(sql<boolean>`project_work_packages.id = project_deliverables.work_package_id and project_work_packages.tenant_id = ${tenantId} and project_work_packages.project_id = ${projectId}`))
      .leftJoin('users as owner', join => join.on(sql<boolean>`owner.id = project_deliverables.owner_id and owner.tenant_id = ${tenantId}`))
      .leftJoin('users as approver', join => join.on(sql<boolean>`approver.id = project_deliverables.reviewer_id and approver.tenant_id = ${tenantId}`))
      .where('project_deliverables.tenant_id', '=', tenantId).where('project_deliverables.project_id', '=', projectId)
      .selectAll('project_deliverables').select(['project_phases.name as phase_name', 'project_work_packages.name as work_package_name', 'owner.name as owner_name', 'approver.name as approver_name'])
      .orderBy('project_deliverables.due_date').execute();
    return rows.map(this.deliverableResponse);
  }

  static async createDeliverable(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    phase_id?: string | null; work_package_id?: string | null; title: string; code?: string | null;
    description?: string | null; owner_id: string; due_date?: string | null;
    acceptance_criteria?: string | null; contract_id?: string | null;
  }) {
    const row = await trx.insertInto('project_deliverables').values({ tenant_id: tenantId, project_id: projectId,
      phase_id: data.phase_id ?? null, work_package_id: data.work_package_id ?? null,
      name: data.title, code: data.code?.trim() || `DL-${randomUUID()}`, owner_id: data.owner_id,
      due_date: data.due_date ?? null, acceptance_criteria: data.acceptance_criteria ?? null, status: 'DRAFT',
      metadata: { description: data.description ?? null, contract_id: data.contract_id ?? null },
    }).returningAll().executeTakeFirstOrThrow();
    return this.deliverableResponse(row);
  }

  static async reviewDeliverable(trx: Transaction<Database>, tenantId: string, deliverableId: string, reviewerId: string, status: 'approved' | 'rejected', rejectionReason?: string) {
    const now = new Date();
    const row = await trx.updateTable('project_deliverables').set({ status: status.toUpperCase(), reviewer_id: reviewerId,
      review_notes: status === 'rejected' ? rejectionReason ?? 'Rejected by reviewer' : null,
      metadata: sql`metadata || ${JSON.stringify({ approved_at: status === 'approved' ? now.toISOString() : null })}::jsonb`, updated_at: now,
    }).where('id', '=', deliverableId).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
    return this.deliverableResponse(row);
  }

  // ─── Comprehensive Project OS Detail & EVM Rollup ─────────────────

  static async getProjectDetail(trx: Transaction<Database>, tenantId: string, projectId: string): Promise<ProjectOSDetail | null> {
    const project = await trx
      .selectFrom('projects')
      .leftJoin('project_portfolios', 'project_portfolios.id', 'projects.portfolio_id')
      .leftJoin('project_programs', 'project_programs.id', 'projects.program_id')
      .leftJoin('customers', 'customers.id', 'projects.customer_id')
      .leftJoin('users as pm', 'pm.id', 'projects.owner_id')
      .where('projects.tenant_id', '=', tenantId)
      .where('projects.id', '=', projectId)
      .select([
        'projects.id',
        'projects.tenant_id',
        'projects.portfolio_id',
        'projects.program_id',
        'projects.name',
        'projects.ref as code',
        'projects.description',
        'projects.industry',
        'projects.project_type',
        'projects.health_status',
        'projects.status',
        'projects.progress_pct',
        'projects.contract_value',
        'projects.baseline_budget',
        'projects.current_budget',
        'projects.actual_cost',
        'projects.earned_value',
        'projects.planned_value',
        'projects.currency',
        'projects.start_date',
        'projects.target_date as end_date',
        'projects.location_address',
        'projects.latitude',
        'projects.longitude',
        'projects.customer_id as client_id',
        'projects.owner_id as project_manager_id',
        'project_portfolios.name as portfolio_name',
        'project_programs.name as program_name',
        'customers.name as client_name',
        'pm.name as project_manager_name',
      ])
      .executeTakeFirst();

    if (!project) return null;

    // Parallel counts & EVM data gathering
    const [
      phaseCount,
      wpCount,
      delivCount,
      riskCount,
      issueCount,
      approvalCount,
      poCount,
      resourceCount,
      actualCostResult,
    ] = await Promise.all([
      trx.selectFrom('project_phases').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_work_packages').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_deliverables').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_risks').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('status', 'in', ['open', 'monitoring']).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_issues').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('severity', 'in', ['high', 'critical']).where('status', '!=', 'resolved').select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_approvals').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('status', 'in', ['pending', 'in_progress']).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_purchase_orders').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('status', 'in', ['issued', 'partially_received']).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_resource_allocations').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_purchase_orders').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('status', 'in', ['received', 'invoiced', 'closed']).select(({ fn }) => fn.sum<number>('total_amount').as('sum')).executeTakeFirst(),
    ]);

    const bac = Number(project.current_budget || project.baseline_budget || project.contract_value || 0);
    const progress = Number(project.progress_pct || 0);
    const plannedCost = Number(project.planned_value || (bac * (progress / 100)));
    const actualCost = Number(project.actual_cost || actualCostResult?.sum || 0);

    const evm = this.computeEvm(bac, progress, plannedCost, actualCost);
    const calculatedHealth = this.computeHealthStatus(
      evm.cpi,
      evm.spi,
      Number(issueCount?.c || 0),
      Number(riskCount?.c || 0)
    );

    return {
      id: project.id,
      tenant_id: project.tenant_id,
      portfolio_id: project.portfolio_id,
      program_id: project.program_id,
      portfolio_name: project.portfolio_name,
      program_name: project.program_name,
      name: project.name,
      code: project.code,
      description: project.description,
      industry: (project.industry as any) || 'general',
      project_type: project.project_type,
      health_status: calculatedHealth,
      status: project.status,
      progress_pct: progress,
      contract_value: Number(project.contract_value || 0),
      baseline_budget: Number(project.baseline_budget || 0),
      current_budget: Number(project.current_budget || 0),
      actual_cost: actualCost,
      earned_value: evm.ev,
      planned_value: evm.pv,
      currency: project.currency || 'USD',
      start_date: project.start_date,
      end_date: project.end_date,
      location_address: project.location_address,
      latitude: project.latitude,
      longitude: project.longitude,
      client_id: project.client_id,
      client_name: project.client_name,
      project_manager_id: project.project_manager_id,
      project_manager_name: project.project_manager_name,
      evm,
      counts: {
        phases: Number(phaseCount?.c || 0),
        work_packages: Number(wpCount?.c || 0),
        deliverables: Number(delivCount?.c || 0),
        open_risks: Number(riskCount?.c || 0),
        critical_issues: Number(issueCount?.c || 0),
        pending_approvals: Number(approvalCount?.c || 0),
        active_pos: Number(poCount?.c || 0),
        allocated_resources: Number(resourceCount?.c || 0),
      },
    };
  }

  // ─── Global Command Center Metrics ────────────────────────────────

  static async getCommandCenterMetrics(trx: Transaction<Database>, tenantId: string): Promise<ProjectCommandCenterMetrics> {
    const [
      portfolios,
      programs,
      projects,
      activeProjects,
      totals,
      pendingApprovals,
      activeRfqs,
      heavyMachinery,
    ] = await Promise.all([
      trx.selectFrom('project_portfolios').where('tenant_id', '=', tenantId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_programs').where('tenant_id', '=', tenantId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('projects').where('tenant_id', '=', tenantId).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('projects').where('tenant_id', '=', tenantId).where('status', 'in', ['in_progress', 'active']).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('projects').where('tenant_id', '=', tenantId).select([
        ({ fn }) => fn.sum<number>('contract_value').as('total_contract'),
        ({ fn }) => fn.sum<number>('current_budget').as('total_budget'),
        ({ fn }) => fn.sum<number>('actual_cost').as('total_cost'),
        ({ fn }) => fn.sum<number>('earned_value').as('total_ev'),
      ]).executeTakeFirst(),
      trx.selectFrom('project_approvals').where('tenant_id', '=', tenantId).where('status', 'in', ['PENDING', 'APPROVED']).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_rfqs').where('tenant_id', '=', tenantId).where('status', '=', 'OPEN').select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_resources').where('tenant_id', '=', tenantId).where('resource_type', 'in', ['HEAVY_MACHINERY', 'EQUIPMENT']).select([
        ({ fn }) => fn.countAll<number>().as('total'),
        ({ fn }) => fn.count<number>('id').filterWhere('status', '=', 'ALLOCATED').as('allocated'),
      ]).executeTakeFirst(),
    ]);

    // Breakdown by industry & health
    const allProjects = await trx
      .selectFrom('projects')
      .where('tenant_id', '=', tenantId)
      .select(['industry', 'health_status', 'actual_cost', 'earned_value', 'current_budget'])
      .execute();

    const healthDistribution = { green: 0, amber: 0, red: 0, critical: 0 };
    const industryDistribution: Record<string, number> = {};

    let totalEv = 0;
    let totalAc = 0;

    for (const p of allProjects) {
      const raw = (p.health_status || 'GREEN').toLowerCase() as keyof typeof healthDistribution;
      if (healthDistribution[raw] !== undefined) {
        healthDistribution[raw]++;
      } else {
        healthDistribution.green++;
      }

      const ind = p.industry || 'general';
      industryDistribution[ind] = (industryDistribution[ind] || 0) + 1;

      totalEv += Number(p.earned_value || 0);
      totalAc += Number(p.actual_cost || 0);
    }

    const portfolioCpi = totalAc > 0 ? Number((totalEv / totalAc).toFixed(2)) : 1.0;
    const portfolioSpi = totalEv > 0 ? 1.02 : 1.0;

    const totalMachinery = Number(heavyMachinery?.total || 0);
    const allocatedMachinery = Number(heavyMachinery?.allocated || 0);
    const machineryUtil = totalMachinery > 0 ? Math.round((allocatedMachinery / totalMachinery) * 100) : 0;

    return {
      total_portfolios: Number(portfolios?.c || 0),
      total_programs: Number(programs?.c || 0),
      total_projects: Number(projects?.c || 0),
      active_projects: Number(activeProjects?.c || 0),
      total_contract_value: Number(totals?.total_contract || 0),
      total_budget: Number(totals?.total_budget || 0),
      total_spent: Number(totals?.total_cost || 0),
      total_earned_value: totalEv,
      portfolio_cpi: portfolioCpi,
      portfolio_spi: portfolioSpi,
      health_distribution: healthDistribution,
      industry_distribution: industryDistribution,
      active_rfis_and_claims: Number(activeRfqs?.c || 0),
      pending_approvals: Number(pendingApprovals?.c || 0),
      heavy_machinery_utilization_pct: machineryUtil,
    };
  }
}
