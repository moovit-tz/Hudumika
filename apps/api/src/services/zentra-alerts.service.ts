import { withTenant } from '../db/client.js';
import { NotificationService } from './notification.service.js';
import { MailService } from './mail.service.js';

/**
 * Alerts for new Zentra risk signals. A signal at or above the workspace's
 * alert_min_severity (Zentra ▸ Settings; HIGH by default) notifies the
 * workspace admins in-app, and emails alert_email when one is set.
 * Called after the signal's transaction commits; never throws.
 */
const RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;
type Severity = keyof typeof RANK;
export interface AlertableSignal { id: string; title: string; description: string; severity: Severity; app_id: string; rule_code: string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function alertZentraSignals(tenantId: string, signals: AlertableSignal[]): Promise<void> {
  if (!signals.length) return;
  try {
    const settings = await withTenant(tenantId, trx => trx.selectFrom('zentra_settings')
      .select(['alert_email', 'alert_min_severity']).where('tenant_id', '=', tenantId).executeTakeFirst());
    const min = RANK[(settings?.alert_min_severity as Severity) ?? 'HIGH'] ?? RANK.HIGH;
    for (const s of signals.filter(x => (RANK[x.severity] ?? 0) >= min)) {
      const label = s.severity.charAt(0) + s.severity.slice(1).toLowerCase();
      await NotificationService.notifyRoles(tenantId, ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'], {
        app: 'zentra', type: 'alert', title: `${label} risk signal: ${s.title}`.slice(0, 200),
        message: s.description.slice(0, 500), link: '/zentra/risk',
        entityType: 'zentra_signal', entityId: s.id, entityLabel: s.rule_code,
      });
      if (settings?.alert_email) {
        await MailService.enqueue(tenantId, {
          to: settings.alert_email,
          subject: `[Zentra] ${label} risk signal: ${s.title}`.slice(0, 200),
          bodyHtml: `<p><strong>${esc(label)} risk signal</strong> in ${esc(s.app_id)}</p>`
            + `<p>${esc(s.title)}</p><p>${esc(s.description)}</p>`
            + `<p>Open Zentra ▸ Risk signals to triage it.</p>`,
          sourceApp: 'zentra',
        }).catch(err => console.warn('[Zentra alerts] email not queued:', err?.message));
      }
    }
  } catch (err: any) {
    console.warn('[Zentra alerts] failed:', err?.message);
  }
}
