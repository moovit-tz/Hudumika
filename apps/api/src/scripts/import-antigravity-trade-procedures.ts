/**
 * Import real, browser-rendered Tanzania Trade Portal procedure detail
 * scraped by Antigravity (see the prompt in
 * scratchpad/antigravity-trade-portal-prompt.md for the task it was given)
 * into trade_procedures / trade_procedure_steps / trade_institutions.
 *
 * Antigravity writes its output as a JSON array — one object per procedure,
 * matching the schema this script expects (source_id, kind, name, summary,
 * source_url, steps[] each with a nested institution object). The file is
 * a running snapshot (currently partial, growing as the scrape continues),
 * so this script is safe to re-run against the same file as it's updated —
 * everything is upserted by natural key (source_id for procedures, name for
 * institutions), and a procedure's steps are replaced as a whole unit (not
 * merged) since the scrape re-reads the full page each time.
 *
 * Usage:  npx tsx src/scripts/import-antigravity-trade-procedures.ts [path-to-json]
 *         (defaults to ../../../trade_procedures_partial.json, i.e. the repo root)
 */
import { db } from '../db/client.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface ScrapedInstitution {
  name: string | null;
  acronym?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
}

interface ScrapedStep {
  step_no: number;
  name: string;
  description?: string | null;
  institution?: ScrapedInstitution | null;
  duration_estimate?: string | null;
  cost_estimate?: string | null;
  required_documents?: string[] | null;
  is_online?: boolean;
  is_optional?: boolean;
  source_url?: string | null;
}

interface ScrapedProcedure {
  source_id: number;
  kind: string;
  name: string;
  summary?: string | null;
  source_url?: string | null;
  total_cost?: string | null;
  total_duration?: string | null;
  steps: ScrapedStep[];
  note?: string;
}

const VALID_KINDS = new Set(['IMPORT', 'EXPORT', 'TRANSIT', 'REGISTRATION']);

async function upsertInstitution(inst: ScrapedInstitution): Promise<string | null> {
  const name = inst.name?.trim();
  if (!name) return null;
  const existing = await db.selectFrom('trade_institutions').select('id').where('name', '=', name).executeTakeFirst();
  const fields = {
    acronym: inst.acronym?.trim() || null,
    phone: inst.phone?.trim() || null,
    email: inst.email?.trim() || null,
    website: inst.website?.trim() || null,
    address: inst.address?.trim() || null,
    source_url: 'https://trade.tanzania.go.tz/',
    scraped_at: new Date(),
  };
  if (existing) {
    await db.updateTable('trade_institutions').set({ ...fields, updated_at: new Date() }).where('id', '=', existing.id).execute();
    return existing.id;
  }
  const row = await db.insertInto('trade_institutions').values({ name, category: null, ...fields }).returning('id').executeTakeFirstOrThrow();
  return row.id;
}

async function main() {
  const filePath = resolve(process.argv[2] || resolve(import.meta.dirname, '../../../../trade_procedures_partial.json'));
  console.log(`Reading ${filePath}...`);
  const raw = readFileSync(filePath, 'utf8');
  const procedures: ScrapedProcedure[] = JSON.parse(raw);
  console.log(`Parsed ${procedures.length} procedures from the file.`);

  let proceduresImported = 0, proceduresSkipped = 0, stepsImported = 0, institutionsTouched = 0;
  const institutionCache = new Map<string, string>();

  for (const p of procedures) {
    if (!p.source_id || !p.name) { proceduresSkipped++; continue; }
    if (!p.steps || p.steps.length === 0) { proceduresSkipped++; continue; } // no real content yet — don't mark has_detail

    const kind = VALID_KINDS.has((p.kind || '').toUpperCase()) ? p.kind.toUpperCase() : 'REGISTRATION';

    try {
      const existing = await db.selectFrom('trade_procedures').select('id').where('source_id', '=', p.source_id).executeTakeFirst();
      let procId: string;
      const procFields = {
        name: p.name.trim(), kind, product_keywords: p.name.trim(),
        summary: p.summary?.trim() || null,
        has_detail: true,
        source_url: p.source_url || `https://trade.tanzania.go.tz/procedure/${p.source_id}?l=en`,
        scraped_at: new Date(),
      };
      if (existing) {
        await db.updateTable('trade_procedures').set({ ...procFields, updated_at: new Date() }).where('id', '=', existing.id).execute();
        procId = existing.id;
      } else {
        const row = await db.insertInto('trade_procedures').values({ source_id: p.source_id, ...procFields }).returning('id').executeTakeFirstOrThrow();
        procId = row.id;
      }

      // Steps are curated as a whole unit per procedure — replace, not merge.
      await db.deleteFrom('trade_procedure_steps').where('procedure_id', '=', procId).execute();

      for (const s of p.steps) {
        let institutionId: string | null = null;
        if (s.institution?.name) {
          const cacheKey = s.institution.name.trim().toLowerCase();
          if (institutionCache.has(cacheKey)) {
            institutionId = institutionCache.get(cacheKey)!;
          } else {
            institutionId = await upsertInstitution(s.institution);
            if (institutionId) { institutionCache.set(cacheKey, institutionId); institutionsTouched++; }
          }
        }
        await db.insertInto('trade_procedure_steps').values({
          procedure_id: procId, step_no: s.step_no, name: s.name?.trim() || `Step ${s.step_no}`,
          description: s.description?.trim() || null, institution_id: institutionId,
          duration_estimate: s.duration_estimate?.trim() || null, cost_estimate: s.cost_estimate?.trim() || null,
          // Must be JSON.stringify()'d: node-postgres serializes a raw JS array
          // parameter using Postgres array-literal syntax, and an empty array's
          // literal ('{}') is *also* valid empty-object JSON — so it casts into
          // this jsonb column as {} instead of [] with no error. Confirmed via
          // a full-table repair (apps/api/src/scripts/repair-required-documents.ts).
          required_documents: JSON.stringify(s.required_documents ?? []) as unknown as string[],
          is_online: !!s.is_online, source_url: s.source_url || procFields.source_url,
        }).execute();
        stepsImported++;
      }
      proceduresImported++;
    } catch (err) {
      console.error(`Failed to import procedure ${p.source_id} (${p.name}):`, (err as Error).message);
      proceduresSkipped++;
    }
  }

  console.log(`\nImport complete: ${proceduresImported} procedures imported (${proceduresSkipped} skipped — no steps or bad data), ${stepsImported} steps, ${institutionsTouched} institutions upserted.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
