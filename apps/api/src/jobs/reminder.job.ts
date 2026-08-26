import { dbPlatform, withTenant } from '../db/client.js';
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
    const requiredDocs = await dbPlatform
      .selectFrom('case_documents')
      .selectAll()
      .where('status', '=', 'REQUIRED')
      .execute();

    if (requiredDocs.length === 0) {
      console.log('📝 No missing documents to notify.');
      return;
    }

    // Group missing documents by shipment, and separately track which
    // shipments still have a required document outstanding per tenant — the
    // resolve pass below needs "still missing" as a set, not a lookup keyed
    // by shipment, because it has to ask the opposite question ("which of
    // this tenant's *notified* shipments are no longer in this list at all").
    const docsByShipment: Record<string, typeof requiredDocs> = {};
    const stillMissingByTenant: Record<string, Set<string>> = {};
    for (const doc of requiredDocs) {
      if (!docsByShipment[doc.shipment_id]) {
        docsByShipment[doc.shipment_id] = [];
      }
      docsByShipment[doc.shipment_id].push(doc);
      (stillMissingByTenant[doc.tenant_id] ??= new Set()).add(doc.shipment_id);
    }

    // A tenant that just finished uploading its last missing document has
    // zero entries above and would never be visited by this job again — its
    // last "Missing document" / "Cannot chase missing documents" reminder
    // would sit unread forever with nothing left to ever clear it. Anyone
    // with an outstanding unread reminder needs a resolve pass even with no
    // required docs left at all.
    const tenantsWithUnreadReminders = await dbPlatform
      .selectFrom('notifications')
      .select('tenant_id')
      .distinct()
      .where('trigger_type', '=', 'MISSING_DOCUMENT')
      .where('read', '=', false)
      .execute();
    for (const row of tenantsWithUnreadReminders) {
      if (!stillMissingByTenant[row.tenant_id]) stillMissingByTenant[row.tenant_id] = new Set();
    }

    let sent = 0, unreachable = 0, skipped = 0, resolved = 0;

    // ── Resolve pass — clears stale reminders before anything new goes out ──
    //
    // A reminder fired when something was true (a document was missing; a
    // customer had no phone or email). Nothing ever re-checked that after the
    // fact, so an unread reminder just sat there being wrong: the "Kilimanjaro
    // Coffee Union has no phone or email on file" notification was still
    // showing, unread, two weeks after that customer's WhatsApp number was
    // added to their record. This pass clears the ones whose shipment no
    // longer has any required document missing at all — a customer-
    // reachability flip on a shipment that *still* has documents missing is
    // handled separately, inline below, since that shipment is still getting
    // a real reminder this same run and the two are easiest to keep together.
    for (const [tenantId, stillMissing] of Object.entries(stillMissingByTenant)) {
      await withTenant(tenantId, async (trx) => {
        let q = trx.updateTable('notifications')
          .set({ read: true, status: 'AUTO_RESOLVED', read_at: new Date() })
          .where('tenant_id', '=', tenantId)
          .where('trigger_type', '=', 'MISSING_DOCUMENT')
          .where('read', '=', false)
          .where('shipment_id', 'is not', null);
        if (stillMissing.size > 0) {
          q = q.where('shipment_id', 'not in', [...stillMissing]);
        }
        const result = await q.executeTakeFirst();
        resolved += Number(result.numUpdatedRows ?? 0);
      });
    }

    for (const [shipmentId, docs] of Object.entries(docsByShipment)) {
      const tenantId = docs[0].tenant_id;

      await withTenant(tenantId, async (trx) => {
        // assigned_to and the customer's contact details come back with the
        // ref number because whether this reminder can reach anyone at all
        // depends on them — see the fallback below.
        const shipment = await trx
          .selectFrom('shipment_cases')
          .leftJoin('customers', 'customers.id', 'shipment_cases.customer_id')
          .select([
            'shipment_cases.ref_number', 'shipment_cases.assigned_to',
            'customers.name as customer_name', 'customers.phone_wa', 'customers.phone', 'customers.email',
          ])
          .where('shipment_cases.tenant_id', '=', tenantId)
          .where('shipment_cases.id', '=', shipmentId)
          .executeTakeFirst();

        if (!shipment) return;

        // MISSING_DOCUMENT addresses the CUSTOMER over WhatsApp and email
        // (notification-matrix.ts). A customer with neither on file produced
        // nothing at all, silently — no message, no record, and nobody aware
        // the chase had not happened. On this data that is most of them: of
        // 100 shipments carrying a required document, 30 customers have a
        // phone and 36 an email.
        const reachable = !!(shipment.phone_wa || shipment.phone || shipment.email);

        // The customer now has contact details on file. Any unread "could not
        // chase" notification still sitting in someone's bell for this exact
        // shipment is no longer true — it just hasn't been told that yet,
        // because nothing revisits an already-fired notification. This
        // shipment still has documents missing (it's in this loop), so it
        // still gets a real reminder below; only the stale "nobody to tell"
        // claim gets cleared.
        if (reachable) {
          const staleResult = await trx.updateTable('notifications')
            .set({ read: true, status: 'AUTO_RESOLVED', read_at: new Date() })
            .where('tenant_id', '=', tenantId)
            .where('shipment_id', '=', shipmentId)
            .where('title', '=', 'Cannot chase missing documents')
            .where('read', '=', false)
            .executeTakeFirst();
          resolved += Number(staleResult.numUpdatedRows ?? 0);
        }

        // Skip if there's already an unread reminder for this shipment — a
        // second unread copy piled on top of one nobody has seen yet is pure
        // noise, not a nudge (this was the real defect: one shipment reminded
        // 5 separate times over 5 days, all 5 still unread, none of them ever
        // read because the recipient never got past the first one). A reminder
        // that *was* read is a different case and still deserves tomorrow's
        // nudge if the problem persists, so read state only blocks a repeat
        // while it's still unread.
        const existingUnread = await trx
          .selectFrom('notifications')
          .select('id')
          .where('tenant_id', '=', tenantId)
          .where('shipment_id', '=', shipmentId)
          .where('trigger_type', '=', 'MISSING_DOCUMENT')
          .where('read', '=', false)
          .executeTakeFirst();
        if (existingUnread) { skipped++; return; }

        // Already reminded about this shipment recently, even if it was read
        // — still don't send a second one hours later the same day.
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

        if (reachable) {
          await NotificationService.triggerNotification(tenantId, shipmentId, 'MISSING_DOCUMENT', {
            docList: docTypes,
          });
          sent++;
          return;
        }

        // Nobody to chase, so tell whoever owns the shipment instead. This is
        // deliberately not a second attempt at the customer: it is a different
        // message, to a different person, about a different problem — the
        // customer record is missing contact details.
        if (!shipment.assigned_to) { unreachable++; return; }
        await trx.insertInto('notifications').values({
          tenant_id: tenantId,
          shipment_id: shipmentId,
          user_id: shipment.assigned_to,
          // Same trigger_type as the real reminder on purpose: it is the record
          // that this shipment's daily chase was attempted, so the cooldown
          // above sees it and this does not repeat every run either.
          trigger_type: 'MISSING_DOCUMENT',
          channel: 'IN_APP',
          recipient: 'IN_APP',
          title: 'Cannot chase missing documents',
          content: `${shipment.customer_name ?? 'This customer'} has no phone or email on file, so the reminder for ${docTypes} could not be sent.`,
          message: `${shipment.customer_name ?? 'This customer'} has no phone or email on file, so the reminder for ${docTypes} could not be sent.`,
          type: 'task',
          link: `/clearos/clearance/${shipmentId}?tab=files`,
          entity_type: 'shipment',
          entity_id: shipmentId,
          entity_label: shipment.ref_number,
          status: 'SENT',
          read: false,
          created_at: new Date(),
        } as any).execute();
        unreachable++;
      });
    }

    console.log(
      `✅ Missing Documents Reminders job completed — ${sent} customer reminder(s), ` +
      `${unreachable} shipment(s) whose customer has no contact details (owner told instead), ` +
      `${skipped} skipped (already an unread reminder, or inside the ${REMINDER_COOLDOWN_MS / 3600000}h cooldown), ` +
      `${resolved} stale reminder(s) auto-resolved (document uploaded or customer now reachable).`);
  } catch (error) {
    console.error('❌ Missing documents reminder job failed:', error);
  }
}
