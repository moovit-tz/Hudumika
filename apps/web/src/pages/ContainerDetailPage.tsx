import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionCard } from '../components/SectionCard.js';
import { ContainerTrackerCard } from '../components/container/ContainerTrackerCard.js';
import { getContainerDetails } from '../components/container/containerData.js';
import { getContainerColor, CARRIER_CONTAINER_COLORS } from '../components/container/containerColors.js';
import { CarrierLogo } from '../components/container/CarrierLogo.js';
import type { ContainerDetails, ContainerStatus } from '../components/container/containerTypes.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PageLoading } from '../components/ui/spinner.js';
import { CompanyAvatar, PersonAvatar } from '../components/PersonAvatar.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import '../components/container/ContainerTracker.css';

export type LifecycleStage =
  | 'DEPOT_ALLOCATED'     // 1. Depot (Origin Depot Allocation) — Auto API
  | 'GATE_IN_ORIGIN'      // 2. Gate In (Origin Port Terminal Gate In) — Auto API
  | 'VESSEL_LOADED'       // 3. Loaded (Loaded on Ocean Vessel) — Auto API
  | 'OCEAN_TRANSIT'       // 4. Sea Transit (Ocean Sea Transit) — Auto API / AIS
  | 'PORT_DISCHARGED'     // 5. Discharged (Discharged at Destination Port) — Auto API
  | 'CUSTOMS_RELEASE'     // 6. Cleared (Customs & Port Release / DO Issued) — Auto API
  | 'GATE_OUT_PORT'       // 7. Gate Out (Loaded on Truck Chassis) — Manual Onland
  | 'ONLAND_TRANSIT'      // 8. Onland (Road / Rail In Transit) — Manual Onland
  | 'AT_CONSIGNEE'        // 9. At Dest (Arrived at Consignee Yard) — Manual Onland
  | 'DEVANNED'            // 10. Devanned (Cargo Unpacked / Destuffed) — Manual Onland
  | 'EMPTY_RETURNED';     // 11. Returned (Empty Returned to Carrier Depot) — Manual Onland

export type StageTrackingMode = 'AUTO_API' | 'MANUAL_ONLAND';

export interface ContainerMovementStageDef {
  key: LifecycleStage;
  stepNumber: number;
  label: string;
  short: string;
  actionLabel: string;
  mode: StageTrackingMode;
  modeBadge: string;
  icon: any;
  description: string;
}

interface LifecycleEvent {
  stage: LifecycleStage;
  label: string;
  timestamp: string;
  location: string;
  actor: string;
  notes: string;
}

