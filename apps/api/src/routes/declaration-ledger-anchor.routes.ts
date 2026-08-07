import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { DeclarationAnchorService, NothingToAnchor } from '../services/declaration-anchor.service.js';

// External ledger anchoring for ClearOS's declaration_events chain — HTTP
// surface over DeclarationAnchorService. Any ClearOS-entitled user may
// trigger "Anchor Now" (anchoring itself can't corrupt anything — it's a
// read of the ledger plus an external stamp, never a write to
// declarations/declaration_events), matching the same scope decision
// already confirmed for SEAL's identical feature.

function mapAnchor(row: any) {
  return {
    id: row.id, checkpointHash: row.checkpoint_hash,
    declarationCount: row.declaration_count, status: row.status,
    bitcoinBlockHeight: row.bitcoin_block_height, bitcoinBlockTime: row.bitcoin_block_time,
    trigger: row.trigger, requestedBy: row.requested_by, errorMessage: row.error_message,
    lastCheckedAt: row.last_checked_at, createdAt: row.created_at,
  };
}

export async function declarationLedgerAnchorRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  fastify.get('/anchors', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('declaration_ledger_anchors').selectAll()
          .where('tenant_id', '=', request.user.tenant_id)
          .orderBy('created_at', 'desc')
          .execute()
      );
      return rows.map(mapAnchor);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Real, immediate action — builds the checkpoint from the live ledger and
  // submits it to the public OpenTimestamps calendar servers, so this call
  // genuinely takes a few seconds (real network round-trips), not a
  // simulated instant response.
  fastify.post('/anchors', async (request: any, reply) => {
    try {
      const anchor = await withTenant(request.user.tenant_id, trx =>
        DeclarationAnchorService.anchorTenant(trx, request.user.tenant_id, {
          trigger: 'manual', requestedBy: request.user.sub,
        })
      );
      return mapAnchor(anchor);
    } catch (err: any) {
      if (err instanceof NothingToAnchor) return reply.status(422).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/anchors/:id/check', async (request: any, reply) => {
    try {
      const anchor = await withTenant(request.user.tenant_id, trx =>
        DeclarationAnchorService.checkAnchorConfirmation(trx, request.user.tenant_id, request.params.id)
      );
      return mapAnchor(anchor);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Streams the raw .ots proof file — the actual trust-outside-Hudumika
  // payload. Anyone can verify this with an independent OpenTimestamps tool
  // against Bitcoin themselves, without trusting Hudumika's own "confirmed"
  // status at all.
  fastify.get('/anchors/:id/proof', async (request: any, reply) => {
    try {
      const anchor = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('declaration_ledger_anchors').select(['ots_proof', 'ots_proof_upgraded', 'checkpoint_hash'])
          .where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!anchor) return reply.status(404).send({ error: 'Anchor not found' });
      const bytes = anchor.ots_proof_upgraded ?? anchor.ots_proof;
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${anchor.checkpoint_hash}.ots"`);
      return reply.send(bytes);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
