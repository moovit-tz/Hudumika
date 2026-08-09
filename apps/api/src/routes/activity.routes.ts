import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

/**
 * One activity trail, for any record in the platform.
 *
 * Every list page in the product this was compared against carries a per-record
 * Activity trail, and ours had none — except three separate, differently-shaped
 * logs (`hr_activity_log`, `invoice_activity_log`, `contact_activity_log`) that
 * between them held eleven rows and covered two entity types.
 *
 * Rather than add a fourth, this reads `domain_events`, which already records
 * what happened to which record across every app and is written to by the event
 * bus the apps already use. Anything that emits a domain event gets an activity
 * trail for free, including apps added later — which is the whole point of doing
 * it once instead of per page.
 */

/**
 * Entity types a caller may ask about.
 *
 * A whitelist rather than a free-text parameter, because `entity_id` is a bare
 * uuid with no foreign key: without this, `GET /activity/anything/<uuid>` is a
 * probe that tells you whether a given id exists in this tenant and what
 * happened to it. Tenant scoping stops cross-tenant reads; it does not stop
 * someone browsing entity types they have no business seeing.
 */
const READABLE_ENTITIES = new Set([
  'user', 'shipment', 'declaration', 'invoice', 'customer', 'lead',
  'leave', 'overtime', 'payroll_run', 'seal_lot', 'seal_fulfillment_order',
  'ticket', 'task', 'document', 'hr_holidays', 'quotation', 'product',
]);

export async function activityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/activity/:entityType/:entityId
   *
   * Newest first. The actor is joined rather than read out of the payload —
   * see the migration note: the payload keys that look like an actor name the
   * subject of the event, so trusting them attributes each action to whoever it
   * was done to.
   */
  fastify.get<{
    Params: { entityType: string; entityId: string };
    Querystring: { limit?: string };
  }>('/:entityType/:entityId', async (request, reply) => {
    const user = request.user;
    const { entityType, entityId } = request.params;
    if (!READABLE_ENTITIES.has(entityType)) {
      return reply.status(400).send({
        error: `No activity trail is published for "${entityType}".`,
      });
    }
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);

    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx
        .selectFrom('domain_events as e')
        .leftJoin('users as u', 'u.id', 'e.actor_id')
        .select(['e.id', 'e.event_type', 'e.source_app', 'e.payload', 'e.created_at',
                 'e.actor_id', 'u.name as actor_name'])
        .where('e.tenant_id', '=', user.tenant_id)
        .where('e.entity_type', '=', entityType)
        .where('e.entity_id', '=', entityId)
        .orderBy('e.created_at', 'desc')
        .limit(limit)
        .execute();

      return rows.map(r => ({
        id: r.id,
        event_type: r.event_type,
        source_app: r.source_app,
        payload: r.payload,
        created_at: r.created_at,
        actor_id: r.actor_id,
        // Null stays null. "System" is a claim about how it happened; an older
        // row simply never recorded an actor, and the screen says which.
        actor_name: r.actor_name ?? null,
      }));
    });
  });
}