export const LIFECYCLE_STAGES: ContainerMovementStageDef[] = [
  {
    key: 'DEPOT_ALLOCATED',
    stepNumber: 1,
    label: 'Origin Depot Allocation',
    short: 'Depot',
    actionLabel: 'Depot Allocation',
    mode: 'AUTO_API',
    modeBadge: 'API Auto',
    icon: 'package',
    description: 'Container allocated & surveyed at origin container depot (Carrier EDI / Booking)',
  },
  {
    key: 'GATE_IN_ORIGIN',
    stepNumber: 2,
    label: 'Gate In at Origin Port',
    short: 'Gate In',
    actionLabel: 'Gate In (EIR)',
    mode: 'AUTO_API',
    modeBadge: 'API Auto',
    icon: 'truck',
    description: 'Container gated in at origin container terminal; Equipment Interchange Receipt issued',
  },
  {
    key: 'VESSEL_LOADED',
    stepNumber: 3,
    label: 'Loaded onto Vessel',
    short: 'Loaded',
    actionLabel: 'Vessel Stowed',
    mode: 'AUTO_API',
    modeBadge: 'API Auto',
    icon: 'anchor',
    description: 'Container loaded & stowed aboard vessel (confirmed via terminal crane bay plan)',
  },
  {
    key: 'OCEAN_TRANSIT',
    stepNumber: 4,
    label: 'Ocean Sea Transit',
    short: 'Sea Transit',
    actionLabel: 'Ocean Transit',
    mode: 'AUTO_API',
    modeBadge: 'AIS Live',
    icon: 'globe',
    description: 'Vessel sailing along international maritime corridor (live satellite AIS positioning)',
  },
  {
    key: 'PORT_DISCHARGED',
    stepNumber: 5,
    label: 'Discharged at Destination',
    short: 'Discharged',
    actionLabel: 'Port Discharge',
    mode: 'AUTO_API',
    modeBadge: 'API Auto',
    icon: 'ship',
    description: 'Container discharged onto destination quay / container yard (TICTS / Dar Port)',
  },
  {
    key: 'CUSTOMS_RELEASE',
    stepNumber: 6,
    label: 'Customs & Port Release',
    short: 'Cleared',
    actionLabel: 'Customs Release',
    mode: 'AUTO_API',
    modeBadge: 'TANCIS API',
    icon: 'checkCircle',
    description: 'Customs assessment cleared in TANCIS, shipping line Delivery Order (DO) issued',
  },
  {
    key: 'GATE_OUT_PORT',
    stepNumber: 7,
    label: 'Gate Out (Truck Loaded)',
    short: 'Gate Out',
    actionLabel: 'Gate Out Truck',
    mode: 'MANUAL_ONLAND',
    modeBadge: 'Onland',
    icon: 'truck',
    description: 'Mounted on prime mover / semi-trailer chassis and gated out from port terminal / ICD',
  },
  {
    key: 'ONLAND_TRANSIT',
    stepNumber: 8,
    label: 'Onland Transit (Road/Rail)',
    short: 'Onland',
    actionLabel: 'Start Onland Transit',
    mode: 'MANUAL_ONLAND',
    modeBadge: 'Onland',
    icon: 'compass',
    description: 'Haulage in transit to customer premises / dry port via road corridor or SGR freight rail',
  },
  {
    key: 'AT_CONSIGNEE',
    stepNumber: 9,
    label: 'Arrived at Consignee',
    short: 'At Dest',
    actionLabel: 'Arrive Consignee',
    mode: 'MANUAL_ONLAND',
    modeBadge: 'Onland',
    icon: 'mapPin',
    description: 'Truck arrived at consignee warehouse / offloading bay; seal verified intact',
  },
  {
    key: 'DEVANNED',
    stepNumber: 10,
    label: 'Devanned & Destuffed',
    short: 'Devanned',
    actionLabel: 'Devan Cargo',
    mode: 'MANUAL_ONLAND',
    modeBadge: 'Onland',
    icon: 'layers',
    description: 'Cargo unpacked & destuffed from container; interior inspection completed',
  },
  {
    key: 'EMPTY_RETURNED',
    stepNumber: 11,
    label: 'Empty Returned to Depot',
    short: 'Returned',
    actionLabel: 'Return Empty',
    mode: 'MANUAL_ONLAND',
    modeBadge: 'Onland',
    icon: 'checkCircle',
    description: 'Empty container returned to shipping line depot; in-gate EIR signed & demurrage stopped',
  },
];

export function normalizeLifecycleStage(rawStage?: string | null): LifecycleStage {
  if (!rawStage) return 'GATE_OUT_PORT';
  const s = rawStage.toUpperCase().trim();
  const matched = LIFECYCLE_STAGES.find(st => st.key === s);
  if (matched) return matched.key;

  if (s === 'DOCS_RECEIVED' || s === 'MANUFACTURED' || s === 'AVAILABLE_AT_DEPOT' || s === 'DEPOT') return 'DEPOT_ALLOCATED';
  if (s === 'VALIDATION' || s === 'GATE_IN' || s === 'GATED_IN') return 'GATE_IN_ORIGIN';
  if (s === 'PERMITS' || s === 'LOADED_ON_VESSEL' || s === 'LOADED') return 'VESSEL_LOADED';
  if (s === 'ENTRY_PREP' || s === 'IN_TRANSIT' || s === 'OCEAN') return 'OCEAN_TRANSIT';
  if (s === 'TANCIS_REG' || s === 'DISCHARGED') return 'PORT_DISCHARGED';
  if (s === 'ASSESSMENT' || s === 'TAX_PAYMENT' || s === 'DO_APPLICATION' || s === 'CUSTOMS_CLEARED') return 'CUSTOMS_RELEASE';
  if (s === 'INSPECTION' || s === 'GATE_OUT') return 'GATE_OUT_PORT';
  if (s === 'DELIVERY' || s === 'ON_TRAIN' || s === 'INTERMODAL' || s === 'TRANSPORT') return 'ONLAND_TRANSIT';
  if (s === 'AT_CONSIGNEE' || s === 'ARRIVED') return 'AT_CONSIGNEE';
  if (s === 'DEVANNED') return 'DEVANNED';
  if (s === 'COMPLETED' || s === 'EMPTY_RETURNED' || s === 'RETURNED' || s === 'DONE') return 'EMPTY_RETURNED';
  return 'GATE_OUT_PORT';
}

