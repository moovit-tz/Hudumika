// Printable export for the LCL / Air Freight / Transit calculators — built
// from the same branded template LandedCostPage.tsx's FCL calculator uses
// (see brandedReport.ts), so every printable estimate in ClearOS reads as
// one family rather than the FCL tool looking polished and the other three
// looking like a plain black-and-white sheet.
import { getCompany } from '../data/companyStore.js';
import {
  buildReportHead, buildClientBar, buildReportCard, buildReportSummary, buildReportFoot,
  buildReportDocument, type ReportTableColumn,
} from './brandedReport.js';
import { groupBreakdown, fmt, type AdvancedCalcResult } from './advancedCalculators.js';

const TITLE_BY_MODE: Record<AdvancedCalcResult['mode'], string> = {
  sea_lcl_advanced: 'LCL Freight',
  air_advanced: 'Air Freight',
  transit: 'Transit Cargo',
};
const REF_PREFIX_BY_MODE: Record<AdvancedCalcResult['mode'], string> = {
  sea_lcl_advanced: 'LCL', air_advanced: 'AIR', transit: 'TRANSIT',
};
const MODE_LABEL: Record<AdvancedCalcResult['mode'], string> = {
  sea_lcl_advanced: 'Sea · LCL', air_advanced: 'Air', transit: 'Road · Transit',
};

export interface AdvancedCalcReportMeta {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shipmentRef?: string;
  /** Route destination — only Transit's calculator currently has one handy
   *  (its border-post routes). Falls back to the same Dar es Salaam default
   *  FCL's own printReport() uses, which is correct for LCL/Air (both clear
   *  through Dar). */
  destination?: string;
}

const isTotalRow = (label: string) => /subtotal|total/i.test(label);

