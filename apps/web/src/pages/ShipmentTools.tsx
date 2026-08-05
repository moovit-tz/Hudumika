import React, { useState, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../lib/watermark.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

// ── Tanzania customs constants ────────────────────────────────────────────────

const USD_TO_TZS = 2540;

function chapterDutyRate(hs: string): number {
  const ch = parseInt(hs.slice(0, 2), 10);
  if (isNaN(ch)) return 25;
  if (ch >= 1  && ch <= 24) return 25;  // food / agri
  if (ch >= 25 && ch <= 27) return 5;   // minerals / fuels
  if (ch >= 28 && ch <= 38) return 10;  // chemicals
  if (ch >= 39 && ch <= 40) return 25;  // plastics / rubber
  if (ch >= 41 && ch <= 43) return 10;  // leather / hides
  if (ch >= 44 && ch <= 46) return 10;  // wood / cork
  if (ch >= 47 && ch <= 49) return 25;  // paper
  if (ch >= 50 && ch <= 63) return 25;  // textiles
  if (ch >= 64 && ch <= 67) return 25;  // footwear
  if (ch >= 68 && ch <= 70) return 25;  // stone / ceramics / glass
  if (ch === 71)             return 0;   // precious metals / gems
  if (ch >= 72 && ch <= 83) return 10;  // base metals
  if (ch >= 84 && ch <= 85) return 10;  // machinery / electronics
  if (ch === 87)             return 25;  // motor vehicles
  if (ch >= 86 && ch <= 89) return 10;  // other transport
  if (ch >= 90 && ch <= 92) return 10;  // instruments
  return 25;
}

const EAC_ORIGINS = new Set(['KE', 'UG', 'RW', 'BI', 'SS', 'TZ']);

// ── Types ─────────────────────────────────────────────────────────────────────

interface LandedResult {
  cifTzs: number; dutyRate: number;
  duty: number; vat: number; rdl: number; cpf: number;
  icd: number; wharfage: number; total: number; perUnit: number;
}

interface ComplianceResult {
  pvoc:     { required: boolean; note: string };
  di:       { required: boolean; note: string };
  camartec: { required: boolean; note: string };
  gcla:     { required: boolean; note: string };
  tra:      { required: boolean; note: string };
}

interface PenaltyResult {
  underDeclaration: number; lateInterest: number;
  noPvocFine: number; noDiFine: number; total: number;
  basis: string[];
}

// ── Calculator logic ──────────────────────────────────────────────────────────
//
// NOTE: this is a rough client-side estimator, NOT the real landed-cost
// calculation. It diverges from POST /v1/customs/landed-cost
// (customs.service.ts) in ways a rate tweak can't close: a hardcoded FX rate,
// duty guessed from the HS chapter instead of the tariff table, and no
// excise / Port Infrastructure Development / Green Port / TBS / shipping-line
// lines at all. Statutory rates below are kept in step with the backend so it
// isn't additionally wrong, but anything quoted to a customer should come
// from the ClearOS Landed Cost Calculator, which calls the API.

function calcLanded(
  cifUsd: number, hs: string, qty: number,
  container: '20ft' | '40ft' | 'lcl', isAir: boolean,
): LandedResult {
  const cifTzs  = cifUsd * USD_TO_TZS;
  const dutyRate = chapterDutyRate(hs);
  const duty    = cifTzs * (dutyRate / 100);
  const rdl     = cifTzs * 0.02;
  const cpf     = Math.max(cifTzs * 0.01, 5000);
  const vat     = (cifTzs + duty) * 0.18;
  const icd     = isAir ? 0 : container === '20ft' ? 450_000 : container === '40ft' ? 560_000 : 0;
  const wharfage = isAir ? 0 : cifTzs * 0.016;
  const total   = cifTzs + duty + vat + rdl + cpf + icd + wharfage;
  return { cifTzs, dutyRate, duty, vat, rdl, cpf, icd, wharfage, total, perUnit: qty > 1 ? total / qty : total };
}

function checkCompliance(hs: string, origin: string): ComplianceResult {
  const ch      = parseInt(hs.slice(0, 2), 10);
  const isEAC   = EAC_ORIGINS.has(origin.toUpperCase().trim());
  const isFood  = ch >= 1 && ch <= 24;
  const isChem  = ch >= 28 && ch <= 38;
  const isPharma = ch === 30;
  const isMach  = (ch >= 82 && ch <= 84) || ch === 87;
  const isManuf = ch >= 28 && ch !== 71;

  return {
    pvoc: {
      required: !isEAC && isManuf,
      note: isEAC
        ? 'EAC origin — PVoC/COC not required under the EAC Customs Union Protocol'
        : 'TBS-regulated import requires a Certificate of Conformity before shipment',
    },
    di: {
      required: !isEAC,
      note: isEAC
        ? 'EAC origin — Destination Inspection waived'
        : 'Destination Inspection required by TRA for all non-EAC imports (COTECNA)',
    },
    camartec: {
      required: isMach,
      note: 'Agricultural machinery & implements require CAMARTEC type-approval certificate',
    },
    gcla: {
      required: isFood || isChem || isPharma,
      note: 'Food, beverages, chemicals and pharmaceuticals require GCLA import permit',
    },
    tra: {
      required: true,
      note: 'All imports require TRA customs entry (C17), duty assessment and payment',
    },
  };
}

function calcPenalty(
  violation: string, declaredUsd: number, actualUsd: number,
  dutyRate: number, monthsLate: number, noPvoc: boolean, noDi: boolean,
): PenaltyResult {
  const basis: string[] = [];
  const dutyShortfall = Math.max(0, (actualUsd - declaredUsd) * USD_TO_TZS * dutyRate / 100);
  let underDeclaration = 0, lateInterest = 0, noPvocFine = 0, noDiFine = 0;

  if ((violation === 'under_declaration' || violation === 'misclassification') && dutyShortfall > 0) {
    underDeclaration = violation === 'under_declaration'
      ? dutyShortfall * 3
      : dutyShortfall * 1.5;
    basis.push(
      violation === 'under_declaration'
        ? `Under-declaration: 3× duty shortfall (TZS ${fmt(dutyShortfall)}) — CEMA CAP 403 s.133`
        : `Mis-classification: duty difference + 50% surcharge — CEMA s.128`,
    );
  }

  if (monthsLate > 0) {
    const dutyOwed = declaredUsd * USD_TO_TZS * dutyRate / 100;
    lateInterest = dutyOwed * 0.02 * monthsLate;
    if (lateInterest > 0) basis.push(`Late payment: 2%/month × ${monthsLate} months on TZS ${fmt(dutyOwed)}`);
  }

  if (noPvoc) {
    noPvocFine = 10_000_000;
    basis.push('No PVoC/COC: TZS 10,000,000 fine — TBS Act CAP 130 + risk of seizure');
  }
  if (noDi) {
    noDiFine = 5_000_000;
    basis.push('No Destination Inspection permit: TZS 5,000,000 fine — TRA Regulations');
  }

  return {
    underDeclaration, lateInterest, noPvocFine, noDiFine,
    total: underDeclaration + lateInterest + noPvocFine + noDiFine,
    basis,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt   = (n: number) => Math.round(n).toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function printReport(
  hs: string, cifUsd: string, qty: string,
  landed: LandedResult | null,
  comp: ComplianceResult | null,
  pen: PenaltyResult | null,
  summary: string,
) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  w.document.write(`<!DOCTYPE html><html><head><title>ClearOS Customs Report</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#111;max-width:800px;margin:0 auto}
h1{font-size:22px;font-weight:800;margin:0 0 4px}
.meta{font-size:12px;color:#64748b;margin-bottom:28px}
h2{font-size:13px;font-weight:700;color:#0b7264;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #0b726440;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}
td:last-child{text-align:right;font-weight:600}
tr.total td{background:#0b72640d;font-weight:800;font-size:14px}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
.req{background:#fee2e2;color:#dc2626}
.ok{background:#ecfdf5;color:#059669}
.red{color:#dc2626}
.basis{background:#fff7ed;padding:14px;border-radius:8px;border:1px solid #fed7aa;margin-top:8px;font-size:12px;line-height:1.9}
pre{white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;line-height:1.7;border:1px solid #e2e8f0}
.footer{margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
@media print{body{padding:16px}}
</style>
</head><body>
<h1>ClearOS — Customs Report</h1>
<p class="meta">Generated ${now} &nbsp;·&nbsp; HS Code: ${hs || '—'}</p>`);

  if (landed) {
    w.document.write(`<h2>Landed Cost Calculator</h2><table>
<tr><td>CIF Value (USD)</td><td>${fmtUsd(parseFloat(cifUsd))} = TZS ${fmt(landed.cifTzs)}</td></tr>
<tr><td>Import Duty (${landed.dutyRate}% EAC CET)</td><td>TZS ${fmt(landed.duty)}</td></tr>
<tr><td>VAT 18% (on CIF + Duty)</td><td>TZS ${fmt(landed.vat)}</td></tr>
<tr><td>Railway Development Levy (2%)</td><td>TZS ${fmt(landed.rdl)}</td></tr>
<tr><td>Customs Processing Fee (0.6%)</td><td>TZS ${fmt(landed.cpf)}</td></tr>
<tr><td>ICD Charges</td><td>TZS ${fmt(landed.icd)}</td></tr>
<tr><td>Wharfage (TPA 1.6%)</td><td>TZS ${fmt(landed.wharfage)}</td></tr>
<tr class="total"><td>Total Landed Cost</td><td>TZS ${fmt(landed.total)}</td></tr>
${parseInt(qty) > 1 ? `<tr class="total"><td>Per Unit (÷ ${qty})</td><td>TZS ${fmt(landed.perUnit)}</td></tr>` : ''}
</table>`);
  }

  if (comp) {
    const COMP_ITEMS = [
      { l: 'PVoC / COC',         r: comp.pvoc     },
      { l: 'DI Inspection',      r: comp.di       },
      { l: 'CAMARTEC Approval',  r: comp.camartec },
      { l: 'GCLA Permit',        r: comp.gcla     },
      { l: 'TRA Customs Entry',  r: comp.tra      },
    ];
    w.document.write(`<h2>Compliance Checker</h2><table>${
      COMP_ITEMS.map(i => `<tr><td>${i.l}</td><td><span class="badge ${i.r.required ? 'req' : 'ok'}">${i.r.required ? 'REQUIRED' : 'NOT REQUIRED'}</span> — ${i.r.note}</td></tr>`).join('')
    }</table>`);
  }

  if (pen && pen.total > 0) {
    w.document.write(`<h2>Penalty Estimate</h2><table>
${pen.underDeclaration > 0 ? `<tr><td>Under-declaration / Mis-classification</td><td class="red">TZS ${fmt(pen.underDeclaration)}</td></tr>` : ''}
${pen.lateInterest > 0    ? `<tr><td>Late Payment Interest</td><td class="red">TZS ${fmt(pen.lateInterest)}</td></tr>` : ''}
${pen.noPvocFine > 0      ? `<tr><td>No PVoC Fine</td><td class="red">TZS ${fmt(pen.noPvocFine)}</td></tr>` : ''}
${pen.noDiFine > 0        ? `<tr><td>No DI Permit Fine</td><td class="red">TZS ${fmt(pen.noDiFine)}</td></tr>` : ''}
<tr class="total"><td>Total Estimated Penalty</td><td class="red">TZS ${fmt(pen.total)}</td></tr>
</table>
<div class="basis"><strong>Legal Basis:</strong><br>${pen.basis.join('<br>')}</div>`);
  }

  if (summary) {
    w.document.write(`<h2>AI Summary</h2><pre>${summary}</pre>`);
  }

  w.document.write(`${HUDUMIKA_FOOTER_HTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolCard({ title, desc, tags, color, icon, onRun, children }: {
  title: string; desc: string; tags: string[];
  color: string; icon: IconName; onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', background: color + '0a' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={icon} size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {tags.map(t => <span key={t} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: color + '18', color }}>{t}</span>)}
        </div>
      </div>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onRun}
            style={{ padding: 'var(--ds-btn-py) 24px', borderRadius: 'var(--r)', border: 'none', background: color, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'opacity .15s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}
            onMouseOver={e => (e.currentTarget.style.opacity = '.85')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}>
            <Icon name="zap" size={13} color="#fff" />
            Calculate
          </button>
        </div>
      </div>
    </div>
  );
}

function TF({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>
        {label}{hint && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--ink4)', fontSize: 10.5 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Seg({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: 'var(--ds-btn-py-sm) 13px', borderRadius: 'var(--r)', border: `1.5px solid ${active ? 'var(--teal)' : 'var(--border)'}`, background: active ? 'var(--teal-l)' : 'var(--white)', color: active ? 'var(--teal)' : 'var(--ink3)', fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
      {label}
    </button>
  );
}

function RRow({ label, value, hi, red }: { label: string; value: string; hi?: boolean; red?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: hi ? 13 : 12, color: 'var(--ink2)', fontWeight: hi ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: hi ? 14 : 12.5, fontWeight: 700, color: red ? '#dc2626' : hi ? 'var(--teal)' : 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function ResultBox({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 10, border: `1px solid ${color}25`, marginTop: 4 }}>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const ShipmentTools: React.FC = () => {
  // ── Landed Cost inputs
  const [lcCif,       setLcCif]       = useState('');
  const [lcHs,        setLcHs]        = useState('');
  const [lcQty,       setLcQty]       = useState('1');
  const [lcContainer, setLcContainer] = useState<'20ft' | '40ft' | 'lcl'>('20ft');
  const [lcAir,       setLcAir]       = useState(false);
  const [lcResult,    setLcResult]    = useState<LandedResult | null>(null);

  // ── Compliance inputs
  const [ccHs,     setCcHs]     = useState('');
  const [ccOrigin, setCcOrigin] = useState('CN');
  const [ccResult, setCcResult] = useState<ComplianceResult | null>(null);

  // ── Penalty inputs
  const [pViolation, setPViolation] = useState('under_declaration');
  const [pDeclared,  setPDeclared]  = useState('');
  const [pActual,    setPActual]    = useState('');
  const [pMonths,    setPMonths]    = useState('0');
  const [pNoPvoc,    setPNoPvoc]    = useState(false);
  const [pNoDi,      setPNoDi]      = useState(false);
  const [pResult,    setPResult]    = useState<PenaltyResult | null>(null);

  // ── Summary
  const [summary,  setSummary]  = useState('');
  const [aiPending, setAiPending] = useState(false);

  // Shared HS code — sync from landed cost to penalty
  const activeHs = lcHs || ccHs;

  const runLanded = useCallback(() => {
    const cif = parseFloat(lcCif);
    if (!cif || cif <= 0 || !lcHs.trim()) return;
    setLcResult(calcLanded(cif, lcHs, parseInt(lcQty) || 1, lcContainer, lcAir));
  }, [lcCif, lcHs, lcQty, lcContainer, lcAir]);

  const runCompliance = useCallback(() => {
    if (!ccHs.trim()) return;
    setCcResult(checkCompliance(ccHs, ccOrigin));
  }, [ccHs, ccOrigin]);

  const runPenalty = useCallback(() => {
    const dc = parseFloat(pDeclared) || 0;
    const ac = parseFloat(pActual) || dc;
    const dr = chapterDutyRate(activeHs);
    setPResult(calcPenalty(pViolation, dc, ac, dr, parseInt(pMonths) || 0, pNoPvoc, pNoDi));
  }, [pViolation, pDeclared, pActual, activeHs, pMonths, pNoPvoc, pNoDi]);

  const generateAiSummary = useCallback(async () => {
    setAiPending(true);
    const parts: string[] = [];

    if (lcResult) {
      parts.push(
        `LANDED COST (HS: ${lcHs}, CIF: ${fmtUsd(parseFloat(lcCif))}, origin rate: ${lcResult.dutyRate}%)\n` +
        `Import Duty: TZS ${fmt(lcResult.duty)}\n` +
        `VAT 18%: TZS ${fmt(lcResult.vat)}\n` +
        `Railway Dev. Levy 2%: TZS ${fmt(lcResult.rdl)}\n` +
        `Customs Processing Fee: TZS ${fmt(lcResult.cpf)}\n` +
        `ICD Charges: TZS ${fmt(lcResult.icd)}\n` +
        `Wharfage: TZS ${fmt(lcResult.wharfage)}\n` +
        `TOTAL LANDED COST: TZS ${fmt(lcResult.total)} (TZS ${fmt(lcResult.perUnit)} per unit)`,
      );
    }

    if (ccResult) {
      const req = (['pvoc','di','camartec','gcla','tra'] as const)
        .filter(k => ccResult[k].required)
        .map(k => k.toUpperCase());
      parts.push(
        `COMPLIANCE (HS: ${ccHs}, Origin: ${ccOrigin})\n` +
        `Required certificates: ${req.length ? req.join(', ') : 'None (EAC origin or exempt)'}\n` +
        Object.entries(ccResult).map(([k, v]) => `${k.toUpperCase()}: ${v.required ? 'REQUIRED' : 'Not required'} — ${v.note}`).join('\n'),
      );
    }

    if (pResult) {
      parts.push(
        `PENALTY ESTIMATE (violation: ${pViolation.replace('_', ' ')})\n` +
        `Total penalty: TZS ${fmt(pResult.total)}\n` +
        (pResult.basis.length ? `Basis: ${pResult.basis.join('; ')}` : 'No penalties calculated'),
      );
    }

    if (!parts.length) {
      setSummary('Run at least one tool to generate a summary.');
      setAiPending(false);
      return;
    }

    const context = parts.join('\n\n---\n\n');
    try {
      const res = await apiFetch('/v1/ai/summarise', {
        method: 'POST',
        body: JSON.stringify({
          text: `You are a Tanzania customs expert. Provide a clear, actionable summary for a clearance officer based on the following tool results.\n\n${context}`,
          mode: 'detailed',
        }),
      });
      setSummary(res.summary || context);
    } catch {
      setSummary(context);
    }
    setAiPending(false);
  }, [lcResult, ccResult, pResult, lcHs, lcCif, ccHs, ccOrigin, pViolation]);

  const hasResult = !!(lcResult || ccResult || pResult);

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Shipments', 'Customs Tools']}
        titlePlain="Customs"
        titleEm="Tools"
        subtitle="Tanzania EAC CET — landed cost, compliance & penalty estimation"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {hasResult && (
              <button type="button" className="btn btn-secondary"
                onClick={() => printReport(lcHs || ccHs, lcCif, lcQty, lcResult, ccResult, pResult, summary)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Icon name="download" size={14} />
                Export PDF
              </button>
            )}
            <button type="button" className="btn btn-primary"
              disabled={!hasResult || aiPending}
              onClick={generateAiSummary}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Icon name="zap" size={14} />
              {aiPending ? 'Generating…' : 'AI Summary'}
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 20, alignItems: 'start' }}>

        {/* ── Tool 1: Landed Cost ── */}
        <ToolCard
          title="Landed Cost Calculator"
          desc="Compute duty, VAT 18%, RDL 2%, CPF 1%, ICD & wharfage"
          tags={['Import Duty', 'VAT 18%', 'ICD Charges', 'Wharfage']}
          color="var(--teal)" icon="package"
          onRun={runLanded}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TF label="CIF Value (USD)" hint="Cost + Insurance + Freight">
              <input className="input-field" type="number" min="0" placeholder="e.g. 15000" value={lcCif} onChange={e => setLcCif(e.target.value)} />
            </TF>
            <TF label="HS Code" hint="First 4–6 digits">
              <input className="input-field" placeholder="e.g. 8471" value={lcHs} onChange={e => setLcHs(e.target.value)} />
            </TF>
            <TF label="Quantity (units)">
              <input className="input-field" type="number" min="1" value={lcQty} onChange={e => setLcQty(e.target.value)} />
            </TF>
            <TF label="Mode">
              <div style={{ display: 'flex', gap: 6 }}>
                <Seg active={!lcAir} onClick={() => setLcAir(false)} label="Sea / Road" />
                <Seg active={lcAir}  onClick={() => setLcAir(true)}  label="Air" />
              </div>
            </TF>
            {!lcAir && (
              <TF label="Container" full>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['20ft','40ft','lcl'] as const).map(c => (
                    <Seg key={c} active={lcContainer === c} onClick={() => setLcContainer(c)} label={c === 'lcl' ? 'LCL / No ICD' : c} />
                  ))}
                </div>
              </TF>
            )}
          </div>

          {lcResult && (
            <ResultBox color="var(--teal)">
              <RRow label={`CIF in TZS (@${USD_TO_TZS.toLocaleString()})`} value={`TZS ${fmt(lcResult.cifTzs)}`} />
              <RRow label={`Import Duty (${lcResult.dutyRate}% EAC CET)`} value={`TZS ${fmt(lcResult.duty)}`} />
              <RRow label="VAT 18% (on CIF + Duty)" value={`TZS ${fmt(lcResult.vat)}`} />
              <RRow label="Railway Dev. Levy 2%" value={`TZS ${fmt(lcResult.rdl)}`} />
              <RRow label="Customs Processing Fee 0.6%" value={`TZS ${fmt(lcResult.cpf)}`} />
              {!lcAir && <RRow label={`ICD Charges (${lcContainer})`} value={`TZS ${fmt(lcResult.icd)}`} />}
              {!lcAir && <RRow label="Wharfage (TPA 1.6%)" value={`TZS ${fmt(lcResult.wharfage)}`} />}
              <RRow label="Total Landed Cost" value={`TZS ${fmt(lcResult.total)}`} hi />
              {parseInt(lcQty) > 1 && <RRow label={`Per Unit (÷ ${lcQty})`} value={`TZS ${fmt(lcResult.perUnit)}`} hi />}
            </ResultBox>
          )}
        </ToolCard>

        {/* ── Tool 2: Compliance Checker ── */}
        <ToolCard
          title="Compliance Checker"
          desc="Check PVoC/COC, DI Inspection, CAMARTEC & GCLA requirements"
          tags={['PVoC / COC', 'DI Permit', 'CAMARTEC', 'GCLA']}
          color="#7c3aed" icon="shield"
          onRun={runCompliance}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TF label="HS Code" hint="Chapter (2 digits) is enough">
              <input className="input-field" placeholder="e.g. 8471 or 84" value={ccHs} onChange={e => setCcHs(e.target.value)} />
            </TF>
            <TF label="Country of Origin" hint="ISO 2-letter code">
              <input className="input-field" placeholder="e.g. CN, DE, KE" value={ccOrigin}
                onChange={e => setCcOrigin(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase', letterSpacing: '.05em' }} />
            </TF>
          </div>

          {ccResult && (
            <ResultBox color="#7c3aed">
              {(
                [
                  { label: 'PVoC / COC',        r: ccResult.pvoc     },
                  { label: 'DI Inspection',      r: ccResult.di       },
                  { label: 'CAMARTEC Approval',  r: ccResult.camartec },
                  { label: 'GCLA Permit',        r: ccResult.gcla     },
                  { label: 'TRA Customs Entry',  r: ccResult.tra      },
                ]
              ).map(({ label, r }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: r.required ? '#fee2e2' : '#ecfdf5', color: r.required ? '#dc2626' : '#059669' }}>
                    {r.required ? '!' : '✓'}
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.required ? '#fee2e2' : '#ecfdf5', color: r.required ? '#dc2626' : '#059669' }}>
                        {r.required ? 'REQUIRED' : 'NOT REQUIRED'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, lineHeight: 1.5 }}>{r.note}</div>
                  </div>
                </div>
              ))}
            </ResultBox>
          )}
        </ToolCard>

        {/* ── Tool 3: Penalty Estimator ── */}
        <ToolCard
          title="Penalty Estimator"
          desc="Estimate customs penalties under Tanzania CEMA CAP 403"
          tags={['Under-declaration', 'Late Payment', 'Mis-classification']}
          color="#dc2626" icon="alertCircle"
          onRun={runPenalty}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TF label="Violation Type" full>
              <Select value={pViolation} onValueChange={setPViolation}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="under_declaration">Under-declaration of Value</SelectItem>
                  <SelectItem value="misclassification">Mis-classification of HS Code</SelectItem>
                  <SelectItem value="late_payment">Late Payment of Duty</SelectItem>
                </SelectContent>
              </Select>
            </TF>
            <TF label="Declared CIF (USD)">
              <input className="input-field" type="number" min="0" placeholder="As declared to customs" value={pDeclared} onChange={e => setPDeclared(e.target.value)} />
            </TF>
            {pViolation !== 'late_payment' && (
              <TF label="Actual CIF (USD)" hint="True market value">
                <input className="input-field" type="number" min="0" placeholder="Discovered on inspection" value={pActual} onChange={e => setPActual(e.target.value)} />
              </TF>
            )}
            <TF label="HS Code" hint={activeHs && activeHs !== lcHs ? `Using ${activeHs}` : 'Uses landed cost HS if set'}>
              <input className="input-field" placeholder="e.g. 8471" value={lcHs} onChange={e => setLcHs(e.target.value)} />
            </TF>
            <TF label="Months Late">
              <input className="input-field" type="number" min="0" value={pMonths} onChange={e => setPMonths(e.target.value)} />
            </TF>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 2 }}>
              {([['pNoPvoc', 'No PVoC/COC certificate', pNoPvoc, setPNoPvoc], ['pNoDi', 'No DI Inspection permit', pNoDi, setPNoDi]] as const).map(([, label, val, set]) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: 'var(--ink2)', userSelect: 'none' }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} style={{ accentColor: '#dc2626', width: 15, height: 15, cursor: 'pointer' }} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {pResult && (
            <ResultBox color="#dc2626">
              {pResult.underDeclaration > 0 && <RRow label="Under-declaration / Mis-classification" value={`TZS ${fmt(pResult.underDeclaration)}`} red />}
              {pResult.lateInterest > 0     && <RRow label="Late Payment Interest" value={`TZS ${fmt(pResult.lateInterest)}`} red />}
              {pResult.noPvocFine > 0       && <RRow label="No PVoC/COC Fine" value={`TZS ${fmt(pResult.noPvocFine)}`} red />}
              {pResult.noDiFine > 0         && <RRow label="No DI Permit Fine" value={`TZS ${fmt(pResult.noDiFine)}`} red />}
              <RRow label="Total Estimated Penalty" value={`TZS ${fmt(pResult.total)}`} hi red />
              {pResult.basis.length > 0 && (
                <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f208' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Legal Basis</div>
                  {pResult.basis.map((b, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: 'var(--ink2)', paddingLeft: 10, borderLeft: '2px solid #fecaca', marginBottom: 5, lineHeight: 1.5 }}>{b}</div>
                  ))}
                </div>
              )}
            </ResultBox>
          )}
        </ToolCard>

        {/* ── AI Summary ── */}
        {summary && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(20,184,166,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="zap" size={15} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>AI Summary</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Aggregated from all tool results</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => printReport(lcHs || ccHs, lcCif, lcQty, lcResult, ccResult, pResult, summary)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <Icon name="download" size={13} /> Export PDF
                </button>
                <button type="button" onClick={() => setSummary('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
              </div>
            </div>
            <div style={{ padding: '22px 26px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
              {summary}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
