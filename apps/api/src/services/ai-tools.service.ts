import { withTenant } from '../db/client.js';
import { GLService } from './gl.service.js';

/** Read-only tools the AI chat/insights features can call to ground answers in
 *  real tenant data instead of the model guessing. Each tool is scoped to the
 *  calling tenant via withTenant — there is no path for a tool call to reach
 *  another tenant's data. Keep tool outputs compact; they get fed back into
 *  the model's context window on every round-trip. */

export const AI_TOOL_DEFINITIONS = [
  {
    name: 'get_at_risk_shipments',
    description: 'List active shipments at risk of demurrage (free time expiring within 48h) or SLA breach. No parameters.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_shipments',
    description: 'Search shipments by reference number or customer name.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Reference number or customer name to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'get_aged_receivables',
    description: 'Get the aged receivables report — which customers owe money and how overdue it is.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_customer_info',
    description: 'Look up a specific customer by name: their shipment count and outstanding balance.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Customer name (partial match ok)' } },
      required: ['name'],
    },
  },
] as const;

export type AiToolName = typeof AI_TOOL_DEFINITIONS[number]['name'];

export async function runAiTool(tenantId: string, toolName: string, input: Record<string, any>): Promise<any> {
  switch (toolName) {
    case 'get_at_risk_shipments': {
      const now = new Date();
      const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      return withTenant(tenantId, async (trx) => {
        const rows = await trx
          .selectFrom('shipment_cases')
          .innerJoin('customers', 'customers.id', 'shipment_cases.customer_id')
          .select(['shipment_cases.ref_number', 'customers.name as customer', 'shipment_cases.stage', 'shipment_cases.free_time_end', 'shipment_cases.sla_deadline'])
          .where('shipment_cases.stage', 'not in', ['CLOSED', 'DELIVERY'])
          .where((eb) => eb.or([
            eb('shipment_cases.free_time_end', '<=', next48h),
            eb('shipment_cases.sla_deadline', '<', now),
          ]))
          .limit(15)
          .execute();
        return rows.map(r => ({
          ref_number: r.ref_number,
          customer: r.customer,
          stage: r.stage,
          demurrage_risk: r.free_time_end ? r.free_time_end <= next48h : false,
          sla_breached: r.sla_deadline ? r.sla_deadline < now : false,
        }));
      });
    }

    case 'search_shipments': {
      const query = String(input.query ?? '').trim();
      if (!query) return { error: 'query is required' };
      return withTenant(tenantId, async (trx) => {
        const rows = await trx
          .selectFrom('shipment_cases')
          .innerJoin('customers', 'customers.id', 'shipment_cases.customer_id')
          .select(['shipment_cases.ref_number', 'customers.name as customer', 'shipment_cases.stage', 'shipment_cases.vessel', 'shipment_cases.dest_port', 'shipment_cases.eta'])
          .where((eb) => eb.or([
            eb('shipment_cases.ref_number', 'ilike', `%${query}%`),
            eb('customers.name', 'ilike', `%${query}%`),
          ]))
          .limit(10)
          .execute();
        return rows;
      });
    }

    case 'get_aged_receivables': {
      const report = await GLService.agedReceivables(tenantId);
      return {
        as_of: report.as_of,
        totals: report.totals,
        top_debtors: report.rows
          .sort((a, b) => b.total - a.total)
          .slice(0, 10)
          .map(r => ({ customer: r.entity_name, total_owed: r.total, days_90_plus: r.days_90_plus })),
      };
    }

    case 'get_customer_info': {
      const name = String(input.name ?? '').trim();
      if (!name) return { error: 'name is required' };
      return withTenant(tenantId, async (trx) => {
        const customer = await trx.selectFrom('customers').select(['id', 'name', 'category']).where('tenant_id', '=', tenantId).where('name', 'ilike', `%${name}%`).executeTakeFirst();
        if (!customer) return { error: `No customer found matching "${name}"` };

        const shipmentCount = await trx.selectFrom('shipment_cases')
          .select(trx.fn.count('id').as('cnt'))
          .where('tenant_id', '=', tenantId)
          .where('customer_id', '=', customer.id)
          .executeTakeFirst();

        const aged = await GLService.agedReceivables(tenantId);
        const arRow = aged.rows.find(r => r.entity_name === customer.name);

        return {
          customer: customer.name,
          category: customer.category,
          total_shipments: Number(shipmentCount?.cnt ?? 0),
          outstanding_balance: arRow?.total ?? 0,
        };
      });
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
