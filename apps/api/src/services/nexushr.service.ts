import { db, withTenant } from '../db/client.js';

export class NexusHRService {
  // ─── CORE HR ───────────────────────────────────────────────────────────────

  static async getPeople(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_people')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('first_name', 'asc')
        .execute();
    });
  }

  static async createPerson(tenantId: string, data: any) {
    return withTenant(tenantId, async (trx) => {
      const [person] = await trx
        .insertInto('hr_people')
        .values({
          tenant_id: tenantId,
          first_name: data.first_name,
          last_name: data.last_name,
          preferred_name: data.preferred_name || null,
          date_of_birth: data.date_of_birth ? new Date(data.date_of_birth) : null,
          gender: data.gender || null,
          personal_email: data.personal_email || null,
          personal_phone: data.personal_phone || null,
          national_identifiers: JSON.stringify(data.national_identifiers || {}) as any,
          emergency_contacts: JSON.stringify(data.emergency_contacts || []) as any,
          avatar_url: data.avatar_url || null,
        })
        .returningAll()
        .execute();
      return person;
    });
  }

  static async getEmployments(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      // Join employments with people and legal entities
      return await trx
        .selectFrom('hr_employments')
        .innerJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .innerJoin('hr_legal_entities', 'hr_legal_entities.id', 'hr_employments.legal_entity_id')
        .select([
          'hr_employments.id as employment_id',
          'hr_employments.person_id',
          'hr_employments.legal_entity_id',
          'hr_employments.status',
          'hr_employments.employment_type',
          'hr_employments.start_date',
          'hr_employments.end_date',
          'hr_people.first_name',
          'hr_people.last_name',
          'hr_people.personal_email',
          'hr_legal_entities.legal_name as legal_entity_name',
          'hr_legal_entities.country_code'
        ])
        .where('hr_employments.tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async createEmployment(tenantId: string, data: any) {
    return withTenant(tenantId, async (trx) => {
      const [emp] = await trx
        .insertInto('hr_employments')
        .values({
          tenant_id: tenantId,
          person_id: data.person_id,
          legal_entity_id: data.legal_entity_id,
          status: data.status || 'ACTIVE',
          employment_type: data.employment_type || 'FULL_TIME',
          start_date: new Date(data.start_date),
          end_date: data.end_date ? new Date(data.end_date) : null,
        })
        .returningAll()
        .execute();

      // Create initial effective record
      await trx
        .insertInto('hr_employment_effective_records')
        .values({
          tenant_id: tenantId,
          employment_id: emp.id,
          effective_date: new Date(data.start_date),
          job_title: data.job_title || 'Officer',
          department_id: data.department_id || null,
          location_id: data.location_id || null,
          cost_center_id: data.cost_center_id || null,
          manager_id: data.manager_id || null,
          change_reason: 'NEW_HIRE',
        })
        .execute();

      // Create initial compensation record
      await trx
        .insertInto('hr_compensations')
        .values({
          tenant_id: tenantId,
          employment_id: emp.id,
          effective_date: new Date(data.start_date),
          base_salary: Number(data.base_salary || 0),
          currency: data.currency || 'TZS',
          pay_frequency: data.pay_frequency || 'MONTHLY',
        })
        .execute();

      return emp;
    });
  }

  static async getOrgChart(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      // Get all active employments with their latest effective record
      const rows = await trx
        .selectFrom('hr_employments')
        .innerJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .leftJoin('hr_employment_effective_records', (join) =>
          join
            .onRef('hr_employment_effective_records.employment_id', '=', 'hr_employments.id')
            .on('hr_employment_effective_records.end_date', 'is', null)
        )
        .select([
          'hr_employments.id as id',
          'hr_people.first_name',
          'hr_people.last_name',
          'hr_employment_effective_records.job_title',
          'hr_employment_effective_records.manager_id as parent_id',
          'hr_employment_effective_records.department_id'
        ])
        .where('hr_employments.tenant_id', '=', tenantId)
        .where('hr_employments.status', '=', 'ACTIVE')
        .execute();

      return rows.map(r => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        title: r.job_title || 'Officer',
        parent_id: r.parent_id || null,
        department: r.department_id || null
      }));
    });
  }

  // ─── WORKFLOWS ─────────────────────────────────────────────────────────────

  static async getWorkflowDefinitions(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_workflow_definitions')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async getWorkflowCases(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const cases = await trx
        .selectFrom('hr_workflow_cases')
        .innerJoin('hr_workflow_definitions', 'hr_workflow_definitions.id', 'hr_workflow_cases.definition_id')
        .select([
          'hr_workflow_cases.id',
          'hr_workflow_cases.status',
          'hr_workflow_cases.started_at',
          'hr_workflow_cases.completed_at',
          'hr_workflow_definitions.name as workflow_name',
          'hr_workflow_definitions.category',
          'hr_workflow_cases.subject_id',
          'hr_workflow_cases.subject_type'
        ])
        .where('hr_workflow_cases.tenant_id', '=', tenantId)
        .execute();

      // Fetch tasks for these cases
      const caseIds = cases.map(c => c.id);
      let tasks: any[] = [];
      if (caseIds.length > 0) {
        tasks = await trx
          .selectFrom('hr_workflow_tasks')
          .selectAll()
          .where('case_id', 'in', caseIds)
          .orderBy('created_at', 'asc')
          .execute();
      }

      return cases.map(c => ({
        ...c,
        tasks: tasks.filter(t => t.case_id === c.id)
      }));
    });
  }

  static async createWorkflowCase(tenantId: string, data: any) {
    return withTenant(tenantId, async (trx) => {
      // 1. Get definition
      const def = await trx
        .selectFrom('hr_workflow_definitions')
        .selectAll()
        .where('id', '=', data.definition_id)
        .executeTakeFirstOrThrow();

      // 2. Get stages
      const stages = await trx
        .selectFrom('hr_workflow_stages')
        .selectAll()
        .where('definition_id', '=', def.id)
        .orderBy('sort_order', 'asc')
        .execute();

      const firstStage = stages[0];

      // 3. Create case
      const [wfCase] = await trx
        .insertInto('hr_workflow_cases')
        .values({
          tenant_id: tenantId,
          definition_id: def.id,
          subject_id: data.subject_id,
          subject_type: data.subject_type,
          current_stage_id: firstStage?.id || null,
          status: 'IN_PROGRESS',
        })
        .returningAll()
        .execute();

      // 4. Create tasks for all stages
      if (stages.length > 0) {
        await trx
          .insertInto('hr_workflow_tasks')
          .values(stages.map(s => ({
            tenant_id: tenantId,
            case_id: wfCase.id,
            stage_id: s.id,
            name: s.name,
            status: s.id === firstStage.id ? 'PENDING' : 'PENDING', // All start pending
            due_date: s.sla_hours ? new Date(Date.now() + s.sla_hours * 60 * 60 * 1000) : null
          })))
          .execute();
      }

      return wfCase;
    });
  }

  static async completeWorkflowTask(tenantId: string, taskId: string, notes?: string) {
    return withTenant(tenantId, async (trx) => {
      const task = await trx
        .selectFrom('hr_workflow_tasks')
        .selectAll()
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('hr_workflow_tasks')
        .set({
          status: 'COMPLETED',
          completed_at: new Date(),
          notes: notes || null
        })
        .where('id', '=', taskId)
        .execute();

      // Check if all tasks in the case are completed
      const remaining = await trx
        .selectFrom('hr_workflow_tasks')
        .select('id')
        .where('case_id', '=', task.case_id)
        .where('status', '=', 'PENDING')
        .execute();

      if (remaining.length === 0) {
        // Complete the case
        await trx
          .updateTable('hr_workflow_cases')
          .set({
            status: 'COMPLETED',
            completed_at: new Date()
          })
          .where('id', '=', task.case_id)
          .execute();
      }

      return { success: true };
    });
  }

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────────

  static async getDocuments(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_documents')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async getDocumentTemplates(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_document_templates')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async getAssets(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_assets')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  // ─── PAYROLL ───────────────────────────────────────────────────────────────

  static async getPayrollRuns(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_payroll')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('period_year', 'desc')
        .orderBy('period_month', 'desc')
        .execute();
    });
  }

  static async runPayroll(tenantId: string, data: any) {
    return withTenant(tenantId, async (trx) => {
      // Simulate gross-to-net calculations for all active employments
      const employments = await trx
        .selectFrom('hr_employments')
        .innerJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .leftJoin('hr_compensations', (join) =>
          join
            .onRef('hr_compensations.employment_id', '=', 'hr_employments.id')
            .on('hr_compensations.end_date', 'is', null)
        )
        .select([
          'hr_employments.id as employment_id',
          'hr_people.first_name',
          'hr_people.last_name',
          'hr_compensations.base_salary'
        ])
        .where('hr_employments.tenant_id', '=', tenantId)
        .where('hr_employments.status', '=', 'ACTIVE')
        .execute();

      const results = [];
      for (const emp of employments) {
        const basic = Number(emp.base_salary || 1200000);
        const allowances = Math.round(basic * 0.15); // mock allowance (15%)
        const gross = basic + allowances;
        
        // TZ PAYE brackets
        let paye = 0;
        if (gross >= 1000000) paye = Math.round((gross - 1000000) * 0.30 + 128000);
        else if (gross >= 760000) paye = Math.round((gross - 760000) * 0.25 + 68000);
        else if (gross >= 520000) paye = Math.round((gross - 520000) * 0.20 + 20000);
        else if (gross >= 270000) paye = Math.round((gross - 270000) * 0.08);

        const nssf = Math.round(basic * 0.10); // 10% NSSF
        const deductions = paye + nssf;

        // Check if payroll record already exists
        const existing = await trx
          .selectFrom('hr_payroll')
          .select('id')
          .where('tenant_id', '=', tenantId)
          .where('user_id', '=', emp.employment_id) // using user_id field for employment reference in migration
          .where('period_month', '=', Number(data.month))
          .where('period_year', '=', Number(data.year))
          .executeTakeFirst();

        if (existing) {
          await trx
            .updateTable('hr_payroll')
            .set({
              basic_pay: basic,
              allowances: allowances,
              deductions: deductions,
              status: 'PAID',
              paid_at: new Date(),
              updated_at: new Date()
            })
            .where('id', '=', existing.id)
            .execute();
        } else {
          await trx
            .insertInto('hr_payroll')
            .values({
              tenant_id: tenantId,
              user_id: emp.employment_id, // maps to employment
              period_month: Number(data.month),
              period_year: Number(data.year),
              basic_pay: basic,
              allowances: allowances,
              deductions: deductions,
              status: 'PAID',
              paid_at: new Date()
            })
            .execute();
        }

        results.push({
          employee: `${emp.first_name} ${emp.last_name}`,
          basic,
          allowances,
          deductions,
          net: gross - deductions
        });
      }

      return { success: true, count: results.length, details: results };
    });
  }

  // ─── PERFORMANCE & WELLNESS ────────────────────────────────────────────────

  static async getGoals(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_goals')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async createGoal(tenantId: string, data: any) {
    return withTenant(tenantId, async (trx) => {
      const [goal] = await trx
        .insertInto('hr_goals')
        .values({
          tenant_id: tenantId,
          owner_id: data.owner_id,
          parent_goal_id: data.parent_goal_id || null,
          title: data.title,
          description: data.description || null,
          goal_type: data.goal_type || 'OKR_OBJECTIVE',
          target_value: Number(data.target_value || 100),
          current_value: Number(data.current_value || 0),
          unit: data.unit || '%',
          weight: Number(data.weight || 1),
          due_date: data.due_date ? new Date(data.due_date) : null,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();
      return goal;
    });
  }

  static async checkInGoal(tenantId: string, goalId: string, data: any) {
    return withTenant(tenantId, async (trx) => {
      // 1. Create check-in
      await trx
        .insertInto('hr_goal_checkins')
        .values({
          tenant_id: tenantId,
          goal_id: goalId,
          current_value: Number(data.current_value),
          status: data.status || 'ACTIVE',
          comment: data.comment || null,
          recorded_by: data.recorded_by || null
        })
        .execute();

      // 2. Update goal
      await trx
        .updateTable('hr_goals')
        .set({
          current_value: Number(data.current_value),
          status: data.status || 'ACTIVE',
          updated_at: new Date()
        })
        .where('id', '=', goalId)
        .execute();

      return { success: true };
    });
  }

  static async getReviewCycles(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_review_cycles')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async getSurveys(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const instances = await trx
        .selectFrom('hr_survey_instances')
        .innerJoin('hr_survey_templates', 'hr_survey_templates.id', 'hr_survey_instances.template_id')
        .select([
          'hr_survey_instances.id',
          'hr_survey_instances.status',
          'hr_survey_instances.ends_at',
          'hr_survey_templates.title',
          'hr_survey_templates.description',
          'hr_survey_templates.questions',
          'hr_survey_templates.is_anonymous'
        ])
        .where('hr_survey_instances.tenant_id', '=', tenantId)
        .execute();

      return instances;
    });
  }

  static async submitSurvey(tenantId: string, instanceId: string, answers: any) {
    return withTenant(tenantId, async (trx) => {
      await trx
        .insertInto('hr_survey_responses')
        .values({
          tenant_id: tenantId,
          instance_id: instanceId,
          answers: JSON.stringify(answers) as any
        })
        .execute();
      return { success: true };
    });
  }
}
