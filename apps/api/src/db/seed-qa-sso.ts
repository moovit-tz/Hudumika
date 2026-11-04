// Verifies the Hudumika demo identities used for cross-app Ondi SSO testing.
//
// Per the user's direction, this does NOT create fixture users — it reuses
// the existing Login.tsx demo-account buttons (DEMO_ACCOUNTS) as the Ondi
// identities, since those are what a real tester actually clicks. Ondi's
// `sub` claim IS this users.id (see ondi-oauth.routes.ts's claimsForUser),
// so this script's only job is to resolve and print the real ids Tuma's,
// LexCore's, Gereji's and Stride's own seed-qa-sso scripts link against —
// hardcoded there as constants, because every app's own script needs them
// independent of whether this one has run first.
//
// Credentials stay in Hudumika only (every other app is Ondi-only) — this
// script never touches a password.
//
// Usage:
//   tsx src/db/seed-qa-sso.ts            verify (safe to re-run; read-only)
//   tsx src/db/seed-qa-sso.ts --clean    no-op — nothing here to clean up
import { dbPlatform } from './client.js';
import { env } from '../config/env.js';

// Must match Login.tsx's DEMO_ACCOUNTS exactly.
const SUPER_ADMIN_EMAIL = 'viden@hudumika.tz';   // linked across ALL standalone apps
const MANAGER_EMAIL = 'manager@msomi.co';        // linked in Tuma/LexCore/Stride; deliberately NOT linked in Gereji

function assertLocalDestination() {
  if (env.APP_ENV === 'production') {
    console.error('Refusing to run: APP_ENV=production.');
    process.exit(1);
  }
  let host: string;
  try {
    host = new URL(env.DATABASE_URL_PLATFORM).hostname;
  } catch {
    console.error('Refusing to run: could not parse DATABASE_URL_PLATFORM to verify the destination host.');
    process.exit(1);
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`Refusing to run: database host "${host}" is not a recognized local destination.`);
    process.exit(1);
  }
}

async function main() {
  assertLocalDestination();

  if (process.argv.includes('--clean')) {
    console.log('Nothing to clean on the Hudumika side — the demo accounts are seed.ts fixtures, not owned by this script.');
    return;
  }

  const rows = await dbPlatform
    .selectFrom('users')
    .select(['id', 'email', 'role', 'tenant_id', 'active'])
    .where('email', 'in', [SUPER_ADMIN_EMAIL, MANAGER_EMAIL])
    .execute();

  const byEmail = new Map(rows.map((r) => [r.email, r]));
  const superAdmin = byEmail.get(SUPER_ADMIN_EMAIL);
  const manager = byEmail.get(MANAGER_EMAIL);

  if (!superAdmin || !manager) {
    console.error('Refusing to proceed: one or both demo accounts are missing from the database.');
    if (!superAdmin) console.error(`  missing: ${SUPER_ADMIN_EMAIL} — run \`npm run db:seed -w apps/api\` first.`);
    if (!manager) console.error(`  missing: ${MANAGER_EMAIL} — run \`npm run db:seed -w apps/api\` first.`);
    process.exit(1);
  }
  if (!superAdmin.active || !manager.active) {
    console.error('Refusing to proceed: a demo account exists but is inactive.');
    process.exit(1);
  }

  console.log('Verified demo identities (these ids ARE the Ondi `sub` each one signs in with):');
  console.log(`  Super Admin — ${SUPER_ADMIN_EMAIL} — id ${superAdmin.id} — role ${superAdmin.role}`);
  console.log(`  Manager     — ${MANAGER_EMAIL} — id ${manager.id} — role ${manager.role}`);
  console.log('\nThese must match the SUPER_ADMIN_SUB / MANAGER_SUB constants hardcoded in each standalone app\'s seed-qa-sso script.');
}

main().catch((e) => { console.error(e); process.exit(1); });
