import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { computeVatReturn } from '../services/vat-return.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { authHeaders, createTestTenant, getApp } from './helpers.js';

describe('Inventory replenishment', () => {
  it('counts outstanding sent and partial orders in base units and flags unknown conversions', async () => {
    const tenant = await createTestTenant();
    try {
      const itemId = await withTenant(tenant.tenantId, async trx => {
        const tenantId = tenant.tenantId;
        await trx.insertInto('tenant_settings').values({
          tenant_id: tenantId, settings: JSON.stringify({
            'enabled-apps': { seal: true, inventory: true, finops: true, 'finance.procurement': true },
          }),
        }).execute();
        await trx.insertInto('tenant_finance_capabilities').values({
          tenant_id: tenantId, capability_key: 'finance.procurement', enabled: true,
        }).execute();
        await GLService.seedChartOfAccounts(trx, tenantId);
        const item = await trx.insertInto('inventory_items').values({
          tenant_id: tenantId, sku: 'REORDER', name: 'Reorder test', base_uom: 'each',
          reorder_point: '20', reorder_qty: '4',
        }).returning('id').executeTakeFirstOrThrow();
        const warehouse = await trx.insertInto('inventory_warehouses').values({
          tenant_id: tenantId, code: 'REORDER', name: 'Reorder warehouse', address: null,
        }).returning('id').executeTakeFirstOrThrow();
        const bin = await trx.insertInto('inventory_locations').values({
          tenant_id: tenantId, warehouse_id: warehouse.id, code: 'BIN', name: 'Bin',
        }).returning('id').executeTakeFirstOrThrow();
        await InventoryService.recordMovement(trx, tenantId, {
          actorId: tenant.userId, movementType: 'receipt', itemId: item.id,
          toLocationId: bin.id, enteredQty: 5, enteredUom: 'each', unitCost: 1,
        });
        await trx.insertInto('inventory_item_uoms').values({
          tenant_id: tenantId, item_id: item.id, uom_code: 'box', conversion_factor: '3',
        }).execute();
        for (const status of ['SENT', 'PARTIAL', 'DRAFT', 'CANCELLED', 'RECEIVED']) {
          const po = await trx.insertInto('purchase_orders').values({
            tenant_id: tenantId, po_number: status, status,
          }).returning('id').executeTakeFirstOrThrow();
          await trx.insertInto('purchase_order_lines').values({
            po_id: po.id, description: 'Reorder test', item_id: item.id, item_uom: 'box',
            qty: 2, received_qty: status === 'PARTIAL' ? 1 : 0,
          }).execute();
        }
        return item.id;
      });

      const load = async () => {
        const response = await (await getApp()).inject({
          method: 'GET', url: '/v1/inventory/reorder-alerts', headers: authHeaders(tenant.token),
        });
        expect(response.statusCode, response.body).toBe(200);
        return response.json();
      };
      expect(await load()).toEqual([expect.objectContaining({
        itemId, totalQtyOnHand: 5, inboundQty: 9, projectedQty: 14, suggestedQty: 6, unconvertedLines: 0,
      })]);

      const app = await getApp();
      const headers = authHeaders(tenant.token);
      const line = { item_id: itemId, item_uom: 'box', qty: 2.5, unit_price: 12, description: 'Replenishment' };
      const created = await app.inject({
        method: 'POST', url: '/v1/purchase-orders', headers,
        payload: { po_number: 'REPLENISHMENT-DRAFT', lines: [line] },
      });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json().status).toBe('DRAFT');
      const url = `/v1/purchase-orders/${created.json().id}`;
      const saved = await app.inject({
        method: 'PATCH', url, headers, payload: { lines: [{ ...line, qty: 3.5 }] },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      for (const invalidLine of [{ ...line, item_id: randomUUID() }, { ...line, item_uom: 'unknown' }]) {
        const rejected = await app.inject({
          method: 'PATCH', url, headers, payload: { lines: [invalidLine] },
        });
        expect(rejected.statusCode, rejected.body).toBe(400);
      }
      const detail = await app.inject({ method: 'GET', url, headers });
      expect(detail.statusCode, detail.body).toBe(200);
      const [savedLine] = detail.json().lines;
      expect(savedLine).toMatchObject({ item_id: itemId, item_uom: 'box' });
      expect(Number(savedLine.qty)).toBe(3.5);

      await withTenant(tenant.tenantId, trx => trx.deleteFrom('inventory_item_uoms')
        .where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId).execute());
      expect(await load()).toEqual([expect.objectContaining({
        itemId, inboundQty: 0, suggestedQty: null, unconvertedLines: 2,
      })]);

      const location = await withTenant(tenant.tenantId, async trx => {
        await trx.insertInto('inventory_item_uoms').values({
          tenant_id: tenant.tenantId, item_id: itemId, uom_code: 'box', conversion_factor: '3',
        }).execute();
        await trx.updateTable('inventory_items').set({ is_batch_tracked: true })
          .where('tenant_id', '=', tenant.tenantId).where('id', '=', itemId).execute();
        return trx.selectFrom('inventory_locations').select('id')
          .where('tenant_id', '=', tenant.tenantId).where('code', '=', 'BIN').executeTakeFirstOrThrow();
      });
      const receiptLine = {
        line_id: savedLine.id, received_qty: 0.75, location_id: location.id, batch_no: 'LOT-1', expiry_date: '2030-01-31',
      };
      expect((await app.inject({ method: 'PATCH', url: `${url}/status`, headers, payload: { status: 'SENT' } })).statusCode).toBe(200);
      const receipt = (key: string, lines = [receiptLine]) => app.inject({
        method: 'POST', url: `${url}/receive`, headers: { ...headers, 'idempotency-key': key }, payload: { lines },
      });
      expect((await receipt('duplicate-lines', [receiptLine, receiptLine])).statusCode).toBe(400);
      expect((await receipt('missing-batch', [{ ...receiptLine, batch_no: '' }])).statusCode).toBe(400);
      for (const result of await Promise.all([receipt('partial'), receipt('partial')])) {
        expect(result.statusCode, result.body).toBe(200);
        expect(result.json()).toMatchObject({ status: 'PARTIAL', movements_posted: 1 });
      }
      expect((await receipt('partial', [{ ...receiptLine, received_qty: 1 }])).statusCode).toBe(409);
      const prematureEdit = await app.inject({ method: 'PATCH', url, headers, payload: { lines: [line] } });
      expect(prematureEdit.statusCode).toBe(409);

      const finalLine = { ...receiptLine, received_qty: 2.75, batch_no: 'LOT-2' };
      const competing = await Promise.all([receipt('final-a', [finalLine]), receipt('final-b', [finalLine])]);
      expect(competing.map(result => result.statusCode).sort()).toEqual([200, 400]);
      const complete = (await app.inject({ method: 'GET', url, headers })).json();
      expect(complete.status).toBe('RECEIVED');
      expect(Number(complete.lines[0].received_qty)).toBe(3.5);

      const levels = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_stock_levels')
        .select(['batch_no', 'qty_on_hand', 'expiry_date'])
        .where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId)
        .where('batch_no', 'in', ['LOT-1', 'LOT-2']).orderBy('batch_no').execute());
      expect(levels.map(level => [level.batch_no, Number(level.qty_on_hand)])).toEqual([
        ['LOT-1', 2.25], ['LOT-2', 8.25],
      ]);
      expect(levels.every(level => level.expiry_date !== null)).toBe(true);
      const movements = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_movements')
        .select(['batch_no', 'unit_cost', 'total_cost'])
        .where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId)
        .where('reason_code', '=', 'po_receipt').orderBy('batch_no').execute());
      expect(movements.map(movement => [movement.batch_no, Number(movement.unit_cost), Number(movement.total_cost)])).toEqual([
        ['LOT-1', 4, 9], ['LOT-2', 4, 33],
      ]);
      const history = await app.inject({ method: 'GET', url: `${url}/receipts`, headers });
      expect(history.statusCode, history.body).toBe(200);
      expect(history.json()).toEqual([
        expect.objectContaining({ po_line_id: savedLine.id, batch_no: 'LOT-2', movement_id: expect.any(String), entered_uom: 'box' }),
        expect.objectContaining({ po_line_id: savedLine.id, batch_no: 'LOT-1', movement_id: expect.any(String), entered_uom: 'box' }),
      ]);
      const returnUrl = `${url}/returns`;
      const returnInput = {
        id: randomUUID(), receipt_movement_id: history.json()[1].movement_id,
        quantity: 0.5, reason: 'Damaged packaging',
      };
      const draft = (payload: typeof returnInput) => app.inject({
        method: 'POST', url: returnUrl, headers, payload,
      });
      const returnResults = await Promise.all([draft(returnInput), draft({ ...returnInput, id: randomUUID() })]);
      expect(returnResults.map(result => result.statusCode).sort()).toEqual([201, 409]);
      const savedDraft = returnResults.find(result => result.statusCode === 201)!.json();
      expect((await draft({ ...returnInput, id: savedDraft.id })).statusCode).toBe(200);
      expect((await draft({ ...returnInput, id: savedDraft.id, quantity: 0.25 })).statusCode).toBe(409);
      const updatedHistory = (await app.inject({ method: 'GET', url: `${url}/receipts`, headers })).json();
      expect(updatedHistory[1].return_drafts).toEqual([expect.objectContaining({ id: savedDraft.id })]);
      const stock = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_stock_levels').select('qty_on_hand')
        .where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId)
        .where('batch_no', '=', 'LOT-1').executeTakeFirstOrThrow());
      expect(Number(stock.qty_on_hand)).toBe(2.25);
      expect((await app.inject({
        method: 'POST', url: `${returnUrl}/${savedDraft.id}/cancel`, headers,
      })).statusCode).toBe(200);
      const fullReturn = await draft({ ...returnInput, id: randomUUID(), quantity: 0.75 });
      expect(fullReturn.statusCode).toBe(201);
      const postUrl = `${returnUrl}/${fullReturn.json().id}/post`;
      const posted = await Promise.all([
        app.inject({ method: 'POST', url: postUrl, headers }),
        app.inject({ method: 'POST', url: postUrl, headers }),
      ]);
      for (const result of posted) expect(result.statusCode, result.body).toBe(200);
      const movementId = posted[0].json().stock_movement_id;
      expect(posted[1].json().stock_movement_id).toBe(movementId);
      const returnMovement = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_movements')
        .select(['movement_type', 'from_location_id', 'batch_no', 'qty_delta', 'total_cost'])
        .where('tenant_id', '=', tenant.tenantId).where('id', '=', movementId).executeTakeFirstOrThrow());
      expect(returnMovement).toMatchObject({ movement_type: 'supplier_return', from_location_id: location.id, batch_no: 'LOT-1' });
      expect(Number(returnMovement.qty_delta)).toBe(-2.25);
      expect(Number(returnMovement.total_cost)).toBe(9);
      const journal = await withTenant(tenant.tenantId, trx => trx.selectFrom('journal_entries as entry')
        .innerJoin('journal_lines as line', 'line.journal_entry_id', 'entry.id')
        .innerJoin('chart_of_accounts as account', join => join
          .onRef('account.id', '=', 'line.account_id').onRef('account.tenant_id', '=', 'entry.tenant_id'))
        .where('entry.tenant_id', '=', tenant.tenantId).where('entry.reference', '=', movementId)
        .select(['account.code', 'line.debit', 'line.credit']).orderBy('account.code').execute());
      expect(journal.map(line => [line.code, Number(line.debit), Number(line.credit)])).toEqual([
        ['1300', 0, 9], ['2050', 9, 0],
      ]);
      expect((await app.inject({
        method: 'POST', url: `${returnUrl}/${fullReturn.json().id}/cancel`, headers,
      })).statusCode).toBe(409);

      const billed = await draft({ ...returnInput, id: randomUUID(), receipt_movement_id: history.json()[0].movement_id });
      expect(billed.statusCode).toBe(201);
      const supplierBill = await withTenant(tenant.tenantId, trx => trx.insertInto('supplier_bills').values({
        tenant_id: tenant.tenantId, bill_number: 'RETURN-TEST-BILL', po_id: created.json().id, status: 'DRAFT',
        subtotal: 10, tax_amount: 2, total: 12,
      }).returning('id').executeTakeFirstOrThrow());
      expect((await app.inject({
        method: 'POST', url: `${returnUrl}/${billed.json().id}/post`, headers,
      })).statusCode).toBe(409);
      const evidenceUrl = `${returnUrl}/${billed.json().id}/credit-evidence`;
      const credit = { bill_id: supplierBill.id, supplier_reference: 'VENDOR-CREDIT-01', credit_date: '2026-11-15', net_amount: 6, tax_amount: 1 };
      expect((await app.inject({ method: 'POST', url: evidenceUrl, headers, payload: credit })).statusCode).toBe(400);
      await withTenant(tenant.tenantId, trx => trx.updateTable('supplier_bills').set({ status: 'POSTED' })
        .where('tenant_id', '=', tenant.tenantId).where('id', '=', supplierBill.id).execute());
      const candidates = await app.inject({ method: 'GET', url: `${url}/return-credit-bills`, headers });
      expect(candidates.statusCode, candidates.body).toBe(200);
      expect(candidates.json()).toEqual([expect.objectContaining({ id: supplierBill.id })]);
      expect((await app.inject({
        method: 'POST', url: evidenceUrl, headers, payload: { ...credit, tax_amount: 3 },
      })).statusCode).toBe(409);
      const recorded = await app.inject({ method: 'POST', url: evidenceUrl, headers, payload: credit });
      expect(recorded.statusCode, recorded.body).toBe(200);
      expect((await app.inject({ method: 'POST', url: evidenceUrl, headers, payload: credit })).statusCode).toBe(200);
      const another = await draft({ ...returnInput, id: randomUUID(), receipt_movement_id: history.json()[0].movement_id });
      expect(another.statusCode).toBe(201);
      const overCredit = await app.inject({
        method: 'POST', url: `${returnUrl}/${another.json().id}/credit-evidence`, headers,
        payload: { ...credit, supplier_reference: 'VENDOR-CREDIT-02' },
      });
      expect(overCredit.statusCode, overCredit.body).toBe(409);
      const creditHistory = await app.inject({ method: 'GET', url: `${url}/receipts`, headers });
      expect(creditHistory.json()[0].return_drafts).toContainEqual(expect.objectContaining({
        id: billed.json().id, bill_id: supplierBill.id, supplier_reference: credit.supplier_reference, posted_at: null,
      }));
      const unchanged = await withTenant(tenant.tenantId, trx => trx.selectFrom('supplier_bills')
        .select(['total', 'paid_amount', 'status']).where('tenant_id', '=', tenant.tenantId)
        .where('id', '=', supplierBill.id).executeTakeFirstOrThrow());
      expect([Number(unchanged.total), Number(unchanged.paid_amount), unchanged.status]).toEqual([12, 0, 'POSTED']);
      const billedPostUrl = `${returnUrl}/${billed.json().id}/post`;
      const postWithCredit = () => app.inject({
        method: 'POST', url: billedPostUrl, headers, payload: { apply_credit: true },
      });
      expect((await postWithCredit()).statusCode).toBe(409);
      const untaxedBill = await withTenant(tenant.tenantId, async trx => {
        const bill = await trx.insertInto('supplier_bills').values({
          tenant_id: tenant.tenantId, bill_number: 'UNTAXED-RETURN-TEST', po_id: created.json().id,
          status: 'POSTED', subtotal: 12, total: 12, currency: 'TZS',
        }).returning('id').executeTakeFirstOrThrow();
        await GLService.post(tenant.tenantId, {
          entryDate: '2026-11-15', description: 'Untaxed return test bill', sourceModule: 'AP',
          sourceId: bill.id, lines: [
            { accountCode: '5000', debit: 12, credit: 0, description: 'Purchase', currency: 'TZS' },
            { accountCode: '2000', debit: 0, credit: 12, description: 'Payable', currency: 'TZS' },
          ],
        }, trx);
        return bill;
      });
      expect((await app.inject({
        method: 'POST', url: evidenceUrl, headers,
        payload: { ...credit, bill_id: untaxedBill.id, supplier_reference: 'UNTAXED-CREDIT', tax_amount: 0 },
      })).statusCode).toBe(200);
      const credited = await Promise.all([postWithCredit(), postWithCredit()]);
      for (const result of credited) expect(result.statusCode, result.body).toBe(200);
      expect(credited[0].json().stock_movement_id).toBe(credited[1].json().stock_movement_id);
      const billAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('supplier_bills')
        .select(['total', 'paid_amount', 'credited_amount', 'status']).where('tenant_id', '=', tenant.tenantId)
        .where('id', '=', untaxedBill.id).executeTakeFirstOrThrow());
      expect([Number(billAfter.total), Number(billAfter.paid_amount), Number(billAfter.credited_amount), billAfter.status]).toEqual([12, 0, 6, 'PARTIAL']);
      const creditJournal = await withTenant(tenant.tenantId, trx => trx.selectFrom('supplier_return_credit_evidence as credit')
        .innerJoin('journal_lines as line', 'line.journal_entry_id', 'credit.journal_entry_id')
        .innerJoin('chart_of_accounts as account', join => join
          .onRef('account.id', '=', 'line.account_id').onRef('account.tenant_id', '=', 'credit.tenant_id'))
        .where('credit.tenant_id', '=', tenant.tenantId).where('credit.return_id', '=', billed.json().id)
        .select(['account.code', 'line.debit', 'line.credit']).orderBy('account.code').execute());
      expect(creditJournal.map(line => [line.code, Number(line.debit), Number(line.credit)])).toEqual([
        ['2000', 6, 0], ['5000', 0, 6],
      ]);
      const paymentUrl = `/v1/bills/${untaxedBill.id}/payment`;
      const excess = await app.inject({ method: 'POST', url: paymentUrl, headers, payload: { amount: 6.01 } });
      expect(excess.statusCode, excess.body).toBe(409);
      const remaining = await app.inject({ method: 'POST', url: paymentUrl, headers, payload: { amount: 6 } });
      expect(remaining.statusCode, remaining.body).toBe(200);
      expect(remaining.json()).toMatchObject({ paid_amount: 6, status: 'PAID' });

      const createVatBill = (recoverable: boolean) => withTenant(tenant.tenantId, async trx => {
        const tenantId = tenant.tenantId;
        const suffix = recoverable ? 'VAT' : 'BLOCKED';
        const code = await trx.insertInto('tax_codes').values({
          tenant_id: tenantId, code: `TEST-RETURN-${suffix}`, name: 'Return test VAT',
          kind: 'STANDARD', rate: 18, jurisdiction: 'TZ', input_tax_recoverable: recoverable, applies_to: 'PURCHASE',
        }).returning('id').executeTakeFirstOrThrow();
        const bill = await trx.insertInto('supplier_bills').values({
          tenant_id: tenantId, bill_number: `VAT-RETURN-TEST-${suffix}`, po_id: created.json().id, bill_date: '2026-11-15',
          status: 'POSTED', subtotal: 12, tax_amount: 2.16, total: 14.16, currency: 'TZS',
        }).returning('id').executeTakeFirstOrThrow();
        await trx.insertInto('supplier_bill_lines').values({
          bill_id: bill.id, description: 'VAT stock', qty: 1, unit_price: 12, tax_rate: 18, tax_code_id: code.id,
        }).execute();
        await GLService.post(tenantId, {
          entryDate: '2026-11-15', description: 'VAT return test bill', sourceModule: 'AP',
          sourceId: bill.id, lines: [
            { accountCode: '5000', debit: recoverable ? 12 : 14.16, credit: 0, description: 'Purchase', currency: 'TZS' },
            ...(recoverable ? [{ accountCode: '1150', debit: 2.16, credit: 0, description: 'Input VAT', currency: 'TZS' }] : []),
            { accountCode: '2000', debit: 0, credit: 14.16, description: 'Payable', currency: 'TZS' },
          ],
        }, trx);
        return bill;
      });
      const recoverableBill = await createVatBill(true);
      const period = await withTenant(tenant.tenantId, async trx => trx.insertInto('vat_periods').values({
        tenant_id: tenant.tenantId, jurisdiction: 'TZ', period_start: '2026-11-01', period_end: '2026-11-30', status: 'closed',
        closed_at: new Date(), closed_by: tenant.userId,
        return_snapshot: JSON.stringify(await computeVatReturn(trx, tenant.tenantId, '2026-11-01', '2026-11-30', 'TZS', 'TZ')),
      }).returning('id').executeTakeFirstOrThrow());
      const vatEvidence = `${returnUrl}/${another.json().id}/credit-evidence`;
      const vatPost = `${returnUrl}/${another.json().id}/post`;
      const vatCredit = { ...credit, bill_id: recoverableBill.id, supplier_reference: 'VAT-SUPPLIER-CREDIT', tax_amount: 1.08 };
      const saveEvidence = (tax: number) => app.inject({
        method: 'POST', url: vatEvidence, headers, payload: { ...vatCredit, tax_amount: tax },
      });
      const postVat = () => app.inject({ method: 'POST', url: vatPost, headers, payload: { apply_credit: true } });
      expect((await saveEvidence(1)).statusCode).toBe(200);
      const wrongRate = await postVat();
      expect(wrongRate.statusCode).toBe(409);
      expect(wrongRate.json().error).toContain('VAT rate');
      expect((await saveEvidence(1.08)).statusCode).toBe(200);
      const closedVat = await postVat();
      expect(closedVat.statusCode).toBe(409);
      expect(closedVat.json().error).toMatch(/closed/i);
      await withTenant(tenant.tenantId, trx => trx.updateTable('vat_periods').set({ status: 'open' })
        .where('tenant_id', '=', tenant.tenantId).where('id', '=', period.id).execute());
      const vatPosted = await postVat();
      expect(vatPosted.statusCode, vatPosted.body).toBe(200);
      const vatReturn = await withTenant(tenant.tenantId, trx =>
        computeVatReturn(trx, tenant.tenantId, '2026-11-01', '2026-11-30', 'TZS', 'TZ'));
      const vatBucket = vatReturn.inputs.find(bucket => bucket.code === 'TEST-RETURN-VAT');
      expect(vatBucket?.net).toBeCloseTo(6);
      expect(vatBucket?.tax).toBeCloseTo(1.08);
      expect(vatReturn.inputTaxClaimable).toBeCloseTo(1.08);
      const vatPostingLines = (returnId: string) => withTenant(tenant.tenantId, trx => trx.selectFrom('supplier_return_credit_evidence as credit')
        .innerJoin('journal_lines as line', 'line.journal_entry_id', 'credit.journal_entry_id')
        .innerJoin('chart_of_accounts as account', join => join
          .onRef('account.id', '=', 'line.account_id').onRef('account.tenant_id', '=', 'credit.tenant_id'))
        .where('credit.tenant_id', '=', tenant.tenantId).where('credit.return_id', '=', returnId)
        .select(['account.code', 'line.debit', 'line.credit']).orderBy('account.code').execute());
      const vatLedger = await vatPostingLines(another.json().id);
      expect(vatLedger.map(line => [line.code, Number(line.debit), Number(line.credit)])).toEqual([
        ['1150', 0, 1.08], ['2000', 7.08, 0], ['5000', 0, 6],
      ]);
      const blockedBill = await createVatBill(false);
      const blockedDraft = await draft({ ...returnInput, id: randomUUID(), receipt_movement_id: history.json()[0].movement_id });
      expect(blockedDraft.statusCode, blockedDraft.body).toBe(201);
      const blockedReturnId = blockedDraft.json().id;
      const blockedCredit = await app.inject({
        method: 'POST', url: `${returnUrl}/${blockedReturnId}/credit-evidence`, headers,
        payload: { ...vatCredit, bill_id: blockedBill.id, supplier_reference: 'BLOCKED-VAT-CREDIT' },
      });
      expect(blockedCredit.statusCode, blockedCredit.body).toBe(200);
      const blockedPosted = await app.inject({
        method: 'POST', url: `${returnUrl}/${blockedReturnId}/post`, headers, payload: { apply_credit: true },
      });
      expect(blockedPosted.statusCode, blockedPosted.body).toBe(200);
      expect((await vatPostingLines(blockedReturnId)).map(line => [line.code, Number(line.debit), Number(line.credit)])).toEqual([
        ['2000', 7.08, 0], ['5000', 0, 7.08],
      ]);
      const adjustedVatReturn = await withTenant(tenant.tenantId, trx =>
        computeVatReturn(trx, tenant.tenantId, '2026-11-01', '2026-11-30', 'TZS', 'TZ'));
      expect(adjustedVatReturn.inputs.find(bucket => bucket.code === 'TEST-RETURN-BLOCKED')?.tax).toBeCloseTo(1.08);
      expect(adjustedVatReturn.inputTaxBlocked).toBeCloseTo(1.08);
      expect(adjustedVatReturn.inputTaxClaimable).toBeCloseTo(1.08);

      const mixed = await withTenant(tenant.tenantId, async trx => {
        const tenantId = tenant.tenantId;
        const taxCode = await trx.insertInto('tax_codes').values({
          tenant_id: tenantId, code: 'TEST-RETURN-MIXED', name: 'Mixed bill blocked VAT',
          kind: 'REDUCED', rate: 10, jurisdiction: 'TZ', input_tax_recoverable: false, applies_to: 'PURCHASE',
        }).returning('id').executeTakeFirstOrThrow();
        const standardCode = await trx.selectFrom('tax_codes').select('id')
          .where('tenant_id', '=', tenantId).where('code', '=', 'TEST-RETURN-VAT').executeTakeFirstOrThrow();
        const bill = await trx.insertInto('supplier_bills').values({
          tenant_id: tenantId, bill_number: 'MIXED-VAT-RETURN', po_id: created.json().id, bill_date: '2026-11-15',
          status: 'POSTED', subtotal: 24, tax_amount: 3.36, total: 27.36, currency: 'TZS',
        }).returning('id').executeTakeFirstOrThrow();
        const [blockedLine, standardLine] = await trx.insertInto('supplier_bill_lines').values([
          { bill_id: bill.id, description: 'Blocked VAT freight line', category: 'FREIGHT', qty: 1, unit_price: 12, tax_rate: 10, tax_code_id: taxCode.id },
          { bill_id: bill.id, description: 'Recoverable VAT line', qty: 1, unit_price: 12, tax_rate: 18, tax_code_id: standardCode.id },
        ]).returning('id').execute();
        await GLService.post(tenantId, {
          entryDate: '2026-11-15', description: 'Mixed return test bill', sourceModule: 'AP',
          sourceId: bill.id, lines: [
            { accountCode: '5000', debit: 12, credit: 0, description: 'Purchase', currency: 'TZS' },
            { accountCode: '5001', debit: 13.2, credit: 0, description: 'Freight including blocked VAT', currency: 'TZS' },
            { accountCode: '1150', debit: 2.16, credit: 0, description: 'Recoverable input VAT', currency: 'TZS' },
            { accountCode: '2000', debit: 0, credit: 27.36, description: 'Payable', currency: 'TZS' },
          ],
        }, trx);
        return { bill, blockedLine, standardLine };
      });
      const mixedDraft = await draft({ ...returnInput, id: randomUUID(), receipt_movement_id: history.json()[0].movement_id });
      expect(mixedDraft.statusCode, mixedDraft.body).toBe(201);
      const mixedReturnId = mixedDraft.json().id;
      const mixedEvidence = { ...credit, bill_id: mixed.bill.id, supplier_reference: 'MIXED-VAT-CREDIT', tax_amount: 0.6 };
      const saveMixed = (details: object) => app.inject({
        method: 'POST', url: `${returnUrl}/${mixedReturnId}/credit-evidence`, headers,
        payload: { ...mixedEvidence, ...details },
      });
      const postMixed = () => app.inject({
        method: 'POST', url: `${returnUrl}/${mixedReturnId}/post`, headers, payload: { apply_credit: true },
      });
      const mixedCandidates = await app.inject({ method: 'GET', url: `${url}/return-credit-bills`, headers });
      expect(mixedCandidates.json()).toContainEqual(expect.objectContaining({
        id: mixed.bill.id, requires_bill_line: true,
        lines: expect.arrayContaining([
          expect.objectContaining({ id: mixed.blockedLine.id }), expect.objectContaining({ id: mixed.standardLine.id }),
        ]),
      }));
      expect((await saveMixed({})).statusCode).toBe(200);
      const noAllocation = await postMixed();
      expect(noAllocation.statusCode).toBe(409);
      expect(noAllocation.json().error).toContain('original supplier bill line');
      expect((await saveMixed({ bill_line_id: randomUUID() })).statusCode).toBe(400);
      expect((await saveMixed({ bill_line_id: mixed.blockedLine.id, net_amount: 12.01 })).statusCode).toBe(409);
      expect((await saveMixed({ bill_line_id: mixed.standardLine.id })).statusCode).toBe(200);
      expect((await postMixed()).json().error).toContain('VAT rate');
      expect((await saveMixed({ bill_line_id: mixed.blockedLine.id })).statusCode).toBe(200);
      await withTenant(tenant.tenantId, trx => trx.updateTable('supplier_bill_lines').set({ category: 'TRANSPORT' })
        .where('bill_id', '=', mixed.bill.id).where('id', '=', mixed.blockedLine.id).execute());
      const unmatchedExpense = await postMixed();
      expect(unmatchedExpense.statusCode).toBe(409);
      expect(unmatchedExpense.json().error).toContain('expense accounts do not match');
      await withTenant(tenant.tenantId, trx => trx.updateTable('supplier_bill_lines').set({ category: 'FREIGHT' })
        .where('bill_id', '=', mixed.bill.id).where('id', '=', mixed.blockedLine.id).execute());
      const mixedPosted = await postMixed();
      expect(mixedPosted.statusCode, mixedPosted.body).toBe(200);
      expect((await vatPostingLines(mixedReturnId)).map(line => [line.code, Number(line.debit), Number(line.credit)])).toEqual([
        ['2000', 6.6, 0], ['5001', 0, 6.6],
      ]);
      const mixedVatReturn = await withTenant(tenant.tenantId, trx =>
        computeVatReturn(trx, tenant.tenantId, '2026-11-01', '2026-11-30', 'TZS', 'TZ'));
      expect(mixedVatReturn.inputs.find(bucket => bucket.code === 'TEST-RETURN-MIXED')?.tax).toBeCloseTo(0.6);
    } finally {
      await tenant.cleanup();
    }
  }, 180_000);
});
