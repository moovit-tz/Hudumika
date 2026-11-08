import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Banner } from '../components/ui/alert.js';
import { Tip } from '../components/ui/tooltip.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

export interface Consignment {
  id: string;
  compartment_id?: string;
  owner_id?: string;
  owner_name?: string;
  transport_doc_type: string;
  transport_doc_number: string | null;
  status: string;
  expected_arrival: string | null;
  goods_description: string | null;
  gross_weight_kg: number | null;
  compartment_name?: string | null;
  created_at?: string;
}

export interface Compartment {
  id: string;
  code: string;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  category?: string;
}

export const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  EXPECTED: 'gray',
  ARRIVED_AT_GATE: 'info',
  GATE_IN_COMPLETE: 'info',
  IN_YARD: 'brand',
  AWAITING_CUSTOMS: 'warning',
  UNDER_EXAMINATION: 'warning',
  RELEASED_FOR_DEVANNING: 'brand',
  DEVANNING: 'brand',
  DEVANNED: 'success',
  EMPTY_RETURNED: 'success',
  HELD_BY_CUSTOMS: 'error',
  HELD_BY_AGENCY: 'error',
  DAMAGED: 'error',
  SHORT_SHIPPED: 'error',
  REJECTED_AT_GATE: 'error',
};

const STATUS_LABELS: Record<string, string> = {
  EXPECTED: 'Expected',
  ARRIVED_AT_GATE: 'Arrived at Gate',
  GATE_IN_COMPLETE: 'Gate In Complete',
  IN_YARD: 'In Yard',
  AWAITING_CUSTOMS: 'Awaiting Customs',
  UNDER_EXAMINATION: 'Under Examination',
  RELEASED_FOR_DEVANNING: 'Released for Devanning',
  DEVANNING: 'Devanning',
  DEVANNED: 'Devanned',
  EMPTY_RETURNED: 'Empty Returned',
  HELD_BY_CUSTOMS: 'Held by Customs',
  HELD_BY_AGENCY: 'Held by Agency',
  DAMAGED: 'Damaged',
  SHORT_SHIPPED: 'Short Shipped',
  REJECTED_AT_GATE: 'Rejected at Gate',
};

const TRANSPORT_DOC_TYPES = ['BL', 'AWB', 'CMR', 'RAIL_WAYBILL'];

type StageTab = 'all' | 'pre_arrival' | 'yard' | 'customs' | 'devanning' | 'holds';
type SortOption = 'created' | 'eta' | 'weight' | 'doc';


