import { requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { IllegalCustomsTransition, BondHeadroomExceeded } from '../services/seal.service.js';
import { computeDuty, HsCodeNotFound } from '../services/seal-duty.service.js';
import { SealDeclarationService, IllegalDeclarationTransition, ExaminationPending } from '../services/seal-declaration.service.js';
import { bondHeadroomResponse, stableJson } from './seal.routes.js';
import { legalNextSealDeclarationStatuses, type SealDeclarationStatus } from '@hudumika/types';

const SEAL_DECLARATION_STATUSES = ['DRAFT', 'SUBMITTED', 'QUERIED', 'ASSESSED', 'PAID', 'RELEASED', 'CANCELLED'] as const;
const dutyQuoteSchema = z.object({
  hsCode: z.string().trim().min(1),
  invoiceValue: z.number(),
  currency: z.string().trim().min(1).max(10),
  fxRate: z.number(),
  freight: z.number().optional(),
  insurance: z.number().optional(),
});
const declarationCreateSchema = z.object({
  lotId: z.string().min(1),
  hsCode: z.string().trim().min(1),
  declarationDate: z.string().min(1),
  invoiceValue: z.number(),
  currency: z.string().trim().min(1).max(10),
  fxRate: z.number(),
  procedureCode: z.string().max(50).optional(),
  countryOfOrigin: z.string().max(2).optional(),
  freight: z.number().optional(),
  insurance: z.number().optional(),
});
const declarationSubmitSchema = z.object({
  submissionReference: z.string().trim().min(1),
  // The real selectivity result from the same TANESW/TANCIS portal
  // submission this reference number was taken from — required, same as the
  // reference itself; see seal-declaration.service.ts's submit().
  selectivityChannel: z.enum(['GREEN', 'YELLOW', 'RED']),
});
const declarationAdvanceSchema = z.object({
  to: z.enum(SEAL_DECLARATION_STATUSES),
  reference: z.string().max(200).optional(),
});

// Ex-warehouse customs declarations against a bonded SEAL lot — the duty
// engine and seal_customs_entries stay owned by SEAL (a release-triggered
// declaration doesn't fit ClearOS's import-clearance-shaped `declarations`
// table, see 109_seal_duty_and_declarations.sql's header note), but the
// *workflow* is worked from ClearOS's Ops Command, not SEAL's own nav —
// hence requireAnyEntitlement(['seal', 'clearos']) instead of a single
// 'seal' gate: an ops user with ClearOS but not SEAL access still needs to
// build/submit/release these. Split out of seal.routes.ts (which stays
// 'seal'-only) for exactly this reason — same pattern the carrier
// directory uses for ClearOS/CargoTracker sharing.

function mapDeclaration(row: any) {
  return {
    id: row.id,
    lotId: row.lot_id,
    lotDescription: row.lot_description ?? undefined,
    lotOwnerId: row.lot_owner_id ?? undefined,
    lotOwnerName: row.lot_owner_name ?? undefined,
    procedureCode: row.procedure_code,
    jurisdiction: row.jurisdiction,
    declarationDate: row.declaration_date,
    hsCode: row.hs_code,
    hsCodeRefId: row.hs_code_ref_id,
    countryOfOrigin: row.country_of_origin,
    invoiceValue: Number(row.invoice_value),
    freight: Number(row.freight),
    insurance: Number(row.insurance),
    currency: row.currency,
    fxRate: Number(row.fx_rate),
    valuationMethod: row.valuation_method,
    // pg auto-deserializes jsonb columns to objects already — only parse if it somehow arrives as a raw string.
    computation: row.computation ? (typeof row.computation === 'string' ? JSON.parse(row.computation) : row.computation) : null,
    status: row.status as SealDeclarationStatus,
    submissionReference: row.submission_reference,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
    legalNextStatuses: legalNextSealDeclarationStatuses(row.status as SealDeclarationStatus),
  };
}

export async function sealDeclarationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['seal', 'clearos']));

  // Minimal, read-only lot picker for the declaration builder — deliberately
  // not the full seal.routes.ts GET /lots (which stays 'seal'-only, since it
  // exposes full lot CRUD/movement context an ops-only ClearOS user has no
  // business touching). Just enough to pick a lot and show what's being
  // declared.
  fastify.get('/lots-for-declaration', async (request: any, reply) => {
    try {
      const { customs_status, q } = request.query as { customs_status?: string; q?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let query = trx.selectFrom('seal_lots')
          .leftJoin('customers', 'customers.id', 'seal_lots.owner_id')
          .select([
            'seal_lots.id', 'seal_lots.description', 'seal_lots.hs_code', 'seal_lots.customs_status',
            'customers.name as owner_name', 'seal_lots.qty_on_hand', 'seal_lots.uom',
          ])
          .where('seal_lots.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_lots.created_at', 'desc');
        if (customs_status) query = query.where('seal_lots.customs_status', '=', customs_status);
        if (q) query = query.where('seal_lots.description', 'ilike', `%${q}%`);
        return query.execute();
      });
      return rows.map(r => ({
        id: r.id, description: r.description, hsCode: r.hs_code, customsStatus: r.customs_status,
        ownerName: r.owner_name ?? undefined, qtyOnHand: Number(r.qty_on_hand), uom: r.uom,
      }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // What-if calculator — no persistence, lets a declarant try HS codes/values
  // before committing to a draft (spec M9.6).
  fastify.post('/duty-quote', async (request: any, reply) => {
    const b = dutyQuoteSchema.parse(request.body);
    try {
      const computation = await computeDuty({
        hsCode: b.hsCode, invoiceValue: Number(b.invoiceValue), freight: b.freight != null ? Number(b.freight) : undefined,
        insurance: b.insurance != null ? Number(b.insurance) : undefined, currency: b.currency, fxRate: Number(b.fxRate),
      });
      return computation;
    } catch (err: any) {
      if (err instanceof HsCodeNotFound) return reply.status(404).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/customs-entries', async (request: any, reply) => {
    try {
      const { lot_id, status } = request.query as { lot_id?: string; status?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_customs_entries')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_customs_entries.lot_id')
          .select([
            'seal_customs_entries.id', 'seal_customs_entries.lot_id', 'seal_lots.description as lot_description',
            'seal_customs_entries.procedure_code', 'seal_customs_entries.jurisdiction', 'seal_customs_entries.declaration_date',
            'seal_customs_entries.hs_code', 'seal_customs_entries.hs_code_ref_id', 'seal_customs_entries.country_of_origin',
            'seal_customs_entries.invoice_value', 'seal_customs_entries.freight', 'seal_customs_entries.insurance',
            'seal_customs_entries.currency', 'seal_customs_entries.fx_rate', 'seal_customs_entries.valuation_method',
            'seal_customs_entries.computation', 'seal_customs_entries.status', 'seal_customs_entries.submission_reference',
            'seal_customs_entries.payment_reference', 'seal_customs_entries.created_at',
          ])
          .where('seal_customs_entries.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_customs_entries.created_at', 'desc');
        if (lot_id) q = q.where('seal_customs_entries.lot_id', '=', lot_id);
        if (status) q = q.where('seal_customs_entries.status', '=', status);
        return q.execute();
      });
      return rows.map(mapDeclaration);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/customs-entries/:id', async (request: any, reply) => {
    try {
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_customs_entries')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_customs_entries.lot_id')
          .leftJoin('customers', 'customers.id', 'seal_lots.owner_id')
          .selectAll('seal_customs_entries')
          .select(['seal_lots.description as lot_description', 'seal_lots.owner_id as lot_owner_id', 'customers.name as lot_owner_name'])
          .where('seal_customs_entries.tenant_id', '=', request.user.tenant_id)
          .where('seal_customs_entries.id', '=', request.params.id)
          .executeTakeFirst()
      );
      if (!row) return reply.status(404).send({ error: 'Declaration not found' });
      return mapDeclaration(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/customs-entries', async (request: any, reply) => {
    const b = declarationCreateSchema.parse(request.body);
    try {
      const entry = await withTenant(request.user.tenant_id, trx =>
        SealDeclarationService.createDeclaration(trx, request.user.tenant_id, request.user.sub, {
          lotId: b.lotId, procedureCode: b.procedureCode ?? 'EX_WAREHOUSE_HOME_USE', declarationDate: b.declarationDate,
          hsCode: b.hsCode, countryOfOrigin: b.countryOfOrigin, invoiceValue: Number(b.invoiceValue),
          freight: b.freight != null ? Number(b.freight) : undefined, insurance: b.insurance != null ? Number(b.insurance) : undefined,
          currency: b.currency, fxRate: Number(b.fxRate),
        })
      );
      return mapDeclaration(entry);
    } catch (err: any) {
      if (err instanceof HsCodeNotFound) return reply.status(404).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/customs-entries/:id/recompute', async (request: any, reply) => {
    try {
      const result = await withTenant(request.user.tenant_id, trx => SealDeclarationService.recompute(trx, request.user.tenant_id, request.params.id));
      // Postgres's jsonb column round-trips objects through its own internal key
      // order (not insertion order), and computedAt is a freshness timestamp, not
      // part of the reproducible arithmetic — so a naive JSON.stringify comparison
      // would false-negative on a perfectly reproducible computation. Compare via
      // a recursively key-sorted, computedAt-stripped canonical form instead.
      const matches = stableJson(result.stored) === stableJson(result.recomputed);
      return { ...result, matches };
    } catch (err: any) {
      if (err instanceof HsCodeNotFound) return reply.status(404).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/customs-entries/:id/submit', async (request: any, reply) => {
    const b = declarationSubmitSchema.parse(request.body);
    try {
      const entry = await withTenant(request.user.tenant_id, trx =>
        SealDeclarationService.submit(trx, request.user.tenant_id, request.params.id, b.submissionReference, b.selectivityChannel)
      );
      return mapDeclaration(entry);
    } catch (err: any) {
      return reply.status(422).send({ error: err.message });
    }
  });

  fastify.post('/customs-entries/:id/advance', async (request: any, reply) => {
    const b = declarationAdvanceSchema.parse(request.body);
    try {
      const entry = await withTenant(request.user.tenant_id, trx =>
        SealDeclarationService.advanceStatus(trx, request.user.tenant_id, request.params.id, b.to, b.reference)
      );
      return mapDeclaration(entry);
    } catch (err: any) {
      if (err instanceof IllegalDeclarationTransition) {
        return reply.status(422).send({
          type: 'https://hudumika.tz/errors/illegal-declaration-transition',
          title: 'Illegal declaration transition',
          status: 422,
          detail: err.message,
          from: err.from,
          to: err.to,
        });
      }
      if (err instanceof ExaminationPending) {
        return reply.status(422).send({
          type: 'https://hudumika.tz/errors/examination-pending',
          title: 'Examination pending',
          status: 422,
          detail: err.message,
          examinationId: err.examinationId,
          channel: err.channel,
        });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/customs-entries/:id/release', async (request: any, reply) => {
    try {
      const entry = await withTenant(request.user.tenant_id, trx =>
        SealDeclarationService.release(trx, request.user.tenant_id, request.user.sub, request.params.id)
      );
      return mapDeclaration(entry);
    } catch (err: any) {
      if (err instanceof IllegalCustomsTransition) {
        return reply.status(422).send({
          type: 'https://hudumika.tz/errors/illegal-customs-transition',
          title: 'Illegal customs transition',
          status: 422,
          detail: err.message,
          from: err.from,
          to: err.to,
        });
      }
      if (err instanceof BondHeadroomExceeded) return reply.status(422).send(bondHeadroomResponse(err));
      return reply.status(422).send({ error: err.message });
    }
  });
}
