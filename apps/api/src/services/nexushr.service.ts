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

  // NexusHR's own workflow engine (hr_workflow_definitions/stages/cases/tasks/
  // conditions) was removed in migration 173. It was a third engine alongside
  // the clearance workflow and Workflow Studio, with no UI, no emitters and no
  // rows in any tenant — and HR now emits domain events that Studio can act on,
  // so the capability it was meant to provide exists elsewhere.

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────────

  /**
   * Documents, with whoever they are about named.
   *
   * `person_id` and `employment_id` are both nullable, so a document can be
   * filed against nobody in particular. That is reported as unattached rather
   * than shown as a blank name, since the two mean different things to whoever
   * is looking for a missing contract.
   */
  static async getDocuments(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('hr_documents')
        .leftJoin('hr_people as dp', 'dp.id', 'hr_documents.person_id')
        .leftJoin('hr_employments', 'hr_employments.id', 'hr_documents.employment_id')
        .leftJoin('hr_people as ep', 'ep.id', 'hr_employments.person_id')
        .select([
          'hr_documents.id', 'hr_documents.person_id', 'hr_documents.employment_id',
          'hr_documents.name', 'hr_documents.type',
          'hr_documents.storage_key', 'hr_documents.status', 'hr_documents.created_at',
          'dp.first_name as p_first', 'dp.last_name as p_last',
          'ep.first_name as e_first', 'ep.last_name as e_last',
        ])
        .where('hr_documents.tenant_id', '=', tenantId)
        .orderBy('hr_documents.created_at', 'desc')
        .execute();

      const sigs = rows.length
        ? await trx.selectFrom('hr_signature_requests')
            .select(['document_id', 'status'])
            .where('tenant_id', '=', tenantId)
            .where('document_id', 'in', rows.map(r => r.id))
            .execute()
        : [];

      return rows.map(r => ({
        id: r.id, name: r.name, type: r.type, status: r.status,
        storage_key: r.storage_key, created_at: r.created_at,
        person_id: r.person_id, employment_id: r.employment_id,
        person_name: r.p_first ? `${r.p_first} ${r.p_last}` : r.e_first ? `${r.e_first} ${r.e_last}` : null,
        signature_status: sigs.find(s => s.document_id === r.id)?.status ?? null,
      }));
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

  /**
   * Company assets and who holds them.
   *
   * `assigned_to` is an employment, so the holder's name is two joins away.
   * An asset is only genuinely out if it was assigned and not yet returned —
   * a returned_date makes it available again regardless of assigned_to still
   * naming the last person who had it.
   */
  static async getAssets(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('hr_assets')
        .leftJoin('hr_employments', 'hr_employments.id', 'hr_assets.assigned_to')
        .leftJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .select([
          'hr_assets.id', 'hr_assets.name', 'hr_assets.type', 'hr_assets.serial_number',
          'hr_assets.assigned_to', 'hr_assets.assigned_date', 'hr_assets.returned_date',
          'hr_assets.condition_notes', 'hr_assets.created_at',
          'hr_people.first_name', 'hr_people.last_name',
        ])
        .where('hr_assets.tenant_id', '=', tenantId)
        .orderBy('hr_assets.name', 'asc')
        .execute();
      return rows.map(r => ({
        ...r,
        holder_name: r.first_name ? `${r.first_name} ${r.last_name}` : null,
        out: r.assigned_to != null && r.returned_date == null,
      }));
    });
  }

  static async createAsset(tenantId: string, data: any) {
    if (!data?.name?.trim()) throw new Error('name is required');
    if (!data?.serial_number?.trim()) throw new Error('serial_number is required');
    return withTenant(tenantId, trx => trx.insertInto('hr_assets').values({
      tenant_id: tenantId,
      name: String(data.name).trim(),
      type: data.type || 'OTHER',
      serial_number: String(data.serial_number).trim(),
      assigned_to: null,
      assigned_date: null,
      returned_date: null,
      condition_notes: data.condition_notes || null,
    }).returningAll().executeTakeFirstOrThrow());
  }

  /**
   * Hands an asset to someone, or takes it back when `employmentId` is null.
   *
   * Assigning an asset that is already out is refused rather than silently
   * reassigned — the previous holder would otherwise stop being recorded as
   * having it while still physically holding it.
   */
  static async assignAsset(tenantId: string, assetId: string, employmentId: string | null, when?: string) {
    return withTenant(tenantId, async (trx) => {
      const asset = await trx.selectFrom('hr_assets').selectAll()
        .where('id', '=', assetId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!asset) throw new Error('Asset not found');

      if (employmentId) {
        const emp = await trx.selectFrom('hr_employments').select('id')
          .where('id', '=', employmentId).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!emp) throw new Error('Employment not found');
        if (asset.assigned_to && !asset.returned_date) {
          throw new Error('This asset is already out — record its return before assigning it to someone else.');
        }
        return trx.updateTable('hr_assets')
          .set({ assigned_to: employmentId, assigned_date: toDateParam(when ?? new Date()),
                 returned_date: null, updated_at: new Date() })
          .where('id', '=', assetId).where('tenant_id', '=', tenantId)
          .returningAll().executeTakeFirstOrThrow();
      }

      if (!asset.assigned_to || asset.returned_date) {
        throw new Error('This asset is not currently out, so there is nothing to return.');
      }
      return trx.updateTable('hr_assets')
        .set({ returned_date: toDateParam(when ?? new Date()), updated_at: new Date() })
        .where('id', '=', assetId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
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

  /**
   * Drafts a payroll period from the contracts actually on file.
   *
   * This endpoint could not run at all: it wrote `employment_id` into
   * `hr_payroll.user_id`, which is a foreign key to `users`, so every call
   * with an active employment failed on the constraint. Fixing only that would
   * have been worse than leaving it broken, because it also invented figures —
   * a flat 1,200,000 for anyone with no agreed salary, a 15% allowance nobody
   * granted, and a `PAID` status with a `paid_at` timestamp for money that had
   * not moved.
   *
   * It now computes from real compensation only, and returns what it could not
   * compute rather than filling the gap:
   *   - no login linked  -> hr_payroll is keyed on users, so there is nowhere
   *                         to file the payslip
   *   - no agreed salary -> nothing to calculate from
   *   - non-monthly pay  -> WEEKLY/DAILY/HOURLY need period hours this does
   *                         not have
   * Rows are written as PENDING. Marking one PAID stays a separate, deliberate
   * act on the payroll screen.
   */
  static async runPayroll(tenantId: string, data: any) {
    const month = Number(data?.month), year = Number(data?.year);
    if (!month || month < 1 || month > 12) throw new Error('month must be 1-12');
    if (!year) throw new Error('year is required');

    return withTenant(tenantId, async (trx) => {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const periodEnd = `${year}-${String(month).padStart(2, '0')}-${endDay}`;

      const employments = await trx
        .selectFrom('hr_employments')
        .innerJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .select([
          'hr_employments.id as employment_id',
          'hr_people.first_name', 'hr_people.last_name', 'hr_people.user_id',
        ])
        .where('hr_employments.tenant_id', '=', tenantId)
        .where('hr_employments.status', '=', 'ACTIVE')
        .execute();
      if (employments.length === 0) return { period: { month, year }, written: 0, rows: [], skipped: [] };

      // The pay agreement in force during the period, not merely the open one.
      const comps = await trx.selectFrom('hr_compensations')
        .select(['employment_id', 'base_salary', 'currency', 'pay_frequency', 'effective_date'])
        .where('tenant_id', '=', tenantId)
        .where('employment_id', 'in', employments.map(e => e.employment_id))
        .where('effective_date', '<=', periodEnd)
        .where(eb => eb.or([eb('end_date', 'is', null), eb('end_date', '>=', periodStart)]))
        .orderBy('effective_date', 'desc')
        .execute();

      const MONTHLY_DIVISOR: Record<string, number> = { MONTHLY: 1, ANNUAL: 12, YEARLY: 12 };
      const rows: any[] = [];
      const skipped: { employee: string; reason: string }[] = [];

      for (const emp of employments) {
        const who = `${emp.first_name} ${emp.last_name}`;
        if (!emp.user_id) {
          skipped.push({ employee: who, reason: 'No login linked to this HR record — a payslip is filed against a login, so there is nowhere to put it.' });
          continue;
        }
        const comp = comps.find(c => c.employment_id === emp.employment_id);
        if (!comp) {
          skipped.push({ employee: who, reason: 'No salary agreed for this period — nothing to calculate from.' });
          continue;
        }
        const divisor = MONTHLY_DIVISOR[String(comp.pay_frequency).toUpperCase()];
        if (!divisor) {
          skipped.push({ employee: who, reason: `Paid ${comp.pay_frequency} — a monthly figure needs hours or days worked, which payroll does not hold.` });
          continue;
        }

        const basic = Math.round(Number(comp.base_salary) / divisor);

        // Allowances come from recorded components, not a percentage. With no
        // components on file the answer is zero granted, not 15% assumed.
        const components = await trx.selectFrom('hr_compensation_components')
          .select(['amount', 'is_taxable'])
          .where('tenant_id', '=', tenantId)
          .where('compensation_id', 'in',
            trx.selectFrom('hr_compensations').select('id')
              .where('tenant_id', '=', tenantId)
              .where('employment_id', '=', emp.employment_id))
          .execute();
        const allowances = components.reduce((sum, c) => sum + Number(c.amount), 0);

        const taxable = basic + components.filter(c => c.is_taxable).reduce((s, c) => s + Number(c.amount), 0);
        let paye = 0;
        if (taxable >= 1000000) paye = Math.round((taxable - 1000000) * 0.30 + 128000);
        else if (taxable >= 760000) paye = Math.round((taxable - 760000) * 0.25 + 68000);
        else if (taxable >= 520000) paye = Math.round((taxable - 520000) * 0.20 + 20000);
        else if (taxable >= 270000) paye = Math.round((taxable - 270000) * 0.08);
        const nssf = Math.round(basic * 0.10);
        const deductions = paye + nssf;

        const existing = await trx
          .selectFrom('hr_payroll')
          .select(['id', 'status'])
          .where('tenant_id', '=', tenantId)
          .where('user_id', '=', emp.user_id)
          .where('period_month', '=', month)
          .where('period_year', '=', year)
          .executeTakeFirst();

        // A payslip already marked paid is a statement that money moved. This
        // recalculation does not get to quietly restate it.
        if (existing?.status === 'PAID') {
          skipped.push({ employee: who, reason: 'Already marked paid for this period — recalculating would restate a payment that has been made.' });
          continue;
        }

        if (existing) {
          await trx.updateTable('hr_payroll')
            .set({ basic_pay: basic, allowances, deductions, status: 'PENDING', updated_at: new Date() })
            .where('id', '=', existing.id).where('tenant_id', '=', tenantId)
            .execute();
        } else {
          await trx.insertInto('hr_payroll').values({
            tenant_id: tenantId,
            user_id: emp.user_id,
            period_month: month,
            period_year: year,
            basic_pay: basic,
            allowances,
            deductions,
            status: 'PENDING',
          }).execute();
        }

        rows.push({ employee: who, currency: comp.currency, basic, allowances, deductions,
                    net: basic + allowances - deductions, paye, nssf });
      }

      return { period: { month, year }, written: rows.length, rows, skipped };
    });
  }

  // ─── PERFORMANCE & WELLNESS ────────────────────────────────────────────────

  /**
   * Goals, with whoever owns them named.
   *
   * `owner_id` is an employment, so the name is two joins away; returning the
   * raw uuid meant no screen could show a goal against a person. Progress is
   * derived from the recorded values rather than stored as a percentage, and
   * a goal whose target is zero reports no percentage at all instead of a
   * division by zero rendered as Infinity or NaN.
   */
  static async getGoals(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const goals = await trx
        .selectFrom('hr_goals')
        .leftJoin('hr_employments', 'hr_employments.id', 'hr_goals.owner_id')
        .leftJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .select([
          'hr_goals.id', 'hr_goals.owner_id', 'hr_goals.parent_goal_id', 'hr_goals.title',
          'hr_goals.description', 'hr_goals.goal_type', 'hr_goals.target_value',
          'hr_goals.current_value', 'hr_goals.unit', 'hr_goals.weight', 'hr_goals.due_date',
          'hr_goals.status', 'hr_goals.updated_at',
          'hr_people.first_name', 'hr_people.last_name',
        ])
        .where('hr_goals.tenant_id', '=', tenantId)
        .orderBy('hr_goals.created_at', 'desc')
        .execute();
      if (goals.length === 0) return [];

      const checkins = await trx.selectFrom('hr_goal_checkins')
        .select(['goal_id', 'current_value', 'comment', 'created_at'])
        .where('tenant_id', '=', tenantId)
        .where('goal_id', 'in', goals.map(g => g.id))
        .orderBy('created_at', 'desc')
        .execute();
      const latest = new Map<string, typeof checkins[number]>();
      const counts = new Map<string, number>();
      for (const ci of checkins) {
        if (!latest.has(ci.goal_id)) latest.set(ci.goal_id, ci);
        counts.set(ci.goal_id, (counts.get(ci.goal_id) ?? 0) + 1);
      }

      return goals.map(g => {
        const target = Number(g.target_value);
        const current = Number(g.current_value);
        const last = latest.get(g.id);
        return {
          ...g,
          target_value: target,
          current_value: current,
          owner_name: g.first_name ? `${g.first_name} ${g.last_name}` : null,
          // No target to measure against is not 0% progress.
          progress_pct: target > 0 ? Math.round((current / target) * 1000) / 10 : null,
          checkin_count: counts.get(g.id) ?? 0,
          last_checkin: last ? { current_value: Number(last.current_value), comment: last.comment, at: last.created_at } : null,
        };
      });
    });
  }

  static async createGoal(tenantId: string, data: any) {
    if (!data?.title?.trim()) throw new Error('title is required');
    if (!data?.owner_id) throw new Error('owner_id is required — a goal belongs to someone');
    // A target nobody set is not 100. Percent goals are the one case where the
    // scale is implied by the unit; everything else has to be stated.
    const unit = data.unit || '%';
    if (unit !== '%' && (data.target_value === undefined || data.target_value === null || data.target_value === '')) {
      throw new Error(`target_value is required when the unit is "${unit}" — there is no implied scale to measure against`);
    }
    return withTenant(tenantId, async (trx) => {
      const owner = await trx.selectFrom('hr_employments').select('id')
        .where('id', '=', data.owner_id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!owner) throw new Error('Owner employment not found');
      if (data.parent_goal_id) {
        const parent = await trx.selectFrom('hr_goals').select('id')
          .where('id', '=', data.parent_goal_id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!parent) throw new Error('Parent goal not found');
      }
      return await trx
        .insertInto('hr_goals')
        .values({
          tenant_id: tenantId,
          owner_id: data.owner_id,
          parent_goal_id: data.parent_goal_id || null,
          title: String(data.title).trim(),
          description: data.description || null,
          goal_type: data.goal_type || 'OKR_OBJECTIVE',
          target_value: Number(data.target_value ?? 100),
          current_value: Number(data.current_value || 0),
          unit,
          weight: Number(data.weight || 1),
          due_date: data.due_date ? toDateParam(data.due_date) : null,
          status: 'ACTIVE',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  /**
   * Records progress against a goal.
   *
   * The goal is looked up under this tenant first and every write is scoped to
   * it. Without that the update matched on id alone: any signed-in user could
   * overwrite the value and status of any other tenant's goal, and the
   * check-in row landed on the victim's goal stamped with the caller's
   * tenant_id. Verified against a live second tenant before this fix.
   */
  static async checkInGoal(tenantId: string, goalId: string, data: any) {
    if (data?.current_value === undefined || data.current_value === null || data.current_value === '') {
      throw new Error('current_value is required');
    }
    return withTenant(tenantId, async (trx) => {
      const goal = await trx.selectFrom('hr_goals').select(['id', 'status'])
        .where('id', '=', goalId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!goal) throw new Error('Goal not found');

      await trx
        .insertInto('hr_goal_checkins')
        .values({
          tenant_id: tenantId,
          goal_id: goalId,
          current_value: Number(data.current_value),
          status: data.status || goal.status,
          comment: data.comment || null,
          recorded_by: data.recorded_by || null,
        })
        .execute();

      await trx
        .updateTable('hr_goals')
        .set({
          current_value: Number(data.current_value),
          status: data.status || goal.status,
          updated_at: new Date(),
        })
        .where('id', '=', goalId)
        .where('tenant_id', '=', tenantId)
        .execute();

      return { success: true };
    });
  }

  /** Review cycles, with how far each one has actually got. */
  static async getReviewCycles(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const cycles = await trx
        .selectFrom('hr_review_cycles')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('start_date', 'desc')
        .execute();
      if (cycles.length === 0) return [];

      // A cycle with no review instances is a window nobody has been reviewed
      // in — worth saying, rather than showing a cycle that looks underway.
      const instances = await trx.selectFrom('hr_review_instances')
        .select(['cycle_id', 'self_rating', 'manager_rating', 'final_rating'])
        .where('tenant_id', '=', tenantId)
        .where('cycle_id', 'in', cycles.map(c => c.id))
        .execute();

      return cycles.map(c => {
        const mine = instances.filter(i => i.cycle_id === c.id);
        const finals = mine.map(i => i.final_rating).filter((r): r is number => r != null).map(Number);
        return {
          ...c,
          instance_count: mine.length,
          self_done: mine.filter(i => i.self_rating != null).length,
          manager_done: mine.filter(i => i.manager_rating != null).length,
          final_done: finals.length,
          // Only from ratings that exist. An unrated cycle has no average.
          average_final: finals.length ? Math.round((finals.reduce((a, b) => a + b, 0) / finals.length) * 100) / 100 : null,
        };
      });
    });
  }

  /** The individual reviews inside a cycle, each against a named person. */
  static async getReviewInstances(tenantId: string, cycleId: string) {
    return withTenant(tenantId, async (trx) => {
      const cycle = await trx.selectFrom('hr_review_cycles').select('id')
        .where('id', '=', cycleId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!cycle) throw new Error('Review cycle not found');
      const rows = await trx
        .selectFrom('hr_review_instances')
        .leftJoin('hr_employments', 'hr_employments.id', 'hr_review_instances.employment_id')
        .leftJoin('hr_people', 'hr_people.id', 'hr_employments.person_id')
        .leftJoin('hr_review_templates', 'hr_review_templates.id', 'hr_review_instances.template_id')
        .select([
          'hr_review_instances.id', 'hr_review_instances.employment_id',
          'hr_review_instances.self_rating', 'hr_review_instances.manager_rating',
          'hr_review_instances.final_rating', 'hr_review_instances.calibration_notes',
          'hr_people.first_name', 'hr_people.last_name',
          'hr_review_templates.name as template_name', 'hr_review_templates.rating_scale',
        ])
        .where('hr_review_instances.tenant_id', '=', tenantId)
        .where('hr_review_instances.cycle_id', '=', cycleId)
        .execute();
      return rows.map(r => ({
        ...r,
        person_name: r.first_name ? `${r.first_name} ${r.last_name}` : null,
      }));
    });
  }

  static async createReviewCycle(tenantId: string, data: any) {
    if (!data?.name?.trim()) throw new Error('name is required');
    if (!data?.start_date) throw new Error('start_date is required');
    if (!data?.end_date) throw new Error('end_date is required');
    const start = toDateParam(data.start_date), end = toDateParam(data.end_date);
    if (end < start) throw new Error('end_date cannot be before start_date');
    return withTenant(tenantId, trx => trx.insertInto('hr_review_cycles').values({
      tenant_id: tenantId,
      name: String(data.name).trim(),
      type: data.type || 'ANNUAL',
      start_date: start,
      end_date: end,
      status: data.status || 'PLANNED',
    }).returningAll().executeTakeFirstOrThrow());
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
