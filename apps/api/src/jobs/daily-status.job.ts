import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Sends a daily status report to each customer who has active shipments
 */
export async function runDailyStatusJob(): Promise<void> {
  console.log('⏳ Running background job: Daily Status WhatsApp Updates...');
  try {
    const activeShipments = await dbPlatform
      .selectFrom('shipment_cases')
      .selectAll()
      .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
      .execute();

    if (activeShipments.length === 0) {
      console.log('📝 No active shipments to notify.');
      return;
    }

    // Group shipments by customer
    const groupedByCustomer: Record<string, typeof activeShipments> = {};
    for (const s of activeShipments) {
      if (!groupedByCustomer[s.customer_id]) {
        groupedByCustomer[s.customer_id] = [];
      }
      groupedByCustomer[s.customer_id].push(s);
    }

    for (const [customerId, shipments] of Object.entries(groupedByCustomer)) {
      const tenantId = shipments[0].tenant_id;

      await withTenant(tenantId, async (trx) => {
        const customer = await trx
          .selectFrom('customers')
          .select(['id', 'phone_wa', 'name'])
          .where('id', '=', customerId)
          .executeTakeFirst();

        if (!customer || !customer.phone_wa) return;

        // Construct summaries for all shipments
        const summaries = shipments
          .map((s) => `- ${s.ref_number} (${s.type}): Current status is "${s.stage}". ETA: ${s.eta ? new Date(s.eta).toLocaleDateString() : 'TBD'}`)
          .join('\n');

        // We trigger the notification using the first shipment as context,
        // and override variables to contain the combined summaries
        await NotificationService.triggerNotification(tenantId, shipments[0].id, 'DAILY_STATUS', {
          shipmentSummaries: summaries,
        });
      });
    }

    console.log('✅ Daily Status WhatsApp Updates job completed.');
  } catch (error) {
    console.error('❌ Daily Status job failed:', error);
  }
}
