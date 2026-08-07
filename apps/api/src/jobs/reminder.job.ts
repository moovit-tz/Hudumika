import { db, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * At most one missing-document reminder per shipment per day.
 *
 * Slightly under 24h so that a job which runs at the same time each day is
 * never skipped by a few seconds of drift, and any extra invocations in
 * between are absorbed.
 */
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/**
 * Scan for shipments that have REQUIRED documents that have not been uploaded
 * and trigger reminders for the customers.
 *
 * Idempotent within the cooldown, deliberately. This job used to notify on
 * every invocation, and invocation count is not something it controls: under
 * BullMQ it repeats daily, but the interval fallback in jobs/index.ts had it
 * on the ten-minute timer, so it ran 144 times a day. Each run fans out
 * through NotificationService to every matching recipient on every channel,
 * which is how `notifications` reached 226,315 rows, 224,547 of them titled
 * "Missing document" across 93 shipments — one shipment repeating 7,844
 * times. The schedule is fixed too, but a reminder should be safe to invoke
 * often and still only remind once, rather than relying on its caller.
 */
export async function runMissingDocReminderJob(): Promise<void> {
  console.log('⏳ Running background job: Missing Documents Reminders...');
  try {
    const requiredDocs = await db
      .selectFrom('case_documents')
      .selectAll()
      .where('status', '=', 'REQUIRED')
      .execute();

    if (requiredDocs.length === 0) {
      console.log('📝 No missing documents to notify.');
      return;
    }

    // Group missing documents by shipment
    const docsByShipment: Record<string, typeof requiredDocs> = {};
    for (const doc of requiredDocs) {
      if (!docsByShipment[doc.shipment_id]) {
        docsByShipment[doc.shipment_id] = [];
      }
      docsByShipment[doc.shipment_id].push(doc);
    }

    let due = 0, skipped = 0;

    for (const [shipmentId, docs] of Object.entries(docsByShipment)) {
      const tenantId = docs[0].tenant_id;

      await withTenant(tenantId, async (trx) => {
        // Fetch shipment ref number
        const shipment = await trx
          .selectFrom('shipment_cases')
          .select(['ref_number'])
          .where('tenant_id', '=', tenantId)
          .where('id', '=', shipmentId)
          .executeTakeFirst();

        if (!shipment) return;

        // Already reminded about this shipment recently — read or not. Read
        // state deliberately does not matter: a reminder nobody has opened is
        // not a reason to send the same one again, and one that was opened
        // still deserves a fresh nudge tomorrow if the document is still
        // missing.
        const recent = await trx
          .selectFrom('notifications')
          .select('id')
          .where('tenant_id', '=', tenantId)
          .where('shipment_id', '=', shipmentId)
          .where('trigger_type', '=', 'MISSING_DOCUMENT')
          .where('created_at', '>=', new Date(Date.now() - REMINDER_COOLDOWN_MS))
          .executeTakeFirst();
        if (recent) { skipped++; return; }

        const docTypes = docs.map((d) => d.type).join(', ');

        await NotificationService.triggerNotification(tenantId, shipmentId, 'MISSING_DOCUMENT', {
          docList: docTypes,
        });
        due++;
      });
    }

    // "due" is shipments whose rules were evaluated, not messages delivered:
    // MISSING_DOCUMENT addresses the CUSTOMER over WhatsApp and email, and a
    // customer with neither on file produces no message at all. On this data
    // that is most of them — 100 shipments carry a required document, but only
    // 30 of their customers have a phone and 36 an email.
    console.log(`✅ Missing Documents Reminders job completed — ${due} due, ${skipped} still inside the ${REMINDER_COOLDOWN_MS / 3600000}h cooldown.`);
  } catch (error) {
    console.error('❌ Missing documents reminder job failed:', error);
  }
}
