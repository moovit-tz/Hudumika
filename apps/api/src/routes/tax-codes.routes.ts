import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import type { TaxCodeKind } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import {
  TAX_CODE_KINDS, ZERO_RATE_KINDS, ensureTaxCodes, ensureJurisdictionCodes,
  isTaxCodeUserError, resolveTaxCode,
} from '../services/tax-code.service.js';
import { tenantJurisdiction } from '../services/vat-period.service.js';
import {
  registrationStatus, jurisdictionReference, listJurisdictions,
} from '../services/tax-registration.service.js';
import {
  COMPONENT_TEMPLATES, applyComponents, componentsFor, effectiveRate,
} from '../services/tax-component.service.js';

const FIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'] as const;

/** Reject a payload the DB's own CHECKs would reject, with a message a human can act on. */
function validate(body: any, partial: boolean): string | null {
  if (!partial || body.kind !== undefined) {
    if (!TAX_CODE_KINDS.includes(body.kind)) {
      return `kind must be one of ${TAX_CODE_KINDS.join(', ')}`;
    }
  }
  if (!partial || body.code !== undefined) {
    if (!String(body.code || '').trim()) return 'code is required';
  }
  if (!partial || body.name !== undefined) {
    if (!String(body.name || '').trim()) return 'name is required';
  }
  if (body.jurisdiction !== undefined && !/^[A-Za-z]{2}$/.test(String(body.jurisdiction || ''))) {
    return 'jurisdiction must be an ISO 3166-1 alpha-2 country code';
  }
  if (body.applies_to !== undefined && !['SALES', 'PURCHASE', 'BOTH'].includes(body.applies_to)) {
    return 'applies_to must be SALES, PURCHASE or BOTH';
  }
  if (body.rate !== undefined) {
    const r = Number(body.rate);
    if (!Number.isFinite(r) || r < 0 || r >= 100) return 'rate must be between 0 and 100';
  }
  if (body.tra_vat_rate !== undefined && body.tra_vat_rate !== null && body.tra_vat_rate !== '') {
    if (!/^[A-E]$/.test(String(body.tra_vat_rate))) return 'tra_vat_rate must be a letter A-E, or blank';
  }
  if (body.tra_tax_code !== undefined && body.tra_tax_code !== null) {
    const t = Number(body.tra_tax_code);
    if (!Number.isInteger(t) || t < 1 || t > 5) return 'tra_tax_code must be 1-5, or null';
  }
  // The whole point of the table: a treatment and a rate that contradict each
  // other put us back where we started.
  const kind: TaxCodeKind | undefined = body.kind;
  const rate = body.rate === undefined ? undefined : Number(body.rate);
  if (kind && rate !== undefined) {
    if (ZERO_RATE_KINDS.includes(kind) && rate !== 0) {
      return `${kind} always charges 0% — a rate of ${rate} contradicts it`;
    }
    if (!ZERO_RATE_KINDS.includes(kind) && rate <= 0) {
      return `${kind} must carry a rate above 0; use ZERO_RATED or EXEMPT for a 0% supply`;
    }
  }
  return null;
}

