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
  await trx.insertInto('domain_events').values({
    tenant_id: tenantId,
    event_type: event.type,
    source_app: event.sourceApp,
    entity_type: event.entityType,
    entity_id: event.entityId,
    payload: JSON.stringify(event.payload),
  }).execute();

  const handlers = subscribers.get(event.type) ?? [];
  for (const handler of handlers) {
    handler(tenantId, event).catch(err =>
      console.error(`[DomainEvents] subscriber for "${event.type}" failed:`, err.message),
    );
  }

  dispatchToMarketplaceWebhooks(tenantId, event).catch(err =>
    console.error(`[DomainEvents] marketplace webhook dispatch failed for "${event.type}":`, err.message),
  );
}

async function dispatchToMarketplaceWebhooks(tenantId: string, event: DomainEvent): Promise<void> {
  const rows = await sql<{ webhook_url: string; name: string }>`
    SELECT webhook_url, name FROM marketplace_apps
    WHERE status = 'approved' AND webhook_url IS NOT NULL
  `.execute(db);

  for (const app of rows.rows) {
    fetch(app.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: event.type, sourceApp: event.sourceApp, tenantId,
        entityType: event.entityType, entityId: event.entityId, payload: event.payload,
      }),
    }).catch(err => console.error(`[DomainEvents] webhook to "${app.name}" failed:`, err.message));
  }
}

/** Convenience wrapper for call sites that don't already have an open transaction. */
export async function emitDomainEventStandalone(tenantId: string, event: DomainEvent): Promise<void> {
  await withTenant(tenantId, trx => emitDomainEvent(trx, tenantId, event));
}
