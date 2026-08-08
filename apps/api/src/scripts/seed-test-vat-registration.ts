/**
 * Put a clearly-marked TEST VAT registration on every tenant, so the
 * VAT-registered path can be exercised without waiting on a real VRN.
 *
 * This exists because the registered path is the one that matters commercially
 * — VAT-compliant businesses are the customers — and it would otherwise ship
 * having only ever been run in the unregistered state.
 *
 * The number is deliberately not a plausible VRN. It is prefixed TEST- so that
 * anyone reading an invoice, a database row or a TRA payload can see instantly
 * that it is not a real registration, and every row carries a note saying so.
 * A convincing fake would be the dangerous version of this.
 *
 *   PROBE=1 npx tsx src/scripts/seed-test-vat-registration.ts          # apply
 *   PROBE=1 npx tsx src/scripts/seed-test-vat-registration.ts --clear  # remove
 *
 * Remove it before anything is submitted to a revenue authority for real.
 */
import { db } from '../db/client.js';

const TEST_NUMBER = 'TEST-VRN-NOT-REAL';
const TEST_NOTE =
  'TEST REGISTRATION — not a real VRN. Seeded by scripts/seed-test-vat-registration.ts ' +
  'so the VAT-registered path could be exercised before go-live. Replace with the ' +
  'genuine registration, or clear it, before filing or fiscalising anything.';

async function main() {
  if (process.env.PROBE !== '1') {
    console.log('This writes to the database. Re-run with PROBE=1 if you mean it.');
    return;
  }
  const clearing = process.argv.includes('--clear');

  if (clearing) {
    const removed = await db.deleteFrom('tax_registrations')
      .where('registration_number', '=', TEST_NUMBER)
      .returning(['tenant_id', 'jurisdiction'])
      .execute();
    console.log(`Removed ${removed.length} test registration(s).`);
    const left = await db.selectFrom('tax_registrations').select('id').execute();
    console.log(`tax_registrations rows remaining: ${left.length}`);
    await db.destroy();
    return;
  }

  const tenants = await db.selectFrom('tenants').select(['id', 'name']).execute();

  for (const t of tenants) {
    // A tenant's jurisdiction comes from its own default tax code where it has
    // one, so this does not assume Tanzania.
    const code = await db.selectFrom('tax_codes').select('jurisdiction')
      .where('tenant_id', '=', t.id).where('is_default', '=', true).executeTakeFirst();
    const juris = (code?.jurisdiction ?? 'TZ').toUpperCase();

    // Never overwrite a registration someone entered deliberately.
    const existing = await db.selectFrom('tax_registrations').select(['registration_number'])
      .where('tenant_id', '=', t.id).where('jurisdiction', '=', juris).executeTakeFirst();
    if (existing && existing.registration_number !== TEST_NUMBER) {
      console.log(`  skip  ${t.name} (${juris}) — a real registration is already recorded`);
      continue;
    }

    const values = {
      tenant_id: t.id,
      jurisdiction: juris,
      regime: 'VAT',
      status: 'registered' as const,
      registration_number: TEST_NUMBER,
      basis: 'VOLUNTARY',
      registered_from: '2026-01-01',
      notes: TEST_NOTE,
      updated_at: new Date(),
    };
    await db.insertInto('tax_registrations').values(values)
      .onConflict(oc => oc.columns(['tenant_id', 'jurisdiction', 'regime']).doUpdateSet(values))
      .execute();
    console.log(`  set   ${t.name} (${juris}) -> registered, ${TEST_NUMBER}`);
  }

  console.log(
    `\nDone. Every one of these is marked as a test registration in its notes and ` +
    `carries "${TEST_NUMBER}" rather than a plausible number.\n` +
    `Undo with:  PROBE=1 npx tsx src/scripts/seed-test-vat-registration.ts --clear`,
  );
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
