/**
 * What somebody is owed, and how much of it they have left.
 *
 * Balances are derived from approved and pending requests, never typed. A
 * stored "days remaining" that someone can edit is a number that drifts from
 * the requests behind it, and once it has drifted nobody can tell which is
 * right. The only figure a person may set by hand is an explicit adjustment,
 * which the schema requires them to explain.
 *
 * The leave cycle is anchored to the employment anniversary, because that is
 * what the statute says. Resetting everyone on 1 January would hand a September
 * joiner a fresh entitlement after four months and short-change a December one.
 */
import type { Kysely, Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';

type Db = Kysely<Database> | Transaction<Database>;

export interface LeaveCycle { start: string; end: string }

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  return new Date(String(v).slice(0, 10) + 'T00:00:00Z');
}

/**
 * The cycle containing `onDate`, counted in whole cycles from the hire date.
 *
 * Works for any cycle length, which is why sick leave's 36 months needs no
 * special case: the same arithmetic in units of `cycleMonths`.
 */
export function leaveCycleFor(hireDate: unknown, cycleMonths: number, onDate: Date = new Date()): LeaveCycle {
  const hire = toDate(hireDate);
  const on = toDate(onDate);

  const monthsElapsed = (on.getUTCFullYear() - hire.getUTCFullYear()) * 12
    + (on.getUTCMonth() - hire.getUTCMonth())
    // Not yet reached the anniversary day this month, so still in the previous month.
    - (on.getUTCDate() < hire.getUTCDate() ? 1 : 0);

  const cyclesElapsed = Math.max(0, Math.floor(monthsElapsed / cycleMonths));

  const start = new Date(Date.UTC(
    hire.getUTCFullYear(), hire.getUTCMonth() + cyclesElapsed * cycleMonths, hire.getUTCDate(),
  ));
  const end = new Date(Date.UTC(
    hire.getUTCFullYear(), hire.getUTCMonth() + (cyclesElapsed + 1) * cycleMonths, hire.getUTCDate(),
  ));
  // The cycle ends the day before the next one begins; an inclusive end date
  // that equals the next start would double-count one day every cycle.
  end.setUTCDate(end.getUTCDate() - 1);

  return { start: iso(start), end: iso(end) };
}

/** Whole months of service at a date — for entitlements with a waiting period. */
export function monthsOfService(hireDate: unknown, onDate: Date = new Date()): number {
  const hire = toDate(hireDate), on = toDate(onDate);
  return Math.max(0,
    (on.getUTCFullYear() - hire.getUTCFullYear()) * 12
    + (on.getUTCMonth() - hire.getUTCMonth())
    - (on.getUTCDate() < hire.getUTCDate() ? 1 : 0));
}

export interface Balance {
  leave_type_id: string;
  code: string;
  name: string;
  cycle_start: string;
  cycle_end: string;
  entitled: number;
  carried_forward: number;
  taken: number;
  pending: number;
  adjustment: number;
  /** What may still be requested. Never negative — see note below. */
  remaining: number;
  eligible: boolean;
  /** Why not, when not. */
  ineligible_reason?: string;
}

const num = (v: unknown) => Number(v ?? 0);

/**
 * Recompute one person's balances from their requests.
 *
 * `taken` counts approved days and `pending` counts undecided ones. Pending is
 * held against the balance deliberately: without it, two requests submitted
 * before either is decided can both be approved against the same remaining
 * days, and the overdraft is only discovered afterwards.
 */
export async function computeBalances(
  tenantId: string,
  userId: string,
  onDate: Date = new Date(),
): Promise<Balance[]> {
  return withTenant(tenantId, trx => computeBalancesWith(trx, tenantId, userId, onDate));
}

