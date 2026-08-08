/**
 * Fill in the hours for attendance that was recorded before anything computed them.
 *
 * 240 rows carry clock times and no totals, so the module cannot answer "how
 * many hours did this person work in July" — the only question it exists for.
 * This derives them, and reports where the recorded status disagrees with what
 * the clock times actually say.
 *
 *   PROBE=1 npx tsx src/scripts/recompute-attendance.ts
 */
import { db } from '../db/client.js';
import { computeAttendance } from '../services/attendance.service.js';

const DEFAULT_SHIFT = {
  name: 'Standard day', start_time: '08:00', end_time: '17:00',
  break_minutes: 60, grace_minutes: 10,
};

function isoDate(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v ?? '').slice(0, 10);
}
const hhmm = (v: unknown) => (v == null ? null : String(v).slice(0, 5));

async function main() {
  if (process.env.PROBE !== '1') { console.log('Writes attendance totals. Re-run with PROBE=1.'); return; }

  const tenants = await db.selectFrom('tenants').select(['id', 'name']).execute();
  let totalRows = 0, totalDisagreements = 0;

  for (const t of tenants) {
    const rows = await db.selectFrom('hr_attendance').selectAll()
      .where('tenant_id', '=', t.id).execute();
    if (rows.length === 0) continue;

    // A shift to measure against. Without one there is no scheduled length, so
    // nothing can be called overtime and nothing can be called late.
    let shift = await db.selectFrom('hr_shifts').selectAll()
      .where('tenant_id', '=', t.id).where('is_default', '=', true).executeTakeFirst();
    if (!shift) {
      shift = await db.insertInto('hr_shifts').values({
        tenant_id: t.id, ...DEFAULT_SHIFT, is_default: true, active: true,
      } as any).returningAll().executeTakeFirstOrThrow();
      console.log(`  ${t.name}: created a default shift (${DEFAULT_SHIFT.start_time}–${DEFAULT_SHIFT.end_time}, ${DEFAULT_SHIFT.break_minutes}m break, ${DEFAULT_SHIFT.grace_minutes}m grace)`);
    }

    const shiftDef = {
      startTime: hhmm(shift.start_time)!, endTime: hhmm(shift.end_time)!,
      breakMinutes: Number(shift.break_minutes ?? 0), graceMinutes: Number(shift.grace_minutes ?? 0),
    };

    const disagreements: string[] = [];
    for (const r of rows) {
      const c = computeAttendance(hhmm(r.clock_in), hhmm(r.clock_out), shiftDef);
      await db.updateTable('hr_attendance').set({
        worked_minutes: c.workedMinutes, overtime_minutes: c.overtimeMinutes,
        shift_id: shift.id, updated_at: new Date(),
      } as any).where('id', '=', r.id).execute();

      // Reported rather than corrected. The recorded status may be a decision
      // somebody made for a reason the clock times do not show — an agreed late
      // start, for instance — and overwriting it would erase that silently.
      if (c.status !== 'INCOMPLETE' && c.status !== r.status) {
        disagreements.push(`${isoDate(r.date)} recorded ${r.status}, clock times say ${c.status}`);
      }
    }

    const sums = await db.selectFrom('hr_attendance')
      .select([
        db.fn.sum('worked_minutes').as('worked'),
        db.fn.sum('overtime_minutes').as('ot'),
      ])
      .where('tenant_id', '=', t.id).executeTakeFirst();

    const h = (m: unknown) => Math.round(Number(m ?? 0) / 6) / 10;
    console.log(`  ${t.name}: ${rows.length} rows — ${h(sums?.worked)}h worked, ${h(sums?.ot)}h overtime`);
    if (disagreements.length) {
      console.log(`    ${disagreements.length} row(s) where the recorded status disagrees with the clock times:`);
      for (const d of disagreements.slice(0, 5)) console.log(`      ${d}`);
      if (disagreements.length > 5) console.log(`      … and ${disagreements.length - 5} more`);
    }
    totalRows += rows.length;
    totalDisagreements += disagreements.length;
  }

  console.log(`\n${totalRows} attendance row(s) now carry hours.`);
  if (totalDisagreements > 0) {
    console.log(`${totalDisagreements} disagree with their recorded status — reported, not overwritten.`);
  }
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
