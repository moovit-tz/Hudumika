import { db, withTenant } from '../db/client.js';
import { toDateParam } from '../utils/dates.js';

export class NexusHRService {
  // ─── CORE HR ───────────────────────────────────────────────────────────────

  static async getPeople(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      return await trx
        .selectFrom('hr_people')
        .leftJoin('users', 'users.id', 'hr_people.user_id')
        .selectAll('hr_people')
        .select(['users.name as user_name', 'users.email as user_email', 'users.role as user_role', 'users.active as user_active'])
        .where('hr_people.tenant_id', '=', tenantId)
        .orderBy('hr_people.first_name', 'asc')
        .execute();
    });
  }

  /**
   * The staff roster reconciled across both person models.
   *
   * Everything the live UI shows (attendance, leave, payroll) hangs off
   * `users`; everything the richer HR tables hold (employment, compensation,
   * documents, goals) hangs off `hr_people` -> `hr_employments`. Until
   * migration 172 the two had no join, so nothing could answer "does this
   * employee have an HR record, and is their payroll consistent with their
   * contracted salary".
   *
   * Returns every login with its HR record where one is linked, plus the HR
   * records that have no login yet — an unlinked row on either side is a real
   * state worth seeing, not an error to hide.
   */
  static async getRoster(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const users = await trx
        .selectFrom('users')
        .leftJoin('hr_people', 'hr_people.user_id', 'users.id')
        .select([
          'users.id as user_id', 'users.name', 'users.email', 'users.role', 'users.active',
          'hr_people.id as person_id', 'hr_people.first_name', 'hr_people.last_name',
        ])
        .where('users.tenant_id', '=', tenantId)
        .orderBy('users.name', 'asc')
        .execute();

      const unlinkedPeople = await trx
        .selectFrom('hr_people')
        .select(['id as person_id', 'first_name', 'last_name', 'personal_email'])
        .where('tenant_id', '=', tenantId)
        .where('user_id', 'is', null)
        .orderBy('first_name', 'asc')
        .execute();

      // Employment + current compensation for BOTH sides. Restricting this to
      // linked people made a contract belonging to someone without a login
      // invisible everywhere — the record existed and no screen could show it.
      const personIds = [
        ...users.map(u => u.person_id).filter(Boolean) as string[],
        ...unlinkedPeople.map(u => u.person_id),
      ];
      const employmentRows = personIds.length
        ? await trx
            .selectFrom('hr_employments')
            .select([
              'id as employment_id', 'person_id', 'status', 'employment_type', 'start_date',
            ])
            .where('tenant_id', '=', tenantId)
            .where('person_id', 'in', personIds)
            .execute()
        : [];

      /**
       * Pay is effective-dated, so "what do they earn" only has an answer as at
       * a date. Joining the whole history and keeping whichever row arrived
       * last showed a raise that starts next month as today's salary.
       *
       * The record in force today is selected explicitly, and a raise already
       * agreed for a future date is returned separately rather than either
       * silently replacing the current figure or being hidden entirely.
       */
      const today = toDateParam(new Date());
      const comps = employmentRows.length
        ? await trx.selectFrom('hr_compensations')
            .select(['employment_id', 'base_salary', 'currency', 'pay_frequency', 'effective_date', 'end_date'])
            .where('tenant_id', '=', tenantId)
            .where('employment_id', 'in', employmentRows.map(e => e.employment_id))
            .orderBy('effective_date', 'asc')
            .execute()
        : [];
      const compsByEmployment = new Map<string, typeof comps>();
      for (const c of comps) {
        const list = compsByEmployment.get(c.employment_id);
        if (list) list.push(c); else compsByEmployment.set(c.employment_id, [c]);
      }

      const employments = employmentRows.map(e => {
        const list = compsByEmployment.get(e.employment_id) ?? [];
        const current = list.find(c => c.effective_date <= today && (c.end_date === null || c.end_date >= today));
        const upcoming = list.find(c => c.effective_date > today);
        return {
          ...e,
          base_salary: current?.base_salary ?? null,
          currency: current?.currency ?? null,
          pay_frequency: current?.pay_frequency ?? null,
          upcoming: upcoming
            ? { base_salary: upcoming.base_salary, currency: upcoming.currency,
                pay_frequency: upcoming.pay_frequency, effective_date: upcoming.effective_date }
            : null,
        };
      });
      const empByPerson = new Map(employments.map(e => [e.person_id, e]));

      return {
        roster: users.map(u => ({
          userId: u.user_id, name: u.name, email: u.email, role: u.role, active: u.active,
          personId: u.person_id,
          hrName: u.person_id ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
          employment: empByPerson.get(u.person_id as string) ?? null,
        })),
        unlinkedPeople: unlinkedPeople.map(u => ({ ...u, employment: empByPerson.get(u.person_id) ?? null })),
        // Named plainly so the UI can say what is missing rather than imply
        // everyone is fully set up.
        summary: {
          logins: users.length,
          withHrRecord: users.filter(u => u.person_id).length,
          withEmployment: users.filter(u => empByPerson.has(u.person_id as string)).length,
          hrRecordsWithoutLogin: unlinkedPeople.length,
        },
      };
    });
  }

  // ─── COMPENSATION ──────────────────────────────────────────────────────────

  /** Effective-dated pay history for one employment, newest first. */
  static async getCompensationHistory(tenantId: string, employmentId: string) {
    return withTenant(tenantId, async (trx) => {
      const emp = await trx.selectFrom('hr_employments').select('id')
        .where('id', '=', employmentId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!emp) throw new Error('Employment not found');
      return trx.selectFrom('hr_compensations').selectAll()
        .where('employment_id', '=', employmentId).where('tenant_id', '=', tenantId)
        .orderBy('effective_date', 'desc').execute();
    });
  }

  /**
   * Records a pay change from a date. The previous open record is closed the
   * day before, so the history reads as a sequence rather than overlapping
   * claims about what someone earns.
   */
  static async addCompensation(tenantId: string, employmentId: string, data: any) {
    if (data?.base_salary === undefined || data.base_salary === null || data.base_salary === '') {
      throw new Error('base_salary is required');
    }
    if (!data?.effective_date) throw new Error('effective_date is required');

    return withTenant(tenantId, async (trx) => {
      const emp = await trx.selectFrom('hr_employments').select('id')
        .where('id', '=', employmentId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!emp) throw new Error('Employment not found');

      const effective = String(data.effective_date).slice(0, 10);
      const dayBefore = new Date(effective + 'T00:00:00Z');
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const prevEnd = dayBefore.toISOString().slice(0, 10);

      await trx.updateTable('hr_compensations')
        .set({ end_date: prevEnd as any })
        .where('employment_id', '=', employmentId).where('tenant_id', '=', tenantId)
        .where('end_date', 'is', null)
        .where('effective_date', '<', effective as any)
        .execute();

      return trx.insertInto('hr_compensations').values({
        tenant_id: tenantId,
        employment_id: employmentId,
        effective_date: effective as any,
        base_salary: Number(data.base_salary),
        currency: data.currency || 'TZS',
        pay_frequency: data.pay_frequency || 'MONTHLY',
      }).returningAll().executeTakeFirstOrThrow();
    });
  }

  /**
   * What each person was paid in a period, against what their contract says.
   *
   * This is the comparison the person-model bridge exists for: payroll is
   * keyed on `users`, compensation on `hr_employments`, and until migration
   * 172 there was no join between them — the two figures could disagree
   * indefinitely with nothing able to notice.
   *
   * It never invents the missing side. A person with no contract, no payroll
   * row, a currency that differs from their payslip, or a pay frequency this
   * cannot convert is reported as exactly that, not as a variance of zero.
   */
  static async payrollVsContract(tenantId: string, month: number, year: number) {
    return withTenant(tenantId, async (trx) => {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const periodEnd = `${year}-${String(month).padStart(2, '0')}-${endDay}`;

      const payroll = await trx.selectFrom('hr_payroll as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select(['p.id as payroll_id', 'p.user_id', 'p.basic_pay', 'p.allowances', 'p.deductions',
                 'p.status', 'u.name', 'u.email'])
        .where('p.tenant_id', '=', tenantId)
        .where('p.period_month', '=', month)
        .where('p.period_year', '=', year)
        .execute();

      // Contract salary in force during the period, reached through the bridge.
      const contracts = await trx.selectFrom('hr_people as pe')
        .innerJoin('hr_employments as e', 'e.person_id', 'pe.id')
        .innerJoin('hr_compensations as c', 'c.employment_id', 'e.id')
        .select(['pe.user_id', 'c.base_salary', 'c.currency', 'c.pay_frequency',
                 'c.effective_date', 'c.end_date', 'e.status as employment_status'])
        .where('pe.tenant_id', '=', tenantId)
        .where('pe.user_id', 'is not', null)
        .where('c.effective_date', '<=', periodEnd as any)
        .where(eb => eb.or([eb('c.end_date', 'is', null), eb('c.end_date', '>=', periodStart as any)]))
        .execute();
      // A pay change partway through the period leaves two records covering it.
      // Keeping whichever the Map saw last would pick one arbitrarily and
      // report a confident variance against it, so that case is reported as
      // what it is instead.
      const contractsByUser = new Map<string, typeof contracts>();
      for (const c of contracts) {
        const list = contractsByUser.get(c.user_id as string);
        if (list) list.push(c); else contractsByUser.set(c.user_id as string, [c]);
      }

      const MONTHLY_DIVISOR: Record<string, number> = { MONTHLY: 1, ANNUAL: 12, YEARLY: 12 };

      const rows = payroll.map(p => {
        const covering = contractsByUser.get(p.user_id) ?? [];
        const contract = covering[0];
        const paid = Number(p.basic_pay);

        if (!contract) {
          return { userId: p.user_id, name: p.name, email: p.email, paid, status: p.status,
                   contracted: null, variance: null, note: 'No contract salary on file to compare against.' };
        }

        if (covering.length > 1) {
          const amounts = covering
            .map(c => `${c.currency} ${Number(c.base_salary).toLocaleString()} from ${String(c.effective_date).slice(0, 10)}`)
            .join(', ');
          return { userId: p.user_id, name: p.name, email: p.email, paid, status: p.status,
                   contracted: null, variance: null,
                   note: `Pay changed during this period (${amounts}) — there is no single contracted figure to compare one payslip against.` };
        }

        const divisor = MONTHLY_DIVISOR[String(contract.pay_frequency).toUpperCase()];
        if (!divisor) {
          return { userId: p.user_id, name: p.name, email: p.email, paid, status: p.status,
                   contracted: null, variance: null,
                   note: `Contract is paid ${contract.pay_frequency}; this comparison only converts MONTHLY and ANNUAL.` };
        }

        const expected = Number(contract.base_salary) / divisor;
        return {
          userId: p.user_id, name: p.name, email: p.email, paid, status: p.status,
          // hr_payroll records no currency, so the figures are compared as
          // like for like and labelled with the contract's currency. There is
          // no field to detect a mismatch against and no FX rate here to
          // convert with, so neither is claimed.
          contracted: expected, currency: contract.currency,
          variance: Math.round((paid - expected) * 100) / 100,
          note: null as string | null,
        };
      });

      // Contracts with nobody paid this period — the other half of the picture.
      const paidUserIds = new Set(payroll.map(p => p.user_id));
      const unpaid = [...contractsByUser.entries()]
        .filter(([userId, list]) => !paidUserIds.has(userId) && list.some(c => c.employment_status === 'ACTIVE'))
        // One entry per person, not one per pay record they happen to have.
        .map(([userId, list]) => {
          const c = list[list.length - 1];
          return { userId, contracted: Number(c.base_salary), currency: c.currency };
        });

      return {
        period: { month, year },
        rows,
        notPaidThisPeriod: unpaid,
        summary: {
          payrollRows: payroll.length,
          comparable: rows.filter(r => r.variance !== null).length,
          matching: rows.filter(r => r.variance === 0).length,
          differing: rows.filter(r => r.variance !== null && r.variance !== 0).length,
          noContract: rows.filter(r => r.contracted === null).length,
          activeContractsUnpaid: unpaid.length,
        },
      };
    });
  }

  /** Links an existing HR person record to an existing login, or clears it. */
  static async linkPersonToUser(tenantId: string, personId: string, userId: string | null) {
    return withTenant(tenantId, async (trx) => {
      // Both sides must belong to this tenant — a valid-looking id from
      // elsewhere must not become a cross-tenant join.
      const person = await trx.selectFrom('hr_people').select('id')
        .where('id', '=', personId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!person) throw new Error('Person not found');

      if (userId) {
        const user = await trx.selectFrom('users').select('id')
          .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!user) throw new Error('User not found');
      }

      return trx.updateTable('hr_people')
        .set({ user_id: userId, updated_at: new Date() })
        .where('id', '=', personId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
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
      // leftJoin, not innerJoin: an employment whose legal entity was removed
      // must appear as incomplete, not vanish from the list. A record that
      // disappears reads as "no such employee" to whoever is looking for them.
      return await trx
        .selectFrom('hr_employments')
        .innerJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .leftJoin('hr_legal_entities', 'hr_legal_entities.id', 'hr_employments.legal_entity_id')
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

  // ─── LEGAL ENTITIES ────────────────────────────────────────────────────────
  //
  // hr_employments.legal_entity_id is NOT NULL with ON DELETE RESTRICT, so no
  // employment can exist until one of these does. There was no way to create
  // one, which is why the whole employment chain was unreachable.

  static async getLegalEntities(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const entities = await trx.selectFrom('hr_legal_entities').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('legal_name', 'asc').execute();
      if (entities.length === 0) return [];

      // How many people each entity employs — so deleting one can say what it
      // would take with it rather than failing on a constraint.
      const counts = await trx.selectFrom('hr_employments')
        .select('legal_entity_id')
        .select(eb => eb.fn.countAll<string>().as('n'))
        .where('tenant_id', '=', tenantId)
        .groupBy('legal_entity_id').execute();
      const byEntity = new Map(counts.map(c => [c.legal_entity_id, Number(c.n)]));
      return entities.map(e => ({ ...e, employment_count: byEntity.get(e.id) ?? 0 }));
    });
  }

  static async createLegalEntity(tenantId: string, data: any) {
    if (!data?.legal_name) throw new Error('legal_name is required');
    if (!data?.country_code) throw new Error('country_code is required');
    return withTenant(tenantId, trx => trx.insertInto('hr_legal_entities').values({
      tenant_id: tenantId,
      legal_name: data.legal_name,
      registration_no: data.registration_no || null,
      tax_id: data.tax_id || null,
      country_code: String(data.country_code).toUpperCase(),
      currency: data.currency || 'TZS',
      registered_address: data.registered_address || null,
    }).returningAll().executeTakeFirstOrThrow());
  }

  static async createEmployment(tenantId: string, data: any) {
    // A job title is a fact about someone's contract, so it is required rather
    // than defaulted — the previous `|| 'Officer'` gave every hire a title
    // nobody agreed to, indistinguishable afterwards from a real one.
    if (!data?.person_id) throw new Error('person_id is required');
    if (!data?.legal_entity_id) throw new Error('legal_entity_id is required');
    if (!data?.start_date) throw new Error('start_date is required');
    if (!data?.job_title) throw new Error('job_title is required');

    return withTenant(tenantId, async (trx) => {
      // Both references must belong to this tenant. Without these checks a
      // valid-looking id from another workspace would attach one tenant's
      // employee to another tenant's legal entity.
      const person = await trx.selectFrom('hr_people').select('id')
        .where('id', '=', data.person_id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!person) throw new Error('Person not found');
      const entity = await trx.selectFrom('hr_legal_entities').select('id')
        .where('id', '=', data.legal_entity_id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!entity) throw new Error('Legal entity not found');
      if (data.manager_id) {
        const mgr = await trx.selectFrom('hr_employments').select('id')
          .where('id', '=', data.manager_id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!mgr) throw new Error('Manager employment not found');
      }

      const emp = await trx
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
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('hr_employment_effective_records')
        .values({
          tenant_id: tenantId,
          employment_id: emp.id,
          effective_date: new Date(data.start_date),
          job_title: data.job_title,
          department_id: data.department_id || null,
          location_id: data.location_id || null,
          cost_center_id: data.cost_center_id || null,
          manager_id: data.manager_id || null,
          change_reason: 'NEW_HIRE',
        })
        .execute();

      // Only when a salary was actually given. base_salary is NOT NULL, so the
      // old `|| 0` recorded "this person earns zero" — which reads identically
      // to a real zero and would flow into any payroll comparison built on it.
      // No salary agreed yet is an absent row, not a zero one.
      if (data.base_salary !== undefined && data.base_salary !== null && data.base_salary !== '') {
        await trx
          .insertInto('hr_compensations')
          .values({
            tenant_id: tenantId,
            employment_id: emp.id,
            effective_date: new Date(data.start_date),
            base_salary: Number(data.base_salary),
            currency: data.currency || 'TZS',
            pay_frequency: data.pay_frequency || 'MONTHLY',
          })
          .execute();
      }

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
