import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { ListPagination, paginate, useListPagination } from '../components/ui/list-pagination.js';
import { MetricsRow } from '../components/MetricCard.js';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './Seal.css';

interface Compartment {
  id: string;
  code: string;
  name: string;
  warehouse_type: string;
  jurisdiction: string;
  default_storage_days: number;
  guarantee_id: string | null;
  storage_fee_per_day: string;
  storage_fee_currency: string;
  handling_fee_flat: string;
  storage_fee_per_cbm_per_day: string;
  billing_method: 'flat_per_lot' | 'per_cbm';
  geofence_id: string | null;
  active: boolean;
  licence_number?: string | null;
  licence_expiry?: string | null;
  customs_office_code?: string | null;
  logo_url?: string | null;
}

interface Zone {
  id: string;
  compartment_id: string;
  code: string;
  name: string;
  zone_type: string;
}

interface Location {
  id: string;
  compartment_id: string;
  zone_id: string;
  code: string;
  location_type: string;
  volume_cbm: string | null;
}

interface Lot {
  id: string;
  lot_number: string;
  description: string;
  qty_on_hand: number;
  uom: string;
  status: string;
}

const ZONE_TYPE_LABELS: Record<string, string> = {
  bulk: 'Bulk Storage',
  receiving: 'Receiving',
  pick: 'Pick Area',
  quarantine: 'Quarantine',
  yard: 'Yard Slot',
  vas: 'Value-Added Services',
  outbound: 'Outbound Staging',
  sort_lane: 'Sort Lane',
};

