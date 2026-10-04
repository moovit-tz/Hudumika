import { fmt, LandedCostResult, MultiItemResult, MultiLineItemResult, ReportMeta, ShareResult, RateCardKey, rateCardKeyFor, fetchRateCardDefaults, ExtraCharge, extraChargeTzs, ShipmentMode, ContainerLot, OVERRIDE_LABELS, statutoryUnit, tpaUnitFor } from './shared.js';
import { apiFetch } from '../../lib/api.js';
import { getCompany } from '../../data/companyStore.js';
export function printReport(result: LandedCostResult, qty: string, summary: string, extraItems: ExtraCharge[] = [], container: '20ft' | '40ft' | 'lcl' = '20ft', rateCard: Record<string, number> = {}, meta: ReportMeta = {}, sizeCards: Record<string, Record<string, number>> = {}) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const fx = result.fx_rate;
  const company = getCompany();

  // Same statutory/port split used on-screen (FormattedLandedCostBreakdown)
  // — used here only to total up what the picker's extras contribute to
  // each named slot in the fixed-format sheet below (Shipping/TBS/Green/
  // Clearance), never to invent a new number.
  const STATUTORY_PREFIXES = ['Import Duty', 'Excise Duty', 'VAT', 'Railway Development Levy', 'Customs Processing Fee'];
  const isStatutory = (label: string) => STATUTORY_PREFIXES.some(p => label.startsWith(p));
  const lineItems = result.breakdown.filter(b => b.label !== 'CIF Value (TZS)' && b.label !== 'Total Landed Cost (TZS)' && !b.label.startsWith('Per Unit'));
  const icdBackendRow = lineItems.find(b => !isStatutory(b.label) && b.label === result.destination_charge_label);

  const asExtraRow = (e: ExtraCharge) => ({ label: `${e.item.item_name}${e.qty > 1 ? ` × ${e.qty}` : ''}`, amountTzs: extraChargeTzs(e, fx) });
  const clearanceExtra = extraItems.filter(e => e.item.authority === 'TASAC_CFA').map(asExtraRow);
  const tbsExtra = extraItems.filter(e => e.item.authority === 'TBS').map(asExtraRow);
  const shippingExtra = extraItems.filter(e => e.item.authority === 'SHIPPING_LINE').map(asExtraRow);
  const tpaExtra = extraItems.filter(e => e.item.authority === 'TPA').map(asExtraRow);
  const otherExtra = extraItems.filter(e => !['TASAC_CFA', 'TBS', 'SHIPPING_LINE', 'TPA'].includes(e.item.authority)).map(asExtraRow);

  const clearanceTotalUsd = clearanceExtra.reduce((s, r) => s + r.amountTzs, 0) / fx;
  // result.tbs_charge / result.shipping_line_charge are already the full,
  // correctly-summed backend totals (customs.service.ts) — reading them
  // straight off `result` rather than re-deriving from `result.breakdown`
  // avoids under-counting now that the backend emits TBS and Shipping Line
  // as two separate breakdown rows each (Physical Verification Fee/Service
  // Fee; Delivery Order/Handling), not one combined row.
  // Real flat fees (clearing agent's own rate sheet): Physical Verification
  // Fee TZS 150,000 + Service Fee TZS 30,000 when TBS applies (Destination
  // Inspection required and PVoC not also required — see customs.service.ts)
  const tbsVerifDefaultUsd = result.tbs_charge > 0 ? 150000 / fx : 0;
  const tbsServiceDefaultUsd = (result.tbs_charge > 0 ? 30000 / fx : 0) + tbsExtra.reduce((s, r) => s + r.amountTzs, 0) / fx;
  // Real flat fees (clearing agent's own rate sheet, same source the
  // backend uses): Delivery Order TZS 56,286 for any sea shipment,
  // Handling/TASAC Fee TZS 389,311.50 for FCL only — shown as two separate
  // rows below rather than lumped into one, so the split matches what's
  // actually being charged.
  // Taken from the backend's own breakdown rows rather than re-derived from
  // hardcoded shilling amounts here — duplicating them is what let the PDF
  // drift from the assessed figures when the rates changed.
  const shipDoRow = result.breakdown.find(b => b.label.includes('Delivery Order'));
  const shipHandleRow = result.breakdown.find(b => b.label.includes('Handling/TASAC'));
  const shipDoDefaultUsd = (shipDoRow?.amount ?? 0) / fx;
  const shipHandleDefaultUsd = ((shipHandleRow?.amount ?? 0) + shippingExtra.reduce((s, r) => s + r.amountTzs, 0)) / fx;

  const cargoUsd = result.fob_usd ?? result.cif_usd;
  const freightUsd = result.freight_usd ?? 0;
  const insuranceUsdCard = result.insurance_usd ?? (result.cif_usd * 0.01);
  const insurancePctCard = (cargoUsd + freightUsd) > 0 ? (insuranceUsdCard / (cargoUsd + freightUsd)) * 100 : 0;

  const companyAddrLine = [company.address, company.city, company.country].filter(Boolean).join(', ');
  const modeLabel = result.mode === 'sea_fcl' ? 'Sea · FCL' : result.mode === 'sea_lcl' ? 'Sea · LCL' : 'Air';
  const destinationLabel = (meta.destination || '').trim() || 'Dar es Salaam, Tanzania';
  /** "Dar es Salaam, Tanzania" → "Dar es Salaam" for the summary/DDP labels,
   *  which read as a place name rather than a full address. */
  const destinationShort = destinationLabel.split(',')[0].trim() || destinationLabel;
  const customerLine = [meta.customerName, meta.customerEmail, meta.customerPhone].map(s => (s || '').trim()).filter(Boolean).join(' · ');
  const overriddenLabels = (result.overridden_fields ?? []).map(f => OVERRIDE_LABELS[f] ?? f).join(', ');

  // VAT (18%) applies on top of TPA/ICD/Clearance/Shipping service charges,
  // same as the statutory VAT line itself — derived from what was actually
  // assessed (never a guessed flat 18%) so it stays correct if the rate
  // ever changes. TBS and CIF/Duties rows don't carry a separate VAT
  // column (TBS is VAT-exempt here; VAT is itself one of the Duties rows).
  // Read the VAT rate off the assessed line rather than reverse-deriving it
  // from vat / (CIF + duty): the VAT base is CIF plus every duty and levy, so
  // that division no longer yields the rate and would inflate the service-VAT
  // column on TPA/ICD/clearance charges.
  const vatRatePct = (() => {
    const row = result.breakdown.find(b => b.label.startsWith('VAT'));
    const parsed = row?.rate ? parseFloat(row.rate) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 18;
  })();

  // Per-consignment defaults for the 5 ICD charges and 3 C&F (agency)
  // charges — pulled from the tenant's own Rate Card tool
  // (/clearos/rate-card), keyed to whichever card matches this shipment's
  // container/mode. Empty/zero until the tenant populates that tool; never
  // a guessed fallback.
  const icdHandDef = rateCard['ICD_HANDLING'] ?? 0;
  const icdCorrDef = rateCard['ICD_CORRIDOR'] ?? 0;
  const icdVerifDef = rateCard['ICD_VERIFICATION'] ?? 0;
  const icdMoveDef = rateCard['ICD_MOVEMENT'] ?? 0;
  const icdXferDef = rateCard['ICD_TRANSFER'] ?? 0;
  const cfVerifDef = rateCard['CF_VERIFICATION'] ?? 0;
  const cfDocnDef = rateCard['CF_DOCUMENTATION'] ?? 0;
  const cfAgencyDef = clearanceTotalUsd > 0 ? clearanceTotalUsd : (rateCard['CF_AGENCY_FEE'] ?? 0);
  const hasRateCardDefaults = icdHandDef > 0 || icdCorrDef > 0 || icdVerifDef > 0 || icdMoveDef > 0 || icdXferDef > 0 || cfVerifDef > 0 || cfDocnDef > 0 || (rateCard['CF_AGENCY_FEE'] ?? 0) > 0;

  // ── Card body — mirrors the on-screen FormattedLandedCostBreakdown design
  // (same cards, same data), each rendered as a static, read-only table
  // (Description / Unit / Rate / Sub-total / VAT / Total) rather than an
  // interactive spreadsheet: this is a final estimate to hand to a client,
  // not a working sheet, so nothing here needs to be editable. VAT (18%)
  // applies on top of TPA/ICD/Clearance/Shipping service charges, same as
  // the old interactive sheet did — TBS and CIF/Duties rows don't carry a
  // separate VAT column (TBS is VAT-exempt here; VAT is itself one of the
  // Duties rows, so showing it twice would double-count it).
  const moneyN = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  interface Row { label: string; unit: string; rate: string; netTzs: number; vat: boolean }
  const row = (label: string, unit: string, rate: string, netTzs: number, vat: boolean): Row => ({ label, unit, rate, netTzs, vat });
  const tblRow = (r: Row) => {
    const vatTzs = r.vat ? r.netTzs * vatRatePct / 100 : 0;
    return `<tr><td class="td-desc">${r.label}</td><td class="td-unit">${r.unit}</td><td class="td-rate">${r.rate}</td><td class="td-num">TZS ${moneyN(r.netTzs)}</td><td class="td-num">${r.vat ? 'TZS ' + moneyN(vatTzs) : '&mdash;'}</td><td class="td-num td-total">TZS ${moneyN(r.netTzs + vatTzs)}</td></tr>`;
  };
  // th-unit / th-rate mirror the td-unit / td-rate body classes so the narrow
  // -screen rule can hide a column's header and its cells together. Hiding
  // only the cells leaves 6 headers over 4 cells and shifts every value one
  // column left, which put Total under the VAT heading.
  const cardTable = (rows: Row[]) => rows.length === 0 ? '' : `<table class="ctbl"><thead><tr><th>Description</th><th class="th-unit">Unit</th><th class="r th-rate">Rate</th><th class="r">Sub-total</th><th class="r">VAT</th><th class="r">Total</th></tr></thead><tbody>${rows.map(tblRow).join('')}</tbody></table>`;
  const rowsTotal = (rows: Row[]) => rows.reduce((s, r) => s + r.netTzs + (r.vat ? r.netTzs * vatRatePct / 100 : 0), 0);
  const cardTotal = (label: string, valueTzs: number) => `<div class="card-total"><span>${label}</span><span>TZS ${moneyN(valueTzs)}</span></div>`;
  const cardEmpty = (text: string) => `<div class="card-empty">${text}</div>`;
  const cardNote = (text: string) => `<div class="card-note">${text}</div>`;

  const statutoryItems = lineItems.filter(b => isStatutory(b.label));
  const tpaItems = lineItems.filter(b => !isStatutory(b.label) && b.label !== result.destination_charge_label && !b.label.startsWith('TBS Charges') && !b.label.startsWith('Shipping Line Charges'));

  const cifRows = [
    row('FOB Value', 'lot', `USD ${moneyN(cargoUsd)}`, cargoUsd * fx, false),
    row('Freight', modeLabel, `USD ${moneyN(freightUsd)}`, freightUsd * fx, false),
    row('Insurance', '% of CFR', `${insurancePctCard.toFixed(insurancePctCard % 1 === 0 ? 0 : 2)}%`, insuranceUsdCard * fx, false),
  ];
  const cifCardHtml = `<div class="card"><div class="card-h">CIF VALUE</div>${cardTable(cifRows)}${cardTotal('Total CIF', result.cif_tzs)}</div>`;

  const dutiesRows = statutoryItems.map(b => row(b.label, statutoryUnit(b.label), b.rate || '&mdash;', b.amount, false));
  const dutiesCardHtml = `<div class="card"><div class="card-h">DUTIES &amp; TAXES</div>${cardTable(dutiesRows)}${cardTotal('Total Duties &amp; Taxes', result.statutory_total)}</div>`;

  const tpaRows = [
    ...tpaItems.map(b => row(b.label, tpaUnitFor(b.label), b.rate || '&mdash;', b.amount, true)),
    ...tpaExtra.map(r => row(r.label, '&mdash;', '&mdash;', r.amountTzs, false)),
  ];
  const tpaSubtotalTzs = rowsTotal(tpaRows);
  const tpaCardHtml = `<div class="card"><div class="card-h">TPA CHARGES</div>${cardTable(tpaRows) || cardEmpty('No TPA charges (air mode, or nothing added).')}${cardTotal('Total TPA Charges', tpaSubtotalTzs)}${cardNote('Wharfage, Port Infrastructure Development and Green Port Initiatives are published TPA rates.')}</div>`;

  const icdRateAll: [string, number][] = [
    ['Customs Verification', icdVerifDef], ['Corridor Levy', icdCorrDef], ['Handling Charges', icdHandDef],
    ['ICD Movement Charges', icdMoveDef], ['Container Transfer', icdXferDef],
  ];
  const containerCount = Math.max(1, result.num_containers ?? 1);
  /** Container mix, falling back to the selected single size for results that
   *  predate the mixed-consignment field. */
  const lots: { size: '20ft' | '40ft'; count: number }[] =
    (result.containers && result.containers.length > 0)
      ? result.containers
      : (container === '20ft' || container === '40ft') ? [{ size: container, count: containerCount }] : [];
  const multiSize = lots.length > 1;
  /** ICD codes in the same order the rate card lists them, so the printed
   *  rows match the Rate Card tool. */
  const ICD_CODES: [string, string][] = [
    ['ICD_VERIFICATION', 'Customs Verification'],
    ['ICD_CORRIDOR', 'Corridor Levy'],
    ['ICD_HANDLING', 'Handling Charges'],
    ['ICD_MOVEMENT', 'ICD Movement Charges'],
    ['ICD_TRANSFER', 'Container Transfer'],
  ];
  // Each size is priced from its own card — a 40ft is not twice a 20ft — and
  // multiplied by that lot's count.
  const icdRows = lots.length > 0
    ? lots.flatMap(lot => {
        const card = sizeCards[lot.size] ?? rateCard;
        return ICD_CODES
          .map(([code, label]) => ({ label, usd: card[code] ?? 0 }))
          .filter(r => r.usd > 0)
          .map(r => row(
            multiSize ? `${r.label} (${lot.size})` : r.label,
            lot.count > 1 ? `per container &times; ${lot.count}` : 'per container',
            `USD ${moneyN(r.usd)}`,
            r.usd * fx * lot.count,
            true,
          ));
      })
    : icdRateAll.filter(([, v]) => v > 0).map(([label, usd]) => row(label, 'per consignment', `USD ${moneyN(usd)}`, usd * fx, true));
  const icdSubtotalTzs = rowsTotal(icdRows);
  // `brk` starts page 2 here — page 1 ends after Total TPA Charges.
  const icdCardHtml = `<div class="card"><div class="card-h">ICD CHARGES</div>${cardTable(icdRows) || cardEmpty('Nothing entered yet — populate your Rate Card (Tools → Rate Card).')}${cardTotal('Total ICD Charges', icdSubtotalTzs)}${cardNote(`Sourced from your Rate Card — a commercial estimate, not a TRA assessment.${icdBackendRow ? ` ClearOS separately computed a single ICD/destination charge of TZS ${moneyN(icdBackendRow.amount)} (${icdBackendRow.label}) for reference — reconcile it against the itemised figures above rather than adding both.` : ''}`)}</div>`;

  const clearanceRows = [
    ...(cfDocnDef > 0 ? [row('Documentation', 'per BL', `USD ${moneyN(cfDocnDef)}`, cfDocnDef * fx, true)] : []),
    ...(cfVerifDef > 0 ? [row('Verification', 'per BL', `USD ${moneyN(cfVerifDef)}`, cfVerifDef * fx, true)] : []),
    ...(clearanceExtra.length > 0 ? clearanceExtra.map(e => row(e.label, '&mdash;', '&mdash;', e.amountTzs, false))
      : lots.length > 0
        ? lots.flatMap(lot => {
            const usd = (sizeCards[lot.size] ?? rateCard)['CF_AGENCY_FEE'] ?? 0;
            return usd > 0 ? [row(
              multiSize ? `Agency Fees (${lot.size})` : 'Agency Fees',
              lot.count > 1 ? `per container &times; ${lot.count}` : 'per container',
              `USD ${moneyN(usd)}`, usd * fx * lot.count, true,
            )] : [];
          })
        : cfAgencyDef > 0
          ? [row('Agency Fees', 'per BL', `USD ${moneyN(cfAgencyDef)}`, cfAgencyDef * fx, true)] : []),
  ];
  const clearanceTotalTzs = rowsTotal(clearanceRows);
  const clearanceCardHtml = `<div class="card"><div class="card-h">CLEARANCE CHARGES <span class="card-h-sub">(documentation, verification &amp; TASAC agency fee)</span></div>${cardTable(clearanceRows) || cardEmpty('No agency fee yet — set one in Tools → Rate Card, or pick one from the additional-charges search below.')}${cardTotal('Total Clearance Charges', clearanceTotalTzs)}${cardNote(`Documentation and Verification are sourced from your Rate Card; Agency Fee comes from what you've picked below if anything, otherwise your Rate Card's default.`)}</div>`;

  const tbsRows = [
    ...(tbsVerifDefaultUsd > 0 ? [row('Physical Verification Fee (DI)', 'per BL', `USD ${moneyN(tbsVerifDefaultUsd)}`, tbsVerifDefaultUsd * fx, false)] : []),
    ...(tbsServiceDefaultUsd > 0 ? [row('Service Fee', 'per BL', `USD ${moneyN(tbsServiceDefaultUsd)}`, tbsServiceDefaultUsd * fx, false)] : []),
  ];
  const tbsTotalTzs = rowsTotal(tbsRows);
  const tbsCardHtml = `<div class="card"><div class="card-h">TBS CHARGES</div>${cardTable(tbsRows) || cardEmpty("No TBS charge on this quote.")}${cardTotal('Total TBS Charges', tbsTotalTzs)}${cardNote('Physical Verification Fee (TZS 150,000) + Service Fee (TZS 30,000) are flat reference rates from the clearing agent’s own rate sheet.')}</div>`;

  // Delivery Order carries VAT; Handling/TASAC does not — per the tenant's own
  // Landed Cost Model workbook, which shows a blank VAT column and a total
  // equal to the sub-total on that line.
  const shipRows = [
    ...(shipDoDefaultUsd > 0 ? [row('Delivery Order Fee', 'per BL', `USD ${moneyN(shipDoDefaultUsd)}`, shipDoDefaultUsd * fx, true)] : []),
    ...(shipHandleDefaultUsd > 0 ? [row('Handling / TASAC Fee', 'per container', `USD ${moneyN(shipHandleDefaultUsd)}`, shipHandleDefaultUsd * fx, false)] : []),
  ];
  const shipTotalTzs = rowsTotal(shipRows);
  const shipCardHtml = `<div class="card"><div class="card-h">SHIPPING LINE CHARGES</div>${cardTable(shipRows) || cardEmpty('Not applicable for air cargo.')}${cardTotal('Total Shipping Line Charges', shipTotalTzs)}${cardNote('Delivery Order (TZS 56,286) and Handling/TASAC Fee (TZS 389,311.50, FCL only) are flat reference rates from the clearing agent’s own rate sheet.')}</div>`;

  const freightinsTzs = freightUsd * fx + insuranceUsdCard * fx;
  const tzpayTzs = shipTotalTzs + result.statutory_total + tbsTotalTzs + tpaSubtotalTzs + icdSubtotalTzs + clearanceTotalTzs;
  const prepTzs = freightinsTzs + tzpayTzs;
  const prepUsd = prepTzs / fx;
  const ddpTzs = cargoUsd * fx + prepTzs;
  const ddpUsd = cargoUsd + prepUsd;

  const notesExtra: string[] = [];
  if (otherExtra.length > 0) {
    notesExtra.push(`Added via the on-screen picker but with no matching card above — add manually: ${otherExtra.map(e => `${e.label} (TZS ${e.amountTzs.toLocaleString('en-US')})`).join('; ')}.`);
  }
  if (hasRateCardDefaults) notesExtra.push(`ICD and C&F charges are sourced from ${company.name}'s own Rate Card tool (Tools → Rate Card) for the "${rateCardKeyFor(result.mode, container)}" card — not a government tariff. Any line still at zero hasn't been entered there yet.`);
  const allNotes = [...result.warnings, ...result.assumptions, ...notesExtra];

  w.document.write(`<!DOCTYPE html><html><head><title>Landed Cost Calculator &middot; ${result.hs_code} &middot; ClearOS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--acc:#FF5E1A;--acc-600:#E8480A;--acc-050:#FFF4EC;--acc-100:#FFE0CE;--ink:#14181B;--ink-700:#2A3035;--slate:#5B646D;--slate-400:#8A939C;--line:#E5E9EC;--line-soft:#EEF2F4;--paper:#FFFFFF;--backdrop:#E7EBEE;--panel:#161A1E;--tint:#F7F9FA;--gold:#B8862F;}
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
.override{margin-top:10px;padding:9px 14px;border:1px solid #E4C06A;border-radius:9px;background:#FDF6E3;font-size:10.5px;color:#6B5518;line-height:1.5}
.override b{color:#8A6D14}
.parties{display:grid;grid-template-columns:1fr 1fr;margin-top:16px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.parties .p{padding:13px 16px}
.parties .p:first-child{border-right:1px solid var(--line);background:var(--tint)}
.parties .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.parties .big{font-family:"Space Grotesk",sans-serif;font-size:15px;font-weight:600;margin-top:5px;color:var(--ink)}
.parties .kv{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;margin-top:6px}
.parties .kv .k{color:var(--slate)}
.parties .kv .v{color:var(--ink-700);font-weight:600;text-align:right}
.cards{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.card{border:1px solid var(--line);border-radius:12px;padding:12px 16px;background:#fff}
.card-h{font-size:10px;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.card-h-sub{font-weight:500;text-transform:none;letter-spacing:0;color:var(--slate-400)}
table.ctbl{width:100%;border-collapse:collapse;font-size:10px}
table.ctbl thead th{background:var(--tint);color:var(--slate);font-weight:700;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;padding:5px 6px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
table.ctbl thead th.r{text-align:right}
table.ctbl td{padding:4.5px 6px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
table.ctbl .td-desc{color:var(--ink-700);font-weight:600;overflow-wrap:break-word}
table.ctbl .td-unit{width:1%;color:var(--slate);font-size:9px;white-space:nowrap}
table.ctbl .td-rate{width:1%;text-align:right;color:var(--slate);font-style:italic;white-space:nowrap}
table.ctbl .td-num{width:1%;text-align:right;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
table.ctbl .td-total{font-weight:700}
.card-total{margin-top:8px;padding:7px 12px;border-radius:8px;background:var(--acc-050);border:1px solid var(--acc-100);display:flex;justify-content:space-between;align-items:center}
.card-total span:first-child{font-size:11px;font-weight:700;color:var(--ink)}
.card-total span:last-child{font-size:12.5px;font-weight:800;color:var(--acc-600)}
.card-empty{font-size:10.5px;color:var(--slate-400);font-style:italic;padding:4px 0}
.card-note{margin-top:6px;font-size:9.5px;color:var(--slate);line-height:1.45}
.summary{margin-top:22px;display:grid;grid-template-columns:1.12fr 0.88fr;border-radius:14px;overflow:hidden;border:1px solid var(--line)}
.sum-l{padding:18px 18px;background:var(--tint)}
.sum-l h3{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:13px;display:flex;align-items:center}
.sum-l h3 .n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--acc);color:#fff;border-radius:5px;font-family:'Space Grotesk';font-size:10.5px;margin-right:8px}
.sum-l .row{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;padding:5.5px 0;border-bottom:1px solid var(--line-soft)}
.sum-l .row.head{color:var(--slate);font-weight:600;border-bottom:none;padding-bottom:2px;padding-top:9px;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase}
.sum-l .row.sub{padding-left:14px}
.sum-l .row .k{color:var(--ink-700);min-width:0;overflow-wrap:break-word}
.sum-l .row.sub .k{color:var(--slate)}
.sum-l .row .v{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.sum-l .row.cifrow{border-bottom:1.5px solid var(--ink);padding-bottom:9px;margin-bottom:3px}
.sum-l .row.cifrow .k{font-weight:700}
.sum-l .row.cifrow .v{font-family:"Space Grotesk",sans-serif;font-size:12px}
.sum-r{background:var(--panel);color:#fff;padding:18px 18px;display:flex;flex-direction:column;justify-content:center}
.sum-r .prep-lab{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--acc-100);font-weight:700}
.sum-r .prep-tzs{font-family:"Space Grotesk",sans-serif;font-size:22px;font-weight:700;line-height:1.05;margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.sum-r .prep-usd{margin-top:6px;font-size:12px;color:#9fb2ac;font-variant-numeric:tabular-nums}
.sum-r .fx{margin-top:4px;font-size:10.5px;color:#75897f}
.sum-r .ddp{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.sum-r .ddp .l{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa39d;font-weight:600;white-space:nowrap}
.sum-r .ddp .v{font-family:"Space Grotesk",sans-serif;font-size:19px;font-weight:700;margin-top:5px;color:#FF8A4C;font-variant-numeric:tabular-nums;white-space:nowrap}
.sum-r .ddp .n{font-size:10px;color:#75897f;margin-top:3px}
.foot{margin-top:20px}
.terms{width:100%}
.terms h4{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700;margin-bottom:8px}
.terms ul{list-style:none;font-size:10.5px;color:var(--slate);line-height:1.6;columns:2;column-gap:26px}
.terms ul li{padding-left:13px;position:relative;margin-bottom:3px;break-inside:avoid}
.terms ul li::before{content:"";position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.qr{margin-top:14px;display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--tint)}
.qr img{width:74px;height:74px;flex:none;display:block;border-radius:6px;background:#fff}
.qr-h{font-size:10.5px;font-weight:800;color:var(--ink);text-transform:uppercase;letter-spacing:.07em}
.qr-b{font-size:9.5px;color:var(--slate);line-height:1.5;margin-top:4px}
.qr-u{font-family:"IBM Plex Mono",monospace;font-size:8.5px;color:var(--acc-600);margin-top:5px;word-break:break-all}
/* Each .page is one printed sheet. Wrapping content this way (rather than
   forcing breaks on arbitrary elements) gives the watermark a box to centre
   itself in, and makes the pagination explicit instead of inferred. */
.page{position:relative}
.page > *{position:relative;z-index:1}
/* Watermark: pages 1 and 2 carry one, the final page does not. Sits in front
   of the content at 70% transparency (0.3 opacity). z-index beats the
   .page > * rule above; pointer-events:none keeps it from swallowing clicks
   or text selection in the on-screen preview. */
.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:118mm;max-width:70%;z-index:5;pointer-events:none;line-height:0}
.wm svg{width:100%;height:auto;display:block;fill:var(--acc);opacity:.075}
.page-last .wm{display:none}
.sign-row{margin-top:16px;border-top:1px solid var(--line);padding-top:11px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.sign .w{font-size:12px;font-weight:600;color:var(--ink-700)}
.sign .r{font-size:10.5px;color:var(--slate);margin-top:2px}
.sign-row .stamp{padding-top:7px;border-top:1px dashed var(--slate-400);font-size:10px;color:var(--slate-400);min-width:220px;text-align:right}
.legal{margin-top:14px;font-size:9.5px;color:var(--slate-400);line-height:1.55;background:var(--tint);border-radius:9px;padding:10px 13px}
.credit{margin-top:14px;padding-top:11px;border-top:2px solid var(--ink);position:relative;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--slate)}
.credit::after{content:"";position:absolute;left:0;top:-2px;width:88px;height:2px;background:var(--acc)}
.credit b{color:var(--ink-700)}
@media print{
  /* Real A4 pages with normal margins. Each .page container is exactly one
     printed sheet: page 1 ends after Total TPA Charges, page 2 runs ICD →
     Shipping Line, page 3 is the Landed Cost Summary, notes and footer. */
  @page{size:A4;margin:14mm}
  html,body{background:#fff}
  .toolbar{display:none}
  .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
  /* break-after on every page but the last — a trailing break would emit a
     blank extra sheet.

     Deliberately NO min-height. Pinning it to the 269mm printable height
     (297mm less two 14mm margins) meant any sub-pixel rounding overflowed a
     hairline onto the following sheet, and the forced break then pushed the
     next page one further — producing a blank sheet before the summary. The
     watermark now centres on its page's content box rather than on the paper,
     which on these content-heavy pages is nearly the same place and cannot
     manufacture a blank page. */
  .page{break-after:page;page-break-after:always}
  .page-last{break-after:auto;page-break-after:auto}
  /* Flex containers fragment unreliably across print engines, so the card
     stack becomes plain block flow for printing — forced breaks on block
     children are dependable. The gap property doesn't apply in block layout,
     hence the explicit margin. */
  .cards{display:block}
  .cards > .card{margin-bottom:10px}
  .card{page-break-inside:avoid}
  .summary,.parties,.head,.terms,.client,.override,.qr{page-break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
/* SCREEN ONLY. Must never apply to print: an A4 page is 210mm, about 794 CSS
   px, so an unscoped max-width:900px rule matches while printing and wrecks
   the exported document — stacking the header, the Cargo/Shipment pair and
   the summary, and dropping table columns. */
@media screen and (max-width:900px){
  .sheet{width:100%;margin:0;padding:20px 12px}
  .parties,.summary{grid-template-columns:1fr}
  .terms ul{columns:1}
  .sign-row{flex-direction:column;align-items:flex-start}
  .sign-row .stamp{text-align:left;min-width:0}
  table.ctbl{font-size:10px}
  table.ctbl .td-unit,table.ctbl .td-rate,table.ctbl .th-unit,table.ctbl .th-rate{display:none}
  .toolbar{position:static;justify-content:flex-end;padding:10px}
  .head{flex-direction:column}.doc{text-align:left}
}
</style></head><body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">Download / Print PDF</button>
</div>

<div class="sheet">
 <section class="page">
  <div class="wm" aria-hidden="true"><svg viewBox="7 20 111 110"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z"/></svg></div>
  <header class="head">
    <div class="brand">
      <div class="mark"><svg viewBox="7 20 111 110" fill="none"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z" fill="#fff"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z" fill="#fff"/></svg></div>
      <div>
        <div class="name">Clear<span>OS</span></div>
        <div class="role">Customs &amp; Landed Cost Intelligence</div>
        <div class="addr">Clearing agent: <b>${company.name}</b>${company.businessType ? ` &middot; ${company.businessType}` : ''}<br>${companyAddrLine}${companyAddrLine ? ' &middot; ' : ''}${company.email || ''}</div>
      </div>
    </div>
    <div class="doc">
      <div class="kick">Estimate</div><h1>Landed Cost</h1>
      <div class="pi">Ref <span class="mono">${result.hs_code}-${now.replace(/\s/g, '')}</span><br>Generated <b>${now}</b></div>
    </div>
  </header>

  ${customerLine ? `<section class="client"><span class="lab">Prepared for</span><span class="val">${customerLine}</span></section>` : ''}
  ${overriddenLabels ? `<section class="override"><b>Manual rate override:</b> ${overriddenLabels} — entered by the preparer, not sourced from the EAC CET tariff database or a published TPA/TRA rate.</section>` : ''}

  <section class="parties">
    <div class="p"><div class="lab">Cargo</div><div class="big">${result.description}</div>
      <div class="kv"><span class="k">HS Code</span><span class="v">${result.hs_code}</span></div>
      <div class="kv"><span class="k">Quantity</span><span class="v">${qty || '1'} unit(s)</span></div></div>
    <div class="p"><div class="lab">Shipment</div>
      <div class="kv"><span class="k">Mode</span><span class="v">${modeLabel}</span></div>
      <div class="kv"><span class="k">Destination basis</span><span class="v">${result.destination_charge_label}</span></div>
      <div class="kv"><span class="k">Destination</span><span class="v">${destinationLabel}</span></div></div>
  </section>

  <div class="cards">
    ${cifCardHtml}
    ${dutiesCardHtml}
    ${tpaCardHtml}
  </div>
 </section>

 <section class="page">
  <div class="wm" aria-hidden="true"><svg viewBox="7 20 111 110"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z"/></svg></div>
  <div class="cards">
    ${icdCardHtml}
    ${clearanceCardHtml}
    ${tbsCardHtml}
    ${shipCardHtml}
  </div>
 </section>

 <section class="page page-last">
  <section class="summary">
    <div class="sum-l">
      <h3><span class="n">10</span>Landed Cost Summary</h3>
      <div class="row cifrow"><span class="k">CIF ${destinationShort} <span style="color:var(--slate);font-weight:400;font-size:8.5px">cargo, freight, insurance</span></span><span class="v">TZS ${moneyN(result.cif_tzs)}</span></div>
      <div class="row"><span class="k">1&nbsp; Freight &amp; insurance — export country</span><span class="v">TZS ${moneyN(freightinsTzs)}</span></div>
      <div class="row head"><span class="k">2&nbsp; Amount to pay in Tanzania</span><span></span></div>
      <div class="row sub"><span class="k">Local shipping line charges</span><span class="v">TZS ${moneyN(shipTotalTzs)}</span></div>
      <div class="row sub"><span class="k">Duties &amp; taxes — TRA (incl. VAT)</span><span class="v">TZS ${moneyN(result.statutory_total)}</span></div>
      <div class="row sub"><span class="k">TBS charges</span><span class="v">TZS ${moneyN(tbsTotalTzs)}</span></div>
      <div class="row sub"><span class="k">Port &amp; handling — TPA</span><span class="v">TZS ${moneyN(tpaSubtotalTzs)}</span></div>
      <div class="row sub"><span class="k">ICD charges</span><span class="v">TZS ${moneyN(icdSubtotalTzs)}</span></div>
      <div class="row sub"><span class="k">C&amp;F charges</span><span class="v">TZS ${moneyN(clearanceTotalTzs)}</span></div>
    </div>
    <div class="sum-r">
      <div class="prep-lab">Total Amount to Prepare</div>
      <div class="prep-tzs">TZS ${moneyN(prepTzs)}</div>
      <div class="prep-usd">USD ${moneyN(prepUsd)}</div>
      <div class="fx">@ USD &rarr; TZS ${fx.toLocaleString('en-US')}</div>
      <div class="ddp">
        <div class="l">Total Landed Cost — DDP ${destinationShort} <span style="text-transform:none;letter-spacing:0">(incl. VAT)</span></div>
        <div class="v">TZS ${moneyN(ddpTzs)}</div>
        <div class="n">USD ${moneyN(ddpUsd)} = Cargo ${`$${moneyN(cargoUsd)}`} + costs to prepare ${`$${moneyN(prepUsd)}`}</div>
      </div>
    </div>
  </section>

  <div class="foot">
    <div class="terms">
      <h4>Notes &amp; Assumptions</h4>
      <ul>${allNotes.map(w => `<li>${w}</li>`).join('') || '<li>No warnings — statutory rates matched this HS code exactly.</li>'}</ul>
    </div>
    ${meta.qrDataUri ? `<div class="qr">
      <img src="${meta.qrDataUri}" alt="Scan to open this estimate">
      <div class="qr-t">
        <div class="qr-h">Scan for the full report</div>
        <div class="qr-b">Opens this estimate on ${company.name}'s ClearOS workspace, where you can download it as a PDF. You'll be asked for an email address so we can send you the follow-up.</div>
        ${meta.shareUrl ? `<div class="qr-u">${meta.shareUrl}</div>` : ''}
      </div>
    </div>` : ''}
    <div class="sign-row">
      <div class="sign"><div class="w">For ${company.name}</div>
        <div class="r">${company.businessType || 'Customs Clearing & Forwarding Agent'}</div></div>
      <div class="stamp">Authorised signature &amp; company stamp</div>
    </div>
    ${summary ? `<h4 style="margin-top:14px;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700">AI Summary</h4><div style="white-space:pre-wrap;background:var(--tint);padding:14px;border-radius:8px;font-size:11.5px;line-height:1.7;border:1px solid var(--line);margin-top:8px">${summary}</div>` : ''}
    <div class="legal">This is a decision-support estimate, not a customs assessment or tax invoice. Final duties, taxes and charges are those determined by the Tanzania Revenue Authority on the lodged declaration. TBS, Port, ICD and C&amp;F figures are estimates pending your final third-party invoices — see Notes &amp; Assumptions above for sourcing.</div>
    <div class="credit"><span>Prepared on <b>ClearOS</b> &middot; Hudumika Platform</span><span>${result.hs_code} &middot; Confidential</span></div>
  </div>
 </section>
</div>

<script>
/** Pagination is now plain A4 with two forced breaks (see the .brk rule), so
 *  there's no dynamic page sizing to do — but the print still has to wait for
 *  the web fonts. Printing against fallback-font metrics reflows the layout
 *  once the real fonts land, which is what previously made the preview and
 *  the saved file disagree and pushed rows onto phantom pages. */
var didPrint = false;
function goPrint(){
  if(didPrint) return;
  didPrint = true;
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.print(); }); });
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(goPrint);
  setTimeout(goPrint, 2000); // fallback if the fonts API stalls or a font 404s
} else {
  setTimeout(goPrint, 700);
}
</script>
</body></html>`);
  w.document.close();
  w.focus();
}

