import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { safeFetch } from '../lib/ssrf-guard.js';
import { TRIGGERS_BY_ID } from '../studio/triggers.js';

export interface DomainEvent {
  type: string;
  sourceApp: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  /**
   * Who performed this, when a person did. Omit for background jobs and
   * scheduled work — a null actor is the honest answer there.
   *
   * Do not pass the subject of the event. `userId` on a leave request is the
   * person the leave is for, not who filed it; passing that would make the
   * activity trail attribute every action to whoever it was done to.
   */
  actorId?: string | null;
  /**
   * The domain_events row id. Set by emitDomainEvent before handlers run —
   * emitters never supply it. Subscribers that must not act twice on a
   * redelivered event use it as their idempotency key (Studio does).
   */
  id?: string;
}

type Subscriber = (tenantId: string, event: DomainEvent) => Promise<void>;

const subscribers = new Map<string, Subscriber[]>();

/**
 * Registers a handler for one event type. Called once at server boot by
 * each app's own subscriber file (e.g. subscribers/seal.subscribers.ts) —
 * the emitting app's code never needs to know who's listening, so a brand
 * new app is wired in by adding one file, not by editing ClearOS.
 */
export function registerSubscriber(eventType: string, handler: Subscriber): void {
  const list = subscribers.get(eventType) ?? [];
  list.push(handler);
  subscribers.set(eventType, list);
}

/**
 * Records a domain event and fans it out — to in-process subscribers
 * (first-party apps in this same backend) and, best-effort, to any
 * approved marketplace app that registered a webhook_url (third-party /
 * future apps). Call this alongside a mutation, inside the same
 * transaction if you have one; the log write is part of that transaction,
 * but subscriber/webhook dispatch is fire-and-forget. Use deferDispatch and
 * dispatchDomainEvent after commit when the owning transaction must succeed
 * before consumers run —
 * a subscriber's failure must never fail the caller's own request, the
 * same non-blocking rule this codebase already applies to
 * dispatchAutoComms's immediate-channel sends.
 */
export async function emitDomainEvent(trx: Transaction<Database>, tenantId: string, event: DomainEvent, options?: { deferDispatch?: boolean }): Promise<DomainEvent> {
  const row = await trx.insertInto('domain_events').values({
    tenant_id: tenantId,
    event_type: event.type,
    source_app: event.sourceApp,
    entity_type: event.entityType,
    entity_id: event.entityId,
    payload: JSON.stringify(event.payload),
    actor_id: event.actorId ?? null,
  }).returning('id').executeTakeFirstOrThrow();
  if (TRIGGERS_BY_ID.get(event.type)?.kind === 'DOMAIN_EVENT') {
    const snapshots = await trx.selectFrom('workflow_studio_apps')
      .select(['id', 'tenant_id', 'name', 'trigger_event', 'nodes', 'edges', 'targeting', 'updated_at'])
      .where('tenant_id', '=', tenantId).where('status', '=', 'ACTIVE').where('trigger_event', '=', event.type).execute();
    await trx.insertInto('studio_event_outbox').values({ tenant_id: tenantId, event_id: row.id, workflow_snapshots: JSON.stringify(snapshots) })
      .onConflict(oc => oc.doNothing()).execute();
  }

  // Handlers receive the persisted row id so they can deduplicate a redelivery.
  const delivered: DomainEvent = { ...event, id: row.id };

  if (!options?.deferDispatch) dispatchDomainEvent(tenantId, delivered);
  return delivered;
}

/** Dispatch an event after its owning transaction commits. */
let dispatchColumnAvailable: boolean | null = null;

export function dispatchDomainEvent(tenantId: string, event: DomainEvent): void {
  const handlers = subscribers.get(event.type) ?? [];
  const subscriberResults = handlers.map(handler =>
    handler(tenantId, event)
      .then(() => true as const)
      .catch(err => {
        console.error(`[DomainEvents] subscriber for "${event.type}" failed:`, err.message);
        return false as const;
      }),
  );

  Promise.all(subscriberResults).then(async (results) => {
    const allSucceeded = results.every(r => r === true);
    if (!allSucceeded) {
      console.warn(`[DomainEvents] event ${event.id ?? '?'} ("${event.type}") — one or more subscribers failed; NOT marking dispatched so recovery can retry.`);
      return;
    }
    if (event.id) {
      if (dispatchColumnAvailable === false) return;
      try {
        await withTenant(tenantId, trx =>
          trx.updateTable('domain_events')
            .set({ subscribers_dispatched: true } as any)
            .where('id', '=', event.id!)
            .where('tenant_id', '=', tenantId)
            .execute(),
        );
        if (dispatchColumnAvailable === null) dispatchColumnAvailable = true;
      } catch (err: any) {
        if (dispatchColumnAvailable === null && /subscribers_dispatched/.test(err.message)) {
          dispatchColumnAvailable = false;
          console.warn('[DomainEvents] subscribers_dispatched column not yet migrated — dispatch tracking disabled until restart.');
        } else {
          console.error(`[DomainEvents] failed to mark event ${event.id} as dispatched:`, err.message);
        }
      }
    }
  });

  dispatchToMarketplaceWebhooks(tenantId, event).catch(err =>
    console.error(`[DomainEvents] marketplace webhook dispatch failed for "${event.type}":`, err.message),
  );
}

