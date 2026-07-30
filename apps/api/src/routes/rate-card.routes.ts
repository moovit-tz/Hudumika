import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UserRole } from '@hudumika/types';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { rateCardService, RATE_CARD_KEYS, type RateCardKey } from '../services/rate-card.service.js';

const RC_WRITE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

function isCard(v: string): v is RateCardKey {
  return (RATE_CARD_KEYS as string[]).includes(v);
}

export async function rateCardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  // GET /v1/rate-card/icd-operators/search?q= — search the global ICD
  // directory (Tools -> Reference -> ICD) so a tenant can attach a rate
  // card to a real licensed operator instead of typing a freeform name.
  fastify.get('/icd-operators/search', async (req: FastifyRequest) => {
    const { q } = req.query as { q?: string };
    const data = await rateCardService.searchIcdOperators(q ?? '');
    return { data };
  });

  // GET /v1/rate-card/:card/icd-operators — ICD operators this tenant has
  // an actual (non-generic) rate card for, under this card.
  fastify.get('/:card/icd-operators', async (req: FastifyRequest, reply) => {
    const { card } = req.params as { card: string };
    if (!isCard(card)) return reply.status(400).send({ error: `Unknown card "${card}" — expected one of ${RATE_CARD_KEYS.join(', ')}` });
    const data = await rateCardService.listOperatorsForCard(req.user.tenant_id, card);
    return { data };
  });

  // GET /v1/rate-card/:card?icd_operator_id= — full template + any freeform
  // extras. Omitting icd_operator_id returns the card's generic default.
  fastify.get('/:card', async (req: FastifyRequest, reply) => {
    const { card } = req.params as { card: string };
    const { icd_operator_id } = req.query as { icd_operator_id?: string };
    if (!isCard(card)) return reply.status(400).send({ error: `Unknown card "${card}" — expected one of ${RATE_CARD_KEYS.join(', ')}` });
    const items = await rateCardService.listCard(req.user.tenant_id, card, icd_operator_id ?? null);
    return { data: items };
  });

  // GET /v1/rate-card/:card/defaults?icd_operator_id= — { CODE: amount }
  // map used by the Landed Cost Calculator to preload defaults
  fastify.get('/:card/defaults', async (req: FastifyRequest, reply) => {
    const { card } = req.params as { card: string };
    const { icd_operator_id } = req.query as { icd_operator_id?: string };
    if (!isCard(card)) return reply.status(400).send({ error: `Unknown card "${card}"` });
    const data = await rateCardService.getDefaults(req.user.tenant_id, card, icd_operator_id ?? null);
    return { data };
  });

  // PATCH /v1/rate-card/:card/:code — edit one of the card's template rows
  fastify.patch('/:card/:code', { preHandler: requireRole(...RC_WRITE_ROLES) }, async (req, reply) => {
    const { card, code } = req.params as { card: string; code: string };
    if (!isCard(card)) return reply.status(400).send({ error: `Unknown card "${card}"` });
    const body = req.body as { rate_amount?: number; rate_currency?: string; notes?: string | null; min_charge?: number | null; icd_operator_id?: string | null };
    try {
      const row = await rateCardService.upsertTemplateItem(req.user.tenant_id, card, code, body, req.user.sub, body.icd_operator_id ?? null);
      return { data: row };
    } catch (e: any) {
      return reply.status(400).send({ error: e.message ?? 'Update failed' });
    }
  });

  // PATCH /v1/rate-card/:card/item/:id — edit a freeform extra row by id
  fastify.patch('/:card/item/:id', { preHandler: requireRole(...RC_WRITE_ROLES) }, async (req, reply) => {
    const { id } = req.params as { card: string; id: string };
    const body = req.body as { charge_name?: string; unit?: string; rate_amount?: number; rate_currency?: string; notes?: string | null; min_charge?: number | null };
    const row = await rateCardService.updateItem(req.user.tenant_id, id, body);
    if (!row) return reply.status(404).send({ error: 'Item not found' });
    return { data: row };
  });

  // POST /v1/rate-card/:card — add a freeform extra line item, optionally
  // scoped to a specific ICD operator via body.icd_operator_id
  fastify.post('/:card', { preHandler: requireRole(...RC_WRITE_ROLES) }, async (req, reply) => {
    const { card } = req.params as { card: string };
    if (!isCard(card)) return reply.status(400).send({ error: `Unknown card "${card}"` });
    const body = req.body as { category?: 'ICD' | 'AGENCY' | 'OTHER'; charge_name?: string; unit?: string; rate_amount?: number; rate_currency?: string; notes?: string; min_charge?: number | null; icd_operator_id?: string | null };
    if (!body.charge_name) return reply.status(400).send({ error: 'charge_name is required' });
    const row = await rateCardService.addCustomItem(req.user.tenant_id, card, { category: body.category ?? 'OTHER', charge_name: body.charge_name, unit: body.unit, rate_amount: body.rate_amount, rate_currency: body.rate_currency, notes: body.notes, min_charge: body.min_charge }, req.user.sub, body.icd_operator_id ?? null);
    return reply.status(201).send({ data: row });
  });

  // DELETE /v1/rate-card/:card/:id — only freeform extras have a real id
  // client-side before any edit; template rows can also be deleted (falls
  // back to the zero-rate virtual row on next GET, same as never having
  // been saved).
  fastify.delete('/:card/:id', { preHandler: requireRole(...RC_WRITE_ROLES) }, async (req, reply) => {
    const { id } = req.params as { card: string; id: string };
    const row = await rateCardService.deleteItem(req.user.tenant_id, id);
    if (!row) return reply.status(404).send({ error: 'Item not found' });
    return { data: row };
  });
}
