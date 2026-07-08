import { db, withTenant } from '../db/client.js';
import { fireNotificationTrigger } from '../routes/support.routes.js';

/**
 * SLA escalation + status automation — the two rule types that can't fire
 * synchronously from a request (they act on elapsed time, not an event).
 * Auto-assignment and notification triggers for create/status-change/
 * reassign fire inline in support.routes.ts instead.
 */
export async function runSupportRulesJob(): Promise<void> {
  console.log('⏳ Running background job: Support rules (SLA escalation + status automation)...');
  try {
    await runSlaEscalation();
    await runStatusAutomation();
    console.log('✅ Support rules job completed.');
  } catch (error) {
    console.error('❌ Support rules job failed:', error);
  }
}

async function runSlaEscalation(): Promise<void> {
  const rules = await db.selectFrom('support_rules').selectAll()
    .where('type', '=', 'sla_escalation').where('enabled', '=', true).execute();
  if (rules.length === 0) return;

  const rulesByTenant = new Map<string, typeof rules>();
  for (const r of rules) {
    if (!rulesByTenant.has(r.tenant_id)) rulesByTenant.set(r.tenant_id, []);
    rulesByTenant.get(r.tenant_id)!.push(r);
  }

  for (const [tenantId, tenantRules] of rulesByTenant) {
    await withTenant(tenantId, async (trx) => {
      const tickets = await trx.selectFrom('support_tickets').selectAll()
        .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
        .where('sla_deadline', 'is not', null)
        .where('sla_escalated_at', 'is', null)
        .execute();

      for (const ticket of tickets) {
        const created = new Date(ticket.created_at).getTime();
        const deadline = new Date(ticket.sla_deadline!).getTime();
        const now = Date.now();
        const totalMs = deadline - created;
        const elapsedPercent = totalMs > 0 ? ((now - created) / totalMs) * 100 : 100;

        for (const rule of tenantRules) {
          const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
          const threshold = config.thresholdPercent ?? 80;
          if (elapsedPercent < threshold) continue;

          await trx.updateTable('support_tickets')
            .set({ sla_escalated_at: new Date() })
            .where('id', '=', ticket.id)
            .execute();

          const recipients: string[] = [];
          if (config.escalateToUserId) recipients.push(config.escalateToUserId);
          if (config.escalateToRole) {
            const roleUsers = await trx.selectFrom('users').select('id')
              .where('tenant_id', '=', tenantId).where('role', '=', config.escalateToRole).execute();
            recipients.push(...roleUsers.map(u => u.id));
          }
          if (ticket.assigned_to) recipients.push(ticket.assigned_to);

          for (const userId of [...new Set(recipients)]) {
            await trx.insertInto('notifications').values({
              tenant_id: tenantId,
              user_id: userId,
              app: 'bliss',
              type: 'support',
              title: `SLA at risk: ${ticket.ref_number}`,
              message: `"${ticket.subject}" is at ${Math.round(elapsedPercent)}% of its SLA window.`,
              link: `/bliss/tickets?id=${ticket.id}`,
              metadata: '{}',
              entity_type: 'support_ticket',
              entity_id: ticket.id,
              entity_label: ticket.subject,
              shipment_id: null, customer_id: null, trigger_type: null, channel: null, recipient: null, content: null,
            } as any).execute();
          }
          break; // one escalation per ticket per pass is enough
        }
      }
    });
  }
}

async function runStatusAutomation(): Promise<void> {
  const rules = await db.selectFrom('support_rules').selectAll()
    .where('type', '=', 'status_automation').where('enabled', '=', true).execute();
  if (rules.length === 0) return;

  for (const rule of rules) {
    const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
    if (!config.autoCloseAfterDays) continue;

    await withTenant(rule.tenant_id, async (trx) => {
      const cutoff = new Date(Date.now() - config.autoCloseAfterDays * 86400_000);
      const stale = await trx.selectFrom('support_tickets').selectAll()
        .where('status', '=', 'RESOLVED')
        .where('resolved_at', 'is not', null)
        .where('resolved_at', '<=', cutoff)
        .execute();

      for (const ticket of stale) {
        await trx.updateTable('support_tickets')
          .set({ status: 'CLOSED', updated_at: new Date() })
          .where('id', '=', ticket.id)
          .execute();
        await fireNotificationTrigger(trx, rule.tenant_id, 'status_changed', ticket as any);
      }
    });
  }
}
