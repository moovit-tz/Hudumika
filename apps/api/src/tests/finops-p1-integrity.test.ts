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
