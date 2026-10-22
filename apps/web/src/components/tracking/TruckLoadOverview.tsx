import React, { useState, useMemo } from 'react';
import type { Manifest, CargoItem } from '../../pages/TrackingCargoLoading.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Badge } from '../ui/badge.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs.js';
import { Icon } from '../Icon.js';
import { ResponsiveTable } from '../ui/responsive-table.js';
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.js';
import { Truck3DViewer } from './Truck3DViewer.js';
import { FLEET_VEHICLES, type FleetVehicle, type FleetCargoItem } from '../../lib/freightFleetData.js';
import './TruckLoadOverview.css';

export function TruckLoadEmpty({ onCreate, creating = false }: { onCreate: () => void; creating?: boolean }) {
  return (
    <section className="truck-load-start">
      <div>
        <span className="truck-load-eyebrow">LOAD PLANNING &amp; 3D SCHEMATICS</span>
        <h2>Make room for your next delivery.</h2>
        <p>
          Create an interactive load plan, simulate volumetric 3D container stacking, inspect diagnostic hotspots, and verify available space before dispatch.
        </p>
        <Button onClick={onCreate} disabled={creating}>
          <Icon name="plus" size={15} /> {creating ? 'Creating…' : 'Create load plan'}
        </Button>
      </div>
      <div>
        <img src="/images/freight/volvo-fh16.jpg" alt="Volvo FH16 articulated truck side view" />
        <small>Volvo FH16 Globetrotter 750 · 26,000 kg Payload Capacity</small>
      </div>
    </section>
  );
}

export interface TruckLoadOverviewProps {
  manifest: Manifest;
  items: CargoItem[];
  vehicle?: any;
  driver?: any;
  onAddItemClick?: () => void;
  onItemSelect?: (itemId: string | null) => void;
  selectedItemId?: string | null;
  onUnloadItem?: (itemId: string) => void;
  onSlotSelect?: (slotCode: string) => void;
}

