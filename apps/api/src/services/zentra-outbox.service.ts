import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { evaluateZentraRiskRulesForEvent } from './zentra-risk.service.js';

export interface OutboxProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

/**
 * Move queued events from zentra_event_outbox into the audit log, then run
 * the risk rules on each. Runs from the job scheduler every minute
 * (jobs/index.ts), not from a tenant-facing route: it reads every tenant's
 * queue through dbPlatform.
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED and flipped to 'processing'
 * in one statement, so two API instances never process the same event. A
 * row stuck in 'processing' for 10 minutes (a crashed worker) is claimable
 * again. Risk rules run after the event's transaction commits — inside it
 * they would not see the event they are judging.
 */
export async function processZentraOutboxBatch(batchSize = 25): Promise<OutboxProcessResult> {
  const result: OutboxProcessResult = { processed: 0, succeeded: 0, failed: 0, errors: [] };

  const claimed = await sql<{ id: string; tenant_id: string; app_id: string; event_name: string; payload: unknown; retry_count: number }>`
    UPDATE zentra_event_outbox o SET status = 'processing', scheduled_at = now()
    WHERE o.id IN (
      SELECT id FROM zentra_event_outbox
      WHERE ((status IN ('pending', 'failed') AND scheduled_at <= now())
          OR (status = 'processing' AND scheduled_at < now() - interval '10 minutes'))
        AND retry_count < 5
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.tenant_id, o.app_id, o.event_name, o.payload, o.retry_count`.execute(dbPlatform);

  result.processed = claimed.rows.length;
  for (const item of claimed.rows) {
    try {
      const payload: any = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
      const inserted = await withTenant(item.tenant_id, async trx => {
        const row = await trx.insertInto('zentra_audit_events')
          .values({
            tenant_id: item.tenant_id,
            app_id: item.app_id,
            event_name: item.event_name,
            actor_id: payload.actor_id ?? 'system',
            actor_role: payload.actor_role ?? null,
            actor_name: payload.actor_name ?? null,
            actor_ip: payload.actor_ip ?? null,
            actor_user_agent: payload.actor_user_agent ?? null,
            resource_type: payload.resource_type ?? 'unknown',
            resource_id: payload.resource_id ?? 'unknown',
            action: payload.action ?? item.event_name,
            outcome: payload.outcome ?? 'success',
            correlation_id: payload.correlation_id ?? null,
            schema_version: payload.schema_version ?? 'v1',
            safe_summary: payload.safe_summary ?? null,
            safe_metadata: JSON.stringify(payload.safe_metadata ?? {}),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await trx.updateTable('zentra_event_outbox')
          .set({ status: 'completed', processed_at: new Date() })
          .where('id', '=', item.id)
          .execute();
        return row;
      });
      await evaluateZentraRiskRulesForEvent(inserted).catch(err =>
        result.errors.push(`Risk rules for ${inserted.id}: ${err instanceof Error ? err.message : String(err)}`));
      result.succeeded++;
    } catch (err) {
      result.failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Outbox item ${item.id}: ${errMsg}`);
      await dbPlatform.updateTable('zentra_event_outbox')
        .set(eb => ({
          status: 'failed',
          retry_count: eb('retry_count', '+', 1),
          last_error: errMsg.slice(0, 1000),
          scheduled_at: new Date(Date.now() + Math.min(60 * 1000 * Math.pow(2, item.retry_count), 3600 * 1000)),
        }))
        .where('id', '=', item.id)
        .execute()
        .catch(() => {});
    }
  }
  return result;
}

/** Scheduler entry point: drain a few batches, quietly. */
export async function runZentraOutboxJob(): Promise<void> {
  // Up to 2,000 events a minute; the rest waits for the next run.
  for (let i = 0; i < 20; i++) {
    const r = await processZentraOutboxBatch(100);
    if (r.failed) console.warn(`[Zentra outbox] ${r.failed} event(s) failed: ${r.errors.slice(0, 3).join(' | ')}`);
    if (r.processed < 100) break;
  }
}
