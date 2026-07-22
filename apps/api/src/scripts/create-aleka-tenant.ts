/**
 * Corrects a modeling mistake: Aleka Group's real compliance data (9 CRM
 * customers + 18 certificates + 55 obligations) was seeded into the existing
 * "Moovit Mobility Limited" demo tenant instead of getting its own tenant.
 * Per the platform's actual multi-tenant model (see CLAUDE.md — every query
 * is scoped by tenant_id, and each client/tenant only ever sees its own
 * data), Aleka Group needs to be a real, separate tenant with its own login,
 * not nested inside an unrelated tenant's CRM.
 *
 * This script:
 *   1. Creates the "Aleka Group" tenant + a TENANT_ADMIN login for it
 *      (mirrors OnboardingService.completeOnboarding's provisioning, minus
 *      the payment-charge step — this is a superadmin-provisioned account).
 *   2. Moves the previously-seeded rows from Moovit's tenant to the new one,
 *      identified precisely by the natural keys the original seed script
 *      used (cert_number/obligation_code prefixes, customer names) — so
 *      only the Aleka rows move, nothing belonging to Moovit is touched.
 *
 * Idempotent — safe to re-run (reuses the tenant/user if they already exist,
 * and the row-move is a no-op once rows are already on the new tenant_id).
 *
 * Usage: npx tsx src/scripts/create-aleka-tenant.ts
 */
import { randomBytes } from 'crypto';
import { db } from '../db/client.js';
import { hashPassword } from '../lib/password.js';

const OLD_TENANT_ID = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf'; // Moovit Mobility Limited (wrong home)
const TENANT_NAME = 'Aleka Group';
const ADMIN_EMAIL = 'admin@alekaholdings.co.tz';
const ADMIN_NAME = 'Aleka Group Admin';
// Generated fresh on every run, never hardcoded/committed — printed once at
// the end so it can be handed to the client and changed on first login. If
// the admin account already exists, no new password is generated or shown
// (re-running this script must never silently reset a live account's login).
const ADMIN_PASSWORD = randomBytes(9).toString('base64url');

const ALEKA_CUSTOMER_NAMES = [
  'Aleka Holdings Ltd', 'Nanovas Tanzania Ltd', 'Tech in Motion Ltd', 'Binary Odds (T) Ltd',
  'Dhow Jahazi Enterprises Ltd', 'Aleka Properties Ltd', 'Digicash Tanzania Ltd',
  'Digicash Financial Services Ltd', 'Coastal Steel Ltd',
];

async function slugify(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let candidate = base;
  let n = 2;
  while (await db.selectFrom('tenants').select('id').where('slug', '=', candidate).executeTakeFirst()) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

async function main() {
  console.log('🏢 Creating "Aleka Group" as its own tenant...');

  let tenant = await db.selectFrom('tenants').selectAll().where('name', '=', TENANT_NAME).executeTakeFirst();
  if (!tenant) {
    const slug = await slugify(TENANT_NAME);
    tenant = await db.insertInto('tenants').values({
      name: TENANT_NAME, slug, subdomain: slug, plan: 'enterprise', active: true,
    }).returningAll().executeTakeFirstOrThrow();
    console.log(`  ✓ Tenant created: ${tenant.id} (slug: ${slug})`);
  } else {
    console.log(`  ✓ Tenant already exists: ${tenant.id}`);
  }
  const NEW_TENANT_ID = tenant.id;

  let admin = await db.selectFrom('users').selectAll()
    .where('tenant_id', '=', NEW_TENANT_ID).where('email', '=', ADMIN_EMAIL).executeTakeFirst();
  let adminJustCreated = false;
  if (!admin) {
    admin = await db.insertInto('users').values({
      tenant_id: NEW_TENANT_ID, email: ADMIN_EMAIL, password_hash: hashPassword(ADMIN_PASSWORD),
      role: 'TENANT_ADMIN', name: ADMIN_NAME, active: true,
    }).returningAll().executeTakeFirstOrThrow();
    adminJustCreated = true;
    console.log(`  ✓ Admin user created: ${ADMIN_EMAIL}`);
  } else {
    console.log(`  ✓ Admin user already exists: ${ADMIN_EMAIL}`);
  }

  // ── Move the previously-misseeded data ────────────────────────────────────
  console.log('📦 Moving Aleka Group data out of the Moovit tenant...');

  const customersMoved = await db.updateTable('customers')
    .set({ tenant_id: NEW_TENANT_ID })
    .where('tenant_id', '=', OLD_TENANT_ID)
    .where('name', 'in', ALEKA_CUSTOMER_NAMES)
    .executeTakeFirst();
  console.log(`  ✓ customers moved: ${customersMoved.numUpdatedRows}`);

  const certsMoved = await db.updateTable('comply_certificates')
    .set({ tenant_id: NEW_TENANT_ID })
    .where('tenant_id', '=', OLD_TENANT_ID)
    .where((eb) => eb.or([
      eb('cert_number', 'like', 'ALEKA-%'),
      eb('cert_number', 'like', 'TIM-%'),
      eb('cert_number', 'like', 'DHOW-%'),
      eb('cert_number', 'like', 'DIGITZ-%'),
    ]))
    .executeTakeFirst();
  console.log(`  ✓ certificates moved: ${certsMoved.numUpdatedRows}`);

  const obligationsMoved = await db.updateTable('comply_obligations')
    .set({ tenant_id: NEW_TENANT_ID })
    .where('tenant_id', '=', OLD_TENANT_ID)
    .where('obligation_code', 'like', 'OB-ALEKA-%')
    .executeTakeFirst();
  console.log(`  ✓ obligations moved: ${obligationsMoved.numUpdatedRows}`);

  console.log('✅ Aleka Group is now its own isolated tenant.');
  console.log('');
  console.log('Login for Aleka Group:');
  console.log(`  URL:       http://localhost:5173/login`);
  console.log(`  Email:     ${ADMIN_EMAIL}`);
  console.log(`  Password:  ${adminJustCreated ? ADMIN_PASSWORD : '(unchanged — admin account already existed, not reset)'}`);
  console.log(`  Tenant ID: ${NEW_TENANT_ID}`);
  process.exit(0);
}

main().catch(err => { console.error('❌ Failed:', err); process.exit(1); });
