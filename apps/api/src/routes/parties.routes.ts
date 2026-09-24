import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PartyService, PartyError, type PartyActor } from '../services/party.service.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';

const visibility = z.enum(['PRIVATE', 'TEAM', 'DEPARTMENT', 'TENANT', 'EXPLICIT_SHARE']);
const channel = z.object({
  type: z.enum(['EMAIL', 'PHONE', 'MOBILE', 'WHATSAPP', 'WEBSITE', 'LINKEDIN', 'ADDRESS', 'OTHER']),
  value: z.string().trim().min(1).max(500), label: z.string().trim().max(50).optional(),
  context: z.enum(['PERSONAL', 'WORK', 'ORGANIZATION', 'OTHER']).optional(),
  is_primary: z.boolean().optional(), visibility: visibility.optional(),
});
const personFields = {
  first_name: z.string().trim().min(1).max(120), middle_name: z.string().trim().max(120).optional(), last_name: z.string().trim().max(120).optional(),
  preferred_name: z.string().trim().max(120).optional(), title: z.string().trim().max(120).optional(), birthday: z.string().date().optional(),
};
const orgFields = {
  legal_name: z.string().trim().min(1).max(300), trading_name: z.string().trim().max(300).optional(), registration_number: z.string().trim().max(150).optional(),
  tax_identifier: z.string().trim().max(150).optional(), website: z.string().trim().max(500).optional(), industry: z.string().trim().max(200).optional(),
};
const orgRole = { role: z.enum(['customer', 'supplier']).optional() };
const common = { visibility: visibility.optional(), source_system: z.string().trim().max(50).optional(), channels: z.array(channel).max(30).optional() };
const createParty = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PERSON'), ...personFields, ...common }),
  z.object({ type: z.literal('ORGANIZATION'), ...orgFields, ...orgRole, ...common }),
]);
const patchParty = z.object({
  ...Object.fromEntries(Object.entries({ ...personFields, ...orgFields }).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])),
  visibility: visibility.optional(), channels: z.array(channel).max(30).optional(),
}).partial();
const sharesBody = z.object({
  shares: z.array(z.object({
    principal_type: z.enum(['USER', 'TEAM', 'DEPARTMENT']), principal_id: z.string().uuid(), permission: z.enum(['VIEW', 'EDIT', 'MANAGE']).optional(),
  })).max(100),
});
const idParam = z.object({ id: z.string().uuid() });

/**
 * Canonical Party API. Available to staff of any workspace that has at least
 * one app that uses parties (Contacts, CRM, Finance, ClearOS) — the directory
 * is shared across them, so it is not gated on Contacts alone — but never to
 * external CUSTOMER logins. Visibility (lib/party-visibility.ts) is enforced
 * server-side on every read and write.
 */
