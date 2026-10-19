import { useState } from 'react';
import type { Manifest, CargoItem } from '../../pages/TrackingCargoLoading.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Badge } from '../ui/badge.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs.js';
import { Icon } from '../Icon.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.js';
import './TruckLoadOverview.css';

export function TruckLoadEmpty({ onCreate, creating = false }: { onCreate: () => void; creating?: boolean }) {
  return <section className="truck-load-start">
    <div><span className="truck-load-eyebrow">LOAD PLANNING</span><h2>Make room for your next delivery.</h2><p>Create a load plan, add your cargo, and check how it fits before dispatch.</p><Button onClick={onCreate} disabled={creating}><Icon name="plus" size={15} />{creating ? 'Creating…' : 'Create load plan'}</Button></div>
    <div><img src="/images/freight/truck-side-v1.png" alt="Illustration of a white cargo truck" /><small>Illustrative vehicle · no load plan assigned</small></div>
  </section>;
}

export function TruckLoadOverview({ manifest, items }: { manifest: Manifest; items: CargoItem[] }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const weight = items.reduce((sum, item) => sum + item.weight_kg * item.quantity, 0);
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const packed = items.reduce((sum, item) => sum + item.placements.length, 0);
  const selectedItem = items.find(item => item.id === selected);
  const containerVolume = manifest.container_length_cm * manifest.container_width_cm * manifest.container_height_cm;
  const packedVolume = items.reduce((sum, item) => sum + item.length_cm * item.width_cm * item.height_cm * item.placements.length, 0);
  const spaceUsed = containerVolume > 0 ? Math.min(100, packedVolume / containerVolume * 100) : 0;
  const utilization = manifest.max_weight_kg > 0 ? weight / manifest.max_weight_kg * 100 : 0;
  const visible = items.filter(item => item.label.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || (filter === 'Packed' ? item.placements.length >= item.quantity : item.placements.length < item.quantity)));
  const tonnes = (kg: number) => `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t`;
  return <section className="truck-load-overview" aria-label="Truck loading overview">
    <div className="truck-load-heading"><div><span className="truck-load-eyebrow">LOAD OVERVIEW</span><h2>{manifest.vehicle_plate || manifest.vehicle_name || manifest.name}</h2></div><Badge variant="outline">{manifest.status}</Badge></div>
    <Tabs defaultValue="cargo" className="truck-load-visual">
      <div className="truck-load-visual-toolbar"><TabsList><TabsTrigger value="cargo">Cargo layout</TabsTrigger><TabsTrigger value="capacity">Space utilization</TabsTrigger></TabsList><span><Icon name="truck" size={14} /> {manifest.shipment_ref || 'Load planning'}</span></div>
    <div className="truck-load-stage">
      <div className="truck-load-rig">
        <img className="truck-load-chassis" src="/images/freight/truck-side-v1.png" alt="Illustrative cargo truck side view" />
        <TabsContent value="cargo" className="truck-load-trailer" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(items.length / 2))}, minmax(110px, 1fr))` }}>
          {items.length ? items.map((item, index) => <Button variant="ghost" type="button" key={item.id} className={`truck-load-block ${selected === item.id ? 'is-selected' : ''}`} onClick={() => setSelected(selected === item.id ? null : item.id)} aria-pressed={selected === item.id}>
            <span className="truck-load-block-top"><span>{String(index + 1).padStart(2, '0')}</span><span>{item.quantity} units</span></span>
            <strong>{item.label}</strong><span>{(item.weight_kg * item.quantity).toLocaleString()} kg</span>
            <progress value={Math.min(item.placements.length, item.quantity)} max={Math.max(1, item.quantity)} aria-label={`${item.label} packed quantity`} />
          </Button>) : <div className="truck-load-empty">Your truck is ready.<span>Add cargo below to build your load plan.</span></div>}
        </TabsContent>
        <TabsContent value="capacity" className="truck-load-capacity">
          <div className="truck-load-capacity-fill" style={{ width: `${spaceUsed}%` }} />
          <div className="truck-load-space-label"><strong>{spaceUsed.toFixed(0)}%</strong><span>space packed</span></div>
          <div className="truck-load-space-label"><strong>{(100 - spaceUsed).toFixed(0)}%</strong><span>space available</span></div>
        </TabsContent>
      </div>
      <div className="truck-load-caption"><span>Side elevation · cargo groups</span><span>{manifest.container_length_cm} × {manifest.container_width_cm} × {manifest.container_height_cm} cm · schematic, not to scale</span></div>
    </div>
    <div className="truck-load-context">
      <div><span className="truck-load-eyebrow">ROUTE</span><strong>{manifest.origin || 'Origin not assigned'} <span aria-hidden="true">→</span> {manifest.destination || 'Destination not assigned'}</strong><small>{manifest.name}</small></div>
      <div className="truck-load-selection" aria-live="polite"><span className="truck-load-eyebrow">{selectedItem ? 'SELECTED CARGO' : 'CARGO INSPECTOR'}</span><strong>{selectedItem?.label || 'Select a cargo block'}</strong><small>{selectedItem ? `${selectedItem.quantity} units · ${selectedItem.weight_kg.toLocaleString()} kg each · ${selectedItem.placements.length} packed` : 'Inspect quantities and packing status on the truck.'}</small></div>
    </div>
    </Tabs>
    <div className="truck-load-metrics">
      {[
        ['Total cargo weight', tonnes(weight), `${utilization.toFixed(0)}% of payload capacity`],
        ['Remaining capacity', tonnes(Math.max(0, manifest.max_weight_kg - weight)), weight > manifest.max_weight_kg ? 'Payload limit exceeded' : `${tonnes(manifest.max_weight_kg)} maximum payload`],
        ['Packed units', `${packed} / ${quantity}`, 'Positioned in the 3D load plan'],
        ['Cargo groups', String(items.length), `${items.filter(item => item.placements.length < item.quantity).length} groups awaiting packing`],
      ].map(([label, value, description]) => <div className="truck-load-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{description}</small></div>)}
    </div>
    <div className="truck-load-manifest">
      <div className="truck-load-toolbar"><div className="truck-load-filters">{['All', 'Packed', 'Pending'].map(value => <Button key={value} size="sm" variant={filter === value ? 'secondary' : 'ghost'} onClick={() => setFilter(value)}>{value}</Button>)}</div><Input aria-label="Search cargo" placeholder="Search cargo…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <Table><TableHeader><TableRow>{['Cargo item', 'Dimensions (cm)', 'Quantity', 'Total weight', 'Packed', 'Status'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {visible.map(item => <TableRow key={item.id} data-state={selected === item.id ? 'selected' : undefined}><TableCell><strong>{item.label}</strong></TableCell><TableCell>{item.length_cm} × {item.width_cm} × {item.height_cm}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{(item.weight_kg * item.quantity).toLocaleString()} kg</TableCell><TableCell>{item.placements.length} / {item.quantity}</TableCell><TableCell><Badge variant="outline">{item.placements.length >= item.quantity ? 'Packed' : item.placements.length ? 'Partially packed' : 'Pending'}</Badge></TableCell></TableRow>)}
        {!visible.length && <TableRow><TableCell colSpan={6}> {items.length ? 'No cargo matches your filters.' : 'No cargo added to this load plan yet.'}</TableCell></TableRow>}
      </TableBody></Table>
    </div>
  </section>;
}


