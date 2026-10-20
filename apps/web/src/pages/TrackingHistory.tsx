import { useChartColors } from '../hooks/useChartColors.js';
import './FreightOperations.css';
import { DateRangePicker } from '../components/ui/date-picker.js';
import type { DateRange } from 'react-day-picker';
import { Banner } from '../components/ui/alert.js';
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, Polyline, Marker, Popup } from 'react-leaflet';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js';
import { apiFetch } from '../lib/api.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { Combobox } from '../components/ui/combobox.js';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { QueryState } from '../components/ui/DataTable.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Position { latitude: number; longitude: number; speed: number | null; recorded_at: string }

const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];

export const TrackingHistory: React.FC = () => {
  const chartColors = useChartColors();
  const [pageError, setPageError] = useState('');
  const reportError = (e: unknown) => setPageError(e instanceof Error ? e.message : 'Unable to load records.');
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(searchParams.get('vehicle') || '');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(list => {
      setVehicles(list);
      if (!vehicleId && list.length > 0) setVehicleId(list[0].id);
    }).catch(reportError);
  }, []);

  useEffect(() => {
    let active = true;
    setPositions([]);
    if (!vehicleId) return;
    const query = new URLSearchParams();
    if (range?.from) query.set('from', range.from.toISOString());
    if (range?.to) { const end = new Date(range.to); end.setHours(23,59,59,999); query.set('to',end.toISOString()); }
    setLoading(true); setPageError('');
    apiFetch(`/v1/tracking/vehicles/${vehicleId}/history?${query}`).then(rows=>{ if(active) setPositions(rows); }).catch(e=>{if(active)reportError(e);}).finally(()=>{if(active)setLoading(false);});
    setSearchParams({vehicle:vehicleId}, {replace:true});
    return ()=>{active=false;};
  }, [vehicleId, range]);

  const trail: [number, number][] = positions.map(p => [p.latitude, p.longitude]);
  const center = trail.length ? trail[trail.length - 1] : DEFAULT_CENTER;

  const chartData = {
    labels: positions.map(p => new Date(p.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    datasets: [{
      label: 'Speed (km/h)', data: positions.map(p => p.speed),
      borderColor: chartColors.brand, backgroundColor: chartColors.brand, tension: 0.25, pointRadius: 0,
    }],
  };

  return (
    <div className="freight-workspace">{pageError && <Banner variant="error">{pageError}</Banner>}
      <PageHeader
        crumbs={['HuduFreight', 'History']}
        titlePlain="Trip"
        titleEm="history"
        subtitle="Latest 2,000 recorded positions and observed speeds. Gaps indicate missing speed data."
        actions={(<div className="freight-actions"><DateRangePicker range={range} onChange={setRange} numberOfMonths={1} />
          <Combobox
            options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
            value={vehicleId} onChange={setVehicleId} placeholder="Select vehicle…" triggerClassName="w-60"
          /></div>
        )}
      />

      {loading ? (
        <SectionLoading label="Loading trip history…" />
      ) : positions.length === 0 ? (
        <QueryState
          empty
          emptyTitle={vehicleId ? 'No trip history yet' : 'Select a vehicle'}
          emptyMessage={vehicleId ? 'This vehicle has not reported any position history.' : 'Choose a vehicle to review its route and speed history.'}
          emptyIcon="clock"
        >
          <></>
        </QueryState>
      ) : (
        <>
          <div style={{ height: 380, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
            <MapContainer key={vehicleId} center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <MapTileLayer />
              {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: 'var(--teal)', weight: 3 }} />}
              {trail.length > 0 && (
                <Marker position={trail[trail.length - 1]}>
                  <Popup>Latest position — {new Date(positions[positions.length - 1].recorded_at).toLocaleString()}</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <SectionCard>
            <div style={{ height: 200 }}>
              <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
};
