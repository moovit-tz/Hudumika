import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { IconName } from '../../components/Icon.js';
import { getCompany, setCompany } from '../../data/companyStore.js';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { MetricsRow } from '../../components/MetricCard.js';
import type { MetricCardProps } from '../../components/MetricCard.js';
import { refreshTenantLocale } from '../../lib/tenantLocale.js';
import { pushTenantBranding, useBranding } from '../../hooks/useBranding.js';
import { useLocale } from '../../hooks/useLocale.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { Badge } from '../../components/ui/badge.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeatureToggleRow } from '../../components/ui/list-item-row.js';
import { SectionCard } from '../../components/SectionCard.js';
import { EntityPicker } from '../../components/EntityPicker.js';
import { Switch } from '../../components/ui/switch.js';
import { LauncherAppSvg, LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { SignaturePad } from '../../components/SignaturePad.js';
import { showAlert } from '../../lib/alert.js';
import { Tip } from '../../components/ui/tooltip.js';
import { UpgradeNotice } from '../../components/UpgradeNotice.js';
import { showConfirm } from '../../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../../hooks/useEntitlements.js';
import { useAuth } from '../../hooks/useAuth.js';
import { APP_META } from '../Utilities.js';
import { AI_PROVIDERS } from '../../lib/aiProviders.js';
import { SettingsCtx, Toggle, Field, ToggleRow, Card, SaveRow, useFields, useSettingsFields } from './shared.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { SlidersHorizontal, X } from 'lucide-react';
import '../OndiPages.css';

// -- section: Locations ------------------------------------------------------

interface LocationRow {
  id: string;
  name: string;
  code: string;
  type: string;
  city: string;
  country: string;
  created_at?: string;
}

const FACILITY_TYPES = [
  { value: 'branch', label: 'Commercial Branch', icon: 'mapPin', color: 'var(--teal)', bg: 'var(--teal-l)' },
  { value: 'warehouse', label: 'Warehouse & Storage', icon: 'warehouse', color: 'var(--gold)', bg: 'var(--gold-l)' },
  { value: 'headquarters', label: 'Headquarters (HQ)', icon: 'building', color: '#7c3aed', bg: '#f1f0fb' },
  { value: 'office', label: 'Regional Office', icon: 'globe', color: 'var(--blue)', bg: 'var(--blue-l)' },
  { value: 'hub', label: 'Distribution Hub', icon: 'zap', color: 'var(--gold)', bg: 'var(--gold-l)' },
  { value: 'store', label: 'Retail Store', icon: 'mapPin', color: 'var(--green)', bg: 'var(--green-l)' },
];

function getFacilityCfg(typeStr: string) {
  const norm = (typeStr || '').toLowerCase();
  for (const t of FACILITY_TYPES) {
    if (norm.includes(t.value)) return t;
  }
  return { value: norm, label: norm ? (norm.charAt(0).toUpperCase() + norm.slice(1)) : 'Facility', icon: 'building', color: 'var(--ink2)', bg: 'var(--bg)' };
}

export const LocationsSection: React.FC = () => {
  const [rows, setRows] = useState<LocationRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [compactRows, setCompactRows] = useState(true);

  // Dialog State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [activeLocation, setActiveLocation] = useState<LocationRow | null>(null);
  const [form, setForm] = useState({ name: '', code: '', type: 'branch', city: '', country: '' });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: LocationRow[] = await apiFetch('/v1/locations');
      setRows(r || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCount = rows?.length ?? 0;
  const branchCount = useMemo(() => rows?.filter(r => {
    const t = (r.type || '').toLowerCase();
    return t.includes('branch') || t.includes('store');
  }).length ?? 0, [rows]);
  const warehouseCount = useMemo(() => rows?.filter(r => {
    const t = (r.type || '').toLowerCase();
    return t.includes('warehouse') || t.includes('hub') || t.includes('depot');
  }).length ?? 0, [rows]);
  const officeCount = useMemo(() => rows?.filter(r => {
    const t = (r.type || '').toLowerCase();
    return t.includes('office') || t.includes('headquarters') || t.includes('hq');
  }).length ?? 0, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter(r => {
      if (typeFilter !== 'all') {
        const t = (r.type || '').toLowerCase();
        if (typeFilter === 'branch' && !t.includes('branch') && !t.includes('store')) return false;
        if (typeFilter === 'warehouse' && !t.includes('warehouse') && !t.includes('hub') && !t.includes('depot')) return false;
        if (typeFilter === 'office' && !t.includes('office') && !t.includes('headquarters') && !t.includes('hq')) return false;
      }
      const q = search.trim().toLowerCase();
      if (q) {
        const match =
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.country.toLowerCase().includes(q) ||
          (r.type || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter]);

  function openAdd() {
    setModalMode('create');
    setActiveLocation(null);
    setForm({ name: '', code: '', type: 'branch', city: '', country: '' });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(loc: LocationRow) {
    setModalMode('edit');
    setActiveLocation(loc);
    setForm({
      name: loc.name,
      code: loc.code,
      type: loc.type || 'branch',
      city: loc.city,
      country: loc.country,
    });
    setFormError('');
    setModalOpen(true);
  }

  const saveLocation = async () => {
    setFormError('');
    if (!form.name.trim() || !form.code.trim() || !form.city.trim() || !form.country.trim()) {
      setFormError('Name, code, city and country are required fields.');
      return;
    }

    setFormSaving(true);
    try {
      if (modalMode === 'create') {
        await apiFetch('/v1/locations', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        showAlert('Location registered successfully.', { variant: 'success' });
      } else if (activeLocation) {
        await apiFetch(`/v1/locations/${activeLocation.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        showAlert('Location updated successfully.', { variant: 'success' });
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.message || 'Could not save location — check your plan’s location limit.');
    } finally {
      setFormSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    const ok = await showConfirm(`Remove location "${name}"? Operations or stock records referencing this site may be affected.`);
    if (!ok) return;
    try {
      await apiFetch(`/v1/locations/${id}`, { method: 'DELETE' });
      showAlert('Location removed.', { variant: 'success' });
      await load();
    } catch {
      showAlert('Could not remove location', { variant: 'error' });
    }
  };

  return (
    <div className="sett-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Executive KPI Deck */}
      <div className="ondi-kpi-grid" style={{ marginBottom: 4 }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setTypeFilter('all'); setSearch(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { setTypeFilter('all'); setSearch(''); } }}
          className={`ondi-kpi-card ${typeFilter === 'all' && !search ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Facilities</span>
            <div className="ondi-kpi-icon-box purple">
              <Icon name="building" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{totalCount}</span>
            <span className="ondi-kpi-sub">registered workspace sites</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setTypeFilter(typeFilter === 'branch' ? 'all' : 'branch')}
          onKeyDown={e => { if (e.key === 'Enter') setTypeFilter(typeFilter === 'branch' ? 'all' : 'branch'); }}
          className={`ondi-kpi-card ${typeFilter === 'branch' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Branches & Stores</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="mapPin" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--green)' }}>{branchCount}</span>
            <span className="ondi-kpi-sub">commercial retail branches</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setTypeFilter(typeFilter === 'warehouse' ? 'all' : 'warehouse')}
          onKeyDown={e => { if (e.key === 'Enter') setTypeFilter(typeFilter === 'warehouse' ? 'all' : 'warehouse'); }}
          className={`ondi-kpi-card ${typeFilter === 'warehouse' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Warehouses & Hubs</span>
            <div className="ondi-kpi-icon-box gold">
              <Icon name="warehouse" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--gold)' }}>{warehouseCount}</span>
            <span className="ondi-kpi-sub">inventory & depot sites</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setTypeFilter(typeFilter === 'office' ? 'all' : 'office')}
          onKeyDown={e => { if (e.key === 'Enter') setTypeFilter(typeFilter === 'office' ? 'all' : 'office'); }}
          className={`ondi-kpi-card ${typeFilter === 'office' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Offices & HQ</span>
            <div className="ondi-kpi-icon-box blue">
              <Icon name="globe" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--blue)' }}>{officeCount}</span>
            <span className="ondi-kpi-sub">corporate & regional offices</span>
          </div>
        </div>
      </div>

      {/* Search & Actions Toolbar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="ondi-search-input" style={{ width: '100%', position: 'relative' }}>
              <Icon name="search" size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search location by name, code, city, country or type…"
                aria-label="Search locations"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
                  aria-label="Clear search"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tip label={compactRows ? "Currently in compressed rows view (compact). Click for standard." : "Switch to compressed rows view."}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompactRows(v => !v)}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Icon name="list" size={13} />
                <span>{compactRows ? 'Dense Rows' : 'Standard Rows'}</span>
              </Button>
            </Tip>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={load}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Icon name="refresh" size={13} />
              <span>Refresh</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={openAdd}
              className="h-8 gap-1.5 text-xs font-bold shadow-xs"
            >
              <Icon name="plus" size={14} />
              <span>Add Location</span>
            </Button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(typeFilter !== 'all' || Boolean(search.trim())) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingLeft: 2 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600 }}>Active filters:</span>
            {search.trim() && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              >
                Search: <strong>&ldquo;{search}&rdquo;</strong>
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              >
                Type: <strong style={{ textTransform: 'capitalize' }}>{typeFilter}</strong>
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center' }}
                  title="Clear type filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => { setSearch(''); setTypeFilter('all'); }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'hsl(var(--primary))',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
              className="hover:underline"
            >
              Reset all
            </button>
          </div>
        )}
      </div>

      {/* Main Table Card */}
      <div className="sa-analytics-card">
        {loading && rows === null ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <SectionLoading label="Loading locations…" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ondi-table" data-compact={compactRows ? "true" : undefined}>
              <thead>
                <tr>
                  <th>Location &amp; Facility</th>
                  <th>Code</th>
                  <th>Facility Type</th>
                  <th>City</th>
                  <th>Country</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(loc => {
                  const cfg = getFacilityCfg(loc.type);
                  return (
                    <tr key={loc.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: compactRows ? 26 : 32,
                              height: compactRows ? 26 : 32,
                              borderRadius: 'var(--r-sm, 6px)',
                              background: cfg.bg,
                              color: cfg.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Icon name={cfg.icon as any} size={compactRows ? 13 : 15} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 650, fontSize: compactRows ? 12.5 : 13, color: 'var(--ink)' }}>
                              {loc.name}
                            </div>
                            {!compactRows && (
                              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>
                                Registered business facility
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: compactRows ? 11 : 11.5,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            color: 'var(--ink)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {loc.code}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: compactRows ? '2px 8px' : '3px 10px',
                            borderRadius: 100,
                            fontSize: compactRows ? 11 : 11.5,
                            fontWeight: 600,
                            background: cfg.bg,
                            color: cfg.color,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                          {cfg.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: compactRows ? 12 : 12.5, color: 'var(--ink)' }}>
                          <Icon name="mapPin" size={12} style={{ color: 'var(--ink3)' }} />
                          <span>{loc.city}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: compactRows ? 12 : 12.5, color: 'var(--ink2)' }}>
                          <Icon name="globe" size={12} style={{ color: 'var(--ink3)' }} />
                          <span>{loc.country}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <Tip label="Edit location">
                            <button
                              type="button"
                              onClick={() => openEdit(loc)}
                              style={{
                                background: 'transparent',
                                border: '1px solid transparent',
                                padding: compactRows ? '3px 6px' : '5px 8px',
                                borderRadius: 'var(--r-sm)',
                                cursor: 'pointer',
                                color: 'var(--ink3)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              className="hover:text-foreground hover:bg-muted"
                            >
                              <Icon name="edit" size={compactRows ? 13 : 15} />
                            </button>
                          </Tip>

                          <Tip label="Remove location">
                            <button
                              type="button"
                              onClick={() => remove(loc.id, loc.name)}
                              style={{
                                background: 'transparent',
                                border: '1px solid transparent',
                                padding: compactRows ? '3px 6px' : '5px 8px',
                                borderRadius: 'var(--r-sm)',
                                cursor: 'pointer',
                                color: 'var(--red)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              className="hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Icon name="trash" size={compactRows ? 13 : 15} />
                            </button>
                          </Tip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg)', color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Icon name="mapPin" size={20} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>No locations found</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, maxWidth: 360, margin: '4px auto 16px' }}>
              {search || typeFilter !== 'all'
                ? 'No registered facilities match your search query or type filter.'
                : 'No branches, warehouses or offices added to this workspace yet.'}
            </div>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Icon name="plus" size={13} />
              <span>Add First Location</span>
            </Button>
          </div>
        )}
      </div>

      {/* Modal Dialog for Add / Edit Location */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'edit' ? 'Edit Business Location' : 'Register New Location'}
            </DialogTitle>
            <DialogDescription>
              Configure facility details, operational codes, and geographic jurisdiction for this workspace.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  Facility / Location Name *
                </label>
                <Input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Mwanza Port Depot, Dar Central Branch"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Facility Code *
                  </label>
                  <Input
                    value={form.code}
                    onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. MWZ-01, DAR"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Facility Type *
                  </label>
                  <Select
                    value={form.type}
                    onValueChange={v => setForm(p => ({ ...p, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="branch">Commercial Branch</SelectItem>
                      <SelectItem value="warehouse">Warehouse &amp; Logistics Depot</SelectItem>
                      <SelectItem value="headquarters">Headquarters (HQ)</SelectItem>
                      <SelectItem value="office">Regional Office</SelectItem>
                      <SelectItem value="hub">Distribution Hub</SelectItem>
                      <SelectItem value="store">Retail Store / Outlet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    City *
                  </label>
                  <Input
                    value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="e.g. Dar es Salaam, Mwanza, Nairobi"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Country *
                  </label>
                  <Input
                    value={form.country}
                    onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
                    placeholder="e.g. Tanzania, Kenya, Uganda"
                  />
                </div>
              </div>

              {formError && (
                <div style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--red)', fontSize: 12 }}>
                  {formError}
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLocation} loading={formSaving} loadingText={modalMode === 'edit' ? 'Updating…' : 'Creating…'}>
              {modalMode === 'edit' ? 'Save Changes' : 'Create Location'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// -- section: Company --------------------------------------------------------
export const CompanySection: React.FC = () => {
  const co = getCompany();
  const { save: apiSave } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [f, set] = useFields({
    name: co.name, email: co.email, phone: co.phone,
    website: co.website, vat: co.taxId, address: co.address,
    city: co.city, state: '', zip: '', country: 'TZ', desc: co.tagline,
    businessType: co.businessType, contactPerson: co.contactPerson,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(co.logoUrl);
  const [logoUrlDark, setLogoUrlDark] = useState<string | null>(co.logoUrlDark);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(co.faviconUrl);
  const [logoVerticalLight, setLogoVerticalLight] = useState<string | null>(co.logoVerticalLight);
  const [logoVerticalDark, setLogoVerticalDark] = useState<string | null>(co.logoVerticalDark);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // organization_id lives on the real tenants row, not the tenant_settings
  // JSONB blob SettingsCtx carries — fetched independently here rather than
  // threading a new field through the shared context, same as WorkspaceFacts
  // below does its own GET /v1/settings for what it needs.
  const [linkedOrg, setLinkedOrg] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    apiFetch('/v1/settings').then((r: any) => {
      const t = r?.tenant;
      if (t?.organization_id) setLinkedOrg({ id: t.organization_id, label: t.organization_name || 'Linked organization' });
    }).catch(() => {});
  }, []);

  // Workspace name + accent colour used to live in a separate "Branding"
  // section (pushTenantBranding/useBranding — feeds the in-app UI: sidebar,
  // browser tab, per-app accent) while this card only ever covered the logo
  // used on PDF documents. Two places to upload the same logo, easy to drift
  // — folded here instead, so this one card is the actual single source and
  // one Save writes both the document-branding store and the in-app one.
  const [workspaceName, setWorkspaceName] = useState('');
  const [accentColor, setAccentColor] = useState('');
  useEffect(() => {
    apiFetch('/v1/settings/branding').then((t: any) => {
      setWorkspaceName(t?.workspaceName ?? '');
      setAccentColor(t?.accentColor ?? '');
    }).catch(() => { /* no workspace override yet is the norm */ });
  }, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setLogoUrl(ev.target.result); };
    reader.readAsDataURL(file);
  }

  function handleLogoDarkChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setLogoUrlDark(ev.target.result); };
    reader.readAsDataURL(file);
  }

  function handleFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === 'string') setFaviconUrl(ev.target.result); };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      await apiSave('company', { ...f, vat: f.vat, logoUrl, logoUrlDark, logoVerticalLight, logoVerticalDark, faviconUrl, organizationId: linkedOrg?.id ?? null });
      await pushTenantBranding({ workspaceName: workspaceName.trim(), logoLight: logoUrl ?? '', logoDark: logoUrlDark ?? '', logoVerticalLight: logoVerticalLight ?? '', logoVerticalDark: logoVerticalDark ?? '', favicon: faviconUrl ?? '', accentColor: accentColor.trim() });
      setCompany({ name: f.name, email: f.email, phone: f.phone, website: f.website, taxId: f.vat, address: f.address, city: f.city, tagline: f.desc, businessType: f.businessType, contactPerson: f.contactPerson, logoUrl, logoUrlDark, logoVerticalLight, logoVerticalDark, faviconUrl }, { persist: false });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Branding could not be saved. Please retry.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Company Information" desc="Basic details about your business.">
        <Field label="Company Name"><input data-ui-field="input" className="input-field" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="VAT / Tax Number"><input data-ui-field="input" className="input-field" value={f.vat} onChange={e => set('vat', e.target.value)} /></Field>
        <Field label="Email Address"><input data-ui-field="input" className="input-field" type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Phone Number"><input data-ui-field="input" className="input-field" value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Website"><input data-ui-field="input" className="input-field" type="url" value={f.website} onChange={e => set('website', e.target.value)} /></Field>
        <Field label="Business Type"><input data-ui-field="input" className="input-field" value={f.businessType} onChange={e => set('businessType', e.target.value)} placeholder="e.g. Customs Clearing Agent" /></Field>
        <Field label="Contact Person"><input data-ui-field="input" className="input-field" value={f.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></Field>
        <Field label="Street Address" full><input data-ui-field="input" className="input-field" value={f.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label="City"><input data-ui-field="input" className="input-field" value={f.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="State / Region"><input data-ui-field="input" className="input-field" value={f.state} onChange={e => set('state', e.target.value)} /></Field>
        <Field label="ZIP / Postal Code"><input data-ui-field="input" className="input-field" value={f.zip} onChange={e => set('zip', e.target.value)} /></Field>
        <Field label="Country">
          <Select value={f.country} onValueChange={v => set('country', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['TZ','Tanzania'],['KE','Kenya'],['UG','Uganda'],['RW','Rwanda'],['ZA','South Africa'],['NG','Nigeria'],['GH','Ghana'],['US','United States'],['GB','United Kingdom'],['DE','Germany'],['AE','UAE'],['IN','India'],['CN','China']].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Company Description" full>
          <textarea className="input-field s-resize-v" rows={3} value={f.desc} onChange={e => set('desc', e.target.value)} placeholder="Short description of your company…" />
        </Field>
        <Field label="Linked Organization" full hint="If this workspace also serves as a customer of another clearing agent on Hudumika, link the same shared identity here so your team's own portal usage and your customer-portal usage (if any) are traceable to one company.">
          <EntityPicker
            value={linkedOrg}
            onChange={setLinkedOrg}
            search={async q => {
              const res = await apiFetch(`/v1/organizations?q=${encodeURIComponent(q)}`).catch(() => []);
              return (Array.isArray(res) ? res : []).map((o: any) => ({ id: o.id, label: o.name, sublabel: o.tax_id ? `TIN ${o.tax_id}` : undefined }));
            }}
            onCreate={async name => {
              const created = await apiFetch('/v1/organizations', { method: 'POST', body: JSON.stringify({ name }) });
              return { id: created.id, label: created.name };
            }}
            placeholder="Search or create an organization…"
          />
        </Field>
      </Card>
      <Card title="Company Branding" desc="Your workspace's name, colour, logo and favicon — used on PDF invoices, quotes and portal documents, and everywhere in the app your team signs into. The pre-authentication sign-in screen is shared by every workspace on the platform, so it isn't set here.">
        <Field label="Workspace Name" hint="Shown in the browser tab and beside your logo in the app.">
          <input data-ui-field="input" className="input-field" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder={f.name || 'Your company name'} />
        </Field>
        <Field label="Brand Colour" hint="Used by apps that have no colour of their own — each app keeps its own by design.">
          <div className="s-brand-colour">
            <ColorSwatchPicker
              value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#0f766e'}
              onChange={setAccentColor}
            />
            {accentColor && <button type="button" className="s-brand-clear" onClick={() => setAccentColor('')} data-ui-native-button="">Clear</button>}
          </div>
        </Field>
        <Field label="Company Logo" hint="Recommended: 400×100px PNG or SVG" full>
          <label className={`s-upload${logoUrl ? ' s-upload--on' : ''}`}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo preview" className="s-upload-preview" />
              : <div className="s-upload-ph s-upload-ph--lg">LOGO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${logoUrl ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{logoUrl ? 'Logo uploaded · click to change' : 'Click to upload logo'}</div>
              <div className="s-upload-hint">PNG, SVG or JPG · max 2 MB</div>
            </div>
            {logoUrl && (
              <Tip label="Remove logo"><button type="button" aria-label="Remove logo" onClick={e => { e.preventDefault(); setLogoUrl(null); }} className="s-upload-rm" data-ui-native-button="">
                <Icon name="x" size={13} color="var(--red)" />
              </button></Tip>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
        </Field>
        <Field label="Dark Mode Logo" hint="Shown wherever this logo renders on a dark background — invoices, quotes and purchase orders viewed in dark mode, and the in-app header when dark mode is on. Optional: falls back to the logo above if not set." full>
          <label className={`s-upload${logoUrlDark ? ' s-upload--on' : ''}`}>
            {logoUrlDark
              ? <div className="s-upload-preview-dark-wrap"><img src={logoUrlDark} alt="Dark mode logo preview" className="s-upload-preview" /></div>
              : <div className="s-upload-ph s-upload-ph--lg">LOGO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${logoUrlDark ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{logoUrlDark ? 'Dark-mode logo uploaded · click to change' : 'Click to upload a dark-mode variant'}</div>
              <div className="s-upload-hint">PNG or SVG, ideally with a transparent background · max 2 MB</div>
            </div>
            {logoUrlDark && (
              <Tip label="Remove dark-mode logo"><button type="button" aria-label="Remove dark-mode logo" onClick={e => { e.preventDefault(); setLogoUrlDark(null); }} className="s-upload-rm" data-ui-native-button="">
                <Icon name="x" size={13} color="var(--red)" />
              </button></Tip>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoDarkChange} />
          </label>
        </Field>
        {([
          { label: 'Vertical Logo (Light)', value: logoVerticalLight, set: setLogoVerticalLight, dark: false },
          { label: 'Vertical Logo (Dark)', value: logoVerticalDark, set: setLogoVerticalDark, dark: true },
        ] as const).map(slot => (
          <Field key={slot.label} label={slot.label} hint="Portrait or stacked logo for document templates. PNG, JPG or SVG · max 2 MB." full>
            <label className={`s-upload${slot.value ? ' s-upload--on' : ''}`}>
              {slot.value
                ? slot.dark
                  ? <div className="s-upload-preview-dark-wrap"><img src={slot.value} alt={slot.label} className="s-upload-preview s-upload-preview--vert" /></div>
                  : <img src={slot.value} alt={slot.label} className="s-upload-preview s-upload-preview--vert" />
                : <div className="s-upload-ph s-upload-ph--vert">VERT</div>
              }
              <div className="s-upload-info">
                <div className={`s-upload-lbl${slot.value ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{slot.value ? 'Vertical logo uploaded · click to change' : 'Click to upload vertical logo'}</div>
                <div className="s-upload-hint">PNG, SVG or JPG · max 2 MB</div>
              </div>
              {slot.value && (
                <Tip label={`Remove ${slot.label.toLowerCase()}`}><button type="button" aria-label={`Remove ${slot.label.toLowerCase()}`} onClick={e => { e.preventDefault(); slot.set(null); }} className="s-upload-rm" data-ui-native-button="">
                  <Icon name="x" size={13} color="var(--red)" />
                </button></Tip>
              )}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={e => {
                const file = e.target.files?.[0]; if (!file) return;
                if (file.size > 2 * 1024 * 1024) { setSaveError('Choose a logo smaller than 2 MB.'); return; }
                const reader = new FileReader(); reader.onload = () => slot.set(String(reader.result)); reader.readAsDataURL(file);
              }} />
            </label>
          </Field>
        ))}
        {co.logoHistory.length > 0 && (
          <Field label="Previous Logos" hint="Click to restore" full>
            <div className="s-logo-hist">
              {co.logoHistory.map((src, i) => (
                <Tip key={i} label={`Restore logo ${i + 1}`}><button type="button" aria-label={`Restore logo ${i + 1}`} onClick={() => setLogoUrl(src)}
                  className={`s-logo-thumb${logoUrl === src ? ' s-logo-thumb--on' : ''}`} data-ui-native-button=""><img src={src} alt={`Previous logo ${i + 1}`} className="s-logo-thumb-img" /></button></Tip>
              ))}
            </div>
          </Field>
        )}
        <Field label="Favicon" hint="512×512px · PNG, JPG, SVG or ICO">
          <label className={`s-upload s-upload--sm${faviconUrl ? ' s-upload--on' : ''}`}>
            {faviconUrl
              ? <img src={faviconUrl} alt="Favicon preview" className="s-upload-preview--sq" />
              : <div className="s-upload-ph s-upload-ph--sq">ICO</div>
            }
            <div className="s-upload-info">
              <div className={`s-upload-lbl${faviconUrl ? ' s-upload-lbl--on' : ' s-upload-lbl--off'}`}>{faviconUrl ? 'Favicon uploaded · click to change' : 'Upload favicon'}</div>
              <div className="s-upload-hint">512×512px · PNG, JPG, SVG or ICO</div>
            </div>
            {faviconUrl && (
              <Tip label="Remove favicon"><button type="button" aria-label="Remove favicon" onClick={e => { e.preventDefault(); setFaviconUrl(null); }} className="s-upload-rm" data-ui-native-button="">
                <Icon name="x" size={13} color="var(--red)" />
              </button></Tip>
            )}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.svg,.ico" className="hidden" onChange={handleFaviconChange} />
          </label>
        </Field>
      </Card>
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Localization ---------------------------------------------------
export const LocalizationSection: React.FC = () => {
  const { language, setLanguage, LANGUAGES } = useLocale();
  // Language and timezone only. The number/date-pattern fields that used to sit
  // here (decimals, separators, currency position, week start) were stored and
  // honoured by nothing — the app formats through Intl, which derives those from
  // the locale itself. Fields that cannot change anything do not belong on a
  // settings screen.
  const [f, set] = useSettingsFields('localization', { lang: language, tz: 'Africa/Dar_es_Salaam', businessDayCutoffHour: '0' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      // The person doing the saving gets it applied immediately; everyone else
      // picks it up from /identity/me on their next load.
      setLanguage(f.lang as SupportedLocale);
      await save('localization', { ...f });
      await refreshTenantLocale();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Language & Region">
        <Field label="Default Language">
          <Select value={f.lang} onValueChange={v => set('lang', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.nativeLabel}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={f.tz} onValueChange={v => set('tz', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['Africa/Dar_es_Salaam','Africa/Dar es Salaam (EAT +3)'],['Africa/Nairobi','Africa/Nairobi (EAT +3)'],['Africa/Kampala','Africa/Kampala (EAT +3)'],['Africa/Johannesburg','Africa/Johannesburg (SAST +2)'],['Africa/Lagos','Africa/Lagos (WAT +1)'],['Europe/London','Europe/London (GMT)'],['Europe/Paris','Europe/Paris (CET +1)'],['Asia/Dubai','Asia/Dubai (GST +4)'],['America/New_York','America/New York (EST -5)'],['UTC','UTC']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Business day cutoff" hint="For a shop, bar or restaurant that stays open past midnight — a sale before this hour still books under the PREVIOUS calendar day, so a late-night shift doesn't get split across two accounting days.">
          <Select value={f.businessDayCutoffHour ?? '0'} onValueChange={v => set('businessDayCutoffHour', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0,1,2,3,4,5,6].map(h => <SelectItem key={h} value={String(h)}>{h === 0 ? 'Midnight (no cutoff)' : `${h}:00 AM`}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {/* Week start, date/time pattern, currency position and the separator
            pickers used to sit here. Every one was stored and honoured by
            nothing: dates are formatted through Intl, which derives all of it
            from the locale and timezone above. Keeping a control that cannot
            change anything is worse than not offering it. */}
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: Landing Experience ---------------------------------------------
// The tenant's default for Basic (Agentic) vs Advanced at "/" — a user's own
// choice (the header toggle, PATCH /auth/me's profile.landing_style) always
// overrides this for their own account; this is only the fallback everyone
// else gets. Same useSettingsFields/save('landingStyle', ...) shape as
// LocalizationSection above, ADMIN+ only (settings.routes.ts's
// MANAGER_WRITABLE allowlist deliberately does not include this key).
export const LandingExperienceSection: React.FC = () => {
  const [f, set] = useSettingsFields('landingStyle', { mode: 'advanced' });
  const { save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      await save('landingStyle', { ...f });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }
  return (
    <>
      <Card title="Landing Experience" desc="What everyone in this workspace sees at sign-in by default.">
        <Field label="Default landing page">
          <Select value={f.mode} onValueChange={v => set('mode', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="advanced">Advanced — the app launcher</SelectItem>
              <SelectItem value="basic">Basic — the agentic cockpit</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: SIEM Export -----------------------------------------------------
// Fans Ondi's audit chain (ondi_auth_events — every login, KYC decision,
// role grant/revoke, password/email change) out to a tenant-configured
// webhook, signed the way Stripe/GitHub sign theirs: HMAC-SHA256 over the
// raw JSON body, sent as X-Ondi-Signature. Any SIEM that can ingest a
// signed HTTPS POST works — Splunk HEC, Sentinel, Datadog, or a tenant's
// own collector — rather than one bespoke vendor integration. Dispatch
// itself lives in siem-export.ts, fired (unawaited) from recordAuthEvent.
export const SiemExportSection: React.FC = () => {
  const [on, setOn] = useState(false);
  const [f, set] = useSettingsFields('siemExport', { webhookUrl: '', secret: '' });
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedExtra = useRef(false);
  const entitlements = useEntitlements();
  // undefined while loading — default to entitled so this doesn't flash an
  // upgrade prompt before /v1/entitlements resolves.
  const governanceEntitled = entitlements ? entitlements.features['ondi.governance'] !== false : true;

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.siemExport) { setOn(s.siemExport.enabled ?? false); hydratedExtra.current = true; }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('siemExport', { enabled: on, ...f }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch {} finally { setSaving(false); }
  }

  return (
    <>
      <Card title="SIEM Export" desc="Send every Ondi security event (logins, KYC decisions, role grants, credential changes) to your own SIEM or log collector as a signed webhook, in real time.">
        {!governanceEntitled ? (
          <UpgradeNotice
            title="Enterprise Identity & Governance"
            message="SIEM/webhook export needs this add-on, alongside SAML SSO and time-boxed role grants."
          />
        ) : (
          <>
            <ToggleRow label="Enable SIEM export" value={on} onChange={setOn} />
            {on && <>
              <Field label="Webhook URL" full hint="Ondi POSTs a JSON event here as it happens.">
                <input data-ui-field="input" className="input-field" type="url" placeholder="https://your-siem.example.com/ingest" value={f.webhookUrl} onChange={e => set('webhookUrl', e.target.value)} />
              </Field>
              <Field label="Signing Secret" full hint="Verify the X-Ondi-Signature header: HMAC-SHA256 of the raw request body, hex-encoded, using this secret.">
                <input data-ui-field="input" className="input-field" type="password" value={f.secret} onChange={e => set('secret', e.target.value)} />
              </Field>
            </>}
          </>
        )}
      </Card>
      {governanceEntitled && <SaveRow saving={saving} saved={saved} onSave={handleSave} />}
    </>
  );
};

// -- section: Email ----------------------------------------------------------
export const OAUTH_PROVIDER_LABEL: Record<string, string> = { outlook: 'Microsoft Outlook', gmail: 'Gmail' };

export const EmailSection: React.FC = () => {
  const [protocol, setProtocol] = useState('smtp');
  const [f, set] = useSettingsFields('email', {
    host: '', port: '587', user: '', pass: '', enc: 'tls', fromName: 'Hudumika', fromEmail: '', sig: '',
    outlookClientId: '', outlookClientSecret: '', outlookStatus: '',
    gmailClientId: '', gmailClientSecret: '', gmailStatus: '',
  });
  const [imap, setImap] = useSettingsFields('ticketImap', {
    host: '', port: '993', encryption: 'ssl', user: '', pass: '', targetDepartment: '', ticketType: 'general',
  });
  const [imapEnabled, setImapEnabled] = useState(false);
  const [imapMarkAsRead, setImapMarkAsRead] = useState(true);
  const { s, save } = useContext(SettingsCtx);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [oauthNotice, setOauthNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const hydratedExtra = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (hydratedExtra.current) return;
    if (s.email) {
      setProtocol(s.email.protocol ?? 'smtp');
      hydratedExtra.current = true;
    }
    if (s.ticketImap) {
      setImapEnabled(!!s.ticketImap.enabled);
      setImapMarkAsRead(s.ticketImap.markAsRead ?? true);
    }
  }, [s]);

  // Landed here fresh off an OAuth callback redirect (mail-oauth.routes.ts)
  // — show what happened once, then strip the query params so a page
  // refresh doesn't re-show a stale result.
  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (!oauth) return;
    const provider = searchParams.get('provider') ?? '';
    const msg = searchParams.get('msg');
    const label = OAUTH_PROVIDER_LABEL[provider] ?? provider;
    setOauthNotice({
      ok: oauth === 'success',
      msg: oauth === 'success' ? `${label} connected successfully.` : (msg || `Failed to connect ${label}.`),
    });
    const next = new URLSearchParams(searchParams);
    next.delete('oauth'); next.delete('provider'); next.delete('msg');
    setSearchParams(next, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      await save('email', { protocol, ...f });
      await save('ticketImap', { ...imap, enabled: imapEnabled, markAsRead: imapMarkAsRead });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }

  async function handleTestEmail() {
    setTesting(true); setTestResult(null);
    try {
      if (protocol === 'smtp') {
        // SMTP: verify connection + send using the form fields directly (before saving)
        await apiFetch('/v1/settings/email/test', {
          method: 'POST',
          body: JSON.stringify({ host: f.host, port: Number(f.port), user: f.user, pass: f.pass, enc: f.enc, fromName: f.fromName, fromEmail: f.fromEmail }),
        });
      } else {
        // Mail / Outlook / Gmail: use the saved tenant config
        await apiFetch('/v1/settings/email/send-test', {
          method: 'POST',
          body: JSON.stringify({ to: testTo || undefined }),
        });
      }
      setTestResult({ ok: true, msg: 'Test email sent successfully.' });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || 'Failed to send test email.' });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 6000);
    }
  }

  // Save first (so the Client ID/Secret the user just typed actually exist
  // server-side), then fetch the real authorize URL via an authenticated
  // apiFetch call, and only then navigate the browser there — a plain
  // window.location.href straight to our own API would carry no
  // Authorization header (this app's JWT lives in localStorage, not a
  // cookie) and 401 before ever reaching Microsoft/Google.
  async function handleConnect(provider: 'outlook' | 'gmail') {
    setConnecting(provider);
    try {
      await save('email', { protocol, ...f });
      const { url } = await apiFetch(`/v1/settings/email/${provider}/authorize`);
      window.location.href = url;
    } catch (err: any) {
      setOauthNotice({ ok: false, msg: err?.message || `Failed to start ${OAUTH_PROVIDER_LABEL[provider]} authorization.` });
      setConnecting(null);
    }
  }

  return (
    <>
      {oauthNotice && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: oauthNotice.ok ? 'var(--green-l)' : 'var(--red-l)',
          color: oauthNotice.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {oauthNotice.msg}
        </div>
      )}
      <Card title="Email Protocol">
        <Field label="Protocol">
          <Select value={protocol} onValueChange={setProtocol}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="smtp">SMTP</SelectItem>
              <SelectItem value="mail">Mail (Hudumika's own server)</SelectItem>
              <SelectItem value="outlook">Microsoft Outlook</SelectItem>
              <SelectItem value="gmail">Gmail</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>
      {protocol === 'smtp' && (
        <Card title="SMTP Configuration">
          <Field label="SMTP Host"><input data-ui-field="input" className="input-field" placeholder="mail.example.com" value={f.host} onChange={e => set('host', e.target.value)} /></Field>
          <Field label="Port"><input data-ui-field="input" className="input-field" type="number" value={f.port} onChange={e => set('port', e.target.value)} /></Field>
          <Field label="Username"><input data-ui-field="input" className="input-field" placeholder="your@email.com" value={f.user} onChange={e => set('user', e.target.value)} /></Field>
          <Field label="Password" hint={f.pass === '••••••••' ? 'A password is already saved — re-enter it only if you want to change it.' : undefined}>
            <input data-ui-field="input" className="input-field" type="password" value={f.pass} onChange={e => set('pass', e.target.value)} />
          </Field>
          <Field label="Encryption">
            <Select value={f.enc || '__none__'} onValueChange={v => set('enc', v === '__none__' ? '' : v)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="ssl">SSL</SelectItem>
                <SelectItem value="tls">TLS (Recommended)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Card>
      )}
      {protocol === 'mail' && (
        <Card title="Mail (system default)">
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>
            Sends through Hudumika's own outgoing mail server — no extra setup needed here. Your platform administrator configures the server credentials once in the SuperAdmin panel.
            Switch to <strong>SMTP</strong>, <strong>Outlook</strong> or <strong>Gmail</strong> above if you'd rather send from your own domain or mailbox.<br />
            <span style={{ color: 'var(--ink2)' }}>Use "Send Test Email" below (after saving) to confirm mail is working.</span>
          </p>
        </Card>
      )}
      {(protocol === 'outlook' || protocol === 'gmail') && (
        <Card title={`${OAUTH_PROVIDER_LABEL[protocol]} Connection`}>
          <Field label="Client ID">
            <input data-ui-field="input" className="input-field" value={protocol === 'outlook' ? f.outlookClientId : f.gmailClientId}
              onChange={e => set(protocol === 'outlook' ? 'outlookClientId' : 'gmailClientId', e.target.value)} />
          </Field>
          <Field label="Client Secret"
            hint={(protocol === 'outlook' ? f.outlookClientSecret : f.gmailClientSecret) === '••••••••' ? 'A secret is already saved — re-enter it only if you want to change it.' : undefined}>
            <input data-ui-field="input" className="input-field" type="password" value={protocol === 'outlook' ? f.outlookClientSecret : f.gmailClientSecret}
              onChange={e => set(protocol === 'outlook' ? 'outlookClientSecret' : 'gmailClientSecret', e.target.value)} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Badge variant={(protocol === 'outlook' ? f.outlookStatus : f.gmailStatus) === 'authorized' ? 'success' : 'gray'}>
              {(protocol === 'outlook' ? f.outlookStatus : f.gmailStatus) === 'authorized' ? 'Authorized' : 'Unauthorized'}
            </Badge>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleConnect(protocol as 'outlook' | 'gmail')} disabled={connecting === protocol} data-ui-native-button="">
              {connecting === protocol ? 'Connecting…' : 'Save & Authorize'}
            </button>
          </div>
        </Card>
      )}
      <Card title="Sender Identity">
        <Field label="From Name"><input data-ui-field="input" className="input-field" value={f.fromName} onChange={e => set('fromName', e.target.value)} /></Field>
        <Field label="From Email"><input data-ui-field="input" className="input-field" type="email" value={f.fromEmail} onChange={e => set('fromEmail', e.target.value)} /></Field>
        <Field label="Email Signature" full>
          <textarea className="input-field s-resize-v s-font-mono" rows={4} value={f.sig} onChange={e => set('sig', e.target.value)} placeholder="HTML signature appended to outgoing emails" />
        </Field>
      </Card>
      <Card title="Inbound Mail (Support Tickets)">
        <ToggleRow
          label="Convert incoming email into support tickets"
          hint="Polls this mailbox every few minutes — a reply referencing an existing ticket is appended to it; anything else from a known customer opens a new one."
          value={imapEnabled} onChange={setImapEnabled}
        />
        {imapEnabled && (
          <>
            <Field label="IMAP Host"><input data-ui-field="input" className="input-field" placeholder="imap.example.com" value={imap.host} onChange={e => setImap('host', e.target.value)} /></Field>
            <Field label="Port"><input data-ui-field="input" className="input-field" type="number" value={imap.port} onChange={e => setImap('port', e.target.value)} /></Field>
            <Field label="Encryption">
              <Select value={imap.encryption || '__none__'} onValueChange={v => setImap('encryption', v === '__none__' ? '' : v)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (Recommended)</SelectItem>
                  <SelectItem value="tls">STARTTLS</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Username"><input data-ui-field="input" className="input-field" placeholder="tickets@example.com" value={imap.user} onChange={e => setImap('user', e.target.value)} /></Field>
            <Field label="Password" hint={imap.pass === '••••••••' ? 'A password is already saved — re-enter it only if you want to change it.' : undefined}>
              <input data-ui-field="input" className="input-field" type="password" value={imap.pass} onChange={e => setImap('pass', e.target.value)} />
            </Field>
            <Field label="Default Department" hint="Free text — matched against whatever department names this tenant already uses.">
              <input data-ui-field="input" className="input-field" value={imap.targetDepartment} onChange={e => setImap('targetDepartment', e.target.value)} />
            </Field>
            <Field label="Default Ticket Category"><input data-ui-field="input" className="input-field" value={imap.ticketType} onChange={e => setImap('ticketType', e.target.value)} /></Field>
            <ToggleRow label="Mark imported emails as read" value={imapMarkAsRead} onChange={setImapMarkAsRead} />
          </>
        )}
      </Card>
      <SaveRow
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {protocol !== 'smtp' && (
              <input data-ui-field="input"
                className="input-field"
                type="email"
                placeholder="Send test to (optional)"
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                style={{ width: 220 }}
              />
            )}
            <Button variant="outline" type="button" onClick={handleTestEmail} loading={testing} loadingText="Sending…">
              Send Test Email
            </Button>
            {testResult && (
              <span style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                {testResult.ok ? '✓ Sent' : testResult.msg}
              </span>
            )}
          </div>
        }
        saving={saving} saved={saved} onSave={handleSave}
      />
    </>
  );
};

// -- section: Finance General ------------------------------------------------
/**
 * Used to also carry a "Tax & Pricing" card (a second, competing Default Tax
 * Rate select, plus "Show Tax Per Item"/"Show Quantity Field" toggles) that
 * saved to a `finance-general` key nothing in the platform ever reads —
 * grepped the whole repo, zero hits outside this file. Real per-transaction
 * tax rates are configured once, for real, in FinOps ▸ Tax codes & rates
 * (linked from the "Finance setup" card below) — this used to be a second,
 * dead surface for the exact same concern. Currency and Fiscal Year Start
 * are real (they write into the `company` key, read by tax-code seeding and
 * the invoice PDF header), so those stay.
 */
