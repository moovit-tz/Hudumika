import { randomUUID } from 'node:crypto';
import { dbPlatform } from '../db/client.js';
import { sendSlackAlert } from './lens-adapters.service.js';

export interface EmitEventParams {
  eventName: string;
  aggregateType?: string;
  aggregateId: string;
  payload: Record<string, any>;
  correlationId?: string;
  causationId?: string;
}

/**
 * Persist an event transactionally to the durable outbox.
 */
export async function emitLensOutboxEvent(params: EmitEventParams): Promise<string> {
  const row = await dbPlatform.insertInto('lens_outbox_events').values({
    event_name: params.eventName,
    aggregate_type: params.aggregateType ?? 'lens_item',
    aggregate_id: params.aggregateId,
    payload: JSON.stringify(params.payload) as any,
    correlation_id: params.correlationId ?? null,
    causation_id: params.causationId ?? null,
    status: 'pending',
    attempts: 0,
    available_at: new Date(),
  }).returningAll().executeTakeFirstOrThrow();

  return row.id;
}

/**
 * Lease-based outbox batch processor.
 */
export async function processLensOutbox(limit = 25): Promise<{ processed: number; errors: number }> {
  const now = new Date();
  const lease = randomUUID();

  // Find due events
  const due = await dbPlatform.selectFrom('lens_outbox_events')
    .selectAll()
    .where('status', 'in', ['pending', 'processing'])
    .where('available_at', '<=', now)
    .orderBy('available_at', 'asc')
    .limit(limit)
    .execute();

  if (due.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  for (const item of due) {
    // Acquire lease
    const claimed = await dbPlatform.updateTable('lens_outbox_events')
      .set({
        status: 'processing',
        lease_id: lease,
        attempts: item.attempts + 1,
        available_at: new Date(Date.now() + 5 * 60_000),
      })
      .where('id', '=', item.id)
      .where('status', 'in', ['pending', 'processing'])
      .executeTakeFirst();

    if (claimed.numUpdatedRows === 0n) continue;

    try {
      const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
      await dispatchOutboxEvent(item.event_name, payload);

      await dbPlatform.updateTable('lens_outbox_events')
        .set({
          status: 'delivered',
          lease_id: null,
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .where('lease_id', '=', lease)
        .execute();

      processed++;
    } catch (err: any) {
      errors++;
      const nextDelayMinutes = Math.min(60, 2 ** (item.attempts + 1));
      const dead = item.attempts >= 5;

      await dbPlatform.updateTable('lens_outbox_events')
        .set({
          status: dead ? 'dead' : 'pending',
          error_message: err?.message || 'Dispatch error',
          available_at: new Date(Date.now() + nextDelayMinutes * 60_000),
          lease_id: null,
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .where('lease_id', '=', lease)
        .execute();
    }
  }

  return { processed, errors };
}

/**
 * Handle notification dispatching based on event type.
 */
async function dispatchOutboxEvent(eventName: string, payload: any): Promise<void> {
  // Check if any Slack connection is configured
  const slackConn = await dbPlatform.selectFrom('lens_connection_instances')
    .select('id')
    .where('provider', '=', 'slack')
    .where('status', '=', 'connected')
    .executeTakeFirst();

  if (!slackConn) return;

  if (eventName === 'lens.report.created') {
    await sendSlackAlert(slackConn.id, {
      title: `🚨 New Defect Reported: [${payload.source_app?.toUpperCase()}] ${payload.title}`,
      text: `${payload.summary}\n*Reporter:* ${payload.reporter_name || payload.reporter_email || 'Staff'}\n*Severity:* ${payload.severity}`,
      fields: [
        { title: 'App', value: payload.source_app },
        { title: 'Route', value: payload.source_route || 'N/A' },
      ],
    });
  } else if (eventName === 'lens.item.created') {
    await sendSlackAlert(slackConn.id, {
      title: `🛠️ Lens Item Opened: ${payload.ref} — ${payload.title}`,
      text: `${payload.body || 'No description provided'}\n*Kind:* ${payload.kind} | *Severity:* ${payload.severity} | *Confidence:* ${payload.confidence}`,
    });
  }
}
