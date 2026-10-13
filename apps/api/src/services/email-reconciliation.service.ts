import { withTenant } from '../db/client.js';

export async function reconcileEmailHistory(tenantId: string, apply = false) {
  return withTenant(tenantId, async trx => {
    const rows = await trx.selectFrom('comm_delivery_log as d').innerJoin('email_outbox as o', 'o.id', 'd.outbox_id')
      .select(['d.id', 'd.status as log_status', 'o.id as outbox_id', 'o.status', 'o.sent_at', 'o.message_id', 'o.last_error', 'o.communication_delivery_id'])
      .where('d.tenant_id', '=', tenantId).where('o.tenant_id', '=', tenantId).where('d.channel', '=', 'EMAIL')
      .where('o.status', 'in', ['sent', 'failed', 'simulated', 'cancelled']).forUpdate().execute();
    let repaired = 0, unverified = 0;
    for (const row of rows) {
      const trusted = row.status === 'sent' && !!row.message_id && !row.message_id.startsWith('simulated');
      const status = trusted ? 'sent' as const : 'failed' as const;
      const error = trusted ? null : row.last_error ?? (row.status === 'sent'
        ? 'Historical send has no provider message ID; external delivery is unverified.' : `Outbox outcome: ${row.status}`);
      if (row.status === 'sent' && !trusted) unverified++;
      if (row.log_status === status && row.communication_delivery_id === row.id) continue;
      if (row.communication_delivery_id && row.communication_delivery_id !== row.id) { unverified++; continue; }
      repaired++;
      if (!apply) continue;
      await trx.updateTable('email_outbox').set({ communication_delivery_id: row.id })
        .where('tenant_id', '=', tenantId).where('id', '=', row.outbox_id).execute();
      await trx.updateTable('comm_delivery_log').set({ status, error_message: error, provider_id: trusted ? row.message_id : null,
        sent_at: trusted ? row.sent_at : null, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', row.id).execute();
      const latest = await trx.selectFrom('comm_delivery_attempts').select('attempt_number')
        .where('tenant_id', '=', tenantId).where('delivery_id', '=', row.id).orderBy('attempt_number', 'desc').executeTakeFirst();
      await trx.insertInto('comm_delivery_attempts').values({ tenant_id: tenantId, delivery_id: row.id,
        attempt_number: (latest?.attempt_number ?? 0) + 1, status, provider: 'historical_reconciliation',
        provider_id: trusted ? row.message_id : null, error_message: error }).execute();
    }
    const orphaned = await trx.selectFrom('comm_delivery_log').select('id')
      .where('tenant_id', '=', tenantId).where('channel', '=', 'EMAIL').where('status', '=', 'queued').where('outbox_id', 'is', null).execute();
    return { applied: apply, repaired, unverified, orphaned: orphaned.length };
  });
}
