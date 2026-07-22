import { db, withTenant } from '../db/client.js';
import { checkTradeWizardQuota, incrementTradeWizardUsage } from '../lib/tradeWizardUsage.js';

export const tradeWizardService = {
  async searchProcedures(query: string, kind?: string) {
    let q = db.selectFrom('trade_procedures').selectAll();
    if (kind) q = q.where('kind', '=', kind.toUpperCase());
    if (query && query.trim().length >= 2) {
      const like = `%${query.trim()}%`;
      q = q.where(eb => eb.or([
        eb('name', 'ilike', like),
        eb('product_keywords', 'ilike', like),
      ]));
    }
    return q.orderBy('has_detail', 'desc').orderBy('name').limit(30).execute();
  },

  async getProcedureDetail(procedureId: string) {
    const procedure = await db.selectFrom('trade_procedures').selectAll().where('id', '=', procedureId).executeTakeFirst();
    if (!procedure) return null;

    const steps = await db.selectFrom('trade_procedure_steps')
      .leftJoin('trade_institutions', 'trade_institutions.id', 'trade_procedure_steps.institution_id')
      .select([
        'trade_procedure_steps.id', 'trade_procedure_steps.step_no', 'trade_procedure_steps.name',
        'trade_procedure_steps.description', 'trade_procedure_steps.duration_estimate',
        'trade_procedure_steps.cost_estimate', 'trade_procedure_steps.required_documents',
        'trade_procedure_steps.is_online', 'trade_procedure_steps.source_url',
        'trade_institutions.id as institution_id', 'trade_institutions.name as institution_name',
        'trade_institutions.acronym as institution_acronym', 'trade_institutions.phone as institution_phone',
        'trade_institutions.email as institution_email', 'trade_institutions.website as institution_website',
        'trade_institutions.address as institution_address',
      ])
      .where('procedure_id', '=', procedureId)
      .orderBy('step_no')
      .execute();

    const prechecks = await db.selectFrom('trade_procedure_prechecks')
      .selectAll()
      .where('procedure_id', '=', procedureId)
      .orderBy('sort_order')
      .execute();

    return {
      ...procedure,
      // required_documents/options are real JSONB columns — node-postgres already
      // parses these into native arrays/objects, no JSON.parse needed (or safe).
      // Defensively coerce to an array regardless: bad data here (e.g. a write
      // path that stored {} instead of []) must never reach the frontend as a
      // raw object, since rendering one as a React child crashes the whole page.
      steps: steps.map(s => ({ ...s, required_documents: Array.isArray(s.required_documents) ? s.required_documents as unknown as string[] : [] })),
      prechecks: prechecks.map(p => ({ ...p, options: Array.isArray(p.options) ? p.options as unknown as { value: string; label: string }[] : [] })),
    };
  },

  async runWizard(tenantId: string, userId: string, role: string, procedureId: string, answers: Record<string, string>) {
    const gate = await checkTradeWizardQuota(tenantId, role);
    if (gate.exceeded) {
      return { ok: false as const, gate };
    }

    const detail = await this.getProcedureDetail(procedureId);
    if (!detail) return { ok: false as const, error: 'Procedure not found' };
    if (detail.steps.length === 0) {
      return { ok: false as const, error: 'This procedure does not have detailed step information yet.' };
    }

    await incrementTradeWizardUsage(tenantId);
    await withTenant(tenantId, async trx => {
      await trx.insertInto('trade_wizard_runs').values({
        tenant_id: tenantId, procedure_id: procedureId, answers, created_by: userId,
      }).execute();
    });

    const documentsNeeded = Array.from(new Set(detail.steps.flatMap(s => s.required_documents)));
    const offices = Array.from(
      new Map(
        detail.steps
          .filter(s => s.institution_id)
          .map(s => [s.institution_id, {
            id: s.institution_id, name: s.institution_name, acronym: s.institution_acronym,
            phone: s.institution_phone, email: s.institution_email, website: s.institution_website, address: s.institution_address,
          }])
      ).values()
    );

    // A short, real list of licensed clearing agents to reach out to for hands-on help.
    const recommendedAgents = await db.selectFrom('clearing_agents_registry')
      .select(['id', 'name', 'email', 'tel', 'region', 'license_no'])
      .orderBy('name')
      .limit(5)
      .execute();

    const gateAfter = await checkTradeWizardQuota(tenantId, role);
    return {
      ok: true as const,
      procedure: { id: detail.id, name: detail.name, kind: detail.kind, summary: detail.summary, source_url: detail.source_url, has_detail: detail.has_detail },
      steps: detail.steps,
      documents_needed: documentsNeeded,
      offices,
      recommended_agents: recommendedAgents,
      usage: { used: gateAfter.used, limit: gateAfter.limit },
    };
  },

  /** Fire-and-forget analytics logging — every search, whether or not it matched anything. */
  async logSearch(tenantId: string, userId: string, query: string, kind: string | null, resultsCount: number) {
    await withTenant(tenantId, async trx => {
      await trx.insertInto('trade_wizard_searches').values({
        tenant_id: tenantId, user_id: userId, query: query || null, kind, results_count: resultsCount,
        matched_procedure_id: null,
      }).execute();
    });
  },

  /** Get-or-create the tenant's own "Trade Compliance Consultation" service product, for the results screen's "Request Consultation Invoice" CTA. */
  async getOrCreateConsultationProduct(tenantId: string) {
    return withTenant(tenantId, async trx => {
      const existing = await trx.selectFrom('products')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('code', '=', 'TRADE-CONSULT')
        .executeTakeFirst();
      if (existing) return existing;

      const id = `PRD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      return trx.insertInto('products').values({
        id, tenant_id: tenantId, code: 'TRADE-CONSULT', name: 'Trade Compliance Consultation',
        type: 'service', description: 'One-on-one guidance on import/export compliance procedures, permits and documentation.',
        category: 'Consulting', unit: 'session', sale_price: 0, purchase_price: 0, currency: 'TZS', tax_rate: 0, status: 'active',
      }).returningAll().executeTakeFirstOrThrow();
    });
  },
};
