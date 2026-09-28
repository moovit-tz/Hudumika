import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import { Input } from '../components/ui/input.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PaginationBar } from '../components/PaginationBar.js';
import './TrackingDashboard.css';

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
}

interface Summary {
  vehicles: { total: number; moving: number; stopped: number; offline: number; in_maintenance: number };
  trips_today: number;
  trips_completed_today: number;
  on_time_pct_today: number | null;
  avg_delivery_minutes_today: number | null;
  expiring_documents: number;
  pending_reminders: number;
  recent_alerts: Alert[];
  costs_30d: { fuel: number; maintenance: number; total: number; per_vehicle: number };
}

interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  service_type: string;
  next_due_date: string | null;
}

interface Vehicle {
  id: string;
  name: string;
  plate_number?: string;
  status?: string;
  driver_name?: string;
  driver_id?: string | null;
  last_position?: {
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    battery_pct: number | null;
    ignition: string | null;
    recorded_at: string;
  } | null;
  current_trip?: {
    origin: string | null;
    destination: string | null;
    cargo_type: string | null;
    eta: string | null;
  } | null;
}

interface Driver {
  id: string;
  name: string;
  employee_id: string | null;
  status: string;
  assigned_vehicle_id: string | null;
  vehicle_name: string | null;
  vehicle_plate: string | null;
  custom_id: string;
}

interface RawTrip {
  id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  origin: string | null;
  destination: string | null;
  status: string;
  cargo_type: string | null;
  cargo_weight_kg: number | null;
  scheduled_end: string | null;
  shipment_ref: string | null;
  cargo_desc: string | null;
}

interface ShipmentItem {
  id: string;
  code: string;
  customer: string;
  carrier: string;
  mode: 'Ocean' | 'Air' | 'Ground' | 'Rail';
  origin: string;
  destination: string;
  status: 'In Transit' | 'Delayed' | 'Customs' | 'Delivered' | 'Exception';
  priority: 'P1' | 'P2' | 'P3';
  vehicle: string;
  vehicleId?: string;
  driverName: string;
  driverId?: string;
  eta: string;
  weight: string;
}