export function buildAdvancedCalcReportHtml(result: AdvancedCalcResult, meta: AdvancedCalcReportMeta = {}): string {
  const co = getCompany();
  const now = new Date();
  const genDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const genTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const groups = groupBreakdown(result.breakdown);
  const cur = result.currency;
  const showFcy = cur !== 'TZS';
  const destinationLabel = (meta.destination || '').trim() || 'Dar es Salaam, Tanzania';
  const destinationShort = destinationLabel.split(',')[0].trim() || destinationLabel;

  // One card per breakdown section, in the backend's own emitted order,
  // except "Grand Total" — its rows are redundant with the top-level
  // result.* totals already used for the summary panel below.
  const cardsHtml = groups
    .filter(g => g.section !== 'Grand Total')
    .map(g => {
      const totalLine = [...g.lines].reverse().find(l => isTotalRow(l.label));
      const bodyLines = g.lines.filter(l => l !== totalLine);
      const hasRate = bodyLines.some(l => l.rate);
      const columns: ReportTableColumn[] = [
        { label: 'Description' },
        ...(hasRate ? [{ label: 'Rate', align: 'right' as const }] : []),
        ...(showFcy ? [{ label: cur, align: 'right' as const }] : []),
        { label: 'TZS', align: 'right' as const },
      ];
      const rows = bodyLines.map(l => [
        l.label,
        ...(hasRate ? [l.rate || '&mdash;'] : []),
        ...(showFcy ? [`${cur} ${fmt(l.amount_fcy)}`] : []),
        `TZS ${fmt(l.amount_tzs)}`,
      ]);
      return buildReportCard({
        heading: g.section.toUpperCase(),
        columns,
        rows,
        totalLabel: totalLine?.label,
        totalValueTzs: totalLine?.amount_tzs,
        emptyText: rows.length === 0 && !totalLine ? 'Nothing on this section.' : undefined,
      });
    }).join('');

  // Itemised "what this comes to" list for the summary panel — CIF, Duties &
  // Taxes, then each charge section's own subtotal, straight off the same
  // rows used to build the cards above so the two never drift apart.
  const chargeSectionRows = groups
    .filter(g => g.section !== 'CIF Calculation' && g.section !== 'Tax Summary' && g.section !== 'Grand Total')
    .map(g => {
      const totalLine = [...g.lines].reverse().find(l => isTotalRow(l.label));
      return totalLine ? { label: g.section, valueTzs: totalLine.amount_tzs } : null;
    })
    .filter((r): r is { label: string; valueTzs: number } => r !== null);

  const vatRecoverableTzs = result.grand_total_tzs - result.grand_total_net_vat_tzs;

  const summaryHtml = buildReportSummary({
    number: 1,
    title: `${TITLE_BY_MODE[result.mode]} Summary`,
    rows: [
      { label: `CIF ${destinationShort}`, valueTzs: result.cif_tzs, emphasis: true },
      { label: 'Duties &amp; Taxes', valueTzs: result.statutory_total_tzs },
      ...chargeSectionRows,
      ...(vatRecoverableTzs !== 0 ? [{ label: 'Less: Recoverable VAT', valueTzs: -vatRecoverableTzs }] : []),
    ],
    headlineLabel: 'Grand Total (net of recoverable VAT)',
    headlineTzs: result.grand_total_net_vat_tzs,
    headlineFcy: { currency: cur, value: result.grand_total_net_vat },
    fxLine: `@ ${cur} &rarr; TZS ${result.fx_rate.toLocaleString('en-US')}`,
    unitBlock: result.per_unit ? {
      label: `Cost per ${result.per_unit.unit_label} (net VAT)`,
      valueTzs: (result.grand_total_net_vat_tzs / result.per_unit.qty),
      note: `${cur} ${result.per_unit.cost_net_vat.toFixed(4)} &middot; ${result.per_unit.qty} ${result.per_unit.unit_label}(s)`,
    } : undefined,
  });

  const customerLine = [meta.customerName, meta.customerEmail, meta.customerPhone].map(s => (s || '').trim()).filter(Boolean).join(' · ');
  const allNotes = [...result.warnings, ...result.assumptions];

  const body = `
  ${buildReportHead({
    kicker: 'Estimate',
    title: TITLE_BY_MODE[result.mode],
    refLabel: `${REF_PREFIX_BY_MODE[result.mode]}-${result.hs_code}-${genDate.replace(/\s/g, '')}`,
    generatedLabel: `${genDate}, ${genTime}`,
    company: { name: co.name, businessType: co.businessType, address: co.address, city: co.city, country: co.country, email: co.email },
  })}
  ${customerLine ? buildClientBar('Prepared for', customerLine) : ''}

  <section class="parties">
    <div class="p"><div class="lab">Cargo</div><div class="big">${result.description}</div>
      <div class="kv"><span class="k">HS Code</span><span class="v">${result.hs_code}</span></div>
      ${result.per_unit ? `<div class="kv"><span class="k">Quantity</span><span class="v">${result.per_unit.qty} ${result.per_unit.unit_label}(s)</span></div>` : ''}</div>
    <div class="p"><div class="lab">Shipment</div>
      <div class="kv"><span class="k">Mode</span><span class="v">${MODE_LABEL[result.mode]}</span></div>
      <div class="kv"><span class="k">Destination</span><span class="v">${destinationLabel}</span></div></div>
  </section>

  <div class="cards">${cardsHtml}</div>

  <div class="tail">
  ${summaryHtml}

  ${buildReportFoot({
    notes: allNotes.length ? allNotes : ['No warnings — statutory rates matched this HS code exactly.'],
    signatoryName: co.name,
    signatoryRole: co.businessType || 'Customs Clearing & Forwarding Agent',
    legal: 'This is a decision-support estimate, not a customs assessment or tax invoice. Final duties, taxes and charges are those determined by the Tanzania Revenue Authority on the lodged declaration. Charge figures are sourced from the rate card noted in Notes &amp; Assumptions above, not a government tariff.',
    creditApp: 'ClearOS',
    creditRight: `${result.hs_code} &middot; Confidential`,
  })}
  </div>
  `;

  return buildReportDocument({
    title: `${TITLE_BY_MODE[result.mode]} Calculator &middot; ${result.hs_code} &middot; ClearOS`,
    bodyHtml: body,
  });
}

export function printAdvancedCalcReport(result: AdvancedCalcResult, meta: AdvancedCalcReportMeta = {}) {
  const html = buildAdvancedCalcReportHtml(result, meta);
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

/** Plain-text summary for /v1/ai/summarise — same "here's the numbers, tell
 *  me what matters" shape the FCL calculator's own AI Analysis card sends. */
export function buildAiSummaryText(result: AdvancedCalcResult): string {
  const cur = result.currency;
  const lines = [
    `${TITLE_BY_MODE[result.mode]} Calculator${result.hs_code ? ` — HS Code ${result.hs_code}: ${result.description}` : ''}`,
    `CIF: ${cur} ${fmt(result.cif)} (TZS ${fmt(result.cif_tzs)} @${result.fx_rate.toFixed(2)})`,
    `Duty rate: ${result.duty_rate}%, VAT rate: ${result.vat_rate}%, Excise: ${result.excise_rate}%`,
    `Total Duties & Taxes: ${cur} ${fmt(result.statutory_total)}`,
    `Total Charges (port/shipping/clearance/etc): ${cur} ${fmt(result.charges_total)}`,
    `Grand Total (net of recoverable VAT): ${cur} ${fmt(result.grand_total_net_vat)}`,
  ];
  if (result.per_unit) lines.push(`Per unit: ${cur} ${result.per_unit.cost_net_vat.toFixed(4)} net VAT (${result.per_unit.qty} units)`);
  if (result.warnings.length) lines.push(`Warnings: ${result.warnings.join(' | ')}`);
  return lines.join('\n');
}
