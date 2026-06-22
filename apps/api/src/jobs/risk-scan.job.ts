import { db, withTenant } from '../db/client.js';
import { ShipmentService } from '../services/shipment.service.js';

/**
 * Scan all active shipments across all tenants and evaluate their risk flags
 */
export async function runRiskScanJob(): Promise<void> {
  console.log('⏳ Running background job: Risk Scan...');
  try {
    // Select all active shipments that are not closed/delivered
    const activeShipments = await db
      .selectFrom('shipment_cases')
      .select(['id', 'tenant_id'])
      .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
      .execute();

    console.log(`🔍 Found ${activeShipments.length} active shipments to scan.`);

    for (const shipment of activeShipments) {
      try {
        await ShipmentService.evaluateRiskFlags(shipment.tenant_id, shipment.id);
      } catch (err) {
        console.error(`❌ Failed to scan risks for shipment ${shipment.id}:`, err);
      }
    }
    console.log('✅ Risk Scan job completed.');
  } catch (error) {
    console.error('❌ Risk Scan job failed:', error);
  }
}