/** Re-renders a shared estimate from a stored share payload, using the exact
 *  same document generator as the original export so a downloaded copy is
 *  identical to the printed one. The QR is deliberately dropped — the reader
 *  is already on the share page, and re-printing it would encode a link back
 *  to the page they came from. */
export function printSharedReport(payload: {
  result?: LandedCostResult;
  multiResult?: MultiItemResult;
  qty?: string;
  summary?: string;
  extraItems?: ExtraCharge[];
  container?: '20ft' | '40ft' | 'lcl';
  rateCard?: Record<string, number>;
  sizeCards?: Record<string, Record<string, number>>;
  /** Container mix, so a replayed multi-item link prices ICD per size. */
  lots?: { size: '20ft' | '40ft'; count: number }[];
  meta?: ReportMeta;
}) {
  if (!payload) return;
  const { qrDataUri, shareUrl, ...meta } = payload.meta ?? {};
  if (payload.multiResult) {
    printMultiReport(payload.multiResult, meta, payload.rateCard ?? {}, payload.sizeCards ?? {}, payload.lots ?? []);
    return;
  }
  if (!payload.result) return;
  printReport(
    payload.result,
    payload.qty ?? '1',
    payload.summary ?? '',
    payload.extraItems ?? [],
    payload.container ?? '20ft',
    payload.rateCard ?? {},
    meta,
    payload.sizeCards ?? {},
  );
}