export async function partiesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['contacts', 'crm', 'finops', 'clearos']));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type.' });
  });
  // PartyError → its own status/code; anything else (zod, DB) keeps flowing to the global handler.
  const guard = (fn: (request: any, reply: any) => Promise<any>) => async (request: any, reply: any) => {
    try { return await fn(request, reply); }
    catch (err: any) {
      if (err instanceof PartyError) return reply.status(err.status).send({ error: err.code, message: err.message });
      throw err;
    }
  };
  const r = {
    get: (path: string, fn: (request: any, reply: any) => Promise<any>) => fastify.get(path, guard(fn)),
    post: (path: string, fn: (request: any, reply: any) => Promise<any>) => fastify.post(path, guard(fn)),
    patch: (path: string, fn: (request: any, reply: any) => Promise<any>) => fastify.patch(path, guard(fn)),
    put: (path: string, fn: (request: any, reply: any) => Promise<any>) => fastify.put(path, guard(fn)),
  };

  const actorOf = (request: any): PartyActor => ({ id: request.user.sub, tenantId: request.user.tenant_id, role: request.user.role });

  r.get('/', async (request: any) => {
    const q = z.object({
      q: z.string().max(200).optional(), type: z.enum(['PERSON', 'ORGANIZATION']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional(),
      include_archived: z.enum(['true', 'false']).optional(),
    }).parse(request.query);
    return { data: await PartyService.list(actorOf(request), { ...q, includeArchived: q.include_archived === 'true' }) };
  });

  // People, teams and departments a share can name. Registered before '/:id' so it is not read as an id.
  r.get('/principals', async (request: any) => {
    const { q } = z.object({ q: z.string().max(100).optional() }).parse(request.query);
    return PartyService.principals(actorOf(request), q);
  });

  // Same company as customer AND supplier — suggestions, and manager-confirmed links. Static paths
  // are registered before '/:id'.
  r.get('/link-suggestions', async (request: any) => ({ data: await PartyService.linkSuggestions(actorOf(request)) }));
  r.get('/links', async (request: any) => ({ data: await PartyService.linkedPairs(actorOf(request)) }));
  const pairBody = z.object({ a: z.string().uuid(), b: z.string().uuid() });
  r.post('/links', async (request: any) => { const b = pairBody.parse(request.body); return PartyService.linkOrganizations(actorOf(request), b.a, b.b); });
  r.post('/links/dismiss', async (request: any) => { const b = pairBody.parse(request.body); return PartyService.dismissLink(actorOf(request), b.a, b.b); });
  r.post('/links/remove', async (request: any) => { const b = pairBody.parse(request.body); return PartyService.unlinkOrganizations(actorOf(request), b.a, b.b); });

  r.get('/duplicates', async (request: any) => {
    const q = z.object({ email: z.string().email().optional(), phone: z.string().max(80).optional() }).refine(v => v.email || v.phone, 'email or phone is required').parse(request.query);
    return { data: await PartyService.duplicateCandidates(actorOf(request), q.email, q.phone) };
  });

  r.post('/merge', async (request: any) => {
    const body = z.object({ primary_id: z.string().uuid(), duplicate_ids: z.array(z.string().uuid()).min(1).max(20) }).parse(request.body);
    return PartyService.merge(actorOf(request), body.primary_id, body.duplicate_ids);
  });

  r.get('/:id', async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const row = await PartyService.get(actorOf(request), id);
    if (!row) return reply.status(404).send({ error: 'Party not found.' });
    return row;
  });

  r.post('/', async (request: any, reply) => {
    const input = createParty.parse(request.body);
    const actor = actorOf(request);
    const firstChannel = input.channels?.find(c => c.type === 'EMAIL' || c.type === 'PHONE');
    if (firstChannel) {
      const candidates = await PartyService.duplicateCandidates(actor, firstChannel.type === 'EMAIL' ? firstChannel.value : undefined, firstChannel.type === 'PHONE' ? firstChannel.value : undefined);
      if (candidates.length && (request.query as any)?.allow_duplicate !== 'true') {
        return reply.status(409).send({ error: 'Possible duplicate party found.', code: 'PARTY_DUPLICATE', candidates });
      }
    }
    return reply.status(201).send(await PartyService.create(actor, input));
  });

  r.patch('/:id', async (request: any) => {
    const { id } = idParam.parse(request.params);
    return PartyService.update(actorOf(request), id, patchParty.parse(request.body));
  });

  r.get('/:id/references', async (request: any) => PartyService.references(actorOf(request), idParam.parse(request.params).id));

  r.post('/:id/archive', async (request: any) => PartyService.setArchived(actorOf(request), idParam.parse(request.params).id, true));
  r.post('/:id/restore', async (request: any) => PartyService.setArchived(actorOf(request), idParam.parse(request.params).id, false));

  r.get('/:id/shares', async (request: any) => ({ data: await PartyService.getShares(actorOf(request), idParam.parse(request.params).id) }));
  r.put('/:id/shares', async (request: any) => ({ data: await PartyService.setShares(actorOf(request), idParam.parse(request.params).id, sharesBody.parse(request.body).shares) }));
}
