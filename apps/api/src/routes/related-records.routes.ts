import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { RELATED_REGISTRY } from '../lib/related-records.js';

/**
 * GET /v1/related/:entityType/:entityId
 * The generalized cross-app "what's linked to this record" lookup — see
 * related-records.ts's own header comment. Returns one entry per relation
 * that actually has rows, keyed by the relation's own key, so a page can
 * `Object.values(...)` and render a card per non-empty relation without
 * knowing in advance which ones exist for this entity type.
 */
export async function relatedRecordsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get<{ Params: { entityType: string; entityId: string } }>('/:entityType/:entityId', async (request, reply) => {
    const user = request.user;
    const { entityType, entityId } = request.params;

    const config = RELATED_REGISTRY[entityType];
    if (!config) return reply.status(404).send({ error: `Unknown related-records entity type: ${entityType}` });

    return withTenant(user.tenant_id, async (trx) => {
      const entity = await config.resolve(trx, user.tenant_id, entityId);
      if (!entity) return reply.status(404).send({ error: 'Record not found' });

      const result: Record<string, { appLabel: string; appIcon: string; appColor: string; appHref: string; items: unknown[] }> = {};
      await Promise.all(config.relations.map(async (relation) => {
        try {
          const items = await relation.fetch(trx, user.tenant_id, entity);
          if (items.length > 0) {
            result[relation.key] = { appLabel: relation.appLabel, appIcon: relation.appIcon, appColor: relation.appColor, appHref: relation.appHref, items };
          }
        } catch {
          // This tenant doesn't have the relevant app/table provisioned, or
          // the query itself failed — one relation's absence must never
          // break the rest of the panel (same convention the original
          // /v1/shipments/:id/linked endpoint already established).
        }
      }));

      return result;
    });
  });
}
