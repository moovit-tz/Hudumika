import { dbPlatform, withTenant } from '../db/client.js';
import { fireNotificationTrigger } from '../routes/support.routes.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

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
    await runUniversalSlaCheck();
    await runStatusAutomation();
    console.log('✅ Support rules job completed.');
  } catch (error) {
    console.error('❌ Support rules job failed:', error);
  }
}

async function runSlaEscalation(): Promise<void> {
  const rules = await dbPlatform.selectFrom('support_rules').selectAll()
    .where('type', '=', 'sla_escalation').where('enabled', '=', true).execute();
  if (rules.length === 0) return;

  const rulesByTenant = new Map<string, typeof rules>();
  for (const r of rules) {
    if (!rulesByTenant.has(r.tenant_id)) rulesByTenant.set(r.tenant_id, []);
    rulesByTenant.get(r.tenant_id)!.push(r);
  }

  for (const [tenantId, tenantRules] of rulesByTenant) {
    await withTenant(tenantId, async (trx) => {
      // Scoped to the tenant whose rules we are currently applying —
      // otherwise every tenant's SLA rule escalates every other tenant's
      // tickets and fires notifications about them.
      const tickets = await trx.selectFrom('support_tickets').selectAll()
        .where('tenant_id', '=', tenantId)
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

          // Studio can now build a real workflow on this the same way any
          // other app's real events are surfaced — see studio/triggers.ts's
          // support.sla_escalated. Additive: the existing notification-
          // recipient logic below runs exactly as it always has.
          await emitDomainEvent(trx, tenantId, {
            type: 'support.sla_escalated', sourceApp: 'bliss', entityType: 'support_ticket', entityId: ticket.id,
            payload: { priority: ticket.priority, category: ticket.category, elapsedPercent: Math.round(elapsedPercent) },
          }).catch(err => console.error('[SupportRules] sla_escalated emit failed:', err?.message));

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
              link: `/bliss/inbox?id=${ticket.id}`,
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

/**
 * The rule-based pass above only ever runs for a tenant that has a
 * configured `support_rules` row of type sla_escalation — and since both
 * UI paths that could create one (SupportSettings.tsx, BlissAutomations.tsx)
 * were retired in favor of linking out to Studio, no tenant can create a
 * new one anymore. Without this, support.sla_escalated would be a real,
 * registered Studio trigger that could still never fire for any tenant
 * except the handful who happened to configure a rule before that UI was
 * removed — a trigger nobody could actually use.
 *
 * This is the universal fallback: any OPEN/IN_PROGRESS ticket whose real
 * sla_deadline has actually passed gets stamped and the same event emitted,
 * for every tenant, with no configuration required — at the deadline
 * itself (100% elapsed), not an earlier configurable percentage, since
 * there is no rule here to configure one from. Skips tenants that already
 * have an enabled rule so a ticket is never double-processed by both passes
 * in the same run.
 */
async function runUniversalSlaCheck(): Promise<void> {
  const tenantsWithRule = new Set(
    (await dbPlatform.selectFrom('support_rules').select('tenant_id')
      .where('type', '=', 'sla_escalation').where('enabled', '=', true).execute())
      .map(r => r.tenant_id),
  );

  const tenants = await dbPlatform.selectFrom('tenants').select('id').execute();
  for (const { id: tenantId } of tenants) {
    if (tenantsWithRule.has(tenantId)) continue;
    await withTenant(tenantId, async (trx) => {
      const overdue = await trx.selectFrom('support_tickets').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('status', 'in', ['OPEN', 'IN_PROGRESS'])
        .where('sla_deadline', 'is not', null)
        .where('sla_deadline', '<=', new Date())
        .where('sla_escalated_at', 'is', null)
        .execute();
      if (overdue.length === 0) return;

      for (const ticket of overdue) {
        await trx.updateTable('support_tickets').set({ sla_escalated_at: new Date() })
          .where('id', '=', ticket.id).execute();
        await emitDomainEvent(trx, tenantId, {
          type: 'support.sla_escalated', sourceApp: 'bliss', entityType: 'support_ticket', entityId: ticket.id,
          payload: { priority: ticket.priority, category: ticket.category, elapsedPercent: 100 },
        }).catch(err => console.error('[SupportRules] sla_escalated (universal) emit failed:', err?.message));
      }
    });
  }
}

async function runStatusAutomation(): Promise<void> {
  const rules = await dbPlatform.selectFrom('support_rules').selectAll()
    .where('type', '=', 'status_automation').where('enabled', '=', true).execute();
  if (rules.length === 0) return;

  for (const rule of rules) {
    const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
    if (!config.autoCloseAfterDays) continue;

    await withTenant(rule.tenant_id, async (trx) => {
      const cutoff = new Date(Date.now() - config.autoCloseAfterDays * 86400_000);
      const stale = await trx.selectFrom('support_tickets').selectAll()
        .where('tenant_id', '=', rule.tenant_id)
        .where('status', '=', 'RESOLVED')
        .where('resolved_at', 'is not', null)
        .where('resolved_at', '<=', cutoff)
        .execute();

      for (const ticket of stale) {
        await trx.updateTable('support_tickets')
          .set({ status: 'CLOSED', updated_at: new Date() })
          .where('tenant_id', '=', rule.tenant_id)
          .where('id', '=', ticket.id)
          .execute();
        await fireNotificationTrigger(trx, rule.tenant_id, 'status_changed', ticket as any);
      }
    });
  }
}