/** Multi-item equivalent of createShareForReport. Same never-throws contract:
 *  a failed share just means the printed copy carries no QR code. */
/** Size-keyed rate cards for a container mix. Mirrors fetchSizeCards, which
 *  reads the sizes off a single-item result this path does not have. */
export async function fetchSizeCardsForLots(
  lots: { size: '20ft' | '40ft'; count: number }[],
  icdOperatorId: string | null,
): Promise<Record<string, Record<string, number>>> {
  const sizes = Array.from(new Set(lots.map(l => l.size)));
  if (sizes.length === 0) return {};
  const pairs = await Promise.all(sizes.map(async sz => [sz, await fetchRateCardDefaults(sz as RateCardKey, icdOperatorId)] as const));
  return Object.fromEntries(pairs);
}

export async function createShareForMulti(result: MultiItemResult, meta: ReportMeta, extra: Record<string, any> = {}): Promise<ShareResult> {
  try {
    const primary = result.items?.[0];
    const r: any = await apiFetch('/v1/landed-cost-shares', {
      method: 'POST',
      body: JSON.stringify({
        hs_code: primary?.hs_code ?? null,
        description: result.items?.length > 1 ? `${result.items.length} line items` : (primary?.description ?? null),
        customer_name: meta.customerName || null,
        // The rate card travels with the link so a shared report prices ICD
        // and the agency fee the same way the sender saw it, rather than
        // silently falling back to the ClearOS default for the recipient.
        payload: { multiResult: result, meta, ...extra },
      }),
    });
    return { qrDataUri: r?.qr_data_uri ?? undefined, shareUrl: r?.url ?? undefined, qrUnavailableReason: r?.qr_unavailable_reason ?? undefined };
  } catch {
    return { qrUnavailableReason: 'The report link could not be created, so this copy has no QR code.' };
  }
}