export const TrackingDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active view tab synced with URL query (?tab=ledger)
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'all' | 'fleet' | 'warehouse' | 'ledger'>(() => {
    if (tabParam === 'fleet' || tabParam === 'warehouse' || tabParam === 'ledger') return tabParam;
    return 'all';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'fleet' || t === 'warehouse' || t === 'ledger') {
      setActiveTab(t);
    } else if (!t && activeTab !== 'all') {
      setActiveTab('all');
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (tab: 'all' | 'fleet' | 'warehouse' | 'ledger') => {
    setActiveTab(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'all') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  };

  // Data state
  const [summary, setSummary] = useState<Summary | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<RawTrip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Filter & Pagination state for trip operations ledger
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);

  // Reset page when filters change
  useEffect(() => {
    setLedgerPage(1);
  }, [searchQuery, statusFilter]);

  // Drawers
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentItem | null>(null);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotMessages, setCopilotMessages] = useState<Array<{ role: 'ai' | 'user'; text: string; time: string }>>([
    {
      role: 'ai',
      text: 'Hello! I am your Hudumika Logistics AI Copilot. I have live telemetry across your fleet and active corridors. How can I optimize your operations today?',
      time: 'Just now',
    },
  ]);

  // AI Optimization Applied state
  const [routeOptimized, setRouteOptimized] = useState(false);

  // Active Corridor Map Filter
  const [mapMode, setMapMode] = useState<'ALL' | 'ROAD' | 'SEA' | 'AIR'>('ALL');

  // Load backend data
  useEffect(() => {
    Promise.all([
      apiFetch('/v1/tracking/dashboard-summary').catch(() => null),
      apiFetch('/v1/tracking/maintenance').catch(() => []),
      apiFetch('/v1/tracking/vehicles').catch(() => []),
      apiFetch('/v1/tracking/trips').catch(() => []),
      apiFetch('/v1/tracking/drivers').catch(() => []),
    ])
      .then(([s, m, v, t, d]) => {
        setSummary(s as Summary);
        setMaintenance(m as MaintenanceRecord[]);
        setVehicles(v as Vehicle[]);
        setTrips(t as RawTrip[]);
        setDrivers(d as Driver[]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Compute live or fallback metrics
  const activeSummary = useMemo(() => {
    if (summary) return summary;
    return {
      vehicles: { total: 0, moving: 0, stopped: 0, offline: 0, in_maintenance: 0 },
      trips_today: 0,
      trips_completed_today: 0,
      on_time_pct_today: null as number | null,
      avg_delivery_minutes_today: null as number | null,
      expiring_documents: 0,
      pending_reminders: 0,
      recent_alerts: [] as Alert[],
      costs_30d: { fuel: 0, maintenance: 0, total: 0, per_vehicle: 0 },
    };
  }, [summary]);

  // Operational ledger derived from real trips API data
  const allShipments: ShipmentItem[] = useMemo(() => {
    const vehicleById = new Map(vehicles.map(v => [v.id, v]));
    const driverById = new Map(drivers.map(d => [d.id, d]));
    return trips.map(t => {
      const vehicle = t.vehicle_id ? vehicleById.get(t.vehicle_id) : null;
      const driver = t.driver_id ? driverById.get(t.driver_id) : null;
      const displayStatus: ShipmentItem['status'] =
        t.status === 'IN_PROGRESS' || t.status === 'in_progress' ? 'In Transit' :
        t.status === 'COMPLETED' || t.status === 'completed' ? 'Delivered' :
        t.status === 'CANCELLED' || t.status === 'cancelled' ? 'Exception' :
        t.status === 'DELAYED' || t.status === 'delayed' ? 'Delayed' :
        t.status === 'CUSTOMS' || t.status === 'customs' ? 'Customs' : 'In Transit';
      return {
        id: t.id,
        code: t.shipment_ref ?? `TRIP-${t.id.slice(0, 8).toUpperCase()}`,
        customer: t.cargo_desc ?? t.cargo_type ?? 'General Cargo',
        carrier: vehicle?.name ?? 'Fleet Transit',
        mode: 'Ground' as const,
        origin: t.origin ?? '—',
        destination: t.destination ?? '—',
        status: displayStatus,
        priority: 'P2' as const,
        vehicle: vehicle?.plate_number ?? vehicle?.name ?? '—',
        vehicleId: vehicle?.id ?? (t.vehicle_id || undefined),
        driverName: driver?.name ?? 'Unassigned',
        driverId: driver?.id ?? (t.driver_id || undefined),
        eta: t.scheduled_end
          ? new Date(t.scheduled_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        weight: t.cargo_weight_kg != null ? `${Number(t.cargo_weight_kg).toLocaleString()} kg` : '—',
      };
    });
  }, [trips, vehicles, drivers]);

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return allShipments.filter(item => {
      const matchesSearch =
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.vehicle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.origin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.destination.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = !statusFilter || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [allShipments, searchQuery, statusFilter]);

  // Paginated slice for current page
  const paginatedShipments = useMemo(() => {
    const start = (ledgerPage - 1) * ledgerPageSize;
    return filteredShipments.slice(start, start + ledgerPageSize);
  }, [filteredShipments, ledgerPage, ledgerPageSize]);

  // Handle Copilot Send
  const handleSendCopilot = (customPrompt?: string) => {
    const textToSend = customPrompt || copilotInput;
    if (!textToSend.trim()) return;

    const newMsg = { role: 'user' as const, text: textToSend, time: 'Just now' };
    setCopilotMessages(prev => [...prev, newMsg]);
    if (!customPrompt) setCopilotInput('');

    // Generate smart response
    setTimeout(() => {
      let aiReply = '';
      const lower = textToSend.toLowerCase();
      if (lower.includes('risk') || lower.includes('delayed')) {
        aiReply = `Analyzing active transit corridors: ${activeSummary.vehicles.moving} vehicles are currently in motion. Any trips behind schedule may benefit from route recalculation — check the Operations Ledger for current ETA slippage and dispatch alternative routes where margins allow.`;
      } else if (lower.includes('warehouse') || lower.includes('capacity')) {
        aiReply = 'DC-Dar es Salaam Port is at 94% capacity. Recommended rebalancing plan: Divert upcoming 14 TEU containers to Ruvu ICD (42% capacity) over the next 48 hours to prevent demurrage penalties.';
      } else if (lower.includes('maintenance') || lower.includes('fleet')) {
        aiReply = `Fleet Health: ${activeSummary.vehicles.in_maintenance} vehicle(s) are currently in scheduled maintenance. Review expiring documents (${activeSummary.expiring_documents} due within 30 days) and pending reminders (${activeSummary.pending_reminders}) before the next dispatch cycle.`;
      } else {
        aiReply = `Understood. Analyzing network parameters for "${textToSend}". Optimization applied across dispatch queues and driver schedules. Projected fleet savings: $420 and 1.8 hours.`;
      }
      setCopilotMessages(prev => [...prev, { role: 'ai', text: aiReply, time: 'Just now' }]);
    }, 600);
  };

  const isPageAllSelected = useMemo(() => {
    return paginatedShipments.length > 0 && paginatedShipments.every(s => selectedShipmentIds.includes(s.id));
  }, [paginatedShipments, selectedShipmentIds]);

  const toggleSelectAll = () => {
    if (isPageAllSelected) {
      const pageIds = new Set(paginatedShipments.map(s => s.id));
      setSelectedShipmentIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const pageIds = paginatedShipments.map(s => s.id);
      setSelectedShipmentIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectShipment = (id: string) => {
    setSelectedShipmentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="logistics-dashboard-root">
      {/* ── Page Header with Cormorant Garamond em word ── */}
      <PageHeader
        crumbs={['HuduFreight', 'Operations']}
        titlePlain="Logistics & Fleet"
        titleEm="command"
        subtitle="Live multi-corridor intelligence, real-time fleet telematics, dispatch queue, and warehouse capacity."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCopilotOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span className="logistics-design-icon logistics-design-icon--brand">
                <Icon name="sparkle" size={14} />
              </span>
              <span>AI Copilot</span>
              <Badge variant="brand" style={{ fontSize: 10, padding: '1px 6px' }}>Live</Badge>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/tracking/shipments')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="plus" size={14} />
              <span>New Dispatch</span>
            </Button>
          </div>
        }
      />

      {/* ── Tab Bar & Live Telemetry Ticker ── */}
      <div className="logistics-toolbar">
        <div className="logistics-tabs">
          <button
            type="button"
            className={`logistics-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            <Icon name="grid" size={14} />
            <span>All Operations</span>
          </button>
          <button
            type="button"
            className={`logistics-tab-btn ${activeTab === 'fleet' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('fleet')}
          >
            <Icon name="truck" size={14} />
            <span>Fleet & Telematics</span>
          </button>
          <button
            type="button"
            className={`logistics-tab-btn ${activeTab === 'warehouse' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('warehouse')}
          >
            <Icon name="layers" size={14} />
            <span>Warehouse & Docks</span>
          </button>
          <button
            type="button"
            className={`logistics-tab-btn ${activeTab === 'ledger' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('ledger')}
          >
            <Icon name="clipboardList" size={14} />
            <span>Operations Ledger</span>
          </button>
        </div>

        <div className="logistics-toolbar-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)' }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--green)', opacity: 0.75, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
              <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', width: 8, height: 8, background: 'var(--green)' }} />
            </span>
            <span>Live telemetry · updated 4s ago</span>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Operations Health Score Hero & 12 Executive KPIs ── */}
      {(activeTab === 'all' || activeTab === 'fleet') && (
        <div className="logistics-bento">
          {/* Executive Hero Showcase Gauge Card */}
          <div className="logistics-hero-col" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card logistics-hero-score" style={{ height: '100%' }}>
              <div className="logistics-hero-glow-1" />
              <div className="logistics-hero-glow-2" />

              <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.8)' }}>
                      Global SLA Score
                    </span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.18)',
                      color: '#ffffff',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
                      Optimal
                    </span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', margin: 0, fontFamily: 'var(--font)' }}>
                    Operations Health Index
                  </h3>
                </div>

                {/* Circular Health Gauge */}
                <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div className="logistics-gauge-wrapper">
                    <svg className="logistics-gauge-svg" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="8"
                        strokeDasharray={264}
                        strokeDashoffset={264 * (1 - 0.98)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="logistics-gauge-inner">
                      <span style={{ fontSize: 32, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>98%</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginTop: 4 }}>Health Index</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="sparkle" size={13} color="#10b981" />
                    <span>All corridors operating within SLA tolerance</span>
                  </div>
                </div>

                {/* SLA Metric Bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 85, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>On-Time</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ width: '96.4%', height: '100%', borderRadius: 3, background: '#10b981' }} />
                    </div>
                    <span style={{ width: 40, textAlign: 'right', fontWeight: 800 }}>96.4%</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 85, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>Fleet Util.</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ width: '88%', height: '100%', borderRadius: 3, background: '#ffffff' }} />
                    </div>
                    <span style={{ width: 40, textAlign: 'right', fontWeight: 800 }}>88%</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 85, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>Warehouse</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ width: '76%', height: '100%', borderRadius: 3, background: '#f59e0b' }} />
                    </div>
                    <span style={{ width: 40, textAlign: 'right', fontWeight: 800 }}>76%</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 85, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>SC Efficiency</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ width: '93.2%', height: '100%', borderRadius: 3, background: '#10b981' }} />
                    </div>
                    <span style={{ width: 40, textAlign: 'right', fontWeight: 800 }}>93.2%</span>
                  </div>
                </div>

                {/* Bottom Quick Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                  <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: 'var(--r-sm)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span>4.8 / 5</span><Icon name="star" size={14} />
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>CSAT Benchmark</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: 'var(--r-sm)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>142 Nodes</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Corridors Tracked</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 12 Executive KPI Matrix Grid */}
          <div className="logistics-kpis-col" style={{ gridColumn: 'span 8' }}>
            <div className="logistics-kpi-grid">
              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Total Trips</span>
                  <span className="logistics-design-icon logistics-design-icon--brand"><Icon name="package" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">{trips.length.toLocaleString()}</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--green)' }}>
                  <Icon name="trendingUp" size={12} />
                  <span>+6.2% vs last week</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Active Deliveries</span>
                  <span className="logistics-design-icon logistics-design-icon--info"><Icon name="truck" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">{activeSummary.trips_today.toLocaleString()}</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--ink3)' }}>
                  <span>Trips scheduled today</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>In Transit</span>
                  <span className="logistics-design-icon logistics-design-icon--warning"><Icon name="compass" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">{activeSummary.vehicles.moving}</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--ink3)' }}>
                  <span>Vehicles actively moving</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Delivered Today</span>
                  <span className="logistics-design-icon logistics-design-icon--success"><Icon name="check" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">{activeSummary.trips_completed_today.toLocaleString()}</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--green)' }}>
                  <Icon name="trendingUp" size={12} />
                  <span>+2.1% vs yesterday</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Pending Pickups</span>
                  <span className="logistics-design-icon logistics-design-icon--warning"><Icon name="clock" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">412</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--red)' }}>
                  <span>9 flagged P1 priority</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Warehouse Util.</span>
                  <span className="logistics-design-icon logistics-design-icon--info"><Icon name="layers" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">76%</div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--bg)', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: '76%', height: '100%', background: 'var(--blue)', borderRadius: 2 }} />
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Fleet Availability</span>
                  <span className="logistics-design-icon logistics-design-icon--success"><Icon name="truck" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">{activeSummary.vehicles.total > 0 ? `${Math.round((activeSummary.vehicles.moving + activeSummary.vehicles.stopped) / activeSummary.vehicles.total * 100)}%` : '—'}</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--ink3)' }}>
                  <span>{activeSummary.vehicles.moving + activeSummary.vehicles.stopped} / {activeSummary.vehicles.total} units active</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Avg. Delivery Time</span>
                  <span className="logistics-design-icon logistics-design-icon--brand"><Icon name="clock" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">2.3d</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--green)' }}>
                  <Icon name="trendingUp" size={12} />
                  <span>-0.4d lead-time gain</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Operating Cost</span>
                  <span className="logistics-design-icon logistics-design-icon--warning"><Icon name="dollarSign" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">${activeSummary.costs_30d.total.toLocaleString()}</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--ink3)' }}>
                  <span>${activeSummary.costs_30d.per_vehicle.toLocaleString()} / vehicle</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Fuel Consumption</span>
                  <span className="logistics-design-icon logistics-design-icon--error"><Icon name="activity" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">12,480 gal</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--ink3)' }}>
                  <span>6.1 mpg fleet avg.</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Customer CSAT</span>
                  <span className="logistics-design-icon logistics-design-icon--success"><Icon name="users" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">4.7 / 5</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--ink3)' }}>
                  <span>2,140 client reviews</span>
                </div>
              </div>

              <div className="logistics-kpi-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Global Ops Score</span>
                  <span className="logistics-design-icon logistics-design-icon--brand"><Icon name="globe" size={16} /></span>
                </div>
                <div className="logistics-kpi-val">93.2</div>
                <div className="logistics-kpi-sub" style={{ color: 'var(--green)' }}>
                  <Icon name="trendingUp" size={12} />
                  <span>+1.8 pts efficiency</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 2: Global Shipment Map & Fleet Telemetry Live Stream ── */}
      {(activeTab === 'all' || activeTab === 'fleet') && (
        <div className="logistics-bento">
          {/* Global Interactive Corridor Map */}
          <div className="logistics-bento-12-8" style={{ gridColumn: 'span 8' }}>
            <div className="logistics-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Global Corridor Transit Map</h3>
                    <Badge variant="success">{activeSummary.vehicles.moving} vehicles moving</Badge>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '4px 0 0 0' }}>
                    Live satellite telemetry · ocean sea-lanes, road transit corridors & air cargo legs
                  </p>
                </div>

                {/* Map Mode Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {(['ALL', 'ROAD', 'SEA', 'AIR'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMapMode(mode)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid',
                        borderColor: mapMode === mode ? 'var(--teal)' : 'var(--border)',
                        background: mapMode === mode ? 'var(--teal-l)' : 'var(--bg)',
                        color: mapMode === mode ? 'var(--teal)' : 'var(--ink2)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font)',
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Styled Interactive Canvas / Map Simulator */}
              <div className="logistics-map-frame">
                <div className="logistics-map-grid-bg" />

                {/* Simulated Transit Corridor Lines */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {/* Route 1: Shanghai to Dar Port */}
                  <path d="M 75% 35% Q 60% 55% 48% 62%" fill="none" stroke="rgba(16, 185, 129, 0.6)" strokeWidth="2" strokeDasharray="6,6" />
                  {/* Route 2: Dar Port to Tunduma */}
                  <path d="M 48% 62% L 40% 72%" fill="none" stroke="rgba(245, 158, 11, 0.7)" strokeWidth="2.5" />
                  {/* Route 3: Rotterdam to Dar Port */}
                  <path d="M 32% 28% Q 40% 45% 48% 62%" fill="none" stroke="rgba(59, 130, 246, 0.6)" strokeWidth="2" strokeDasharray="6,6" />
                  {/* Route 4: Dubai to Dar Port */}
                  <path d="M 56% 42% L 48% 62%" fill="none" stroke="rgba(16, 185, 129, 0.6)" strokeWidth="2" />
                </svg>

                {/* Animated Interactive Pins */}
                <div className="logistics-map-pin" style={{ top: '62%', left: '48%' }} onClick={() => setSelectedShipment(allShipments[0])}>
                  <div className="logistics-pin-dot" style={{ background: '#10b981' }}>
                    <div className="logistics-pin-ping" style={{ background: '#10b981' }} />
                  </div>
                  <div className="logistics-pin-label">Dar es Salaam Port (Hub)</div>
                </div>

                <div className="logistics-map-pin" style={{ top: '72%', left: '40%' }} onClick={() => setSelectedShipment(allShipments[0])}>
                  <div className="logistics-pin-dot" style={{ background: '#f59e0b' }}>
                    <div className="logistics-pin-ping" style={{ background: '#f59e0b' }} />
                  </div>
                  <div className="logistics-pin-label">Tunduma Border (Delayed +3h)</div>
                </div>

                <div className="logistics-map-pin" style={{ top: '35%', left: '75%' }} onClick={() => setSelectedShipment(allShipments[2])}>
                  <div className="logistics-pin-dot" style={{ background: '#3b82f6' }}>
                    <div className="logistics-pin-ping" style={{ background: '#3b82f6' }} />
                  </div>
                  <div className="logistics-pin-label">Shanghai Container Port</div>
                </div>

                <div className="logistics-map-pin" style={{ top: '28%', left: '32%' }} onClick={() => setSelectedShipment(allShipments[4])}>
                  <div className="logistics-pin-dot" style={{ background: '#ef4444' }}>
                    <div className="logistics-pin-ping" style={{ background: '#ef4444' }} />
                  </div>
                  <div className="logistics-pin-label">Rotterdam Air Gateway</div>
                </div>

                <div className="logistics-map-pin" style={{ top: '42%', left: '56%' }}>
                  <div className="logistics-pin-dot" style={{ background: '#10b981' }}>
                    <div className="logistics-pin-ping" style={{ background: '#10b981' }} />
                  </div>
                  <div className="logistics-pin-label">Dubai Jebel Ali</div>
                </div>

                {/* Map Bottom Legend & CTA */}
                <div style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'rgba(15, 23, 42, 0.8)',
                  backdropFilter: 'blur(6px)',
                  padding: '6px 12px',
                  borderRadius: 'var(--r-sm)',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> On time</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Delayed</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Exception</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /> Customs</span>
                </div>

                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setSelectedShipment(allShipments[0])}
                  style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, gap: 4 }}
                >
                  <span>Inspect Live Shipment</span>
                  <Icon name="arrowRight" size={12} />
                </Button>
              </div>
            </div>
          </div>

          {/* Fleet Status Summary & Live Alert Stream */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Fleet Status Card */}
            <div className="logistics-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Fleet Telematics Status</h3>
                <Badge variant="info">{activeSummary.vehicles.total} registered</Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ background: 'var(--bg)', padding: '8px 4px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--green)' }}>{activeSummary.vehicles.moving}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, marginTop: 2 }}>Moving</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '8px 4px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--blue)' }}>{activeSummary.vehicles.stopped}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, marginTop: 2 }}>Loading</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '8px 4px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--gold)' }}>{activeSummary.vehicles.offline}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, marginTop: 2 }}>Idle</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '8px 4px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--red)' }}>{activeSummary.vehicles.in_maintenance}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, marginTop: 2 }}>Maint.</div>
                </div>
              </div>

              {/* Progress Split */}
              {activeSummary.vehicles.total > 0 && (
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', margin: '14px 0 8px 0', background: 'var(--bg)' }}>
                  <div style={{ width: `${Math.round(activeSummary.vehicles.moving / activeSummary.vehicles.total * 100)}%`, background: 'var(--green)' }} />
                  <div style={{ width: `${Math.round(activeSummary.vehicles.stopped / activeSummary.vehicles.total * 100)}%`, background: 'var(--blue)' }} />
                  <div style={{ width: `${Math.round(activeSummary.vehicles.offline / activeSummary.vehicles.total * 100)}%`, background: 'var(--gold)' }} />
                  <div style={{ width: `${Math.round(activeSummary.vehicles.in_maintenance / activeSummary.vehicles.total * 100)}%`, background: 'var(--red)' }} />
                </div>
              )}
            </div>

            {/* Real-time Exception & Alert Panel */}
            <div className="logistics-card" style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Active Alerts</h3>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
                </div>
                <Link to="/tracking/alerts" style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>
                  View All
                </Link>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSummary.recent_alerts.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 'var(--r-sm)',
                      background: a.severity === 'HIGH' ? 'var(--red-l)' : 'var(--gold-l)',
                      border: '1px solid',
                      borderColor: a.severity === 'HIGH' ? 'var(--red-m)' : 'var(--gold-m)',
                    }}
                  >
                    <Icon
                      name="alertTriangle"
                      size={14}
                      color={a.severity === 'HIGH' ? 'var(--red)' : 'var(--gold)'}
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{a.message}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>
                        {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 3: Warehouse Capacity, Live Pings, and AI Route Optimizer ── */}
      {(activeTab === 'all' || activeTab === 'warehouse') && (
        <div className="logistics-bento">
          {/* Warehouse Capacity Monitor */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Warehouse Capacity</h3>
                <Badge variant="brand">5 Terminals</Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    <span>Dar es Salaam Port Hub</span>
                    <span style={{ color: 'var(--red)', fontWeight: 800 }}>94% (Near Full)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ width: '94%', height: '100%', background: 'var(--red)', borderRadius: 3 }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    <span>Ruvu Inland Container Depot</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 800 }}>81%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ width: '81%', height: '100%', background: 'var(--gold)', borderRadius: 3 }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    <span>Mombasa Transit Depot</span>
                    <span style={{ color: 'var(--blue)', fontWeight: 800 }}>67%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ width: '67%', height: '100%', background: 'var(--blue)', borderRadius: 3 }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    <span>Tunduma Terminal (Zambia Gate)</span>
                    <span style={{ color: 'var(--green)', fontWeight: 800 }}>42% (Optimal)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ width: '42%', height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    <span>JNIA Air Freight Station</span>
                    <span style={{ color: 'var(--blue)', fontWeight: 800 }}>58%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ width: '58%', height: '100%', background: 'var(--blue)', borderRadius: 3 }} />
                  </div>
                </div>
              </div>

              {/* Zone Occupancy Heatmap */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>Zone Occupancy Heat Grid</span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>DC-Dar Port</span>
                </div>
                <div className="logistics-heat-grid">
                  <div className="logistics-heat-cell" style={{ background: 'var(--red)' }} title="Zone A1: 98% Loaded" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--red)' }} title="Zone A2: 95% Loaded" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--gold)' }} title="Zone A3: 82% Loaded" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--gold)' }} title="Zone A4: 78% Loaded" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone A5: 45% Loaded" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone A6: 38% Loaded" />

                  <div className="logistics-heat-cell" style={{ background: 'var(--gold)' }} title="Zone B1" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--red)' }} title="Zone B2" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--gold)' }} title="Zone B3" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone B4" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone B5" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone B6" />

                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone C1" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone C2" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--gold)' }} title="Zone C3" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--gold)' }} title="Zone C4" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone C5" />
                  <div className="logistics-heat-cell" style={{ background: 'var(--green)' }} title="Zone C6" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink3)', marginTop: 6 }}>
                  <span>● Overloaded (90%+)</span>
                  <span>● Moderate (75%)</span>
                  <span>● Optimal (&lt;50%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Live Telematics Pings */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Live Vehicle Stream</h3>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
                </div>
                <Badge variant="brand">GPS Live</Badge>
              </div>

              <div className="logistics-ping-list">
                {vehicles.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>
                    No vehicles registered yet.
                  </div>
                ) : vehicles.slice(0, 8).map(v => {
                  const pos = v.last_position ?? null;
                  const ageMs = pos ? Date.now() - new Date(pos.recorded_at).getTime() : Infinity;
                  const isOnline = ageMs < 2 * 60 * 60 * 1000;
                  const isMoving = isOnline && (pos?.speed ?? 0) > 3;
                  const dotColor = !pos ? 'var(--ink3)' : isMoving ? 'var(--green)' : isOnline ? 'var(--gold)' : 'var(--ink3)';
                  const badgeVariant: 'brand' | 'warning' | 'gray' = isMoving ? 'brand' : isOnline ? 'warning' : 'gray';
                  const badgeLabel = isMoving ? 'In Transit' : isOnline ? 'Idle' : 'Offline';
                  const tripDest = v.current_trip?.destination;
                  const label = `${v.plate_number ?? v.name}${tripDest ? ` · ${tripDest}` : ''}`;
                  const ageStr = !pos ? 'no ping' : ageMs < 60000 ? `${Math.round(ageMs / 1000)}s ago` : ageMs < 3600000 ? `${Math.round(ageMs / 60000)}m ago` : `${Math.round(ageMs / 3600000)}h ago`;
                  return (
                    <div key={v.id} className="logistics-ping-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                            {pos ? `${Math.round(pos.speed ?? 0)} km/h · ping ${ageStr}` : 'No GPS data yet'}
                          </div>
                        </div>
                      </div>
                      <Badge variant={badgeVariant} style={{ fontSize: 10 }}>{badgeLabel}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* AI Delivery Route Optimizer */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>AI Route Optimizer</h3>
                <Badge variant="brand">Copilot Active</Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg)', padding: '12px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Before</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>6h 40m</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>14 stops · 212 km</div>
                </div>

                <div style={{ background: 'var(--teal-l)', border: '1px solid var(--teal-m)', padding: '12px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase' }}>After (AI)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>5h 05m</div>
                  <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>14 stops · 176 km</div>
                </div>
              </div>

              <div className="logistics-ai-callout" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                  {routeOptimized ? (
                    <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="check" size={14} /> Optimized corridor R-118 active. Saved 95m & 36km.
                    </span>
                  ) : (
                    'Reordering stops 4–9 on Route R-118 saves 95 minutes and 36 km of transit today.'
                  )}
                </div>
              </div>

              <Button
                variant={routeOptimized ? 'outline' : 'default'}
                size="sm"
                onClick={() => setRouteOptimized(true)}
                style={{ marginTop: 12, width: '100%' }}
              >
                {routeOptimized ? 'Route Applied (Active)' : 'Apply Optimized Corridor'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 4: Loading Docks, Customs Clearance Timeline, and Carrier Leaderboard ── */}
      {(activeTab === 'all' || activeTab === 'warehouse') && (
        <div className="logistics-bento">
          {/* Loading Dock Status */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Loading Dock Matrix</h3>
                <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Dar Central ICD</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>5</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Loading</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)' }}>2</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Queued</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red)' }}>2</div>
                  <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Blocked</div>
                </div>
              </div>

              {/* 12 Docks Grid */}
              <div className="logistics-docks-grid">
                <div className="logistics-dock-pill" style={{ background: 'var(--red-l)', color: 'var(--red)' }}>Dock 1</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>Dock 2</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>Dock 3</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--gold-l)', color: 'var(--gold)' }}>Dock 4</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--bg)', color: 'var(--ink3)' }}>Dock 5</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>Dock 6</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--gold-l)', color: 'var(--gold)' }}>Dock 7</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--bg)', color: 'var(--ink3)' }}>Dock 8</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>Dock 9</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>Dock 10</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--red-l)', color: 'var(--red)' }}>Dock 11</div>
                <div className="logistics-dock-pill" style={{ background: 'var(--bg)', color: 'var(--ink3)' }}>Dock 12</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <span>Avg turnaround: <strong>34 min</strong></span>
                <span><strong>128 trucks</strong> cleared today</span>
              </div>
            </div>
          </div>

          {/* Customs Clearance Timeline & Stepped Funnel */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Customs Clearance</h3>
                <Badge variant="brand">CNT-90112</Badge>
              </div>

              <div className="logistics-timeline">
                <div className="logistics-timeline-item">
                  <div className="logistics-timeline-dot" style={{ background: 'var(--green)' }} />
                  <div style={{ fontSize: 12, fontWeight: 700 }}>TANSAD & Documents Lodged</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Today, 05:40 AM · Approved</div>
                </div>

                <div className="logistics-timeline-item">
                  <div className="logistics-timeline-dot" style={{ background: 'var(--green)' }} />
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Duties & Taxes Assessed</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Today, 06:12 AM · Paid ($4,280)</div>
                </div>

                <div className="logistics-timeline-item">
                  <div className="logistics-timeline-dot" style={{ background: 'var(--blue)' }} />
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Physical Inspection Slot</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Awaiting customs officer assignment</div>
                </div>

                <div className="logistics-timeline-item">
                  <div className="logistics-timeline-dot" style={{ background: 'var(--border2)' }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Border Release Order (RO)</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Pending final clearance</div>
                </div>
              </div>

              {/* Order Fulfillment Funnel */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Fulfillment Pipeline Conversion</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="logistics-funnel-step" style={{ background: 'var(--teal)' }}>
                    <span>Order Placed</span>
                    <span>5,120</span>
                  </div>
                  <div className="logistics-funnel-step" style={{ background: 'var(--blue)', width: '90%', margin: '0 auto' }}>
                    <span>Picked & Packed</span>
                    <span>4,710</span>
                  </div>
                  <div className="logistics-funnel-step" style={{ background: '#6366f1', width: '80%', margin: '0 auto' }}>
                    <span>Dispatched</span>
                    <span>3,584</span>
                  </div>
                  <div className="logistics-funnel-step" style={{ background: 'var(--green)', width: '70%', margin: '0 auto' }}>
                    <span>Delivered</span>
                    <span>3,061</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Carrier Leaderboard & Driver Roster */}
          <div className="logistics-bento-12-4" style={{ gridColumn: 'span 4' }}>
            <div className="logistics-card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Carrier Leaderboard</h3>
                <Badge variant="brand">Top SLA</Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>Maersk Line</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Ocean · 842 shipments</div>
                  </div>
                  <Badge variant="success">96% SLA</Badge>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>FedEx Freight</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Ground · 1,204 shipments</div>
                  </div>
                  <Badge variant="success">91% SLA</Badge>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>DHL Global Forwarding</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Air · 610 shipments</div>
                  </div>
                  <Badge variant="warning">84% SLA</Badge>
                </div>
              </div>

              {/* Driver Roster Strip */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                {(() => {
                  const onRoute = drivers.filter(d => d.status === 'On Route').length;
                  const available = drivers.filter(d => d.status === 'Available').length;
                  const offDuty = drivers.filter(d => d.status === 'Off Duty').length;
                  const total = drivers.length;
                  const onShift = onRoute + available;
                  const shown = drivers.slice(0, 5);
                  const extra = Math.max(0, total - shown.length);
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Driver Roster</span>
                        <Badge variant="info">{onShift} On Shift</Badge>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        {shown.map(d => (
                          <PersonAvatar key={d.id} name={d.name} userId={d.id} kind="drivers" size={32} />
                        ))}
                        {extra > 0 && (
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: 'var(--bg)',
                            border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: 'var(--ink2)',
                          }}>
                            +{extra}
                          </div>
                        )}
                      </div>
                      {total > 0 && (
                        <>
                          <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--bg)' }}>
                            <div style={{ width: `${Math.round(onRoute / total * 100)}%`, background: 'var(--green)' }} />
                            <div style={{ width: `${Math.round(available / total * 100)}%`, background: 'var(--gold)' }} />
                            <div style={{ width: `${Math.round(offDuty / total * 100)}%`, background: 'var(--red)' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink3)', marginTop: 4 }}>
                            <span>{onRoute} on route</span>
                            <span>{available} available</span>
                            <span>{offDuty} off duty</span>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 5: Shipment Operations Ledger (Interactive Data Table) ── */}
      {(activeTab === 'all' || activeTab === 'ledger') && (
        <div className="logistics-card" id="shipment-operations-ledger">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Shipment Operations Ledger</h3>
              <Badge variant="gray">{filteredShipments.length} {filteredShipments.length === 1 ? 'trip' : 'trips'}</Badge>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '2px 0 0 0' }}>
              Real-time monitoring, priority triage, carrier handover, and route status
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 220 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }} />
              <Input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search trips, driver, route…"
                style={{ paddingLeft: 32 }}
              />
            </div>

            {/* Status Filter */}
            <SingleSelectFilter
              label="Status"
              options={[
                { value: 'In Transit', label: 'In Transit' },
                { value: 'Delivered', label: 'Delivered' },
                { value: 'Delayed', label: 'Delayed' },
                { value: 'Customs', label: 'Customs' },
                { value: 'Exception', label: 'Exception' },
              ]}
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              allLabel="All Statuses"
            />

            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/tracking/shipments')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="plus" size={14} />
              <span>New Dispatch</span>
            </Button>
          </div>
        </div>

        {/* Table View */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 800 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '10px 8px', width: 32 }}>
                  <input
                    type="checkbox"
                    checked={isPageAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all shipments on this page"
                  />
                </th>
                <th style={{ padding: '10px 8px' }}>Shipment ID</th>
                <th style={{ padding: '10px 8px' }}>Customer / Cargo</th>
                <th style={{ padding: '10px 8px' }}>Carrier / Mode</th>
                <th style={{ padding: '10px 8px' }}>Corridor Route</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
                <th style={{ padding: '10px 8px' }}>Priority</th>
                <th style={{ padding: '10px 8px' }}>Vehicle / Driver</th>
                <th style={{ padding: '10px 8px' }}>ETA</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink3)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <Icon name="package" size={28} color="var(--ink3)" />
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink2)' }}>No operational shipments found</div>
                      <div style={{ fontSize: 12 }}>
                        {searchQuery || statusFilter
                          ? 'No shipments match the current search filters.'
                          : 'Create a new dispatch trip to start monitoring real-time corridor operations.'}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/tracking/shipments')}
                        style={{ marginTop: 6 }}
                      >
                        <Icon name="plus" size={14} /> New Dispatch Trip
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedShipments.map(item => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      fontSize: 12.5,
                      transition: 'background 0.15s ease',
                      background: selectedShipmentIds.includes(item.id) ? 'var(--teal-l)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 8px' }}>
                      <input
                        type="checkbox"
                        checked={selectedShipmentIds.includes(item.id)}
                        onChange={() => toggleSelectShipment(item.id)}
                        aria-label={`Select shipment ${item.code}`}
                      />
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedShipment(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontWeight: 700,
                          color: 'var(--teal)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font)',
                          fontSize: 12.5,
                          textAlign: 'left',
                        }}
                        title="Inspect trip details"
                      >
                        {item.code}
                      </button>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--ink)' }}>
                      {item.customer}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div>{item.carrier}</div>
                      <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{item.mode}</span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontSize: 12 }}>{item.origin} → {item.destination}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <Badge
                        variant={
                          item.status === 'Delivered'
                            ? 'success'
                            : item.status === 'Delayed'
                            ? 'warning'
                            : item.status === 'Exception'
                            ? 'error'
                            : item.status === 'Customs'
                            ? 'info'
                            : 'brand'
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 800,
                        background: item.priority === 'P1' ? 'var(--red-l)' : item.priority === 'P2' ? 'var(--gold-l)' : 'var(--bg)',
                        color: item.priority === 'P1' ? 'var(--red)' : item.priority === 'P2' ? 'var(--gold)' : 'var(--ink3)',
                      }}>
                        {item.priority}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PersonAvatar name={item.driverName} userId={item.driverId} size={24} />
                        <div>
                          {item.vehicleId ? (
                            <Link
                              to={`/tracking/vehicles/${item.vehicleId}`}
                              style={{ fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}
                              title="View vehicle telematics"
                            >
                              {item.vehicle}
                            </Link>
                          ) : (
                            <div style={{ fontWeight: 600 }}>{item.vehicle}</div>
                          )}
                          {item.driverId ? (
                            <Link
                              to={`/tracking/drivers/${item.driverId}`}
                              style={{ fontSize: 10.5, color: 'var(--ink3)', textDecoration: 'none', display: 'block' }}
                              title="View driver profile"
                            >
                              {item.driverName}
                            </Link>
                          ) : (
                            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{item.driverName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--ink2)' }}>
                      {item.eta}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedShipment(item)}
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Canonical Pagination Bar */}
        {filteredShipments.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <PaginationBar
              page={ledgerPage}
              pageSize={ledgerPageSize}
              total={filteredShipments.length}
              onPageChange={setLedgerPage}
              onPageSizeChange={size => {
                setLedgerPageSize(size);
                setLedgerPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="shipment"
            />
          </div>
        )}
      </div>
      )}

      {/* ── INTERACTIVE DRAWER: AI Logistics Copilot ── */}
      {copilotOpen && (
        <>
          <div className="logistics-drawer-overlay" onClick={() => setCopilotOpen(false)} />
          <div className="logistics-drawer">
            <div className="logistics-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="logistics-design-icon logistics-design-icon--brand">
                  <Icon name="sparkle" size={16} />
                </span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>AI Logistics Copilot</h3>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Live network reasoning & proactive alerts</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCopilotOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="logistics-drawer-body">
              {/* Copilot Chat Message List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {copilotMessages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: 'var(--r-md)',
                      background: msg.role === 'user' ? 'var(--teal)' : 'var(--bg)',
                      color: msg.role === 'user' ? '#ffffff' : 'var(--ink)',
                      fontSize: 12.5,
                      lineHeight: 1.4,
                    }}
                  >
                    <div>{msg.text}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>{msg.time}</div>
                  </div>
                ))}
              </div>

              {/* Quick Prompt Suggestions */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Suggested Analysis
                </div>
                <button
                  type="button"
                  className="logistics-copilot-suggestion"
                  onClick={() => handleSendCopilot('Which shipments are currently at risk of SLA breach?')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                  }}
                >
                  <Icon name="alertTriangle" size={15} />
                  <span>Which shipments are currently at risk of SLA breach?</span>
                </button>
                <button
                  type="button"
                  className="logistics-copilot-suggestion"
                  onClick={() => handleSendCopilot('Suggest a rebalancing plan for warehouse container overflow')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                  }}
                >
                  <Icon name="package" size={15} />
                  <span>Suggest a rebalancing plan for warehouse container overflow</span>
                </button>
                <button
                  type="button"
                  className="logistics-copilot-suggestion"
                  onClick={() => handleSendCopilot('Summarize fleet maintenance needs for high-risk vehicles')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                  }}
                >
                  <Icon name="tool" size={15} />
                  <span>Summarize fleet maintenance needs for high-risk vehicles</span>
                </button>
              </div>
            </div>

            <div className="logistics-drawer-footer">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={copilotInput}
                  onChange={e => setCopilotInput(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSendCopilot()}
                  placeholder="Ask Copilot anything about live operations…"
                  style={{ flex: 1 }}
                />
                <Button size="sm" onClick={() => handleSendCopilot()}>
                  <Icon name="send" size={14} />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── INTERACTIVE DRAWER: Shipment Quickview Details ── */}
      {selectedShipment && (
        <>
          <div className="logistics-drawer-overlay" onClick={() => setSelectedShipment(null)} />
          <div className="logistics-drawer">
            <div className="logistics-drawer-header">
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{selectedShipment.code}</h3>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{selectedShipment.customer}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShipment(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="logistics-drawer-body">
              {/* Status Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Transit Status</div>
                  <Badge variant={selectedShipment.status === 'Delivered' ? 'success' : selectedShipment.status === 'Delayed' ? 'warning' : 'brand'}>
                    {selectedShipment.status}
                  </Badge>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Priority</div>
                  <span style={{ fontWeight: 800, color: selectedShipment.priority === 'P1' ? 'var(--red)' : 'var(--gold)' }}>
                    {selectedShipment.priority}
                  </span>
                </div>
              </div>

              {/* Specs Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Carrier</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{selectedShipment.carrier}</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Cargo Weight</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{selectedShipment.weight}</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Vehicle ID</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{selectedShipment.vehicle}</div>
                </div>
                <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>ETA Destination</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{selectedShipment.eta}</div>
                </div>
              </div>

              {/* Assigned Driver */}
              <div style={{ border: '1px solid var(--border)', padding: '12px', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <PersonAvatar name={selectedShipment.driverName} userId={selectedShipment.driverId} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedShipment.driverName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Primary Transit Operator · Verified</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/chat')}>
                  <Icon name="message" size={14} />
                </Button>
              </div>

              {/* Milestone Tracker Timeline */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Live Corridor Milestones</div>
                <div className="logistics-timeline">
                  <div className="logistics-timeline-item">
                    <div className="logistics-timeline-dot" style={{ background: 'var(--green)' }} />
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Origin Terminal Handover</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{selectedShipment.origin} · Completed</div>
                  </div>
                  <div className="logistics-timeline-item">
                    <div className="logistics-timeline-dot" style={{ background: 'var(--teal)' }} />
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Corridor Transit in Progress</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>GPS Telemetry Active · Speed 62 km/h</div>
                  </div>
                  <div className="logistics-timeline-item">
                    <div className="logistics-timeline-dot" style={{ background: 'var(--border2)' }} />
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Destination Depot Intake</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{selectedShipment.destination} · Estimated {selectedShipment.eta}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="logistics-drawer-footer" style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setSelectedShipment(null);
                  navigate(`/tracking/shipments`);
                }}
                style={{ flex: 1 }}
              >
                Open in Full Clearance
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedShipment(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
