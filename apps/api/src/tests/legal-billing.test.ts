import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';
import { GLService } from '../services/gl.service.js';

// Phase 4 follow-through: Legal's full acceptance scenario named "bill/apply
// funds" as genuinely absent — legal_matters billed through legal_clients,
// which had no link to the platform's shared customers table that
// sales_invoices.customer_id actually requires. The business resolved this
// directly: link legal_clients to customers (migration 739), not a separate
// legal-specific billing table. This suite proves the real chain end to
// end: a matter can't be billed until its client is linked; an unapproved
// time entry can't be billed; approving it and billing produces a real
// invoice + GL entry; and a matter can't close with unbilled time or a
// non-zero trust balance outstanding.
describe('Legal billing — disposable tenant', () => {
  let owner: TestTenant;
  let customerId: string;
  let clientId: string;
  let matterId: string;

  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) {
    return (await getApp()).inject({ method, url: `/v1/legal${path}`, headers: authHeaders(owner.token), ...(payload !== undefined ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    await withTenant(owner.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, owner.tenantId);
      await trx.insertInto('tenant_settings').values({
        tenant_id: owner.tenantId,
        settings: JSON.stringify({ 'enabled-apps': { lexcore: true } }),
      }).execute();
      customerId = (await trx.insertInto('customers').values({
        tenant_id: owner.tenantId, name: 'Legal Test Customer',
      }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('legal_time_entries').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('legal_trust_transactions').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('legal_trust_accounts').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('legal_matters').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('legal_clients').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('customers').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup();
  }, 120000);

  it('requires real auth (regression guard for the missing fastify.authenticate hook)', async () => {
    const res = await (await getApp()).inject({ method: 'GET', url: '/v1/legal/clients' });
    expect(res.statusCode).toBe(401);
  });

  it('refuses billing until the client is linked, then takes a time entry through approve -> bill with a real invoice + GL entry', async () => {
    const createClient = await call('POST', '/clients', { name: 'Acme Co', client_type: 'company' });
    expect(createClient.statusCode, createClient.body).toBe(201);
    clientId = createClient.json().id;

    const createMatter = await call('POST', '/matters', { client_id: clientId, title: 'Acme v. Rival', billing_method: 'hourly' });
    expect(createMatter.statusCode, createMatter.body).toBe(201);
    matterId = createMatter.json().id;

    const entry1 = await call('POST', '/time', { matter_id: matterId, entry_date: '2027-01-05', description: 'Draft pleadings', hours: 3, rate: 50000 });
    expect(entry1.statusCode).toBe(201);
    const entryId = entry1.json().id;

    // Unapproved entry can't be billed.
    const billNoApproval = await call('POST', `/matters/${matterId}/bill`);
    expect(billNoApproval.statusCode).toBe(400);

    // Approve, but client still isn't linked to a platform customer.
    const approve = await call('PATCH', `/time/${entryId}/approve`);
    expect(approve.statusCode, approve.body).toBe(200);
    expect(approve.json().is_approved).toBe(true);

    const billNoLink = await call('POST', `/matters/${matterId}/bill`);
    expect(billNoLink.statusCode).toBe(422);
    expect(billNoLink.json().error).toContain('not linked');

    // Re-approving an already-approved entry is refused.
    const reApprove = await call('PATCH', `/time/${entryId}/approve`);
    expect(reApprove.statusCode).toBe(409);

    // Link the client to the platform customer — the business's own
    // resolution of the billing gap.
    const link = await call('PATCH', `/clients/${clientId}`, { customer_id: customerId });
    expect(link.statusCode, link.body).toBe(200);
    expect(link.json().customer_id).toBe(customerId);

    const bill = await call('POST', `/matters/${matterId}/bill`);
    expect(bill.statusCode, bill.body).toBe(201);
    const invoiceId = bill.json().invoice.id;
    expect(bill.json().entries[0].is_billed).toBe(true);
    expect(bill.json().entries[0].invoice_id).toBe(invoiceId);

    const { invoice, lines, journalLines } = await withTenant(owner.tenantId, async trx => {
      const invoice = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', invoiceId).executeTakeFirstOrThrow();
      const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoiceId).execute();
      const journalLines = await trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['coa.code', 'jl.debit', 'jl.credit'])
        .where('je.tenant_id', '=', owner.tenantId).where('je.source_module', '=', 'AR').where('je.source_id', '=', invoiceId)
        .execute();
      return { invoice, lines, journalLines };
    });
    expect(invoice.customer_id).toBe(customerId);
    expect(lines).toHaveLength(1);
    expect(Number(lines[0]!.rate)).toBe(150000); // 3 hours * 50,000
    const ar = journalLines.find(l => l.code === '1100');
    const revenue = journalLines.find(l => l.code === '4000');
    expect(Number(ar?.debit)).toBe(150000);
    expect(Number(revenue?.credit)).toBe(150000);

    // A second bill call finds nothing left.
    const billAgain = await call('POST', `/matters/${matterId}/bill`);
    expect(billAgain.statusCode).toBe(400);
  });

  it('refuses closing a matter with unbilled time or a non-zero trust balance', async () => {
    const createClient = await call('POST', '/clients', { name: 'Beta Ltd', client_type: 'company' });
    const beta = createClient.json().id;
    const createMatter = await call('POST', '/matters', { client_id: beta, title: 'Beta Contract Review' });
    const matter = createMatter.json().id;
    await call('PATCH', `/matters/${matter}`, { status: 'active' });

    await call('POST', '/time', { matter_id: matter, entry_date: '2027-01-06', description: 'Review contract', hours: 1, rate: 50000 });
    const closeWithUnbilled = await call('PATCH', `/matters/${matter}`, { status: 'closed' });
    expect(closeWithUnbilled.statusCode).toBe(422);
    expect(closeWithUnbilled.json().error).toContain('unbilled');

    // Mark the entry non-billable so the unbilled-time guard clears, then
    // open a trust account with a balance to prove the second guard.
    await withTenant(owner.tenantId, trx => trx.updateTable('legal_time_entries')
      .set({ is_billable: false }).where('tenant_id', '=', owner.tenantId).where('matter_id', '=', matter).execute());

    const trustAccount = await call('POST', '/trust/accounts', { account_name: 'Beta Trust', client_id: beta, matter_id: matter });
    expect(trustAccount.statusCode).toBe(201);
    await call('POST', `/trust/accounts/${trustAccount.json().id}/deposit`, { amount: 10000, description: 'Retainer' });

    const closeWithTrust = await call('PATCH', `/matters/${matter}`, { status: 'closed' });
    expect(closeWithTrust.statusCode).toBe(422);
    expect(closeWithTrust.json().error).toContain('trust balance');

    await call('POST', `/trust/accounts/${trustAccount.json().id}/disburse`, { amount: 10000, description: 'Return unused retainer', payee: 'Beta Ltd' });
    const closeClean = await call('PATCH', `/matters/${matter}`, { status: 'closed' });
    expect(closeClean.statusCode, closeClean.body).toBe(200);
    expect(closeClean.json().status).toBe('closed');
  });
});
