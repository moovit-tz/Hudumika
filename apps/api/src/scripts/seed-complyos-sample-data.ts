/**
 * Seed realistic ComplyOS sample data (certificates, applications,
 * obligations, a renewal workflow, and a legal engagement) for the Moovit
 * Mobility Limited demo tenant, linked to its real CRM clients (customers
 * table) rather than sitting purely at the tenant level — so the "Client /
 * Entity" picker and multi-entity filtering added across ComplyOS actually
 * has real data to show. Idempotent — safe to re-run (upserts by natural
 * key: cert_number, app_number, obligation_code).
 *
 * Usage: npx tsx src/scripts/seed-complyos-sample-data.ts
 */
import { db, withTenant } from '../db/client.js';

const TENANT_ID = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf'; // Moovit Mobility Limited
const USER_ID   = 'f7c30a8f-b30f-47a1-9fe7-3b0340eb34d7'; // Super Admin, same tenant

async function main() {
  console.log('🌱 Seeding ComplyOS sample data for tenant', TENANT_ID);

  const customers = await db
    .selectFrom('customers')
    .select(['id', 'name', 'category'])
    .where('tenant_id', '=', TENANT_ID)
    .execute();
  const byName = (n: string) => customers.find(c => c.name === n)?.id ?? null;

  const fishProcessors = byName('Mwanza Fish Processors Ltd');
  const coffeeUnion    = byName('Kilimanjaro Coffee Union');
  const builders       = byName('Kilimanjaro Builders Ltd');
  const cotton         = byName('Shinyanga Cotton Ginners');
  const coal           = byName('Songwe Coal & Minerals Ltd');
  const spiceExports   = byName('Zanzibar Spice Exports Ltd');

  await withTenant(TENANT_ID, async (trx) => {
    // ── Compliance profile ────────────────────────────────────────────────
    await trx.insertInto('comply_profiles')
      .values({ tenant_id: TENANT_ID, sector: 'manufacturing', sub_sector: 'Agro-processing & logistics', employee_band: '51–200', ownership_structure: 'Private limited company' })
      .onConflict(oc => oc.column('tenant_id').doNothing())
      .execute();

    // ── Certificates ───────────────────────────────────────────────────────
    const today = new Date();
    const days = (n: number) => new Date(today.getTime() + n * 86400000);

    const certs: Array<{
      cert_number: string; name: string; agency_code: string; agency_name: string;
      issued_date: Date; expiry_date: Date | null; customer_id: string | null; status?: string; auto_renew?: boolean;
    }> = [
      { cert_number: 'BRELA-137644169', name: 'Certificate of Incorporation', agency_code: 'BRELA', agency_name: 'Business Registration & Licensing Agency', issued_date: days(-900), expiry_date: null, customer_id: null },
      { cert_number: 'TRA-TCC-2026-0417', name: 'Tax Compliance Certificate', agency_code: 'TRA', agency_name: 'Tanzania Revenue Authority', issued_date: days(-300), expiry_date: days(20), customer_id: null },
      { cert_number: 'TFDA-FP-88213', name: 'Food Processing Facility Licence', agency_code: 'TFDA', agency_name: 'Tanzania Food & Drugs Authority', issued_date: days(-200), expiry_date: days(9), customer_id: fishProcessors, auto_renew: true },
      { cert_number: 'TBS-EXP-55210', name: 'Export Conformity Certificate — Coffee', agency_code: 'TBS', agency_name: 'Tanzania Bureau of Standards', issued_date: days(-150), expiry_date: days(120), customer_id: coffeeUnion },
      { cert_number: 'OSHA-WSC-3391', name: 'Workplace Safety Certificate', agency_code: 'OSHA', agency_name: 'Occupational Safety & Health Authority', issued_date: days(-500), expiry_date: days(-14), customer_id: builders },
      { cert_number: 'NSSF-EMP-77120', name: 'Employer Registration', agency_code: 'NSSF', agency_name: 'National Social Security Fund', issued_date: days(-1200), expiry_date: null, customer_id: null },
      { cert_number: 'TBS-EXP-61044', name: 'Export Conformity Certificate — Cotton', agency_code: 'TBS', agency_name: 'Tanzania Bureau of Standards', issued_date: days(-60), expiry_date: days(305), customer_id: cotton },
    ];

    for (const c of certs) {
      const existing = await trx.selectFrom('comply_certificates').select('id').where('tenant_id', '=', TENANT_ID).where('cert_number', '=', c.cert_number).executeTakeFirst();
      if (existing) continue;
      await trx.insertInto('comply_certificates').values({
        tenant_id: TENANT_ID, cert_number: c.cert_number, name: c.name, agency_code: c.agency_code,
        agency_name: c.agency_name, issued_date: c.issued_date, expiry_date: c.expiry_date,
        customer_id: c.customer_id, auto_renew: c.auto_renew ?? false,
        metadata: { source: 'sample-data-seed' },
      }).execute();
    }
    console.log(`  ✓ ${certs.length} sample certificates checked/inserted`);

    // ── Applications ───────────────────────────────────────────────────────
    const apps: Array<{ app_number: string; cert_type: string; agency_code: string; status: string; customer_id: string | null; notes: string }> = [
      { app_number: 'APP-2026-101', cert_type: 'Import Permit — Salt Processing Equipment', agency_code: 'TBS', status: 'draft', customer_id: byName('Pwani Salt Works Limited'), notes: 'Awaiting supplier invoice before submission.' },
      { app_number: 'APP-2026-102', cert_type: 'Facility Licence Renewal', agency_code: 'TFDA', status: 'submitted', customer_id: fishProcessors, notes: 'Submitted via manual portal, tracking ref pending confirmation.' },
      { app_number: 'APP-2026-103', cert_type: 'Environmental Compliance Certificate', agency_code: 'BRELA', status: 'review', customer_id: coal, notes: 'NEMC site inspection scheduled.' },
      { app_number: 'APP-2026-104', cert_type: 'Product Registration — Zanzibar Spice Blends', agency_code: 'TFDA', status: 'issued', customer_id: spiceExports, notes: 'Approved — certificate issued to vault.' },
    ];
    for (const a of apps) {
      const existing = await trx.selectFrom('comply_applications').select('id').where('tenant_id', '=', TENANT_ID).where('app_number', '=', a.app_number).executeTakeFirst();
      if (existing) continue;
      await trx.insertInto('comply_applications').values({
        tenant_id: TENANT_ID, app_number: a.app_number, cert_type: a.cert_type, agency_code: a.agency_code,
        status: a.status, created_by: USER_ID, notes: a.notes, customer_id: a.customer_id,
        submitted_at: a.status === 'draft' ? null : days(-10),
      }).execute();
    }
    console.log(`  ✓ ${apps.length} sample applications checked/inserted`);

    // ── Obligations ────────────────────────────────────────────────────────
    const obligations: Array<{ obligation_code: string; agency_code: string; name: string; frequency: string; mandatory: boolean; due_date: Date | null; customer_id: string | null; status?: string }> = [
      { obligation_code: 'OB-SAMPLE-BRELA-RETURN', agency_code: 'BRELA', name: 'Annual Company Return', frequency: 'Annual', mandatory: true, due_date: days(45), customer_id: null },
      { obligation_code: 'OB-SAMPLE-TRA-VAT', agency_code: 'TRA', name: 'VAT Registration & Filing', frequency: 'Monthly', mandatory: true, due_date: days(12), customer_id: null, status: 'active' },
      { obligation_code: 'OB-SAMPLE-TFDA-PRODREG', agency_code: 'TFDA', name: 'Product Registration', frequency: 'Once', mandatory: true, due_date: days(-5), customer_id: fishProcessors, status: 'expired' },
      { obligation_code: 'OB-SAMPLE-TBS-CONFORM', agency_code: 'TBS', name: 'Conformity Assessment', frequency: 'Annual', mandatory: true, due_date: days(120), customer_id: coffeeUnion, status: 'active' },
      { obligation_code: 'OB-SAMPLE-OSHA-SAFETY', agency_code: 'OSHA', name: 'Workplace Safety Certificate', frequency: 'Annual', mandatory: true, due_date: days(-14), customer_id: builders, status: 'pending' },
    ];
    for (const o of obligations) {
      const existing = await trx.selectFrom('comply_obligations').select('id').where('tenant_id', '=', TENANT_ID).where('obligation_code', '=', o.obligation_code).executeTakeFirst();
      if (existing) continue;
      await trx.insertInto('comply_obligations').values({
        tenant_id: TENANT_ID, obligation_code: o.obligation_code, agency_code: o.agency_code, name: o.name,
        frequency: o.frequency, mandatory: o.mandatory, due_date: o.due_date, customer_id: o.customer_id,
        status: o.status ?? 'not-started',
      }).execute();
    }
    console.log(`  ✓ ${obligations.length} sample obligations checked/inserted`);

    // ── Renewal workflow (for the expiring TFDA facility licence) ──────────
    const fpCert = await trx.selectFrom('comply_certificates').select('id').where('tenant_id', '=', TENANT_ID).where('cert_number', '=', 'TFDA-FP-88213').executeTakeFirst();
    if (fpCert) {
      const existingRenewal = await trx.selectFrom('comply_renewals').select('id').where('tenant_id', '=', TENANT_ID).where('cert_id', '=', fpCert.id).executeTakeFirst();
      if (!existingRenewal) {
        await trx.insertInto('comply_renewals').values({
          tenant_id: TENANT_ID, cert_id: fpCert.id, status: 'pending_review', trigger: 'automatic',
        }).execute();
        console.log('  ✓ sample renewal workflow inserted (TFDA facility licence)');
      }
    }

    // ── Legal engagement (Clyde & Co handling the TBS export conformity work) ─
    const clydeCo = await trx.selectFrom('comply_legal_firms').select('id').where('name', '=', 'Clyde & Co Tanzania').executeTakeFirst();
    if (clydeCo) {
      const existingEng = await trx.selectFrom('comply_legal_engagements').select('id')
        .where('tenant_id', '=', TENANT_ID).where('firm_id', '=', clydeCo.id).where('customer_id', '=', cotton).executeTakeFirst();
      if (!existingEng) {
        const eng = await trx.insertInto('comply_legal_engagements').values({
          tenant_id: TENANT_ID, firm_id: clydeCo.id, engagement_type: 'Document Preparation',
          agency_code: 'TBS', brief: 'Need help preparing the export conformity documentation for the new cotton export contract to Kenya.',
          status: 'in_progress', created_by: USER_ID, customer_id: cotton,
        }).returning('id').executeTakeFirstOrThrow();
        await trx.insertInto('comply_legal_messages').values({
          engagement_id: eng.id, sender_type: 'tenant', sender_id: USER_ID,
          body: 'Need help preparing the export conformity documentation for the new cotton export contract to Kenya.',
        }).execute();
        await trx.insertInto('comply_legal_messages').values({
          engagement_id: eng.id, sender_type: 'firm', sender_id: clydeCo.id,
          body: 'Happy to help — please share the latest TBS inspection report and we\'ll get the conformity file assembled within 5 business days.',
        }).execute();
        await trx.insertInto('comply_legal_milestones').values({
          engagement_id: eng.id, description: 'Document review & TBS liaison', amount: 'From $280 / engagement', status: 'pending',
        }).execute();
        console.log('  ✓ sample legal engagement inserted (Clyde & Co Tanzania)');
      }
    }
  });

  console.log('✅ ComplyOS sample data seed complete.');
  process.exit(0);
}

main().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
