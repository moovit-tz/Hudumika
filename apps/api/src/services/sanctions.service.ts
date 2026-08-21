// Denied-party / sanctions screening (M2 of the ClearOS roadmap).
//
// Two real, free, public sanctions sources are synced into a shared,
// platform-level reference table (sanctions_entries/sanctions_aliases —
// same "reference data via dbPlatform, no tenant_id, no RLS" shape as
// hs_codes): the US Treasury OFAC SDN list and the UN Security Council
// Consolidated List. Screening a name against them is a real pg_trgm
// trigram-similarity query, not a fabricated "0 matches found" placeholder.
//
// Only Individual/Entity SDN records are imported — Vessel/Aircraft entries
// exist in the OFAC feed too, but this screens *parties* (shipper,
// consignee, customer), not equipment, so importing them would just be
// noise a name-similarity match would never legitimately hit.
import { XMLParser } from 'fast-xml-parser';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';

const OFAC_SDN_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML';
const UN_CONSOLIDATED_URL = 'https://unsolprodfiles.blob.core.windows.net/publiclegacyxmlfiles/EN/consolidated.xml';
// Both hosts have returned 403s to requests with no User-Agent at all during
// manual verification of this integration — a real browser UA, not a bot-ish
// default, is what got a clean 200.
const FETCH_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hudumika-Compliance/1.0' };

// Below this pg_trgm similarity score a "match" is pure noise and isn't
// surfaced at all. At/above SCREEN_FLAG_SCORE it's treated as a real hit
// that needs a human decision. Between the two, it's kept on the screening
// row (best_match_*) but the subject stays 'clear' — visible if a reviewer
// opens the record, not enough on its own to interrupt a workflow.
const SCREEN_MIN_SCORE = 0.3;
const SCREEN_FLAG_SCORE = 0.45;

