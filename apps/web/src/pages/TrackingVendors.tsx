import { FLEET_PARTNER_CATEGORIES } from '@hudumika/types';
import { Checkbox } from '../components/ui/checkbox.js';
import { vendorCategory, vendorActivity } from '../lib/vendor-category.js';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import { Banner } from '../components/ui/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { Tip } from '../components/ui/tooltip.js';
import './FreightOperations.css';
import './TrackingVendors.css';

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
  maintenance_count?: number;
  maintenance_spend?: number;
  parts_count?: number;
  parts_inventory_value?: number;
  fuel_logs_count?: number;
  fuel_spend?: number;
  fuel_liters?: number;
  expenses_count?: number;
  expenses_spend?: number;
  total_spend?: number;
  total_records?: number;
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

// Add / Edit Vendor Modal
function VendorFormModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor?: Vendor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vendor?.name || '');
  const [vendorType, setVendorType] = useState(vendor?.vendor_type || 'WORKSHOP');
  const [phone, setPhone] = useState(vendor?.phone || '');
  const [email, setEmail] = useState(vendor?.email || '');
  const [address, setAddress] = useState(vendor?.address || '');
  const [notes, setNotes] = useState(vendor?.notes || '');
  const [services, setServices] = useState<string[]>(vendor?.service_capabilities || []);
  const [active, setActive] = useState(vendor ? vendor.active : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(vendor);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        vendor_type: vendorType,
        service_capabilities: services,
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim(),
        notes: notes.trim(),
        active,
      };

      if (isEditing && vendor) {
        await apiFetch(`/v1/tracking/vendors/${vendor.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/v1/tracking/vendors', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save vendor details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(480px,94vw)] gap-0" style={{ padding: 28, maxHeight: '90dvh', overflowY: 'auto' }}>
        <DialogTitle style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 18 }}>
          {isEditing ? 'Edit Service Vendor' : 'Add Fleet Service Vendor'}
        </DialogTitle>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="vendor-name-field" style={labelStyle}>Company / Vendor Name *</label>
            <Input id="vendor-name-field" required value={name} onChange={e => setName(e.target.value)} placeholder="Company name" />
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
              <label htmlFor="vendor-phone-field" style={labelStyle}>Primary Phone</label>
              <Input id="vendor-phone-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255 7..." />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="vendor-email-field" style={labelStyle}>Email Address</label>
              <Input id="vendor-email-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="service@vendor.co.tz" />
            </div>
          </div>

          <div>
            <label htmlFor="vendor-address-field" style={labelStyle}>Physical Address / Depot Location</label>
            <Input id="vendor-address-field" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Nyerere Road, Dar es Salaam" />
          </div>

          <div>
            <label htmlFor="vendor-notes-field" style={labelStyle}>{vendorCategory(vendorType).notes}</label>
            <Input id="vendor-notes-field" value={notes} onChange={e => setNotes(e.target.value)} placeholder={vendorCategory(vendorType).hint} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="vendor-active-toggle"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
            />
            <label htmlFor="vendor-active-toggle" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              Active vendor record
            </label>
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const TrackingVendors: React.FC = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  const reportError = (e: unknown) => setPageError(e instanceof Error ? e.message : 'Unable to load records.');

  const reload = useCallback(() => {
    setPageError('');
    setLoading(true);
    apiFetch('/v1/tracking/vendors')
      .then(res => setVendors(Array.isArray(res) ? res : []))
      .catch(reportError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function remove(v: Vendor) {
    if (!(await showConfirm(`Remove vendor "${v.name}"? Linked operational records will remain intact.`, { confirmLabel: 'Remove Vendor' }))) {
      return;
    }
    try {
      await apiFetch(`/v1/tracking/vendors/${v.id}`, { method: 'DELETE' });
      reload();
    } catch (err: any) {
      setPageError(err.message || 'Failed to remove vendor.');
    }
  }

  // Filtered vendors
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      if (categoryFilter !== 'all' && v.vendor_type !== categoryFilter && !v.service_capabilities?.includes(categoryFilter)) return false;

      // Status filter
      if (statusFilter === 'ACTIVE' && !v.active) return false;
      if (statusFilter === 'INACTIVE' && v.active) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = (
          v.name.toLowerCase().includes(q) ||
          (v.phone && v.phone.toLowerCase().includes(q)) ||
          (v.email && v.email.toLowerCase().includes(q)) ||
          (v.address && v.address.toLowerCase().includes(q)) ||
          (v.notes && v.notes.toLowerCase().includes(q)) ||
          v.vendor_type.toLowerCase().includes(q) ||
          VENDOR_TYPES.some(c => (c.type === v.vendor_type || v.service_capabilities?.includes(c.type)) && c.label.toLowerCase().includes(q))
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [vendors, categoryFilter, statusFilter, search]);

  // Aggregate Metrics
  const totalCount = vendors.length;
  const activeCount = vendors.filter(v => v.active).length;
  const workshopCount = vendors.filter(v => v.vendor_type === 'WORKSHOP').length;
  const partsCount = vendors.filter(v => v.vendor_type === 'PARTS_SUPPLIER').length;
  const fuelCount = vendors.filter(v => v.vendor_type === 'FUEL_STATION').length;
  const totalSpend = vendors.reduce((sum, v) => sum + (v.total_spend ?? 0), 0);

  return (
    <div className="trk-vendors-container">
      {pageError && <Banner variant="error">{pageError}</Banner>}

      {/* Add / Edit Modal */}
      {showFormModal && (
        <VendorFormModal
          vendor={editingVendor}
          onClose={() => {
            setShowFormModal(false);
            setEditingVendor(null);
          }}
          onSaved={reload}
        />
      )}

      {/* Page Header */}
      <PageHeader
        crumbs={['HuduFreight', 'Fleet Operations', 'Vendors']}
        titlePlain="Fleet service"
        titleEm="vendors"
        subtitle="Maintenance, spares, fuel, leasing, hire, finance and insurance providers."
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
              onClick={() => {
                setEditingVendor(null);
                setShowFormModal(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="plus" size={15} /> Add vendor
            </Button>
          </div>
        }
      />

      {/* KPI Metrics Row */}
      <div className="trk-vendors-kpi-grid">
        <div className="trk-vendor-kpi-card">
          <div className="trk-vendor-kpi-icon teal">
            <Icon name="briefcase" size={20} />
          </div>
          <div className="trk-vendor-kpi-content">
            <span className="trk-vendor-kpi-val">{totalCount}</span>
            <span className="trk-vendor-kpi-lbl">Total Vendors</span>
          </div>
        </div>

        <div className="trk-vendor-kpi-card">
          <div className="trk-vendor-kpi-icon green">
            <Icon name="checkCircle" size={20} />
          </div>
          <div className="trk-vendor-kpi-content">
            <span className="trk-vendor-kpi-val">{activeCount}</span>
            <span className="trk-vendor-kpi-lbl">Active Partners ({totalCount ? Math.round((activeCount / totalCount) * 100) : 0}%)</span>
          </div>
        </div>

        <div className="trk-vendor-kpi-card">
          <div className="trk-vendor-kpi-icon blue">
            <Icon name="tool" size={20} />
          </div>
          <div className="trk-vendor-kpi-content">
            <span className="trk-vendor-kpi-val">{workshopCount}</span>
            <span className="trk-vendor-kpi-lbl">Workshops &amp; Garages</span>
          </div>
        </div>

        <div className="trk-vendor-kpi-card">
          <div className="trk-vendor-kpi-icon amber">
            <Icon name="package" size={20} />
          </div>
          <div className="trk-vendor-kpi-content">
            <span className="trk-vendor-kpi-val">{partsCount}</span>
            <span className="trk-vendor-kpi-lbl">Parts Suppliers</span>
          </div>
        </div>

        <div className="trk-vendor-kpi-card">
          <div className="trk-vendor-kpi-icon purple">
            <Icon name="dollarSign" size={20} />
          </div>
          <div className="trk-vendor-kpi-content">
            <span className="trk-vendor-kpi-val">{formatCurrency(totalSpend)}</span>
            <span className="trk-vendor-kpi-lbl">Attributable Spend</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="trk-vendors-toolbar">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger aria-label="Vendor category" style={{ width: 'min(260px, 100%)' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({totalCount})</SelectItem>
            {VENDOR_TYPES.map(c => <SelectItem key={c.type} value={c.type}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendor by name, phone, email, notes, or location…"
            style={{ width: '100%', paddingLeft: 34 }}
          />
          <Icon
            name="search"
            size={15}
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger style={{ width: 140 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active Only</SelectItem>
              <SelectItem value="INACTIVE">Inactive Only</SelectItem>
            </SelectContent>
          </Select>

          {/* View Toggle */}
          <div style={{ display: 'inline-flex', background: 'var(--bg2)', borderRadius: 'var(--r-sm)', padding: 2, border: '1px solid var(--border)' }}>
            <Tip label="Grid view">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                style={{
                  background: viewMode === 'grid' ? 'var(--white)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--ink)' : 'var(--ink3)',
                  border: 'none',
                  borderRadius: 'var(--r-xs, 3px)',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="grid" size={15} />
              </button>
            </Tip>
            <Tip label="Table view">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  background: viewMode === 'table' ? 'var(--white)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--ink)' : 'var(--ink3)',
                  border: 'none',
                  borderRadius: 'var(--r-xs, 3px)',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="list" size={15} />
              </button>
            </Tip>
          </div>
        </div>
      </div>

      {/* Main Content Area: Grid vs Table */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>
          Loading vendor directory and fleet records…
        </div>
      ) : filteredVendors.length === 0 ? (
        <SectionCard>
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Icon name="briefcase" size={36} color="var(--ink3)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>No vendors matching your filters</div>
            <p style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4, maxWidth: 400, margin: '6px auto 16px' }}>
              {search || categoryFilter !== 'all' || statusFilter !== 'ALL'
                ? 'Try clearing your search query or reset the category filter.'
                : 'Register your first workshop, parts supplier, or fuel station partner.'}
            </p>
            <Button
              onClick={() => {
                setEditingVendor(null);
                setShowFormModal(true);
              }}
            >
              <Icon name="plus" size={14} /> Add vendor
            </Button>
          </div>
        </SectionCard>
      ) : viewMode === 'grid' ? (
        /* Grid Cards View */
        <div className="trk-vendors-grid">
          {filteredVendors.map(v => {
            const meta = getVendorTypeMeta(v.vendor_type);
            return (
              <div
                key={v.id}
                className="trk-vendor-card"
                onClick={() => navigate(`/tracking/vendors/${v.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="trk-vendor-card-header">
                  <div className={`trk-vendor-avatar ${meta.colorClass}`}>
                    <Icon name={meta.icon} size={18} />
                  </div>
                  <div className="trk-vendor-title-block">
                    <Link
                      to={`/tracking/vendors/${v.id}`}
                      className="trk-vendor-name"
                      title={v.name}
                      onClick={e => e.stopPropagation()}
                    >
                      {v.name}
                    </Link>
                    <div className="trk-vendor-badges">
                      <Badge variant="outline">{meta.label}</Badge>
                      <Badge variant={v.active ? 'success' : 'gray'}>
                        {v.active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="trk-vendor-card-body">
                  {v.phone ? (
                    <div className="trk-vendor-contact-item">
                      <Icon name="phone" size={13} color="var(--ink3)" />
                      <a href={`tel:${v.phone}`} onClick={e => e.stopPropagation()}>{v.phone}</a>
                    </div>
                  ) : (
                    <div className="trk-vendor-contact-item" style={{ color: 'var(--ink3)' }}>
                      <Icon name="phone" size={13} />
                      <span>No phone number</span>
                    </div>
                  )}

                  {v.email && (
                    <div className="trk-vendor-contact-item">
                      <Icon name="mail" size={13} color="var(--ink3)" />
                      <a href={`mailto:${v.email}`} onClick={e => e.stopPropagation()}>{v.email}</a>
                    </div>
                  )}

                  {v.address && (
                    <div className="trk-vendor-contact-item" title={v.address}>
                      <Icon name="mapPin" size={13} color="var(--ink3)" />
                      <span>{v.address}</span>
                    </div>
                  )}

                  {v.service_capabilities?.length ? <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{v.service_capabilities.map(type => getVendorTypeMeta(type).label).join(' · ')}</div> : null}
                  {v.notes && (
                    <div className="trk-vendor-notes" title={v.notes}>
                      {v.notes}
                    </div>
                  )}

                  {/* Operational stats bar */}
                  <div className="trk-vendor-stats-bar">
                    <div className="trk-vendor-stat-col">
                      <span className="trk-vendor-stat-val">
                        {vendorActivity(v)}
                      </span>
                      <span className="trk-vendor-stat-lbl">{vendorCategory(v.vendor_type).activity}</span>
                    </div>
                    <div className="trk-vendor-stat-col" style={{ textAlign: 'right' }}>
                      <span className="trk-vendor-stat-val" style={{ color: 'var(--teal)' }}>
                        {['FINANCING', 'LEASING', 'VEHICLE_HIRE', 'INSURANCE'].includes(v.vendor_type) ? 'Not linked' : v.total_spend ? formatCurrency(v.total_spend) : 'TZS 0'}
                      </span>
                      <span className="trk-vendor-stat-lbl">Recorded fleet cost</span>
                    </div>
                  </div>
                </div>

                <div className="trk-vendor-card-actions" onClick={e => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}
                  >
                    <Link to={`/tracking/vendors/${v.id}`}>View Details</Link>
                  </Button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tip label="Edit vendor">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVendor(v);
                          setShowFormModal(true);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: 'var(--ink3)' }}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                    </Tip>
                    <Tip label="Delete vendor">
                      <button
                        type="button"
                        onClick={() => remove(v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: 'var(--ink3)' }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </Tip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Table View */
        <SectionCard>
          <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vendor Partner</th>
                <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category</th>
                <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Contact</th>
                <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Location</th>
                <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Spend</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map(v => {
                const meta = getVendorTypeMeta(v.vendor_type);
                return (
                  <tr
                    key={v.id}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/tracking/vendors/${v.id}`)}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`trk-vendor-avatar ${meta.colorClass}`} style={{ width: 32, height: 32 }}>
                          <Icon name={meta.icon} size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.name}</div>
                          {v.service_capabilities?.length ? <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{v.service_capabilities.map(type => getVendorTypeMeta(type).label).join(' · ')}</div> : null}
                  {v.notes && (
                            <div style={{ fontSize: 11, color: 'var(--ink3)', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {v.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant="outline">{meta.label}</Badge>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                      <div>{v.phone || '—'}</div>
                      {v.email && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{v.email}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                      {v.address || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={v.active ? 'success' : 'gray'}>
                        {v.active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                      {['FINANCING', 'LEASING', 'VEHICLE_HIRE', 'INSURANCE'].includes(v.vendor_type) ? 'Not linked' : v.total_spend ? formatCurrency(v.total_spend) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}
                        >
                          <Link to={`/tracking/vendors/${v.id}`}>View</Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingVendor(v);
                            setShowFormModal(true);
                          }}
                        >
                          <Icon name="edit" size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(v)}
                        >
                          <Icon name="trash" size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ResponsiveTable>
        </SectionCard>
      )}
    </div>
  );
};

export default TrackingVendors;
