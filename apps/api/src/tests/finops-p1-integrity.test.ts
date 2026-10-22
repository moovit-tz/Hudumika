/**
 * Regression tests for the five P1 blockers in the 2026-10-22 FinOps
 * production-readiness audit. Each test covers one blocker and proves
 * the fix holds under the conditions that originally exposed the bug.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

let tenant: TestTenant;
let other: TestTenant;

const ENABLED_APPS: Record<string, boolean> = {
  finops: true, seal: true,
  'finance.core': true,
  'finance.accounting.advanced': true,
  'finance.fixed_assets': true,
  'finance.multi_currency': true,
};

async function seedTenant(t: TestTenant) {
  const settingsJson = JSON.stringify({ 'enabled-apps': ENABLED_APPS, company: { currency: 'TZS' } });
  await withTenant(t.tenantId, async (trx) => {
    await trx.insertInto('tenant_settings').values({
      tenant_id: t.tenantId,
      settings: settingsJson,
    }).onConflict(c => c.column('tenant_id').doUpdateSet({ settings: settingsJson as any })).execute();
    await GLService.seedChartOfAccounts(trx, t.tenantId);
    for (const key of ['finance.core', 'finance.accounting.advanced', 'finance.fixed_assets', 'finance.multi_currency']) {
      await trx.insertInto('tenant_finance_capabilities' as any).values({
        tenant_id: t.tenantId,
        capability_key: key,
        enabled: true,
      }).onConflict((c: any) => c.columns(['tenant_id', 'capability_key']).doUpdateSet({ enabled: true })).execute();
    }
  });
}

beforeAll(async () => {
  tenant = await createTestTenant('FINANCE');
  other = await createTestTenant('FINANCE');
  await seedTenant(tenant);
  await seedTenant(other);
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  // credit_notes FK blocks cascading tenant delete; clean them first
  for (const t of [tenant, other]) {
    if (!t) continue;
    await dbPlatform.deleteFrom('credit_note_lines' as any)
      .where('credit_note_id', 'in',
        dbPlatform.selectFrom('credit_notes').select('id').where('tenant_id', '=', t.tenantId)
      ).execute().catch(() => {});
    await dbPlatform.deleteFrom('credit_notes').where('tenant_id', '=', t.tenantId).execute().catch(() => {});
    await t.cleanup();
  }
}, 120_000);

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
  t: TestTenant = tenant,
) {
  const app = await getApp();
  return app.inject({
    method,
    url: `/v1/${path}`,
    headers: authHeaders(t.token),
    ...(payload ? { payload } : {}),
  });
}

// ---------------------------------------------------------------------------
// P1 #1: Bank reconciliation — tenant isolation + matching rules
// ---------------------------------------------------------------------------
describe('P1 #1: bank reconciliation security', () => {
  let stmtId: string;
  let lineId: string;
  let ownJournalLineId: string;
  let foreignJournalLineId: string;

  it('sets up a statement and journal entries in both tenants', async () => {
    // Create bank statement and line via raw SQL (no POST /statements route exists)
    await withTenant(tenant.tenantId, async (trx) => {
      const stmtRow = await trx.insertInto('bank_statements').values({
        tenant_id: tenant.tenantId,
        account_code: '1010',
        bank_name: 'Test Bank',
        statement_date_from: '2026-01-01',
        statement_date_to: '2026-01-31',
        imported_by: tenant.userId,
      }).returningAll().executeTakeFirstOrThrow();
      stmtId = stmtRow.id;

      const lineRow = await trx.insertInto('bank_statement_lines').values({
        bank_statement_id: stmtId,
        txn_date: '2026-01-10',
        description: 'Deposit',
        amount: 1000,
      }).returningAll().executeTakeFirstOrThrow();
      lineId = lineRow.id;
    });

    // Create a journal entry in owner tenant (account 1010)
    const jeId = await GLService.post(tenant.tenantId, {
      entryDate: '2026-01-10',
      description: 'Test deposit',
      sourceModule: 'MANUAL',
      sourceId: randomUUID(),
      createdBy: tenant.userId,
      lines: [
        { accountCode: '1010', debit: 1000, credit: 0, description: 'Cash in' },
        { accountCode: '4000', debit: 0, credit: 1000, description: 'Revenue' },
      ],
    });
    const jls = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['jl.id'])
        .where('je.id', '=', jeId)
        .where('coa.code', '=', '1010')
        .execute()
    );
    ownJournalLineId = jls[0].id;

    // Create a journal entry in the OTHER tenant
    const otherJeId = await GLService.post(other.tenantId, {
      entryDate: '2026-01-10',
      description: 'Other tenant entry',
      sourceModule: 'MANUAL',
      sourceId: randomUUID(),
      createdBy: other.userId,
      lines: [
        { accountCode: '1010', debit: 500, credit: 0, description: 'Other cash' },
        { accountCode: '4000', debit: 0, credit: 500, description: 'Other rev' },
      ],
    });
    const otherJls = await withTenant(other.tenantId, (trx) =>
      trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['jl.id'])
        .where('je.id', '=', otherJeId)
        .where('coa.code', '=', '1010')
        .execute()
    );
    foreignJournalLineId = otherJls[0].id;

    expect(ownJournalLineId).toBeTruthy();
    expect(foreignJournalLineId).toBeTruthy();
    expect(ownJournalLineId).not.toBe(foreignJournalLineId);
  }, 120_000);

  it('rejects matching against a journal line from another tenant', async () => {
    const res = await call('POST', `bank-reconciliation/statements/${stmtId}/lines/${lineId}/match`, {
      journal_line_id: foreignJournalLineId,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  }, 120_000);

  it('accepts matching against own tenant journal line', async () => {
    const res = await call('POST', `bank-reconciliation/statements/${stmtId}/lines/${lineId}/match`, {
      journal_line_id: ownJournalLineId,
    });
    expect(res.statusCode, res.body).toBe(200);
  }, 120_000);

  it('rejects double-matching the same journal line to a second statement line', async () => {
    // Create a second statement line in the same statement
    const line2Id = await withTenant(tenant.tenantId, async (trx) => {
      const row = await trx.insertInto('bank_statement_lines').values({
        bank_statement_id: stmtId,
        txn_date: '2026-01-11',
        description: 'Deposit 2',
        amount: 500,
      }).returningAll().executeTakeFirstOrThrow();
      return row.id;
    });

    const res = await call('POST', `bank-reconciliation/statements/${stmtId}/lines/${line2Id}/match`, {
      journal_line_id: ownJournalLineId,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already matched/i);
  }, 120_000);

  it('rejects matching when statement amount differs from journal amount', async () => {
    // Create a journal entry with amount 999 and a statement line with amount 100
    const mismatchJeId = await GLService.post(tenant.tenantId, {
      entryDate: '2026-01-12',
      description: 'Mismatch test',
      sourceModule: 'MANUAL',
      sourceId: randomUUID(),
      createdBy: tenant.userId,
      lines: [
        { accountCode: '1010', debit: 999, credit: 0, description: 'Mismatch cash' },
        { accountCode: '4000', debit: 0, credit: 999, description: 'Mismatch rev' },
      ],
    });
    const mismatchJl = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['jl.id'])
        .where('je.id', '=', mismatchJeId)
        .where('coa.code', '=', '1010')
        .execute()
    );

    const mismatchLineId = await withTenant(tenant.tenantId, async (trx) => {
      const row = await trx.insertInto('bank_statement_lines').values({
        bank_statement_id: stmtId,
        txn_date: '2026-01-12',
        description: 'Small deposit',
        amount: 100,
      }).returningAll().executeTakeFirstOrThrow();
      return row.id;
    });

    const res = await call('POST', `bank-reconciliation/statements/${stmtId}/lines/${mismatchLineId}/match`, {
      journal_line_id: mismatchJl[0].id,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/amount mismatch/i);
  }, 120_000);

  it('rejects matching a deposit against a withdrawal of the same magnitude', async () => {
    // Journal: credit 100 on 1010 (withdrawal) → net = 0 - 100 = -100
    const withdrawJeId = await GLService.post(tenant.tenantId, {
      entryDate: '2026-01-13',
      description: 'Withdrawal test',
      sourceModule: 'MANUAL',
      sourceId: randomUUID(),
      createdBy: tenant.userId,
      lines: [
        { accountCode: '1010', debit: 0, credit: 100, description: 'Cash out' },
        { accountCode: '5000', debit: 100, credit: 0, description: 'Expense' },
      ],
    });
    const withdrawJl = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['jl.id'])
        .where('je.id', '=', withdrawJeId)
        .where('coa.code', '=', '1010')
        .execute()
    );

    // Statement line: +100 deposit — opposite sign to the -100 journal line
    const depositLineId = await withTenant(tenant.tenantId, async (trx) => {
      const row = await trx.insertInto('bank_statement_lines').values({
        bank_statement_id: stmtId,
        txn_date: '2026-01-13',
        description: 'Deposit vs withdrawal',
        amount: 100,
      }).returningAll().executeTakeFirstOrThrow();
      return row.id;
    });

    const res = await call('POST', `bank-reconciliation/statements/${stmtId}/lines/${depositLineId}/match`, {
      journal_line_id: withdrawJl[0].id,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/amount mismatch/i);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #2: Foreign-currency GL posting — USD invoice posts in reporting ccy
// ---------------------------------------------------------------------------
describe('P1 #2: foreign-currency GL posting', () => {
  it('a USD invoice at rate 2650 posts TZS amounts to the GL', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'FX Test Customer',
      currency: 'USD',
      exchange_rate: 2650,
      status: 'Unpaid',
      items: [{ name: 'Consulting', rate: 100, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    const invoiceId = res.json().id;

    const entries = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_entries as je')
        .innerJoin('journal_lines as jl', 'jl.journal_entry_id', 'je.id')
        .select(['jl.debit', 'jl.credit', 'jl.currency'])
        .where('je.source_id', '=', invoiceId)
        .where('je.tenant_id', '=', tenant.tenantId)
        .where('je.status', '!=', 'VOIDED')
        .execute()
    );

    expect(entries.length).toBeGreaterThan(0);
    const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0);
    // USD 100 * 2650 = TZS 265,000; must NOT be 100
    expect(totalDebit).toBeGreaterThanOrEqual(265_000 - 1);
    expect(totalDebit).toBeLessThanOrEqual(265_000 + 1);
  }, 120_000);

  it('a TZS invoice posts at face value (no conversion)', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'Local Customer',
      currency: 'TZS',
      exchange_rate: 1,
      status: 'Unpaid',
      items: [{ name: 'Local service', rate: 50000, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    const invoiceId = res.json().id;

    const entries = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_entries as je')
        .innerJoin('journal_lines as jl', 'jl.journal_entry_id', 'je.id')
        .select(['jl.debit', 'jl.credit'])
        .where('je.source_id', '=', invoiceId)
        .where('je.tenant_id', '=', tenant.tenantId)
        .where('je.status', '!=', 'VOIDED')
        .execute()
    );
    const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0);
    expect(totalDebit).toBe(50_000);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #3: Atomic financial transactions — failure injection
// ---------------------------------------------------------------------------
describe('P1 #3: credit-note creation is atomic with its GL posting', () => {
  let invoiceId: string;

  it('creates a source invoice for credit-note tests', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'Atomicity Test Customer',
      currency: 'TZS',
      items: [{ name: 'Widget', rate: 10000, qty: 5, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    invoiceId = res.json().id;
    // Mark it Unpaid so credit notes can reference it
    const patch = await call('PATCH', `invoices/${invoiceId}`, { status: 'Unpaid' });
    expect(patch.statusCode, patch.body).toBeLessThan(300);
  }, 120_000);

  it('a GL failure rolls back the entire credit note — no orphan record', async () => {
    const original = GLService.post;
    const spy = vi.spyOn(GLService, 'post').mockImplementation(async (...args) => {
      await original.apply(GLService, args);
      throw new Error('Injected GL failure');
    });

    try {
      const res = await call('POST', 'credit-notes', {
        original_invoice_id: invoiceId,
        reason: 'Atomicity test',
        items: [{ name: 'Widget return', rate: 10000, qty: 1 }],
      });
      expect(res.statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }

    // No credit note should exist for this invoice
    const cns = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('credit_notes')
        .select('id')
        .where('tenant_id', '=', tenant.tenantId)
        .where('original_invoice_id', '=', invoiceId)
        .execute()
    );
    expect(cns).toHaveLength(0);

    // No orphan journal entry should exist either
    const orphanJournals = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_entries')
        .select('id')
        .where('tenant_id', '=', tenant.tenantId)
        .where('source_module', '=', 'AR')
        .where('description', 'like', 'Credit note:%')
        .execute()
    );
    expect(orphanJournals).toHaveLength(0);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #4: Credit-note source validation and allocation controls
// ---------------------------------------------------------------------------
describe('P1 #4: credit-note source/subledger controls', () => {
  let invoiceId: string;

  it('sets up a posted invoice with known total', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'CN Controls Customer',
      currency: 'TZS',
      items: [{ name: 'Service', rate: 1000, qty: 10, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    invoiceId = res.json().id;
    const patch = await call('PATCH', `invoices/${invoiceId}`, { status: 'Unpaid' });
    expect(patch.statusCode, patch.body).toBeLessThan(300);
  }, 120_000);

  it('rejects a credit note against a Draft invoice', async () => {
    const draft = await withTenant(tenant.tenantId, async (trx) => {
      const row = await sql<{ id: string }>`
        INSERT INTO sales_invoices (tenant_id, invoice_number, status, currency, created_by)
        VALUES (${tenant.tenantId}, ${randomUUID()}, 'Draft', 'TZS', ${tenant.userId})
        RETURNING id
      `.execute(trx);
      return row.rows[0].id;
    });

    const res = await call('POST', 'credit-notes', {
      original_invoice_id: draft,
      reason: 'Should fail',
      items: [{ name: 'Test', rate: 100, qty: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/draft/i);
  }, 120_000);

  it('rejects a credit note with mismatched currency', async () => {
    const res = await call('POST', 'credit-notes', {
      original_invoice_id: invoiceId,
      currency: 'USD',
      reason: 'Wrong currency',
      items: [{ name: 'Test', rate: 100, qty: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/currency/i);
  }, 120_000);

  it('enforces cumulative creditable limit', async () => {
    // Issue a credit note for 8000 of the 10000 invoice
    const cn1 = await call('POST', 'credit-notes', {
      original_invoice_id: invoiceId,
      reason: 'Partial credit 1',
      items: [{ name: 'Part return', rate: 1000, qty: 8 }],
    });
    expect(cn1.statusCode, cn1.body).toBeLessThan(300);

    // Now try to credit another 3000 — should fail (8000+3000 > 10000)
    const cn2 = await call('POST', 'credit-notes', {
      original_invoice_id: invoiceId,
      reason: 'Over-credit attempt',
      items: [{ name: 'Too much', rate: 1000, qty: 3 }],
    });
    expect(cn2.statusCode).toBe(400);
    expect(cn2.json().error).toMatch(/exceed/i);

    // But crediting the remaining 2000 should succeed
    const cn3 = await call('POST', 'credit-notes', {
      original_invoice_id: invoiceId,
      reason: 'Remaining balance',
      items: [{ name: 'Final return', rate: 1000, qty: 2 }],
    });
    expect(cn3.statusCode, cn3.body).toBeLessThan(300);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #5: Document numbering — credit_note and bill in CHECK constraint
// ---------------------------------------------------------------------------
describe('P1 #5: document numbering accepts credit_note and bill types', () => {
  it('can create an invoice_sequences row with doc_type credit_note', async () => {
    await withTenant(tenant.tenantId, async (trx) => {
      await trx.insertInto('invoice_sequences').values({
        tenant_id: tenant.tenantId,
        doc_type: 'credit_note',
        prefix: 'CN-',
        next_number: 1,
      }).onConflict(c => c.columns(['tenant_id', 'doc_type']).doNothing()).execute();

      const row = await trx.selectFrom('invoice_sequences')
        .select(['doc_type', 'prefix'])
        .where('tenant_id', '=', tenant.tenantId)
        .where('doc_type', '=', 'credit_note')
        .executeTakeFirst();
      expect(row).toBeTruthy();
      expect(row!.doc_type).toBe('credit_note');
    });
  }, 120_000);

  it('can create an invoice_sequences row with doc_type bill', async () => {
    await withTenant(tenant.tenantId, async (trx) => {
      await trx.insertInto('invoice_sequences').values({
        tenant_id: tenant.tenantId,
        doc_type: 'bill',
        prefix: 'BILL-',
        next_number: 1,
      }).onConflict(c => c.columns(['tenant_id', 'doc_type']).doNothing()).execute();

      const row = await trx.selectFrom('invoice_sequences')
        .select(['doc_type', 'prefix'])
        .where('tenant_id', '=', tenant.tenantId)
        .where('doc_type', '=', 'bill')
        .executeTakeFirst();
      expect(row).toBeTruthy();
      expect(row!.doc_type).toBe('bill');
    });
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #6: FX credit lifecycle — source rate enforcement + GL AR clearing
// ---------------------------------------------------------------------------
describe('P1 #6: FX credit lifecycle and invoice status recomputation', () => {
  let fxInvoiceId: string;

  it('creates a USD invoice at rate 2650 for credit lifecycle tests', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'FX Credit Customer',
      currency: 'USD',
      exchange_rate: 2650,
      status: 'Unpaid',
      items: [{ name: 'FX Service', rate: 100, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    fxInvoiceId = res.json().id;
  }, 120_000);

  it('rejects a linked credit with a different exchange rate', async () => {
    const res = await call('POST', 'credit-notes', {
      original_invoice_id: fxInvoiceId,
      currency: 'USD',
      exchange_rate: 1,
      items: [{ name: 'Full refund', rate: 100, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/exchange rate/i);
  }, 120_000);

  it('a full credit at source rate clears GL AR to zero and marks invoice Credited', async () => {
    const res = await call('POST', 'credit-notes', {
      original_invoice_id: fxInvoiceId,
      currency: 'USD',
      items: [{ name: 'Full refund', rate: 100, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBe(201);
    const cnId = res.json().id;

    // GL: invoice AR debit should be fully offset by credit AR credit
    const arLines = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('journal_entries as je')
        .innerJoin('journal_lines as jl', 'jl.journal_entry_id', 'je.id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['jl.debit', 'jl.credit', 'coa.code'])
        .where('je.source_id', 'in', [fxInvoiceId, cnId])
        .where('je.tenant_id', '=', tenant.tenantId)
        .where('je.status', '!=', 'VOIDED')
        .where('coa.code', '=', '1200')
        .execute()
    );
    const arNet = arLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(Math.abs(arNet)).toBeLessThanOrEqual(1);

    // Invoice status should be Credited
    const inv = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('sales_invoices').select('status').where('id', '=', fxInvoiceId).executeTakeFirst()
    );
    expect(inv?.status).toBe('Credited');
  }, 120_000);

  it('voiding the credit restores invoice to Unpaid', async () => {
    // Find the credit note we just created
    const cns = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('credit_notes').select(['id', 'status'])
        .where('original_invoice_id', '=', fxInvoiceId)
        .where('tenant_id', '=', tenant.tenantId)
        .where('status', '=', 'POSTED')
        .execute()
    );
    expect(cns.length).toBe(1);

    const voidRes = await call('POST', `credit-notes/${cns[0].id}/void`, { reason: 'Test void' });
    expect(voidRes.statusCode, voidRes.body).toBeLessThan(300);

    const inv = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('sales_invoices').select('status').where('id', '=', fxInvoiceId).executeTakeFirst()
    );
    expect(inv?.status).toBe('Unpaid');
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #7: Local-currency credit/payment status lifecycle
// ---------------------------------------------------------------------------
describe('P1 #7: partial credit + payment status transitions', () => {
  let localInvId: string;
  let partialCnId: string;

  it('creates a TZS 10000 invoice', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'Status Lifecycle Customer',
      currency: 'TZS',
      exchange_rate: 1,
      status: 'Unpaid',
      items: [{ name: 'Status test', rate: 10000, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    localInvId = res.json().id;
  }, 120_000);

  it('a 4000 credit leaves invoice Unpaid with 6000 outstanding', async () => {
    const res = await call('POST', 'credit-notes', {
      original_invoice_id: localInvId,
      currency: 'TZS',
      items: [{ name: 'Partial credit', rate: 4000, qty: 1, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBe(201);
    partialCnId = res.json().id;

    const inv = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('sales_invoices').select('status').where('id', '=', localInvId).executeTakeFirst()
    );
    expect(inv?.status).toBe('Unpaid');
  }, 120_000);

  it('a 6000 payment completes the invoice as Paid', async () => {
    const res = await call('POST', `invoices/${localInvId}/payment`, {
      amount: 6000, method: 'bank_transfer',
    });
    expect(res.statusCode, res.body).toBeLessThan(300);

    const inv = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('sales_invoices').select('status').where('id', '=', localInvId).executeTakeFirst()
    );
    expect(inv?.status).toBe('Paid');
  }, 120_000);

  it('voiding the credit after payment sets invoice to Partial', async () => {
    const voidRes = await call('POST', `credit-notes/${partialCnId}/void`, { reason: 'Test void partial' });
    expect(voidRes.statusCode, voidRes.body).toBeLessThan(300);

    const inv = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('sales_invoices').select('status').where('id', '=', localInvId).executeTakeFirst()
    );
    // 6000 paid out of 10000 total (no credit now) = Partial
    expect(inv?.status).toBe('Partial');
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #8: POS retry concurrency — keyless duplicate guard
// ---------------------------------------------------------------------------
describe('P1 #8: POS keyless duplicate guard', () => {
  let posInvId: string;

  it('creates and issues a TZS invoice for POS retry testing', async () => {
    const res = await call('POST', 'invoices', {
      customer_name: 'POS Test Customer',
      currency: 'TZS',
      lines: [{ name: 'POS item', qty: 1, rate: 5000, tax_pct: 0 }],
    });
    expect(res.statusCode, res.body).toBeLessThan(300);
    posInvId = JSON.parse(res.body).id;
    expect(posInvId).toBeTruthy();

    const patch = await call('PATCH', `invoices/${posInvId}`, { status: 'Unpaid' });
    expect(patch.statusCode, patch.body).toBeLessThan(300);
  }, 120_000);

  it('concurrent keyless payments of the same amount — only one succeeds', async () => {
    const pay = () => call('POST', `invoices/${posInvId}/payment`, {
      amount: 2500, method: 'cash',
    });
    const [r1, r2, r3] = await Promise.all([pay(), pay(), pay()]);
    const codes = [r1.statusCode, r2.statusCode, r3.statusCode].sort();
    const successes = codes.filter(c => c < 300);
    const conflicts = codes.filter(c => c === 409);
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('keyed retry returns replayed result, not a duplicate payment', async () => {
    const app = await getApp();
    const key = `pos-retry-${randomUUID()}`;
    const pay = () => app.inject({
      method: 'POST',
      url: `/v1/invoices/${posInvId}/payment`,
      headers: { ...authHeaders(tenant.token), 'idempotency-key': key },
      payload: { amount: 500, method: 'cash' },
    });
    const [first, second] = await Promise.all([pay(), pay()]);
    expect(first.statusCode, first.body).toBeLessThan(300);
    expect(second.statusCode, second.body).toBeLessThan(300);

    const payments = await withTenant(tenant.tenantId, (trx) =>
      trx.selectFrom('invoice_payments')
        .select('id')
        .where('tenant_id', '=', tenant.tenantId)
        .where('invoice_id', '=', posInvId)
        .where('request_key', '=', key)
        .execute()
    );
    expect(payments).toHaveLength(1);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// P1 #9: Journal entries pagination endpoint
// ---------------------------------------------------------------------------
describe('P1 #9: journal entries pagination', () => {
  it('GET /journal-entries returns paginated results without 500', async () => {
    const res = await call('GET', 'finance/journal-entries?page=1&page_size=10');
    expect(res.statusCode, res.body).toBeLessThan(300);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page', 1);
    expect(body).toHaveProperty('page_size', 10);
    expect(body).toHaveProperty('total_pages');
    expect(body).toHaveProperty('journal_entries');
    expect(Array.isArray(body.journal_entries)).toBe(true);
    expect(body.journal_entries.length).toBeLessThanOrEqual(10);
  }, 120_000);

  it('filters by status and date range', async () => {
    const res = await call('GET', 'finance/journal-entries?page=1&page_size=5&status=POSTED&from=2020-01-01&to=2099-12-31');
    expect(res.statusCode, res.body).toBeLessThan(300);
    const body = JSON.parse(res.body);
    for (const entry of body.journal_entries) {
      expect(entry.status).toBe('POSTED');
    }
  }, 120_000);
});