export async function taxCodeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/tax-codes
  // Defaults to what a document may actually use today: active, and inside its
  // effective window. `?all=1` is the management view.
  fastify.get('/', async (request) => {
    const user = request.user;
    const { all, jurisdiction, scope } = request.query as { all?: string; jurisdiction?: string; scope?: string };
    return withTenant(user.tenant_id, async (trx) => {
      await ensureTaxCodes(trx, user.tenant_id);
      let q = trx.selectFrom('tax_codes').selectAll().where('tenant_id', '=', user.tenant_id);
      if (all !== '1') {
        const today = new Date().toISOString().slice(0, 10);
        q = q
          .where('status', '=', 'active')
          .where(eb => eb.or([eb('effective_from', 'is', null), eb('effective_from', '<=', today as any)]))
          .where(eb => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', today as any)]));
      }
      if (jurisdiction) q = q.where('jurisdiction', '=', jurisdiction.toUpperCase());
      // A picker on an invoice asks for SALES and gets sales + both; a bill
      // asks for PURCHASE. Blocked-input-tax codes never reach a sales form.
      if (scope === 'SALES' || scope === 'PURCHASE') {
        q = q.where(eb => eb.or([eb('applies_to', '=', 'BOTH'), eb('applies_to', '=', scope)]));
      }
      return q.orderBy('is_default', 'desc').orderBy('rate', 'desc').orderBy('code', 'asc').execute();
    });
  });

  // GET /v1/tax-codes/registration?jurisdiction=TZ
  // Whether this workspace may charge VAT here, plus the local reference
  // figures for onboarding (rate, threshold, what the number is called).
  fastify.get('/registration', async (request) => {
    const user = request.user;
    const { jurisdiction } = request.query as { jurisdiction?: string };
    return withTenant(user.tenant_id, async (trx) => {
      const juris = (jurisdiction || await tenantJurisdiction(trx, user.tenant_id)).toUpperCase();
      const [status, reference, all] = await Promise.all([
        registrationStatus(trx, user.tenant_id, juris),
        jurisdictionReference(trx, juris),
        listJurisdictions(trx),
      ]);
      return { status, reference: reference ?? null, jurisdictions: all };
    });
  });

  // PUT /v1/tax-codes/jurisdiction  { jurisdiction, currency? }
  //
  // Move the workspace to another country. This is the switch that makes the
  // rest of the tax system follow: the return groups by it, periods are per
  // jurisdiction, and the seeded codes carry it.
  //
  // It adds what the new country needs and leaves everything already there
  // alone. Existing codes are not re-rated and not deleted — a code that has
  // been used on an issued document is a historical fact, and a country switch
  // is not a reason to restate it. The new country's codes arrive alongside.
  fastify.put('/jurisdiction', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = (request.body ?? {}) as { jurisdiction?: string; currency?: string };
    const juris = String(body.jurisdiction || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(juris)) {
      return reply.status(400).send({ error: 'jurisdiction must be an ISO 3166-1 alpha-2 country code' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const ref = await trx.selectFrom('tax_jurisdictions').selectAll()
        .where('code', '=', juris).executeTakeFirst();

      const currency = (body.currency || ref?.currency || '').toUpperCase();
      if (currency && !/^[A-Z]{3}$/.test(currency)) {
        return reply.status(400).send({ error: 'currency must be an ISO 4217 code' });
      }

      // Company settings are the tenant's own record of where they are; the
      // tax codes follow from it rather than the other way round.
      const existing = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings: any = existing?.settings ?? {};
      settings.company = { ...(settings.company ?? {}), country: juris };
      if (currency) settings.company.currency = currency;

      await trx.insertInto('tenant_settings')
        .values({ tenant_id: user.tenant_id, settings: JSON.stringify(settings) as any })
        .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify(settings) as any }))
        .execute();

      // Seed the new country's codes if this workspace has none there yet.
      const added = await ensureJurisdictionCodes(trx, user.tenant_id, juris);

      const codes = await trx.selectFrom('tax_codes').selectAll()
        .where('tenant_id', '=', user.tenant_id).orderBy('jurisdiction').orderBy('code').execute();

      return {
        jurisdiction: juris,
        currency: currency || null,
        reference: ref ?? null,
        codes_added: added,
        codes_total: codes.length,
        note: added === 0
          ? `This workspace already had ${juris} tax codes; nothing was changed.`
          : `${added} ${juris} tax code(s) added. Existing codes were left as they are — a code ` +
            `used on an issued document is a historical fact, so nothing was re-rated or removed.`,
      };
    });
  });

  // PUT /v1/tax-codes/registration
  // One registration per jurisdiction per regime, so this upserts rather than
  // accumulating rows nobody can tell apart.
  fastify.put('/registration', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = (request.body ?? {}) as any;
    const juris = String(body.jurisdiction || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(juris)) {
      return reply.status(400).send({ error: 'jurisdiction must be an ISO 3166-1 alpha-2 country code' });
    }
    const VALID = ['registered', 'not_registered', 'pending', 'deregistered'];
    if (!VALID.includes(body.status)) {
      return reply.status(400).send({ error: `status must be one of ${VALID.join(', ')}` });
    }
    // "Registered" without a number is a claim, not a registration — the DB
    // enforces this too, but a clear message beats a constraint violation.
    if (body.status === 'registered' && !String(body.registration_number ?? '').trim()) {
      return reply.status(400).send({
        error: 'A registration number is required to record this workspace as registered.',
      });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const values = {
        tenant_id: user.tenant_id,
        jurisdiction: juris,
        regime: body.regime || 'VAT',
        status: body.status,
        registration_number: String(body.registration_number ?? '').trim() || null,
        basis: body.basis || null,
        registered_from: body.registered_from || null,
        registered_to: body.registered_to || null,
        notes: body.notes ? String(body.notes).trim() : null,
        updated_at: new Date(),
      };
      await trx.insertInto('tax_registrations').values(values)
        .onConflict(oc => oc.columns(['tenant_id', 'jurisdiction', 'regime']).doUpdateSet(values))
        .execute();
      return registrationStatus(trx, user.tenant_id, juris);
    });
  });

  // GET /v1/tax-codes/usage — how much of this workspace's data is classified.
  // Migration 180 could only backfill rows whose rate made the treatment
  // unambiguous; everything at 0% stayed NULL because zero-rated, exempt,
  // reverse-charge and out-of-scope are indistinguishable in the old data.
  // This endpoint is how that gap stays visible instead of quietly passing as
  // zero-rated on a return.
  fastify.get('/usage', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const lines = await trx
        .selectFrom('sales_invoice_lines as l')
        .innerJoin('sales_invoices as si', 'si.id', 'l.invoice_id')
        .select(({ fn, eb }) => [
          fn.countAll<string>().as('total'),
          fn.count<string>(eb.case().when('l.tax_code_id', 'is', null).then(1).end()).as('unclassified'),
        ])
        .where('si.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      const products = await trx
        .selectFrom('products')
        .select(({ fn, eb }) => [
          fn.countAll<string>().as('total'),
          fn.count<string>(eb.case().when('tax_code_id', 'is', null).then(1).end()).as('unclassified'),
        ])
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      // Purchases matter more than sales here: an unclassified purchase line
      // is input tax nobody can claim, because the claim has no basis.
      const bills = await trx
        .selectFrom('supplier_bill_lines as l')
        .innerJoin('supplier_bills as b', 'b.id', 'l.bill_id')
        .select(({ fn, eb }) => [
          fn.countAll<string>().as('total'),
          fn.count<string>(eb.case().when('l.tax_code_id', 'is', null).then(1).end()).as('unclassified'),
        ])
        .where('b.tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      return {
        invoice_lines: {
          total: Number(lines?.total ?? 0),
          unclassified: Number(lines?.unclassified ?? 0),
        },
        products: {
          total: Number(products?.total ?? 0),
          unclassified: Number(products?.unclassified ?? 0),
        },
        bill_lines: {
          total: Number(bills?.total ?? 0),
          unclassified: Number(bills?.unclassified ?? 0),
        },
      };
    });
  });

  // GET /v1/tax-codes/unclassified?target=sales|purchase|product
  //
  // The backlog, with enough context to judge each row. Migration 180 could
  // only backfill where the rate made the treatment unambiguous; everything at
  // 0% stayed NULL because the four 0% treatments are indistinguishable in the
  // old data. This is how a human resolves them without a SQL console.
  fastify.get('/unclassified', async (request) => {
    const user = request.user;
    const { target = 'sales', limit = '50', offset = '0' } = request.query as
      { target?: string; limit?: string; offset?: string };
    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const skip = Math.max(parseInt(offset, 10) || 0, 0);

    return withTenant(user.tenant_id, async (trx) => {
      if (target === 'product') {
        const rows = await trx.selectFrom('products')
          .select(['id', 'code', 'name', 'category', 'tax_rate', 'currency'])
          .where('tenant_id', '=', user.tenant_id).where('tax_code_id', 'is', null)
          .orderBy('name', 'asc').limit(take).offset(skip).execute();
        const total = await trx.selectFrom('products').select(({ fn }) => fn.countAll<string>().as('n'))
          .where('tenant_id', '=', user.tenant_id).where('tax_code_id', 'is', null).executeTakeFirst();
        return { target, total: Number(total?.n ?? 0), rows };
      }

      if (target === 'purchase') {
        const rows = await trx.selectFrom('supplier_bill_lines as l')
          .innerJoin('supplier_bills as b', 'b.id', 'l.bill_id')
          .select(['l.id', 'l.description as name', 'l.category', 'l.tax_rate',
                   'b.bill_number as document', 'b.supplier_name as party',
                   'b.bill_date as date', 'b.currency', 'b.status'])
          .where('b.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null)
          .orderBy('b.bill_date', 'desc').limit(take).offset(skip).execute();
        const total = await trx.selectFrom('supplier_bill_lines as l')
          .innerJoin('supplier_bills as b', 'b.id', 'l.bill_id')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .where('b.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null).executeTakeFirst();
        return { target, total: Number(total?.n ?? 0), rows };
      }

      const rows = await trx.selectFrom('sales_invoice_lines as l')
        .innerJoin('sales_invoices as si', 'si.id', 'l.invoice_id')
        .select(['l.id', 'l.name', 'l.line_group as category', 'l.tax_pct as tax_rate',
                 'si.invoice_number as document', 'si.client_name as party',
                 'si.bill_date as date', 'l.currency', 'si.status'])
        .where('si.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null)
        .orderBy('si.bill_date', 'desc').limit(take).offset(skip).execute();
      const total = await trx.selectFrom('sales_invoice_lines as l')
        .innerJoin('sales_invoices as si', 'si.id', 'l.invoice_id')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .where('si.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null).executeTakeFirst();
      return { target: 'sales', total: Number(total?.n ?? 0), rows };
    });
  });

  // GET /v1/tax-codes/unclassified/groups?target=sales|purchase|product
  //
  // The backlog collapses hard: this workspace's 223 unclassified rows are only
  // 13 distinct (grouping, rate) combinations. Deciding once per group instead
  // of once per row is the difference between a job someone will do and one
  // they will not — and it is the same decision either way, since every row in
  // a group carries the same signals.
  //
  // The grouping is mechanical. Which treatment a group deserves is a judgement
  // about the business and is left to whoever is looking at it.
  fastify.get('/unclassified/groups', async (request) => {
    const user = request.user;
    const { target = 'sales' } = request.query as { target?: string };

    return withTenant(user.tenant_id, async (trx) => {
      if (target === 'product') {
        const rows = await trx.selectFrom('products')
          .select(({ fn }) => [
            'category as key', 'tax_rate as rate',
            fn.countAll<string>().as('count'),
            fn.min('name').as('sample'),
          ])
          .where('tenant_id', '=', user.tenant_id).where('tax_code_id', 'is', null)
          .groupBy(['category', 'tax_rate']).orderBy('count', 'desc').execute();
        return { target, groups: rows.map(r => ({ ...r, count: Number(r.count), rate: Number(r.rate) })) };
      }

      if (target === 'purchase') {
        const rows = await trx.selectFrom('supplier_bill_lines as l')
          .innerJoin('supplier_bills as b', 'b.id', 'l.bill_id')
          .select(({ fn }) => [
            'l.category as key', 'l.tax_rate as rate',
            fn.countAll<string>().as('count'),
            fn.min('l.description').as('sample'),
          ])
          .where('b.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null)
          .groupBy(['l.category', 'l.tax_rate']).orderBy('count', 'desc').execute();
        return { target, groups: rows.map(r => ({ ...r, count: Number(r.count), rate: Number(r.rate) })) };
      }

      const rows = await trx.selectFrom('sales_invoice_lines as l')
        .innerJoin('sales_invoices as si', 'si.id', 'l.invoice_id')
        .select(({ fn }) => [
          'l.line_group as key', 'l.tax_pct as rate',
          fn.countAll<string>().as('count'),
          fn.min('l.name').as('sample'),
        ])
        .where('si.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null)
        .groupBy(['l.line_group', 'l.tax_pct']).orderBy('count', 'desc').execute();
      return { target: 'sales', groups: rows.map(r => ({ ...r, count: Number(r.count), rate: Number(r.rate) })) };
    });
  });

  // POST /v1/tax-codes/classify  { target, ids, tax_code_id }
  //
  // Sets a treatment on rows that had none. Three things it deliberately will
  // not do:
  //
  //   * change a treatment that is already set — that would silently restate a
  //     figure someone may already have reported;
  //   * touch the rate — classifying records what a document always was, it
  //     does not reprice it, so a code whose rate disagrees with the line is
  //     refused for that line rather than reconciled;
  //   * reach into a closed period, where the return has already been filed.
  //
  // Each of those is reported back as a count, so a partial result is legible
  // rather than looking like success.
  fastify.post('/classify', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { target, ids, group, tax_code_id } = (request.body ?? {}) as
      { target?: string; ids?: string[]; group?: { key: string | null; rate: number }; tax_code_id?: string };

    // Either an explicit list of rows, or a whole (grouping, rate) group. The
    // group form resolves its own rows server-side so the client cannot race a
    // stale id list, and every guard below applies identically to both.
    const byGroup = !!group && typeof group === 'object';
    if (!byGroup) {
      if (!Array.isArray(ids) || ids.length === 0) return reply.status(400).send({ error: 'ids or group is required' });
      if (ids.length > 500) return reply.status(400).send({ error: 'At most 500 rows at a time' });
    }
    if (!tax_code_id) return reply.status(400).send({ error: 'tax_code_id is required' });
    if (!['sales', 'purchase', 'product'].includes(String(target))) {
      return reply.status(400).send({ error: 'target must be sales, purchase or product' });
    }
    const scope = target === 'purchase' ? ('PURCHASE' as const) : ('SALES' as const);

    return withTenant(user.tenant_id, async (trx) => {
      let code;
      try {
        code = await resolveTaxCode(trx, user.tenant_id, tax_code_id, scope);
      } catch (e) {
        if (isTaxCodeUserError(e)) return reply.status(400).send({ error: e.message });
        throw e;
      }
      const codeRate = Number(code.rate);

      if (target === 'product') {
        let q = trx.selectFrom('products').select(['id', 'tax_rate'])
          .where('tenant_id', '=', user.tenant_id).where('tax_code_id', 'is', null);
        q = byGroup
          ? q.where(eb => group!.key === null ? eb('category', 'is', null) : eb('category', '=', group!.key))
             .where('tax_rate', '=', group!.rate)
          : q.where('id', 'in', ids!);
        const eligible = await q.execute();
        const ok = eligible.filter(r => Number(r.tax_rate) === codeRate).map(r => r.id);
        if (ok.length > 0) {
          await trx.updateTable('products').set({ tax_code_id: code.id, updated_at: new Date() })
            .where('tenant_id', '=', user.tenant_id).where('id', 'in', ok).execute();
        }
        return {
          classified: ok.length,
          skipped_rate_mismatch: eligible.length - ok.length,
          skipped_closed_period: 0,
          code_rate: codeRate,
        };
      }

      const juris = await tenantJurisdiction(trx, user.tenant_id);
      const closed = await trx.selectFrom('vat_periods').select(['period_start', 'period_end'])
        .where('tenant_id', '=', user.tenant_id).where('jurisdiction', '=', juris)
        .where('status', '=', 'closed').execute();
      const inClosedPeriod = (d: unknown) => {
        if (!d) return false;
        const s = String(d).slice(0, 10);
        return closed.some(p =>
          s >= String(p.period_start).slice(0, 10) && s <= String(p.period_end).slice(0, 10));
      };

      if (target === 'purchase') {
        let q = trx.selectFrom('supplier_bill_lines as l')
          .innerJoin('supplier_bills as b', 'b.id', 'l.bill_id')
          .select(['l.id', 'l.tax_rate', 'b.bill_date'])
          .where('b.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null);
        q = byGroup
          ? q.where(eb => group!.key === null ? eb('l.category', 'is', null) : eb('l.category', '=', group!.key))
             .where('l.tax_rate', '=', group!.rate)
          : q.where('l.id', 'in', ids!);
        const rows = await q.execute();
        const open = rows.filter(r => !inClosedPeriod(r.bill_date));
        const ok = open.filter(r => Number(r.tax_rate) === codeRate).map(r => r.id);
        if (ok.length > 0) {
          await trx.updateTable('supplier_bill_lines').set({ tax_code_id: code.id })
            .where('id', 'in', ok).execute();
        }
        return {
          classified: ok.length,
          skipped_rate_mismatch: open.length - ok.length,
          skipped_closed_period: rows.length - open.length,
          code_rate: codeRate,
        };
      }

      let q = trx.selectFrom('sales_invoice_lines as l')
        .innerJoin('sales_invoices as si', 'si.id', 'l.invoice_id')
        .select(['l.id', 'l.tax_pct', 'si.bill_date'])
        .where('si.tenant_id', '=', user.tenant_id).where('l.tax_code_id', 'is', null);
      q = byGroup
        ? q.where(eb => group!.key === null ? eb('l.line_group', 'is', null) : eb('l.line_group', '=', group!.key))
           .where('l.tax_pct', '=', group!.rate)
        : q.where('l.id', 'in', ids!);
      const rows = await q.execute();
      const open = rows.filter(r => !inClosedPeriod(r.bill_date));
      const ok = open.filter(r => Number(r.tax_pct) === codeRate).map(r => r.id);
      if (ok.length > 0) {
        await trx.updateTable('sales_invoice_lines').set({ tax_code_id: code.id })
          .where('id', 'in', ok).execute();
      }
      return {
        classified: ok.length,
        skipped_rate_mismatch: open.length - ok.length,
        skipped_closed_period: rows.length - open.length,
        code_rate: codeRate,
      };
    });
  });

  // POST /v1/tax-codes
  fastify.post('/', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    const err = validate(body, false);
    if (err) return reply.status(400).send({ error: err });

    return withTenant(user.tenant_id, async (trx) => {
      const code = String(body.code).trim().toUpperCase();
      const juris = String(body.jurisdiction || 'TZ').toUpperCase();
      // Per jurisdiction — a tenant in two countries holds a STD in each, at
      // each country's own rate (migration 190).
      const dup = await trx.selectFrom('tax_codes').select('id')
        .where('tenant_id', '=', user.tenant_id).where('jurisdiction', '=', juris)
        .where('code', '=', code).executeTakeFirst();
      if (dup) return reply.status(409).send({ error: `Tax code "${code}" already exists for ${juris}` });

      if (body.is_default) {
        await trx.updateTable('tax_codes').set({ is_default: false })
          .where('tenant_id', '=', user.tenant_id).where('is_default', '=', true)
          .where('jurisdiction', '=', juris)
          .where('applies_to', '=', body.applies_to || 'BOTH').execute();
      }
      const row = await trx.insertInto('tax_codes').values({
        tenant_id: user.tenant_id,
        code,
        name: String(body.name).trim(),
        kind: body.kind,
        rate: ZERO_RATE_KINDS.includes(body.kind) ? 0 : Number(body.rate),
        jurisdiction: juris,
        input_tax_recoverable: body.input_tax_recoverable !== false,
        tra_tax_code: body.tra_tax_code === undefined || body.tra_tax_code === null
          ? null : Number(body.tra_tax_code),
        tra_vat_rate: body.tra_vat_rate ? String(body.tra_vat_rate).toUpperCase() : null,
        guidance: body.guidance ? String(body.guidance).trim() : null,
        applies_to: body.applies_to || 'BOTH',
        is_default: !!body.is_default,
        status: body.status || 'active',
        effective_from: body.effective_from || null,
        effective_to: body.effective_to || null,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  // ── Components: tax codes that are more than one tax ─────────────────────
  //
  // The table, the arithmetic and the Ghana templates all existed and seeded
  // themselves when a workspace switched country. What did not exist was any
  // way to add or edit a component by hand, so a custom stack meant inserting
  // rows in psql.
  //
  // The rule the whole thing turns on: `tax_codes.rate` is *derived* from the
  // components, never typed. Ghana's pre-2026 21.9% is the result of 6% of
  // levies on net then 15% VAT on net-plus-levies — a number nobody should be
  // able to enter, because entering it is how it stops agreeing with the
  // breakdown that explains it.

  /** GET /v1/tax-codes/:id/components */
  fastify.get('/:id/components', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const code = await trx.selectFrom('tax_codes').select(['id', 'code', 'name', 'rate'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!code) return reply.status(404).send({ error: 'Tax code not found' });

      const components = await componentsFor(trx, id);
      const applied = applyComponents(100, components);
      return {
        tax_code: code,
        components,
        // Shown per 100 so the breakdown reads as percentages without the
        // caller having to divide anything.
        effective_rate: components.length ? applied.total : Number(code.rate),
        derived: components.length > 0,
        breakdown: applied.lines,
      };
    });
  });

  /** GET /v1/tax-codes/component-templates — reference stacks, dated. */
  fastify.get('/component-templates', async (request) => {
    const { jurisdiction } = request.query as { jurisdiction?: string };
    const juris = (jurisdiction ?? '').toUpperCase();
    const list = juris ? (COMPONENT_TEMPLATES[juris] ?? []) : Object.values(COMPONENT_TEMPLATES).flat();
    return list.map(t => ({
      ...t,
      // The effective rate is computed here too, so a template can never be
      // labelled with a rate its own components do not produce.
      effective_rate: effectiveRate(t.components),
    }));
  });

  /**
   * PUT /v1/tax-codes/:id/components — replace the whole stack.
   *
   * Whole-list replace rather than per-component CRUD, because `sequence` is
   * the compounding order: a NET_PLUS_PRIOR component means "on net plus
   * everything before me", so editing one row in isolation silently changes
   * what every later row is charged on. Sending the list makes that order
   * explicit and reviewable.
   */
  fastify.put('/:id/components', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as { components?: any[] };
    const incoming = Array.isArray(body?.components) ? body.components : null;
    if (!incoming) return reply.status(400).send({ error: 'components must be an array.' });

    // Validated before the transaction opens: a refusal returned from inside
    // withTenant returns normally, so the transaction would commit whatever had
    // already been written.
    const cleaned: any[] = [];
    for (const [i, c] of incoming.entries()) {
      const at = `Component ${i + 1}`;
      const code = String(c?.code ?? '').trim().toUpperCase();
      const name = String(c?.name ?? '').trim();
      if (!code) return reply.status(400).send({ error: `${at} needs a code.` });
      if (!name) return reply.status(400).send({ error: `${at} needs a name.` });
      const rate = Number(c?.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return reply.status(400).send({ error: `${at}: rate must be between 0 and 100.` });
      }
      const basis = String(c?.basis ?? 'NET').toUpperCase();
      if (!['NET', 'NET_PLUS_PRIOR'].includes(basis)) {
        return reply.status(400).send({ error: `${at}: basis must be NET or NET_PLUS_PRIOR.` });
      }
      // The first component has nothing prior to compound onto, so asking for
      // it is a mistake worth naming rather than quietly treating as NET.
      if (i === 0 && basis === 'NET_PLUS_PRIOR') {
        return reply.status(400).send({
          error: 'The first component has nothing before it to compound onto — its basis must be NET.',
        });
      }
      if (cleaned.some(p => p.code === code)) {
        return reply.status(400).send({ error: `${at}: "${code}" appears twice in this stack.` });
      }
      cleaned.push({
        sequence: i, code, name, rate,
        basis, recoverable: c?.recoverable !== false,
        gl_account_code: c?.gl_account_code ? String(c.gl_account_code).trim() : null,
      });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const code = await trx.selectFrom('tax_codes').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!code) return reply.status(404).send({ error: 'Tax code not found' });

      // A zero-rated, exempt or out-of-scope code is 0% by definition, and the
      // table has a CHECK saying so. Without this the stack is written, the
      // derived rate fails that CHECK, and the caller gets a 500 naming a
      // constraint — a real refusal that arrives looking like a crash.
      if (cleaned.length && ZERO_RATE_KINDS.includes(code.kind)) {
        const would = effectiveRate(cleaned);
        return reply.status(400).send({
          error: `"${code.code}" is a ${String(code.kind).toLowerCase().replace(/_/g, ' ')} code, which is always 0%. ` +
            `These components work out to ${would.toFixed(2)}% — put them on a standard-rated code instead.`,
        });
      }

      await trx.deleteFrom('tax_code_components').where('tax_code_id', '=', id).execute();
      if (cleaned.length) {
        await trx.insertInto('tax_code_components')
          .values(cleaned.map(c => ({ ...c, tax_code_id: id })))
          .execute();
      }

      // The rate follows the components. Clearing them leaves whatever rate the
      // code already had, since a code with no breakdown is a single tax at its
      // own rate — that is every code outside Ghana.
      const rate = cleaned.length ? effectiveRate(cleaned) : Number(code.rate);
      await trx.updateTable('tax_codes')
        .set({ rate, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

      const components = await componentsFor(trx, id);
      const applied = applyComponents(100, components);
      return {
        tax_code: { ...code, rate },
        components,
        effective_rate: cleaned.length ? applied.total : Number(code.rate),
        derived: cleaned.length > 0,
        breakdown: applied.lines,
        // Documents already written keep their own snapshotted tax_pct — a
        // posted document's tax is a historical fact, not a live lookup.
        note: 'Documents already issued keep the rate they were written with.',
      };
    });
  });

  // PATCH /v1/tax-codes/:id
  fastify.patch('/:id', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as any;

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tax_codes').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Tax code not found' });

      // Validate the *resulting* row, not the patch: changing kind alone can
      // contradict a rate that is already stored.
      const merged = { ...existing, ...body };
      const err = validate(merged, false);
      if (err) return reply.status(400).send({ error: err });

      if (body.is_default === true) {
        // One default per tenant *per side* — a sales default and a purchase
        // default coexist, so only the matching side is cleared.
        const side = body.applies_to ?? existing.applies_to;
        await trx.updateTable('tax_codes').set({ is_default: false })
          .where('tenant_id', '=', user.tenant_id).where('is_default', '=', true)
          .where('jurisdiction', '=', body.jurisdiction ?? existing.jurisdiction)
          .where('applies_to', '=', side).execute();
      }

      const updates: any = { updated_at: new Date() };
      for (const f of ['code', 'name', 'kind', 'jurisdiction', 'input_tax_recoverable', 'applies_to',
                       'tra_tax_code', 'tra_vat_rate', 'guidance', 'is_default', 'status', 'effective_from', 'effective_to']) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
      if (updates.code) updates.code = String(updates.code).trim().toUpperCase();
      if (updates.jurisdiction) updates.jurisdiction = String(updates.jurisdiction).toUpperCase();
      if (body.rate !== undefined || body.kind !== undefined) {
        updates.rate = ZERO_RATE_KINDS.includes(merged.kind) ? 0 : Number(merged.rate);
      }

      const row = await trx.updateTable('tax_codes').set(updates)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();

      // Editing a code deliberately does NOT reprice documents that already
      // carry it — each line snapshotted its own tax_pct when it was written,
      // and a posted document's tax is a historical fact, not a live lookup.
      return row;
    });
  });

  // DELETE /v1/tax-codes/:id
  // A code in use is archived rather than deleted: removing it would blank the
  // treatment on documents that have already been filed under it.
  fastify.delete('/:id', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tax_codes').select(['id', 'code'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Tax code not found' });

      const [onLines, onProducts, onQuotes] = await Promise.all([
        trx.selectFrom('sales_invoice_lines').select('id').where('tax_code_id', '=', id).executeTakeFirst(),
        trx.selectFrom('products').select('id').where('tax_code_id', '=', id).executeTakeFirst(),
        trx.selectFrom('quotation_lines').select('id').where('tax_code_id', '=', id).executeTakeFirst(),
      ]);
      if (onLines || onProducts || onQuotes) {
        const row = await trx.updateTable('tax_codes')
          .set({ status: 'archived', is_default: false, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        return reply.status(200).send({ archived: true, reason: 'in use on existing documents', row });
      }
      await trx.deleteFrom('tax_codes').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return reply.status(204).send();
    });
  });
}