export function SealCompartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<{
    compartment: Compartment;
    zones: Zone[];
    locations: Location[];
    lots: Lot[];
    stats: { zoneCount: number; locationCount: number; lotCount: number; totalCapacityUnits: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'lots' | 'billing'>('overview');

  // New Zone Form
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneCode, setNewZoneCode] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('bulk');
  const [addingZone, setAddingZone] = useState(false);

  // Lots Search & Pagination
  const [lotSearch, setLotSearch] = useState('');
  const { page: lotPage, setPage: setLotPage, pageSize: lotPageSize, setPageSize: setLotPageSize } =
    useListPagination(10);

  function loadDetail() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}`)
      .then(res => setData(res))
      .catch(err => showAlert(err.message || 'Failed to load compartment details'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="seal-page">
        <SectionLoading label="Loading compartment details…" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="seal-page">
        <div className="seal-card">
          <div className="seal-empty">Compartment not found.</div>
        </div>
      </div>
    );
  }

  const { compartment: c, zones, locations, lots, stats } = data;
  const isSuspended = !c.active;

  async function handleDuplicate() {
    try {
      const res = await apiFetch(`/v1/seal/compartments/${c.id}/duplicate`, { method: 'POST' });
      showAlert(`Compartment duplicated as ${res.code}`, { variant: 'success' });
      window.dispatchEvent(new Event('seal-warehouses-updated'));
      navigate(`/seal/compartments/${res.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to duplicate compartment');
    }
  }

  async function handleToggleStatus() {
    try {
      await apiFetch(`/v1/seal/compartments/${c.id}/toggle-status`, { method: 'POST' });
      window.dispatchEvent(new Event('seal-warehouses-updated'));
      loadDetail();
    } catch (err: any) {
      showAlert(err.message || 'Failed to toggle status');
    }
  }

  async function handleDelete() {
    const ok = await showConfirm(
      `Are you sure you want to delete ${c.name}? This will deactivate the compartment.`,
      { title: 'Delete compartment', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    try {
      await apiFetch(`/v1/seal/compartments/${c.id}`, { method: 'DELETE' });
      showAlert('Compartment deleted', { variant: 'success' });
      window.dispatchEvent(new Event('seal-warehouses-updated'));
      navigate('/seal/compartments');
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete compartment');
    }
  }

  async function handleAddZone(e: React.FormEvent) {
    e.preventDefault();
    if (!newZoneCode.trim() || !newZoneName.trim()) return;
    setAddingZone(true);
    try {
      await apiFetch('/v1/seal/zones', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId: c.id,
          code: newZoneCode.trim(),
          name: newZoneName.trim(),
          zoneType: newZoneType,
        }),
      });
      setNewZoneCode('');
      setNewZoneName('');
      setShowAddZone(false);
      loadDetail();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add zone');
    } finally {
      setAddingZone(false);
    }
  }

  const filteredLots = lots.filter(l => {
    if (!lotSearch.trim()) return true;
    const q = lotSearch.toLowerCase();
    return (
      (l.lot_number || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.status || '').toLowerCase().includes(q)
    );
  });
  const { visible: pagedLots } = paginate(filteredLots, lotPage, lotPageSize);

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Compartments', to: '/seal/compartments' },
          c.code,
        ]}
        titlePlain="Bonded"
        titleEm="compartment"
        subtitle="Its zones, locations and what is stored in them."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/seal/compartments')}>
              <Icon name="arrowLeft" size={14} />
              <span>All Compartments</span>
            </Button>

            <Button variant="outline" size="sm" onClick={() => navigate(`/seal/compartments/${c.id}/edit`)}>
              <Icon name="edit" size={14} />
              <span>Edit</span>
            </Button>

            <Button size="sm" onClick={() => navigate(`/seal/compartments/${c.id}/layout`)}>
              <Icon name="warehouse" size={14} />
              <span>Warehouse Layout</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Compartment actions">
                  <Icon name="moreHorizontal" size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate(`/seal/compartments/${c.id}/heat-grid`)}>
                  <Icon name="grid" size={14} />
                  <span>Zone Heat Grid</span>
                </DropdownMenuItem>
                {c.warehouse_type === 'sorting_centre' && (
                  <DropdownMenuItem onClick={() => navigate(`/seal/compartments/${c.id}/sorting-dashboard`)}>
                    <Icon name="arrowUpDown" size={14} />
                    <span>Sorting Dashboard</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Icon name="copy" size={14} />
                  <span>Duplicate Compartment</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleToggleStatus}>
                  <Icon name={isSuspended ? 'play' : 'pause'} size={14} />
                  <span>{isSuspended ? 'Reactivate Compartment' : 'Suspend Compartment'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
                  <Icon name="trash" size={14} />
                  <span>Delete Compartment</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Compartment Identity Summary Card */}
      <div className="seal-card" style={{ padding: 20, marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 240 }}>
            <CompanyAvatar
              name={c.name}
              logoUrl={c.logo_url}
              size={52}
              shape="square"
              style={{ boxShadow: 'var(--elev-sm)' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 className="seal-entity-title" style={{ margin: 0 }}>{c.name}</h2>
                <Badge variant={isSuspended ? 'gray' : 'brand'}>
                  {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                </Badge>
              </div>
              <div className="seal-mono" style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>
                {c.code} · {c.warehouse_type.replace(/_/g, ' ').toUpperCase()} · Jurisdiction: {c.jurisdiction} · {c.default_storage_days}d storage
              </div>
              {c.licence_number && (
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                  License: <strong style={{ color: 'var(--ink)' }}>{c.licence_number}</strong>
                  {c.customs_office_code ? ` · Customs Office: ${c.customs_office_code}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Row */}
      <MetricsRow
        cards={[
          {
            title: 'Zones & Racks',
            value: String(stats.zoneCount),
            icon: 'layers',
            barHighlight: 'var(--teal)',
            sub1Label: 'Locations',
            sub1Value: `${stats.locationCount} total slots`,
          },
          {
            title: 'Lots On Hand',
            value: String(stats.lotCount),
            icon: 'package',
            barHighlight: 'var(--teal)',
            sub1Label: 'Inventory',
            sub1Value: 'Active bonded lots',
          },
          {
            title: 'Est. Storage Rate',
            value: `${c.storage_fee_currency} ${Number(c.storage_fee_per_day).toLocaleString()}`,
            icon: 'dollarSign',
            barHighlight: 'var(--teal)',
            sub1Label: 'Billing',
            sub1Value: c.billing_method === 'per_cbm' ? 'Per CBM / day' : 'Flat per lot / day',
          },
          {
            title: 'Capacity Units',
            value: stats.totalCapacityUnits.toLocaleString(),
            icon: 'warehouse',
            barHighlight: 'var(--teal)',
            sub1Label: 'Capacity',
            sub1Value: 'Est. max storage capacity',
          },
        ]}
      />

      {/* Design System Tabs */}
      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="overview">Overview & Zones ({zones.length})</TabsTrigger>
            <TabsTrigger value="lots">Lots On Hand ({lots.length})</TabsTrigger>
            <TabsTrigger value="billing">Billing & License</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab 1: Overview & Zones */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="seal-card">
            <div className="seal-card-hdr">
              <div>
                <h3 className="seal-card-title">Configured Storage Zones ({zones.length})</h3>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                  Logical warehouse zones and their assigned slot locations.
                </div>
              </div>
              <Button
                variant={showAddZone ? 'outline' : 'default'}
                size="sm"
                onClick={() => setShowAddZone(v => !v)}
              >
                <Icon name={showAddZone ? 'x' : 'plus'} size={14} />
                <span>{showAddZone ? 'Cancel' : 'Add Zone'}</span>
              </Button>
            </div>

            {showAddZone && (
              <form
                onSubmit={handleAddZone}
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--card-sunken, var(--bg))',
                }}
              >
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ width: 160, minWidth: 140 }}>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Zone Code
                    </label>
                    <Input
                      value={newZoneCode}
                      onChange={e => setNewZoneCode(e.target.value)}
                      placeholder="Z-BULK-01"
                      required
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Zone Name
                    </label>
                    <Input
                      value={newZoneName}
                      onChange={e => setNewZoneName(e.target.value)}
                      placeholder="Bulk Storage Area"
                      required
                    />
                  </div>
                  <div style={{ width: 180, minWidth: 150 }}>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Zone Type
                    </label>
                    <Select value={newZoneType} onValueChange={setNewZoneType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bulk">Bulk Storage</SelectItem>
                        <SelectItem value="receiving">Receiving</SelectItem>
                        <SelectItem value="pick">Pick Area</SelectItem>
                        <SelectItem value="quarantine">Quarantine</SelectItem>
                        <SelectItem value="yard">Yard Slot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" size="sm" disabled={addingZone}>
                    <Icon name="plus" size={14} />
                    <span>{addingZone ? 'Saving…' : 'Save Zone'}</span>
                  </Button>
                </div>
              </form>
            )}

            <div style={{ padding: 20 }}>
              {zones.length === 0 ? (
                <div className="seal-empty">
                  No storage zones created yet. Click <strong>Add Zone</strong> to configure the first zone.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 12,
                  }}
                >
                  {zones.map(z => {
                    const zoneLocations = locations.filter(l => l.zone_id === z.id);
                    return (
                      <div
                        key={z.id}
                        style={{
                          padding: 16,
                          borderRadius: 'var(--r)',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                          <FeaturedIcon variant="brand" size="sm" shape="square">
                            <Icon name="layers" size={14} />
                          </FeaturedIcon>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                              {z.name}
                            </div>
                            <div
                              className="seal-mono"
                              style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}
                            >
                              {z.code} · {zoneLocations.length} {zoneLocations.length === 1 ? 'slot' : 'slots'}
                            </div>
                          </div>
                        </div>
                        <Badge variant="gray">
                          {ZONE_TYPE_LABELS[z.zone_type] || z.zone_type.toUpperCase()}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Lots On Hand */}
      {activeTab === 'lots' && (
        <div className="seal-card">
          <div className="seal-card-hdr" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 className="seal-card-title">Bonded Lots Stored in {c.name}</h3>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                Active inventory lots currently assigned to this compartment.
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/seal/lots/new')}>
              <Icon name="plus" size={14} />
              <span>Receive Lot</span>
            </Button>
          </div>

          {lots.length > 0 && (
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
              <SearchToolbar
                search={lotSearch}
                onSearch={setLotSearch}
                placeholder="Search lot number, description, or status…"
              />
            </div>
          )}

          <div className="seal-card-body">
            {filteredLots.length === 0 ? (
              <div className="seal-empty">
                {lots.length === 0
                  ? 'No active lots currently stored in this compartment.'
                  : 'No lots match your search query.'}
              </div>
            ) : (
              <>
                <table className="seal-table">
                  <thead>
                    <tr>
                      <th>Lot #</th>
                      <th>Description</th>
                      <th>Qty on Hand</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLots.map(l => (
                      <tr key={l.id} onClick={() => navigate(`/seal/lots/${l.id}`)}>
                        <td className="seal-mono" style={{ fontWeight: 700 }}>
                          {l.lot_number || l.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td>{l.description}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {Number(l.qty_on_hand || 0).toLocaleString()} {l.uom}
                        </td>
                        <td>
                          <Badge variant={l.status === 'RELEASED' || l.status === 'ACTIVE' ? 'brand' : 'gray'}>
                            {l.status}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => navigate(`/seal/lots/${l.id}`)}
                          >
                            View Lot
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '0 20px 16px' }}>
                  <ListPagination
                    total={filteredLots.length}
                    page={lotPage}
                    pageSize={lotPageSize}
                    onPageChange={setLotPage}
                    onPageSizeChange={setLotPageSize}
                    pageSizeOptions={[10, 15, 25, 50]}
                    noun="lots"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Billing & License */}
      {activeTab === 'billing' && (
        <div className="seal-card">
          <div className="seal-card-hdr">
            <div>
              <h3 className="seal-card-title">Customs License & Billing Tariffs</h3>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                Regulatory licensing and storage accrual rates for {c.name}.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/seal/compartments/${c.id}/edit`)}
            >
              <Icon name="edit" size={14} />
              <span>Edit Configuration</span>
            </Button>
          </div>
          <div
            style={{
              padding: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 20,
            }}
          >
            <div className="seal-field-row">
              <span className="seal-field-label">Warehouse Type</span>
              <span className="seal-field-value">
                {c.warehouse_type.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Customs License Number</span>
              <span className="seal-field-value seal-mono">{c.licence_number || '—'}</span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">License Expiry</span>
              <span className="seal-field-value">
                {c.licence_expiry ? new Date(c.licence_expiry).toLocaleDateString() : '—'}
              </span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Customs Office Code</span>
              <span className="seal-field-value seal-mono">{c.customs_office_code || '—'}</span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Billing Method</span>
              <span className="seal-field-value">
                {c.billing_method === 'per_cbm' ? 'Volume Based (Per CBM / Day)' : 'Flat Rate (Per Lot / Day)'}
              </span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Daily Storage Rate</span>
              <span className="seal-field-value">
                {c.storage_fee_currency} {Number(c.storage_fee_per_day || 0).toLocaleString()} / day
              </span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Per-CBM Daily Rate</span>
              <span className="seal-field-value">
                {c.storage_fee_currency} {Number(c.storage_fee_per_cbm_per_day || 0).toLocaleString()} / CBM
              </span>
            </div>
            <div className="seal-field-row">
              <span className="seal-field-label">Flat Handling Fee</span>
              <span className="seal-field-value">
                {c.storage_fee_currency} {Number(c.handling_fee_flat || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
