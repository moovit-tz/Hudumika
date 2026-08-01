import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import { db, withTenant } from '../db/client.js';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export interface DomainEvent {
  type: string;
  sourceApp: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
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
 * but subscriber/webhook dispatch always happens fire-and-forget after —
 * a subscriber's failure must never fail the caller's own request, the
 * same non-blocking rule this codebase already applies to
 * dispatchAutoComms's immediate-channel sends.
 */
export async function emitDomainEvent(trx: Transaction<Database>, tenantId: string, event: DomainEvent): Promise<void> {
  const row = await trx.insertInto('domain_events').values({
    tenant_id: tenantId,
    event_type: event.type,
    source_app: event.sourceApp,
    entity_type: event.entityType,
    entity_id: event.entityId,
    payload: JSON.stringify(event.payload),
  }).returning('id').executeTakeFirstOrThrow();

  // Handlers receive the persisted row id so they can deduplicate a redelivery.
  const delivered: DomainEvent = { ...event, id: row.id };

  const handlers = subscribers.get(event.type) ?? [];
  for (const handler of handlers) {
    handler(tenantId, delivered).catch(err =>
      console.error(`[DomainEvents] subscriber for "${event.type}" failed:`, err.message),
    );
  }

  dispatchToMarketplaceWebhooks(tenantId, event).catch(err =>
    console.error(`[DomainEvents] marketplace webhook dispatch failed for "${event.type}":`, err.message),
  );
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
  const rows = await sql<{ webhook_url: string; name: string; webhook_secret: string }>`
    SELECT a.webhook_url, a.name, i.webhook_secret
    FROM tenant_marketplace_installs i
    JOIN marketplace_apps a ON a.id = i.app_id
    WHERE i.tenant_id = ${tenantId}
      AND i.revoked_at IS NULL
      AND i.events_enabled = true
      AND a.status = 'approved'
      AND a.webhook_url IS NOT NULL
  `.execute(db);

  for (const app of rows.rows) {
    const body = JSON.stringify({
      event: event.type, sourceApp: event.sourceApp, tenantId,
      entityType: event.entityType, entityId: event.entityId, payload: event.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', app.webhook_secret).update(`${timestamp}.${body}`).digest('hex');

    fetch(app.webhook_url, {
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

/** Convenience wrapper for call sites that don't already have an open transaction. */
export async function emitDomainEventStandalone(tenantId: string, event: DomainEvent): Promise<void> {
  await withTenant(tenantId, trx => emitDomainEvent(trx, tenantId, event));
}
