import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import type { TaxCodeKind } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { TAX_CODE_KINDS, ZERO_RATE_KINDS, ensureTaxCodes } from '../services/tax-code.service.js';

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

  // POST /v1/tax-codes
  fastify.post('/', { preHandler: requireRole(...FIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = request.body as any;
    const err = validate(body, false);
    if (err) return reply.status(400).send({ error: err });

    return withTenant(user.tenant_id, async (trx) => {
      const code = String(body.code).trim().toUpperCase();
      const dup = await trx.selectFrom('tax_codes').select('id')
        .where('tenant_id', '=', user.tenant_id).where('code', '=', code).executeTakeFirst();
      if (dup) return reply.status(409).send({ error: `Tax code "${code}" already exists` });

      if (body.is_default) {
        await trx.updateTable('tax_codes').set({ is_default: false })
          .where('tenant_id', '=', user.tenant_id).where('is_default', '=', true)
          .where('applies_to', '=', body.applies_to || 'BOTH').execute();
      }
      const row = await trx.insertInto('tax_codes').values({
        tenant_id: user.tenant_id,
        code,
        name: String(body.name).trim(),
        kind: body.kind,
        rate: ZERO_RATE_KINDS.includes(body.kind) ? 0 : Number(body.rate),
        jurisdiction: String(body.jurisdiction || 'TZ').toUpperCase(),
        input_tax_recoverable: body.input_tax_recoverable !== false,
        tra_tax_code: body.tra_tax_code === undefined || body.tra_tax_code === null
          ? null : Number(body.tra_tax_code),
        applies_to: body.applies_to || 'BOTH',
        is_default: !!body.is_default,
        status: body.status || 'active',
        effective_from: body.effective_from || null,
        effective_to: body.effective_to || null,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
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
          .where('applies_to', '=', side).execute();
      }

      const updates: any = { updated_at: new Date() };
      for (const f of ['code', 'name', 'kind', 'jurisdiction', 'input_tax_recoverable', 'applies_to',
                       'tra_tax_code', 'is_default', 'status', 'effective_from', 'effective_to']) {
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
