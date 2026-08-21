import { requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';

const EXAM_STATUSES = ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'WAIVED'] as const;
const EXAM_OUTCOMES = ['CLEARED', 'DISCREPANCY_FOUND', 'SEIZURE_RECOMMENDED'] as const;
const examinationPatchSchema = z.object({
  status: z.enum(EXAM_STATUSES).optional(),
  officerName: z.string().max(200).nullable().optional(),
  officerReference: z.string().max(200).nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  findings: z.string().max(5000).nullable().optional(),
  outcome: z.enum(EXAM_OUTCOMES).optional(),
});

// SEAL examination management (spec, deferred from Increment 3). Rows are
// created by SealDeclarationService.submit() (see seal-declaration.service.ts)
// from the real selectivity channel a human read off the TANESW/TANCIS
// portal at submission time — this file only exposes the worklist (triage
// across declarations) and the completion action. GREEN-channel rows arrive
// pre-WAIVED and never need an officer's action; this route lets an officer
// act on YELLOW/RED ones.

function mapExamination(row: any) {
  return {
    id: row.id,
    customsEntryId: row.customs_entry_id,
    lotDescription: row.lot_description ?? undefined,
    // Soft reference (seal_lots.shipment_case_id, not a hard FK — see
    // 106_seal_bonded_warehouse.sql) back to the ClearOS shipment this lot
    // originated from, when one exists. Lets Ops Command deep-link an
    // examination back to its shipment instead of showing it as an
    // island only SEAL has context for.
    shipmentCaseId: row.shipment_case_id ?? undefined,
    selectivityChannel: row.selectivity_channel,
    examinationType: row.examination_type,
    status: row.status,
    officerName: row.officer_name,
    officerReference: row.officer_reference,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    outcome: row.outcome,
    findings: row.findings,
    createdAt: row.created_at,
  };
}

export async function sealExaminationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // Tied to the declaration lifecycle, now worked from ClearOS's Ops
  // Command — same reasoning as seal-declarations.routes.ts.
  fastify.addHook('preHandler', requireAnyEntitlement(['seal', 'clearos']));

  fastify.get('/examinations', async (request: any, reply) => {
    try {
      const { status, customs_entry_id, shipment_case_id } = request.query as { status?: string; customs_entry_id?: string; shipment_case_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_examinations')
          .leftJoin('seal_customs_entries', 'seal_customs_entries.id', 'seal_examinations.customs_entry_id')
          .leftJoin('seal_lots', 'seal_lots.id', 'seal_customs_entries.lot_id')
          .select([
            'seal_examinations.id', 'seal_examinations.customs_entry_id', 'seal_lots.description as lot_description',
            'seal_lots.shipment_case_id',
            'seal_examinations.selectivity_channel', 'seal_examinations.examination_type', 'seal_examinations.status',
            'seal_examinations.officer_name', 'seal_examinations.officer_reference', 'seal_examinations.scheduled_at',
            'seal_examinations.completed_at', 'seal_examinations.outcome', 'seal_examinations.findings',
            'seal_examinations.created_at',
          ])
          .where('seal_examinations.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_examinations.created_at', 'desc');
        if (status) q = q.where('seal_examinations.status', '=', status);
        if (customs_entry_id) q = q.where('seal_examinations.customs_entry_id', '=', customs_entry_id);
        if (shipment_case_id) q = q.where('seal_lots.shipment_case_id', '=', shipment_case_id);
        return q.execute();
      });
      return rows.map(mapExamination);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/examinations/:id', async (request: any, reply) => {
    const b = examinationPatchSchema.parse(request.body);
    try {
      const patch: any = { updated_at: new Date() };
      if (b.status) patch.status = b.status;
      if (b.officerName !== undefined) patch.officer_name = b.officerName || null;
      if (b.officerReference !== undefined) patch.officer_reference = b.officerReference || null;
      if (b.scheduledAt !== undefined) patch.scheduled_at = b.scheduledAt ? new Date(b.scheduledAt) : null;
      if (b.findings !== undefined) patch.findings = b.findings || null;
      if (b.status === 'COMPLETED') {
        if (!b.outcome) return reply.status(400).send({ error: 'outcome is required to complete an examination' });
        patch.outcome = b.outcome;
        patch.completed_at = new Date();
      }
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_examinations').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).returningAll().executeTakeFirstOrThrow()
      );
      return mapExamination(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
