/**
 * Run the uptime monitors that are due, and the daily certificate sweep.
 *
 * Both tables existed with nobody writing to them. A monitor is only a monitor
 * if something probes it on a schedule, and an SSL expiry alert can only fire
 * if an expiry date was ever read off the live host.
 */
import { db, withTenant } from '../db/client.js';
import { runCheck } from '../services/onsite-uptime.service.js';
import { refreshDomainCertificate, certificateStatus } from '../services/onsite-ssl.service.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Who hears about infrastructure trouble.
 *
 * createNotification is per-user, so a recipient set has to be chosen. These
 * are the roles that can act on it — the same shape comply-renewal.job.ts uses
 * for its own reminders.
 */
const ONSITE_ALERT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

async function alertAdmins(tenantId: string, n: {
  type: string; title: string; message: string; link: string;
}): Promise<void> {
  const admins = await withTenant(tenantId, (trx) =>
    trx.selectFrom('users').select(['id'])
      .where('tenant_id', '=', tenantId)
      .where('role', 'in', [...ONSITE_ALERT_ROLES])
      .where('active', '=', true)
      .execute());

  await Promise.all(admins.map(a => NotificationService.createNotification({
    tenantId, userId: a.id, app: 'onsite',
    type: n.type, title: n.title, message: n.message, link: n.link,
  }).catch((err: any) => console.error('[onsite] notify:', err))));
}

/** A monitor with no interval set is checked every five minutes. */
const DEFAULT_INTERVAL_S = 300;

/** One pass will not probe more than this, so a large tenant cannot stall the sweep. */
const MAX_CHECKS_PER_PASS = 100;

export async function runOnsiteUptimeJob(): Promise<void> {
  const checks = await db.selectFrom('onsite_health_checks')
    .select(['id', 'tenant_id', 'name', 'url', 'method', 'expected_status', 'timeout_ms',
             'interval_s', 'last_checked_at', 'status', 'notify_on_fail'])
    .orderBy('last_checked_at', 'asc')
    .limit(MAX_CHECKS_PER_PASS)
    .execute();

  const now = Date.now();

  for (const c of checks) {
    // Respect each monitor's own interval rather than probing everything every
    // pass — a check set to hourly should be hit hourly, not every minute.
    const intervalMs = (c.interval_s || DEFAULT_INTERVAL_S) * 1000;
    if (c.last_checked_at && now - new Date(c.last_checked_at).getTime() < intervalMs) continue;

    try {
      const wasHealthy = c.status !== 'critical';
      const result = await runCheck(c);

      /**
       * Notify on the transition, not on every failing pass.
       *
       * A site that is down for a day would otherwise generate a notification
       * every five minutes — which is how an alerting channel becomes noise
       * people mute, and then the next real outage goes unseen.
       */
      if (c.notify_on_fail && wasHealthy && !result.ok) {
        await alertAdmins(c.tenant_id, {
          type: 'health_check_failed',
          title: `${c.name} is not responding`,
          message: `${c.url} — ${result.error ?? 'no response'}`,
          link: '/onsite/monitoring',
        });
      }
    } catch (err: any) {
      // One unreachable host must not end the pass for the others.
      console.error(`[onsite-uptime] check ${c.id}:`, err);
    }
  }
}

export async function runOnsiteSslSweepJob(): Promise<void> {
  const domains = await db.selectFrom('onsite_domains')
    .select(['id', 'tenant_id', 'domain', 'ssl_status', 'ssl_expires_at'])
    .where('status', '=', 'active')
    .limit(500)
    .execute();

  for (const d of domains) {
    try {
      const before = d.ssl_status;
      const outcome = await refreshDomainCertificate(d.tenant_id, d);
      if (!outcome.ok) continue;

      const status = certificateStatus(outcome.cert.expiresAt);
      // Only when it crosses into expiring/expired, for the same reason the
      // uptime notification fires on transition.
      if ((status === 'expiring' || status === 'expired') && before !== status) {
        const days = outcome.cert.expiresAt
          ? Math.ceil((outcome.cert.expiresAt.getTime() - Date.now()) / 86_400_000)
          : null;
        await alertAdmins(d.tenant_id, {
          type: status === 'expired' ? 'ssl_expired' : 'ssl_expiring',
          title: status === 'expired'
            ? `The certificate for ${d.domain} has expired`
            : `The certificate for ${d.domain} expires in ${days} day${days === 1 ? '' : 's'}`,
          message: `Issued by ${outcome.cert.issuer ?? 'an unknown issuer'}.`,
          link: '/onsite/ssl',
        });
      }
    } catch (err: any) {
      console.error(`[onsite-ssl] domain ${d.id}:`, err);
    }
  }
}
