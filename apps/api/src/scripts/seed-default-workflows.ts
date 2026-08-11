/**
 * Backfills the platform default workflows (Sea/Air/Road/Sea-transit — see
 * config/default-workflows.ts) into EVERY existing tenant. New tenants get them
 * automatically at creation (DefaultWorkflowService.seedForTenant, wired into
 * onboarding.service.ts and the superadmin create-tenant route); this script is
 * the one-time (and safely re-runnable) pass for tenants that predate the
 * feature.
 *
 * Idempotent and deletion-respecting: a tenant that already has a template (or
 * deliberately deleted one) is left exactly as-is.
 *
 * Usage: npx tsx src/scripts/seed-default-workflows.ts
 */
import { db } from '../db/client.js';
import { DefaultWorkflowService } from '../services/default-workflow.service.js';

async function main() {
  const tenants = await db.selectFrom('tenants').select(['id', 'name']).execute();
  console.log(`Seeding default workflows into ${tenants.length} tenant(s)…\n`);

  let totalCreated = 0;
  for (const t of tenants) {
    const { created, skipped } = await DefaultWorkflowService.seedForTenant(db, t.id, null);
    totalCreated += created.length;
    const label = created.length
      ? `+${created.length} created${skipped.length ? `, ${skipped.length} already present` : ''}`
      : 'all present — nothing to do';
    console.log(`  ${t.name.padEnd(32)} ${label}${created.length ? `  [${created.join(', ')}]` : ''}`);
  }

  console.log(`\nDone. ${totalCreated} workflow(s) created across ${tenants.length} tenant(s).`);
  await db.destroy();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
