/**
 * The component arithmetic, checked against both Ghana regimes.
 *
 * 21.9% has to fall out of the compounding rather than being typed in
 * anywhere — that is the whole point of modelling a basis per component.
 *
 * Run: npx tsx src/scripts/check-tax-components.ts
 */
import { applyComponents, effectiveRate, COMPONENT_TEMPLATES } from '../services/tax-component.service.js';

const NET = 1000;
let failures = 0;

function check(label: string, got: number, want: number, tol = 0.005) {
  const ok = Math.abs(got - want) < tol;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${got.toFixed(4)}, want ${want}`);
}

for (const tpl of COMPONENT_TEMPLATES.GH) {
  console.log(`\n${tpl.label}`);
  const r = applyComponents(NET, tpl.components);
  console.table(r.lines.map(l => ({
    component: l.code, rate: `${l.rate}%`, basis: l.basis,
    'charged on': l.base.toFixed(2), amount: l.amount.toFixed(2),
    recoverable: l.recoverable ? 'yes' : 'no',
  })));
  console.log(`  net ${NET} -> tax ${r.total.toFixed(2)}, effective ${r.effectiveRatePct.toFixed(3)}%`);
  console.log(`  reclaimable ${r.recoverable.toFixed(2)}, cost ${r.nonRecoverable.toFixed(2)}`);
}

console.log('\nassertions:');
const now = COMPONENT_TEMPLATES.GH[0].components;
const old = COMPONENT_TEMPLATES.GH[1].components;

check('2026 combined rate is a flat 20%', effectiveRate(now), 20);
check('2026 nothing is a cost — all three are creditable', applyComponents(NET, now).nonRecoverable, 0);
// 6% of levies on net, then 15% VAT on 1060 = 159. 60 + 159 = 219 on 1000.
check('pre-2026 compounds to 21.9%, not 21%', effectiveRate(old), 21.9);
check('pre-2026 levies are a cost, not a receivable', applyComponents(NET, old).nonRecoverable, 60);
check('pre-2026 only the VAT is reclaimable', applyComponents(NET, old).recoverable, 159);
check('a code with no components is just its own rate', effectiveRate([]), 0);
check('a single 18% component behaves exactly as today',
  effectiveRate([{ code: 'VAT', name: 'VAT', rate: 18, basis: 'NET', recoverable: true }]), 18);

console.log(failures === 0 ? '\nall assertions passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