export function TruckLoadOverview({
  manifest,
  items,
  vehicle: propVehicle,
  driver: _driver,
  onAddItemClick,
  onItemSelect,
  selectedItemId: propSelectedId,
  onUnloadItem,
  onSlotSelect,
}: TruckLoadOverviewProps) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'3d' | 'cargo' | 'capacity'>('3d');

  const selected = propSelectedId !== undefined ? propSelectedId : internalSelected;
  const setSelected = (id: string | null) => {
    setInternalSelected(id);
    if (onItemSelect) onItemSelect(id);
  };

  // Match or fallback to a fleet vehicle
  const currentVehicle: FleetVehicle = useMemo(() => {
    const base = FLEET_VEHICLES.find(f => f.id === propVehicle?.id || f.plate_number === propVehicle?.plate_number || f.id === manifest.vehicle_id) || FLEET_VEHICLES[0];
    if (!propVehicle) return base;
    return {
      ...base,
      id: propVehicle.id || base.id,
      name: propVehicle.name || base.name,
      plate_number: propVehicle.plate_number || base.plate_number,
      photoUrl: propVehicle.photo_url || base.photoUrl,
      specs: {
        ...base.specs,
        containerLengthCm: Number(manifest.container_length_cm) || base.specs.containerLengthCm,
        containerWidthCm: Number(manifest.container_width_cm) || base.specs.containerWidthCm,
        containerHeightCm: Number(manifest.container_height_cm) || base.specs.containerHeightCm,
        maxWeightKg: Number(manifest.max_weight_kg) || base.specs.maxWeightKg,
      },
    };
  }, [propVehicle, manifest.vehicle_id, manifest.container_length_cm, manifest.container_width_cm, manifest.container_height_cm, manifest.max_weight_kg]);

  // Merge items or use vehicle cargo items
  const mappedCargoItems: FleetCargoItem[] = useMemo(() => {
    if (items && items.length > 0) {
      return items.map((it, idx) => ({
        id: it.id,
        code: `CRG${String(idx + 1).padStart(2, '0')}`,
        label: it.label,
        length_cm: Number(it.length_cm) || 120,
        width_cm: Number(it.width_cm) || 80,
        height_cm: Number(it.height_cm) || 100,
        weight_kg: Number(it.weight_kg) || 400,
        quantity: Number(it.quantity) || 1,
        color: it.color || '#0891b2',
        status: it.placements && it.placements.length >= (it.quantity || 1) ? 'Loaded' : 'Pending',
        destination: manifest.destination || 'Dodoma Central Terminal',
        placements: it.placements || [],
      }));
    }
    return currentVehicle.cargoItems;
  }, [items, currentVehicle.cargoItems, manifest.destination]);

  const weight = items.length
    ? items.reduce((sum, item) => sum + (Number(item.weight_kg) || 0) * (Number(item.quantity) || 1), 0)
    : currentVehicle.specs.currentWeightKg;

  const quantity = items.length
    ? items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
    : mappedCargoItems.reduce((sum, item) => sum + item.quantity, 0);

  const packed = items.length
    ? items.reduce((sum, item) => sum + (item.placements?.length || 0), 0)
    : mappedCargoItems.filter(i => i.status === 'Loaded').length;

  const selectedItem = mappedCargoItems.find(item => item.id === selected);

  const containerVolume = (Number(manifest.container_length_cm) || 1360) * (Number(manifest.container_width_cm) || 248) * (Number(manifest.container_height_cm) || 270);
  const packedVolume = items.length
    ? items.reduce((sum, item) => sum + (Number(item.length_cm) || 0) * (Number(item.width_cm) || 0) * (Number(item.height_cm) || 0) * (item.placements?.length || 1), 0)
    : 0;

  const spaceUsed = containerVolume > 0 && items.length > 0
    ? Math.min(100, (packedVolume / containerVolume) * 100)
    : (currentVehicle.specs.loadCapacityPct || 68);

  const spaceAvailable = Math.max(0, 100 - spaceUsed);

  const maxWeightKg = Number(manifest.max_weight_kg) || currentVehicle.specs.maxWeightKg || 26000;
  const utilization = maxWeightKg > 0 ? (weight / maxWeightKg) * 100 : 0;

  const visible = mappedCargoItems.filter(
    item =>
      item.label.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'All' ||
        (filter === 'Packed' ? item.status === 'Loaded' : item.status !== 'Loaded'))
  );

  const tonnes = (kg: number) => `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t`;

  // Grid crates for 2D cutaway view (matching Reference Image 1 & 4)
  const cutawayCrates = useMemo(() => {
    if (items.length > 0) {
      return items.slice(0, 16).map((it, idx) => {
        const slot = it.placements?.[0]?.slot || `A${idx + 1}`;
        return {
          id: it.id,
          code: `CRG${String(idx + 1).padStart(2, '0')}`,
          slot,
          label: it.label,
          weight: `${(Number(it.weight_kg) || 0).toLocaleString()} kg`,
        };
      });
    }
    return [
      { id: 'c1', code: 'CRG15', slot: 'A1', label: 'Electronics', weight: '500 kg' },
      { id: 'c2', code: 'CRG17', slot: 'A2', label: 'Spares', weight: '500 kg' },
      { id: 'c3', code: 'CRG20', slot: 'A3', label: 'Machinery', weight: '500 kg' },
      { id: 'c4', code: 'CRG15', slot: 'A4', label: 'Dry Freight', weight: '450 kg' },
      { id: 'c5', code: 'CRG17', slot: 'A5', label: 'Transformers', weight: '450 kg' },
      { id: 'c6', code: 'CRG20', slot: 'A6', label: 'Vaccines', weight: '450 kg' },
      { id: 'c7', code: 'CRG22', slot: 'A7', label: 'Beverages', weight: '450 kg' },
      { id: 'c8', code: 'CRG21', slot: 'B1', label: 'Steel Coils', weight: '700 kg' },
      { id: 'c9', code: 'CRG12', slot: 'B2', label: 'Batteries', weight: '300 kg' },
      { id: 'c10', code: 'CRG20', slot: 'B3', label: 'Medical Kits', weight: '500 kg' },
      { id: 'c11', code: 'CRG14', slot: 'B4', label: 'Pumps', weight: '950 kg' },
      { id: 'c12', code: 'CRG19', slot: 'B5', label: 'Lubricants', weight: '450 kg' },
      { id: 'c13', code: 'CRG21', slot: 'B6', label: 'Solar Panels', weight: '450 kg' },
      { id: 'c14', code: 'CRG15', slot: 'C1', label: 'Generators', weight: '1500 kg' },
      { id: 'c15', code: 'CRG13', slot: 'C2', label: 'Hardware', weight: '450 kg' },
      { id: 'c16', code: 'CRG16', slot: 'C3', label: 'Textiles', weight: '450 kg' },
    ];
  }, [items]);

  return (
    <section className="truck-load-overview" aria-label="Truck loading overview">
      {/* Heading Bar */}
      <div className="truck-load-heading">
        <div>
          <span className="truck-load-eyebrow">LOAD OVERVIEW &amp; 3D SCHEMATICS</span>
          <h2>{manifest.vehicle_name || currentVehicle.name} ({manifest.vehicle_plate || currentVehicle.plate_number})</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge variant="outline" style={{ background: 'var(--teal-l)', color: 'var(--teal)', border: 'none', fontWeight: 700 }}>
            {manifest.status || currentVehicle.statusLabel}
          </Badge>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            ID: {manifest.id ? manifest.id.slice(0, 8) : currentVehicle.id.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Visual Workspace Tabs */}
      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as any)} className="truck-load-visual">
        <div className="truck-load-visual-toolbar">
          <TabsList wrap>
            <TabsTrigger value="3d">
              <Icon name="maximize" size={14} style={{ marginRight: 6 }} /> 3D view
            </TabsTrigger>
            <TabsTrigger value="cargo">
              <Icon name="truck" size={14} style={{ marginRight: 6 }} /> 2D plan
            </TabsTrigger>
            <TabsTrigger value="capacity">
              <Icon name="pieChart" size={14} style={{ marginRight: 6 }} /> Capacity ({spaceUsed.toFixed(0)}%)
            </TabsTrigger>
          </TabsList>

          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="truck" size={14} color="var(--teal)" />
            {manifest.shipment_ref || currentVehicle.activeTrip?.loadId || 'Priority Express Dispatch'}
          </span>
        </div>

        {/* TAB 1: 3D 360 ROTATABLE SCHEMATICS */}
        <TabsContent value="3d" style={{ margin: 0, padding: 0 }}>
          <div style={{ height: 540, position: 'relative' }}>
            <Truck3DViewer
              vehicle={currentVehicle}
              items={mappedCargoItems}
              selectedItemId={selected}
              onItemSelect={(it) => setSelected(selected === it.id ? null : it.id)}
              onAddCargoClick={onAddItemClick}
            />
          </div>
        </TabsContent>

        {/* TAB 2: 2D SIDE ELEVATION CUTAWAY (Image 1 & 4 Layout) */}
        <TabsContent value="cargo" style={{ margin: 0 }}>
          <div className="truck-load-stage">
            <div className="truck-load-rig">
              <img
                className="truck-load-chassis"
                src={currentVehicle.photoUrl || '/images/freight/truck-side-v1.png'}
                alt={`${currentVehicle.name} side elevation`}
              />
              <div className="truck-load-trailer">
                {cutawayCrates.map((crate) => (
                  <button
                    key={crate.id}
                    type="button"
                    className={`truck-load-block ${selected === crate.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelected(selected === crate.id ? null : crate.id);
                      if (onSlotSelect && crate.slot) onSlotSelect(crate.slot);
                    }}
                  >
                    <span className="truck-load-block-top">
                      <span>{crate.code}</span>
                      {crate.slot && <small style={{ color: 'var(--ink3)' }}>{crate.slot}</small>}
                    </span>
                    <strong>{crate.label}</strong>
                    <span className="weight-tag">{crate.weight}</span>
                  </button>
                ))}

                {/* Available space slots with (+) action buttons */}
                {[1, 2, 3, 4, 5].map((slotIdx) => (
                  <div
                    key={`add-slot-${slotIdx}`}
                    className="truck-load-block-add"
                    onClick={() => {
                      if (onSlotSelect) onSlotSelect(`Bay-S${slotIdx}`);
                      if (onAddItemClick) onAddItemClick();
                    }}
                    title="Load cargo into this compartment"
                  >
                    <span className="truck-load-add-btn">+</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="truck-load-caption">
              <span>Side elevation · Compartment cargo groups with instant (+) slot assignment</span>
              <span>
                {manifest.container_length_cm || currentVehicle.specs.containerLengthCm} ×{' '}
                {manifest.container_width_cm || currentVehicle.specs.containerWidthCm} ×{' '}
                {manifest.container_height_cm || currentVehicle.specs.containerHeightCm} cm · payload max{' '}
                {maxWeightKg.toLocaleString()} kg
              </span>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: SPACE UTILIZATION (Image 4 Layout: 68% Space Loaded / 32% Space Available) */}
        <TabsContent value="capacity" style={{ margin: 0 }}>
          <div className="truck-load-stage">
            <div className="truck-load-rig">
              <img
                className="truck-load-chassis"
                src={currentVehicle.photoUrl || '/images/freight/truck-side-v1.png'}
                alt={`${currentVehicle.name} capacity schematic`}
              />
              <div className="truck-load-capacity-container">
                <div className="truck-load-capacity-loaded" style={{ width: `${spaceUsed}%` }}>
                  <strong>{spaceUsed.toFixed(0)}% space</strong>
                  <span>loaded</span>
                </div>
                <div className="truck-load-capacity-available" style={{ width: `${spaceAvailable}%` }}>
                  <strong>{spaceAvailable.toFixed(0)}% space</strong>
                  <span>available</span>
                </div>
              </div>
            </div>
            <div className="truck-load-caption">
              <span>Volumetric Trailer Capacity Breakdown</span>
              <span>
                Payload Weight: {weight.toLocaleString()} kg / {maxWeightKg.toLocaleString()} kg ({utilization.toFixed(0)}% limit)
              </span>
            </div>
          </div>
        </TabsContent>

        {/* Bottom Context: Route & Selected Cargo Inspector */}
        <div className="truck-load-context">
          <div>
            <span className="truck-load-eyebrow">ROUTE &amp; DISPATCH DESTINATION</span>
            <strong>
              {manifest.origin || currentVehicle.activeTrip?.origin || 'Dar es Salaam (Dock #3)'}{' '}
              <span aria-hidden="true">→</span>{' '}
              {manifest.destination || currentVehicle.activeTrip?.destination || 'Dodoma (Central Hub)'}
            </strong>
            <small>
              {currentVehicle.activeTrip?.distanceKm || 450} km · {currentVehicle.activeTrip?.timeSpent || '08h 15m'} transit ·{' '}
              {currentVehicle.activeTrip?.remainingKm || 32} km remaining
            </small>
          </div>

          <div className="truck-load-selection" aria-live="polite">
            <span className="truck-load-eyebrow">{selectedItem ? 'SELECTED CARGO INSPECTOR' : 'CARGO INSPECTOR'}</span>
            <strong>{selectedItem ? `${selectedItem.code} · ${selectedItem.label}` : 'Select any cargo crate to inspect details'}</strong>
            <small>
              {selectedItem
                ? `${selectedItem.quantity} units · ${selectedItem.weight_kg.toLocaleString()} kg each · Destination: ${selectedItem.destination} · Dimensions: ${selectedItem.length_cm} × ${selectedItem.width_cm} × ${selectedItem.height_cm} cm`
                : 'Click any crate on the 3D model or 2D elevation plan to view dimensions, weights, and consignee info.'}
            </small>
          </div>
        </div>
      </Tabs>

      {/* Real-time KPI Metric Cards */}
      <div className="truck-load-metrics">
        {[
          ['Total cargo weight', tonnes(weight), `${utilization.toFixed(0)}% of vehicle payload capacity`],
          [
            'Remaining capacity',
            tonnes(Math.max(0, maxWeightKg - weight)),
            weight > maxWeightKg ? 'Payload limit exceeded' : `${tonnes(maxWeightKg)} maximum payload`,
          ],
          ['Packed units', `${packed} / ${quantity}`, 'Verified in 3D loading schematics'],
          [
            'Cargo groups',
            String(mappedCargoItems.length),
            `${mappedCargoItems.filter(item => item.status !== 'Loaded').length} groups awaiting dispatch`,
          ],
        ].map(([label, val, desc]) => (
          <div className="truck-load-metric" key={label}>
            <span>{label}</span>
            <strong>{val}</strong>
            <small>{desc}</small>
          </div>
        ))}
      </div>

      {/* Manifest Table */}
      <div className="truck-load-manifest">
        <div className="truck-load-toolbar">
          <div className="truck-load-filters">
            {['All', 'Packed', 'Pending'].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={filter === v ? 'secondary' : 'ghost'}
                onClick={() => setFilter(v)}
              >
                {v}
              </Button>
            ))}
          </div>
          <Input
            aria-label="Search cargo"
            placeholder="Search cargo label or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ResponsiveTable>
          <TableHeader>
            <TableRow>
              {['Cargo Item', 'Dimensions (cm)', 'Quantity', 'Total Weight', 'Destination', 'Status', 'Action'].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((it) => (
              <TableRow
                key={it.id}
                data-state={selected === it.id ? 'selected' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(selected === it.id ? null : it.id)}
              >
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
                    <div>
                      <strong>{it.code}</strong> <span style={{ color: 'var(--ink2)' }}>{it.label}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{it.length_cm} × {it.width_cm} × {it.height_cm}</TableCell>
                <TableCell>{it.quantity}</TableCell>
                <TableCell>{(it.weight_kg * it.quantity).toLocaleString()} kg</TableCell>
                <TableCell>{it.destination}</TableCell>
                <TableCell>
                  <Badge variant={it.status === 'Loaded' ? 'success' : 'outline'}>
                    {it.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {onUnloadItem && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnloadItem(it.id);
                      }}
                      style={{ height: 26, fontSize: 11, color: '#ef4444' }}
                    >
                      Unload
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)' }}>
                  No cargo matches your search filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </ResponsiveTable>
      </div>
    </section>
  );
}
