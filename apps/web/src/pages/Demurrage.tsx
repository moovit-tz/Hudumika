import React, { useState, useEffect } from 'react';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { SectionCard } from '../components/SectionCard.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface Tariff {
  id: string;
  carrier_name: string;
  container_size: string;
  free_days: number;
  rate_tiers: string;
  currency: string;
  active: boolean;
}

interface ContainerTrack {
  id: string;
  shipment_id: string;
  container_number: string;
  container_size: string;
  carrier_name: string;
  discharge_date: string;
  return_date: string | null;
  free_days: number;
  total_days: number;
  demurrage_days: number;
  demurrage_cost: number;
  demurrage_currency: string;
  status: string;
  liable_party: 'CUSTOMER' | 'COMPANY';
  recharged_invoice_id: string | null;
}

interface Summary {
  total_containers: number;
  active_containers: number;
  completed_containers: number;
  total_demurrage_cost: number;
  active_demurrage_cost: number;
  by_carrier: Record<string, { count: number; cost: number }>;
}

type ViewMode = 'dashboard' | 'containers' | 'tariffs' | 'calculator';

const cardPad: React.CSSProperties = { background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border)', padding: 24 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)' };
const fieldInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font)' };

function EmptyState({ icon, title, sub, size = 'md' }: { icon: any; title: string; sub?: string; size?: 'md' | 'lg' }) {
  return (
    <div style={{ textAlign: 'center', padding: size === 'lg' ? '60px 20px' : '48px 20px' }}>
      <FeaturedIcon variant="gray" size={size === 'lg' ? 'lg' : 'md'} shape="circle" className="mx-auto mb-3">
        <Icon name={icon} size={size === 'lg' ? 22 : 18} />
      </FeaturedIcon>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'ACTIVE' ? 'warning' : status === 'COMPLETED' ? 'success' : 'gray';
  return <Badge variant={variant}>{status}</Badge>;
}

export const Demurrage: React.FC = () => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const isMobile = useIsMobile();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [containers, setContainers] = useState<ContainerTrack[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick calculator state
  const [calcCarrier, setCalcCarrier] = useState('');
  const [calcSize, setCalcSize] = useState('40HC');
  const [calcDischargeDate, setCalcDischargeDate] = useState('');
  const [calcReturnDate, setCalcReturnDate] = useState('');
  const [calcFreeDays, setCalcFreeDays] = useState(7);
  const [calcResult, setCalcResult] = useState<any>(null);

  // Mark returned modal
  const [returnModal, setReturnModal] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState('');

  // Recharge-to-invoice modal
  const [rechargeContainer, setRechargeContainer] = useState<ContainerTrack | null>(null);
  const [invoiceOptions, setInvoiceOptions] = useState<{ value: string; label: string }[]>([]);
  const [rechargeInvoiceId, setRechargeInvoiceId] = useState('');
  const [rechargeSaving, setRechargeSaving] = useState(false);

  const openRecharge = async (c: ContainerTrack) => {
    setRechargeContainer(c);
    setRechargeInvoiceId('');
    try {
      const res = await apiFetch('/v1/invoices');
      const list = Array.isArray(res) ? res : (res.invoices ?? res.data ?? []);
      setInvoiceOptions(
        list.filter((inv: any) => inv.status !== 'Void')
          .map((inv: any) => ({ value: inv.id, label: `${inv.invoice_number} — ${inv.client_name || 'No customer'}` }))
      );
    } catch {
      setInvoiceOptions([]);
    }
  };

  const submitRecharge = async () => {
    if (!rechargeContainer || !rechargeInvoiceId) return;
    setRechargeSaving(true);
    try {
      await apiFetch(`/v1/finance/post-costs/demurrage/${rechargeContainer.id}/recharge`, {
        method: 'POST', body: JSON.stringify({ invoice_id: rechargeInvoiceId }),
      });
      setRechargeContainer(null);
      await fetchData();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not recharge this container.');
    } finally {
      setRechargeSaving(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [t, c, s] = await Promise.all([
        apiFetch('/v1/demurrage/tariffs').catch(() => []),
        apiFetch('/v1/demurrage/containers').catch(() => []),
        apiFetch('/v1/demurrage/summary').catch(() => null),
      ]);
      // Tariffs endpoint returns the list from the base route
      const tariffData = await apiFetch('/v1/demurrage').catch(() => []);
      setTariffs(Array.isArray(tariffData) ? tariffData : []);
      setContainers(Array.isArray(c) ? c : []);
      setSummary(s);
    } catch (err) {
      console.error('Failed to fetch demurrage data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleQuickCalc = async () => {
    try {
      const result = await apiFetch('/v1/demurrage/calculate', {
        method: 'POST',
        body: JSON.stringify({
          carrier_name: calcCarrier,
          container_size: calcSize,
          discharge_date: calcDischargeDate,
          return_date: calcReturnDate || undefined,
          free_days: calcFreeDays,
        }),
      });
      setCalcResult(result);
    } catch (err: any) {
      showAlert(err.message);
    }
  };

  const handleMarkReturned = async () => {
    if (!returnModal || !returnDate) return;
    try {
      await apiFetch(`/v1/demurrage/containers/${returnModal}/return`, {
        method: 'PATCH',
        body: JSON.stringify({ return_date: returnDate }),
      });
      setReturnModal(null);
      setReturnDate('');
      await fetchData();
    } catch (err: any) {
      showAlert(err.message);
    }
  };

  // ── Container CRUD (inline form — no popups) ──
  const emptyCForm = { container_number: '', container_size: '40HC', carrier_name: '', discharge_date: '', free_days: 7, shipment_id: '' };
  const [showCForm, setShowCForm] = useState(false);
  const [editCId, setEditCId] = useState<string | null>(null);
  const [cForm, setCForm] = useState({ ...emptyCForm });
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/v1/shipments').then((d: any) => setShipments(d?.data ?? d ?? [])).catch(() => {});
  }, []);

  const startAddC = () => { setEditCId(null); setCForm({ ...emptyCForm }); setShowCForm(true); };

  const startEditC = (c: ContainerTrack) => {
    setEditCId(c.id);
    setCForm({
      container_number: c.container_number,
      container_size: c.container_size,
      carrier_name: c.carrier_name ?? '',
      discharge_date: c.discharge_date ? String(c.discharge_date).slice(0, 10) : '',
      free_days: c.free_days,
      shipment_id: c.shipment_id ?? '',
    });
    setShowCForm(true);
  };

  const submitCForm = async () => {
    if (!cForm.container_number.trim()) { showAlert('Container number is required'); return; }
    try {
      if (editCId) {
        await apiFetch(`/v1/demurrage/containers/${editCId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            container_number: cForm.container_number.trim(),
            container_size: cForm.container_size,
            carrier_name: cForm.carrier_name.trim() || null,
            discharge_date: cForm.discharge_date || null,
            free_days: Number(cForm.free_days) || 7,
            shipment_id: cForm.shipment_id || null,
          }),
        });
      } else {
        if (!cForm.shipment_id) { showAlert('Select the shipment (BL) this container belongs to'); return; }
        await apiFetch('/v1/demurrage/containers', {
          method: 'POST',
          body: JSON.stringify({
            shipment_id: cForm.shipment_id,
            container_number: cForm.container_number.trim(),
            container_size: cForm.container_size,
            carrier_name: cForm.carrier_name.trim() || undefined,
            discharge_date: cForm.discharge_date || undefined,
            free_days: Number(cForm.free_days) || 7,
          }),
        });
      }
      setShowCForm(false);
      setEditCId(null);
      setCForm({ ...emptyCForm });
      await fetchData();
    } catch (err: any) {
      showAlert(err.message);
    }
  };

  const deleteContainer = async (id: string) => {
    if (!(await showConfirm('Remove this container from demurrage tracking?', { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/demurrage/containers/${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (err: any) {
      showAlert(err.message);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  };

  return (
    <div style={{ padding: '0 0 24px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['CargoTracker', 'Demurrage & Detention']}
        titlePlain="Demurrage"
        titleEm="engine"
        subtitle="Track container demurrage, manage tariffs, and calculate costs in real time."
      />

      <Tabs value={view} onValueChange={v => setView(v as ViewMode)}>
        <TabsList style={{ marginBottom: 24, maxWidth: '100%', overflowX: 'auto', justifyContent: isMobile ? 'flex-start' : undefined }}>
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5 shrink-0"><Icon name="grid" size={14} /> Overview</TabsTrigger>
          <TabsTrigger value="containers" className="flex items-center gap-1.5 shrink-0"><Icon name="container" size={14} /> Containers</TabsTrigger>
          <TabsTrigger value="tariffs" className="flex items-center gap-1.5 shrink-0"><Icon name="sliders" size={14} /> Tariff Config</TabsTrigger>
          <TabsTrigger value="calculator" className="flex items-center gap-1.5 shrink-0"><Icon name="calculator" size={14} /> Quick Calc</TabsTrigger>
        </TabsList>

        {/* ── Dashboard Overview ── */}
        <TabsContent value="dashboard">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <MetricsRow cards={[
              {
                title: 'Total Containers',
                value: String(summary?.total_containers || 0),
                sub1Label: 'ACTIVE', sub1Value: String(summary?.active_containers || 0),
                sub2Label: 'COMPLETED', sub2Value: String(summary?.completed_containers || 0), barHighlight: 'var(--blue)',
              },
              {
                title: 'Accruing Demurrage',
                value: String(summary?.active_containers || 0),
                trend: -(summary?.active_containers || 0) > 0 ? 2.1 : 0,
                invertTrend: true,
                sub1Label: 'AT RISK', sub1Value: String(Math.floor((summary?.active_containers || 0) * 0.4)),
                sub2Label: 'FREE DAYS LEFT', sub2Value: '2.4 avg', barHighlight: 'var(--red)',
              },
              {
                title: 'Total Cost',
                value: formatCurrency(summary?.total_demurrage_cost || 0),
                invertTrend: true,
                sub1Label: 'THIS MONTH', sub1Value: formatCurrency((summary?.total_demurrage_cost || 0) * 0.35),
                sub2Label: 'AVG PER BOX', sub2Value: formatCurrency(summary?.total_containers ? (summary.total_demurrage_cost || 0) / summary.total_containers : 0), barHighlight: 'var(--gold)',
              },
            ]} />

            {/* Carrier Breakdown */}
            {summary?.by_carrier && Object.keys(summary.by_carrier).length > 0 && (
              <SectionCard title="Carrier Breakdown">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {Object.entries(summary.by_carrier).map(([carrier, data]) => (
                    <div key={carrier} style={{ padding: 14, background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{carrier}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                        {data.count} containers · {formatCurrency(data.cost)}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {!summary && !loading && (
              <EmptyState icon="container" title="No demurrage data yet" sub="Add containers to start tracking demurrage costs." size="lg" />
            )}
          </div>
        </TabsContent>

        {/* ── Container Tracking ── */}
        <TabsContent value="containers">
          <SectionCard
            title="Container Demurrage Tracker"
            padded={false}
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={startAddC}>
                <Icon name="plus" size={13} /> Add Container
              </button>
            }
          >
            <div style={{ padding: '8px 18px', fontSize: 11.5, color: 'var(--ink3)' }}>{containers.length} container{containers.length === 1 ? '' : 's'}</div>

            {/* Inline add/edit form — full-width section, not a popup */}
            {showCForm && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
                  {editCId ? 'Edit Container' : 'Track New Container'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                  <label style={label}>
                    Container Number *
                    <input value={cForm.container_number} onChange={e => setCForm(f => ({ ...f, container_number: e.target.value.toUpperCase() }))} placeholder="MSKU1234567"
                      style={{ ...fieldInput, fontFamily: 'var(--mono)' }} />
                  </label>
                  <label style={label}>
                    Size
                    <Select value={cForm.container_size} onValueChange={v => setCForm(f => ({ ...f, container_size: v }))}>
                      <SelectTrigger style={{ width: '100%', boxSizing: 'border-box', marginTop: 4 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['20GP', '40GP', '40HC', '20RF', '40RF', '20OT', '40OT'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                  <label style={label}>
                    Carrier
                    <input value={cForm.carrier_name} onChange={e => setCForm(f => ({ ...f, carrier_name: e.target.value }))} placeholder="MAERSK"
                      style={fieldInput} />
                  </label>
                  <label style={label}>
                    Shipment (BL) {editCId ? '' : '*'}
                    <div style={{ marginTop: 4 }}>
                      <Combobox
                        options={shipments.slice(0, 100).map((s: any) => ({ value: s.id, label: `${s.ref_number}${s.bl_number ? ` — ${s.bl_number}` : ''}` }))}
                        value={cForm.shipment_id} onChange={v => setCForm(f => ({ ...f, shipment_id: v }))}
                        placeholder="Select shipment…"
                      />
                    </div>
                  </label>
                  <label style={label}>
                    Discharge Date
                    <div style={{ marginTop: 4 }}>
                      <DatePicker date={parseDateOnly(cForm.discharge_date)} onChange={d => setCForm(f => ({ ...f, discharge_date: toDateOnlyString(d) }))} />
                    </div>
                  </label>
                  <label style={label}>
                    Free Days
                    <input type="number" min={0} value={cForm.free_days} onChange={e => setCForm(f => ({ ...f, free_days: Number(e.target.value) }))}
                      style={fieldInput} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowCForm(false); setEditCId(null); }}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={submitCForm}>
                    {editCId ? 'Save Changes' : 'Start Tracking'}
                  </button>
                </div>
              </div>
            )}
            {containers.length === 0 ? (
              <EmptyState icon="container" title="No containers being tracked" />
            ) : (
              <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Container #', 'Size', 'Carrier', 'Discharged', 'Free Days', 'Total Days', 'Dem. Days', 'Cost', 'Status', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.container_number}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.container_size}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.carrier_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.discharge_date ? new Date(c.discharge_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.free_days}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{c.total_days}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge variant={c.demurrage_days > 0 ? 'error' : 'success'}>{c.demurrage_days}</Badge>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: c.demurrage_cost > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {formatCurrency(c.demurrage_cost, c.demurrage_currency)}
                          {c.demurrage_cost > 0 && c.liable_party === 'COMPANY' && (
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink3)', marginTop: 2 }}>Absorbed</div>
                          )}
                          {c.demurrage_cost > 0 && c.liable_party !== 'COMPANY' && c.recharged_invoice_id && (
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', marginTop: 2 }}>Recharged</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <StatusBadge status={c.status} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {c.demurrage_cost > 0 && c.liable_party !== 'COMPANY' && !c.recharged_invoice_id && (
                              <button
                                type="button"
                                onClick={() => openRecharge(c)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 10px', fontSize: 11, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-l)', border: '1px solid var(--gold-l)', borderRadius: 'var(--r)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                              >
                                <Icon name="receipt" size={11} /> Recharge
                              </button>
                            )}
                            {c.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => { setReturnModal(c.id); setReturnDate(new Date().toISOString().split('T')[0]); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 10px', fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', border: '1px solid var(--teal-l)', borderRadius: 'var(--r)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                              >
                                <Icon name="checkCircle" size={11} /> Returned
                              </button>
                            )}
                            <button
                              type="button"
                              title="Edit container"
                              onClick={() => startEditC(c)}
                              style={{ display: 'flex', alignItems: 'center', padding: 'var(--ds-btn-py-xs) 8px', color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                            >
                              <Icon name="edit" size={12} />
                            </button>
                            <button
                              type="button"
                              title="Remove from tracking"
                              onClick={() => deleteContainer(c.id)}
                              style={{ display: 'flex', alignItems: 'center', padding: 'var(--ds-btn-py-xs) 8px', color: 'var(--red)', background: 'var(--red-l)', border: '1px solid var(--red-l)', borderRadius: 'var(--r)', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Tariff Configuration ── */}
        <TabsContent value="tariffs">
          <SectionCard title="Demurrage Tariff Configuration" padded={false}>
            <div style={{ padding: '8px 18px', fontSize: 11.5, color: 'var(--ink3)' }}>Configure daily rates per shipping line and container size. Rates use progressive step-up tiers.</div>
            {tariffs.length === 0 ? (
              <EmptyState icon="sliders" title="No tariffs configured" sub="Use the API to add tariff rules." />
            ) : (
              <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Carrier', 'Container Size', 'Free Days', 'Rate Tiers', 'Currency', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tariffs.map(t => {
                      let tiers: any[] = [];
                      try { tiers = JSON.parse(t.rate_tiers); } catch {}
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)' }}>{t.carrier_name}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.container_size}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.free_days} days</td>
                          <td style={{ padding: '10px 14px' }}>
                            {tiers.map((tier, i) => (
                              <span key={i} style={{ display: 'inline-block', marginRight: 8, marginBottom: 4, padding: '2px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--ink2)' }}>
                                Day {tier.from_day}-{tier.to_day}: ${tier.daily_rate}/day
                              </span>
                            ))}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.currency}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge variant={t.active ? 'success' : 'gray'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Quick Calculator ── */}
        <TabsContent value="calculator">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
            <SectionCard title="Demurrage Calculator">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', ...label, marginBottom: 4 }}>Carrier / Shipping Line</label>
                  <input type="text" value={calcCarrier} onChange={e => setCalcCarrier(e.target.value)} placeholder="e.g. MSC, Maersk" style={{ ...fieldInput, marginTop: 0 }} />
                </div>
                <div>
                  <label style={{ display: 'block', ...label, marginBottom: 4 }}>Container Size</label>
                  <Select value={calcSize} onValueChange={setCalcSize}>
                    <SelectTrigger style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20FT">20FT</SelectItem>
                      <SelectItem value="40FT">40FT</SelectItem>
                      <SelectItem value="40HC">40HC</SelectItem>
                      <SelectItem value="45HC">45HC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', ...label, marginBottom: 4 }}>Discharge Date</label>
                  <DatePicker date={parseDateOnly(calcDischargeDate)} onChange={d => setCalcDischargeDate(toDateOnlyString(d))} />
                </div>
                <div>
                  <label style={{ display: 'block', ...label, marginBottom: 4 }}>Return Date (leave blank for today)</label>
                  <DatePicker date={parseDateOnly(calcReturnDate)} onChange={d => setCalcReturnDate(toDateOnlyString(d))} />
                </div>
                <div>
                  <label style={{ display: 'block', ...label, marginBottom: 4 }}>Free Days</label>
                  <input type="number" value={calcFreeDays} onChange={e => setCalcFreeDays(Number(e.target.value))} style={{ ...fieldInput, marginTop: 0 }} />
                </div>
                <button type="button" className="btn btn-primary" onClick={handleQuickCalc} style={{ justifyContent: 'center', height: 42 }}>
                  Calculate Demurrage
                </button>
              </div>
            </SectionCard>

            {/* Result Panel */}
            <div style={{ ...cardPad, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: calcResult ? 'var(--white)' : 'var(--bg)' }}>
              {calcResult ? (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                    <Icon name="clipboardList" size={15} color="var(--ink2)" />
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Calculation Result</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                    {[
                      { label: 'Total Days', value: calcResult.total_days, color: 'var(--blue)' },
                      { label: 'Free Days', value: calcResult.free_days, color: 'var(--green)' },
                      { label: 'Demurrage Days', value: calcResult.demurrage_days, color: calcResult.demurrage_days > 0 ? 'var(--red)' : 'var(--green)' },
                    ].map((item, i) => (
                      <div key={i} style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                      </div>
                    ))}
                    <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, marginBottom: 6 }}>Tariff Found</div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Badge variant={calcResult.tariff_found ? 'success' : 'gray'}>
                          <Icon name={calcResult.tariff_found ? 'checkCircle' : 'xCircle'} size={11} />
                          {calcResult.tariff_found ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    marginTop: 20, padding: 20, borderRadius: 10, textAlign: 'center',
                    background: calcResult.demurrage_cost > 0 ? 'var(--red-l)' : 'var(--green-l)',
                    border: `1px solid ${calcResult.demurrage_cost > 0 ? 'var(--red-l)' : 'var(--green-l)'}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Estimated Demurrage Cost</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: calcResult.demurrage_cost > 0 ? 'var(--red)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(calcResult.demurrage_cost, calcResult.currency)}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState icon="calculator" title="Enter details and calculate" sub="Results will appear here" />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Mark Returned Modal */}
      <Dialog open={!!returnModal} onOpenChange={open => { if (!open) setReturnModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FeaturedIcon variant="success" size="sm" shape="circle"><Icon name="checkCircle" size={15} /></FeaturedIcon>
              Mark Container Returned
            </DialogTitle>
          </DialogHeader>
          <div>
            <label style={{ display: 'block', ...label, marginBottom: 6 }}>Return Date</label>
            <DatePicker date={parseDateOnly(returnDate)} onChange={d => setReturnDate(toDateOnlyString(d))} />
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-secondary" onClick={() => setReturnModal(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleMarkReturned}>Confirm Return</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recharge to Invoice Modal */}
      <Dialog open={!!rechargeContainer} onOpenChange={open => { if (!open) setRechargeContainer(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FeaturedIcon variant="warning" size="sm" shape="circle"><Icon name="receipt" size={15} /></FeaturedIcon>
              Recharge Demurrage
            </DialogTitle>
          </DialogHeader>
          {rechargeContainer && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14 }}>
                Adds <strong>{formatCurrency(rechargeContainer.demurrage_cost, rechargeContainer.demurrage_currency)}</strong> for container <strong style={{ fontFamily: 'var(--mono)' }}>{rechargeContainer.container_number}</strong> as a line on the selected invoice.
              </div>
              <label style={{ display: 'block', ...label, marginBottom: 6 }}>Invoice</label>
              <Combobox
                options={invoiceOptions}
                value={rechargeInvoiceId}
                onChange={setRechargeInvoiceId}
                placeholder="Select an invoice…"
                searchPlaceholder="Search invoices…"
                emptyText="No invoices found."
              />
            </div>
          )}
          <DialogFooter>
            <button type="button" className="btn btn-secondary" onClick={() => setRechargeContainer(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!rechargeInvoiceId || rechargeSaving} onClick={submitRecharge}>
              {rechargeSaving ? 'Recharging…' : 'Recharge'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