async function computeBalancesWith(
  trx: Db,
  tenantId: string,
  userId: string,
  onDate: Date,
): Promise<Balance[]> {
  const user = await trx.selectFrom('users')
    .select(['id', 'hire_date', 'created_at'])
    .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!user) return [];

  const hire = user.hire_date ?? user.created_at;

  const types = await trx.selectFrom('hr_leave_types').selectAll()
    .where('tenant_id', '=', tenantId).where('active', '=', true)
    .orderBy('name').execute();

  const service = monthsOfService(hire, onDate);
  const out: Balance[] = [];

  for (const t of types) {
    const cycle = leaveCycleFor(hire, t.cycle_months, onDate);

    // Requests are attributed to a cycle by their start date.
    const rows = await trx.selectFrom('hr_leaves')
      .select(['status', 'days'])
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .where('leave_type_id', '=', t.id)
      .where('from_date', '>=', cycle.start as any)
      .where('from_date', '<=', cycle.end as any)
      .execute();

    const taken = rows.filter(r => r.status === 'APPROVED').reduce((s, r) => s + num(r.days), 0);
    const pending = rows.filter(r => r.status === 'PENDING').reduce((s, r) => s + num(r.days), 0);

    const stored = await trx.selectFrom('hr_leave_balances')
      .select(['carried_forward', 'adjustment'])
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId)
      .where('leave_type_id', '=', t.id).where('cycle_start', '=', cycle.start as any)
      .executeTakeFirst();

    const carried = num(stored?.carried_forward);
    const adjustment = num(stored?.adjustment);
    const entitled = num(t.days_entitled);

    const eligible = service >= t.min_service_months;
    const remaining = eligible
      ? Math.max(0, entitled + carried + adjustment - taken - pending)
      : 0;

    out.push({
      leave_type_id: t.id, code: t.code, name: t.name,
      cycle_start: cycle.start, cycle_end: cycle.end,
      entitled, carried_forward: carried, taken, pending, adjustment, remaining,
      eligible,
      ineligible_reason: eligible ? undefined
        : `Requires ${t.min_service_months} months of service; ${service} completed.`,
    });
  }

  return out;
}

/** Write the computed balances back, so they can be listed without recomputing. */
export async function persistBalances(tenantId: string, userId: string, onDate: Date = new Date()): Promise<number> {
  return withTenant(tenantId, async (trx) => {
    const balances = await computeBalancesWith(trx, tenantId, userId, onDate);
    for (const b of balances) {
      const existing = await trx.selectFrom('hr_leave_balances').select('id')
        .where('tenant_id', '=', tenantId).where('user_id', '=', userId)
        .where('leave_type_id', '=', b.leave_type_id)
        .where('cycle_start', '=', b.cycle_start as any).executeTakeFirst();

      const row = {
        entitled: String(b.entitled), taken: String(b.taken), pending: String(b.pending),
        cycle_end: b.cycle_end, recomputed_at: new Date(), updated_at: new Date(),
      };
      if (existing) {
        // carried_forward and adjustment are deliberately not written here: they
        // are inputs a person set, not outputs of this calculation.
        await trx.updateTable('hr_leave_balances').set(row as any).where('id', '=', existing.id).execute();
      } else {
        await trx.insertInto('hr_leave_balances').values({
          tenant_id: tenantId, user_id: userId, leave_type_id: b.leave_type_id,
          cycle_start: b.cycle_start, ...row,
        } as any).execute();
      }
    }
    return balances.length;
  });
}

/**
 * Whether a request can be met, and what to say if it cannot.
 *
 * Returns rather than throws, because the caller needs the numbers to explain
 * the refusal — "you have 6 days left and asked for 9" is useful, "rejected" is
 * not.
 */
export async function checkRequest(
  tenantId: string, userId: string, leaveTypeId: string, days: number, onDate: Date = new Date(),
): Promise<{ ok: boolean; reason?: string; balance?: Balance }> {
  const balances = await computeBalances(tenantId, userId, onDate);
  const b = balances.find(x => x.leave_type_id === leaveTypeId);
  if (!b) return { ok: false, reason: 'That leave type does not exist for this tenant.' };
  if (!b.eligible) return { ok: false, reason: b.ineligible_reason, balance: b };
  if (days > b.remaining) {
    return {
      ok: false,
      reason: `${b.name}: ${b.remaining} day(s) remaining in the cycle ending ${b.cycle_end}, but ${days} requested`
        + (b.pending > 0 ? `. ${b.pending} day(s) are already awaiting a decision.` : '.'),
      balance: b,
    };
  }
  return { ok: true, balance: b };
}

/**
 * How an approved request should be paid.
 *
 * Sick leave is not one rate: the first 63 days of a cycle are full pay and the
 * next 63 are half. Splitting it here means payroll pays what is owed rather
 * than assuming every approved day is worth a full day's wage — which
 * overpays, and is the kind of error nobody reports.
 */
export function splitPayDays(
  daysRequested: number,
  alreadyTaken: number,
  fullPayDays: number | null,
): { full: number; reduced: number } {
  if (fullPayDays === null || fullPayDays === undefined) return { full: daysRequested, reduced: 0 };
  const fullRemaining = Math.max(0, fullPayDays - alreadyTaken);
  const full = Math.min(daysRequested, fullRemaining);
  return { full, reduced: daysRequested - full };
}