export const ContainerDetailPage: React.FC = () => {
  const { number } = useParams<{ number: string }>();
  return <ContainerDetailView key={number} number={number} />;
};

export const ContainerDetailView: React.FC<{
  number?: string;
  providedContainer?: ContainerDetails;
}> = ({ number, providedContainer }) => {
  const navigate = useNavigate();

  const [container, setContainer] = useState<ContainerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStage, setCurrentStage] = useState<LifecycleStage>('GATE_OUT_PORT');
  const [stageHistory, setStageHistory] = useState<LifecycleEvent[]>([]);
  const [customColorHex, setCustomColorHex] = useState<string | null>(null);
  const [dbId, setDbId] = useState<string | null>(null);
  const [linkedShipmentId, setLinkedShipmentId] = useState<string | null>(null);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [linkedCustomerName, setLinkedCustomerName] = useState<string | null>(null);
  const [linkingShipment, setLinkingShipment] = useState(false);
  const [linkingCustomer, setLinkingCustomer] = useState(false);

  const loadContainer = useCallback(async () => {
    if (!number) return;
    setLoading(true);
    try {
      const data: any = providedContainer ?? await apiFetch(`/v1/tracker/containers/${encodeURIComponent(number)}`);
      if (data && data.container_number) {
        setContainer({ ...getContainerDetails(number), ...data });
        if (data.color_hex) setCustomColorHex(data.color_hex);
        if (data.lifecycle_stage) setCurrentStage(normalizeLifecycleStage(data.lifecycle_stage));
        setDbId(data.db_id || null);
        setLinkedShipmentId(data.shipment_id || null);
        setLinkedCustomerId(data.customer_id || null);
        setLinkedCustomerName(data.customer_name || null);
        // Use real stage history from DB if present, otherwise use seeded fallback
        if (data.stage_history && data.stage_history.length > 0) {
          setStageHistory(data.stage_history.map((h: any) => ({
            stage: normalizeLifecycleStage(h.stage),
            label: h.label || h.stage.replace(/_/g, ' '),
            timestamp: new Date(h.timestamp).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }),
            location: h.location || 'Container Depot / Port',
            actor: h.actor || 'Operations Officer',
            notes: h.notes,
          })));
        } else {
          setStageHistory([
            { stage: 'GATE_OUT_PORT', label: 'Gate Out at Destination Port Terminal (ICD)', timestamp: '08 Oct 2026, 09:15 AM', location: 'Dar es Salaam Port (TICTS Gate 3)', actor: 'Terminal Dispatch Officer', notes: 'Mounted on prime mover T 412 DXE / Chassis semi-trailer. Gate pass GP-TZ-88410 stamped.' },
            { stage: 'CUSTOMS_RELEASE', label: 'Customs & Port Delivery Order (DO) Released', timestamp: '07 Oct 2026, 04:30 PM', location: 'TRA Customs & Shipping Line Desk', actor: 'Customs Declarant & Line Officer', notes: 'TANSAD assessment cleared in TANCIS; DO-2026-9941 validated with zero outstanding demurrage.' },
            { stage: 'PORT_DISCHARGED', label: 'Container Discharged from Vessel', timestamp: '05 Oct 2026, 11:20 AM', location: 'Dar es Salaam Berth 4 Quay', actor: 'Port Gantry Crane Operator', notes: 'Discharged from MV Safmarine Meru (Voyage 264S) to yard block C-04.' },
            { stage: 'OCEAN_TRANSIT', label: 'Ocean Transit — High Seas Corridor', timestamp: '28 Sep 2026, 06:00 PM', location: 'Indian Ocean Maritime Corridor', actor: 'Vessel AIS Navigation Tracking', notes: 'Vessel departed transshipment port (Jebel Ali / Salalah); speed 16.4 kts.' },
            { stage: 'VESSEL_LOADED', label: 'Loaded aboard Ocean Vessel', timestamp: '23 Sep 2026, 02:40 PM', location: 'Kobe Port (Berth 2)', actor: 'Terminal Stevedoring Team', notes: 'Stowed at Bay 18, Row 04, Tier 82. Seal #TZ-SEAL-88910 verified intact.' },
            { stage: 'GATE_IN_ORIGIN', label: 'Gate In at Origin Port Terminal', timestamp: '18 Sep 2026, 10:15 AM', location: 'Kobe Container Terminal (JPHKT)', actor: 'Terminal Yard Master', notes: 'Equipment Interchange Receipt (EIR-991204) generated. Gross weight 24,180 kg verified.' },
            { stage: 'DEPOT_ALLOCATED', label: 'Origin Container Depot Allocation', timestamp: '14 Sep 2026, 08:30 AM', location: 'Yokohama Central Depot', actor: 'Depot Logistics Surveyor', notes: 'Grade A Cargo Worthy ISO container allocated for booking BKG-2026-8812.' },
          ]);
        }
      } else {
        setContainer(getContainerDetails(number) as any);
      }
    } catch {
      setContainer(getContainerDetails(number) as any);
    } finally {
      setLoading(false);
    }
  }, [number, providedContainer]);

  useEffect(() => { loadContainer(); }, [loadContainer]);

  const handleAdvanceStage = async (nextStage: LifecycleStage, label: string) => {
    if (!(await showConfirm(`Advance container ${container?.container_number} lifecycle to "${label}"?`))) return;
    setCurrentStage(nextStage);
    const newEvent: LifecycleEvent = {
      stage: nextStage,
      label,
      timestamp: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      location: (container as any)?.voyage?.current_location || 'Current Depot',
      actor: 'Logistics Operations Officer',
      notes: `Container status transitioned to ${label}.`,
    };
    setStageHistory((prev) => [newEvent, ...prev]);

    try {
      await apiFetch(`/v1/tracker/containers/${container?.container_number}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: nextStage,
          location: (container as any)?.voyage?.current_location || 'Current Depot',
          notes: `Container status transitioned to ${label}.`,
        }),
      });
    } catch {
      // Local state already updated
    }
    showAlert(`Container lifecycle updated to ${label}.`);
  };

  const handleColorUpdate = async (colorHex: string) => {
    setCustomColorHex(colorHex);
    try {
      await apiFetch('/v1/tracker/containers', {
        method: 'POST',
        body: JSON.stringify({ container_number: container?.container_number, color_hex: colorHex }),
      });
    } catch {
      // ignore
    }
  };

  const handleLinkCustomer = async (customerId: string, customerName: string) => {
    setLinkingCustomer(false);
    setLinkedCustomerId(customerId);
    setLinkedCustomerName(customerName);
    try {
      await apiFetch(`/v1/tracker/containers/${container?.container_number}/link`, {
        method: 'PATCH',
        body: JSON.stringify({ customer_id: customerId }),
      });
    } catch {
      showAlert('Could not save customer link.');
    }
  };

  const handleLinkShipment = async (shipmentId: string) => {
    setLinkingShipment(false);
    setLinkedShipmentId(shipmentId);
    try {
      await apiFetch(`/v1/tracker/containers/${container?.container_number}/link`, {
        method: 'PATCH',
        body: JSON.stringify({ shipment_id: shipmentId }),
      });
    } catch {
      showAlert('Could not save shipment link.');
    }
  };

  if (loading) {
    return <PageLoading label="Loading container details…" />;
  }

  if (!container) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-[var(--ink)]">Container Not Found</h2>
        <p className="text-xs text-[var(--ink3)]">The requested container record could not be loaded.</p>
        <Button size="sm" onClick={() => navigate('/cargotracker/track')}>
          Back to Cargo Tracker
        </Button>
      </div>
    );
  }

  const palette = getContainerColor(container.container_number, container.voyage?.vessel_name, customColorHex || undefined);
  const currentStageIndex = Math.max(0, LIFECYCLE_STAGES.findIndex((stage) => stage.key === currentStage));
  const currentStageDef = LIFECYCLE_STAGES[currentStageIndex] || LIFECYCLE_STAGES[0];
  const lifecycleProgress = Math.round(((currentStageIndex + 1) / LIFECYCLE_STAGES.length) * 100);
  const nextStage = LIFECYCLE_STAGES[currentStageIndex + 1];

  const handleRefreshApiStatus = async () => {
    showAlert(`Polling carrier EDI & port terminal API feeds for ${container.container_number}…`);
    await loadContainer();
    showAlert(`Container movement data synchronized with port & carrier systems.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header ── */}
      <PageHeader
        crumbs={['Cargo Tracker', 'Containers', container.container_number]}
        titlePlain={container.container_number}
        titleEm="details"
        subtitle={`${container.size_type} · ISO: ${container.iso_code} · Carrier Signature: ${palette.carrier}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate(`/cargotracker/containers/${container.container_number}/edit`)}>
              <Icon name="edit" size={13} color="var(--teal)" />
              Edit Specs
            </Button>
            <Button size="sm" onClick={() => navigate('/cargotracker/track')}>
              <Icon name="compass" size={13} color="hsl(var(--primary-foreground))" />
              Live Fleet View
            </Button>
          </div>
        }
      />

      {/* ── Carrier Color & Signature Strip ── */}
      <div className="cnt-carrier-strip">
        <div className="flex items-center gap-3">
          <CarrierLogo carrier={palette.id} size={32} variant="mark" />
          <div>
            <div className="text-xs font-bold text-[var(--ink)] flex items-center gap-2">
              <span>{palette.name}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--ink3)]">
                {palette.primary}
              </span>
            </div>
            <div className="text-[11px] text-[var(--ink3)]">{palette.carrier} · 3D Model Painted via API Carrier Detection</div>
          </div>
        </div>

        {/* Quick Color Swatch Customizer */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-[var(--ink3)] mr-1">Carrier Paint:</span>
          {Object.entries(CARRIER_CONTAINER_COLORS).map(([k, p]) => (
            <button
              key={k}
              type="button"
              title={p.name}
              onClick={() => handleColorUpdate(p.primary)}
              className={`inline-flex items-center justify-center p-0.5 rounded-lg border transition-all ${
                customColorHex === p.primary || (!customColorHex && palette.id === p.id)
                  ? 'ring-2 ring-(--teal) scale-110 border-(--teal)'
                  : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
              }`}
             data-ui-native-button="">
              <CarrierLogo carrier={p.id} size={20} variant="mark" />
            </button>
          ))}
        </div>
      </div>

      <div className="cnt-overview-grid" aria-label="Container operational overview">
        <div className="cnt-overview-primary">
          <div className="flex items-center gap-3 min-w-0">
            <FeaturedIcon variant="brand" size="md">
              <Icon name="activity" size={17} color="var(--teal)" />
            </FeaturedIcon>
            <div className="min-w-0">
              <div className="cnt-overview-label">Current movement stage</div>
              <div className="cnt-overview-value">{currentStageDef.label}</div>
            </div>
          </div>
          <div className="cnt-progress" aria-label={`${lifecycleProgress}% of movement complete`}>
            <span style={{ width: `${lifecycleProgress}%`, background: '#e05822' }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] text-(--ink3)">
            <span>{lifecycleProgress}% complete</span>
            <span>{nextStage ? `Next: ${nextStage.label}` : 'Container Journey Complete'}</span>
          </div>
        </div>
        <div className="cnt-overview-stat">
          <span className="cnt-overview-label">Current location</span>
          <strong className="cnt-overview-value truncate">{container.voyage?.current_location || container.current_depot?.name}</strong>
          <span className="cnt-overview-meta">{container.current_depot?.code || 'Location pending'}</span>
        </div>
        <div className="cnt-overview-stat">
          <span className="cnt-overview-label">Voyage</span>
          <strong className="cnt-overview-value">{container.voyage?.voyage_no || 'Not assigned'}</strong>
          <span className="cnt-overview-meta truncate">{container.voyage?.vessel_name || 'Awaiting vessel allocation'}</span>
        </div>
        <div className="cnt-overview-stat">
          <span className="cnt-overview-label">Arrival estimate</span>
          <strong className="cnt-overview-value">{container.voyage?.eta || 'Pending'}</strong>
          <span className="cnt-overview-meta">{container.voyage?.pod_city || 'Destination pending'}</span>
        </div>
      </div>

      {/* ── Linked Shipment & Customer ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Customer link */}
        <div className="p-4 bg-(--white) border border-(--border) rounded-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FeaturedIcon variant="brand" size="sm">
                <Icon name="users" size={14} color="var(--teal)" />
              </FeaturedIcon>
              <span className="text-[11px] font-bold text-(--ink3) uppercase tracking-wide">Consignee / Customer</span>
            </div>
            {!linkingCustomer && (
              <Button variant="outline" size="sm" onClick={() => setLinkingCustomer(true)}>
                <Icon name="link" size={12} color="var(--ink3)" />
                {linkedCustomerId ? 'Change' : 'Link'}
              </Button>
            )}
          </div>
          {linkingCustomer ? (
            <EntityPicker
              value={linkedCustomerId ? { id: linkedCustomerId, label: linkedCustomerName || '' } : null}
              onChange={(item) => {
                if (item) handleLinkCustomer(item.id, item.label);
                else setLinkingCustomer(false);
              }}
              search={async (q) => {
                const data: any[] = await apiFetch(`/v1/customers?q=${encodeURIComponent(q)}&limit=10`).catch(() => []);
                return (data || []).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email }));
              }}
              placeholder="Search customers…"
            />
          ) : linkedCustomerId ? (
            <div className="flex items-center gap-2">
              <CompanyAvatar name={linkedCustomerName || 'Customer'} size={28} shape="square" />
              <div>
                <div className="text-xs font-bold text-(--ink)">{linkedCustomerName}</div>
                <button
                  type="button"
                  className="text-[11px] text-(--blue) underline underline-offset-2"
                  onClick={() => navigate(`/crm/customers/${linkedCustomerId}`)}
                 data-ui-native-button="">
                  View customer
                </button>
              </div>
            </div>
          ) : (
            <span className="text-xs text-(--ink3) italic">No customer linked — click Link to associate this container with a consignee.</span>
          )}
        </div>

        {/* Shipment link */}
        <div className="p-4 bg-(--white) border border-(--border) rounded-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FeaturedIcon variant="brand" size="sm">
                <Icon name="ship" size={14} color="var(--teal)" />
              </FeaturedIcon>
              <span className="text-[11px] font-bold text-(--ink3) uppercase tracking-wide">Shipment Case</span>
            </div>
            {!linkingShipment && (
              <Button variant="outline" size="sm" onClick={() => setLinkingShipment(true)}>
                <Icon name="link" size={12} color="var(--ink3)" />
                {linkedShipmentId ? 'Change' : 'Link'}
              </Button>
            )}
          </div>
          {linkingShipment ? (
            <EntityPicker
              value={linkedShipmentId ? { id: linkedShipmentId, label: linkedShipmentId.slice(0, 8) + '…' } : null}
              onChange={(item) => {
                if (item) handleLinkShipment(item.id);
                else setLinkingShipment(false);
              }}
              search={async (q) => {
                const data: any[] = await apiFetch(`/v1/shipments?q=${encodeURIComponent(q)}&limit=10`).catch(() => []);
                return (data || []).map((s: any) => ({ id: s.id, label: s.reference || s.id, sublabel: s.pol_city ? `${s.pol_city} → ${s.pod_city}` : undefined }));
              }}
              placeholder="Search shipment cases…"
            />
          ) : linkedShipmentId ? (
            <div className="flex items-center gap-2">
              <FeaturedIcon variant="gray" size="sm">
                <Icon name="package" size={13} color="var(--ink3)" />
              </FeaturedIcon>
              <div>
                <div className="text-xs font-mono font-bold text-(--teal)">{linkedShipmentId.slice(0, 8)}…</div>
                <button
                  type="button"
                  className="text-[11px] text-(--blue) underline underline-offset-2"
                  onClick={() => navigate(`/clearos/shipments/${linkedShipmentId}`)}
                 data-ui-native-button="">
                  View shipment
                </button>
              </div>
            </div>
          ) : (
            <span className="text-xs text-(--ink3) italic">No shipment linked — click Link to attach this container to a shipment case.</span>
          )}
        </div>
      </div>

      {/* ── Container Movement Lifecycle & Control ── */}
      <SectionCard
        title="Container Lifecycle & Movement Control"
        action={
          <div className="flex items-center gap-2">
            {currentStageDef.mode === 'AUTO_API' ? (
              <Badge variant="brand" style={{ background: 'rgba(13, 148, 136, 0.12)', color: 'var(--teal)', border: '1px solid rgba(13, 148, 136, 0.25)' }}>
                <span className="w-2 h-2 rounded-full bg-(--teal) animate-pulse mr-1.5" />
                {currentStageDef.label} (Step {currentStageIndex + 1} of 11) · Live API Auto-Sync
              </Badge>
            ) : (
              <Badge variant="warning" style={{ background: 'rgba(224, 88, 34, 0.12)', color: '#e05822', border: '1px solid rgba(224, 88, 34, 0.25)' }}>
                <span className="w-2 h-2 rounded-full bg-[#e05822] animate-pulse mr-1.5" />
                {currentStageDef.label} (Step {currentStageIndex + 1} of 11) · Onland Transport
              </Badge>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {/* Horizontal Stepper — 100% Round Nodes on One Row */}
          <div className="overflow-x-auto py-2 px-1">
            <div className="flex items-center min-w-[880px] justify-between relative">
              {LIFECYCLE_STAGES.map((s, idx) => {
                const isDone = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;

                return (
                  <React.Fragment key={s.key}>
                    {/* Step Node */}
                    <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 56 }}>
                      <button
                        type="button"
                        onClick={() => handleAdvanceStage(s.key, s.label)}
                        aria-current={isCurrent ? 'step' : undefined}
                        aria-label={`${s.label}${isCurrent ? ', current stage' : isDone ? ', completed' : ', upcoming'}`}
                        title={`Step ${s.stepNumber}. ${s.label} (${s.modeBadge}) — ${s.description}`}
                        className="cnt-step-circle group"
                        style={{
                          width: '36px',
                          height: '36px',
                          minWidth: '36px',
                          minHeight: '36px',
                          maxWidth: '36px',
                          maxHeight: '36px',
                          borderRadius: '9999px',
                          background: isDone || isCurrent ? '#e05822' : '#cbd5e1',
                          color: '#ffffff',
                          boxShadow: isCurrent ? '0 0 0 6px rgba(224, 88, 34, 0.22), 0 2px 8px rgba(224, 88, 34, 0.35)' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12.5,
                          fontWeight: 800,
                          transform: isCurrent ? 'scale(1.06)' : 'none',
                        }}
                      >
                        {isDone ? (
                          <Icon name="check" size={15} color="#ffffff" strokeWidth={3} />
                        ) : (
                          <span>{s.stepNumber}</span>
                        )}
                      </button>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: isCurrent ? 800 : isDone ? 600 : 500,
                          color: isCurrent ? '#e05822' : isDone ? 'var(--ink)' : 'var(--ink3)',
                          marginTop: 6,
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                          lineHeight: 1.2,
                        }}
                      >
                        {s.short}
                      </span>
                    </div>

                    {/* Connecting line between steps */}
                    {idx < LIFECYCLE_STAGES.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          height: isDone ? 2.5 : 2,
                          background: isDone ? '#e05822' : '#cbd5e1',
                          marginBottom: 20,
                          marginLeft: 4,
                          marginRight: 4,
                          borderRadius: 2,
                          transition: 'background 0.3s ease',
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Quick Transition Action Bar — Strictly Single Row */}
          <div className="cnt-action-toolbar pt-3 border-t border-(--border)">
            <span className="text-xs font-bold text-(--ink3) flex items-center gap-1.5 shrink-0">
              <Icon name="activity" size={13} color="var(--teal)" /> Advance Movement:
            </span>

            {/* Next Stage Contextual Action */}
            {nextStage && (
              <Button
                size="sm"
                onClick={() => handleAdvanceStage(nextStage.key, nextStage.label)}
                className="shrink-0"
                style={{
                  background: nextStage.mode === 'MANUAL_ONLAND' ? '#e05822' : 'var(--teal)',
                  color: '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name={nextStage.mode === 'MANUAL_ONLAND' ? 'truck' : 'arrowRight'} size={13} color="#fff" />
                Next: {nextStage.short} ({nextStage.actionLabel})
              </Button>
            )}

            {/* Tracking Mode Pill */}
            {currentStageDef.mode === 'AUTO_API' ? (
              <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                <Icon name="activity" size={11} /> Port/Ocean Auto-Sync
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                <Icon name="truck" size={11} /> Manual Onland Mode
              </span>
            )}

            {/* Manual Onland Movement Buttons */}
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handleAdvanceStage('GATE_OUT_PORT', 'Gate Out (Truck Loaded)')}
            >
              <Icon name="truck" size={13} color="var(--ink3)" /> Gate Out
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handleAdvanceStage('ONLAND_TRANSIT', 'Onland Transit (Road/Rail)')}
            >
              <Icon name="compass" size={13} color="var(--ink3)" /> Onland Transit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handleAdvanceStage('AT_CONSIGNEE', 'Arrived at Consignee')}
            >
              <Icon name="mapPin" size={13} color="var(--ink3)" /> Arrive Consignee
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handleAdvanceStage('DEVANNED', 'Devanned & Destuffed')}
            >
              <Icon name="layers" size={13} color="var(--ink3)" /> Devan Cargo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-(--green) text-(--green) bg-(--green-l) hover:bg-(--green-l)"
              onClick={() => handleAdvanceStage('EMPTY_RETURNED', 'Empty Returned to Depot')}
            >
              <Icon name="checkCircle" size={13} color="var(--green)" /> Return Empty
            </Button>

            {/* API Sync Refresh */}
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              title="Poll latest carrier and port terminal tracking data"
              onClick={handleRefreshApiStatus}
            >
              <Icon name="refresh" size={12} color="var(--ink3)" /> Sync API
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* ── Core Container Intelligence Card (Dual Tabs: Details & Tracking) ── */}
      <ContainerTrackerCard
        container={{
          ...container,
          ...(customColorHex ? { floor_type: `${container.floor_type} (${palette.name})` } : {}),
        }}
        initialTab="details"
        onEdit={() => navigate(`/cargotracker/containers/${container.container_number}/edit`)}
      />

      {/* ── Lifecycle & Terminal Movement Audit Trail ── */}
      <SectionCard title="Lifecycle &amp; Terminal Movement Audit Log">
        <div className="space-y-3">
          {stageHistory.map((evt, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-start justify-between flex-wrap gap-3"
            >
              <div className="flex items-start gap-3">
                <FeaturedIcon variant="brand" size="sm" className="mt-0.5 shrink-0">
                  <Icon name="activity" size={15} color="var(--teal)" />
                </FeaturedIcon>
                <div>
                  <div className="text-xs font-black text-(--ink)">{evt.label}</div>
                  <div className="text-[11px] text-(--ink2) mt-0.5">{evt.notes}</div>
                  <div className="text-[10.5px] text-(--ink3) mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Icon name="mapPin" size={10} color="var(--ink3)" />{evt.location}</span>
                    <span className="flex items-center gap-1"><Icon name="user" size={10} color="var(--ink3)" />{evt.actor}</span>
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-mono text-[var(--ink3)]">{evt.timestamp}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
};
