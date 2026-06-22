import { db, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Scan for shipments that have REQUIRED documents that have not been uploaded
 * and trigger reminders for the customers.
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

    for (const [shipmentId, docs] of Object.entries(docsByShipment)) {
      const tenantId = docs[0].tenant_id;

      await withTenant(tenantId, async (trx) => {
        // Fetch shipment ref number
        const shipment = await trx
          .selectFrom('shipment_cases')
          .select(['ref_number'])
          .where('id', '=', shipmentId)
          .executeTakeFirst();

        if (!shipment) return;

        const docTypes = docs.map((d) => d.type).join(', ');

        await NotificationService.triggerNotification(tenantId, shipmentId, 'MISSING_DOCUMENT', {
          docList: docTypes,
        });
      });
    }

    console.log('✅ Missing Documents Reminders job completed.');
  } catch (error) {
    console.error('❌ Missing documents reminder job failed:', error);
  }
}
