import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';

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
  'onsite_domain', 'onsite_dns_record', 'onsite_application', 'onsite_deployment',
  'onsite_server', 'onsite_website', 'onsite_backup',
]);

export async function activityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/activity — everything that happened in this workspace.
   *
   * The per-entity trail below answers "what happened to this shipment". A
   * tenant administrator has the other question — "what has been happening
   * here, and who did it" — and there was no way to ask it. Settings changes in
   * particular left no trace at all, including SMTP credentials and which apps
   * the whole workspace can see.
   *
   * Restricted to administrators, because a full workspace feed names who
   * touched what across every app; that is a governance view, not a general
   * one. MANAGER included alongside the platform-admin roles — Team.tsx's
   * own frontend gate (AdminShell.tsx) already let MANAGER into this page;
   * this route hadn't, so a MANAGER's Activity tab 403'd silently until now.
   */
  fastify.get<{
    Querystring: { limit?: string; before?: string; type?: string; entity?: string; source_app?: string };
  }>('/', { preHandler: requireRoleOrOrgPermission(ORG_PERMISSIONS.TEAM_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request) => {
    const user = request.user;
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
    const { before, type, entity, source_app } = request.query;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx
        .selectFrom('domain_events as e')
        .leftJoin('users as u', 'u.id', 'e.actor_id')
        .select(['e.id', 'e.event_type', 'e.source_app', 'e.entity_type', 'e.entity_id',
                 'e.payload', 'e.created_at', 'e.actor_id', 'u.name as actor_name'])
        .where('e.tenant_id', '=', user.tenant_id)
        .orderBy('e.created_at', 'desc')
        .limit(limit);

      // Keyset pagination on created_at: an offset would skip or repeat rows as
      // new events land while somebody is reading.
      if (before) q = q.where('e.created_at', '<', new Date(before));
      if (type) q = q.where('e.event_type', '=', type);
      if (entity) q = q.where('e.entity_type', '=', entity);
      // Coarser than `entity`/`type` — lets a caller like Onsite's Audit Feed
      // ask for "everything this app did" without knowing every entity type
      // it emits.
      if (source_app) q = q.where('e.source_app', '=', source_app);

      const rows = await q.execute();
      return rows.map(r => ({
        id: r.id,
        event_type: r.event_type,
        source_app: r.source_app,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        payload: r.payload,
        created_at: r.created_at,
        actor_id: r.actor_id,
        // Null stays null — an older row simply never recorded an actor, and
        // "System" would be a claim about how it happened.
        actor_name: r.actor_name ?? null,
      }));
    });
  });

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
      // 'task' (personal Tasks app, migrations 283/284) is unlike every
      // other entry in READABLE_ENTITIES — a shipment or invoice is
      // visible tenant-wide to relevant staff already, but a task is
      // private to its owner, assignee, and anyone its list has been
      // shared with. The whitelist above stops entity-type probing; it
      // doesn't stop one tenant user reading another's private task
      // activity by guessing/enumerating a UUID, so that specific entity
      // type gets its own ownership check here rather than a blanket
      // tenant-wide read.
      if (entityType === 'task') {
        const task = await trx.selectFrom('tasks').select(['user_id', 'assignee_id', 'list_id'])
          .where('id', '=', entityId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        const hasAccess = task && (
          task.user_id === user.sub || task.assignee_id === user.sub ||
          !!(await trx.selectFrom('task_list_shares').select('id')
            .where('list_id', '=', task.list_id).where('user_id', '=', user.sub).executeTakeFirst())
        );
        if (!hasAccess) return reply.status(404).send({ error: 'Task not found' });
      }

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
