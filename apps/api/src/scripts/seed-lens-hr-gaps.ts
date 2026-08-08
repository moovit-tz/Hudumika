/**
 * The feature gap between NexusHR and a shipping Tanzanian HR product.
 *
 * Filed from a walkthrough of a competitor's demo tenant (Space HR) on
 * 2026-08-08. Every item below was seen working there and is absent or a stub
 * here — this is not a wishlist, it is a list of things a customer can already
 * buy elsewhere.
 *
 * Ranked: statutory payroll first, because it is the one gap that makes the
 * product unsellable rather than merely thinner. An HR system in Tanzania that
 * cannot produce a compliant payslip is not an HR system.
 *
 *   PROBE=1 npx tsx src/scripts/seed-lens-hr-gaps.ts
 *   PROBE=1 npx tsx src/scripts/seed-lens-hr-gaps.ts --clear
 */
import { db } from '../db/client.js';

type Item = {
  ref: string; kind: string; title: string; severity: string;
  confidence: string; body: string; evidence: string; tags: string[];
};

const EV = 'Observed in the Space HR demo tenant, 2026-08-08.';

const ITEMS: Item[] = [
  {
    ref: 'LENS-17', kind: 'EPIC', severity: 'CRITICAL', confidence: 'CONFIRMED',
    title: 'Statutory payroll for Tanzania — hr_payroll is a stub',
    body: `hr_payroll has four numeric columns: basic_pay, allowances, deductions, status.
"allowances" and "deductions" are each a single number, so nothing records WHAT was
paid or withheld. There is no PAYE, no social security, no NHIF, no WCF, no SDL, no
payslip and no run lifecycle. A tenant cannot pay anyone from this.

The competitor's engine was decoded from two payslips and every figure reconciles
exactly (see LENS-18 for the verified formula). Rebuilding it is a bounded problem,
not research.`,
    evidence: `${EV} hr_payroll has 1 row and 4 numeric columns; the demo produced a
complete August run with per-employee payslips, employer contribution totals and an
approval state.`,
    tags: ['payroll', 'tanzania', 'statutory'],
  },
  {
    ref: 'LENS-18', kind: 'DECISION', severity: 'HIGH', confidence: 'CONFIRMED',
    title: 'PAYE is computed on gross less employee social security, not on gross',
    body: `Verified arithmetically against two independent employees, all figures exact:

  taxable   = gross - employee social security contribution
  PAYE      = fixed_amount(band) + rate(band) x (taxable - band_lower)

Employee A: basic 1,000,000 + allowances 450,000 = gross 1,450,000
            SS 10% of BASIC = 100,000 -> taxable 1,350,000
            PAYE = 128,000 + 30% x 350,000 = 233,000   (portal: 233,000)

Employee B: basic 700,000 + allowances 140,000 = gross 840,000
            SS 10% of BASIC = 70,000 -> taxable 770,000
            PAYE = 68,000 + 25% x 10,000 = 70,500      (portal: 70,500)

Two things that are easy to get backwards and cost real money if wrong:
  - social security is a % of BASIC, but NHIF and the employer levies are % of GROSS
  - NHIF is NOT deducted before PAYE. Only the approved retirement fund is.

Resident bands (monthly TZS): 0-270,000 nil; to 520,000 at 8%; to 760,000 at
20,000+20%; to 1,000,000 at 68,000+25%; above at 128,000+30%. Non-resident is a
flat 15% with no free band. Unchanged for 2025/26.`,
    evidence: `${EV} Confirmed against TRA guidance and PwC Tanzania rate summaries.
Both payslips reproduce to the shilling.`,
    tags: ['payroll', 'paye', 'tanzania'],
  },
  {
    ref: 'LENS-19', kind: 'BUG', severity: 'NORMAL', confidence: 'CONFIRMED',
    title: 'Do not copy the competitor\'s "employer contributions" total — it counts PAYE',
    body: `Their run shows Employer Contributions 553,650, made up of PAYE 303,500 +
NHIF employer 68,700 + social security employer 170,000 + WCF 11,450 + SDL 0.

PAYE is an employee deduction that the employer REMITS. It is not employer cost.
The employer's real cost there is 250,150; the headline overstates it by 303,500 —
more than double. A tenant budgeting from that number would be badly wrong.

Ours must separate three things that their screen conflates:
  employer cost      = NHIF er + social security er + WCF + SDL
  remitted on behalf = PAYE + employee contributions
  total cash out     = net pay + both of the above`,
    evidence: `${EV} 303,500 + 68,700 + 170,000 + 11,450 + 0 = 553,650, their stated total.`,
    tags: ['payroll', 'correctness'],
  },
  {
    ref: 'LENS-20', kind: 'FEATURE', severity: 'HIGH', confidence: 'CONFIRMED',
    title: 'Employer levies: WCF and SDL, with SDL\'s headcount threshold',
    body: `WCF 0.5% of gross, private sector, employer only.
SDL 3.5% of gross, employer only, and ONLY where the employer has 10 or more
employees on the mainland. Schools, vocational and higher-learning institutions and
religious health institutions are exempt.

The threshold is a rule, not a setting to be typed in — a tenant that crosses 10
employees mid-year starts owing SDL and must not have to notice that themselves.
Note the demo's own help text says "4 or more", which is the pre-2022 threshold;
do not copy it.`,
    evidence: `${EV} Their run shows SDL 0 at 2 employees and WCF 11,450 = 0.5% of
2,290,000. Threshold of 10 confirmed against PwC/TRA summaries.`,
    tags: ['payroll', 'wcf', 'sdl', 'tanzania'],
  },
  {
    ref: 'LENS-21', kind: 'FEATURE', severity: 'HIGH', confidence: 'CONFIRMED',
    title: 'Leave entitlement ledger — balances, carry-forward, ELRA defaults',
    body: `hr_leaves records requests and nothing else. There is no entitlement, so
nobody can be told how much leave they have left, and an approver is deciding blind.

Needed: leave types (days/year, paid, carry-forward rules, who they apply to) and a
per-employee balance of entitled / used / pending / carried forward / remaining.

Tanzania's Employment and Labour Relations Act sets the floor — 28 days annual
leave, sick and maternity entitlements — so the defaults should be generated from
statute rather than typed by each tenant.`,
    evidence: `${EV} Their Leave Balances page shows exactly those six columns with a
"Sync Balances" action, and Leave Types has a "Generate ELRA Defaults" button.`,
    tags: ['leave', 'tanzania', 'elra'],
  },
  {
    ref: 'LENS-22', kind: 'FEATURE', severity: 'NORMAL', confidence: 'CONFIRMED',
    title: 'Employee statutory identity and payment details',
    body: `A person record has no NIDA number, TIN, social security number, health
insurance number or tax-residency flag — all of which are required to file, and
tax residency changes the PAYE calculation outright (flat 15%, no free band).

Payment details are also missing: bank vs mobile money, provider, account. Mobile
money is how a large share of Tanzanian staff are actually paid; a bank-only
model would not survive first contact.`,
    evidence: `${EV} Their employee record carries "Tanzania Identification"
(NIDA / TIN / NSSF-PSSSF / NHIF / fund choice / tax resident) and "Banking & Payment"
(method, currency, bank, branch, account, mobile provider, mobile number).`,
    tags: ['payroll', 'tanzania', 'identity'],
  },
  {
    ref: 'LENS-23', kind: 'FEATURE', severity: 'NORMAL', confidence: 'CONFIRMED',
    title: 'Attendance is recorded but never converted into hours or pay',
    body: `We store a status and clock times. We do not derive worked hours or overtime
hours, do not record HOW someone clocked (web, mobile, biometric), have no
self-service clock in/out, and no shift grace period — so a "late" mark is a
judgement rather than a computation.

Overtime also needs to be a requestable, approvable object, because it costs money
and someone must authorise it before it reaches a payslip. That is the link that
makes attendance matter: hours flow into payroll, or the module is decoration.`,
    evidence: `${EV} Their attendance table has Worked Hrs, OT Hrs and Method columns;
shifts carry a grace period; overtime requests are a separate approvable list.`,
    tags: ['attendance', 'payroll', 'overtime'],
  },
  {
    ref: 'LENS-24', kind: 'FEATURE', severity: 'NORMAL', confidence: 'CONFIRMED',
    title: 'Performance tables exist and are entirely unused',
    body: `hr_review_cycles, hr_review_templates, hr_review_instances, hr_goals and
hr_goal_checkins are all present and all hold zero rows. The schema was built and
never connected to anything.

This is the cheapest gap on the list: the modelling is done. It needs a cycle, a
template with weighted criteria, an evaluation that produces a final score, and
goals with weight and progress.`,
    evidence: `${EV} All five tables at 0 rows. Their equivalent has cycles,
templates with sections/criteria, evaluations with a final score, and weighted KROs.`,
    tags: ['performance', 'unused-schema'],
  },
  {
    ref: 'LENS-25', kind: 'FEATURE', severity: 'LOW', confidence: 'CONFIRMED',
    title: 'Recruitment: positions, applications, public careers page',
    body: `No recruitment tables of any kind. The notable piece is the public careers
page — a tenant-branded job board on their own domain, which is the only part of an
HR product that faces the outside world and the only part that markets itself.`,
    evidence: `${EV} Positions with openings/visibility, an application pipeline, and a
public /careers page rendering open roles.`,
    tags: ['recruitment'],
  },
  {
    ref: 'LENS-26', kind: 'FEATURE', severity: 'NORMAL', confidence: 'CONFIRMED',
    title: 'Cross-cutting table conventions: per-record activity, import, column chooser',
    body: `Every list in their product carries the same three affordances: an Activity
trail on each row, an Import path, and a Columns chooser. Ours has none of them
consistently.

The per-record activity trail is the valuable one — payroll and leave are exactly
where "who changed this and when" gets asked, and hr_activity_log already exists
with 7 rows. Worth doing once as a shared component rather than per page.

Also missing as org concepts: Branches as a first-class unit (hr_locations exists,
empty), contract records with an expiry warning, and emergency contacts.`,
    evidence: `${EV} Activity / Import / Columns present on all 20+ list pages;
"Expiring Contracts — within the next 30 days" panel on their dashboard.`,
    tags: ['platform', 'audit'],
  },
];

