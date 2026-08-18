import { dbPlatform } from '../db/client.js';
import { ShipmentService } from '../services/shipment.service.js';

/**
 * Scan all active shipments across all tenants and evaluate their risk flags.
 * Two branches: legacy shipments (workflow_id IS NULL) keep the exact old
 * two-literal terminal-stage filter; custom-workflow shipments are filtered
 * by their resolved step's is_terminal flag instead, since a workflow-step
 * UUID has no relationship to the literals 'CLOSED'/'DELIVERY'.
 */
export async function runRiskScanJob(): Promise<void> {
  console.log('⏳ Running background job: Risk Scan...');
  try {
    const legacyShipments = await dbPlatform
      .selectFrom('shipment_cases')
      .select(['id', 'tenant_id'])
      .where('workflow_id', 'is', null)
      .where('stage', 'not in', ['CLOSED', 'DELIVERY'])
      .execute();

    const customShipments = await dbPlatform
      .selectFrom('shipment_cases')
      .innerJoin('workflow_steps', 'workflow_steps.id', 'shipment_cases.workflow_step_id')
      .select(['shipment_cases.id as id', 'shipment_cases.tenant_id as tenant_id'])
      .where('shipment_cases.workflow_id', 'is not', null)
      .where('workflow_steps.is_terminal', '=', false)
      .execute();

    const activeShipments = [...legacyShipments, ...customShipments];

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
