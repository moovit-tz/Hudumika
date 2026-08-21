// Shared branded print/export template — the same visual language as
// LandedCostPage.tsx's FCL `printReport()` (orange ClearOS header, card-based
// breakdown sections, dark "grand total" summary panel, signature/credit
// footer), extracted so the LCL / Air Freight / Transit calculators' exports
// (advancedCalcReport.ts) can share the exact look rather than the plainer,
// visually unrelated black-and-white sheet they used before. FCL's own
// printReport() is deliberately left untouched — it's already verified
// against a real user-approved reference PDF, and its 3-fixed-page
// pagination is tuned to its own fixed 7-card layout in a way that doesn't
// generalise to LCL/Air/Transit's variable card count. This module owns only
// the CSS + row/card/footer building blocks that are genuinely generic.
//
// Deliberately does NOT use watermark.ts's HUDUMIKA_FOOTER_HTML — that
// component's dual light/dark logo markup relies on index.css's
// `.logo-light-only`/`.logo-dark-only` + `[data-theme]` rules, which don't
// exist in a standalone print window (see watermark.ts's own fix for the
// "hudumika hudumika" double-logo bug this caused). The credit line here is
// plain text, same as FCL's own footer.

export interface ReportCompany {
  name: string;
  businessType?: string;
  address?: string;
  city?: string;
  country?: string;
  email?: string;
}

