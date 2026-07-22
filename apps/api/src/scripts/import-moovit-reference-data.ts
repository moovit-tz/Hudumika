/**
 * Import customs reference data from moovit.co.tz (Moovit Logistics Ltd's
 * public EAC Customs Suite). The site embeds its entire dataset as plain
 * JS literals in one static HTML page:
 *
 *   HS_DB     — 5,977 EAC CET 2022 tariff lines  → hs_codes (upsert by code)
 *   ICD_DB    — 74 licensed ICD/dry-port operators → icd_directory (refresh)
 *   AGENTS_DB — 1,393 TASAC clearing agents (GN 83/2026) → clearing_agents_registry (refresh)
 *   EXCISE_DB — EAC excise schedules, 5 member states → eac_excise_schedules (refresh)
 *
 * The underlying data is public-record (TASAC/EAC gazette publications);
 * moovit.co.tz is the discovery mechanism. source_url records provenance.
 *
 * Usage:  npx tsx src/scripts/import-moovit-reference-data.ts [hs|icd|agents|excise|all]
 * Re-runnable: reference tables are wiped+reinserted; hs_codes is upserted.
 */
import { sql } from 'kysely';
import { db } from '../db/client.js';

const SOURCE_URL = 'https://moovit.co.tz/';
const dataset = (process.argv[2] ?? 'all').toLowerCase();

// ── Extract a `var NAME = [...]` / `{...}` literal from the page source ──
function extractLiteral(html: string, varName: string): string {
  const i = html.indexOf('var ' + varName);
  if (i === -1) throw new Error(`var ${varName} not found in page`);
  const start = html.indexOf('=', i) + 1;
  let j = start;
  while (/\s/.test(html[j])) j++;
  const openCh = html[j];
  const closeCh = openCh === '[' ? ']' : '}';
  let depth = 0, k = j, inStr = false, strCh = '';
  for (; k < html.length; k++) {
    const c = html[k];
    if (inStr) {
      if (c === '\\') { k++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) { k++; break; } }
  }
  return html.slice(j, k);
}

function evalLiteral<T>(raw: string): T {
  // The literals are plain data (arrays/objects of strings & numbers) written
  // by moovit's own build; Function() keeps them out of our module scope.
  return Function('"use strict"; return (' + raw + ')')() as T;
}

function parseDMY(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

async function importHs(html: string) {
  type HsRow = [string, string, string, number, string, string];
  const rows = evalLiteral<HsRow[]>(extractLiteral(html, 'HS_DB'));
  console.log(`HS_DB: ${rows.length} tariff lines`);

  let upserted = 0;
  const BATCH = 250;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map(([code, desc, headingDesc, duty, unit, flag]) => ({
      code,
      level: 8, // full 8-digit tariff lines ("0101.21.00")
      description: desc,
      parent_code: code.slice(0, 2),
      import_duty_rate: Number(duty) || 0,
      unit: unit || null,
      notes: headingDesc || null,
      // Source flags per line: P = PVoC (pre-shipment verification),
      // D = DI (destination inspection) — matches moovit's compliance tool.
      pvoc_required: flag === 'P',
      di_required: flag === 'D',
    }));
    await db
      .insertInto('hs_codes')
      .values(values)
      .onConflict(oc => oc.column('code').doUpdateSet({
        description: eb => eb.ref('excluded.description'),
        import_duty_rate: eb => eb.ref('excluded.import_duty_rate'),
        unit: eb => eb.ref('excluded.unit'),
        notes: eb => eb.ref('excluded.notes'),
        pvoc_required: eb => eb.ref('excluded.pvoc_required'),
        di_required: eb => eb.ref('excluded.di_required'),
        updated_at: sql`NOW()`,
      }))
      .execute();
    upserted += batch.length;
    if (upserted % 1000 < BATCH) console.log(`  … ${upserted}/${rows.length}`);
  }
  console.log(`✅ hs_codes upserted: ${upserted}`);
}

async function importIcd(html: string) {
  interface IcdRow { type: string; name: string; email?: string; tel?: string; address?: string; region?: string; lic?: string; start?: string; exp?: string }
  const rows = evalLiteral<IcdRow[]>(extractLiteral(html, 'ICD_DB'));
  console.log(`ICD_DB: ${rows.length} operators`);

  await db.deleteFrom('icd_directory').execute();
  await db.insertInto('icd_directory').values(rows.map(r => ({
    operator_type: r.type,
    name: r.name,
    email: r.email || null,
    tel: r.tel || null,
    address: r.address || null,
    region: r.region || null,
    license_no: r.lic || null,
    license_start: parseDMY(r.start),
    license_exp: parseDMY(r.exp),
    source_url: SOURCE_URL,
    scraped_at: new Date(),
  }))).execute();
  console.log(`✅ icd_directory refreshed: ${rows.length}`);
}

async function importAgents(html: string) {
  interface AgentRow { name: string; email?: string; lic?: string; region?: string; address?: string; tel?: string }
  const rows = evalLiteral<AgentRow[]>(extractLiteral(html, 'AGENTS_DB'));
  console.log(`AGENTS_DB: ${rows.length} clearing agents`);

  await db.deleteFrom('clearing_agents_registry').execute();
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insertInto('clearing_agents_registry').values(rows.slice(i, i + BATCH).map(r => ({
      name: r.name,
      email: r.email || null,
      license_no: r.lic || null,
      region: r.region || null,
      address: r.address || null,
      tel: r.tel || null,
      source_url: SOURCE_URL,
      scraped_at: new Date(),
    }))).execute();
  }
  console.log(`✅ clearing_agents_registry refreshed: ${rows.length}`);
}

async function importExcise(html: string) {
  interface ExciseDb { countries: string[]; categories: { cat: string; items: { desc: string; tz?: string; ke?: string; ug?: string; rw?: string; bi?: string }[] }[] }
  const data = evalLiteral<ExciseDb>(extractLiteral(html, 'EXCISE_DB'));
  const flat = data.categories.flatMap(c => c.items.map(it => ({ category: c.cat, ...it })));
  console.log(`EXCISE_DB: ${data.categories.length} categories, ${flat.length} items`);

  await db.deleteFrom('eac_excise_schedules').execute();
  await db.insertInto('eac_excise_schedules').values(flat.map(r => ({
    category: r.category,
    item_description: r.desc,
    tz_rate: r.tz && r.tz !== '—' ? r.tz : null,
    ke_rate: r.ke && r.ke !== '—' ? r.ke : null,
    ug_rate: r.ug && r.ug !== '—' ? r.ug : null,
    rw_rate: r.rw && r.rw !== '—' ? r.rw : null,
    bi_rate: r.bi && r.bi !== '—' ? r.bi : null,
    source_url: SOURCE_URL,
    scraped_at: new Date(),
  }))).execute();
  console.log(`✅ eac_excise_schedules refreshed: ${flat.length}`);
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  console.log(`Fetched ${(html.length / 1024).toFixed(0)} KB`);

  if (dataset === 'hs' || dataset === 'all') await importHs(html);
  if (dataset === 'icd' || dataset === 'all') await importIcd(html);
  if (dataset === 'agents' || dataset === 'all') await importAgents(html);
  if (dataset === 'excise' || dataset === 'all') await importExcise(html);

  await db.destroy();
  console.log('Done.');
}

main().catch(err => { console.error('❌ Import failed:', err); process.exit(1); });
