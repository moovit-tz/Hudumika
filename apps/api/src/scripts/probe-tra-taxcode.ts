/**
 * Reaching the TRA tax-code refusal without TRA credentials.
 *
 * TRAService.submitInvoice bails at step 1 if the tenant has no VFD config, so
 * the refusal is otherwise unreachable in this environment. This inserts a
 * throwaway config row, drives the service directly, and removes it again —
 * the invoice stays Draft throughout, so nothing posts to the GL.
 *
 * It writes (and removes) rows, so it is opt-in:
 *   PROBE_TRA=1 npx tsx src/scripts/probe-tra-taxcode.ts
 */
import { db } from '../db/client.js';
import { TRAService } from '../services/tra.service.js';

const TENANT = 'd4389cf1-4cca-465a-8607-467019d22a14';   // Vihilox Logistics

async function main() {
  if (process.env.PROBE_TRA !== '1') {
    console.log('This probe writes rows. Re-run with PROBE_TRA=1 if you mean it.');
    return;
  }
  const hadConfig = await db.selectFrom('tra_vfd_config').select('tenant_id')
    .where('tenant_id', '=', TENANT).executeTakeFirst();
  if (hadConfig) {
    console.log('A real VFD config exists for this tenant — refusing to touch it.');
    return;
  }

  const codes = await db.selectFrom('tax_codes').selectAll()
    .where('tenant_id', '=', TENANT).execute();
  const rc     = codes.find(c => c.kind === 'REVERSE_CHARGE')!;
  const exempt = codes.find(c => c.kind === 'EXEMPT')!;

  await db.insertInto('tra_vfd_config').values({
    tenant_id: TENANT, reg_id: 'PROBE', receipt_code: 'PROBE',
    tax_code: 'A', environment: 'test',
  } as any).execute();

  async function probe(label: string, line: { name: string; tax_pct: number; tax_code_id: string | null }) {
    const [inv] = await db.insertInto('sales_invoices').values({
      tenant_id: TENANT, invoice_number: `PROBE-${Date.now()}`,
      client_name: 'TRA taxcode probe', currency: 'TZS', exchange_rate: 1,
      status: 'Draft', received: 0, version: 1, client_address: '[]',
    } as any).returningAll().execute();
    await db.insertInto('sales_invoice_lines').values({
      invoice_id: inv.id, name: line.name, qty: 1, rate: 100000,
      tax_pct: line.tax_pct, tax_code_id: line.tax_code_id, currency: 'TZS',
    } as any).execute();

    const res = await TRAService.submitInvoice(TENANT, inv.id);
    console.log(`\n${label}`);
    console.log(`  success=${res.success}  ${res.error ?? ''}`);

    await db.deleteFrom('sales_invoice_lines').where('invoice_id', '=', inv.id).execute();
    await db.deleteFrom('sales_invoices').where('id', '=', inv.id).execute();
  }

  await probe('A: reverse-charge line — must be refused BY NAME, before any TRA call',
    { name: 'Imported consultancy', tax_pct: 0, tax_code_id: rc.id });

  await probe('B: exempt line (TAXCODE 5) — must get past the check and fail later, on credentials',
    { name: 'Financial service', tax_pct: 0, tax_code_id: exempt.id });

  await probe('C: unclassified legacy 0% line — same, falls back to the old rate guess',
    { name: 'Legacy line', tax_pct: 0, tax_code_id: null });

  await db.deleteFrom('tra_vfd_config').where('tenant_id', '=', TENANT).execute();
  const left = await db.selectFrom('tra_vfd_config').select('tenant_id').execute();
  console.log(`\nthrowaway config removed; tra_vfd_config rows remaining: ${left.length}`);
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
