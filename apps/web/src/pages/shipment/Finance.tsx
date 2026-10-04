import React, { useState, useEffect, useRef } from 'react';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { ExaminationsQueue } from '../../components/ExaminationsQueue.js';
import { DangerousGoodsPanel } from '../../components/DangerousGoodsPanel.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Spinner, PageLoading } from '../../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { RelatedRecordsPanel } from '../../components/RelatedRecordsPanel.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { IconName } from '../../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../../lib/watermark.js';
import { useCompany, getCompany } from '../../data/companyStore.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { useClockIn } from '../../contexts/ClockInContext.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  jobUiSteps, jobCurrentIdx, jobStageLabel, jobBackendStage,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
  type JobChargeLine,
} from '../clearanceData.js';
import { ChBadge } from '../../components/ClearanceChips.js';
import { VesselLiveStatus } from '../../components/VesselLiveStatus.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../../data/staffData.js';
import type { Employee } from '../../data/staffData.js';
import { CUSTOMER_MILESTONES, MILESTONE_LABELS, STAGE_TO_MILESTONE } from '@hudumika/types';
import type { CustomerMilestone, ClearanceStage } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Badge } from '../../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../components/ui/hover-card.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
import { clockGate, entryAmount, fmtServiceRate, fmtTZS, fdate, Card } from './utils.js';
import { EstimateVarianceCard } from './Declaration.js';
import { CHARGE_CODE_DEFAULTS } from './DocsFiles.js';
export function fmtAmt(v: number | null | undefined, dp = 2) {
  if (v == null) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function JobChargesTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [lines, setLines]       = useState<JobChargeLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editLine, setEditLine] = useState<JobChargeLine | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { user } = useAuth();

  // Form state
  const blankForm = () => ({
    charge_code: 'FRT', description: 'International Freight',
    invoice_type: 'FIN',
    creditor_name: '', cost_currency: 'USD', cost_amount: '',
    cost_exchange_rate: '2700', cost_local_amount: '',
    debtor_name: job.customer || '', sell_currency: 'USD', sell_amount: '',
    sell_exchange_rate: '2700', sell_local_amount: '',
    sell_reference: '', cost_reference: '', override_comment: '',
  });
  const [form, setForm] = useState(blankForm);

  const loadLines = React.useCallback(async () => {
    if (!isLive) { setLoading(false); return; }
    try {
      const res = await apiFetch(`/v1/shipments/${shipmentId}/job-charges`);
      setLines(res.data ?? []);
    } finally { setLoading(false); }
  }, [shipmentId, isLive]);

  useEffect(() => { loadLines(); }, [loadLines]);

  // Auto-fill local amounts when amount or FX rate changes
  const computeLocal = (amt: string, fx: string) => {
    const a = parseFloat(amt), f = parseFloat(fx);
    if (!isNaN(a) && !isNaN(f)) return (a * f).toFixed(2);
    return '';
  };

  const handleCodeChange = (code: string) => {
    setForm(f => ({ ...f, charge_code: code, description: CHARGE_CODE_DEFAULTS[code] || f.description }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.charge_code || !form.description) return;
    setSaving(true);
    try {
      const payload = {
        charge_code:        form.charge_code,
        description:        form.description,
        invoice_type:       form.invoice_type,
        creditor_name:      form.creditor_name || null,
        cost_currency:      form.cost_currency,
        cost_amount:        parseFloat(form.cost_amount) || 0,
        cost_exchange_rate: parseFloat(form.cost_exchange_rate) || null,
        cost_local_amount:  parseFloat(form.cost_local_amount) || null,
        debtor_name:        form.debtor_name || null,
        sell_currency:      form.sell_currency,
        sell_amount:        parseFloat(form.sell_amount) || 0,
        sell_exchange_rate: parseFloat(form.sell_exchange_rate) || null,
        sell_local_amount:  parseFloat(form.sell_local_amount) || null,
        sell_reference:     form.sell_reference || null,
        cost_reference:     form.cost_reference || null,
        override_comment:   form.override_comment || null,
      };
      if (editLine) {
        await apiFetch(`/v1/shipments/${shipmentId}/job-charges/${editLine.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/v1/shipments/${shipmentId}/job-charges`, { method: 'POST', body: JSON.stringify(payload) });
      }
      await loadLines();
      setShowForm(false); setEditLine(null); setForm(blankForm());
    } catch (err: any) { showAlert(err.message || 'Failed to save charge'); } finally { setSaving(false); }
  }

  async function togglePosted(line: JobChargeLine, side: 'cost' | 'sell') {
    const patch = side === 'cost'
      ? { cost_posted: !line.cost_posted }
      : { sell_posted: !line.sell_posted };
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/job-charges/${line.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setLines(ls => ls.map(l => l.id === line.id ? { ...l, ...patch } : l));
    } catch (err: any) { showAlert(err.message || 'Failed to update'); }
  }

  async function handleDelete(lineId: string) {
    setDeleting(lineId);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/job-charges/${lineId}`, { method: 'DELETE' });
      setLines(ls => ls.filter(l => l.id !== lineId));
      if (selectedId === lineId) setSelectedId(null);
    } catch (err: any) { showAlert(err.message || 'Failed to delete'); } finally { setDeleting(null); }
  }

  function openEdit(line: JobChargeLine) {
    setEditLine(line);
    setForm({
      charge_code:        line.charge_code,
      description:        line.description,
      invoice_type:       line.invoice_type || 'FIN',
      creditor_name:      line.creditor_name || '',
      cost_currency:      line.cost_currency,
      cost_amount:        String(line.cost_amount ?? ''),
      cost_exchange_rate: line.cost_exchange_rate != null ? String(line.cost_exchange_rate) : '2700',
      cost_local_amount:  line.cost_local_amount != null ? String(line.cost_local_amount) : '',
      debtor_name:        line.debtor_name || '',
      sell_currency:      line.sell_currency,
      sell_amount:        String(line.sell_amount ?? ''),
      sell_exchange_rate: line.sell_exchange_rate != null ? String(line.sell_exchange_rate) : '2700',
      sell_local_amount:  line.sell_local_amount != null ? String(line.sell_local_amount) : '',
      sell_reference:     line.sell_reference || '',
      cost_reference:     line.cost_reference || '',
      override_comment:   line.override_comment || '',
    });
    setShowForm(true);
  }

  const totalCostLocal = lines.reduce((s, l) => s + (l.cost_local_amount ?? 0), 0);
  const totalSellLocal = lines.reduce((s, l) => s + (l.sell_local_amount ?? 0), 0);
  const totalProfit    = totalSellLocal - totalCostLocal;
  const selectedLine   = lines.find(l => l.id === selectedId) ?? null;
  const localCcy       = 'TZS';

  const thStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--bg)', color: 'var(--ink3)',
    whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 1,
  };
  const tdStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap', verticalAlign: 'middle',
  };
  const numTd: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' };
  const dividerTh: React.CSSProperties = { ...thStyle, borderLeft: '2px solid var(--border2)', paddingLeft: 12 };
  const dividerTd: React.CSSProperties = { ...tdStyle, borderLeft: '2px solid var(--border2)', paddingLeft: 12 };
  const numDivTd: React.CSSProperties = { ...numTd, borderLeft: '2px solid var(--border2)', paddingLeft: 12 };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Job Charge Lines</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
            Cost vs. sell per charge — both legs in original currency and {localCcy}.
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setEditLine(null); setForm(blankForm()); setShowForm(true); }}
          style={{ fontSize: 12.5, fontWeight: 700, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-sm) 16px', cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}
        >
          + Add charge
        </button>
      </div>

      {/* Profitability summary */}
      {lines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {([
            { label: 'Total Cost', value: fmtAmt(totalCostLocal, 0), sub: localCcy, color: 'var(--red)' },
            { label: 'Total Revenue', value: fmtAmt(totalSellLocal, 0), sub: localCcy, color: 'var(--green)' },
            { label: totalProfit >= 0 ? 'Gross Profit' : 'Gross Loss', value: fmtAmt(Math.abs(totalProfit), 0), sub: `${totalSellLocal > 0 ? Math.round((totalProfit / totalSellLocal) * 100) : 0}% margin`, color: totalProfit >= 0 ? 'var(--green)' : 'var(--red)' },
          ] as { label: string; value: string; sub: string; color: string }[]).map(c => (
            <div key={c.label} style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* The grid */}
      <div style={{ borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: selectedLine ? 0 : 8 }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
          ) : lines.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>No charge lines yet</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Add each service (clearance, freight, duty, etc.) with its cost and sell amounts.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {/* Identity */}
                  <th style={{ ...thStyle, width: 32 }}>#</th>
                  <th style={{ ...thStyle, width: 72 }}>Code</th>
                  <th style={{ ...thStyle, minWidth: 160 }}>Description</th>
                  {/* Cost leg */}
                  <th style={{ ...dividerTh, minWidth: 110 }}>Creditor</th>
                  <th style={thStyle}>CCY</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Cost Amt</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>FX Rate</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Local Cost</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>AP✓</th>
                  {/* Sell leg */}
                  <th style={{ ...dividerTh, minWidth: 110 }}>Debtor</th>
                  <th style={thStyle}>CCY</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Sell Amt</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>FX Rate</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Local Sell</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>AR✓</th>
                  {/* Meta */}
                  <th style={{ ...thStyle, width: 60 }}>Inv Type</th>
                  <th style={{ ...thStyle, width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const isSelected = selectedId === line.id;
                  const rowBg = isSelected ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : idx % 2 === 1 ? 'var(--bg)' : 'var(--white)';
                  const profit = (line.sell_local_amount ?? 0) - (line.cost_local_amount ?? 0);
                  return (
                    <tr
                      key={line.id}
                      style={{ background: rowBg, cursor: 'pointer' }}
                      onClick={() => setSelectedId(isSelected ? null : line.id)}
                    >
                      <td style={{ ...tdStyle, color: 'var(--ink3)', textAlign: 'center' }}>{line.display_sequence}</td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--ink2)' }}>
                          {line.charge_code}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--ink)' }}>{line.description}</td>
                      {/* Cost */}
                      <td style={{ ...dividerTd, color: 'var(--ink2)' }}>{line.creditor_name || '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--ink3)' }}>{line.cost_currency}</td>
                      <td style={numTd}>{fmtAmt(line.cost_amount)}</td>
                      <td style={{ ...numTd, color: 'var(--ink3)', fontSize: 11 }}>{line.cost_exchange_rate != null ? fmtAmt(line.cost_exchange_rate, 2) : '—'}</td>
                      <td style={{ ...numTd, color: 'var(--ink2)' }}>{fmtAmt(line.cost_local_amount, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          title={line.cost_posted ? 'AP posted — click to unpost' : 'Mark AP as posted'}
                          onClick={e => { e.stopPropagation(); togglePosted(line, 'cost'); }}
                          style={{ width: 20, height: 20, borderRadius: 4, border: `1.5px solid ${line.cost_posted ? 'var(--green)' : 'var(--border2)'}`, background: line.cost_posted ? 'var(--green)' : 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {line.cost_posted && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                      </td>
                      {/* Sell */}
                      <td style={{ ...dividerTd, color: 'var(--ink2)' }}>{line.debtor_name || '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--ink3)' }}>{line.sell_currency}</td>
                      <td style={numTd}>{fmtAmt(line.sell_amount)}</td>
                      <td style={{ ...numTd, color: 'var(--ink3)', fontSize: 11 }}>{line.sell_exchange_rate != null ? fmtAmt(line.sell_exchange_rate, 2) : '—'}</td>
                      <td style={{ ...numTd, color: 'var(--ink2)' }}>{fmtAmt(line.sell_local_amount, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          title={line.sell_posted ? 'AR posted — click to unpost' : 'Mark AR as posted'}
                          onClick={e => { e.stopPropagation(); togglePosted(line, 'sell'); }}
                          style={{ width: 20, height: 20, borderRadius: 4, border: `1.5px solid ${line.sell_posted ? 'var(--green)' : 'var(--border2)'}`, background: line.sell_posted ? 'var(--green)' : 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {line.sell_posted && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--ink3)', fontSize: 11 }}>{line.invoice_type}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          title="Edit charge"
                          onClick={e => { e.stopPropagation(); openEdit(line); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr style={{ background: 'var(--bg)', fontWeight: 700 }}>
                  <td colSpan={4} style={{ ...tdStyle, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '2px solid var(--border)' }}>
                    Totals — {localCcy}
                  </td>
                  <td colSpan={3} style={{ ...tdStyle, borderTop: '2px solid var(--border)' }} />
                  <td style={{ ...numTd, borderTop: '2px solid var(--border)', color: 'var(--red)', fontSize: 13 }}>{fmtAmt(totalCostLocal, 0)}</td>
                  <td style={{ ...tdStyle, borderTop: '2px solid var(--border)' }} />
                  <td colSpan={3} style={{ ...dividerTd, borderTop: '2px solid var(--border)' }} />
                  <td colSpan={1} style={{ ...tdStyle, borderTop: '2px solid var(--border)' }} />
                  <td style={{ ...numTd, borderTop: '2px solid var(--border)', color: 'var(--green)', fontSize: 13 }}>{fmtAmt(totalSellLocal, 0)}</td>
                  <td colSpan={3} style={{ ...tdStyle, borderTop: '2px solid var(--border)' }} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Selected line detail panel */}
      {selectedLine && (
        <div style={{ border: '1px solid var(--border)', borderTop: '3px solid var(--teal)', borderRadius: '0 0 var(--r) var(--r)', background: 'var(--white)', padding: '16px 20px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                {selectedLine.charge_code} · {selectedLine.invoice_type}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{selectedLine.description}</div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Cost side */}
            <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Cost (AP) · {selectedLine.cost_posted ? '✓ Posted' : 'Not posted'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Creditor', selectedLine.creditor_name || '—'],
                  ['Currency', selectedLine.cost_currency],
                  ['Amount', `${selectedLine.cost_currency} ${fmtAmt(selectedLine.cost_amount)}`],
                  ['FX Rate', selectedLine.cost_exchange_rate != null ? fmtAmt(selectedLine.cost_exchange_rate, 4) : '—'],
                  ['Local Amount', `${localCcy} ${fmtAmt(selectedLine.cost_local_amount, 0)}`],
                  ['Reference', selectedLine.cost_reference || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sell side */}
            <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Revenue (AR) · {selectedLine.sell_posted ? '✓ Posted' : 'Not posted'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Debtor', selectedLine.debtor_name || '—'],
                  ['Currency', selectedLine.sell_currency],
                  ['Amount', `${selectedLine.sell_currency} ${fmtAmt(selectedLine.sell_amount)}`],
                  ['FX Rate', selectedLine.sell_exchange_rate != null ? fmtAmt(selectedLine.sell_exchange_rate, 4) : '—'],
                  ['Local Amount', `${localCcy} ${fmtAmt(selectedLine.sell_local_amount, 0)}`],
                  ['Sell Reference', selectedLine.sell_reference || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{v}</div>
                  </div>
                ))}
              </div>
              {selectedLine.override_comment && (
                <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r-sm)', fontSize: 11.5, color: 'var(--gold)' }}>
                  ⚠ {selectedLine.override_comment}
                </div>
              )}
            </div>
          </div>

          {/* Charge-level profit */}
          {(() => {
            const lp = (selectedLine.sell_local_amount ?? 0) - (selectedLine.cost_local_amount ?? 0);
            const pct = selectedLine.sell_local_amount ? Math.round((lp / selectedLine.sell_local_amount) * 100) : 0;
            return (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Charge margin:</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: lp >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>
                  {lp >= 0 ? '+' : ''}{localCcy} {fmtAmt(Math.abs(lp), 0)} ({pct}%)
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedLine.id)}
                  disabled={deleting === selectedLine.id}
                  style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 'var(--r-sm)', padding: '3px 10px', cursor: 'pointer', opacity: deleting === selectedLine.id ? 0.5 : 1 }}
                >
                  {deleting === selectedLine.id ? 'Deleting…' : 'Delete charge'}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Add / Edit dialog */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <form onSubmit={handleSave} style={{ background: 'var(--white)', borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)', width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{editLine ? 'Edit charge line' : 'Add charge line'}</div>
              <button type="button" onClick={() => { setShowForm(false); setEditLine(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            {/* Identity */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 100px', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Charge Code</label>
                <Select value={form.charge_code} onValueChange={handleCodeChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                  {Object.entries(CHARGE_CODE_DEFAULTS).map(([c, d]) => (
                    <SelectItem key={c} value={c}>{c} — {d}</SelectItem>
                  ))}
                    <SelectItem value="CUSTOM">Custom code…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder="Charge description" style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box', minHeight: 'var(--ctl-h-sm)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Inv. Type</label>
                <Select value={form.invoice_type} onValueChange={value => setForm(f => ({ ...f, invoice_type: value }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIN">FIN — Final</SelectItem>
                    <SelectItem value="PRE">PRE — Preliminary</SelectItem>
                    <SelectItem value="PRO">PRO — Pro-forma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cost + Sell sides */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Cost (AP) */}
              <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Cost leg (AP)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Creditor / Vendor', key: 'creditor_name' as const, placeholder: 'Supplier name', type: 'text' },
                    { label: 'Cost Reference', key: 'cost_reference' as const, placeholder: 'Bill / PO ref', type: 'text' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>{f.label}</label>
                      <input value={(form as any)[f.key]} onChange={e => setForm(frm => ({ ...frm, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>CCY</label>
                      <Select value={form.cost_currency} onValueChange={value => setForm(f => ({ ...f, cost_currency: value }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{['USD','EUR','GBP','TZS','KES','UGX','CNY'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Cost Amount</label>
                      <input type="number" step="0.01" value={form.cost_amount} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, cost_amount: v, cost_local_amount: computeLocal(v, f.cost_exchange_rate) })); }} placeholder="0.00" style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>FX Rate (→TZS)</label>
                      <input type="number" step="0.000001" value={form.cost_exchange_rate} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, cost_exchange_rate: v, cost_local_amount: computeLocal(f.cost_amount, v) })); }} placeholder="2700" style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Local Cost (TZS)</label>
                      <input type="number" step="1" value={form.cost_local_amount} onChange={e => setForm(f => ({ ...f, cost_local_amount: e.target.value }))} placeholder="auto" style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sell (AR) */}
              <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Revenue leg (AR)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Debtor / Client', key: 'debtor_name' as const, placeholder: 'Client name' },
                    { label: 'Sell Reference', key: 'sell_reference' as const, placeholder: 'Invoice ref' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>{f.label}</label>
                      <input value={(form as any)[f.key]} onChange={e => setForm(frm => ({ ...frm, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>CCY</label>
                      <Select value={form.sell_currency} onValueChange={value => setForm(f => ({ ...f, sell_currency: value }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{['USD','EUR','GBP','TZS','KES','UGX','CNY'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Sell Amount</label>
                      <input type="number" step="0.01" value={form.sell_amount} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, sell_amount: v, sell_local_amount: computeLocal(v, f.sell_exchange_rate) })); }} placeholder="0.00" style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>FX Rate (→TZS)</label>
                      <input type="number" step="0.000001" value={form.sell_exchange_rate} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, sell_exchange_rate: v, sell_local_amount: computeLocal(f.sell_amount, v) })); }} placeholder="2700" style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Local Sell (TZS)</label>
                      <input type="number" step="1" value={form.sell_local_amount} onChange={e => setForm(f => ({ ...f, sell_local_amount: e.target.value }))} placeholder="auto" style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Override comment */}
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Override Comment (optional)</label>
              <input value={form.override_comment} onChange={e => setForm(f => ({ ...f, override_comment: e.target.value }))} placeholder="Reason for any manual rate override…" style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => { setShowForm(false); setEditLine(null); }}
                style={{ padding: 'var(--ds-btn-py-sm) 18px', fontSize: 13, borderRadius: 'var(--r)', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--ink)', cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{ padding: 'var(--ds-btn-py-sm) 22px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                {saving ? 'Saving…' : editLine ? 'Save changes' : 'Add charge'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Ledger Tab ───────────────────────────────────────────────────────────────

export function LedgerTab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const isMobile = useIsMobile();
  const [showForm,  setShowForm]  = useState(false);
  const [entryType, setEntryType] = useState<'charge' | 'payment'>('charge');
  const [category,  setCategory]  = useState('CLEARANCE');
  const [desc,      setDesc]      = useState('');
  const [amount,    setAmount]    = useState('');
  const [ref,       setRef]       = useState('');
  const [ledgSaving, setLedgSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  const charges  = job.ledger.filter(e => e.type === 'charge');
  const payments = job.ledger.filter(e => e.type === 'payment');
  // 'refund' is a real value of LedgerEntry['type'] that neither table below
  // nor any total here used to account for — a refunded entry used to
  // vanish from this tab entirely: not in Charges, not in Payments, not in
  // Balance, with nothing to show it had ever been recorded.
  const refunds  = job.ledger.filter(e => e.type === 'refund');
  const totalCharges = charges.reduce((s, e) => s + e.amount, 0);
  const totalPaid    = payments.reduce((s, e) => s + e.amount, 0);
  const totalRefunds = refunds.reduce((s, e) => s + e.amount, 0);
  const balance      = totalPaid - totalCharges - totalRefunds;

  function sColor(s: string) { return s === 'paid' ? 'var(--green)' : s === 'overdue' ? 'var(--red)' : 'var(--gold)'; }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim() || !amount) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setLedgSaving(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/ledger`, {
          method: 'POST',
          body: JSON.stringify({ description: `[${category}] ${desc}`, amount: Number(amount), type: entryType, category, ref: ref || undefined }),
        });
        onRefresh();
      } else {
        const entry: LedgerEntry = {
          id: 'led-' + Date.now(), description: `[${category}] ${desc}`, amount: Number(amount),
          currency: 'TZS', type: entryType, date: new Date(), status: entryType === 'payment' ? 'paid' : 'pending',
          reference: ref || undefined,
        };
        updateJob(job.id, j => ({ ...j, ledger: [...j.ledger, entry] }));
      }
      setDesc(''); setAmount(''); setRef(''); setShowForm(false);
    } catch (err: any) { showAlert(err.message || 'Failed to add entry'); } finally { setLedgSaving(false); }
  }

  async function handleFinalize() {
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setFinalizing(true);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/invoice/finalise`, { method: 'POST' });
      onRefresh();
      showAlert('Invoice finalised — now visible in FinOps Billing.');
    } catch (err: any) { showAlert(err.message || 'Failed to finalize invoice'); } finally { setFinalizing(false); }
  }

  return (
    <div>
      <EstimateVarianceCard shipmentId={shipmentId} />
      {/* ── Economics of this Shipment ── */}
      {(() => {
        const revenue       = totalPaid;
        const expenses      = totalCharges;
        const grossMargin   = revenue - expenses;
        const marginPct     = revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0;
        // Real logged-time value, using each entry's own snapshotted rate —
        // the same rule the Timesheets tab uses. There is no "ops budget"
        // anywhere in the data model, so this reports what was actually
        // logged rather than measuring it against an invented reservation.
        const billableByCurrency = job.timeEntries.reduce<Record<string, number>>((acc, e) => {
          const amt = entryAmount(e);
          if (amt != null && e.serviceCurrency) acc[e.serviceCurrency] = (acc[e.serviceCurrency] || 0) + amt;
          return acc;
        }, {});
        const billableSummary = Object.entries(billableByCurrency);
        return (
          <div style={{ marginBottom: 20 }}>
          <Card
            title="Shipment Economics"
            action={<span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--badge-radius)', background: marginPct >= 20 ? 'var(--green-l)' : marginPct >= 0 ? 'var(--gold-l)' : 'var(--red-l)', color: marginPct >= 20 ? 'var(--green)' : marginPct >= 0 ? 'var(--gold)' : 'var(--red)' }}>
              {marginPct >= 0 ? '+' : ''}{marginPct}% margin
            </span>}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: billableSummary.length ? 16 : 0 }}>
              {([
                { label: 'Revenue',        value: fmtTZS(revenue),     color: 'var(--green)', icon: 'arrowUp' },
                { label: 'Expenses',       value: fmtTZS(expenses),    color: 'var(--red)', icon: 'arrowDown' },
                { label: 'Gross Margin',   value: fmtTZS(Math.abs(grossMargin)), color: grossMargin >= 0 ? 'var(--green)' : 'var(--red)', icon: grossMargin >= 0 ? 'checkCircle' : 'alertTriangle' },
                { label: 'Time Logged, Billable', value: billableSummary.length ? billableSummary.map(([cur, amt]) => fmtServiceRate(amt, cur)).join(' + ') : '—', color: 'var(--blue)', icon: 'clock' },
              ] as { label: string; value: string; color: string; icon: IconName }[]).map(c => (
                <div key={c.label} style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}><Icon name={c.icon} size={10} /> {c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c.color, fontFamily: 'var(--font)' }}>{c.value}</div>
                </div>
              ))}
            </div>
            {billableSummary.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>From rated time entries on the Timesheets tab — not yet reflected in Revenue above until invoiced.</div>
            )}
          </Card>
          </div>
        );
      })()}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Charges',  value: fmtTZS(totalCharges), color: 'var(--red)',  sub: `${charges.filter(e => e.status === 'pending').length} pending` },
          { label: 'Total Received', value: fmtTZS(totalPaid),    color: 'var(--green)',  sub: `${payments.length} payments` },
          { label: balance >= 0 ? 'Net Surplus' : 'Balance Due', value: fmtTZS(Math.abs(balance)), color: balance >= 0 ? 'var(--green)' : 'var(--gold)', sub: balance >= 0 ? 'Client ahead' : 'Outstanding' },
        ].map(card => (
          <div key={card.label} style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color, marginBottom: 3 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Add entry */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
        {!showForm ? (
          <button type="button" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="plus" size={14} /> Record Entry
          </button>
        ) : null}
        {isStaff && isLive && payments.length > 0 && job.customerId && (
          <Tip label="Publish billed revenue as an invoice in FinOps Billing">
            <span>
              <button type="button" onClick={handleFinalize} disabled={finalizing}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'var(--white)', color: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: finalizing ? 'wait' : 'pointer', opacity: finalizing ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="fileText" size={14} /> {finalizing ? 'Finalizing…' : 'Finalize Invoice'}
              </button>
            </span>
          </Tip>
        )}
        {showForm && (
          <div style={{ flex: 1 }}>
          <Card title="New Ledger Entry">
          <form onSubmit={handleAdd}>
            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['charge', 'payment'] as const).map(t => (
                <button key={t} type="button" onClick={() => setEntryType(t)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, padding: '7px', border: `1px solid ${entryType === t ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--r)', background: entryType === t ? 'var(--teal-l)' : 'var(--white)', color: entryType === t ? 'var(--teal)' : 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <Icon name={t === 'charge' ? 'arrowUp' : 'arrowDown'} size={12} /> {t === 'charge' ? 'Charge' : 'Payment Received'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['DUTY','PORT','INSPECTION','TRANSPORT','STORAGE','AGENCY','CLEARANCE','OTHER'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Amount (TZS)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" placeholder="0" required style={{ width: '100%', fontFamily: 'var(--font)' }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Description</label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="input-field" placeholder="e.g. Agency handling fee" required style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Reference (optional)</label>
              <input type="text" value={ref} onChange={e => setRef(e.target.value)} className="input-field" placeholder="Invoice / receipt number" style={{ width: '100%', fontFamily: 'var(--font)' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={ledgSaving}>{ledgSaving ? 'Saving…' : 'Add Entry'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm">Cancel</button>
            </div>
          </form>
          </Card>
          </div>
        )}
      </div>

      {/* Ledger — charges, payments and refunds in one chronological table
          instead of two separate ones (charges, payments — refunds weren't
          shown anywhere at all), with a running balance so the shipment's
          financial story reads top to bottom like a real statement rather
          than requiring a mental merge of two disconnected lists. */}
      <Card
        title="Ledger"
        action={<span style={{ fontFamily: 'var(--font)', color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{balance >= 0 ? '+' : '−'}{fmtTZS(Math.abs(balance))}</span>}
        padded={false}
      >
        {job.ledger.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ink3)' }}>No entries recorded.</div>
        ) : (
          <div className="rtbl-wrap">
          <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date', 'Type', 'Description', 'Reference', 'Status', 'Amount', 'Balance'].map((h, i) => (
                <th key={h} style={{ padding: '9px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: i >= 5 ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(() => {
                // Oldest first, so the running balance accumulates the way a
                // real statement reads. Every other list on this page sorts
                // newest-first; this one deliberately doesn't.
                const sorted = [...job.ledger].sort((a, b) => a.date.getTime() - b.date.getTime());
                let running = 0;
                return sorted.map((e, i) => {
                  const signed = e.type === 'payment' ? e.amount : -e.amount;
                  running += signed;
                  const typeColor = e.type === 'payment' ? 'var(--green)' : e.type === 'refund' ? 'var(--gold)' : 'var(--red)';
                  const typeLabel = e.type === 'payment' ? 'Payment' : e.type === 'refund' ? 'Refund' : 'Charge';
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(e.date)}</td>
                      <td style={{ padding: '11px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: typeColor, background: typeColor + '18', padding: '2px 8px', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap' }}>{typeLabel}</span>
                      </td>
                      <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 500 }}>{e.description}</td>
                      <td style={{ padding: '11px 20px', fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>{e.reference || '—'}</td>
                      <td style={{ padding: '11px 20px' }}><span style={{ fontSize: 11, fontWeight: 700, color: sColor(e.status), background: sColor(e.status) + '18', padding: '2px 8px', borderRadius: 'var(--r-sm)'}}>{e.status.toUpperCase()}</span></td>
                      <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: signed >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
                        {signed >= 0 ? '+' : '−'}{fmtTZS(Math.abs(signed))}
                      </td>
                      <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: running >= 0 ? 'var(--ink)' : 'var(--red)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
                        {fmtTZS(running)}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

// ─── Staff Picker Modal ───────────────────────────────────────────────────────
