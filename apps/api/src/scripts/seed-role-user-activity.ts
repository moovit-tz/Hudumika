/**
 * Working history for the test accounts, so the profile tabs have something
 * true to show.
 *
 * Wiring a tab to an endpoint that returns nothing proves only that the request
 * was made. These give each test user a plausible eight weeks of attendance and
 * a few leave requests in different states, so Attendance and Leaves can be
 * read, filtered and approved as a real person's record would be.
 *
 * Shaped rather than random: the junior has a couple of late marks and a
 * pending leave request awaiting a decision, the manager has approved leave,
 * one person is on leave right now. That is what makes the screens worth
 * looking at — uniformly present staff would tell you nothing.
 *
 *   PROBE=1 npx tsx src/scripts/seed-role-user-activity.ts
 *   PROBE=1 npx tsx src/scripts/seed-role-user-activity.ts --clear
 */
import { db } from '../db/client.js';

// Follows seed-role-users: these accounts are real staff on the tenant's
// own domain now, not throwaways.
const DOMAIN = 'moovit.co.tz';
const WEEKS = 8;

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

async function main() {
  if (process.env.PROBE !== '1') {
    console.log('This writes attendance and leave rows. Re-run with PROBE=1.');
    return;
  }

  const users = await db.selectFrom('users')
    .select(['id', 'name', 'email', 'role', 'tenant_id'])
    .where('email', 'like', `%@${DOMAIN}`).orderBy('role').execute();

  if (users.length === 0) {
    console.error(`No @${DOMAIN} accounts. Run seed-role-users.ts first.`);
    await db.destroy();
    return;
  }
  const tenantId = users[0].tenant_id;
  const ids = users.map(u => u.id);

  if (process.argv.includes('--clear')) {
    const a = await db.deleteFrom('hr_attendance').where('user_id', 'in', ids).returning('id').execute();
    const l = await db.deleteFrom('hr_leaves').where('user_id', 'in', ids).returning('id').execute();
    console.log(`Removed ${a.length} attendance row(s) and ${l.length} leave request(s).`);
    await db.destroy();
    return;
  }

  const approver = users.find(u => u.role === 'MANAGER') ?? users[0];
  const today = new Date();
  const attendance: any[] = [];

  for (const u of users) {
    // Enough variation that the screens are worth reading, decided per person
    // rather than at random so a re-run tells the same story.
    const seed = u.email.charCodeAt(0);
    const lateDays = u.role === 'JUNIOR' ? [3, 11, 24] : u.role === 'SALES' ? [7] : [];
    const absentDays = u.role === 'JUNIOR' ? [17] : [];

    for (let back = WEEKS * 7; back >= 1; back--) {
      const d = addDays(today, -back);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;   // no weekend rows

      let status = 'PRESENT';
      let clockIn = '08:0' + (seed % 6);
      let clockOut = '17:1' + (seed % 5);
      let notes: string | null = null;

      if (absentDays.includes(back)) { status = 'ABSENT'; clockIn = null as any; clockOut = null as any; notes = 'No show, not called in'; }
      else if (lateDays.includes(back)) { status = 'LATE'; clockIn = '09:4' + (seed % 5); notes = 'Traffic on Nyerere Road'; }

      attendance.push({
        tenant_id: tenantId, user_id: u.id, date: iso(d), status,
        clock_in: clockIn, clock_out: clockOut, notes, recorded_by: approver.id,
      });
    }
  }

  // Inserted in batches — a single statement with ~2,000 rows is needlessly
  // large and harder to read in a log if it fails.
  for (let i = 0; i < attendance.length; i += 200) {
    await db.insertInto('hr_attendance').values(attendance.slice(i, i + 200)).execute();
  }

  const leaves: any[] = [];
  const byRole = (r: string) => users.find(u => u.role === r);

  const junior = byRole('JUNIOR');
  if (junior) {
    // Pending, so there is something to actually decide on.
    leaves.push({
      tenant_id: tenantId, user_id: junior.id, type: 'ANNUAL',
      from_date: iso(addDays(today, 12)), to_date: iso(addDays(today, 16)), days: 5,
      reason: 'Family wedding in Mwanza', status: 'PENDING',
    });
    leaves.push({
      tenant_id: tenantId, user_id: junior.id, type: 'SICK',
      from_date: iso(addDays(today, -17)), to_date: iso(addDays(today, -17)), days: 1,
      reason: 'Fever', status: 'APPROVED', approved_by: approver.id, approved_at: addDays(today, -18),
    });
  }
  const sales = byRole('SALES');
  if (sales) {
    // Covers today, so the staff list shows someone genuinely ON_LEAVE.
    leaves.push({
      tenant_id: tenantId, user_id: sales.id, type: 'ANNUAL',
      from_date: iso(addDays(today, -2)), to_date: iso(addDays(today, 3)), days: 6,
      reason: 'Annual leave', status: 'APPROVED', approved_by: approver.id, approved_at: addDays(today, -9),
    });
  }
  const finance = byRole('FINANCE');
  if (finance) {
    leaves.push({
      tenant_id: tenantId, user_id: finance.id, type: 'ANNUAL',
      from_date: iso(addDays(today, -40)), to_date: iso(addDays(today, -36)), days: 5,
      reason: 'Rejected — clashes with month-end close', status: 'REJECTED',
      approved_by: approver.id, approved_at: addDays(today, -45),
    });
  }
  if (leaves.length > 0) await db.insertInto('hr_leaves').values(leaves).execute();

  console.log(`\nSeeded for ${users.length} accounts:`);
  console.log(`  ${attendance.length} attendance rows across ${WEEKS} weeks (weekdays only)`);
  console.log(`  ${leaves.length} leave requests — pending, approved, rejected, and one covering today`);
  for (const u of users) {
    const n = attendance.filter(a => a.user_id === u.id).length;
    const late = attendance.filter(a => a.user_id === u.id && a.status === 'LATE').length;
    const abs = attendance.filter(a => a.user_id === u.id && a.status === 'ABSENT').length;
    console.log(`  ${String(u.role).padEnd(8)} ${n} days` + (late ? `, ${late} late` : '') + (abs ? `, ${abs} absent` : ''));
  }
  console.log(`\n  Undo with: PROBE=1 npx tsx src/scripts/seed-role-user-activity.ts --clear\n`);
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