export function SealConsignments() {
  const navigate = useNavigate();
  const [compartmentId] = useSealCompartmentId();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & State
  const [search, setSearch] = useState('');
  const [stageTab, setStageTab] = useState<StageTab>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');
  const [compartmentFilter, setCompartmentFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('created');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return (localStorage.getItem('hudumika_seal_consignments_view') as 'grid' | 'table') || 'grid';
  });


  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const url = `/v1/seal/consignments${compartmentId ? `?compartment_id=${compartmentId}` : ''}`;
      const res: any = await apiFetch(url);
      setConsignments(Array.isArray(res) ? res : res.data ?? []);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load consignments.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [compartmentId]);

  useEffect(() => {
    apiFetch('/v1/seal/compartments')
      .then((rows: Compartment[]) => {
        setCompartments(rows || []);
      })
      .catch(() => {});
  }, []);

  const handleViewChange = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_seal_consignments_view', mode);
  };

  // KPI Calculations
  const todayStr = useMemo(() => new Date().toDateString(), []);
  const todayTimestamp = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)).getTime(), []);

  const stats = useMemo(() => {
    const total = consignments.length;
    const expected = consignments.filter(c => c.status === 'EXPECTED').length;
    const arrivingToday = consignments.filter(c => c.expected_arrival && new Date(c.expected_arrival).toDateString() === todayStr).length;
    const activeYard = consignments.filter(c => ['ARRIVED_AT_GATE', 'GATE_IN_COMPLETE', 'IN_YARD'].includes(c.status)).length;
    const held = consignments.filter(c => ['HELD_BY_CUSTOMS', 'HELD_BY_AGENCY', 'DAMAGED', 'SHORT_SHIPPED', 'REJECTED_AT_GATE'].includes(c.status)).length;
    const devanned = consignments.filter(c => ['RELEASED_FOR_DEVANNING', 'DEVANNING', 'DEVANNED', 'EMPTY_RETURNED'].includes(c.status)).length;
    const totalWeightKg = consignments.reduce((sum, c) => sum + (c.gross_weight_kg ?? 0), 0);

    return { total, expected, arrivingToday, activeYard, held, devanned, totalWeightKg };
  }, [consignments, todayStr]);

  // Stage Tab Filter Logic
  const stageFiltered = useMemo(() => {
    switch (stageTab) {
      case 'pre_arrival':
        return consignments.filter(c => ['EXPECTED', 'ARRIVED_AT_GATE'].includes(c.status));
      case 'yard':
        return consignments.filter(c => ['GATE_IN_COMPLETE', 'IN_YARD'].includes(c.status));
      case 'customs':
        return consignments.filter(c => ['AWAITING_CUSTOMS', 'UNDER_EXAMINATION', 'HELD_BY_CUSTOMS', 'HELD_BY_AGENCY'].includes(c.status));
      case 'devanning':
        return consignments.filter(c => ['RELEASED_FOR_DEVANNING', 'DEVANNING', 'DEVANNED', 'EMPTY_RETURNED'].includes(c.status));
      case 'holds':
        return consignments.filter(c => ['HELD_BY_CUSTOMS', 'HELD_BY_AGENCY', 'DAMAGED', 'SHORT_SHIPPED', 'REJECTED_AT_GATE'].includes(c.status));
      default:
        return consignments;
    }
  }, [consignments, stageTab]);

  // Secondary Filters & Search
  const filtered = useMemo(() => {
    let list = stageFiltered;

    // Doc type filter
    if (docTypeFilter !== 'all') {
      list = list.filter(c => c.transport_doc_type === docTypeFilter);
    }

    // Compartment filter
    if (compartmentFilter !== 'all') {
      list = list.filter(c => c.compartment_id === compartmentFilter);
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        (c.transport_doc_number ?? '').toLowerCase().includes(q) ||
        (c.owner_name ?? '').toLowerCase().includes(q) ||
        (c.goods_description ?? '').toLowerCase().includes(q) ||
        (c.compartment_name ?? '').toLowerCase().includes(q) ||
        (STATUS_LABELS[c.status] ?? c.status).toLowerCase().includes(q)
      );
    }

    // Sorting
    const sorted = [...list];
    switch (sortBy) {
      case 'eta':
        sorted.sort((a, b) => {
          if (!a.expected_arrival) return 1;
          if (!b.expected_arrival) return -1;
          return new Date(a.expected_arrival).getTime() - new Date(b.expected_arrival).getTime();
        });
        break;
      case 'weight':
        sorted.sort((a, b) => (b.gross_weight_kg ?? 0) - (a.gross_weight_kg ?? 0));
        break;
      case 'doc':
        sorted.sort((a, b) => (a.transport_doc_number ?? '').localeCompare(b.transport_doc_number ?? ''));
        break;
      case 'created':
      default:
        sorted.sort((a, b) => {
          if (!a.created_at) return 1;
          if (!b.created_at) return -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        break;
    }

    return sorted;
  }, [stageFiltered, docTypeFilter, compartmentFilter, search, sortBy]);

  // Helper for arrival urgency badge
  const getArrivalInfo = (arrivalStr: string | null) => {
    if (!arrivalStr) return null;
    const arrivalDate = new Date(arrivalStr);
    const arrivalDayTimestamp = new Date(arrivalDate).setHours(0, 0, 0, 0);
    const diffDays = Math.round((arrivalDayTimestamp - todayTimestamp) / (24 * 3600 * 1000));

    if (diffDays === 0) {
      return { text: 'Arriving Today', variant: 'success' as const, isUrgent: true };
    } else if (diffDays === 1) {
      return { text: 'Tomorrow', variant: 'brand' as const, isUrgent: false };
    } else if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, variant: 'error' as const, isUrgent: true };
    } else if (diffDays <= 7) {
      return { text: `In ${diffDays} days`, variant: 'info' as const, isUrgent: false };
    } else {
      return { text: arrivalDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), variant: 'gray' as const, isUrgent: false };
    }
  };

  return (
    <div className="seal-page seal-consign-container">
      {loadError && <Banner variant="error">{loadError}</Banner>}

      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['SEAL', 'Gate & Receiving', 'Consignments']}
        titlePlain="Inbound"
        titleEm="Consignments"
        subtitle="Manage transport documents, pre-arrival manifests, gate-in staging, customs inspections, and warehouse devanning."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tip label="Reload consignments" side="bottom">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadData(true)}
                disabled={refreshing}
              >
                <Icon name="refresh" size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </Button>
            </Tip>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/seal/consignments/new')}
              style={{ background: 'var(--seal, #0f766e)', color: '#ffffff' }}
            >
              <Icon name="plus" size={14} />
              <span>Register Inbound</span>
            </Button>
          </div>
        }
      />

      {/* ── 6 Executive KPI Overview Cards ── */}
      <div className="seal-kpi-modern-grid">
        {/* Total Consignments */}
        <div
          className={`seal-kpi-tile${stageTab === 'all' ? ' active' : ''}`}
          onClick={() => setStageTab('all')}
        >
          <div className="seal-kpi-tile-icon" style={{ background: 'var(--teal-l)', color: 'var(--teal)' }}>
            <Icon name="truck" size={19} />
          </div>
          <div className="seal-kpi-tile-info">
            <span className="seal-kpi-tile-num">{stats.total}</span>
            <span className="seal-kpi-tile-label">Total Inbound</span>
          </div>
        </div>

        {/* Expected Pre-Arrival */}
        <div
          className={`seal-kpi-tile${stageTab === 'pre_arrival' ? ' active' : ''}`}
          onClick={() => setStageTab('pre_arrival')}
        >
          <div className="seal-kpi-tile-icon" style={{ background: '#f1f5f9', color: '#475569' }}>
            <Icon name="clock" size={19} />
          </div>
          <div className="seal-kpi-tile-info">
            <span className="seal-kpi-tile-num">{stats.expected}</span>
            <span className="seal-kpi-tile-label">Pre-Arrival</span>
          </div>
        </div>

        {/* Arriving Today */}
        <div
          className="seal-kpi-tile"
          onClick={() => {
            setStageTab('all');
            setSearch(todayStr);
          }}
        >
          <div className="seal-kpi-tile-icon" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>
            <Icon name="calendar" size={19} />
          </div>
          <div className="seal-kpi-tile-info">
            <div className="seal-kpi-tile-num" style={{ color: 'var(--green)' }}>
              <span>{stats.arrivingToday}</span>
              {stats.arrivingToday > 0 && <span className="seal-pulse-dot" style={{ color: 'var(--green)' }} />}
            </div>
            <span className="seal-kpi-tile-label">Arriving Today</span>
          </div>
        </div>

        {/* Active in Yard */}
        <div
          className={`seal-kpi-tile${stageTab === 'yard' ? ' active' : ''}`}
          onClick={() => setStageTab('yard')}
        >
          <div className="seal-kpi-tile-icon" style={{ background: 'var(--blue-l)', color: 'var(--blue)' }}>
            <Icon name="package" size={19} />
          </div>
          <div className="seal-kpi-tile-info">
            <span className="seal-kpi-tile-num text-blue-600">{stats.activeYard}</span>
            <span className="seal-kpi-tile-label">Active in Yard</span>
          </div>
        </div>

        {/* Customs Holds */}
        <div
          className={`seal-kpi-tile${stageTab === 'holds' ? ' active' : ''}`}
          onClick={() => setStageTab('holds')}
        >
          <div className="seal-kpi-tile-icon" style={{ background: stats.held > 0 ? '#fee2e2' : '#f8fafc', color: stats.held > 0 ? '#dc2626' : '#64748b' }}>
            <Icon name="alertTriangle" size={19} />
          </div>
          <div className="seal-kpi-tile-info">
            <span className={`seal-kpi-tile-num ${stats.held > 0 ? 'text-red-600' : ''}`}>
              {stats.held}
            </span>
            <span className="seal-kpi-tile-label">Customs Holds</span>
          </div>
        </div>

        {/* Devanned & Total Tonnage */}
        <div
          className={`seal-kpi-tile${stageTab === 'devanning' ? ' active' : ''}`}
          onClick={() => setStageTab('devanning')}
        >
          <div className="seal-kpi-tile-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Icon name="scale" size={19} />
          </div>
          <div className="seal-kpi-tile-info">
            <span className="seal-kpi-tile-num" style={{ fontSize: 17 }}>
              {stats.totalWeightKg > 0 ? `${(stats.totalWeightKg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} t` : '0 t'}
            </span>
            <span className="seal-kpi-tile-label">Total Tonnage</span>
          </div>
        </div>
      </div>

      {/* ── Lifecycle Stage Tabs ── */}
      <div className="seal-stage-tabs-wrap">
        <Tabs value={stageTab} onValueChange={v => setStageTab(v as StageTab)}>
          <TabsList>
            <TabsTrigger value="all">
              <span>All Consignments</span>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 700 }}>
                {consignments.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="pre_arrival">
              <span>Pre-Arrival</span>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 700 }}>
                {stats.expected}
              </span>
            </TabsTrigger>
            <TabsTrigger value="yard">
              <span>Yard &amp; Gate</span>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 700 }}>
                {stats.activeYard}
              </span>
            </TabsTrigger>
            <TabsTrigger value="customs">
              <span>Customs Inspection</span>
            </TabsTrigger>
            <TabsTrigger value="devanning">
              <span>Devanning</span>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: 'var(--bg)', color: 'var(--ink2)', fontWeight: 700 }}>
                {stats.devanned}
              </span>
            </TabsTrigger>
            {stats.held > 0 && (
              <TabsTrigger value="holds" style={{ color: 'var(--red)' }}>
                <Icon name="alertTriangle" size={12} />
                <span>Issues &amp; Holds</span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>
                  {stats.held}
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* View Switcher: Card View vs Table View */}
        <div style={{ display: 'inline-flex', background: 'var(--bg)', padding: 3, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          <Tip label="Card View" side="bottom">
            <button
              type="button"
              onClick={() => handleViewChange('grid')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 'calc(var(--r-sm) - 2px)',
                background: viewMode === 'grid' ? 'var(--card-bg, #ffffff)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--seal, var(--teal))' : 'var(--ink3)',
                boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon name="grid" size={13} />
              <span>Cards</span>
            </button>
          </Tip>
          <Tip label="Table View" side="bottom">
            <button
              type="button"
              onClick={() => handleViewChange('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 'calc(var(--r-sm) - 2px)',
                background: viewMode === 'table' ? 'var(--card-bg, #ffffff)' : 'transparent',
                color: viewMode === 'table' ? 'var(--seal, var(--teal))' : 'var(--ink3)',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon name="list" size={13} />
              <span>Table</span>
            </button>
          </Tip>
        </div>
      </div>

      {/* ── Search & Filter Toolbar ── */}
      <div className="seal-toolbar-row">
        {/* Left: Search Bar */}
        <div className="seal-toolbar-left">
          <div style={{ position: 'relative', width: '100%' }}>
            <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              className="input-field"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by doc number, client name, cargo, or warehouse bay…"
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 34, paddingRight: search ? 30 : 12, height: 36, fontSize: 13 }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right: Select Filters & Sort */}
        <div className="seal-toolbar-right">
          {/* Doc Type Selector */}
          <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
            <SelectTrigger style={{ height: 36, minWidth: 120 }}>
              <SelectValue placeholder="Doc Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Doc Types</SelectItem>
              {TRANSPORT_DOC_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Warehouse Compartment Selector */}
          {compartments.length > 1 && (
            <Select value={compartmentFilter} onValueChange={setCompartmentFilter}>
              <SelectTrigger style={{ height: 36, minWidth: 160 }}>
                <SelectValue placeholder="Warehouse Bay" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Compartments</SelectItem>
                {compartments.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Sort Selector */}
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
            <SelectTrigger style={{ height: 36, minWidth: 160 }}>
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Recently Created</SelectItem>
              <SelectItem value="eta">ETA (Soonest First)</SelectItem>
              <SelectItem value="weight">Gross Weight (High-to-Low)</SelectItem>
              <SelectItem value="doc">Doc Number (A—Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Main View (Loading / Empty / Cards / Table) ── */}
      {loading ? (
        <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--ink3)' }}>
          <SectionLoading />
          <p style={{ marginTop: 12, fontSize: 13, fontWeight: 500 }}>Loading inbound warehouse consignments…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="seal-card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--teal-l)', color: 'var(--seal, var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="truck" size={24} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
            {consignments.length === 0 ? 'No Inbound Consignments Registered' : 'No Consignments Match Your Filters'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 440, margin: '0 auto 20px', lineHeight: 1.5 }}>
            {consignments.length === 0
              ? 'Pre-arrival consignments appear here as transport documents (BL, AWB, CMR) are entered. Register your first consignment to track gate-in and devanning.'
              : 'Try clearing your search term, switching stage tabs, or adjusting warehouse compartment filters.'}
          </p>
          {consignments.length === 0 ? (
            <Button
              variant="default"
              onClick={() => navigate('/seal/consignments/new')}
              style={{ background: 'var(--seal, #0f766e)', color: '#ffffff' }}
            >
              <Icon name="plus" size={14} />
              <span>Register Inbound Consignment</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setStageTab('all');
                setDocTypeFilter('all');
                setCompartmentFilter('all');
              }}
            >
              Clear Active Filters
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRID / CARD VIEW ── */
        <div className="seal-consign-grid">
          {filtered.map(c => {
            const arrival = getArrivalInfo(c.expected_arrival);
            const compartmentObj = compartments.find(cp => cp.id === c.compartment_id);
            const compName = c.compartment_name || compartmentObj?.name || 'Warehouse Bay';

            return (
              <div
                key={c.id}
                className="seal-consign-card"
                onClick={() => navigate(`/seal/consignments/${c.id}`)}
              >
                {/* Header: Doc Type + Number + Status Badge */}
                <div className="seal-consign-card-hdr">
                  <div className="seal-consign-doc-badge">
                    <span className="seal-doc-type-pill">{c.transport_doc_type}</span>
                    <span className="seal-doc-num-mono">{c.transport_doc_number || 'PENDING'}</span>
                  </div>
                  <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                    {STATUS_LABELS[c.status] ?? c.status.replace(/_/g, ' ')}
                  </Badge>
                </div>

                {/* Owner Identity Row */}
                <div className="seal-consign-owner-row">
                  <PersonAvatar userId={c.owner_id} kind="customers" name={c.owner_name || 'Client'} size={24} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="seal-consign-owner-name">{c.owner_name || 'Unassigned Client'}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', color: 'var(--ink3)', fontWeight: 600 }}>
                    <Icon name="layers" size={10} style={{ display: 'inline', marginRight: 3 }} />
                    {compName}
                  </span>
                </div>

                {/* Goods Description */}
                <div className="seal-consign-goods-desc" title={c.goods_description ?? undefined}>
                  <Icon name="package" size={12} color="var(--ink3)" style={{ display: 'inline', marginRight: 5 }} />
                  <span>{c.goods_description || 'General commercial cargo manifest'}</span>
                </div>

                {/* Metadata Grid (Weight + ETA) */}
                <div className="seal-consign-meta-strip">
                  <div className="seal-consign-meta-item">
                    <span className="seal-consign-meta-label">Gross Weight</span>
                    <span className="seal-consign-meta-val">
                      <Icon name="scale" size={13} color="var(--ink3)" />
                      {c.gross_weight_kg ? `${(c.gross_weight_kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t` : '—'}
                    </span>
                  </div>
                  <div className="seal-consign-meta-item">
                    <span className="seal-consign-meta-label">Expected Arrival</span>
                    <span className="seal-consign-meta-val">
                      <Icon name="clock" size={13} color="var(--ink3)" />
                      {arrival ? (
                        <span style={{ color: arrival.isUrgent ? 'var(--green)' : 'var(--ink)' }}>
                          {arrival.text}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>Not scheduled</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Card Footer: Detail Link */}
                <div className="seal-consign-card-ftr">
                  <span>View Details &amp; Containers</span>
                  <Icon name="chevronRight" size={14} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── HIGH-DENSITY TABLE VIEW ── */
        <div className="seal-card">
          <div className="seal-card-body">
            <table className="seal-table">
              <thead>
                <tr>
                  <th style={{ width: 190 }}>Transport Doc</th>
                  <th>Owner / Consignee</th>
                  <th>Goods Description</th>
                  <th style={{ width: 150 }}>Warehouse Bay</th>
                  <th style={{ width: 120 }}>Gross Weight</th>
                  <th style={{ width: 150 }}>Arrival / ETA</th>
                  <th style={{ width: 160 }}>Status</th>
                  <th style={{ width: 44, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const arrival = getArrivalInfo(c.expected_arrival);
                  const compObj = compartments.find(cp => cp.id === c.compartment_id);
                  const compName = c.compartment_name || compObj?.name || '—';

                  return (
                    <tr
                      key={c.id}
                      className="seal-table-row-clickable"
                      onClick={() => navigate(`/seal/consignments/${c.id}`)}
                    >
                      {/* Transport Doc */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="seal-doc-type-pill">{c.transport_doc_type}</span>
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            {c.transport_doc_number || 'PENDING'}
                          </span>
                        </div>
                      </td>

                      {/* Owner */}
                      <td>
                        {c.owner_name ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <PersonAvatar userId={c.owner_id} kind="customers" name={c.owner_name} size={24} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.owner_name}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>—</span>
                        )}
                      </td>

                      {/* Goods Description */}
                      <td style={{ fontSize: 13, color: 'var(--ink2)', maxWidth: 220 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.goods_description ?? undefined}>
                          {c.goods_description ?? '—'}
                        </div>
                      </td>

                      {/* Warehouse Bay */}
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', padding: '2px 8px', borderRadius: 4, background: 'var(--bg)' }}>
                          {compName}
                        </span>
                      </td>

                      {/* Gross Weight */}
                      <td style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--ink)' }}>
                        {c.gross_weight_kg ? `${(c.gross_weight_kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t` : '—'}
                      </td>

                      {/* Arrival / ETA */}
                      <td>
                        {arrival ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                              {new Date(c.expected_arrival!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                            {arrival.isUrgent && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: arrival.variant === 'success' ? 'var(--green-l)' : '#fee2e2', color: arrival.variant === 'success' ? 'var(--green)' : '#dc2626' }}>
                                {arrival.text}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                          {STATUS_LABELS[c.status] ?? c.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>

                      {/* Arrow */}
                      <td style={{ textAlign: 'right' }}>
                        <Icon name="chevronRight" size={15} color="var(--ink3)" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Table Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg)',
                fontSize: 12,
                color: 'var(--ink3)',
              }}
            >
              <div>
                Showing <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> of{' '}
                <strong style={{ color: 'var(--ink)' }}>{consignments.length}</strong> consignments
                {stageTab !== 'all' && (
                  <span style={{ marginLeft: 8 }}>
                    &bull; Stage: <strong style={{ color: 'var(--seal, var(--teal))', textTransform: 'capitalize' }}>{stageTab.replace('_', ' ')}</strong>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void loadData(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink2)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Icon name="refresh" size={12} />
                <span>Refresh Table</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