/**
 * Replays undelivered domain events for a single tenant — picks up events
 * that were persisted but whose subscribers never ran (process crash between
 * commit and dispatch). Scoped to one tenant because domain_events has RLS.
 */
export async function replayUndeliveredEvents(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 86_400_000);
  let total = 0;
  const MAX_BATCHES = 20;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await withTenant(tenantId, async trx => {
      return sql<{ id: string; event_type: string; source_app: string; entity_type: string; entity_id: string; payload: string; actor_id: string | null }>`
        SELECT id, event_type, source_app, entity_type, entity_id, payload, actor_id
        FROM domain_events
        WHERE subscribers_dispatched = FALSE
          AND created_at > ${cutoff.toISOString()}
          AND tenant_id = ${tenantId}
        ORDER BY created_at ASC
        LIMIT 100
      `.execute(trx);
    });

    if (rows.rows.length === 0) break;

    for (const row of rows.rows) {
      const event: DomainEvent = {
        type: row.event_type, sourceApp: row.source_app, entityType: row.entity_type,
        entityId: row.entity_id, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        actorId: row.actor_id, id: row.id,
      };
      dispatchDomainEvent(tenantId, event);
      total++;
    }

    if (rows.rows.length < 100) break;
  }

  if (total > 0) console.log(`[DomainEvents] replayed ${total} undelivered event(s) for tenant ${tenantId}`);
  return total;
}

/**
 * Fans an event out to third-party apps — but only to apps THIS tenant
 * installed. marketplace_apps is a global catalog with no tenant_id, so the
 * previous `WHERE status = 'approved'` query sent every tenant's payloads to
 * every approved developer's webhook. tenant_marketplace_installs (migration
 * 156) is the join that scopes it; a tenant with no installs sends nothing.
 *
 * Each delivery is signed with the install's own secret so the receiver can
 * verify it came from us and was not replayed from another tenant.
 */
async function dispatchToMarketplaceWebhooks(tenantId: string, event: DomainEvent): Promise<void> {
  const rows = await withTenant(tenantId, trx =>
    sql<{ webhook_url: string; name: string; webhook_secret: string }>`
      SELECT a.webhook_url, a.name, i.webhook_secret
      FROM tenant_marketplace_installs i
      JOIN marketplace_apps a ON a.id = i.app_id
      WHERE i.tenant_id = ${tenantId}
        AND i.revoked_at IS NULL
        AND i.events_enabled = true
        AND a.status = 'approved'
        AND a.webhook_url IS NOT NULL
    `.execute(trx),
  );

  for (const app of rows.rows) {
    const body = JSON.stringify({
      event: event.type, sourceApp: event.sourceApp, tenantId,
      entityType: event.entityType, entityId: event.entityId, payload: event.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', app.webhook_secret).update(`${timestamp}.${body}`).digest('hex');

    // HUD-0024 continuation (Phase 6, SSRF): webhook_url is a developer-
    // submitted marketplace-app field. `approved` status is a real mitigant
    // (a human reviews the app first), but that review has no reason to
    // specifically check for an internal address, and this fires for every
    // tenant that installs the app on every one of their domain events —
    // defense in depth, not the only check.
    safeFetch(app.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hudumika-Timestamp': timestamp,
        'X-Hudumika-Signature': `sha256=${signature}`,
      },
      body,
    }).catch(err => console.error(`[DomainEvents] webhook to "${app.name}" failed:`, err.message));
  }
}

/**
 * Replays undelivered events across all tenants on server startup.
 * Uses the platform connection (dbPlatform) which bypasses RLS, since
 * the restricted app role cannot see other tenants' rows through the
 * tenant-scoped connection.
 */
export async function replayAllUndeliveredEvents(): Promise<void> {
  try {
    const colCheck = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domain_events' AND column_name = 'subscribers_dispatched'
      ) AS exists
    `.execute(dbPlatform);
    if (!colCheck.rows[0]?.exists) {
      console.log('[DomainEvents] startup recovery skipped — subscribers_dispatched column not yet migrated.');
      return;
    }

    const cutoff = new Date(Date.now() - 86_400_000);
    const tenantRows = await sql<{ tenant_id: string }>`
      SELECT DISTINCT tenant_id FROM domain_events
      WHERE subscribers_dispatched = FALSE AND created_at > ${cutoff.toISOString()}
    `.execute(dbPlatform);

    let total = 0;
    for (const { tenant_id } of tenantRows.rows) {
      total += await replayUndeliveredEvents(tenant_id);
    }
    if (total > 0) console.log(`[DomainEvents] startup recovery: replayed ${total} event(s) across ${tenantRows.rows.length} tenant(s)`);
  } catch (err: any) {
    console.error('[DomainEvents] startup recovery failed:', err.message);
  }
}

/** Convenience wrapper for call sites that don't already have an open transaction. */
export async function emitDomainEventStandalone(tenantId: string, event: DomainEvent): Promise<void> {
  await withTenant(tenantId, trx => emitDomainEvent(trx, tenantId, event));
}