async function main() {
  if (process.env.PROBE !== '1') {
    console.log('This writes Lens items. Re-run with PROBE=1.');
    return;
  }
  const refs = ITEMS.map(i => i.ref);

  if (process.argv.includes('--clear')) {
    const gone = await db.deleteFrom('lens_items').where('ref', 'in', refs).returning('ref').execute();
    console.log(`Removed ${gone.length} item(s).`);
    await db.destroy();
    return;
  }

  for (const it of ITEMS) {
    const existing = await db.selectFrom('lens_items').select('id').where('ref', '=', it.ref).executeTakeFirst();
    const row = {
      ref: it.ref, kind: it.kind, title: it.title, body: it.body,
      area_id: 'nexushr', status: 'OPEN', severity: it.severity,
      confidence: it.confidence, evidence: it.evidence,
      refs: JSON.stringify([]), tags: JSON.stringify(it.tags),
      updated_at: new Date(),
    };
    if (existing) {
      await db.updateTable('lens_items').set(row as any).where('id', '=', existing.id).execute();
      console.log(`  updated ${it.ref}  ${it.title.slice(0, 62)}`);
    } else {
      await db.insertInto('lens_items').values({ ...row, created_at: new Date() } as any).execute();
      console.log(`  filed   ${it.ref}  ${it.title.slice(0, 62)}`);
    }
  }
  console.log(`\n${ITEMS.length} items in area "nexushr".`);
  console.log(`  Undo with: PROBE=1 npx tsx src/scripts/seed-lens-hr-gaps.ts --clear\n`);
  await db.destroy();
}

main().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
