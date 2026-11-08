import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageLoading } from '../components/ui/spinner.js';
import { MetricsRow } from '../components/MetricCard.js';
import { CarrierLogo } from '../components/container/CarrierLogo.js';
import { getContainerColor } from '../components/container/containerColors.js';
import { apiFetch } from '../lib/api.js';
import { LIFECYCLE_STAGES, normalizeLifecycleStage, type LifecycleStage } from './ContainerDetailPage.js';
import '../components/container/ContainerTracker.css';

interface TrackedContainer {
  id: string;
  container_number: string;
  iso_code: string | null;
  size_type: string | null;
  carrier_name: string | null;
  carrier_code: string | null;
  color_hex: string | null;
  lifecycle_stage: string | null;
  shipment_id: string | null;
  customer_id: string | null;
  updated_at: string;
  customer_name: string | null;
}

type StageFilter = 'ALL' | LifecycleStage;

function stageBadgeVariant(stage: LifecycleStage): 'brand' | 'success' | 'warning' | 'info' | 'gray' {
  const idx = LIFECYCLE_STAGES.findIndex(s => s.key === stage);
  if (idx < 0) return 'gray';
  if (stage === 'EMPTY_RETURNED') return 'success';
  if (idx <= 3) return 'info';
  if (idx <= 6) return 'brand';
  return 'warning';
}

export const ContainerListPage: React.FC = () => {
  const navigate = useNavigate();
  const [containers, setContainers] = useState<TrackedContainer[]>([]);
  const [cursor,setCursor] = useState<string>();
  const [nextCursor,setNextCursor] = useState<string>();
  const [hasMore,setHasMore] = useState(false);
  const [error,setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch(`/v1/tracker/containers?paged=true&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`);
        setContainers(prev=>cursor?[...prev,...data.data]:data.data); setHasMore(data.has_more); setNextCursor(data.cursor);
      } catch (error: any) {
        setError(error.message || 'Could not load containers');
      } finally {
        setLoading(false);
      }
    })();
  }, [cursor]);

  const filtered = useMemo(() => {
    let list = containers;
    if (stageFilter !== 'ALL') {
      list = list.filter(c => normalizeLifecycleStage(c.lifecycle_stage) === stageFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.container_number.toLowerCase().includes(q) ||
        (c.carrier_name || '').toLowerCase().includes(q) ||
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.size_type || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [containers, search, stageFilter]);

  const metricCards = useMemo(() => {
    const total = containers.length;
    const completed = containers.filter(c => normalizeLifecycleStage(c.lifecycle_stage) === 'EMPTY_RETURNED').length;
    const inTransit = containers.filter(c => {
      const s = normalizeLifecycleStage(c.lifecycle_stage);
      return s === 'OCEAN_TRANSIT' || s === 'ONLAND_TRANSIT';
    }).length;
    const atPort = containers.filter(c => {
      const s = normalizeLifecycleStage(c.lifecycle_stage);
      return s === 'PORT_DISCHARGED' || s === 'CUSTOMS_RELEASE' || s === 'GATE_OUT_PORT';
    }).length;
    return [
      { title: 'Total Tracked', value: String(total), icon: 'container' as const },
      { title: 'In Transit', value: String(inTransit), icon: 'globe' as const },
      { title: 'At Port / Clearing', value: String(atPort), icon: 'anchor' as const },
      { title: 'Completed', value: String(completed), icon: 'checkCircle' as const },
    ];
  }, [containers]);

  if (loading) return <PageLoading label="Loading container directory…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Cargo Tracker', 'Containers']}
        titlePlain="Container"
        titleEm="directory"
        subtitle="Every container and parcel tracked across your logistics operations — lifecycle, carrier and customer at a glance."
        actions={
          <Button size="sm" onClick={() => navigate('/cargotracker/containers/new')}>
            <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" />
            Track Container
          </Button>
        }
      />

      <MetricsRow cards={metricCards} />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
          <SelectTrigger style={{ minWidth: 180, maxWidth: 220 }}>
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All stages</SelectItem>
            {LIFECYCLE_STAGES.map(s => (
              <SelectItem key={s.key} value={s.key}>{s.short}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search containers, carriers, customers…"
          />
        </div>
      </div>

      {error&&<p role="alert">{error}</p>}
      {/* Container list */}
      {filtered.length === 0 && !error ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(c => (
            <ContainerRow key={c.id} container={c} onClick={() => navigate(`/cargotracker/containers/${c.container_number}`)} />
          ))}
        </div>
      )}
      {hasMore&&<Button variant="outline" onClick={()=>setCursor(nextCursor)}>Load more containers</Button>}
    </div>
  );
};

function ContainerRow({ container, onClick }: { container: TrackedContainer; onClick: () => void }) {
  const stage = normalizeLifecycleStage(container.lifecycle_stage);
  const stageDef = LIFECYCLE_STAGES.find(s => s.key === stage) || LIFECYCLE_STAGES[0];
  const stageIdx = LIFECYCLE_STAGES.findIndex(s => s.key === stage);
  const progress = Math.round(((stageIdx + 1) / LIFECYCLE_STAGES.length) * 100);
  const palette = getContainerColor(container.container_number, container.carrier_name || undefined, container.color_hex || undefined);
  const ago = timeAgo(container.updated_at);

  return (
    <button data-ui-native-button=""
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr auto',
        gap: 14,
        alignItems: 'center',
        padding: "var(--action-py) var(--space-md)",
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font)',
        width: '100%',
        transition: 'border-color .15s, box-shadow .15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--teal)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <CarrierLogo carrier={container.carrier_name} containerNumber={container.container_number} size="lg" variant="mark" />

      {/* Main info */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.03em' }}>
            {container.container_number}
          </span>
          <Badge variant={stageBadgeVariant(stage)}>{stageDef.short}</Badge>
          {container.size_type && (
            <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>{container.size_type}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--ink3)', flexWrap: 'wrap' }}>
          {container.carrier_name && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="anchor" size={11} />
              {container.carrier_name}
            </span>
          )}
          {container.customer_name && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="user" size={11} />
              {container.customer_name}
            </span>
          )}
          {container.shipment_id && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="ship" size={11} />
              Linked
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="cnt-progress" style={{ height: 4, marginTop: 2, maxWidth: 180 }}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Right: timestamp */}
      <div style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap', textAlign: 'right' }}>
        {ago}
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <FeaturedIcon variant="gray" size="lg" shape="circle" className="mx-auto mb-3">
        <Icon name="container" size={22} />
      </FeaturedIcon>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No containers tracked yet</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, maxWidth: 380, marginInline: 'auto' }}>
        Start tracking a container to see its full lifecycle — from depot allocation through ocean transit to empty return.
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    const days = Math.floor(diff / 86_400_000);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
