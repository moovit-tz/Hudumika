import { Button } from '../components/ui/button.js';
import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ConsignmentDemurrage } from '../components/ConsignmentDemurrage.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
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
import { ContainerTrackerCard } from '../components/container/ContainerTrackerCard.js';
import { CarrierSelect } from '../components/container/CarrierSelect.js';
import { CarrierLogo } from '../components/container/CarrierLogo.js';
import { getContainerDetails } from '../components/container/containerData.js';
import type { ContainerDetails } from '../components/container/containerTypes.js';

interface Tariff {
  id: string;
  carrier_name: string;
  container_size: string;
  free_days: number;
  rate_tiers: string;
  currency: string;
  active: boolean;
  effective_from: string;
}

interface ContainerTrack {
  tariff_snapshot?: unknown;
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

type ViewMode = 'consignment' | 'containers' | 'tariffs';

const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)' };
const fieldInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font)' };

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const bill = searchParams.get('bl') || '';
  const requestedView = searchParams.get('view');
  const view: ViewMode = requestedView === 'containers' || requestedView === 'tariffs' ? requestedView : 'consignment';
  const { user } = useAuth();
  const canManageTariffs = user != null && MGMT_ROLES.includes(user.role);
  const isMobile = useIsMobile();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [containers, setContainers] = useState<ContainerTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [tariffError, setTariffError] = useState('');
  const [containerError, setContainerError] = useState('');

  // Rich container 3D inspection modal
  const [inspectingContainer, setInspectingContainer] = useState<ContainerDetails | null>(null);

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
    const [tariffResult, containerResult] = await Promise.allSettled([
      apiFetch<Tariff[]>('/v1/demurrage'),
      apiFetch<ContainerTrack[]>('/v1/demurrage/containers'),
    ]);
    if (tariffResult.status === 'fulfilled') setTariffs(tariffResult.value);
    if (containerResult.status === 'fulfilled') setContainers(containerResult.value);
    setTariffError(tariffResult.status === 'rejected' ? 'Could not load tariffs. Refresh to try again.' : '');
    setContainerError(containerResult.status === 'rejected' ? 'Could not load tracked containers. Refresh to try again.' : '');
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

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
        titlePlain="Demurrage &"
        titleEm="detention"
        subtitle="Estimate storage and carrier charges by bill of lading, track container returns, and review the rates used."
      />

      <Tabs value={view} onValueChange={value => setSearchParams(previous => {
        const next = new URLSearchParams(previous);
        if (value === 'consignment') next.delete('view');
        else next.set('view', value);
        return next;
      })}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <TabsList wrap aria-label="Demurrage sections">
            <TabsTrigger value="consignment"><Icon name="fileText" size={14} /><span className="ds-tabs-trigger-label">B/L estimate</span></TabsTrigger>
            <TabsTrigger value="containers"><Icon name="container" size={14} /><span className="ds-tabs-trigger-label">Tracked containers</span></TabsTrigger>
            <TabsTrigger value="tariffs"><Icon name="sliders" size={14} /><span className="ds-tabs-trigger-label">Tariffs</span></TabsTrigger>
          </TabsList>
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void fetchData()}>
            <Icon name="refresh" size={14} />
            {loading ? 'Refreshing records…' : 'Refresh records'}
          </Button>
        </div>
        {(view === 'containers' ? containerError : tariffError) && (
          <p role="alert" className="mb-3 text-sm text-destructive">{view === 'containers' ? containerError : tariffError}</p>
        )}

        {/* ── Container Tracking ── */}
        <TabsContent value="containers">
          <SectionCard
            title="Container Demurrage Tracker"
            padded={false}
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={startAddC} data-ui-native-button="">
                <Icon name="plus" size={13} /> Add Container
              </button>
            }
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm text-(--ink2)">
              <span>{containers.length} tracked</span>
              <span>{containers.filter(container => container.status === 'ACTIVE').length} active</span>
              <span>{containers.filter(container => container.status === 'COMPLETED').length} returned</span>
              <span>{containers.filter(container => container.status === 'ACTIVE' && container.demurrage_days > 0 && !container.tariff_snapshot).length} awaiting a tariff</span>
            </div>

            {/* Inline add/edit form — full-width section, not a popup */}
            {showCForm && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
                  {editCId ? 'Edit Container' : 'Track New Container'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                  <label style={label}>
                    Container Number *
                    <input data-ui-field="input" value={cForm.container_number} onChange={e => setCForm(f => ({ ...f, container_number: e.target.value.toUpperCase() }))} placeholder="MSKU1234567"
                      style={{ ...fieldInput, fontFamily: 'var(--font)' }} />
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
                  <div>
                    <CarrierSelect
                      label="Carrier (Shipping Line)"
                      containerNumber={cForm.container_number}
                      value={cForm.carrier_name}
                      onChange={(name) => setCForm(f => ({ ...f, carrier_name: name }))}
                      placeholder="Select carrier..."
                      size="sm"
                    />
                  </div>
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
                    <input data-ui-field="input" type="number" min={0} value={cForm.free_days} onChange={e => setCForm(f => ({ ...f, free_days: Number(e.target.value) }))}
                      style={fieldInput} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowCForm(false); setEditCId(null); }} data-ui-native-button="">
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={submitCForm} data-ui-native-button="">
                    {editCId ? 'Save Changes' : 'Start Tracking'}
                  </button>
                </div>
              </div>
            )}
            {containers.length === 0 ? (
              !loading && !containerError && <EmptyState icon="container" title="No containers being tracked" sub="Add a container to record its charges and empty return." />
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
                        <td style={{ padding: '10px 14px' }}>
                          <Link
                            to={`/cargotracker/containers/${c.container_number}`}
                            style={{
                              background: 'none', border: 'none', padding: 0,
                              fontWeight: 700, fontFamily: 'var(--font)', color: 'var(--teal)',
                              cursor: 'pointer', textAlign: 'left', textDecoration: 'none',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                            className="hover:underline"
                          >
                            <Icon name="container" size={13} color="var(--teal)" />
                            {c.container_number}
                          </Link>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.container_size}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {c.carrier_name ? (
                            <CarrierLogo carrier={c.carrier_name} size="xs" variant="badge" />
                          ) : (
                            <span style={{ color: 'var(--ink3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.discharge_date ? new Date(c.discharge_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{c.free_days}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{c.total_days}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge variant={c.demurrage_days > 0 ? 'error' : 'success'}>{c.demurrage_days}</Badge>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: c.demurrage_cost > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {c.status==='ACTIVE' && c.demurrage_days>0 && !c.tariff_snapshot ? 'Tariff required' : formatCurrency(c.demurrage_cost, c.demurrage_currency)}
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
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 10px', fontSize: "var(--text-xs)", fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-l)', border: '1px solid var(--gold-l)', borderRadius: 'var(--r)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                               data-ui-native-button="">
                                <Icon name="receipt" size={11} /> Recharge
                              </button>
                            )}
                            {c.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => { setReturnModal(c.id); setReturnDate(new Date().toISOString().split('T')[0]); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 10px', fontSize: "var(--text-xs)", fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', border: '1px solid var(--teal-l)', borderRadius: 'var(--r)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                               data-ui-native-button="">
                                <Icon name="checkCircle" size={11} /> Returned
                              </button>
                            )}
                            <button
                              type="button"
                              title="Edit container"
                              onClick={() => startEditC(c)}
                              style={{ display: 'flex', alignItems: 'center', padding: 'var(--ds-btn-py-xs) 8px', color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                             data-ui-native-button="">
                              <Icon name="edit" size={12} />
                            </button>
                            <button
                              type="button"
                              title="Remove from tracking"
                              onClick={() => deleteContainer(c.id)}
                              style={{ display: 'flex', alignItems: 'center', padding: 'var(--ds-btn-py-xs) 8px', color: 'var(--red)', background: 'var(--red-l)', border: '1px solid var(--red-l)', borderRadius: 'var(--r)', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                             data-ui-native-button="">
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
          <SectionCard title="Rate schedules" padded={false} action={canManageTariffs &&
            <Button variant="outline" size="sm" onClick={() => navigate('/cargotracker/demurrage/tariffs/new')}>Add tariff</Button>
          }>
            <p className="px-4 py-3 text-sm text-(--ink2)">Review dated free days and daily rates by facility or carrier and container size.</p>
            {tariffs.length === 0 ? (
              !loading && !tariffError && <EmptyState icon="sliders" title="No tariffs configured" sub={canManageTariffs ? 'Add a dated tariff to calculate charges.' : 'A manager can add a dated tariff for this workspace.'} />
            ) : (
              <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
                <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Schedule', 'Container size', 'Free days', 'Daily rates', 'Currency', 'Effective from', 'Status', ...(canManageTariffs ? ['Actions'] : [])].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tariffs.map(t => {
                      let tiers: any[] = [];
                      try { tiers = (typeof t.rate_tiers === 'string' ? JSON.parse(t.rate_tiers) : t.rate_tiers); } catch {}
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <CarrierLogo carrier={t.carrier_name} size="xs" variant="badge" />
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.container_size}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.free_days} days</td>
                          <td style={{ padding: '10px 14px' }}>
                            {tiers.map((tier, i) => (
                              <span key={i} style={{ display: 'inline-block', marginRight: 8, marginBottom: 4, padding: '2px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--ink2)' }}>
                                Day {tier.from_day}-{tier.to_day}: {formatCurrency(tier.daily_rate, t.currency)}/day
                              </span>
                            ))}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.currency}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{t.effective_from?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge variant={t.active ? 'success' : 'gray'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          {canManageTariffs && <td><Button variant="outline" size="sm" onClick={() => navigate(`/cargotracker/demurrage/tariffs/${t.id}/edit`)}>Edit</Button></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Consignment Estimate ── */}
        <TabsContent value="consignment" forceMount className="data-[state=inactive]:hidden">
          <ConsignmentDemurrage initialBill={bill} schedules={[...new Set(tariffs.filter(tariff => tariff.active).map(tariff => tariff.carrier_name))]} />
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
            <button type="button" className="btn btn-secondary" onClick={() => setReturnModal(null)} data-ui-native-button="">Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleMarkReturned} data-ui-native-button="">Confirm Return</button>
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
                Adds <strong>{formatCurrency(rechargeContainer.demurrage_cost, rechargeContainer.demurrage_currency)}</strong> for container <strong style={{ fontFamily: 'var(--font)' }}>{rechargeContainer.container_number}</strong> as a line on the selected invoice.
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
            <button type="button" className="btn btn-secondary" onClick={() => setRechargeContainer(null)} data-ui-native-button="">Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!rechargeInvoiceId || rechargeSaving} onClick={submitRecharge} data-ui-native-button="">
              {rechargeSaving ? 'Recharging…' : 'Recharge'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 3D Container Specs & Survey Lightbox Dialog ── */}
      <Dialog open={!!inspectingContainer} onOpenChange={open => { if (!open) setInspectingContainer(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="mb-4 pb-2 border-b border-[var(--border)]">
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <Icon name="container" size={18} color="var(--teal)" />
              Container Specifications &amp; Inspection: {inspectingContainer?.container_number}
            </DialogTitle>
          </DialogHeader>
          {inspectingContainer && (
            <ContainerTrackerCard
              container={inspectingContainer}
              initialTab="details"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
