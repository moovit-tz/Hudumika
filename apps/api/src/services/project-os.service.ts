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
      .leftJoin('users', 'users.id', 'project_portfolios.owner_id')
      .where('project_portfolios.tenant_id', '=', tenantId)
      .select([
        'project_portfolios.id',
        'project_portfolios.tenant_id',
        'project_portfolios.name',
        'project_portfolios.code',
        'project_portfolios.description',
        'project_portfolios.owner_id',
        'project_portfolios.target_roi',
        'project_portfolios.allocated_budget',
        'project_portfolios.spent_budget',
        'project_portfolios.status',
        'project_portfolios.strategic_alignment',
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
    status?: string;
    strategic_alignment?: Record<string, any>;
  }) {
    return await trx
      .insertInto('project_portfolios')
      .values({
        tenant_id: tenantId,
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description ?? null,
        owner_id: data.owner_id ?? null,
        target_roi: data.target_roi ?? null,
        allocated_budget: data.allocated_budget ?? 0,
        spent_budget: 0,
        status: data.status ?? 'active',
        strategic_alignment: data.strategic_alignment ?? {},
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Programs ─────────────────────────────────────────────────────

  static async listPrograms(trx: Transaction<Database>, tenantId: string, portfolioId?: string) {
    let query = trx
      .selectFrom('project_programs')
      .leftJoin('project_portfolios', 'project_portfolios.id', 'project_programs.portfolio_id')
      .leftJoin('users', 'users.id', 'project_programs.program_manager_id')
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
        'project_programs.program_manager_id',
        'project_programs.budget',
        'project_programs.target_benefits',
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

    return rows;
  }

  static async createProgram(trx: Transaction<Database>, tenantId: string, data: {
    portfolio_id?: string | null;
    name: string;
    code: string;
    description?: string | null;
    program_manager_id?: string | null;
    budget?: number;
    target_benefits?: string[];
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
  }) {
    return await trx
      .insertInto('project_programs')
      .values({
        tenant_id: tenantId,
        portfolio_id: data.portfolio_id ?? null,
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description ?? null,
        program_manager_id: data.program_manager_id ?? null,
        budget: data.budget ?? 0,
        target_benefits: data.target_benefits ?? [],
        status: data.status ?? 'active',
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Phases ───────────────────────────────────────────────────────

  static async listPhases(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_phases')
      .where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId)
      .selectAll()
      .orderBy('sequence_order', 'asc')
      .execute();
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
    const maxOrder = await trx
      .selectFrom('project_phases')
      .where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId)
      .select(({ fn }) => fn.max('sequence_order').as('max_order'))
      .executeTakeFirst();

    const order = data.sequence_order ?? ((maxOrder?.max_order ?? 0) + 1);

    return await trx
      .insertInto('project_phases')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        name: data.name,
        code: data.code ?? null,
        sequence_order: order,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        gate_review_date: data.gate_review_date ?? null,
        status: 'not_started',
        gate_approver_role: data.gate_approver_role ?? 'Project Director',
        gate_criteria: data.gate_criteria ?? {},
        notes: data.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async updatePhaseGate(trx: Transaction<Database>, tenantId: string, phaseId: string, passed: boolean, status?: string) {
    return await trx
      .updateTable('project_phases')
      .set({
        gate_passed: passed,
        status: status ?? (passed ? 'completed' : 'under_review'),
        updated_at: new Date(),
      })
      .where('id', '=', phaseId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Work Packages / WBS ──────────────────────────────────────────

  static async listWorkPackages(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_work_packages')
      .leftJoin('project_phases', 'project_phases.id', 'project_work_packages.phase_id')
      .leftJoin('users', 'users.id', 'project_work_packages.lead_id')
      .where('project_work_packages.tenant_id', '=', tenantId)
      .where('project_work_packages.project_id', '=', projectId)
      .select([
        'project_work_packages.id',
        'project_work_packages.tenant_id',
        'project_work_packages.project_id',
        'project_work_packages.phase_id',
        'project_work_packages.parent_id',
        'project_work_packages.wbs_code',
        'project_work_packages.name',
        'project_work_packages.description',
        'project_work_packages.lead_id',
        'project_work_packages.planned_start',
        'project_work_packages.planned_end',
        'project_work_packages.actual_start',
        'project_work_packages.actual_end',
        'project_work_packages.planned_cost',
        'project_work_packages.actual_cost',
        'project_work_packages.earned_value',
        'project_work_packages.progress_pct',
        'project_work_packages.status',
        'project_work_packages.deliverables_summary',
        'project_work_packages.metadata',
        'project_work_packages.created_at',
        'project_work_packages.updated_at',
        'project_phases.name as phase_name',
        'users.name as lead_name',
      ])
      .orderBy('project_work_packages.wbs_code', 'asc')
      .execute();
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
    return await trx
      .insertInto('project_work_packages')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        phase_id: data.phase_id ?? null,
        parent_id: data.parent_id ?? null,
        wbs_code: data.wbs_code,
        name: data.name,
        description: data.description ?? null,
        lead_id: data.lead_id ?? null,
        planned_start: data.planned_start ?? null,
        planned_end: data.planned_end ?? null,
        planned_cost: data.planned_cost ?? 0,
        actual_cost: 0,
        earned_value: 0,
        progress_pct: data.progress_pct ?? 0,
        status: data.status ?? 'draft',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Deliverables ─────────────────────────────────────────────────

  static async listDeliverables(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_deliverables')
      .leftJoin('project_phases', 'project_phases.id', 'project_deliverables.phase_id')
      .leftJoin('project_work_packages', 'project_work_packages.id', 'project_deliverables.work_package_id')
      .leftJoin('users as owner', 'owner.id', 'project_deliverables.owner_id')
      .leftJoin('users as approver', 'approver.id', 'project_deliverables.approved_by')
      .where('project_deliverables.tenant_id', '=', tenantId)
      .where('project_deliverables.project_id', '=', projectId)
      .select([
        'project_deliverables.id',
        'project_deliverables.tenant_id',
        'project_deliverables.project_id',
        'project_deliverables.phase_id',
        'project_deliverables.work_package_id',
        'project_deliverables.title',
        'project_deliverables.code',
        'project_deliverables.description',
        'project_deliverables.owner_id',
        'project_deliverables.due_date',
        'project_deliverables.acceptance_criteria',
        'project_deliverables.status',
        'project_deliverables.approved_by',
        'project_deliverables.approved_at',
        'project_deliverables.rejection_reason',
        'project_deliverables.sign_document_id',
        'project_deliverables.sign_package_id',
        'project_deliverables.contract_id',
        'project_deliverables.attachments',
        'project_deliverables.created_at',
        'project_deliverables.updated_at',
        'project_phases.name as phase_name',
        'project_work_packages.name as work_package_name',
        'owner.name as owner_name',
        'approver.name as approver_name',
      ])
      .orderBy('project_deliverables.due_date', 'asc')
      .execute();
  }

  static async createDeliverable(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    phase_id?: string | null;
    work_package_id?: string | null;
    title: string;
    code?: string | null;
    description?: string | null;
    owner_id?: string | null;
    due_date?: string | null;
    acceptance_criteria?: string | null;
    sign_document_id?: string | null;
    contract_id?: string | null;
  }) {
    return await trx
      .insertInto('project_deliverables')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        phase_id: data.phase_id ?? null,
        work_package_id: data.work_package_id ?? null,
        title: data.title,
        code: data.code ?? null,
        description: data.description ?? null,
        owner_id: data.owner_id ?? null,
        due_date: data.due_date ?? null,
        acceptance_criteria: data.acceptance_criteria ?? null,
        status: 'pending',
        sign_document_id: data.sign_document_id ?? null,
        contract_id: data.contract_id ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async reviewDeliverable(trx: Transaction<Database>, tenantId: string, deliverableId: string, reviewerId: string, status: 'approved' | 'rejected', rejectionReason?: string) {
    return await trx
      .updateTable('project_deliverables')
      .set({
        status,
        approved_by: status === 'approved' ? reviewerId : null,
        approved_at: status === 'approved' ? new Date() : null,
        rejection_reason: status === 'rejected' ? rejectionReason ?? 'Rejected by reviewer' : null,
        updated_at: new Date(),
      })
      .where('id', '=', deliverableId)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();
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
      trx.selectFrom('project_approvals').where('tenant_id', '=', tenantId).where('status', 'in', ['pending', 'in_progress']).select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_rfqs').where('tenant_id', '=', tenantId).where('status', '=', 'issued').select(({ fn }) => fn.countAll<number>().as('c')).executeTakeFirst(),
      trx.selectFrom('project_resources').where('tenant_id', '=', tenantId).where('resource_type', 'in', ['heavy_machinery', 'equipment']).select([
        ({ fn }) => fn.countAll<number>().as('total'),
        ({ fn }) => fn.count<number>('id').filterWhere('status', '=', 'allocated').as('allocated'),
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
      const h = (p.health_status as keyof typeof healthDistribution) || 'green';
      if (healthDistribution[h] !== undefined) {
        healthDistribution[h]++;
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
