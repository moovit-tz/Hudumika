import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { FinanceService } from '../services/finance.service.js';
import { requireRole } from '../middleware/rbac.js';
import type { RecordExpenseInput } from '@hudumika/types';
import { computeVatReturn } from '../services/vat-return.service.js';
import { reportingCurrency } from '../services/tax-registration.service.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';

export async function financeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  /**
   * GET /v1/finance/vat-return?from=&to=
   *
   * Output tax, input tax, and what is actually recoverable after partial
   * exemption — computed from the documents, so every figure has a source.
   */
  fastify.get('/vat-return', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { from, to, currency } = request.query as { from?: string; to?: string; currency?: string };
    const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isDate(from) || !isDate(to)) {
      return reply.status(400).send({ error: 'from and to are required, as YYYY-MM-DD' });
    }
    if (from! > to!) return reply.status(400).send({ error: '`from` must not be after `to`' });

    return withTenant(user.tenant_id, async (trx) => {
      return computeVatReturn(
        trx, user.tenant_id, from!, to!,
        currency || await reportingCurrency(trx, user.tenant_id),
      );
    });
  });

  /**
   * GET /v1/finance/vat-return/export?from=&to=&format=csv
   *
   * The return as a file to submit.
   *
   * Deliberately not a country-specific form. Every authority wants its own
   * layout — TRA, KRA, URA and GRA agree on almost nothing about presentation —
   * and pretending to produce an official form we have not been given would be
   * worse than useless: it would look filable and be rejected. What this
   * produces is the complete, sourced working: every figure with its own
   * heading, the registration it was computed under, and the gaps that were
   * excluded. It is what a preparer transcribes onto the local form, and what
   * an auditor asks for afterwards.
   */
  fastify.get('/vat-return/export', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { from, to, currency } = request.query as { from?: string; to?: string; currency?: string };
    const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isDate(from) || !isDate(to)) {
      return reply.status(400).send({ error: 'from and to are required, as YYYY-MM-DD' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const cur = currency || await reportingCurrency(trx, user.tenant_id);
      const r = await computeVatReturn(trx, user.tenant_id, from!, to!, cur);
      const tenant = await trx.selectFrom('tenants').select('name')
        .where('id', '=', user.tenant_id).executeTakeFirst();

      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const row = (...cells: unknown[]) => cells.map(esc).join(',');
      const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

      const out: string[] = [];
      out.push(row('VAT RETURN'));
      out.push(row('Workspace', tenant?.name ?? ''));
      out.push(row('Jurisdiction', r.registration.jurisdiction));
      out.push(row(r.registration.registrationLabel ?? 'Registration number',
                   r.registration.registrationNumber ?? 'NOT RECORDED'));
      out.push(row('Registration status', r.registration.state));
      out.push(row('Period', `${r.from} to ${r.to}`));
      out.push(row('Currency', r.currency));
      out.push(row('Prepared', new Date().toISOString().slice(0, 19).replace('T', ' ')));
      out.push('');

      // A return produced under a registration that is not on record has to say
      // so on the document itself, not only on the screen it was made from.
      if (r.registration.advisory) {
        out.push(row('WARNING', r.registration.advisory));
        out.push('');
      }

      out.push(row('SALES — OUTPUT TAX'));
      out.push(row('Treatment', 'Code', 'Net', 'Output tax', 'Lines'));
      for (const b of r.outputs) {
        out.push(row(b.name, b.code ?? '', money(b.net), money(b.tax), b.lines));
      }
      out.push(row('Total output tax', '', '', money(r.outputTax), ''));
      out.push('');

      out.push(row('PURCHASES — INPUT TAX'));
      out.push(row('Treatment', 'Code', 'Net', 'Input tax', 'Lines'));
      for (const b of r.inputs) {
        out.push(row(b.name, b.code ?? '', money(b.net), money(b.tax), b.lines));
      }
      out.push(row('Total input tax charged', '', '', money(r.inputTax), ''));
      out.push('');

      out.push(row('HOW MUCH INPUT TAX IS CLAIMABLE'));
      out.push(row('Input tax charged', money(r.inputTax)));
      out.push(row('Less: blocked treatments and purchases with no treatment recorded', money(-r.inputTaxBlocked)));
      out.push(row('Input tax on treatments that permit recovery', money(r.inputTaxClaimable)));
      out.push(row(`Less: partial exemption restriction (${r.recoveryRatePct.toFixed(4)}% recovery)`,
                   money(-r.inputTaxRestricted)));
      out.push(row('Input tax recoverable', money(r.inputTaxRecoverable)));
      out.push('');

      out.push(row('PARTIAL EXEMPTION WORKING'));
      out.push(row('Taxable supplies', money(r.taxableSupplies)));
      out.push(row('Exempt supplies', money(r.exemptSupplies)));
      out.push(row('Recovery rate', `${r.recoveryRatePct.toFixed(4)}%`));
      out.push(row('Method', 'Turnover (standard method) — no direct attribution, nothing links a purchase to the supply it was made for'));
      out.push('');

      out.push(row('NET POSITION'));
      out.push(row('Output tax', money(r.outputTax)));
      out.push(row('Input tax recoverable', money(-r.inputTaxRecoverable)));
      out.push(row(r.netPayable >= 0 ? 'NET PAYABLE' : 'NET REPAYABLE', money(Math.abs(r.netPayable))));
      out.push('');

      out.push(row('AGAINST THE LEDGER'));
      out.push(row('VAT Output (Payable), account 2200', money(r.ledger.outputTax)));
      out.push(row('VAT Input (Recoverable), account 1150', money(-r.ledger.inputTax)));
      out.push(row('Net per ledger', money(r.ledger.netPerLedger)));
      out.push(row('Difference vs this return', money(r.ledger.difference)));
      out.push('');

      // Excluded, not zero. A submission that silently drops rows is the thing
      // an auditor finds later.
      out.push(row('EXCLUDED FROM THIS RETURN'));
      out.push(row('Sales lines with no treatment recorded', r.unclassified.salesLines,
                   money(r.unclassified.salesNet), money(r.unclassified.salesTax)));
      out.push(row('Purchase lines with no treatment recorded', r.unclassified.purchaseLines,
                   money(r.unclassified.purchaseNet), money(r.unclassified.purchaseTax)));
      out.push(row('Documents in a currency with no rate to ' + r.currency,
                   r.fxSkipped.invoices + r.fxSkipped.bills));

      // CRLF: spreadsheets on Windows are the overwhelmingly common consumer of
      // a file like this, and a preparer transcribing figures should not have to
      // fight the import dialog.
      const csv = out.join('\r\n');
      const name = `vat-return-${r.registration.jurisdiction}-${r.from}-to-${r.to}.csv`;
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${name}"`);
      return reply.send(csv);
    });
  });

  /**
   * GET /v1/shipments/:id/pnl
   * Get shipment profitability metrics
   */
  fastify.get('/:id/pnl', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    try {
      const pnl = await FinanceService.computePnL(user.tenant_id, id);
      return pnl;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Failed to compute shipment P&L' });
    }
  });

  /**
   * POST /v1/shipments/:id/expenses
   * Record a cost or revenue item for a shipment
   */
  fastify.post('/:id/expenses', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const input = request.body as RecordExpenseInput;

    try {
      const recorded = await FinanceService.recordExpense(user.tenant_id, id, {
        ...input,
        recorded_by: user.sub,
      });

      // 201 Created — was 211, which is not a registered HTTP status.
      return reply.status(201).send(recorded);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Failed to record fee line' });
    }
  });

  /**
   * GET /v1/shipments/:id/invoice
   * Get invoice items (all revenue items billed to the customer)
   */
  fastify.get('/:id/invoice', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      // Security check: Customer can only access their own invoice
      if (user.role === 'CUSTOMER') {
        const shipment = await trx
          .selectFrom('shipment_cases')
          .select('customer_id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (!shipment || shipment.customer_id !== await resolveCustomerId(user)) {
          return reply.status(403).send({ error: 'Forbidden: Access denied' });
        }
      }

      // Fetch all billed lines (is_revenue = true)
      const billedLines = await trx
        .selectFrom('expenses')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('shipment_id', '=', id)
        .where('is_revenue', '=', true)
        .orderBy('created_at', 'asc')
        .execute();

      const totals = billedLines.reduce((acc, cur) => acc + Number(cur.amount_tzs), 0);

      // Return invoice summary object
      return {
        shipment_id: id,
        invoice_lines: billedLines,
        total_amount_tzs: totals,
        currency: 'TZS',
      };
    });
  });

  /**
   * POST /v1/shipments/:id/invoice/finalise
   * Transitions shipment to INVOICING status and finalizes costs
   */
  fastify.post('/:id/invoice/finalise', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select(['ref_number', 'stage', 'customer_id', 'bl_number', 'awb_number', 'port_of_loading', 'port_of_discharge', 'type'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment case not found' });
      }

      // Transition to INVOICING stage
      await trx
        .updateTable('shipment_cases')
        .set({
          stage: 'INVOICING',
          updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();

      // Log timeline event
      await trx
        .insertInto('stage_history')
        .values({
          tenant_id: user.tenant_id,
          shipment_id: id,
          stage: 'INVOICING',
          entered_at: new Date(),
          actor_id: user.sub,
          note: 'Final invoice compiled and published to Customer Portal.',
        })
        .execute();

      // Loop into FinOps: upsert a real sales_invoices row (keyed by
      // shipment_ref, same soft-link the codebase already uses to resolve
      // a shipment's live CO2 data on an invoice — see invoices.routes.ts
      // GET /:id) so this shipment's billed revenue shows up in the
      // Billing page as a first-class invoice, not just a stage flag.
      const revenueLines = await trx
        .selectFrom('expenses')
        .select(['label', 'amount_tzs'])
        .where('tenant_id', '=', user.tenant_id)
        .where('shipment_id', '=', id)
        .where('is_revenue', '=', true)
        .execute();

      const existingInvoice = await trx
        .selectFrom('sales_invoices')
        .select(['id'])
        .where('shipment_ref', '=', shipment.ref_number)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      const modeMap: Record<string, string> = { SEA_FCL: 'SEA', SEA_LCL: 'SEA', AIR: 'AIR', ROAD: 'ROAD', RAIL: 'SEA', BULK: 'SEA' };

      let invoiceId: string;
      if (!existingInvoice) {
        const customer = await trx.selectFrom('customers').select(['name']).where('tenant_id', '=', user.tenant_id).where('id', '=', shipment.customer_id).executeTakeFirst();
        const inv = await trx.insertInto('sales_invoices').values({
          tenant_id: user.tenant_id,
          invoice_number: `${shipment.ref_number} INV`,
          shipment_ref: shipment.ref_number,
          customer_id: shipment.customer_id,
          client_name: customer?.name ?? null,
          client_address: JSON.stringify([]),
          bl_number: shipment.bl_number || shipment.awb_number,
          origin: shipment.port_of_loading,
          destination: shipment.port_of_discharge,
          mode: modeMap[shipment.type] || 'SEA',
          bill_date: new Date(),
          status: 'Unpaid',
          received: 0,
          version: 1,
          created_by: user.sub,
        }).returningAll().executeTakeFirstOrThrow();
        invoiceId = inv.id;
      } else {
        invoiceId = existingInvoice.id;
        // Re-finalize: refresh lines only, never touch status/received —
        // an already Partial/Paid invoice must not be reset to Unpaid.
        await trx.deleteFrom('sales_invoice_lines').where('invoice_id', '=', invoiceId).execute();
      }

      if (revenueLines.length > 0) {
        await trx.insertInto('sales_invoice_lines').values(
          revenueLines.map((l, i) => ({
            invoice_id: invoiceId,
            name: l.label,
            unit: 'PER BIL',
            rate: l.amount_tzs,
            qty: 1,
            tax_pct: 0,
            line_group: 'clearing',
            currency: 'TZS',
            sort_order: i,
          }))
        ).execute();
      }

      // Alert clients via socket
      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(
          JSON.stringify({
            type: 'invoice.finalised',
            caseId: id,
            invoiceId,
          })
        );
      });

      return { success: true, message: 'Invoice finalised successfully', invoice_id: invoiceId };
    });
  });

  /**
   * PATCH /v1/shipments/:id/invoice/pay
   * Record payment of final invoice and transition shipment to CLOSED status
   */
  fastify.patch('/:id/invoice/pay', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select(['ref_number', 'stage'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment case not found' });
      }

      // Transition to CLOSED
      await trx
        .updateTable('shipment_cases')
        .set({
          stage: 'CLOSED',
          updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();

      // Log event
      await trx
        .insertInto('stage_history')
        .values({
          tenant_id: user.tenant_id,
          shipment_id: id,
          stage: 'CLOSED',
          entered_at: new Date(),
          actor_id: user.sub,
          note: 'Full payment recorded. Clearance case marked CLOSED.',
        })
        .execute();

      return { success: true, message: 'Payment recorded, case closed successfully' };
    });
  });
}