export const REPORT_STYLE = `
:root{--acc:#FF5E1A;--acc-600:#E8480A;--acc-050:#FFF4EC;--acc-100:#FFE0CE;--ink:#14181B;--ink-700:#2A3035;--slate:#5B646D;--slate-400:#8A939C;--line:#E5E9EC;--line-soft:#EEF2F4;--paper:#FFFFFF;--backdrop:#E7EBEE;--panel:#161A1E;--tint:#F7F9FA;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--backdrop);color:var(--ink);font-family:"Inter",system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.toolbar{position:fixed;top:18px;right:18px;z-index:50;display:flex;gap:8px}
.toolbar button{font-family:inherit;font-size:12.5px;font-weight:600;letter-spacing:.02em;border:1px solid var(--line);background:#fff;color:var(--ink-700);padding:9px 15px;border-radius:9px;cursor:pointer;box-shadow:0 2px 8px rgba(20,25,30,.10);transition:.15s}
.toolbar button:hover{border-color:var(--acc);color:var(--acc-600)}
.toolbar .primary{background:var(--acc);color:#fff;border-color:var(--acc)}
.toolbar .primary:hover{background:var(--acc-600);color:#fff}
.sheet{width:210mm;min-height:297mm;margin:34px auto;background:var(--paper);box-shadow:0 12px 40px rgba(20,25,30,.14);padding:16mm 15mm 13mm;position:relative}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;border-bottom:2px solid var(--ink);position:relative}
.head::after{content:"";position:absolute;left:0;bottom:-2px;width:88px;height:2px;background:var(--acc)}
.brand{display:flex;gap:12px;align-items:flex-start}
.mark{width:44px;height:44px;border-radius:13px;background:var(--acc);flex:none;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,94,26,.28)}
.mark svg{width:27px;height:27px}
.brand .name{font-family:"Space Grotesk",sans-serif;font-size:21px;font-weight:700;line-height:1;color:var(--ink)}
.brand .name span{color:var(--acc)}
.brand .role{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--slate);font-weight:600;margin-top:5px}
.brand .addr{font-size:10.5px;color:var(--slate);margin-top:7px;line-height:1.55}
.brand .addr b{color:var(--ink-700);font-weight:600}
.doc{text-align:right;flex:none}
.doc .kick{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.doc h1{font-family:"Space Grotesk",sans-serif;font-size:23px;font-weight:700;line-height:1.05;margin-top:3px;color:var(--ink)}
.doc .pi{margin-top:10px;font-size:11.5px;color:var(--slate);line-height:1.7}
.doc .pi b{color:var(--ink-700);font-weight:600}
.doc .pi .mono{font-family:"IBM Plex Mono",monospace;font-weight:600;color:var(--ink)}
.client{display:flex;align-items:baseline;gap:10px;margin-top:14px;padding:9px 14px;border:1px solid var(--line);border-radius:9px;background:var(--tint)}
.client .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700;flex:none}
.client .val{font-size:11.5px;color:var(--ink-700);font-weight:600}
.parties{display:grid;grid-template-columns:1fr 1fr;margin-top:16px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.parties .p{padding:13px 16px}
.parties .p:first-child{border-right:1px solid var(--line);background:var(--tint)}
.parties .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.parties .big{font-family:"Space Grotesk",sans-serif;font-size:15px;font-weight:600;margin-top:5px;color:var(--ink)}
.parties .kv{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;margin-top:6px}
.parties .kv .k{color:var(--slate)}
.parties .kv .v{color:var(--ink-700);font-weight:600;text-align:right}
.cards{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.card{border:1px solid var(--line);border-radius:12px;padding:12px 16px;background:#fff;page-break-inside:avoid}
.card-h{font-size:10px;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.card-h-sub{font-weight:500;text-transform:none;letter-spacing:0;color:var(--slate-400)}
table.ctbl{width:100%;border-collapse:collapse;font-size:10px}
table.ctbl thead th{background:var(--tint);color:var(--slate);font-weight:700;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;padding:5px 6px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
table.ctbl thead th.r{text-align:right}
table.ctbl td{padding:4.5px 6px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
table.ctbl .td-desc{color:var(--ink-700);font-weight:600;overflow-wrap:break-word}
table.ctbl .td-rate{width:1%;text-align:right;color:var(--slate);font-style:italic;white-space:nowrap}
table.ctbl .td-num{width:1%;text-align:right;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
.card-total{margin-top:8px;padding:7px 12px;border-radius:8px;background:var(--acc-050);border:1px solid var(--acc-100);display:flex;justify-content:space-between;align-items:center}
.card-total span:first-child{font-size:11px;font-weight:700;color:var(--ink)}
.card-total span:last-child{font-size:12.5px;font-weight:800;color:var(--acc-600)}
.card-empty{font-size:10.5px;color:var(--slate-400);font-style:italic;padding:4px 0}
.card-note{margin-top:6px;font-size:9.5px;color:var(--slate);line-height:1.45}
.summary{margin-top:16px;display:grid;grid-template-columns:1.12fr 0.88fr;border-radius:14px;overflow:hidden;border:1px solid var(--line);page-break-inside:avoid}
.sum-l{padding:18px 18px;background:var(--tint)}
.sum-l h3{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:13px;display:flex;align-items:center}
.sum-l h3 .n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--acc);color:#fff;border-radius:5px;font-family:'Space Grotesk';font-size:10.5px;margin-right:8px}
.sum-l .row{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;padding:5.5px 0;border-bottom:1px solid var(--line-soft)}
.sum-l .row .k{color:var(--ink-700);min-width:0;overflow-wrap:break-word}
.sum-l .row .v{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.sum-l .row.cifrow{border-bottom:1.5px solid var(--ink);padding-bottom:9px;margin-bottom:3px}
.sum-l .row.cifrow .k{font-weight:700}
.sum-l .row.cifrow .v{font-family:"Space Grotesk",sans-serif;font-size:12px}
.sum-r{background:var(--panel);color:#fff;padding:18px 18px;display:flex;flex-direction:column;justify-content:center}
.sum-r .prep-lab{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--acc-100);font-weight:700}
.sum-r .prep-tzs{font-family:"Space Grotesk",sans-serif;font-size:22px;font-weight:700;line-height:1.05;margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.sum-r .prep-usd{margin-top:6px;font-size:12px;color:#9fb2ac;font-variant-numeric:tabular-nums}
.sum-r .fx{margin-top:4px;font-size:10.5px;color:#75897f}
.sum-r .unit{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.sum-r .unit .l{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa39d;font-weight:600;white-space:nowrap}
.sum-r .unit .v{font-family:"Space Grotesk",sans-serif;font-size:16px;font-weight:700;margin-top:5px;color:#FF8A4C;font-variant-numeric:tabular-nums}
.foot{margin-top:20px}
.terms h4{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700;margin-bottom:8px}
.terms ul{list-style:none;font-size:10.5px;color:var(--slate);line-height:1.6;columns:2;column-gap:26px}
.terms ul li{padding-left:13px;position:relative;margin-bottom:3px;break-inside:avoid}
.terms ul li::before{content:"";position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.sign-row{margin-top:16px;border-top:1px solid var(--line);padding-top:11px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px;page-break-inside:avoid}
.sign .w{font-size:12px;font-weight:600;color:var(--ink-700)}
.sign .r{font-size:10.5px;color:var(--slate);margin-top:2px}
.sign-row .stamp{padding-top:7px;border-top:1px dashed var(--slate-400);font-size:10px;color:var(--slate-400);min-width:220px;text-align:right}
.legal{margin-top:14px;font-size:9.5px;color:var(--slate-400);line-height:1.55;background:var(--tint);border-radius:9px;padding:10px 13px}
.credit{margin-top:14px;padding-top:11px;border-top:2px solid var(--ink);position:relative;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--slate)}
.credit::after{content:"";position:absolute;left:0;top:-2px;width:88px;height:2px;background:var(--acc)}
.credit b{color:var(--ink-700)}
/* Faint ClearOS mark behind the page content — on screen it's one instance
   centred in the (single, scrollable) .sheet; in print it switches to
   position:fixed, which paged media repeats on every printed page, so a
   variable-length flowed document (unlike FCL's own fixed 7-card layout)
   still gets one watermark per physical page without knowing the page
   count up front. Sits behind everything: every card/section below it has
   an opaque background, so it only actually shows through genuine
   whitespace, same as FCL's own watermark. */
.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:118mm;max-width:70%;z-index:0;pointer-events:none;line-height:0}
.wm svg{width:100%;height:auto;display:block;fill:var(--acc);opacity:.075}
@media print{
  .wm{position:fixed}
  @page{size:A4;margin:14mm}
  html,body{background:#fff}
  .toolbar{display:none}
  .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
  .cards{display:block}
  .cards>.card{margin-bottom:10px}
  .summary,.parties,.head,.terms,.client{page-break-inside:avoid}
  /* The summary+footer block (buildReportSummary + buildReportFoot, wrapped
     by the caller in a .tail container) always starts a fresh page rather
     than relying on natural flow to find room for it. Chromium's print
     fragmentation can leave real, usable space at the bottom of the
     previous page and still push this whole block to the page after next —
     the same "blank near-empty trailing page" failure mode this session
     already hit once with PDFKit — because the block is long enough that a
     partial fit is never attempted. FCL's own printReport() learned this
     lesson first and gives its summary a guaranteed dedicated final page;
     this mirrors that rather than re-fighting the same fragmentation bug. */
  .tail{break-before:page;page-break-before:always}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@media screen and (max-width:900px){
  .sheet{width:100%;margin:0;padding:20px 12px}
  .parties,.summary{grid-template-columns:1fr}
  .terms ul{columns:1}
  .sign-row{flex-direction:column;align-items:flex-start}
  .sign-row .stamp{text-align:left;min-width:0}
  table.ctbl{font-size:10px}
  .toolbar{position:static;justify-content:flex-end;padding:10px}
  .head{flex-direction:column}.doc{text-align:left}
}
`;