interface ParsedSanctionsEntry {
  source: 'OFAC' | 'UN';
  source_uid: string;
  entry_type: 'INDIVIDUAL' | 'ENTITY';
  primary_name: string;
  programs: string | null;
  listed_on: string | null;
  remarks: string | null;
  raw: unknown;
  aliases: string[];
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Fetch failed for ${url}: HTTP ${res.status}`);
  return res.text();
}

function parseOfacSdn(xml: string): ParsedSanctionsEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (name) => ['sdnEntry', 'aka', 'program'].includes(name),
  });
  const doc = parser.parse(xml);
  const rawEntries = asArray(doc?.sdnList?.sdnEntry);

  const out: ParsedSanctionsEntry[] = [];
  for (const e of rawEntries) {
    // Vessel/Aircraft records don't have a "name a customer would type" the
    // same way a person or company does — out of scope for party screening.
    if (e.sdnType !== 'Individual' && e.sdnType !== 'Entity') continue;
    const primaryName = [e.firstName, e.lastName].filter(Boolean).join(' ').trim() || String(e.lastName || '').trim();
    if (!primaryName) continue;

    const aliases = asArray(e.akaList?.aka)
      .map((a: any) => [a.firstName, a.lastName].filter(Boolean).join(' ').trim())
      .filter(Boolean);

    out.push({
      source: 'OFAC',
      source_uid: String(e.uid),
      entry_type: e.sdnType === 'Individual' ? 'INDIVIDUAL' : 'ENTITY',
      primary_name: primaryName,
      programs: asArray(e.programList?.program).join(', ') || null,
      listed_on: null, // not present in the SDN export
      remarks: e.remarks ? String(e.remarks) : null,
      raw: e,
      aliases,
    });
  }
  return out;
}

// Most LISTED_ON values are a clean YYYY-MM-DD, but a real minority carry a
// bogus trailing UTC-offset with no 'T' separator ("2015-03-27-04:00") that
// Postgres's DATE parser rejects outright — confirmed against the live feed,
// not a hypothetical. Keep only a leading, valid date; drop anything else
// rather than fail the whole sync over one malformed upstream field.
function normalizeUnDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseUnConsolidated(xml: string): ParsedSanctionsEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (name) => ['INDIVIDUAL', 'ENTITY', 'INDIVIDUAL_ALIAS', 'ENTITY_ALIAS'].includes(name),
  });
  const doc = parser.parse(xml);

  const out: ParsedSanctionsEntry[] = [];

  for (const e of asArray(doc?.CONSOLIDATED_LIST?.INDIVIDUALS?.INDIVIDUAL)) {
    const primaryName = [e.FIRST_NAME, e.SECOND_NAME, e.THIRD_NAME].filter(Boolean).join(' ').trim();
    if (!primaryName) continue;
    // ALIAS_NAME is a single semicolon-delimited string per <INDIVIDUAL_ALIAS>, not one alias each.
    const aliases = asArray(e.INDIVIDUAL_ALIAS)
      .flatMap((a: any) => String(a.ALIAS_NAME || '').split(';'))
      .map((s: string) => s.trim())
      .filter(Boolean);

    out.push({
      source: 'UN',
      source_uid: String(e.DATAID),
      entry_type: 'INDIVIDUAL',
      primary_name: primaryName,
      programs: e.UN_LIST_TYPE ? String(e.UN_LIST_TYPE) : null,
      listed_on: normalizeUnDate(e.LISTED_ON),
      remarks: e.COMMENTS1 ? String(e.COMMENTS1) : null,
      raw: e,
      aliases,
    });
  }

  for (const e of asArray(doc?.CONSOLIDATED_LIST?.ENTITIES?.ENTITY)) {
    const primaryName = String(e.FIRST_NAME || '').trim();
    if (!primaryName) continue;
    const aliases = asArray(e.ENTITY_ALIAS)
      .flatMap((a: any) => String(a.ALIAS_NAME || '').split(';'))
      .map((s: string) => s.trim())
      .filter(Boolean);

    out.push({
      source: 'UN',
      source_uid: String(e.DATAID),
      entry_type: 'ENTITY',
      primary_name: primaryName,
      programs: e.UN_LIST_TYPE ? String(e.UN_LIST_TYPE) : null,
      listed_on: normalizeUnDate(e.LISTED_ON),
      remarks: e.COMMENTS1 ? String(e.COMMENTS1) : null,
      raw: e,
      aliases,
    });
  }

  return out;
}

async function upsertEntries(entries: ParsedSanctionsEntry[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    const row = await dbPlatform
      .insertInto('sanctions_entries')
      .values({
        source: entry.source,
        source_uid: entry.source_uid,
        entry_type: entry.entry_type,
        primary_name: entry.primary_name,
        programs: entry.programs,
        listed_on: entry.listed_on as any,
        remarks: entry.remarks,
        raw: JSON.stringify(entry.raw) as any,
      })
      .onConflict((oc) => oc.columns(['source', 'source_uid']).doUpdateSet({
        entry_type: entry.entry_type,
        primary_name: entry.primary_name,
        programs: entry.programs,
        listed_on: entry.listed_on as any,
        remarks: entry.remarks,
        raw: JSON.stringify(entry.raw) as any,
        updated_at: new Date(),
      }))
      .returning('id')
      .executeTakeFirstOrThrow();

    // Simplest correct alias refresh: replace the set every sync. Entry
    // counts (~19k OFAC, a few thousand UN) make a full delete+reinsert per
    // entry cheap enough for a once-a-day background job; it also means a
    // dropped alias upstream actually disappears here instead of lingering.
    await dbPlatform.deleteFrom('sanctions_aliases').where('entry_id', '=', row.id).execute();
    if (entry.aliases.length > 0) {
      await dbPlatform
        .insertInto('sanctions_aliases')
        .values(entry.aliases.map((alias_name) => ({ entry_id: row.id, alias_name })))
        .execute();
    }
    count++;
  }
  return count;
}

async function syncSource(source: 'OFAC' | 'UN', fetchAndParse: () => Promise<ParsedSanctionsEntry[]>) {
  const run = await dbPlatform
    .insertInto('sanctions_sync_runs')
    .values({ source, status: 'running' })
    .returning('id')
    .executeTakeFirstOrThrow();

  try {
    const entries = await fetchAndParse();
    const count = await upsertEntries(entries);
    await dbPlatform
      .updateTable('sanctions_sync_runs')
      .set({ status: 'success', completed_at: new Date(), entries_count: count })
      .where('id', '=', run.id)
      .execute();
    return count;
  } catch (err: any) {
    await dbPlatform
      .updateTable('sanctions_sync_runs')
      .set({ status: 'failed', completed_at: new Date(), error: err.message })
      .where('id', '=', run.id)
      .execute();
    throw err;
  }
}

export async function syncOfacList(): Promise<number> {
  return syncSource('OFAC', async () => parseOfacSdn(await fetchText(OFAC_SDN_URL)));
}

export async function syncUnList(): Promise<number> {
  return syncSource('UN', async () => parseUnConsolidated(await fetchText(UN_CONSOLIDATED_URL)));
}

export interface ScreenMatch {
  entryId: string;
  matchedName: string;
  score: number;
  source: string;
  entryType: string;
  primaryName: string;
  programs: string | null;
}

/** Real pg_trgm trigram similarity against both the primary names and every known alias. */
export async function screenName(name: string): Promise<ScreenMatch[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const rows = await sql<{
    entry_id: string; matched_name: string; score: number;
    source: string; entry_type: string; primary_name: string; programs: string | null;
  }>`
    SELECT * FROM (
      SELECT e.id AS entry_id, e.primary_name AS matched_name, similarity(e.primary_name, ${trimmed}) AS score,
             e.source, e.entry_type, e.primary_name, e.programs
      FROM sanctions_entries e
      UNION ALL
      SELECT a.entry_id, a.alias_name AS matched_name, similarity(a.alias_name, ${trimmed}) AS score,
             e.source, e.entry_type, e.primary_name, e.programs
      FROM sanctions_aliases a
      JOIN sanctions_entries e ON e.id = a.entry_id
    ) matches
    WHERE score >= ${SCREEN_MIN_SCORE}
    ORDER BY score DESC
    LIMIT 5
  `.execute(dbPlatform);

  return rows.rows.map((r) => ({
    entryId: r.entry_id,
    matchedName: r.matched_name,
    score: Number(r.score),
    source: r.source,
    entryType: r.entry_type,
    primaryName: r.primary_name,
    programs: r.programs,
  }));
}

export interface ScreeningResult {
  id: string;
  status: 'clear' | 'flagged';
  matches: ScreenMatch[];
}

/**
 * Screens one named party for a tenant and records the result — always
 * writes a sanctions_screenings row (an audit trail of "we checked"), and
 * flags it for review only when the best match clears SCREEN_FLAG_SCORE.
 */
export async function screenSubject(
  tenantId: string,
  subjectType: 'customer' | 'contact' | 'adhoc',
  subjectId: string | null,
  name: string,
): Promise<ScreeningResult> {
  const matches = await screenName(name);
  const best = matches[0];
  const status: 'clear' | 'flagged' = best && best.score >= SCREEN_FLAG_SCORE ? 'flagged' : 'clear';

  const row = await withTenant(tenantId, (trx) =>
    trx
      .insertInto('sanctions_screenings')
      .values({
        tenant_id: tenantId,
        subject_type: subjectType,
        subject_id: subjectId,
        screened_name: name.trim(),
        best_match_entry_id: best?.entryId ?? null,
        best_match_name: best?.matchedName ?? null,
        best_match_score: best?.score ?? null,
        status,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  );

  return { id: row.id, status, matches };
}

export async function listScreenings(tenantId: string, status?: string) {
  return withTenant(tenantId, (trx) => {
    let q = trx.selectFrom('sanctions_screenings').selectAll().where('tenant_id', '=', tenantId);
    if (status) q = q.where('status', '=', status);
    return q.orderBy('created_at', 'desc').limit(200).execute();
  });
}

export async function getScreening(tenantId: string, id: string) {
  return withTenant(tenantId, (trx) =>
    trx.selectFrom('sanctions_screenings').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .executeTakeFirst()
  );
}

/** Full source-record detail for the review screen — the `raw` XML-derived JSON, aliases, everything on file. */
export async function getEntryDetail(entryId: string) {
  const entry = await dbPlatform.selectFrom('sanctions_entries').selectAll().where('id', '=', entryId).executeTakeFirst();
  if (!entry) return null;
  const aliases = await dbPlatform.selectFrom('sanctions_aliases').select('alias_name').where('entry_id', '=', entryId).execute();
  return { ...entry, aliases: aliases.map((a) => a.alias_name) };
}

export async function reviewScreening(
  tenantId: string,
  id: string,
  userId: string,
  decision: 'cleared_false_positive' | 'confirmed_match',
  note: string | null,
) {
  return withTenant(tenantId, (trx) =>
    trx.updateTable('sanctions_screenings')
      .set({ status: decision, reviewed_by: userId, reviewed_at: new Date(), review_note: note, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()
  );
}

export async function getLastSyncStatus() {
  const rows = await dbPlatform
    .selectFrom('sanctions_sync_runs')
    .selectAll()
    .where('status', 'in', ['success', 'failed'])
    .orderBy('started_at', 'desc')
    .limit(10)
    .execute();
  const entriesTotal = await dbPlatform
    .selectFrom('sanctions_entries')
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirst();
  return { runs: rows, entriesTotal: Number(entriesTotal?.count ?? 0) };
}
