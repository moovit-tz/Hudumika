import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { SealStockRow } from '@hudumika/types';
import { computeStorageAccrual } from './seal-billing.service.js';

export async function getSealStock(trx: Transaction<Database>, tenantId: string, compartmentId?: string): Promise<SealStockRow[]> {
  let query = trx.selectFrom('seal_lots')
    .innerJoin('seal_compartments', 'seal_compartments.id', 'seal_lots.compartment_id')
    .leftJoin('seal_locations', join => join.onRef('seal_locations.id', '=', 'seal_lots.current_location_id').on('seal_locations.tenant_id', '=', tenantId))
    .leftJoin('customers', join => join.onRef('customers.id', '=', 'seal_lots.owner_id').on('customers.tenant_id', '=', tenantId))
    .select(['seal_lots.id', 'seal_lots.description', 'seal_lots.compartment_id', 'seal_compartments.name as compartment_name',
      'seal_locations.code as location_code', 'customers.name as owner_name', 'seal_lots.batch', 'seal_lots.uom',
      'seal_lots.qty_on_hand', 'seal_lots.qty_allocated', 'seal_lots.customs_status', 'seal_lots.warehoused_on', 'seal_lots.expires_on',
      'seal_lots.storage_billed_through', 'seal_lots.volume_cbm', 'seal_compartments.billing_method',
      'seal_compartments.storage_fee_per_day', 'seal_compartments.storage_fee_per_cbm_per_day', 'seal_compartments.storage_fee_currency', 'seal_compartments.handling_fee_flat'])
    .where('seal_lots.tenant_id', '=', tenantId).where('seal_compartments.tenant_id', '=', tenantId).orderBy('seal_lots.warehoused_on', 'asc');
  if (compartmentId) query = query.where('seal_lots.compartment_id', '=', compartmentId);
  const rows = await query.execute();
  const today = new Date();
  return rows.map(r => {
    let accrual: SealStockRow['accrual'] = null;
    let accrualError: string | null = null;
    try {
      const result = computeStorageAccrual({ lotId: r.id, warehousedOn: new Date(r.warehoused_on ?? r.storage_billed_through ?? today),
        billedThrough: r.storage_billed_through ? new Date(r.storage_billed_through) : null, asOfDate: today,
        billingMethod: r.billing_method as 'flat_per_lot' | 'per_cbm', storageFeePerDay: Number(r.storage_fee_per_day),
        storageFeePerCbmPerDay: Number(r.storage_fee_per_cbm_per_day), volumeCbm: r.volume_cbm == null ? null : Number(r.volume_cbm),
        storageFeeCurrency: r.storage_fee_currency, handlingFeeFlat: Number(r.handling_fee_flat) });
      accrual = { amount: result.totalAmount, currency: result.storageFeeCurrency, days: result.days };
    } catch (e: any) { accrualError = e.message; }
    return { id: r.id, description: r.description, compartmentId: r.compartment_id, compartmentName: r.compartment_name,
      locationCode: r.location_code, ownerName: r.owner_name, batch: r.batch, uom: r.uom,
      onHand: Number(r.qty_on_hand), allocated: Number(r.qty_allocated), available: Number(r.qty_on_hand) - Number(r.qty_allocated),
      customsStatus: r.customs_status as SealStockRow['customsStatus'], warehousedOn: r.warehoused_on == null ? null : String(r.warehoused_on),
      expiresOn: r.expires_on == null ? null : String(r.expires_on),
      daysStored: r.warehoused_on ? Math.max(0, Math.floor((today.getTime() - new Date(r.warehoused_on).getTime()) / 86400000)) : 0,
      accrual, accrualError };
  });
}
