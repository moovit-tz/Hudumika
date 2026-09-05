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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Position { latitude: number; longitude: number; speed: number | null; recorded_at: string }

const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];

export const TrackingHistory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(searchParams.get('vehicle') || '');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(list => {
      setVehicles(list);
      if (!vehicleId && list.length > 0) setVehicleId(list[0].id);
    }).catch(() => setVehicles([]));
  }, []);

  const loadHistory = useCallback((id: string) => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/tracking/vehicles/${id}/history`).then(setPositions).catch(() => setPositions([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (vehicleId) { loadHistory(vehicleId); setSearchParams({ vehicle: vehicleId }); } }, [vehicleId, loadHistory]);

  const trail: [number, number][] = positions.map(p => [p.latitude, p.longitude]);
  const center = trail.length ? trail[trail.length - 1] : DEFAULT_CENTER;

  const chartData = {
    labels: positions.map(p => new Date(p.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    datasets: [{
      label: 'Speed (km/h)', data: positions.map(p => p.speed ?? 0),
      borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.25, pointRadius: 0,
    }],
  };

  return (
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'History']}
            titlePlain="Trip"
            titleEm="history"
            subtitle="Route trail and speed for a vehicle"
          />
        </div>
        <Combobox
          options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
          value={vehicleId} onChange={setVehicleId} placeholder="Select vehicle…" triggerClassName="w-60"
        />
      </div>

      {!loading && positions.length === 0 ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
          No position history for this vehicle yet.
        </div>
      ) : (
        <>
          <div style={{ height: 380, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <MapTileLayer />
              {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#0891b2', weight: 3 }} />}
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
