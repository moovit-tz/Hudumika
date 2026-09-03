import { db, withTenant } from '../db/client.js';
import { toDateParam } from '../utils/dates.js';

export class NexusHRService {
  // ─── CORE HR ───────────────────────────────────────────────────────────────

  /**
   * getPeople is gone, with hr_people itself.
   *
   * A "person" separate from a login never held a row in any tenant, while
   * every table that does hold rows — attendance, leave, goals, documents,
   * assets, payslips — keys on `users`. The separation was a model nobody
   * populated, and the roster's "linked / unlinked" distinction was therefore
   * a comparison between two empty sets.
   *
   * The staff list is GET /v1/hr/staff.
   */

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
        .select(['id as user_id', 'name', 'email', 'role', 'active', 'hire_date',
                 'basic_salary', 'pay_currency'])
        .where('tenant_id', '=', tenantId)
        .orderBy('name', 'asc')
        .execute();

      // The employment record is the contract. hr_employments never held a row
      // in any tenant, so "linked / unlinked" was a distinction between two
      // empty sets — every login showed as having no HR record because there
      // were no HR records to have.
      const contracts = users.length
        ? await trx.selectFrom('hr_contracts')
            .select(['id', 'user_id', 'contract_type', 'start_date', 'end_date'])
            .where('tenant_id', '=', tenantId)
            .orderBy('start_date', 'desc')
            .execute()
        : [];

      /**
       * Pay is effective-dated, so "what do they earn" only has an answer as at
       * a date. Keeping whichever row arrived last showed a raise that starts
       * next month as today's salary — so the record in force today is selected
       * explicitly, and one already agreed for a future date is returned
       * separately rather than replacing the current figure or being hidden.
       */
      const today = toDateParam(new Date());
      const comps = users.length
        ? await trx.selectFrom('hr_compensations')
            .select(['user_id', 'base_salary', 'currency', 'pay_frequency', 'effective_date', 'end_date'])
            .where('tenant_id', '=', tenantId)
            .orderBy('effective_date', 'asc')
            .execute()
        : [];
      const compsByUser = new Map<string, typeof comps>();
      for (const c of comps) {
        const list = compsByUser.get(c.user_id);
        if (list) list.push(c); else compsByUser.set(c.user_id, [c]);
      }
      const contractByUser = new Map<string, typeof contracts[number]>();
      for (const c of contracts) if (!contractByUser.has(c.user_id)) contractByUser.set(c.user_id, c);

      const roster = users.map(u => {
        const list = compsByUser.get(u.user_id) ?? [];
        const current = list.find(c => c.effective_date <= today && (c.end_date === null || c.end_date >= today));
        const upcoming = list.find(c => c.effective_date > today);
        const contract = contractByUser.get(u.user_id) ?? null;

        // Falls back to the salary on the person themselves, which is what the
        // payroll engine actually reads. A compensation history is the richer
        // record; its absence does not mean nobody is paid.
        const base = current?.base_salary ?? (u.basic_salary != null ? Number(u.basic_salary) : null);

        return {
          userId: u.user_id, name: u.name, email: u.email, role: u.role, active: u.active,
          employment: contract || base != null ? {
            employment_id: contract?.id ?? null,
            status: contract
              ? (contract.end_date && contract.end_date < today ? 'ENDED' : 'ACTIVE')
              : 'NO_CONTRACT',
            employment_type: contract?.contract_type ?? null,
            start_date: contract?.start_date ?? u.hire_date ?? null,
            end_date: contract?.end_date ?? null,
            base_salary: base != null ? String(base) : null,
            currency: current?.currency ?? u.pay_currency ?? null,
            pay_frequency: current?.pay_frequency ?? (base != null ? 'MONTHLY' : null),
            upcoming: upcoming
              ? { base_salary: String(upcoming.base_salary), currency: upcoming.currency,
                  pay_frequency: upcoming.pay_frequency, effective_date: upcoming.effective_date }
              : null,
          } : null,
        };
      });