// The ClearOS diamond mark's raw path geometry — shared between the header
// icon (white fill, on the orange `.mark` square) and the background
// watermark (no inline fill; `.wm svg` colours it via CSS instead).
const MARK_PATH_D = [
  'M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z',
  'M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z',
];
const MARK_PATHS = MARK_PATH_D.map(d => `<path d="${d}" fill="#fff"/>`).join('');
const WATERMARK_HTML = `<div class="wm" aria-hidden="true"><svg viewBox="7 20 111 110">${MARK_PATH_D.map(d => `<path d="${d}"/>`).join('')}</svg></div>`;

export function moneyN(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildReportHead(opts: {
  kicker: string;
  title: string;
  refLabel: string;
  generatedLabel: string;
  company: ReportCompany;
}): string {
  const { kicker, title, refLabel, generatedLabel, company } = opts;
  const addrLine = [company.address, company.city, company.country].filter(Boolean).join(', ');
  return `<header class="head">
    <div class="brand">
      <div class="mark"><svg viewBox="7 20 111 110" fill="none">${MARK_PATHS}</svg></div>
      <div>
        <div class="name">Clear<span>OS</span></div>
        <div class="role">Customs &amp; Landed Cost Intelligence</div>
        <div class="addr">Clearing agent: <b>${company.name}</b>${company.businessType ? ` &middot; ${company.businessType}` : ''}<br>${addrLine}${addrLine ? ' &middot; ' : ''}${company.email || ''}</div>
      </div>
    </div>
    <div class="doc">
      <div class="kick">${kicker}</div><h1>${title}</h1>
      <div class="pi">Ref <span class="mono">${refLabel}</span><br>Generated <b>${generatedLabel}</b></div>
    </div>
  </header>`;
}

export function buildClientBar(label: string, value: string): string {
  return `<section class="client"><span class="lab">${label}</span><span class="val">${value}</span></section>`;
}

export interface ReportTableColumn { label: string; align?: 'left' | 'right' }

/** One card: a heading, an optional data table, and an accent "total" banner
 *  — the same visual unit FCL's printReport() uses for CIF/Duties/TPA/etc.
 *  `rows` are already-formatted cell strings, one array per row, matching
 *  `columns` 1:1 — callers decide what columns actually apply to their data
 *  (e.g. LCL/Air/Transit have no per-row VAT split, so they simply don't
 *  pass a VAT column, rather than rendering an empty one). */
export function buildReportCard(opts: {
  heading: string;
  subheading?: string;
  columns: ReportTableColumn[];
  rows: string[][];
  totalLabel?: string;
  totalValueTzs?: number;
  emptyText?: string;
  note?: string;
}): string {
  const { heading, subheading, columns, rows, totalLabel, totalValueTzs, emptyText, note } = opts;
  const table = rows.length === 0
    ? (emptyText ? `<div class="card-empty">${emptyText}</div>` : '')
    : `<table class="ctbl"><thead><tr>${columns.map(c => `<th${c.align === 'right' ? ' class="r"' : ''}>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((cell, i) => `<td class="${i === 0 ? 'td-desc' : columns[i]?.align === 'right' ? 'td-num' : 'td-rate'}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const total = (totalLabel && totalValueTzs !== undefined)
    ? `<div class="card-total"><span>${totalLabel}</span><span>TZS ${moneyN(totalValueTzs)}</span></div>` : '';
  return `<div class="card"><div class="card-h">${heading}${subheading ? ` <span class="card-h-sub">${subheading}</span>` : ''}</div>${table}${total}${note ? `<div class="card-note">${note}</div>` : ''}</div>`;
}

export interface SummaryRow { label: string; valueTzs: number; emphasis?: boolean }

export function buildReportSummary(opts: {
  number: string | number;
  title: string;
  rows: SummaryRow[];
  headlineLabel: string;
  headlineTzs: number;
  headlineFcy?: { currency: string; value: number };
  fxLine?: string;
  unitBlock?: { label: string; valueTzs: number; note?: string };
}): string {
  const { number, title, rows, headlineLabel, headlineTzs, headlineFcy, fxLine, unitBlock } = opts;
  const rowsHtml = rows.map(r =>
    `<div class="row${r.emphasis ? ' cifrow' : ''}"><span class="k">${r.label}</span><span class="v">TZS ${moneyN(r.valueTzs)}</span></div>`
  ).join('');
  return `<section class="summary">
    <div class="sum-l">
      <h3><span class="n">${number}</span>${title}</h3>
      ${rowsHtml}
    </div>
    <div class="sum-r">
      <div class="prep-lab">${headlineLabel}</div>
      <div class="prep-tzs">TZS ${moneyN(headlineTzs)}</div>
      ${headlineFcy ? `<div class="prep-usd">${headlineFcy.currency} ${moneyN(headlineFcy.value)}</div>` : ''}
      ${fxLine ? `<div class="fx">${fxLine}</div>` : ''}
      ${unitBlock ? `<div class="unit"><div class="l">${unitBlock.label}</div><div class="v">TZS ${moneyN(unitBlock.valueTzs)}</div>${unitBlock.note ? `<div class="fx" style="margin-top:3px">${unitBlock.note}</div>` : ''}</div>` : ''}
    </div>
  </section>`;
}

export function buildReportFoot(opts: {
  notes: string[];
  signatoryName: string;
  signatoryRole: string;
  legal: string;
  creditApp: string;
  creditRight: string;
}): string {
  const { notes, signatoryName, signatoryRole, legal, creditApp, creditRight } = opts;
  return `<div class="foot">
    <div class="terms">
      <h4>Notes &amp; Assumptions</h4>
      <ul>${notes.map(w => `<li>${w}</li>`).join('') || '<li>No warnings on this estimate.</li>'}</ul>
    </div>
    <div class="sign-row">
      <div class="sign"><div class="w">For ${signatoryName}</div><div class="r">${signatoryRole}</div></div>
      <div class="stamp">Authorised signature &amp; company stamp</div>
    </div>
    <div class="legal">${legal}</div>
    <div class="credit"><span>Prepared on <b>${creditApp}</b> &middot; Hudumika Platform</span><span>${creditRight}</span></div>
  </div>`;
}

/** The print-when-fonts-are-ready script FCL's printReport() uses — printing
 *  against fallback-font metrics reflows once the real webfont lands, which
 *  is what makes an on-screen preview and the saved PDF disagree. */
export const REPORT_PRINT_SCRIPT = `
var didPrint = false;
function goPrint(){
  if(didPrint) return;
  didPrint = true;
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.print(); }); });
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(goPrint);
  setTimeout(goPrint, 2000);
} else {
  setTimeout(goPrint, 700);
}
`;

export function buildReportDocument(opts: { title: string; bodyHtml: string; toolbar?: boolean }): string {
  const { title, bodyHtml, toolbar = true } = opts;
  return `<!DOCTYPE html><html><head><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>${REPORT_STYLE}</style></head><body>
${toolbar ? `<div class="toolbar"><button class="primary" onclick="window.print()">Download / Print PDF</button></div>` : ''}
<div class="sheet">${WATERMARK_HTML}${bodyHtml}</div>
<script>${REPORT_PRINT_SCRIPT}</script>
</body></html>`;
}
