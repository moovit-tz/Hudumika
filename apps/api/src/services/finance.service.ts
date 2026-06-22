import { withTenant } from '../db/client.js';
import type { ShipmentPnL, ExpenseCategory } from '@clearos/types';

export class FinanceService {
  /**
   * Compute the Profit and Loss metrics for a specific shipment case
   */
  static async computePnL(tenantId: string, shipmentId: string): Promise<ShipmentPnL> {
    return withTenant(tenantId, async (trx) => {
      // 1. Get all expenses/revenue lines for this shipment
      const lines = await trx
        .selectFrom('expenses')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .execute();

      // 2. Fetch the shipment to check dates for accruing storage
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select(['free_time_end', 'stage'])
        .where('id', '=', shipmentId)
        .executeTakeFirst();

      let revenue = 0;
      let expenses = 0;
      let passthrough = 0;

      for (const line of lines) {
        const amount = Number(line.amount_tzs);
        if (line.is_passthrough) {
          passthrough += amount;
        } else if (line.is_revenue) {
          revenue += amount;
        } else {
          expenses += amount;
        }
      }

      // 3. Compute accruing storage charges
      // If free time has ended and stage is not delivered/closed/empty_return
      let accruing = 0;
      if (shipment?.free_time_end) {
        const freeTimeEnd = new Date(shipment.free_time_end);
        const now = new Date();
        const activeStates = [
          'DOCS_RECEIVED', 'VALIDATION', 'PERMITS', 'ENTRY_PREP',
          'TANCIS_REG', 'ASSESSMENT', 'TAX_PAYMENT', 'DO_APPLICATION',
          'INSPECTION_BOOKING', 'INSPECTION', 'GOV_REMARKS', 'RELEASE',
          'ICD_PAYMENT', 'GATE_PASS', 'TRANSPORT'
        ];

        if (now > freeTimeEnd && activeStates.includes(shipment.stage)) {
          const hoursOver = (now.getTime() - freeTimeEnd.getTime()) / (1000 * 60 * 60);
          const daysOver = Math.ceil(hoursOver / 24);
          // Standard daily demurrage charge: 100,000 TZS per day
          accruing = daysOver * 100000;
        }
      }

      const gross_margin = revenue - expenses;
      const margin_pct = revenue > 0 ? (gross_margin / revenue) * 100 : 0;

      // 4. Derive invoice status based on shipment stage
      let status: 'OPEN' | 'INVOICED' | 'PAID' = 'OPEN';
      if (shipment?.stage === 'CLOSED') {
        status = 'PAID';
      } else if (shipment?.stage === 'INVOICING') {
        status = 'INVOICED';
      }

      return {
        revenue,
        expenses,
        passthrough,
        gross_margin: parseFloat(gross_margin.toFixed(2)),
        margin_pct: parseFloat(margin_pct.toFixed(2)),
        accruing,
        status,
      };
    });
  }

  /**
   * Record a new expense or revenue item for a shipment
   */
  static async recordExpense(
    tenantId: string,
    shipmentId: string,
    input: {
      category: ExpenseCategory;
      label: string;
      amount_tzs: number;
      is_revenue?: boolean;
      is_passthrough?: boolean;
      recorded_by?: string;
    }
  ) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      const result = await trx
        .insertInto('expenses')
        .values({
          tenant_id: tenantId,
          shipment_id: shipmentId,
          category: input.category,
          label: input.label,
          amount_tzs: input.amount_tzs,
          is_revenue: input.is_revenue ?? false,
          is_passthrough: input.is_passthrough ?? false,
          recorded_by: input.recorded_by ?? null,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return result;
    });
  }
}
