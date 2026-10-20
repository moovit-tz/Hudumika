import { FLEET_PARTNER_CATEGORIES } from '@hudumika/types';
import { Checkbox } from '../components/ui/checkbox.js';
import { vendorCategory, vendorActivity } from '../lib/vendor-category.js';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { BackButton } from '../components/ui/BackButton.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import { Banner } from '../components/ui/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './FreightOperations.css';
import './TrackingVendorDetail.css';

interface Vendor {
  id: string;
  name: string;
  vendor_type: string;
  service_capabilities?: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MaintenanceRecord {
  id: string;
  service_type: string;
  cost: number | null;
  service_date: string;
  next_due_date: string | null;
  vehicle_name?: string;
  vehicle_plate?: string;
}

interface SparePart {
  id: string;
  part_name: string;
  part_number: string | null;
  category: string | null;
  quantity: number;
  unit_cost: number | null;
  reorder_level: number;
}

interface FuelLog {
  id: string;
  liters: number;
  cost: number | null;
  logged_at: string;
  vehicle_name?: string;
  vehicle_plate?: string;
}

interface Expense {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string | null;
  vehicle_name?: string;
  vehicle_plate?: string;
}

interface VendorDetailData {
  vendor: Vendor;
  maintenance: MaintenanceRecord[];
  parts: SparePart[];
  fuel: FuelLog[];
  expenses: Expense[];
}

const VENDOR_TYPES = FLEET_PARTNER_CATEGORIES.map(c => ({ ...c, icon: (c.type === 'FINANCING' ? 'dollarSign' : c.type === 'PARTS_SUPPLIER' ? 'package' : 'tool') as IconName, colorClass: c.type }));

function getVendorTypeMeta(type: string) {
  const match = VENDOR_TYPES.find(v => v.type === type);
  return match || { type, label: type.replace(/_/g, ' '), icon: 'briefcase' as IconName, colorClass: 'OTHER' };
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `TZS ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `TZS ${(amount / 1_000).toFixed(0)}k`;
  return `TZS ${Math.round(amount).toLocaleString()}`;
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

// Edit Vendor Modal
function EditVendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vendor.name);
  const [vendorType, setVendorType] = useState(vendor.vendor_type);
  const [phone, setPhone] = useState(vendor.phone || '');
  const [email, setEmail] = useState(vendor.email || '');
  const [address, setAddress] = useState(vendor.address || '');
  const [notes, setNotes] = useState(vendor.notes || '');
  const [services, setServices] = useState<string[]>(vendor?.service_capabilities || []);
  const [active, setActive] = useState(vendor.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/tracking/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          vendor_type: vendorType,
        service_capabilities: services,
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim(),
          notes: notes.trim(),
          active,
        }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update vendor particulars.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(480px,94vw)] gap-0" style={{ padding: 28, maxHeight: '90dvh', overflowY: 'auto' }}>
        <DialogTitle style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 18 }}>
          Edit Vendor Particulars
        </DialogTitle>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="edit-vendor-name" style={labelStyle}>Company / Vendor Name *</label>
            <Input id="edit-vendor-name" required value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Vendor Category / Role</label>
            <Select value={vendorType} onValueChange={setVendorType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENDOR_TYPES.map(t => (
                  <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={labelStyle}>Additional services</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
              {VENDOR_TYPES.filter(c => c.type !== vendorType).map(c => <label key={c.type} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <Checkbox checked={services.includes(c.type)} onCheckedChange={checked => setServices(current => checked ? [...current, c.type] : current.filter(value => value !== c.type))} />{c.label}
              </label>)}
            </div>
          </fieldset>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="edit-vendor-phone" style={labelStyle}>Primary Phone</label>
              <Input id="edit-vendor-phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="edit-vendor-email" style={labelStyle}>Email Address</label>
              <Input id="edit-vendor-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="edit-vendor-address" style={labelStyle}>Depot / Facility Location</label>
            <Input id="edit-vendor-address" value={address} onChange={e => setAddress(e.target.value)} />
          </div>

          <div>
            <label htmlFor="edit-vendor-notes" style={labelStyle}>{vendorCategory(vendorType).notes}</label>
            <Input id="edit-vendor-notes" placeholder={vendorCategory(vendorType).hint} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="edit-vendor-active"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
            />
            <label htmlFor="edit-vendor-active" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              Active vendor record
            </label>
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const TrackingVendorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<VendorDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'maintenance' | 'parts' | 'fuel' | 'expenses'>('overview');
  const [showEditModal, setShowEditModal] = useState(false);

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    apiFetch(`/v1/tracking/vendors/${id}`)
      .then(res => setData(res as VendorDetailData))
      .catch(e => setError(e.message || 'Could not load vendor particulars.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  async function handleDelete() {
    if (!data) return;
    if (!(await showConfirm(`Remove vendor "${data.vendor.name}"? Linked vehicle, parts, and fuel logs will be preserved.`, { confirmLabel: 'Remove Vendor' }))) {
      return;
    }
    try {
      await apiFetch(`/v1/tracking/vendors/${data.vendor.id}`, { method: 'DELETE' });
      navigate('/tracking/vendors');
    } catch (err: any) {
      setError(err.message || 'Failed to remove vendor.');
    }
  }

  if (loading) {
    return (
      <div className="freight-workspace">
        <BackButton to="/tracking/vendors" label="Back to Vendors" />
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>
          Loading vendor particulars…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="freight-workspace">
        <BackButton to="/tracking/vendors" label="Back to Vendors" />
        <Banner variant="error">{error || 'Vendor not found.'}</Banner>
        <div style={{ marginTop: 20 }}>
          <Button onClick={() => navigate('/tracking/vendors')}>Return to Vendors Directory</Button>
        </div>
      </div>
    );
  }

  const { vendor, maintenance, parts, fuel, expenses } = data;
  const category = vendorCategory(vendor.vendor_type);
  const commercial = ['FINANCING', 'LEASING', 'VEHICLE_HIRE', 'INSURANCE'].includes(vendor.vendor_type);
  const meta = getVendorTypeMeta(vendor.vendor_type);

  // Financial & Operational Aggregates
  const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0);
  const totalFuelCost = fuel.reduce((sum, f) => sum + (f.cost ?? 0), 0);
  const totalExpensesCost = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSpend = totalMaintenanceCost + totalFuelCost + totalExpensesCost;
  const totalEngagements = maintenance.length + parts.length + fuel.length + expenses.length;
  const totalFuelLiters = fuel.reduce((sum, f) => sum + f.liters, 0);
  const totalPartsValue = parts.reduce((sum, p) => sum + (p.quantity * (p.unit_cost ?? 0)), 0);

  return (
    <div className="trk-vendor-detail-container">
      {/* Edit Modal */}
      {showEditModal && (
        <EditVendorModal
          vendor={vendor}
          onClose={() => setShowEditModal(false)}
          onSaved={reload}
        />
      )}

      {/* Back button & PageHeader */}
      <div>
        <BackButton to="/tracking/vendors" label="Back to Vendors" />
        <PageHeader
          crumbs={['HuduFreight', 'Vendors', vendor.name]}
          titlePlain={vendor.name}
          titleEm={meta.label}
          subtitle={`Registered fleet service provider (${meta.label}) — category-specific services and recorded activity.`}
          actions={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                asChild
              >
                <Link to="/finance/bills" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="fileText" size={14} /> FinOps Bills
                </Link>
              </Button>
              <Button
                onClick={() => setShowEditModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="edit" size={14} /> Edit Details
              </Button>
              <Button
                variant="ghost"
                onClick={handleDelete}
                style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="trash" size={14} /> Remove
              </Button>
            </div>
          }
        />
      </div>

      {/* Profile Hero Card */}
      <div className="trk-vd-hero">
        <div className="trk-vd-hero-left">
          <div className={`trk-vd-avatar-lg ${meta.colorClass}`}>
            <Icon name={meta.icon} size={30} />
          </div>
          <div className="trk-vd-hero-meta">
            <div className="trk-vd-name">{vendor.name}</div>
            <div className="trk-vd-badges">
              <Badge variant="outline">{meta.label}</Badge>
              <Badge variant={vendor.active ? 'success' : 'gray'}>
                {vendor.active ? 'ACTIVE PARTNER' : 'INACTIVE'}
              </Badge>
              {vendor.updated_at && (
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Profile updated {new Date(vendor.updated_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className="trk-vd-contact-pills">
              {vendor.phone ? (
                <div className="trk-vd-contact-pill">
                  <Icon name="phone" size={14} color="var(--teal)" />
                  <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>
                </div>
              ) : (
                <div className="trk-vd-contact-pill" style={{ color: 'var(--ink3)' }}>
                  <Icon name="phone" size={14} />
                  <span>No phone recorded</span>
                </div>
              )}

              {vendor.email && (
                <div className="trk-vd-contact-pill">
                  <Icon name="mail" size={14} color="var(--teal)" />
                  <a href={`mailto:${vendor.email}`}>{vendor.email}</a>
                </div>
              )}

              {vendor.address && (
                <div className="trk-vd-contact-pill">
                  <Icon name="mapPin" size={14} color="var(--teal)" />
                  <span>{vendor.address}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="trk-vd-hero-actions">
          {vendor.phone && (
            <a
              href={`tel:${vendor.phone}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              <Icon name="phone" size={14} color="var(--teal)" /> Call Facility
            </a>
          )}
          {vendor.email && (
            <a
              href={`mailto:${vendor.email}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              <Icon name="mail" size={14} color="var(--teal)" /> Send Email
            </a>
          )}
        </div>
      </div>

      <div className="trk-vd-kpi-grid">
        <div className="trk-vd-kpi-card"><span className="trk-vd-kpi-val">{vendorActivity({ ...vendor, maintenance_count: maintenance.length, parts_count: parts.length, fuel_logs_count: fuel.length, expenses_count: expenses.length })}</span><span className="trk-vd-kpi-lbl">{category.activity} · recent records</span></div>
        <div className="trk-vd-kpi-card"><span className="trk-vd-kpi-val">{commercial ? 'Not linked' : formatCurrency(vendor.vendor_type === 'PARTS_SUPPLIER' ? totalPartsValue : vendor.vendor_type === 'FUEL_STATION' ? totalFuelCost : vendor.vendor_type === 'WORKSHOP' ? totalMaintenanceCost : totalExpensesCost)}</span><span className="trk-vd-kpi-lbl">{commercial ? 'Contract / payment balance' : vendor.vendor_type === 'PARTS_SUPPLIER' ? 'Current stock value' : 'Recent recorded cost'}</span></div>
      </div>

      {/* Navigation Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as any)}
        variant="segmented"
      >
        <TabsList wrap>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {(vendor.vendor_type === 'WORKSHOP' || vendor.service_capabilities?.includes('WORKSHOP') || maintenance.length > 0) && <TabsTrigger value="maintenance">Maintenance History ({maintenance.length})</TabsTrigger>}
          {(vendor.vendor_type === 'PARTS_SUPPLIER' || vendor.service_capabilities?.includes('PARTS_SUPPLIER') || parts.length > 0) && <TabsTrigger value="parts">Parts Catalog ({parts.length})</TabsTrigger>}
          {(vendor.vendor_type === 'FUEL_STATION' || vendor.service_capabilities?.includes('FUEL_STATION') || fuel.length > 0) && <TabsTrigger value="fuel">Fuel Dispenses ({fuel.length})</TabsTrigger>}
          <TabsTrigger value="expenses">Logged Expenses ({expenses.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* TAB 1: OVERVIEW & PARTICULARS */}
      {activeTab === 'overview' && (
        <div className="trk-vd-overview-grid">
          {/* Facility & Contact Particulars */}
          <SectionCard title="Contact & Facility Particulars">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Company Name</span>
                <strong style={{ color: 'var(--ink)' }}>{vendor.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Primary Role</span>
                <strong style={{ color: 'var(--ink)' }}>{meta.label}{vendor.service_capabilities?.length ? ' · ' + vendor.service_capabilities.map(type => getVendorTypeMeta(type).label).join(' · ') : ''}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Phone Number</span>
                <strong style={{ color: 'var(--ink)' }}>{vendor.phone || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Email Address</span>
                <strong style={{ color: 'var(--ink)' }}>{vendor.email || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Depot / Physical Address</span>
                <strong style={{ color: 'var(--ink)', textAlign: 'right', maxWidth: 260 }}>{vendor.address || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: 'var(--ink3)' }}>Account Status</span>
                <Badge variant={vendor.active ? 'success' : 'gray'}>
                  {vendor.active ? 'Active record' : 'Inactive record'}
                </Badge>
              </div>
            </div>
          </SectionCard>

          {/* Commercial Terms & FinOps Integration */}
          <SectionCard title="Services & commercial terms">
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{category.notes}:</div>
              <p style={{ margin: '0 0 12px' }}>
                {vendor.notes || 'No service details or agreed commercial terms recorded.'}
              </p>
              <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                  <Icon name="checkCircle" size={16} color="var(--green)" />
                  <span>Financial records</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: 0 }}>
                  Manage supplier bills and payments in FinOps. This profile does not establish a linked finance account, contract balance or automatic reconciliation.
                </p>
              </div>
              <div style={{ marginTop: 14 }}>
                <Button variant="outline" asChild>
                  <Link to="/finance/bills" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="fileText" size={14} /> Open bills
                  </Link>
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={category.label}><p>{commercial ? 'Agreement and payment records are not linked to this vendor profile. Use the relevant workspace to review actual records.' : 'Open the operational register for this service category.'}</p><Button variant="outline" asChild><Link to={category.path}>{category.label}</Link></Button></SectionCard>
        </div>
      )}

      {/* TAB 2: MAINTENANCE HISTORY */}
      {activeTab === 'maintenance' && (
        <SectionCard
          title="Workshop Maintenance &amp; Work Orders"
          action={
            <Button asChild size="sm">
              <Link to="/tracking/issues" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={13} /> Log Defect / Work Order
              </Link>
            </Button>
          }
        >
          {maintenance.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No workshop service work orders logged with this facility yet.
            </div>
          ) : (
            <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Service Performed</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vehicle</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Service Date</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Next Due</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.map(m => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>{m.service_type}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                      {m.vehicle_name ? `${m.vehicle_name} (${m.vehicle_plate || 'No plate'})` : 'Fleet Asset'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{new Date(m.service_date).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>
                      {m.next_due_date ? new Date(m.next_due_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                      {m.cost != null ? formatCurrency(m.cost) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          )}
        </SectionCard>
      )}

      {/* TAB 3: PARTS CATALOG */}
      {activeTab === 'parts' && (
        <SectionCard
          title="Warehouse Spare Parts Supplied"
          action={
            <Button asChild size="sm">
              <Link to="/tracking/parts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="package" size={13} /> Open Parts Warehouse
              </Link>
            </Button>
          }
        >
          {parts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No spare parts catalogued under this supplier.
            </div>
          ) : (
            <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Part Name &amp; SKU</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Stock Qty</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.part_name}</div>
                      {p.part_number && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>SKU: {p.part_number}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{p.category || 'General'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                      <span style={{ color: p.quantity <= p.reorder_level ? 'var(--red)' : 'var(--ink)' }}>
                        {p.quantity} units
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--ink2)' }}>
                      {p.unit_cost != null ? formatCurrency(p.unit_cost) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                      {p.unit_cost != null ? formatCurrency(p.quantity * p.unit_cost) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          )}
        </SectionCard>
      )}

      {/* TAB 4: FUEL LOGS */}
      {activeTab === 'fuel' && (
        <SectionCard
          title="Fuel Dispenses &amp; Station History"
          action={
            <Button asChild size="sm">
              <Link to="/tracking/fuel" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="zap" size={13} /> Fuel Management
              </Link>
            </Button>
          }
        >
          {fuel.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No fuel logs recorded at this vendor facility.
            </div>
          ) : (
            <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vehicle</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Dispense Date</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Volume (Liters)</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {fuel.map(f => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                      {f.vehicle_name ? `${f.vehicle_name} (${f.vehicle_plate || 'No plate'})` : 'Fleet Vehicle'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{new Date(f.logged_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>
                      {f.liters} L
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                      {f.cost != null ? formatCurrency(f.cost) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          )}
        </SectionCard>
      )}

      {/* TAB 5: EXPENSES */}
      {activeTab === 'expenses' && (
        <SectionCard
          title="Direct Fleet Expenses Logged"
          action={
            <Button asChild size="sm">
              <Link to="/finance/expenses" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="dollarSign" size={13} /> FinOps Expenses
              </Link>
            </Button>
          }
        >
          {expenses.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No direct expenses logged against this vendor.
            </div>
          ) : (
            <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category &amp; Description</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vehicle</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{e.category}</div>
                      {e.description && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.description}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                      {e.vehicle_name ? `${e.vehicle_name} (${e.vehicle_plate || 'No plate'})` : 'Fleet General'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{new Date(e.expense_date).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                      {formatCurrency(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          )}
        </SectionCard>
      )}
    </div>
  );
};

export default TrackingVendorDetail;