export function printMultiReport(
  result: MultiItemResult,
  meta: ReportMeta = {},
  rateCard: Record<string, number> = {},
  sizeCards: Record<string, Record<string, number>> = {},
  lots: { size: '20ft' | '40ft'; count: number }[] = [],
) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const company = getCompany();
  const companyAddrLine = [company.address, company.city, company.country].filter(Boolean).join(', ');
  const modeLabel = result.mode === 'sea_fcl' ? 'Sea · FCL' : result.mode === 'sea_lcl' ? 'Sea · LCL' : 'Air';
  const allNotes = [...result.warnings, ...result.assumptions];
  const destinationLabel = (meta.destination || '').trim() || 'Dar es Salaam, Tanzania';
  const destinationShort = destinationLabel.split(',')[0].trim() || destinationLabel;
  const customerLine = [meta.customerName, meta.customerEmail, meta.customerPhone].map(s => (s || '').trim()).filter(Boolean).join(' · ');

  const cifTotalTzs = result.totals.fob_tzs + result.totals.freight_tzs + result.totals.insurance_tzs;
  const tpaTotalTzs = result.totals.wharfage + result.totals.pid + result.totals.green_port_initiative;
  const freightInsTzs = result.totals.freight_tzs + result.totals.insurance_tzs;
  const totalUnits = result.items.reduce((s, x) => s + x.qty, 0);

  /**
   * A figure that may wrap, but only between thousands groups.
   *
   * The reference table's totals row carries the consignment sums, which are
   * two or three digits longer than any individual line — "252,920,590" in a
   * column sized for "3,806,286". With nowrap they ran straight into the
   * neighbouring column and printed as "252,920,59066,840,195": two real
   * numbers, unreadable as either. A zero-width space after each comma gives
   * the browser somewhere legitimate to break, so an oversized total stacks as
   * "252," / "920,590" with every digit group intact. It is a fallback — the
   * column widths below are sized so it should not be needed.
   */
  const grp = (n: number) => fmt(n).replace(/,/g, ',​');

  /**
   * The single-item report's charge-table shape, reused so a reader moving
   * between the two reports sees the same document rather than two dialects.
   * A zero-value line is dropped: a charge that was not incurred and a charge
   * that was not computed look identical as "TZS 0", and only one of those is
   * safe to quote from.
   */
  // Service charges carry VAT; statutory duties and the TBS per-BL fee do not.
  // Same split the single-item report uses, so the two agree line for line.
  const VAT_PCT = 18;
  type ChargeLine = [label: string, unit: string, rate: string, netTzs: number, vat?: boolean];
  const lineGross = ([, , , net, vat]: ChargeLine) => net + (vat ? net * VAT_PCT / 100 : 0);
  const linesTotal = (lines: ChargeLine[]) => lines.filter(l => l[3] > 0).reduce((s, l) => s + lineGross(l), 0);
  const chargeTable = (lines: ChargeLine[], totalLabel: string, emptyText?: string) => {
    const shown = lines.filter(([, , , net]) => net > 0);
    if (shown.length === 0) return `<div class="none">${emptyText ?? 'No charge on this consignment.'}</div>`;
    const anyVat = shown.some(l => l[4]);
    // Two column sets, each summing to exactly 100%.
    //
    // There was one set of four (46/17/12/25) and, when the VAT columns were
    // added, a fifth <col> cloned from the total's 25% — six columns rendered
    // against five declarations totalling 125%. With table-layout:fixed the
    // browser honoured that literally, so every charge card on the report ran
    // a quarter of its width past the card border: the Total column sat
    // outside the box and the header read "…SUB-TOTAL VAT TO".
    return `<table class="chg">
      <colgroup>${anyVat
        ? '<col class="c-d6"><col class="c-u6"><col class="c-r6"><col class="c-s6"><col class="c-v6"><col class="c-t6">'
        : '<col class="c-d"><col class="c-u"><col class="c-r"><col class="c-t">'}</colgroup>
      <thead><tr><th>Description</th><th>Unit</th><th class="r">Rate</th>${anyVat ? '<th class="r">Sub-total</th><th class="r">VAT</th>' : ''}<th class="r">Total</th></tr></thead>
      <tbody>${shown.map(l => {
        const [label, unit, rate, net, vat] = l;
        const vatTzs = vat ? net * VAT_PCT / 100 : 0;
        return `<tr><td>${label}</td><td class="u">${unit}</td><td class="r u">${rate}</td>${anyVat
          ? `<td class="r">TZS ${fmt(net)}</td><td class="r u">${vat ? 'TZS ' + fmt(vatTzs) : '&mdash;'}</td>` : ''
        }<td class="r v">TZS ${fmt(net + vatTzs)}</td></tr>`;
      }).join('')}
      </tbody>
      <tfoot><tr><td colSpan="${anyVat ? 5 : 3}">${totalLabel}</td><td class="r">TZS ${fmt(linesTotal(shown))}</td></tr></tfoot>
    </table>`;
  };

  /**
   * ICD and clearing-agent charges, from the tenant's own Rate Card.
   *
   * These were missing from the multi-item report entirely: it showed the
   * single ClearOS per-container default for ICD and an empty agency card,
   * while the single-item report itemised both. They are commercial rates, so
   * they only ever come from the Rate Card — never a guessed fallback.
   */
  const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const multiSize = lots.length > 1;
  const perLot = (code: string, label: string, vat: boolean): ChargeLine[] =>
    lots.flatMap(lot => {
      const rate = (sizeCards[lot.size] ?? rateCard)[code] ?? 0;
      if (rate <= 0) return [];
      return [[
        multiSize ? `${label} (${lot.size})` : label,
        lot.count > 1 ? `per container &times; ${lot.count}` : 'per container',
        usd(rate), rate * result.fx_rate * lot.count, vat,
      ] as ChargeLine];
    });

  const ICD_CODES: [string, string][] = [
    ['ICD_VERIFICATION', 'Customs Verification'],
    ['ICD_CORRIDOR', 'Corridor Levy'],
    ['ICD_HANDLING', 'Handling Charges'],
    ['ICD_MOVEMENT', 'ICD Movement Charges'],
    ['ICD_TRANSFER', 'Container Transfer'],
  ];
  const icdRows: ChargeLine[] = lots.length > 0
    ? ICD_CODES.flatMap(([code, label]) => perLot(code, label, true))
    : ICD_CODES.map(([code, label]) => [label, 'per consignment', usd(rateCard[code] ?? 0), (rateCard[code] ?? 0) * result.fx_rate, true] as ChargeLine);
  const icdRateCardTzs = linesTotal(icdRows);

  const clearanceRows: ChargeLine[] = [
    ['Documentation', 'per BL', usd(rateCard['CF_DOCUMENTATION'] ?? 0), (rateCard['CF_DOCUMENTATION'] ?? 0) * result.fx_rate, true],
    ['Verification', 'per BL', usd(rateCard['CF_VERIFICATION'] ?? 0), (rateCard['CF_VERIFICATION'] ?? 0) * result.fx_rate, true],
    ...(lots.length > 0
      ? perLot('CF_AGENCY_FEE', 'Agency Fees', true)
      : [['Agency Fees', 'per BL', usd(rateCard['CF_AGENCY_FEE'] ?? 0), (rateCard['CF_AGENCY_FEE'] ?? 0) * result.fx_rate, true] as ChargeLine]),
  ];
  const clearanceTzs = linesTotal(clearanceRows);

  // The itemised Rate Card figure replaces the single ClearOS default rather
  // than adding to it — they price the same thing. The default is still named
  // in the card note so the two can be reconciled.
  const icdShownTzs = icdRateCardTzs > 0 ? icdRateCardTzs : result.totals.destination;

  // VAT on the port and shipping service charges. The assessment engine
  // returns these net, but they are vatable services and the single-item
  // report has always shown them gross — leaving it out here would make the
  // two reports disagree on the same shipment, and would understate the cash
  // the importer has to find.
  const serviceVatTzs = (tpaTotalTzs + result.totals.shipping_do_fee) * VAT_PCT / 100;
  const tpaGrossTzs = tpaTotalTzs * (1 + VAT_PCT / 100);
  const shippingGrossTzs = result.totals.shipping_line_charge + result.totals.shipping_do_fee * VAT_PCT / 100;

  const commercialDeltaTzs = (icdShownTzs - result.totals.destination) + clearanceTzs + serviceVatTzs;
  const grandTotalTzs = result.totals.total + commercialDeltaTzs;
  /** What the importer actually has to fund: everything except the cargo's
   *  own FOB value. The grand total is the full landed cost and includes the
   *  cargo, so using it here would overstate the figure by the whole FOB. */
  const amountToPrepareTzs = grandTotalTzs - result.totals.fob_tzs;

  /** Largest-remainder apportionment by FOB share — the same basis the API
   *  uses, so the per-line figures still sum exactly to the total. */
  function apportion(totalTzs: number): number[] {
    const weights = result.items.map(it => it.fob_usd);
    const sum = weights.reduce((a, b) => a + b, 0);
    const target = Math.round(totalTzs);
    if (sum <= 0 || target === 0) return weights.map(() => 0);
    const raw = weights.map(w => (w / sum) * target);
    const floors = raw.map(Math.floor);
    let rem = target - floors.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac);
    const out = [...floors];
    for (let k = 0; rem > 0 && order.length; k++, rem--) out[order[k % order.length].i] += 1;
    for (let k = 0; rem < 0 && order.length; k++, rem++) out[order[k % order.length].i] -= 1;
    return out;
  }
  const commercialAlloc = apportion(commercialDeltaTzs);
  const lineLandedTzs = result.items.map((it, i) => it.landed_total + commercialAlloc[i]);

  /**
   * Only the taxes that actually apply. Excise, RDL and CPF are zero on most
   * consignments, and a row of zeros invites the reader to treat a real charge
   * as noise — while omitting one that *was* charged would understate the bill.
   * So a component is shown when it is non-zero, and VAT and duty always are,
   * since they are the two the reader is looking for.
   */
  const taxComponents: { label: string; amount: number }[] = [
    { label: 'Import duty', amount: result.totals.duty },
    { label: 'Excise duty', amount: result.totals.excise },
    { label: 'Railways Development Levy (RDL)', amount: result.totals.rdl },
    { label: 'Customs Processing Fee (CPF)', amount: result.totals.cpf },
    { label: 'VAT on imports', amount: result.totals.vat },
  ];
  const taxRows = taxComponents
    .filter(t => t.amount > 0 || /duty|vat/i.test(t.label))
    .map(t => `<div class="row"><span class="k">${t.label}</span><span class="v">TZS ${fmt(t.amount)}</span></div>`)
    .join('');

  /**
   * The reference pages. Every line's own assessment, so the single figure on
   * page 1 can be checked back to the goods it came from — and a landed cost
   * per unit, which is the number anyone pricing the goods actually needs.
   */
  const itemRows = result.items.map((it, i) => `
    <tr>
      <td>${it.line_no}</td>
      <td class="desc">${it.description}</td>
      <td class="code">${it.hs_code}</td>
      <td class="r unit">${it.qty}</td>
      <td class="r">${fmt(it.cif_tzs)}</td>
      <td class="r">${fmt(it.duty)}</td>
      <td class="r">${fmt(it.excise)}</td>
      <td class="r">${fmt(it.rdl)}</td>
      <td class="r">${fmt(it.cpf)}</td>
      <td class="r">${fmt(it.vat)}</td>
      <td class="r">${it.qty > 0 ? fmt(lineLandedTzs[i] / it.qty) : '—'}</td>
      <td class="r tot">${fmt(lineLandedTzs[i])}</td>
    </tr>
  `).join('');

  // Proof that the reference pages reconcile to the summary. Computed from the
  // rendered lines, not restated from the totals, so a mismatch would show.
  const lineSum = lineLandedTzs.reduce((s, x) => s + x, 0);
  const lineSumGap = lineSum - grandTotalTzs;

  w.document.write(`<!DOCTYPE html><html><head><title>Landed Cost Report (Multi-Item) &middot; ClearOS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--acc:#FF5E1A;--acc-600:#E8480A;--acc-050:#FFF4EC;--acc-100:#FFE0CE;--ink:#14181B;--ink-700:#2A3035;--slate:#5B646D;--slate-400:#8A939C;--line:#E5E9EC;--line-soft:#EEF2F4;--paper:#FFFFFF;--backdrop:#E7EBEE;--panel:#161A1E;--tint:#F7F9FA;--gold:#B8862F;}
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
.parties{display:grid;grid-template-columns:1fr 1fr;margin-top:16px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.parties .p{padding:13px 16px}
.parties .p:first-child{border-right:1px solid var(--line);background:var(--tint)}
.parties .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.parties .big{font-family:"Space Grotesk",sans-serif;font-size:15px;font-weight:600;margin-top:5px;color:var(--ink)}
.parties .kv{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;margin-top:6px}
.parties .kv .k{color:var(--slate)}
.parties .kv .v{color:var(--ink-700);font-weight:600;text-align:right}
.tbl-wrap{margin-top:18px}
/* table-layout:fixed with explicit widths is what stops a long product
   description stretching the table and squeezing the money columns until
   their digits collide. Without it, a 90-character line item pushed the
   figures into each other and they read as one continuous number. */
table.cost{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px}
table.cost col.c-no{width:4%}
table.cost col.c-desc{width:32%}
table.cost col.c-hs{width:11%}
table.cost col.c-qty{width:7%}
table.cost col.c-cif{width:13%}
table.cost col.c-duty{width:11%}
table.cost col.c-vat{width:11%}
table.cost col.c-tot{width:14%}
table.cost thead th{background:var(--ink);color:#fff;font-weight:600;font-size:9px;letter-spacing:.04em;text-transform:uppercase;padding:8px 9px;text-align:left;white-space:nowrap}
table.cost thead th.r{text-align:right}
table.cost td{padding:7px 9px;border-bottom:1px solid var(--line-soft);vertical-align:top}
/* Numbers never break mid-figure; text wraps instead of overflowing. */
table.cost td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.desc{color:var(--ink-700);font-weight:600;overflow-wrap:anywhere;word-break:break-word;hyphens:auto}
table.cost td .code{overflow-wrap:anywhere}
.code{font-family:"IBM Plex Mono",monospace;font-size:9.5px;font-weight:600;color:var(--acc-600)}
.unit{font-size:10px;color:var(--slate)}
td.tot{font-weight:700;color:var(--ink)}
tr.subt td{background:#FBFCFC;border-top:1.5px solid var(--ink-700);border-bottom:1px solid var(--line);padding:8px 9px;font-weight:700;color:var(--ink-700)}
tr.subt td.tot{color:var(--acc-600)}
.summary{margin-top:22px;display:grid;grid-template-columns:1.12fr 0.88fr;border-radius:14px;overflow:hidden;border:1px solid var(--line)}
.sum-l{padding:18px 18px;background:var(--tint)}
.sum-l h3{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:13px;display:flex;align-items:center}
.sum-l .row{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;padding:5.5px 0;border-bottom:1px solid var(--line-soft)}
.sum-l .row .k{color:var(--ink-700);min-width:0;overflow-wrap:break-word}
.sum-l .row .v{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.sum-l h3 .n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--acc);color:#fff;border-radius:5px;font-family:'Space Grotesk';font-size:10.5px;margin-right:8px}
.sum-l .row.head{color:var(--slate);font-weight:600;border-bottom:none;padding-bottom:2px;padding-top:9px;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase}
.sum-l .row.sub{padding-left:14px}
.sum-l .row.sub .k{color:var(--slate)}
.sum-l .row.cifrow{border-bottom:1.5px solid var(--ink);padding-bottom:9px;margin-bottom:3px}
.sum-l .row.cifrow .k{font-weight:700}
.sum-l .row.cifrow .v{font-family:"Space Grotesk",sans-serif;font-size:12px}
.sum-r .ddp .n{font-size:10px;color:#75897f;margin-top:3px}
.client{display:flex;align-items:baseline;gap:10px;margin-top:14px;padding:9px 14px;border:1px solid var(--line);border-radius:9px;background:var(--tint)}
.client .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700;flex:none}
.client .val{font-size:11.5px;color:var(--ink-700);font-weight:600}
.sum-r{background:var(--panel);color:#fff;padding:18px 18px;display:flex;flex-direction:column;justify-content:center}
.sum-r .prep-lab{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--acc-100);font-weight:700}
.sum-r .prep-tzs{font-family:"Space Grotesk",sans-serif;font-size:22px;font-weight:700;line-height:1.05;margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.sum-r .prep-usd{margin-top:6px;font-size:12px;color:#9fb2ac;font-variant-numeric:tabular-nums}
.sum-r .fx{margin-top:4px;font-size:10.5px;color:#75897f}
.sum-r .ddp{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.sum-r .ddp .l{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa39d;font-weight:600;white-space:nowrap}
.sum-r .ddp .v{font-family:"Space Grotesk",sans-serif;font-size:19px;font-weight:700;margin-top:5px;color:#FF8A4C;font-variant-numeric:tabular-nums;white-space:nowrap}
.foot{margin-top:20px}
.terms{width:100%}
.terms h4{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700;margin-bottom:8px}
.terms ul{list-style:none;font-size:10.5px;color:var(--slate);line-height:1.6;columns:2;column-gap:26px}
.terms ul li{padding-left:13px;position:relative;margin-bottom:3px;break-inside:avoid}
.terms ul li::before{content:"";position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.qr{margin-top:14px;display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--tint)}
.qr img{width:74px;height:74px;flex:none;display:block;border-radius:6px;background:#fff}
.qr-h{font-size:10.5px;font-weight:800;color:var(--ink);text-transform:uppercase;letter-spacing:.07em}
.qr-b{font-size:9.5px;color:var(--slate);line-height:1.5;margin-top:4px}
.qr-u{font-family:"IBM Plex Mono",monospace;font-size:8.5px;color:var(--acc-600);margin-top:5px;word-break:break-all}
.sign-row{margin-top:16px;border-top:1px solid var(--line);padding-top:11px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.sign .w{font-size:12px;font-weight:600;color:var(--ink-700)}
.sign .r{font-size:10.5px;color:var(--slate);margin-top:2px}
.sign-row .stamp{padding-top:7px;border-top:1px dashed var(--slate-400);font-size:10px;color:var(--slate-400);min-width:220px;text-align:right}
.legal{margin-top:14px;font-size:9.5px;color:var(--slate-400);line-height:1.55;background:var(--tint);border-radius:9px;padding:10px 13px}
.credit{margin-top:14px;padding-top:11px;border-top:2px solid var(--ink);position:relative;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--slate)}
.credit::after{content:"";position:absolute;left:0;top:-2px;width:88px;height:2px;background:var(--acc)}
.credit b{color:var(--ink-700)}
@media print{
  /* Page height is set dynamically by fitPageToContent() below so the export
     is one continuous page with real 14mm margins, matching the single-item
     report. This fallback only applies if that JS hasn't run yet. */
  @page{size:210mm 400mm;margin:14mm}
  html,body{background:#fff}
  .toolbar{display:none}
  .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
  .summary,.parties,.head,.terms,.client,.override{page-break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
/* Cost build-up cards. Same visual language as the summary block below them
   so the document reads as one costing rather than a table plus a footnote. */
.card{margin-top:10px;border:1px solid var(--line);border-radius:12px;padding:11px 14px;background:var(--paper);break-inside:avoid;page-break-inside:avoid}
.card h3{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:7px;display:flex;align-items:center}
.card h3 .n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--acc);color:#fff;border-radius:5px;font-family:'Space Grotesk';font-size:10.5px;margin-right:8px}
.card .lead{font-size:10.5px;color:var(--slate);margin:-4px 0 9px;line-height:1.55}
.card .row{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;padding:4.5px 0;border-bottom:1px solid var(--line-soft)}
.card .row .k{color:var(--ink-700);min-width:0;overflow-wrap:break-word}
.card .row .k .hint{color:var(--slate-400);font-size:9.5px}
.card .row .v{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.card .row.tot{border-bottom:none;border-top:1.5px solid var(--ink);margin-top:4px;padding-top:9px}
.card .row.tot .k{font-weight:700}
.card .row.tot .v{font-weight:800;color:var(--acc-600);font-size:13px}
.card .note{margin-top:7px;font-size:9px;line-height:1.5;color:var(--slate);background:var(--tint);border-radius:7px;padding:6px 9px}
/* Reference pages: the working behind the summary, started on a fresh sheet. */
.ref{margin-top:26px;page-break-before:always;break-before:page}
.ref-head h3{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:5px}
.ref-head p{font-size:10.5px;color:var(--slate);line-height:1.6;margin-bottom:12px;max-width:150mm}
table.ref-t{font-size:8px}
/* Twelve columns of headings do not fit a 155mm sheet on one line, and
   nowrap made them run into each other and clip — "LANDED / UNIT" and
   "LINE LANDED TOTAL" printed as "LANDED / UNITLINE LANDED TOT". They wrap
   instead, at spaces only: word-break stays normal so no heading is ever
   split mid-word, and hyphens are off so the browser cannot invent one. */
table.ref-t thead th{font-size:8px;padding:7px 5px;white-space:normal;word-break:normal;overflow-wrap:normal;hyphens:none;line-height:1.25;vertical-align:bottom}
table.ref-t td{padding:4px 3px}
/* Widths are set by the totals row, not by a typical line: the consignment
   sums are two or three digits longer than anything above them, and a column
   sized for "3,806,286" printed "252,920,590" straight over its neighbour.
   The money columns are sized to hold a nine-figure total at this font; the
   description gives up the room, since it is the one column that can wrap. */
table.ref-t col.c-no{width:3%}
table.ref-t col.c-desc{width:15.5%}
table.ref-t col.c-hs{width:8%}
table.ref-t col.c-qty{width:4.5%}
table.ref-t col.c-cif{width:9.5%}
table.ref-t col.c-duty{width:8.5%}
table.ref-t col.c-ex{width:6.5%}
table.ref-t col.c-rdl{width:7%}
table.ref-t col.c-cpf{width:7.5%}
table.ref-t col.c-vat{width:9.5%}
table.ref-t col.c-unit{width:9.5%}
table.ref-t col.c-tot{width:11%}
/* The totals row is the widest content in the table. It may wrap — the
   figures carry a break opportunity after each comma — but never mid-group. */
table.ref-t tr.subt td{white-space:normal;word-break:normal;overflow-wrap:normal;line-height:1.3}
.ref-foot{margin-top:10px;font-size:10px;line-height:1.6;color:var(--ink-700);background:var(--tint);border-left:3px solid var(--acc);border-radius:0 8px 8px 0;padding:9px 12px}
.ref-foot.bad{background:#FEF2F2;border-left-color:#DC2626;color:#7F1D1D;font-weight:600}
/* ── A4 pagination ───────────────────────────────────────────────────────
   A consignment report is a multi-sheet document: cover and costing, then
   sign-off, then notes, then the per-line reference. Each starts on its own
   sheet. A break-before is only applied to a section that actually has
   content, so an absent QR block or an empty notes list cannot leave a blank
   sheet behind. */
@page{size:A4;margin:14mm}
.chg{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10.5px;margin-top:2px}
/* Four columns: description, unit, rate, total. Sums to 100%. */
.chg col.c-d{width:46%}
.chg col.c-u{width:17%}
.chg col.c-r{width:12%}
.chg col.c-t{width:25%}
/* Six, when the charge carries VAT: + sub-total and VAT. Also 100% — the
   figures are nowrap, so the money columns are sized to hold "TZS 1,059,435"
   and the description is the one that wraps. */
.chg col.c-d6{width:29%}
.chg col.c-u6{width:13.5%}
.chg col.c-r6{width:13%}
.chg col.c-s6{width:15.5%}
.chg col.c-v6{width:13%}
.chg col.c-t6{width:16%}
.chg thead th{font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--slate);font-weight:700;text-align:left;padding:5px 7px;border-bottom:1px solid var(--line)}
.chg thead th.r{text-align:right}
.chg td{padding:4.5px 7px;border-bottom:1px solid var(--line-soft);vertical-align:top;overflow-wrap:anywhere}
.chg td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.chg td.u{color:var(--slate);font-style:italic}
.chg td.v{font-weight:600}
.chg tfoot td{padding:8px 7px;border-top:1.5px solid var(--ink);border-bottom:none;font-weight:700;background:var(--acc-050)}
.chg tfoot td.r{text-align:right;color:var(--acc-600);font-size:12px;white-space:nowrap}
.card .none{font-size:10.5px;color:var(--slate);font-style:italic;padding:4px 0}
.summary{break-before:page;page-break-before:always}
.notes-page{break-before:page;page-break-before:always}
.ref{break-before:page;page-break-before:always;margin-top:0}
.foot{break-before:auto;page-break-before:auto}
.notes-page .terms{break-inside:auto;page-break-inside:auto}
/* Repeat the reference header on every sheet the table spills onto, and never
   split a line's own row across two of them. */
table.ref-t thead{display:table-header-group}
table.ref-t tfoot{display:table-footer-group}
table.ref-t tr{break-inside:avoid;page-break-inside:avoid}
.ref-head{break-after:avoid;page-break-after:avoid}
@media print{
  html,body{background:#fff}
  .toolbar{display:none}
  .sheet{box-shadow:none;margin:0;padding:0;width:auto;max-width:none;border-radius:0}
  /* A trailing margin on the last block is enough to push an otherwise-empty
     sheet into existence, which is exactly the blank page to avoid. */
  .sheet > *:last-child{margin-bottom:0}
  .ref-foot{break-inside:avoid;page-break-inside:avoid}
}
</style></head><body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">Download / Print PDF</button>
</div>

<div class="sheet">
  <header class="head">
    <div class="brand">
      <div class="mark"><svg viewBox="7 20 111 110" fill="none"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z" fill="#fff"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z" fill="#fff"/></svg></div>
      <div>
        <div class="name">Clear<span>OS</span></div>
        <div class="role">Customs &amp; Landed Cost Intelligence</div>
        <div class="addr">Clearing agent: <b>${company.name}</b>${company.businessType ? ` &middot; ${company.businessType}` : ''}<br>${companyAddrLine}${companyAddrLine ? ' &middot; ' : ''}${company.email || ''}</div>
      </div>
    </div>
    <div class="doc">
      <div class="kick">Multi-Item Estimate</div><h1>Landed Cost</h1>
      <div class="pi">Ref <span class="mono">MULTI-${result.items.length}ITEMS-${now.replace(/\s/g, '')}</span><br>Generated <b>${now}</b></div>
    </div>
  </header>

  ${customerLine ? `<section class="client"><span class="lab">Prepared for</span><span class="val">${customerLine}</span></section>` : ''}

  <section class="parties">
    <div class="p"><div class="lab">Cargo</div><div class="big">${result.items.length} Line Items</div>
      <div class="kv"><span class="k">FX Rate</span><span class="v">1 USD = TZS ${result.fx_rate.toLocaleString()}</span></div></div>
    <div class="p"><div class="lab">Shipment</div>
      <div class="kv"><span class="k">Mode</span><span class="v">${modeLabel}</span></div>
      <div class="kv"><span class="k">Destination basis</span><span class="v">${result.destination_charge_label}</span></div>
      <div class="kv"><span class="k">Destination</span><span class="v">${destinationLabel}</span></div></div>
  </section>

  <!-- The consignment is presented as one costing, exactly like the
       single-item report: cargo value, then what is added to it, in the order
       the money is actually incurred. The per-line arithmetic that produced
       these figures is not deleted — it moves to the reference pages after the
       summary, where it belongs for checking rather than for reading. -->
  <section class="card">
    <h3><span class="n">1</span>Cargo Value &mdash; FOB</h3>
    <div class="row"><span class="k">Goods value, ${result.items.length} line item${result.items.length === 1 ? '' : 's'} <span class="hint">${totalUnits.toLocaleString('en-US')} units</span></span><span class="v">TZS ${fmt(result.totals.fob_tzs)}</span></div>
    <div class="row tot"><span class="k">Total FOB</span><span class="v">USD ${result.totals.fob_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  </section>

  <section class="card">
    <h3><span class="n">2</span>Freight &amp; Insurance &mdash; to ${destinationShort}</h3>
    <div class="row"><span class="k">Freight</span><span class="v">TZS ${fmt(result.totals.freight_tzs)}</span></div>
    <div class="row"><span class="k">Insurance</span><span class="v">TZS ${fmt(result.totals.insurance_tzs)}</span></div>
    <div class="row tot"><span class="k">CIF ${destinationShort} &mdash; the customs value</span><span class="v">TZS ${fmt(cifTotalTzs)}</span></div>
  </section>

  <section class="card">
    <h3><span class="n">3</span>Duties &amp; Taxes &mdash; TRA</h3>
    <p class="lead">Assessed per line against each item's own HS code and rates, then totalled here. The line-by-line assessment is on the reference pages.</p>
    ${taxRows}
    <div class="row tot"><span class="k">Total duties &amp; taxes payable to TRA</span><span class="v">TZS ${fmt(result.totals.statutory_total)}</span></div>
    <div class="note">Effective rate across the consignment: <b>${result.totals.effective_statutory_rate_pct.toFixed(2)}%</b> of CIF. Individual lines differ &mdash; a line's own rate is on the reference pages.</div>
  </section>

  <section class="card">
    <h3><span class="n">4</span>TPA Charges</h3>
    ${chargeTable([
      ['TPA Wharfage', 'CIF', '1.6%', result.totals.wharfage, true],
      ['Port Infrastructure Development', 'Duties &amp; taxes', '4.5%', result.totals.pid, true],
      [result.totals.green_port_label, 'Flat', '&mdash;', result.totals.green_port_initiative, true],
    ], 'Total TPA Charges')}
    <div class="note">Wharfage, Port Infrastructure Development and Green Port Initiatives are published TPA rates.</div>
  </section>

  <section class="card">
    <h3><span class="n">5</span>ICD / Destination Charges</h3>
    ${icdRateCardTzs > 0
      ? chargeTable(icdRows, 'Total ICD Charges')
      : chargeTable([[result.destination_charge_label, 'per consignment', '&mdash;', result.totals.destination]], 'Total ICD Charges')}
    <div class="note">${icdRateCardTzs > 0
      ? `Sourced from your Rate Card &mdash; a commercial estimate, not a TRA assessment. ClearOS separately computed a single ICD/destination charge of TZS ${fmt(result.totals.destination)} (${result.destination_charge_label}) for reference &mdash; the itemised figures above are what this report uses, not both.`
      : `Nothing itemised in your Rate Card yet, so this is ClearOS's own per-container default. Populate Customs Verification, Corridor Levy, Handling Charges, ICD Movement and Container Transfer in Tools &rarr; Rate Card to price this properly.`}</div>
  </section>

  <section class="card">
    <h3><span class="n">6</span>TBS Charges</h3>
    ${chargeTable([
      ['Physical Verification Fee (DI)', 'per BL', '&mdash;', 150000],
      ['Service Fee', 'per BL', '&mdash;', 30000],
    ], 'Total TBS Charges')}
    <div class="note">Flat reference rates from the clearing agent's own rate sheet, applied per consignment and not scaled by CIF value or quantity. Verify against your actual TBS invoice.</div>
  </section>

  <section class="card">
    <h3><span class="n">7</span>Shipping Line Charges</h3>
    ${chargeTable([
      ['Delivery Order Fee', 'per BL', '&mdash;', result.totals.shipping_do_fee, true],
      ...(result.totals.shipping_handling_fee > 0 ? [['Handling / TASAC Fee', 'per container', '&mdash;', result.totals.shipping_handling_fee] as ChargeLine] : []),
    ], 'Total Shipping Line Charges')}
    <div class="note">Reference rates from the clearing agent's own rate sheet, not an independently verified shipping-line tariff &mdash; verify against your actual invoice.</div>
  </section>

  <section class="card">
    <h3><span class="n">8</span>Clearance &amp; Other Agency Charges</h3>
    ${chargeTable(clearanceRows, 'Total Clearance Charges',
      'No agency fee entered yet &mdash; set Documentation, Verification and the Agency Fee in Tools &rarr; Rate Card before quoting a client.')}
    <div class="note">Documentation, Verification and the TASAC agency fee are sourced from your Rate Card &mdash; commercial rates specific to the job, not a government tariff. Any GCLA, TMDA or CAMARTEC charge is <b>not included</b>; add it from the Rate Card if it applies to this cargo. ${allNotes.some(n => /pvoc|inspection/i.test(n)) ? 'Several lines on this consignment require PVoC or Destination Inspection &mdash; see the notes.' : ''}</div>
  </section>

  <section class="summary">
    <div class="sum-l">
      <h3><span class="n">5</span>Landed Cost Summary</h3>
      <div class="row cifrow"><span class="k">CIF ${destinationShort} <span style="color:var(--slate);font-weight:400;font-size:8.5px">cargo, freight, insurance</span></span><span class="v">TZS ${fmt(cifTotalTzs)}</span></div>
      <div class="row"><span class="k">1&nbsp; Freight &amp; insurance — export country</span><span class="v">TZS ${fmt(freightInsTzs)}</span></div>
      <div class="row head"><span class="k">2&nbsp; Amount to pay in Tanzania</span><span></span></div>
      <div class="row sub"><span class="k">Duties &amp; taxes — TRA (incl. VAT)</span><span class="v">TZS ${fmt(result.totals.statutory_total)}</span></div>
      <div class="row sub"><span class="k">Port &amp; handling — TPA</span><span class="v">TZS ${fmt(tpaGrossTzs)}</span></div>
      <div class="row sub"><span class="k">ICD / destination charges</span><span class="v">TZS ${fmt(icdShownTzs)}</span></div>
      ${clearanceTzs > 0 ? `<div class="row sub"><span class="k">Clearance &amp; agency charges</span><span class="v">TZS ${fmt(clearanceTzs)}</span></div>` : ''}
      <div class="row sub"><span class="k">TBS charges</span><span class="v">TZS ${fmt(result.totals.tbs_charge)}</span></div>
      <div class="row sub"><span class="k">Local shipping line charges</span><span class="v">TZS ${fmt(shippingGrossTzs)}</span></div>
    </div>
    <div class="sum-r">
      <div class="prep-lab">Total Amount to Prepare</div>
      <div class="prep-tzs">TZS ${fmt(amountToPrepareTzs)}</div>
      <div class="prep-usd">USD ${(amountToPrepareTzs / result.fx_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="fx">@ USD &rarr; TZS ${result.fx_rate.toLocaleString('en-US')}</div>
      <div class="ddp">
        <div class="l">Total Landed Cost — DDP ${destinationShort} <span style="text-transform:none;letter-spacing:0">(incl. VAT)</span></div>
        <div class="v">TZS ${fmt(grandTotalTzs)}</div>
        <div class="n">USD ${(grandTotalTzs / result.fx_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = Cargo TZS ${fmt(result.totals.fob_tzs)} + costs to prepare TZS ${fmt(amountToPrepareTzs)}</div>
      </div>
    </div>
  </section>

  <!-- Sign-off travels with the summary: the signature and the disclaimer
       belong on the same sheet as the figure being signed off. -->
  <div class="foot">
    ${meta.qrDataUri ? `<div class="qr">
      <img src="${meta.qrDataUri}" alt="Scan to open this estimate">
      <div class="qr-t">
        <div class="qr-h">Scan for the full report</div>
        <div class="qr-b">Opens this estimate on ${company.name}'s ClearOS workspace, where you can download it as a PDF. You'll be asked for an email address so we can send you the follow-up.</div>
        ${meta.shareUrl ? `<div class="qr-u">${meta.shareUrl}</div>` : ''}
      </div>
    </div>` : ''}
    <div class="sign-row">
      <div class="sign"><div class="w">For ${company.name}</div>
        <div class="r">${company.businessType || 'Customs Clearing & Forwarding Agent'}</div></div>
      <div class="stamp">Authorised signature &amp; company stamp</div>
    </div>
    <div class="legal">This is a decision-support estimate, not a customs assessment or tax invoice. Final duties, taxes and charges are those determined by the Tanzania Revenue Authority on the lodged declaration.</div>
    <div class="credit"><span>Prepared on <b>ClearOS</b> &middot; Hudumika Platform</span><span>Multi-Item &middot; Confidential</span></div>
  </div>

  <section class="notes-page">
    <div class="terms">
      <h4>Notes &amp; Assumptions</h4>
      <ul>${allNotes.map(w => `<li>${w}</li>`).join('') || '<li>All items computed according to TRA EAC CET 2026 tariff schedule.</li>'}</ul>
    </div>
  </section>

  <!-- Reference pages. Deliberately after the summary and the notes: this is
       the working, not the answer. -->
  <section class="ref">
    <div class="ref-head">
      <h3>Reference &mdash; Per-Line Assessment</h3>
      <p>Every line of the consignment, assessed against its own HS code. All figures in TZS. The Line Landed Total column sums to the total landed cost on the summary above.</p>
    </div>
    <div class="tbl-wrap">
    <table class="cost ref-t">
      <colgroup><col class="c-no"><col class="c-desc"><col class="c-hs"><col class="c-qty"><col class="c-cif"><col class="c-duty"><col class="c-ex"><col class="c-rdl"><col class="c-cpf"><col class="c-vat"><col class="c-unit"><col class="c-tot"></colgroup>
      <thead><tr>
        <th>#</th><th>Description</th><th>HS Code</th><th class="r">Qty</th><th class="r">CIF</th>
        <th class="r">Import</th><th class="r">Excise</th><th class="r">RDL</th><th class="r">CPF</th><th class="r">VAT</th>
        <th class="r">Landed / unit</th><th class="r">Line Landed Total</th>
      </tr></thead>
      <tbody>${itemRows}
      <tr class="subt">
        <td colSpan="3" class="desc">Totals (${result.items.length} line${result.items.length === 1 ? '' : 's'})</td>
        <td class="r unit">${grp(totalUnits)}</td>
        <td class="r">${grp(result.totals.cif_tzs)}</td>
        <td class="r">${grp(result.totals.duty)}</td>
        <td class="r">${grp(result.totals.excise)}</td>
        <td class="r">${grp(result.totals.rdl)}</td>
        <td class="r">${grp(result.totals.cpf)}</td>
        <td class="r">${grp(result.totals.vat)}</td>
        <td class="r">&mdash;</td>
        <td class="r tot">${grp(lineSum)}</td>
      </tr>
      </tbody>
    </table>
    </div>
    <div class="ref-foot ${Math.abs(lineSumGap) > 1 ? 'bad' : ''}">
      ${Math.abs(lineSumGap) > 1
        ? `These lines sum to TZS ${fmt(lineSum)} against a summary total of TZS ${fmt(grandTotalTzs)} — a difference of TZS ${fmt(Math.abs(lineSumGap))}. Do not lodge on these figures; re-run the calculation.`
        : `Reconciled: the ${result.items.length} lines above sum to TZS ${fmt(lineSum)}, matching the total landed cost on the summary.`}
    </div>
  </section>
</div>

<script>
/** This report prints on real A4, not the single continuous sheet the
 *  single-item report uses. A 206-line consignment produces a metres-long
 *  page that no printer or PDF reader paginates sensibly, and the reference
 *  table has to break across sheets with its header repeated. Page breaks are
 *  declared in CSS; the only thing left to do here is wait for fonts, since
 *  measuring against fallback metrics puts the breaks in the wrong places. */
var didPrint = false;
function goPrint(){ if(didPrint) return; didPrint = true; requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.print(); }); }); }
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(goPrint);
  setTimeout(goPrint, 2000);
} else {
  setTimeout(goPrint, 700);
}
</script>
</body></html>`);
  w.document.close();
  w.focus();
}

// ── Step Indicator (vertical on desktop, horizontal on mobile) ─────────────────