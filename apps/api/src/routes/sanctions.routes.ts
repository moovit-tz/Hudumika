import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  screenSubject, listScreenings, getScreening, getEntryDetail, reviewScreening, getLastSyncStatus,
} from '../services/sanctions.service.js';

const adhocScreenSchema = z.object({ name: z.string().trim().min(1) });
const reviewSchema = z.object({
  decision: z.enum(['cleared_false_positive', 'confirmed_match']),
  note: z.string().trim().optional(),
});

export async function sanctionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  fastify.get('/screenings', async (request: any, reply) => {
    const { status } = request.query as { status?: string };
    try {
      return await listScreenings(request.user.tenant_id, status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/screenings/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const row = await getScreening(request.user.tenant_id, id);
    if (!row) return reply.status(404).send({ error: 'Screening not found' });
    return row;
  });

  fastify.post('/screen', async (request: any, reply) => {
    const { name } = adhocScreenSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await screenSubject(request.user.tenant_id, 'adhoc', null, name)
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/screenings/:id/review', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const { decision, note } = reviewSchema.parse(request.body);
    try {
      return await reviewScreening(request.user.tenant_id, id, request.user.sub, decision, note ?? null);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Platform reference data (the matched sanctions list entry) — no
  // tenant_id on sanctions_entries, so this is a lookup, not a tenant-scoped
  // fetch. Still gated behind clearos auth: it's the "why was this flagged"
  // detail a reviewer opens from a screening row, not a public endpoint.
  fastify.get('/entries/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const entry = await getEntryDetail(id);
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });
    return entry;
  });

  fastify.get('/sync-status', async (_request, reply) => {
    try {
      return await getLastSyncStatus();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
