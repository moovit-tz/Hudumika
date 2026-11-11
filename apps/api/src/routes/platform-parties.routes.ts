import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { PartyService, PartyError, type PartyActor } from '../services/party.service.js';

/**
 * Platform foundation Phase 3: a narrow, scoped surface onto the existing
 * party model for genuinely independent apps (e.g. tuma-web) authenticating
 * with a tenant-scoped `x-api-key`, not a new auth mechanism. Gated by the
 * 'platform.parties' key scope (checked here, same ad-hoc pattern as
 * finance-documents.routes.ts's own apiKeyScopes check) — a key without it
 * gets 403 regardless of acting_role. Write access (create) is further
 * limited by the key's existing `read_only` flag, enforced generically in
 * middleware/auth.ts — no new write gate needed here.
 *
 * Search-or-create only; no update/merge/list-everything — those stay
 * internal to the party UI and its reviewed merge workflow.
 */

const SCOPE = 'platform.parties';

const searchQuery = z.object({
  q: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const createBody = z.object({
  type: z.enum(['PERSON', 'ORGANIZATION']),
  // PERSON
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().optional(),
  // ORGANIZATION — created as a customer or supplier record (see note above);
  // defaults to 'customer', the natural fit for an external party being served.
  legal_name: z.string().trim().min(1).optional(),
  role: z.enum(['customer', 'supplier']).optional(),
  // Shared
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(3).optional(),
  external_ref: z.string().trim().min(1).max(200).optional(),
});

export async function platformPartiesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.apiKeyScopes && !request.apiKeyScopes.includes(SCOPE)) {
      return reply.status(403).send({ error: `This API key does not have the '${SCOPE}' scope.` });
    }
  });

  // Every caller here authenticates via x-api-key (never a human JWT session),
  // so request.user.sub is a synthetic 'apikey:<id>' string, not a real users.id
  // UUID — passing it as the party actor would make every ownership comparison
  // in party.service.ts/party-visibility.ts try to compare a UUID column to a
  // non-UUID literal and throw. null means "no human actor", which resolves
  // every ownership check to false/NULL instead, exactly as intended.
  const actorOf = (request: { user: { tenant_id: string; role?: string } }): PartyActor =>
    ({ id: null, tenantId: request.user.tenant_id, role: request.user.role });

  // GET /v1/platform/parties/search — find a party by name/phone/email; never auto-merges.
  fastify.get('/search', async (request, reply) => {
    const parsed = searchQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    const { q, phone, email, limit } = parsed.data;
    const term = q ?? phone ?? email;
    if (!term) return reply.status(400).send({ error: 'Provide at least one of q, phone, or email.' });

    const results = await PartyService.list(actorOf(request), { q: term, limit: limit ?? 20 });
    return { parties: results };
  });

  // GET /v1/platform/parties/by-external-ref/:source/:ref — idempotent lookup
  // for a caller that keeps its own foreign key (tuma-web's shipment id, etc.).
  fastify.get<{ Params: { source: string; ref: string } }>('/by-external-ref/:source/:ref', async (request, reply) => {
    const { source, ref } = request.params;
    const user = request.user;
    const row = await withTenant(user.tenant_id, trx =>
      trx.selectFrom('party_external_refs').select('party_id')
        .where('tenant_id', '=', user.tenant_id).where('source_system', '=', source).where('external_id', '=', ref)
        .executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'No party linked to this external reference yet.' });
    const party = await withTenant(user.tenant_id, trx =>
      trx.selectFrom('parties').selectAll().where('id', '=', row.party_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst());
    if (!party) return reply.status(404).send({ error: 'Linked party no longer exists.' });
    return { party };
  });

  // POST /v1/platform/parties — create a party (PERSON or ORGANIZATION), optionally
  // idempotent on an external_ref so a retried call never duplicates a record.
  fastify.post('/', async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    const body = parsed.data;
    const user = request.user;

    if (body.external_ref) {
      const existing = await withTenant(user.tenant_id, trx =>
        trx.selectFrom('party_external_refs').select('party_id')
          .where('tenant_id', '=', user.tenant_id).where('source_system', '=', 'TUMA').where('external_id', '=', body.external_ref!)
          .executeTakeFirst());
      if (existing) {
        const party = await withTenant(user.tenant_id, trx =>
          trx.selectFrom('parties').selectAll().where('id', '=', existing.party_id).where('tenant_id', '=', user.tenant_id).executeTakeFirstOrThrow());
        return { party, created: false };
      }
    }

    if (body.type === 'PERSON' && !body.first_name) return reply.status(400).send({ error: 'first_name is required for a PERSON party.' });
    if (body.type === 'ORGANIZATION' && !body.legal_name) return reply.status(400).send({ error: 'legal_name is required for an ORGANIZATION party.' });

    const channels = [
      body.email ? { type: 'EMAIL' as const, value: body.email, is_primary: true } : null,
      body.phone ? { type: 'PHONE' as const, value: body.phone, is_primary: true } : null,
    ].filter((c): c is { type: 'EMAIL' | 'PHONE'; value: string; is_primary: true } => c !== null);

    try {
      const party = await PartyService.create(actorOf(request), {
        type: body.type,
        first_name: body.first_name,
        last_name: body.last_name,
        legal_name: body.legal_name,
        role: body.role ?? 'customer',
        channels,
        source_system: 'TUMA',
      });

      if (body.external_ref) {
        await withTenant(user.tenant_id, trx =>
          trx.insertInto('party_external_refs').values({
            tenant_id: user.tenant_id, party_id: party.id, source_system: 'TUMA', external_id: body.external_ref!,
          }).onConflict(oc => oc.columns(['tenant_id', 'source_system', 'external_id']).doNothing()).execute());
      }

      reply.status(201);
      return { party, created: true };
    } catch (err) {
      if (err instanceof PartyError) return reply.status(err.status).send({ error: err.message, code: err.code });
      throw err;
    }
  });
}
