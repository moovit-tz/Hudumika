import { db, withTenant } from '../db/client.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { NotificationService } from '../services/notification.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { MailService } from '../services/mail.service.js';
import { toISODate, toEpochMs, toDateParam } from '../utils/dates.js';

const RENEWAL_LEAD_DAYS = 30;

// Same role convention as fleetCompliance.routes.ts's notifyFleetManagers —
// the users who should hear about a compliance renewal being triggered.
const COMPLY_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

/**
 * Notify tenant compliance managers that a renewal workflow was triggered —
 * in-app bell (generic createNotification, not the shipment-coupled
 * triggerNotification/NOTIFICATION_MATRIX path, which doesn't apply here)
 * plus WhatsApp/email for the PRD's required redundant-channel alerting.
 */
async function notifyComplyManagers(tenantId: string, title: string, message: string, link: string) {
  const managers = await withTenant(tenantId, (trx) =>
    trx.selectFrom('users').select(['id', 'email', 'phone'])
      .where('tenant_id', '=', tenantId)
      .where('role', 'in', [...COMPLY_MGMT_ROLES])
      .where('active', '=', true)
      .execute()
  );

  await Promise.all(managers.map(async (m) => {
    await NotificationService.createNotification({
      tenantId, userId: m.id, app: 'complyos', type: 'renewal_alert', title, message, link,
    });
    if (m.phone) {
      await WhatsAppIntegration.sendMessage(m.phone, `${title}\n${message}`).catch(() => {});
    }
    await MailService.enqueueTemplated(tenantId, 'complyos.renewal_alert', m.email, { title, message, link }, 'complyos')
      .catch(() => {});
  }));
}

// Two fixed reminder stages, each fired at most once per certificate — the
// `column` is the comply_certificates timestamp that marks a stage as sent,
// so re-running this job daily never double-notifies for the same stage.
const REMINDER_STAGES = [
  { column: 'reminder_90d_sent_at', leadDays: 90, label: '3 months' },
  { column: 'reminder_30d_sent_at', leadDays: 30, label: '1 month' },
] as const;

/**
 * Daily job: for every non-revoked certificate with an expiry date, fire the
 * 90-day and/or 30-day "renewal due" notice the first time its lead window is
 * reached (not just for auto_renew certs — this is the "every permit gets its
 * own reminder" feature, separate from the auto_renew workflow-creation job
 * below). Each stage fires exactly once; changing a certificate's expiry_date
 * (comply.service.ts's updateCertificate, e.g. after a real renewal) resets
 * both stages so the new date gets its own reminders.
 */
export async function runComplyExpiryReminderJob(): Promise<void> {
  console.log('⏳ Running ComplyOS expiry reminder scan...');
  try {
    const certs = await db
      .selectFrom('comply_certificates')
      .select([
        'id', 'tenant_id', 'name', 'agency_code', 'cert_number', 'expiry_date',
        'non_renewal_risk', 'reminder_90d_sent_at', 'reminder_30d_sent_at',
      ])
      .where('expiry_date', 'is not', null)
      .where('status', '!=', 'revoked')
      .execute();

    const now = new Date();
    let sent = 0;

    for (const cert of certs) {
      // expiry_date is a DATE, which the driver returns as 'YYYY-MM-DD' (see
      // the type parser in db/client.ts). The `as Date` cast was a lie the
      // compiler could not catch, and .getTime() threw at runtime.
      const expiry = new Date(cert.expiry_date as unknown as string);
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);

      for (const stage of REMINDER_STAGES) {
        const alreadySent = stage.column === 'reminder_90d_sent_at' ? cert.reminder_90d_sent_at : cert.reminder_30d_sent_at;
        if (alreadySent) continue;
        if (daysLeft > stage.leadDays) continue;

        await withTenant(cert.tenant_id, (trx) =>
          trx.updateTable('comply_certificates')
            .set({ [stage.column]: now })
            .where('id', '=', cert.id)
            .where('tenant_id', '=', cert.tenant_id)
            .execute()
        );

        const overdue = daysLeft < 0;
        const whenText = overdue
          ? `expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago`
          : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
        const riskText = cert.non_renewal_risk ? ` If not renewed: ${cert.non_renewal_risk}` : '';

        await notifyComplyManagers(
          cert.tenant_id,
          overdue ? `Overdue: ${cert.name}` : `Renewal due (${stage.label}): ${cert.name}`,
          `${cert.cert_number} (${cert.agency_code}) ${whenText}.${riskText}`,
          '/complyos/vault',
        ).catch((err) => console.error('⚠️  ComplyOS expiry reminder failed for tenant', cert.tenant_id, err));
        sent++;
      }
    }

    console.log(`✅ ComplyOS expiry reminder scan done — ${sent} reminder(s) sent.`);
  } catch (error) {
    console.error('❌ ComplyOS expiry reminder job failed:', error);
  }
}

