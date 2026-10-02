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
  | 'MANUFACTURED'
  | 'INSPECTION_PASSED'
  | 'AVAILABLE_AT_DEPOT'
  | 'BOOKED_ALLOCATED'
  | 'GATE_IN'
  | 'LOADED_ON_VESSEL'
  | 'IN_TRANSIT'
  | 'DISCHARGED'
  | 'CUSTOMS_CLEARED'
  | 'ON_TRAIN'
  | 'DEVANNED'
  | 'EMPTY_RETURNED'
  | 'MAINTENANCE';

interface LifecycleEvent {
  stage: LifecycleStage;
  label: string;
  timestamp: string;
  location: string;
  actor: string;
  notes?: string;
}

const LIFECYCLE_STAGES: Array<{ key: LifecycleStage; label: string; icon: any }> = [
  { key: 'MANUFACTURED', label: 'Manufactured', icon: 'building' },
  { key: 'INSPECTION_PASSED', label: 'Survey Certified', icon: 'award' },
  { key: 'AVAILABLE_AT_DEPOT', label: 'At Depot', icon: 'package' },
  { key: 'BOOKED_ALLOCATED', label: 'Allocated', icon: 'tag' },
  { key: 'GATE_IN', label: 'Gated In', icon: 'truck' },
  { key: 'LOADED_ON_VESSEL', label: 'Loaded', icon: 'anchor' },
  { key: 'IN_TRANSIT', label: 'In Transit', icon: 'globe' },
  { key: 'DISCHARGED', label: 'Discharged', icon: 'ship' },
  { key: 'ON_TRAIN', label: 'Intermodal', icon: 'train' },
  { key: 'DEVANNED', label: 'Devanned', icon: 'layers' },
  { key: 'EMPTY_RETURNED', label: 'Returned', icon: 'checkCircle' },
];

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
  const [currentStage, setCurrentStage] = useState<LifecycleStage>('IN_TRANSIT');
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
        if (data.lifecycle_stage) setCurrentStage(data.lifecycle_stage as LifecycleStage);
        setDbId(data.db_id || null);
        setLinkedShipmentId(data.shipment_id || null);
        setLinkedCustomerId(data.customer_id || null);
        setLinkedCustomerName(data.customer_name || null);
        // Use real stage history from DB if present, otherwise use seeded fallback
        if (data.stage_history && data.stage_history.length > 0) {
          setStageHistory(data.stage_history.map((h: any) => ({
            stage: h.stage as LifecycleStage,
            label: h.label || h.stage.replace(/_/g, ' '),
            timestamp: new Date(h.timestamp).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }),
            location: h.location || 'Container Depot',
            actor: h.actor || 'Operations Officer',
            notes: h.notes,
          })));
        } else {
          setStageHistory([
            { stage: 'GATE_IN', label: 'Gate In at Container Terminal', timestamp: '15 Sep 2026, 09:45 AM', location: 'Kobe Terminal (JPHKT)', actor: 'Terminal Yard Master', notes: 'EIR-884129 issued with seal intact.' },
            { stage: 'LOADED_ON_VESSEL', label: 'Loaded onto Vessel', timestamp: '20 Sep 2026, 04:15 PM', location: 'Kobe Berth 4', actor: 'Port Crane Operator', notes: 'Bay 14, Tier 02, Row 06.' },
            { stage: 'IN_TRANSIT', label: 'Vessel Departed Origin Port', timestamp: '23 Sep 2026, 05:30 PM', location: 'Pacific Corridor', actor: 'Vessel Navigator', notes: 'Voyage AE1 / 24N en route to California.' },
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
    return <PageLoading label="Loading container intelligence…" />;
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
  const lifecycleProgress = Math.round(((currentStageIndex + 1) / LIFECYCLE_STAGES.length) * 100);
  const nextStage = LIFECYCLE_STAGES[currentStageIndex + 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header ── */}
      <PageHeader
        crumbs={['Cargo Tracker', 'Containers', container.container_number]}
        titlePlain={container.container_number}
        titleEm="Intelligence"
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
            >
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
              <div className="cnt-overview-label">Current lifecycle stage</div>
              <div className="cnt-overview-value">{LIFECYCLE_STAGES[currentStageIndex]?.label}</div>
            </div>
          </div>
          <div className="cnt-progress" aria-label={`${lifecycleProgress}% of lifecycle complete`}>
            <span style={{ width: `${lifecycleProgress}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] text-(--ink3)">
            <span>{lifecycleProgress}% complete</span>
            <span>{nextStage ? `Next: ${nextStage.label}` : 'Lifecycle complete'}</span>
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
                >
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
                >
                  View shipment
                </button>
              </div>
            </div>
          ) : (
            <span className="text-xs text-(--ink3) italic">No shipment linked — click Link to attach this container to a shipment case.</span>
          )}
        </div>
      </div>

      {/* ── Lifecycle Stage Progress Bar ── */}
      <SectionCard
        title="Container Lifecycle & Control"
        action={
          <Badge variant="brand">
            <span className="w-2 h-2 rounded-full bg-(--teal) animate-pulse" />
            {LIFECYCLE_STAGES.find((s) => s.key === currentStage)?.label || currentStage}
          </Badge>
        }
      >
        <div className="space-y-4">

        {/* Horizontal Lifecycle Stepper */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-center min-w-[820px] justify-between relative">
            <div className="cnt-lifecycle-rail" />
            <div className="cnt-lifecycle-rail cnt-lifecycle-rail--complete" style={{ width: `${(currentStageIndex / (LIFECYCLE_STAGES.length - 1)) * 100}%` }} />
            {LIFECYCLE_STAGES.map((s, idx) => {
              const isDone = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;

              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleAdvanceStage(s.key, s.label)}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${s.label}${isCurrent ? ', current stage' : isDone ? ', completed' : ', upcoming'}`}
                  className="cnt-lifecycle-step group"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-(--teal) text-white ring-4 ring-(--teal-l)'
                        : isDone
                        ? 'bg-(--green) text-white'
                        : 'bg-(--bg) border border-(--border) text-(--ink3) group-hover:border-(--teal)'
                    }`}
                  >
                    <Icon name={s.icon} size={13} color="currentColor" />
                  </div>
                  <span
                    className={`text-[10.5px] font-bold whitespace-nowrap ${
                      isCurrent ? 'text-[var(--teal)]' : isDone ? 'text-[var(--ink)]' : 'text-[var(--ink3)]'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Transition Action Bar */}
        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-(--border)">
          <span className="text-xs font-bold text-(--ink3)">Advance Container:</span>
          <Button variant="outline" size="sm" onClick={() => handleAdvanceStage('GATE_IN', 'Gate In at Terminal')}>
            <Icon name="truck" size={13} color="var(--ink3)" />Gate In (EIR)
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAdvanceStage('LOADED_ON_VESSEL', 'Loaded onto Vessel')}>
            <Icon name="anchor" size={13} color="var(--ink3)" />Load on Vessel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAdvanceStage('DISCHARGED', 'Discharged at Destination')}>
            <Icon name="ship" size={13} color="var(--ink3)" />Discharge
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAdvanceStage('DEVANNED', 'Devanned / Destuffed')}>
            <Icon name="layers" size={13} color="var(--ink3)" />Devan Cargo
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAdvanceStage('EMPTY_RETURNED', 'Empty Returned to Depot')} className="border-(--green) text-(--green) bg-(--green-l) hover:bg-(--green-l)">
            <Icon name="checkCircle" size={13} color="var(--green)" />Mark Empty Return
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
