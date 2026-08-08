/**
 * One real user per access level, in the SuperAdmin's own tenant.
 *
 * Role-differentiated behaviour cannot be tested with a single SUPER_ADMIN
 * account: that account passes every check, so every screen looks permitted and
 * nothing proves the guards work. These are real users with real password
 * hashes that can actually sign in, so the difference between what a MANAGER
 * and a JUNIOR may do can be seen rather than assumed.
 *
 *   PROBE=1 npx tsx src/scripts/seed-role-users.ts            # create
 *   PROBE=1 npx tsx src/scripts/seed-role-users.ts --clear    # remove
 *
 * Every account is marked in its own name and email so it can never be mistaken
 * for a customer's staff. Remove them before the tenant is used for real.
 */
import { db } from '../db/client.js';
import { hashPassword } from '../lib/password.js';

/** Shared password. Test accounts, in a dev database, that say so in their name. */
const PASSWORD = 'HudumikaTest#2026';
const MARK = '[test]';

const PEOPLE: { role: string; name: string; local: string; designation: string }[] = [
  { role: 'ADMIN',   name: 'Asha Mwinyi',    local: 'admin',   designation: 'Director' },
  { role: 'MANAGER', name: 'Baraka Ndlovu',  local: 'manager', designation: 'Operations Manager' },
  { role: 'FINANCE', name: 'Neema Kimaro',   local: 'finance', designation: 'Finance Officer' },
  { role: 'SALES',   name: 'Juma Salehe',    local: 'sales',   designation: 'Sales Officer' },
  { role: 'SENIOR',  name: 'Fatuma Hassan',  local: 'senior',  designation: 'Senior Clearing Officer' },
  { role: 'JUNIOR',  name: 'Emmanuel Moshi', local: 'junior',  designation: 'Junior Clearing Officer' },
];

const DOMAIN = 'hudumika.test';

async function main() {
  if (process.env.PROBE !== '1') {
    console.log('This creates real user accounts. Re-run with PROBE=1 if you mean it.');
    return;
  }

  const su = await db.selectFrom('users').select(['tenant_id', 'email'])
    .where('role', '=', 'SUPER_ADMIN').where('email', '=', 'superadmin@hudumika.tz')
    .executeTakeFirst();
  if (!su) {
    console.error('Could not find superadmin@hudumika.tz — nothing to attach these to.');
    await db.destroy();
    return;
  }

  if (process.argv.includes('--clear')) {
    const gone = await db.deleteFrom('users')
      .where('tenant_id', '=', su.tenant_id)
      .where('email', 'like', `%@${DOMAIN}`)
      .returning(['email']).execute();
    console.log(`Removed ${gone.length} test account(s).`);
    await db.destroy();
    return;
  }

  const hash = hashPassword(PASSWORD);
  console.log(`\nTenant: ${su.tenant_id}\n`);

  for (const p of PEOPLE) {
    const email = `${p.local}@${DOMAIN}`;
    const existing = await db.selectFrom('users').select('id')
      .where('tenant_id', '=', su.tenant_id).where('email', '=', email).executeTakeFirst();

    if (existing) {
      // Reset the password so a forgotten one never blocks testing, but leave
      // everything else as it is — someone may have set data on this account.
      await db.updateTable('users').set({ password_hash: hash, updated_at: new Date() })
        .where('id', '=', existing.id).execute();
      console.log(`  reset   ${p.role.padEnd(8)} ${email}`);
      continue;
    }

    await db.insertInto('users').values({
      tenant_id: su.tenant_id,
      email,
      password_hash: hash,
      role: p.role,
      // The name carries the marker, so these are obvious in any list, export
      // or notification — not only in the database.
      name: `${p.name} ${MARK}`,
      active: true,
    } as any).execute();
    console.log(`  created ${p.role.padEnd(8)} ${email}   ${p.name} — ${p.designation}`);
  }

  const all = await db.selectFrom('users').select(['email', 'role', 'name'])
    .where('tenant_id', '=', su.tenant_id).orderBy('role').execute();

  console.log(`\nAccess levels now present in this tenant:\n`);
  for (const u of all) console.log(`  ${String(u.role).padEnd(12)} ${u.email}`);
  console.log(`\n  Password for every ${DOMAIN} account: ${PASSWORD}`);
  console.log(`  Remove them with: PROBE=1 npx tsx src/scripts/seed-role-users.ts --clear\n`);

  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
