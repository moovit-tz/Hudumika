/**
 * Does any live journal entry point at a document that no longer exists?
 *
 * `journal_entries.source_id` is polymorphic — it means a different table for
 * each `source_module` — so no foreign key can enforce this. That is exactly
 * why it needs checking rather than assuming: one orphan already existed, an AP
 * entry whose bill had been deleted, and it was the only posting account 2200
 * had ever had.
 *
 * Invoices and bills now refuse deletion once posted and offer a void instead,
 * so the AR and AP paths are closed. This script is what keeps the rest honest,
 * and what catches a new delete path being added later.
 *
 *   npx tsx src/scripts/check-ledger-integrity.ts
 *
 * Exits non-zero when it finds something, so it can be wired into CI.
 */
import { sql } from 'kysely';
import { db } from '../db/client.js';

/**
 * What each source_module's `source_id` points at. A module missing from here
 * is reported as unknown rather than silently passing — an unrecognised module
 * is itself a finding.
 */
const SOURCE_TABLES: Record<string, string | null> = {
  AR: 'sales_invoices',
  AP: 'supplier_bills',
  EXPENSE: 'containers',   // demurrage postings, see cost-posting.service.ts
  MANUAL: 'vat_periods',   // period-end adjustments, see vat-period.service.ts
  PAYROLL: null,           // no posting site exists yet
};

async function main() {
  const modules = await db
    .selectFrom('journal_entries')
    .select(({ fn }) => ['source_module', fn.countAll<string>().as('n')])
    .where('voided_at', 'is', null)
    .groupBy('source_module')
    .execute();

  let problems = 0;
  console.log('Live journal entries, by source module:\n');

  for (const m of modules) {
    const mod = m.source_module ?? '(null)';
    const table = SOURCE_TABLES[mod];

    if (table === undefined) {
      console.log(`  ${mod.padEnd(9)} ${String(m.n).padStart(5)}   UNKNOWN MODULE — not in SOURCE_TABLES, cannot be checked`);
      problems++;
      continue;
    }
    if (table === null) {
      console.log(`  ${mod.padEnd(9)} ${String(m.n).padStart(5)}   no posting site is expected for this module`);
      if (Number(m.n) > 0) problems++;
      continue;
    }

    // Identifier interpolation is unavoidable for a polymorphic reference, so
    // the table name comes from the map above and never from the database row.
    const res = await sql<{ n: string }>`
      select count(*)::text as n
        from journal_entries je
       where je.source_module = ${mod}
         and je.voided_at is null
         and je.source_id is not null
         and not exists (
           select 1 from ${sql.table(table)} t where t.id = je.source_id
         )`.execute(db);

    const orphans = Number(res.rows[0]?.n ?? 0);
    console.log(`  ${mod.padEnd(9)} ${String(m.n).padStart(5)}   -> ${table}${orphans > 0 ? `   ${orphans} ORPHANED` : '   ok'}`);
    if (orphans > 0) problems++;
  }

  const nullSource = await db.selectFrom('journal_entries')
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .where('voided_at', 'is', null).where('source_id', 'is', null).executeTakeFirst();
  const n = Number(nullSource?.n ?? 0);
  if (n > 0) {
    console.log(`\n  ${n} live entr${n === 1 ? 'y has' : 'ies have'} no source_id at all — not orphaned, but untraceable.`);
  }

  console.log(problems === 0
    ? '\nNo orphaned journal entries.'
    : `\n${problems} module(s) need attention.`);
  await db.destroy();
  process.exit(problems === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