      return {
        roster,
        // Named plainly so the UI can say what is missing rather than imply
        // everyone is fully set up.
        summary: {
          logins: users.length,
          withContract: roster.filter(r => r.employment?.employment_id).length,
          withPay: roster.filter(r => r.employment?.base_salary).length,
          withNeither: roster.filter(r => !r.employment).length,
        },
      };
    });
  }

  // ─── COMPENSATION ──────────────────────────────────────────────────────────

  /** Effective-dated pay history for one person, newest first. */
  static async getCompensationHistory(tenantId: string, userId: string) {
    return withTenant(tenantId, async (trx) => {
      const person = await trx.selectFrom('users').select('id')
        .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!person) throw new Error('Staff member not found');
      return trx.selectFrom('hr_compensations').selectAll()
        .where('user_id', '=', userId).where('tenant_id', '=', tenantId)
        .orderBy('effective_date', 'desc').execute();
    });
  }

  /**
   * Records a pay change from a date. The previous open record is closed the
   * day before, so the history reads as a sequence rather than overlapping
   * claims about what someone earns.
   */
  static async addCompensation(tenantId: string, userId: string, data: any) {
    if (data?.base_salary === undefined || data.base_salary === null || data.base_salary === '') {
      throw new Error('base_salary is required');
    }
    if (!data?.effective_date) throw new Error('effective_date is required');

    return withTenant(tenantId, async (trx) => {
      const person = await trx.selectFrom('users').select('id')
        .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!person) throw new Error('Staff member not found');

      const effective = String(data.effective_date).slice(0, 10);
      const dayBefore = new Date(effective + 'T00:00:00Z');
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const prevEnd = dayBefore.toISOString().slice(0, 10);

      await trx.updateTable('hr_compensations')
        .set({ end_date: prevEnd as any })
        .where('user_id', '=', userId).where('tenant_id', '=', tenantId)
        .where('end_date', 'is', null)
        .where('effective_date', '<', effective as any)
        .execute();

      const row = await trx.insertInto('hr_compensations').values({
        tenant_id: tenantId,
        user_id: userId,
        effective_date: effective as any,
        base_salary: Number(data.base_salary),
        currency: data.currency || 'TZS',
        pay_frequency: data.pay_frequency || 'MONTHLY',
      }).returningAll().executeTakeFirstOrThrow();

      // The payroll engine reads users.basic_salary, so a pay change that only
      // landed in the history would never reach a payslip. Only the record in
      // force today may move it — agreeing a raise for next month must not
      // change what this month pays.
      const today = toDateParam(new Date());
      if (effective <= today) {
        await trx.updateTable('users')
          .set({ basic_salary: String(Number(data.base_salary)),
                 pay_currency: data.currency || 'TZS', updated_at: new Date() })
          .where('id', '=', userId).where('tenant_id', '=', tenantId).execute();
      }
      return row;
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

      // Contract salary in force during the period. There is no bridge to cross
      // any more — compensation keys on the person, the same person payroll is
      // filed against, which is the disagreement this comparison exists to find.
      const contracts = await trx.selectFrom('hr_compensations as c')
        .innerJoin('users as u', 'u.id', 'c.user_id')
        .select(['c.user_id', 'c.base_salary', 'c.currency', 'c.pay_frequency',
                 'c.effective_date', 'c.end_date', 'u.active'])
        .where('c.tenant_id', '=', tenantId)
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
        // Still employed here, so a missing payslip is a gap rather than a leaver.
        .filter(([userId, list]) => !paidUserIds.has(userId) && list.some(c => c.active))
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
  /**
   * Everyone employable, for pickers that need to name a person.
   *
   * Was hr_employments joined through hr_people, which meant it returned []
   * in every tenant — so the asset-assignment picker read "Nobody has a
   * contract yet" whoever you asked. Performance.tsx had already routed around
   * it with a comment saying exactly that.
   *
   * `employment_id` stays in the shape and now carries the user id: the callers
   * use it as "the id of the person I am assigning to", and hr_assets.assigned_to
   * was itself repointed onto users in migration 201.
   */
  static async getEmployments(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('users')
        .leftJoin('hr_contracts', join => join
          .onRef('hr_contracts.user_id', '=', 'users.id')
          .on('hr_contracts.tenant_id', '=', tenantId))
        .select([
          'users.id as employment_id', 'users.id as user_id',
          'users.name', 'users.email as personal_email', 'users.active',
          'hr_contracts.contract_type as employment_type',
          'hr_contracts.start_date', 'hr_contracts.end_date',
        ])
        .where('users.tenant_id', '=', tenantId)
        .where('users.active', '=', true)
        .orderBy('users.name', 'asc')
        .execute();

      // Split for callers that still render `first_name last_name`. One name
      // field is the truth on `users`; this is a presentation split, not a
      // second model of a person's name.
      const seen = new Set<string>();
      return rows.filter(r => {
        if (seen.has(r.employment_id)) return false;
        seen.add(r.employment_id);
        return true;
      }).map(r => {
        const parts = String(r.name ?? '').trim().split(/\s+/);
        return {
          ...r,
          status: r.active ? 'ACTIVE' : 'INACTIVE',
          first_name: parts[0] ?? '',
          last_name: parts.slice(1).join(' '),
        };
      });
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
      // employment_count is gone rather than zeroed. It counted hr_employments
      // rows, and nothing links a person to a legal entity any more — so the
      // honest answer is "not known", and a hardcoded 0 would read identically
      // to an entity that genuinely employs nobody.
      return entities.map(e => ({ ...e, employment_count: null }));
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

  /**
   * createEmployment is gone. An employment record is an hr_contract now,
   * created through POST /v1/hr/staff/:id/contracts — which validates that a
   * fixed-term contract states when it ends, something hr_employments never
   * did. Keeping a second way to record the same fact is how the two models
   * came to disagree in the first place.
   */

  /**
   * getOrgChart is gone. It read hr_employments joined to hr_people and
   * hr_employment_effective_records — three tables with no rows — so it
   * returned [] in every tenant. The org chart people actually use is
   * org_chart_nodes, served by org-chart.routes.ts and drawn by OrgChart.tsx.
   */

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
        .leftJoin('users', 'users.id', 'hr_documents.user_id')
        .select([
          'hr_documents.id', 'hr_documents.user_id',
          'hr_documents.name', 'hr_documents.type',
          'hr_documents.storage_key', 'hr_documents.status', 'hr_documents.created_at',
          'hr_documents.expiry_date', 'hr_documents.approval_status',
          'hr_documents.review_notes', 'hr_documents.reviewed_by', 'hr_documents.reviewed_at',
          'hr_documents.category', 'hr_documents.is_mandatory',
          'users.name as owner_name', 'users.email as owner_email',
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

      const now = new Date();
      return rows.map(r => {
        let daysUntilExpiry: number | null = null;
        if (r.expiry_date) {
          const exp = new Date(r.expiry_date);
          daysUntilExpiry = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
          id: r.id, name: r.name, type: r.type, status: r.status,
          storage_key: r.storage_key, created_at: r.created_at,
          user_id: r.user_id,
          expiry_date: r.expiry_date,
          approval_status: r.approval_status ?? 'APPROVED',
          review_notes: r.review_notes ?? null,
          reviewed_by: r.reviewed_by ?? null,
          reviewed_at: r.reviewed_at ?? null,
          category: r.category ?? 'GENERAL',
          is_mandatory: !!r.is_mandatory,
          days_until_expiry: daysUntilExpiry,
          person_name: r.owner_name ?? null,
          person_email: r.owner_email ?? null,
          signature_status: sigs.find(s => s.document_id === r.id)?.status ?? null,
        };
      });
    });
  }

  static async reviewDocument(tenantId: string, docId: string, reviewerId: string, approvalStatus: 'APPROVED' | 'REJECTED', notes?: string) {
    return withTenant(tenantId, async (trx) => {
      const updated = await trx.updateTable('hr_documents')
        .set({
          approval_status: approvalStatus,
          review_notes: notes ?? null,
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', docId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!updated) throw new Error('Document not found.');
      return updated;
    });
  }

  static async getExpiryRadar(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      const in90Days = new Date();
      in90Days.setDate(in90Days.getDate() + 90);

      const docs = await trx
        .selectFrom('hr_documents')
        .leftJoin('users', 'users.id', 'hr_documents.user_id')
        .select([
          'hr_documents.id', 'hr_documents.name', 'hr_documents.type',
          'hr_documents.expiry_date', 'hr_documents.user_id', 'hr_documents.status',
          'users.name as owner_name', 'users.email as owner_email',
        ])
        .where('hr_documents.tenant_id', '=', tenantId)
        .where('hr_documents.expiry_date', 'is not', null)
        .orderBy('hr_documents.expiry_date', 'asc')
        .execute();

      const expired = docs.filter(d => d.expiry_date && new Date(d.expiry_date) < now);
      const expiringSoon = docs.filter(d => d.expiry_date && new Date(d.expiry_date) >= now && new Date(d.expiry_date) <= in90Days);

      return {
        total_tracked: docs.length,
        expired_count: expired.length,
        expiring_30_days: docs.filter(d => {
          if (!d.expiry_date) return false;
          const diffDays = Math.ceil((new Date(d.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 30;
        }).length,
        expiring_60_days: docs.filter(d => {
          if (!d.expiry_date) return false;
          const diffDays = Math.ceil((new Date(d.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays > 30 && diffDays <= 60;
        }).length,
        expiring_90_days: docs.filter(d => {
          if (!d.expiry_date) return false;
          const diffDays = Math.ceil((new Date(d.expiry_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays > 60 && diffDays <= 90;
        }).length,
        expired_items: expired.map(d => ({
          ...d,
          days_overdue: Math.abs(Math.ceil((new Date(d.expiry_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
        })),
        expiring_items: expiringSoon.map(d => ({
          ...d,
          days_until_expiry: Math.ceil((new Date(d.expiry_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        })),
      };
    });
  }

  static async getDocumentTemplates(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const templates = await trx
        .selectFrom('hr_document_templates')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute();

      if (templates.length === 0) {
        // Seed standard WorkDo templates if none exist
        const defaultTemplates = [
          {
            tenant_id: tenantId,
            name: 'Standard Employment Contract & Offer Letter',
            type: 'OFFER_LETTER',
            template_category: 'OFFER_LETTER',
            country_code: 'TZ',
            placeholders: JSON.stringify(['{employee_name}', '{joining_date}', '{designation}', '{salary}', '{department}', '{tenant_name}']),
            body: `<div style="font-family: Arial; padding: 24px;"><h2>OFFER OF EMPLOYMENT</h2><p>Dear <strong>{employee_name}</strong>,</p><p>We are pleased to offer you employment at <strong>{tenant_name}</strong> as a <strong>{designation}</strong> in the <strong>{department}</strong> department, effective from <strong>{joining_date}</strong>.</p><p>Your starting monthly gross salary will be <strong>{salary}</strong> subject to statutory deductions.</p><br/><p>Yours sincerely,<br/>Human Resources Department<br/><strong>{tenant_name}</strong></p></div>`,
          },
          {
            tenant_id: tenantId,
            name: 'Certificate of Service / Experience Certificate',
            type: 'EXPERIENCE_CERTIFICATE',
            template_category: 'EXPERIENCE_CERTIFICATE',
            country_code: 'TZ',
            placeholders: JSON.stringify(['{employee_name}', '{joining_date}', '{end_date}', '{designation}', '{tenant_name}']),
            body: `<div style="font-family: Arial; padding: 24px;"><h2>TO WHOM IT MAY CONCERN</h2><p>This is to certify that <strong>{employee_name}</strong> was employed with <strong>{tenant_name}</strong> as a <strong>{designation}</strong> from <strong>{joining_date}</strong> to <strong>{end_date}</strong>.</p><p>During their tenure, they demonstrated dedication and high professional standards. We wish them success in their future endeavors.</p><br/><p>Issued by,<br/>Human Resources Director<br/><strong>{tenant_name}</strong></p></div>`,
          },
          {
            tenant_id: tenantId,
            name: 'No Objection Certificate (NOC)',
            type: 'NOC_CERTIFICATE',
            template_category: 'NOC_CERTIFICATE',
            country_code: 'TZ',
            placeholders: JSON.stringify(['{employee_name}', '{passport_number}', '{purpose}', '{tenant_name}']),
            body: `<div style="font-family: Arial; padding: 24px;"><h2>NO OBJECTION CERTIFICATE</h2><p>This is to confirm that <strong>{tenant_name}</strong> has no objection to <strong>{employee_name}</strong> (Holder of ID/Passport: <strong>{passport_number}</strong>) proceeding with <strong>{purpose}</strong>.</p><p>The company confirms they remain a valued member of our organization in good standing.</p><br/><p>Authorized Signatory,<br/><strong>{tenant_name}</strong></p></div>`,
          },
          {
            tenant_id: tenantId,
            name: 'Promotion & Compensation Revision Letter',
            type: 'PROMOTION_LETTER',
            template_category: 'PROMOTION_LETTER',
            country_code: 'TZ',
            placeholders: JSON.stringify(['{employee_name}', '{new_designation}', '{effective_date}', '{new_salary}', '{tenant_name}']),
            body: `<div style="font-family: Arial; padding: 24px;"><h2>PROMOTION & SALARY REVISION</h2><p>Dear <strong>{employee_name}</strong>,</p><p>In recognition of your exceptional performance and leadership, we are delighted to promote you to <strong>{new_designation}</strong> effective <strong>{effective_date}</strong>.</p><p>Your revised monthly salary will be <strong>{new_salary}</strong>.</p><br/><p>Congratulations,<br/>Executive Management<br/><strong>{tenant_name}</strong></p></div>`,
          },
          {
            tenant_id: tenantId,
            name: 'Written Warning & Performance Improvement Notice',
            type: 'WARNING_LETTER',
            template_category: 'WARNING_LETTER',
            country_code: 'TZ',
            placeholders: JSON.stringify(['{employee_name}', '{issue_summary}', '{action_required}', '{review_date}', '{tenant_name}']),
            body: `<div style="font-family: Arial; padding: 24px; border: 2px solid #ef4444;"><h2 style="color: #dc2626;">OFFICIAL WRITTEN WARNING</h2><p>Dear <strong>{employee_name}</strong>,</p><p>This letter serves as a formal written warning regarding: <strong>{issue_summary}</strong>.</p><p>Required Corrective Action: <strong>{action_required}</strong> before <strong>{review_date}</strong>.</p><br/><p>HR Compliance Officer,<br/><strong>{tenant_name}</strong></p></div>`,
          },
        ];

        for (const dt of defaultTemplates) {
          await trx.insertInto('hr_document_templates').values(dt as any).execute();
        }
        return await trx.selectFrom('hr_document_templates').selectAll().where('tenant_id', '=', tenantId).execute();
      }

      return templates;
    });
  }

  static async getDocumentRequirements(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const reqs = await trx.selectFrom('hr_document_requirements')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute();

      if (reqs.length === 0) {
        // Seed default document requirements per WorkDo standards
        const defaults = [
          { tenant_id: tenantId, designation: 'ALL', document_type: 'NATIONAL_ID', is_required: true, expiry_warning_days: 60 },
          { tenant_id: tenantId, designation: 'ALL', document_type: 'PASSPORT', is_required: false, expiry_warning_days: 90 },
          { tenant_id: tenantId, designation: 'ALL', document_type: 'ACADEMIC_CERTIFICATE', is_required: true, expiry_warning_days: 0 },
          { tenant_id: tenantId, designation: 'LOGISTICS_DRIVER', document_type: 'DRIVING_LICENSE', is_required: true, expiry_warning_days: 30 },
          { tenant_id: tenantId, designation: 'EXPATRIATE', document_type: 'WORK_PERMIT', is_required: true, expiry_warning_days: 90 },
        ];
        for (const d of defaults) {
          await trx.insertInto('hr_document_requirements').values(d).execute();
        }
        return await trx.selectFrom('hr_document_requirements').selectAll().where('tenant_id', '=', tenantId).execute();
      }
      return reqs;
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
        .leftJoin('users', 'users.id', 'hr_assets.assigned_to')
        .select([
          'hr_assets.id', 'hr_assets.name', 'hr_assets.type', 'hr_assets.serial_number',
          'hr_assets.assigned_to', 'hr_assets.assigned_date', 'hr_assets.returned_date',
          'hr_assets.condition_notes', 'hr_assets.created_at',
          'users.name as holder_name', 'users.email as holder_email',
        ])
        .where('hr_assets.tenant_id', '=', tenantId)
        .orderBy('hr_assets.name', 'asc')
        .execute();
      return rows.map(r => ({
        ...r,
        // "Out" means assigned and not yet returned — the question an asset
        // register exists to answer.
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
   * Hands an asset to someone, or takes it back when `userId` is null.
   *
   * Assigning an asset that is already out is refused rather than silently
   * reassigned — the previous holder would otherwise stop being recorded as
   * having it while still physically holding it.
   */
  static async assignAsset(tenantId: string, assetId: string, userId: string | null, when?: string) {
    return withTenant(tenantId, async (trx) => {
      const asset = await trx.selectFrom('hr_assets').selectAll()
        .where('id', '=', assetId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!asset) throw new Error('Asset not found');

      if (userId) {
        // users, not hr_employments — which holds no rows, so this check could
        // only ever fail and no asset could be handed to anybody.
        const holder = await trx.selectFrom('users').select('id')
          .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!holder) throw new Error('That person is not on this tenant');
        if (asset.assigned_to && !asset.returned_date) {
          throw new Error('This asset is already out — record its return before assigning it to someone else.');
        }
        return trx.updateTable('hr_assets')
          .set({ assigned_to: userId, assigned_date: toDateParam(when ?? new Date()),
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
   * runPayroll is gone. It was a third payroll implementation — beside
   * /v1/hr/payroll and the statutory engine at /v1/payroll — and the only one
   * of the three reading hr_employments, so it could never have produced a
   * payslip in any tenant. Nothing in the web app called it.
   *
   * The engine that computes PAYE, NSSF, NHIF, WCF and SDL against real bands
   * is payroll.service.ts. Use that.
   */

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
        // users, not hr_employments: the latter holds no rows, so this join
        // produced a null owner name for every goal — when a goal could be
        // created at all, which it could not.
        .leftJoin('users', 'users.id', 'hr_goals.owner_id')
        .select([
          'hr_goals.id', 'hr_goals.owner_id', 'hr_goals.parent_goal_id', 'hr_goals.title',
          'hr_goals.description', 'hr_goals.goal_type', 'hr_goals.target_value',
          'hr_goals.current_value', 'hr_goals.unit', 'hr_goals.weight', 'hr_goals.due_date',
          'hr_goals.status', 'hr_goals.updated_at',
          'users.name as owner_name', 'users.email as owner_email',
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
          // Already selected from users — no name assembly needed now that a
          // goal belongs to a person who actually exists.
          owner_name: g.owner_name ?? null,
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
      const owner = await trx.selectFrom('users').select('id')
        .where('id', '=', data.owner_id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!owner) throw new Error('Owner not found — a goal belongs to a member of staff');
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
        .leftJoin('users', 'users.id', 'hr_review_instances.user_id')
        .leftJoin('hr_review_templates', 'hr_review_templates.id', 'hr_review_instances.template_id')
        .select([
          'hr_review_instances.id', 'hr_review_instances.user_id',
          'hr_review_instances.self_rating', 'hr_review_instances.manager_rating',
          'hr_review_instances.final_rating', 'hr_review_instances.calibration_notes',
          'users.name as person_name', 'users.email as person_email',
          'hr_review_templates.name as template_name', 'hr_review_templates.rating_scale',
        ])
        .where('hr_review_instances.tenant_id', '=', tenantId)
        .where('hr_review_instances.cycle_id', '=', cycleId)
        .orderBy('users.name')
        .execute();
      return rows;
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

  static async getSurveys(tenantId: string, userId: string) {
    return withTenant(tenantId, async (trx) => {
      const instances = await trx
        .selectFrom('hr_survey_instances')
        .innerJoin('hr_survey_templates', 'hr_survey_templates.id', 'hr_survey_instances.template_id')
        .select([
          'hr_survey_instances.id',
          'hr_survey_instances.status',
          'hr_survey_instances.ends_at',
          'hr_survey_instances.created_at',
          'hr_survey_templates.title',
          'hr_survey_templates.description',
          'hr_survey_templates.questions',
          'hr_survey_templates.is_anonymous',
        ])
        .where('hr_survey_instances.tenant_id', '=', tenantId)
        .orderBy('hr_survey_instances.created_at', 'desc')
        .execute();

      // Real response counts per instance, plus whether the CALLING user
      // already answered a non-anonymous one — anonymous instances never
      // recorded who responded (migration 381), so that half of the flag
      // stays false for those regardless of actual history.
      const ids = instances.map(i => i.id);
      const responses = ids.length
        ? await trx.selectFrom('hr_survey_responses')
            .select(['instance_id', 'user_id'])
            .where('instance_id', 'in', ids)
            .execute()
        : [];

      return instances.map(i => ({
        ...i,
        response_count: responses.filter(r => r.instance_id === i.id).length,
        already_responded: responses.some(r => r.instance_id === i.id && r.user_id === userId),
      }));
    });
  }

  static async submitSurvey(tenantId: string, instanceId: string, userId: string, answers: any) {
    return withTenant(tenantId, async (trx) => {
      const instance = await trx.selectFrom('hr_survey_instances as i')
        .innerJoin('hr_survey_templates as t', 't.id', 'i.template_id')
        .select(['i.status', 't.is_anonymous'])
        .where('i.id', '=', instanceId).where('i.tenant_id', '=', tenantId)
        .executeTakeFirst();
      if (!instance) throw new Error('Survey not found.');
      if (instance.status !== 'OPEN') throw new Error('This survey is closed.');

      try {
        await trx.insertInto('hr_survey_responses').values({
          tenant_id: tenantId,
          instance_id: instanceId,
          // Anonymous stays anonymous at the storage layer, not just in the
          // UI — an anonymous template's response never carries user_id,
          // regardless of who is actually signed in when they submit it.
          user_id: instance.is_anonymous ? null : userId,
          answers: JSON.stringify(answers) as any,
        }).execute();
      } catch (err: any) {
        if (String(err.message || '').includes('idx_hr_survey_responses_one_per_user')) {
          throw new Error('You already responded to this survey.');
        }
        throw err;
      }
      return { success: true };
    });
  }

  /** Create-and-launch in one step: a template plus its one live instance. */
  static async createSurvey(tenantId: string, data: any) {
    const title = String(data?.title || '').trim();
    if (!title) throw new Error('Title is required.');
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    if (questions.length === 0) throw new Error('At least one question is required.');

    return withTenant(tenantId, async (trx) => {
      const template = await trx.insertInto('hr_survey_templates').values({
        tenant_id: tenantId,
        title,
        description: data?.description ? String(data.description).trim() : null,
        questions: JSON.stringify(questions) as any,
        is_anonymous: data?.is_anonymous !== false,
      }).returningAll().executeTakeFirstOrThrow();

      const instance = await trx.insertInto('hr_survey_instances').values({
        tenant_id: tenantId,
        template_id: template.id,
        status: 'OPEN',
        ends_at: data?.ends_at ? new Date(data.ends_at) : null,
      }).returningAll().executeTakeFirstOrThrow();

      return { ...instance, title: template.title, description: template.description, questions: template.questions, is_anonymous: template.is_anonymous };
    });
  }

  static async closeSurvey(tenantId: string, instanceId: string) {
    return withTenant(tenantId, async (trx) => {
      const updated = await trx.updateTable('hr_survey_instances')
        .set({ status: 'CLOSED', updated_at: new Date() })
        .where('id', '=', instanceId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      if (!updated) throw new Error('Survey not found.');
      return updated;
    });
  }

  /** Aggregate results only. For an anonymous template every response's
   *  user_id is NULL by construction (migration 381) — there is nothing to
   *  redact per-row because identity was never recorded, not because it's
   *  filtered out here. */
  static async getSurveyResults(tenantId: string, instanceId: string) {
    return withTenant(tenantId, async (trx) => {
      const instance = await trx.selectFrom('hr_survey_instances as i')
        .innerJoin('hr_survey_templates as t', 't.id', 'i.template_id')
        .select(['i.id', 'i.status', 't.title', 't.questions', 't.is_anonymous'])
        .where('i.id', '=', instanceId).where('i.tenant_id', '=', tenantId)
        .executeTakeFirst();
      if (!instance) throw new Error('Survey not found.');

      const responses = await trx.selectFrom('hr_survey_responses')
        .select(['id', 'answers', 'user_id', 'created_at'])
        .where('instance_id', '=', instanceId)
        .execute();

      let respondents: { user_id: string; name: string }[] = [];
      if (!instance.is_anonymous) {
        const userIds = [...new Set(responses.map(r => r.user_id).filter((v): v is string => !!v))];
        if (userIds.length) {
          const users = await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', userIds).execute();
          respondents = users.map(u => ({ user_id: u.id, name: u.name }));
        }
      }

      return {
        ...instance,
        response_count: responses.length,
        answers: responses.map(r => ({
          answers: r.answers,
          created_at: r.created_at,
          respondent: instance.is_anonymous ? null : (respondents.find(p => p.user_id === r.user_id)?.name ?? null),
        })),
      };
    });
  }
}
