/**
 * Import the Tanzania Trade Portal's (trade.tanzania.go.tz) full procedure
 * catalog — names and IDs — into trade_procedures.
 *
 * The portal is a client-rendered Angular app; its procedure detail pages
 * don't return usable content to a plain HTTP fetch (the content loads via
 * JS after page load). What IS reliably present in the portal's own raw
 * HTML is the procedure list embedded in its "Contact / inquiry" form's
 * procedure-picker dropdown (`select.procedures-dropdown`), which enumerates
 * every real procedure name + numeric ID published on the site. That's what
 * this script imports — the full, real catalog of *what procedures exist*.
 *
 * Step-level detail (institutions, required documents, timelines, fees) is
 * NOT available this way and is seeded separately, procedure-by-procedure,
 * by seed-trade-wizard-flagship-content.ts — see that file's header for why.
 * trade_procedures.has_detail distinguishes catalog-only rows (this script)
 * from rows with real step content (the flagship seed).
 *
 * Usage:  npx tsx src/scripts/import-tantrade-procedures.ts
 * Re-runnable: upserts by source_id.
 */
import { db } from '../db/client.js';

const SOURCE_PAGE = 'https://trade.tanzania.go.tz/Procedures?l=en';

// Entries that are portal-UI artifacts (feedback/inquiry categories), not real trade procedures.
const NAME_BLOCKLIST = /^(HS Code|Request for|Report incorrect|Suggest simplification|Give us feedback)/i;

function classifyKind(name: string): 'IMPORT' | 'EXPORT' | 'TRANSIT' | 'REGISTRATION' {
  const n = name.toLowerCase();
  if (n.includes('export')) return 'EXPORT';
  if (n.includes('import')) return 'IMPORT';
  if (n.includes('transit')) return 'TRANSIT';
  return 'REGISTRATION';
}

async function main() {
  const res = await fetch(SOURCE_PAGE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch ${SOURCE_PAGE}: ${res.status}`);
  const html = await res.text();

  // Isolate the procedures-dropdown <select> specifically, to avoid the
  // separate inquiry-category dropdown that shares the same page.
  const selectMatch = html.match(/<select[^>]*\bprocedures-dropdown\b[^>]*>([\s\S]*?)<\/select>/);
  if (!selectMatch) throw new Error('Could not find the procedures-dropdown <select> on the page — portal markup may have changed.');
  const selectHtml = selectMatch[1];

  const optionRe = /<option value="(\d+)">([^<]+)<\/option>/g;
  const procedures: { source_id: number; name: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = optionRe.exec(selectHtml))) {
    const name = m[2].trim();
    if (!name || NAME_BLOCKLIST.test(name)) continue;
    procedures.push({ source_id: Number(m[1]), name });
  }

  if (procedures.length === 0) throw new Error('Parsed zero procedures — regex likely stale against current portal markup.');

  let inserted = 0, updated = 0, skipped = 0;
  const now = new Date();
  for (const p of procedures) {
    try {
      const existing = await db.selectFrom('trade_procedures').select('id').where('source_id', '=', p.source_id).executeTakeFirst();
      const kind = classifyKind(p.name);
      const sourceUrl = `https://trade.tanzania.go.tz/procedure/${p.source_id}?l=en`;
      if (existing) {
        await db.updateTable('trade_procedures')
          .set({ name: p.name, kind, product_keywords: p.name, source_url: sourceUrl, scraped_at: now, updated_at: now })
          .where('id', '=', existing.id)
          .execute();
        updated++;
      } else {
        await db.insertInto('trade_procedures')
          .values({ source_id: p.source_id, name: p.name, kind, product_keywords: p.name, summary: null, has_detail: false, source_url: sourceUrl, scraped_at: now })
          .execute();
        inserted++;
      }
    } catch (err) {
      console.error(`Skipped procedure ${p.source_id} (${p.name}):`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`trade_procedures import complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${procedures.length} total parsed from portal.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