/**
 * Daily job: scan certificates expiring within 30 days and create automatic
 * renewal workflows (comply_renewals rows with trigger='automatic').
 * Already-pending renewals are skipped.
 */
export async function runComplyRenewalJob(): Promise<void> {
  console.log('⏳ Running ComplyOS renewal scan job...');
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + RENEWAL_LEAD_DAYS);

    // Find certs expiring within the window that have auto_renew=true
    const certs = await db
      .selectFrom('comply_certificates')
      .select(['id', 'tenant_id', 'name', 'agency_code', 'expiry_date', 'cert_number'])
      .where('expiry_date', '<=', toDateParam(cutoff))
      .where('expiry_date', '>', toDateParam(new Date()))
      .where('auto_renew', '=', true)
      .where('status', '!=', 'revoked')
      .execute();

    if (certs.length === 0) {
      console.log('✅ No certificates requiring auto-renewal today.');
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const cert of certs) {
      let renewalId: string | null = null;

      await withTenant(cert.tenant_id, async (trx) => {
        // Skip if a workflow is already active for this cert
        const existing = await trx
          .selectFrom('comply_renewals')
          .select(['id'])
          .where('cert_id', '=', cert.id)
          .where('tenant_id', '=', cert.tenant_id)
          .where('status', 'in', ['pending_review', 'approved', 'submitted'])
          .executeTakeFirst();

        if (existing) {
          skipped++;
          return;
        }

        const row = await trx
          .insertInto('comply_renewals')
          .values({
            tenant_id: cert.tenant_id,
            cert_id:   cert.id,
            trigger:   'automatic',
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        renewalId = row.id;
        created++;

        // A licence renewal cycle has opened — the start of the
        // comply → renewal → payment → storage journey.
        emitDomainEvent(trx, cert.tenant_id, {
          type: 'comply.renewal_started', sourceApp: 'complyos', entityType: 'comply_certificate', entityId: cert.id,
          payload: { renewalId: row.id, expiryDate: cert.expiry_date ? String(cert.expiry_date) : null },
        }).catch(err => console.error('[Comply] renewal_started emit failed:', err.message));
      });

      if (renewalId) {
        const daysLeft = Math.ceil(
          ((toEpochMs(cert.expiry_date) ?? 0) - Date.now()) / 86400000,
        );
        await notifyComplyManagers(
          cert.tenant_id,
          `Renewal started: ${cert.name}`,
          `${cert.cert_number} (${cert.agency_code}) expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — a renewal workflow has been created and needs review.`,
          '/complyos/workflows',
        ).catch((err) => console.error('⚠️  ComplyOS renewal notification failed for tenant', cert.tenant_id, err));
      }
    }

    console.log(`✅ ComplyOS renewal job done — created: ${created}, skipped (already active): ${skipped}`);
  } catch (error) {
    console.error('❌ ComplyOS renewal job failed:', error);
  }
}
