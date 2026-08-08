/**
 * What a signup from each country actually gets.
 *
 * The question this answers: if someone from Ghana, Kenya, Sudan or South
 * Africa registers today, does the system give them their own tax setup or
 * Tanzania's? It used to give them Tanzania's — ensureTaxCodes defaulted to TZ
 * and 18% for every workspace on earth.
 *
 * Creates a throwaway tenant per country, seeds it exactly as a real signup
 * would, prints the result, and deletes it.
 *
 *   PROBE=1 npx tsx src/scripts/check-country-onboarding.ts
 */
import { db } from '../db/client.js';
import { ensureTaxCodes } from '../services/tax-code.service.js';
import { componentsFor, applyComponents } from '../services/tax-component.service.js';

const COUNTRIES = ['GH', 'KE', 'SD', 'ZA', 'TZ', 'NG', 'XX'];

async function main() {
  if (process.env.PROBE !== '1') {
    console.log('This creates and deletes throwaway tenants. Re-run with PROBE=1.');
    return;
  }

  for (const country of COUNTRIES) {
    const [t] = await db.insertInto('tenants')
      .values({ name: `__probe ${country}`, slug: `__probe-${country.toLowerCase()}-${Date.now()}` } as any)
      .returningAll().execute();
    await db.insertInto('tenant_settings')
      .values({ tenant_id: t.id, settings: JSON.stringify({ company: { country } }) as any })
      .onConflict(oc => oc.column('tenant_id').doNothing()).execute();

    await ensureTaxCodes(db, t.id);

    const codes = await db.selectFrom('tax_codes')
      .select(['code', 'name', 'rate', 'jurisdiction', 'tra_tax_code', 'tra_vat_rate', 'guidance'])
      .where('tenant_id', '=', t.id).where('code', 'in', ['STD', 'ZERO', 'EXEMPT']).execute();
    const std = codes.find(c => c.code === 'STD')!;

    const stdRow = await db.selectFrom('tax_codes').select('id')
      .where('tenant_id', '=', t.id).where('code', '=', 'STD').executeTakeFirst();
    const comps = stdRow ? await componentsFor(db, stdRow.id) : [];

    console.log(`\n${country}  ->  jurisdiction ${std.jurisdiction}, standard ${Number(std.rate)}%`);
    console.log(`      TRA fields: ${std.tra_tax_code === null ? 'none (correct outside Tanzania)' : `TAXCODE ${std.tra_tax_code} / VATRATE ${std.tra_vat_rate}`}`);
    if (comps.length) {
      const r = applyComponents(1000, comps);
      console.log(`      components: ${comps.map(c => `${c.code} ${c.rate}%${c.recoverable ? '' : ' (cost)'}`).join(' + ')}`
        + `  =  ${r.effectiveRatePct.toFixed(3)}% effective`);
    }
    if (std.guidance) console.log(`      note: ${std.guidance}`);

    await db.deleteFrom('tax_code_components')
      .where('tax_code_id', 'in', db.selectFrom('tax_codes').select('id').where('tenant_id', '=', t.id))
      .execute();
    await db.deleteFrom('tax_codes').where('tenant_id', '=', t.id).execute();
    await db.deleteFrom('tenant_settings').where('tenant_id', '=', t.id).execute();
    await db.deleteFrom('tenants').where('id', '=', t.id).execute();
  }

  const left = await db.selectFrom('tenants').select('id').where('name', 'like', '__probe%').execute();
  console.log(`\nthrowaway tenants remaining: ${left.length}`);
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
