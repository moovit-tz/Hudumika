/**
 * Populates the platform template library (workflow_templates, migration 218)
 * with version 1 of each code-registry default, and stamps the workflows
 * already seeded into tenants with their template lineage (origin_template_key
 * / origin_template_version) so the self-learning phase has a diff baseline.
 *
 * Idempotent: skips a (template_key, version) that already exists; only stamps
 * lineage where it is still NULL.
 *
 * Usage: npx tsx src/scripts/seed-workflow-templates.ts
 */
import { db } from '../db/client.js';
import { DEFAULT_WORKFLOWS } from '../config/default-workflows.js';

async function main() {
  const now = new Date();
  let created = 0;
  for (const def of DEFAULT_WORKFLOWS) {
    const existing = await db.selectFrom('workflow_templates').select('id')
      .where('template_key', '=', def.templateKey).where('version', '=', 1).executeTakeFirst();
    if (existing) { console.log(`  ↷ ${def.templateKey} v1 already present`); continue; }
    await db.insertInto('workflow_templates').values({
      template_key: def.templateKey, version: 1, name: def.name, description: def.description,
      freight_modes: JSON.stringify(def.freightModes), consignment_types: JSON.stringify(def.consignmentTypes),
      steps: JSON.stringify(def.steps), status: 'published', is_system: true, source: 'platform',
      created_by: null, created_at: now, updated_at: now,
    }).execute();
    created++;
    console.log(`  ✓ ${def.templateKey} v1 (${def.steps.length} steps) published`);
  }

  // Stamp lineage on already-seeded tenant workflows (template_key set, no origin yet).
  const stamped = await db.updateTable('workflows')
    .set((eb: any) => ({ origin_template_key: eb.ref('template_key'), origin_template_version: 1 }))
    .where('is_system', '=', true).where('template_key', 'is not', null).where('origin_template_key', 'is', null)
    .executeTakeFirst();

  console.log(`\nDone. ${created} template(s) published; ${Number(stamped?.numUpdatedRows ?? 0)} tenant workflow(s) stamped with lineage.`);
  await db.destroy();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
