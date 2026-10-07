import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select.js';
import { FeaturedIcon } from '../ui/featured-icon.js';
import { SectionCard } from '../SectionCard.js';
import { apiFetch } from '../../lib/api.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';

export interface SensorSnapshot {
  id: string;
  vehicle_id: string;
  snapshot_type: string;
  payload: any;
  recorded_at: string;
}

export interface SensorItem {
  id: string;
  code: string;
  name: string;
  category: 'fuel' | 'powertrain' | 'thermal' | 'electrical' | 'tpms' | 'canbus' | 'security';
  categoryLabel: string;
  value: number;
  unit: string;
  formattedValue: string;
  status: 'nominal' | 'warning' | 'critical' | 'offline';
  minSafe: number;
  maxSafe: number;
  minWarning: number;
  maxWarning: number;
  minScale: number;
  maxScale: number;
  sparkline: number[];
  lastUpdated: string;
  details?: string;
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'fuel', label: 'Fuel & Fluid Levels' },
  { value: 'powertrain', label: 'Engine & Powertrain' },
  { value: 'thermal', label: 'Temperature & Cold Chain' },
  { value: 'electrical', label: 'Electrical & Battery' },
  { value: 'tpms', label: 'Tire Pressure (TPMS)' },
  { value: 'canbus', label: 'CAN-Bus & Diagnostics' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'nominal', label: '● Nominal (Normal)' },
  { value: 'warning', label: '● Warning (Near Limit)' },
  { value: 'critical', label: '● Critical (Over Limit)' },
  { value: 'offline', label: '● Offline / Stale' },
];

const DEFAULT_SENSORS: SensorItem[] = [
  {
    id: 'sen-fuel-1',
    code: 'CAN-FL-01',
    name: 'Primary Fuel Tank Level',
    category: 'fuel',
    categoryLabel: 'Fuel & Fluid',
    value: 185.4,
    unit: 'L',
    formattedValue: '185.4 L (74%)',
    status: 'nominal',
    minSafe: 30,
    maxSafe: 250,
    minWarning: 45,
    maxWarning: 245,
    minScale: 0,
    maxScale: 250,
    sparkline: [195, 192, 190, 188, 186, 185.4],
    lastUpdated: '1 min ago',
    details: 'Ultrasonic capacitive probe · Tank Capacity: 250 L',
  },
  {
    id: 'sen-temp-coolant',
    code: 'OBD-ECT-02',
    name: 'Engine Coolant Temperature',
    category: 'powertrain',
    categoryLabel: 'Engine & Powertrain',
    value: 88.5,
    unit: '°C',
    formattedValue: '88.5 °C',
    status: 'nominal',
    minSafe: 70,
    maxSafe: 102,
    minWarning: 95,
    maxWarning: 108,
    minScale: 40,
    maxScale: 130,
    sparkline: [82, 85, 86, 87, 88.2, 88.5],
    lastUpdated: '30s ago',
    details: 'CAN-Bus J1939 SPN 110 · Radiator thermostat open',
  },
  {
    id: 'sen-elec-volt',
    code: 'SYS-VOLT-03',
    name: 'Alternator & System Voltage',
    category: 'electrical',
    categoryLabel: 'Electrical & Battery',
    value: 24.4,
    unit: 'V',
    formattedValue: '24.4 V',
    status: 'nominal',
    minSafe: 22.8,
    maxSafe: 28.8,
    minWarning: 23.5,
    maxWarning: 28.2,
    minScale: 18,
    maxScale: 32,
    sparkline: [24.1, 24.2, 24.4, 24.3, 24.4, 24.4],
    lastUpdated: 'Just now',
    details: 'Dual 12V series commercial system · Active charging',
  },
  {
    id: 'sen-rpm',
    code: 'CAN-RPM-04',
    name: 'Engine Revolution Speed (RPM)',
    category: 'powertrain',
    categoryLabel: 'Engine & Powertrain',
    value: 1850,
    unit: 'RPM',
    formattedValue: '1,850 RPM',
    status: 'nominal',
    minSafe: 650,
    maxSafe: 2400,
    minWarning: 2200,
    maxWarning: 2600,
    minScale: 0,
    maxScale: 3000,
    sparkline: [750, 1200, 1600, 1820, 1840, 1850],
    lastUpdated: '10s ago',
    details: 'Crankshaft position sensor · Cruise speed engaged',
  },
  {
    id: 'sen-reefer-1',
    code: 'BLE-TEMP-05',
    name: 'Cargo Bay Reefer Zone #1',
    category: 'thermal',
    categoryLabel: 'Temperature & Cold Chain',
    value: -18.2,
    unit: '°C',
    formattedValue: '-18.2 °C',
    status: 'nominal',
    minSafe: -25,
    maxSafe: -14,
    minWarning: -15,
    maxWarning: -12,
    minScale: -30,
    maxScale: 10,
    sparkline: [-17.5, -17.8, -18.0, -18.1, -18.3, -18.2],
    lastUpdated: '2 mins ago',
    details: 'Wireless Bluetooth LE probe · Pharma & Frozen Food Certified',
  },
  {
    id: 'sen-oil-press',
    code: 'CAN-OILP-06',
    name: 'Engine Oil Pressure',
    category: 'powertrain',
    categoryLabel: 'Engine & Powertrain',
    value: 4.2,
    unit: 'bar',
    formattedValue: '4.2 bar',
    status: 'nominal',
    minSafe: 2.0,
    maxSafe: 5.8,
    minWarning: 2.5,
    maxWarning: 5.5,
    minScale: 0,
    maxScale: 8,
    sparkline: [3.8, 4.0, 4.1, 4.2, 4.2, 4.2],
    lastUpdated: '45s ago',
    details: 'Main gallery pressure transmitter · Grade 15W-40',
  },
  {
    id: 'sen-tpms-fl',
    code: 'TPMS-FL-07',
    name: 'Tire Pressure (Front Left)',
    category: 'tpms',
    categoryLabel: 'Tire Pressure (TPMS)',
    value: 41.5,
    unit: 'PSI',
    formattedValue: '41.5 PSI',
    status: 'nominal',
    minSafe: 36,
    maxSafe: 48,
    minWarning: 38,
    maxWarning: 46,
    minScale: 20,
    maxScale: 60,
    sparkline: [42.0, 41.8, 41.6, 41.5, 41.5, 41.5],
    lastUpdated: '1 min ago',
    details: 'Direct valve stem RF sensor · Temp: 34°C',
  },
  {
    id: 'sen-tpms-fr',
    code: 'TPMS-FR-08',
    name: 'Tire Pressure (Front Right)',
    category: 'tpms',
    categoryLabel: 'Tire Pressure (TPMS)',
    value: 42.0,
    unit: 'PSI',
    formattedValue: '42.0 PSI',
    status: 'nominal',
    minSafe: 36,
    maxSafe: 48,
    minWarning: 38,
    maxWarning: 46,
    minScale: 20,
    maxScale: 60,
    sparkline: [42.1, 42.0, 42.0, 42.1, 42.0, 42.0],
    lastUpdated: '1 min ago',
    details: 'Direct valve stem RF sensor · Temp: 35°C',
  },
  {
    id: 'sen-adblue',
    code: 'CAN-DEF-09',
    name: 'AdBlue / DEF Tank Level',
    category: 'fuel',
    categoryLabel: 'Fuel & Fluid',
    value: 14.8,
    unit: 'L',
    formattedValue: '14.8 L (74%)',
    status: 'nominal',
    minSafe: 3,
    maxSafe: 20,
    minWarning: 5,
    maxWarning: 19,
    minScale: 0,
    maxScale: 20,
    sparkline: [15.2, 15.0, 15.0, 14.9, 14.8, 14.8],
    lastUpdated: '3 mins ago',
    details: 'Euro 6 SCR emission fluid reservoir',
  },
  {
    id: 'sen-fuel-flow',
    code: 'CAN-FFR-10',
    name: 'Instantaneous Fuel Consumption',
    category: 'fuel',
    categoryLabel: 'Fuel & Fluid',
    value: 5.2,
    unit: 'L/h',
    formattedValue: '5.2 L/h',
    status: 'nominal',
    minSafe: 0,
    maxSafe: 18,
    minWarning: 14,
    maxWarning: 17,
    minScale: 0,
    maxScale: 25,
    sparkline: [2.1, 4.5, 6.8, 5.9, 5.0, 5.2],
    lastUpdated: '15s ago',
    details: 'Calculated from injector duty cycle & mass airflow',
  },
];

export function VehicleSensorSnapshotsTab({ vehicleId }: { vehicleId: string }) {
  const [snapshots, setSnapshots] = useState<SensorSnapshot[]>([]);
  const [sensors, setSensors] = useState<SensorItem[]>(DEFAULT_SENSORS);
  const [loading, setLoading] = useState(true);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedSensorIds, setSelectedSensorIds] = useState<Set<string>>(new Set());

  // Modals state
  const [activeChartSensor, setActiveChartSensor] = useState<SensorItem | null>(null);
  const [activeThresholdSensor, setActiveThresholdSensor] = useState<SensorItem | null>(null);
  const [showLogSnapshotModal, setShowLogSnapshotModal] = useState(false);
  const [rawPayloadSnapshot, setRawPayloadSnapshot] = useState<SensorSnapshot | null>(null);

  // New Snapshot Form
  const [newSnapshotType, setNewSnapshotType] = useState('OBD2_TELEMETRY');
  const [newSnapshotPayload, setNewSnapshotPayload] = useState('{\n  "fuel_liters": 185.4,\n  "coolant_temp_c": 88.5,\n  "voltage": 24.4,\n  "rpm": 1850,\n  "oil_pressure_bar": 4.2\n}');
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const rows: SensorSnapshot[] = await apiFetch(`/v1/tracking/vehicles/${vehicleId}/sensor_snapshots`);
      setSnapshots(rows || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live polling effect when isLiveStreaming is on
  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      // Subtle live jitter to simulate real telemetry fluctuation
      setSensors(prev =>
        prev.map(s => {
          let jitter = 0;
          if (s.category === 'powertrain' && s.unit === 'RPM') {
            jitter = (Math.random() - 0.5) * 40;
          } else if (s.unit === '°C') {
            jitter = (Math.random() - 0.5) * 0.4;
          } else if (s.unit === 'V') {
            jitter = (Math.random() - 0.5) * 0.1;
          } else if (s.unit === 'L/h') {
            jitter = (Math.random() - 0.5) * 0.3;
          }
          const nextVal = Math.max(s.minScale, Math.min(s.maxScale, Number((s.value + jitter).toFixed(1))));
          const nextSpark = [...s.sparkline.slice(1), nextVal];

          let nextStatus: 'nominal' | 'warning' | 'critical' = 'nominal';
          if (nextVal > s.maxWarning || nextVal < s.minWarning) nextStatus = 'warning';
          if (nextVal > s.maxSafe || nextVal < s.minSafe) nextStatus = 'critical';

          return {
            ...s,
            value: nextVal,
            formattedValue: s.unit === 'L' && s.id.includes('fuel') ? `${nextVal} L (${Math.round((nextVal / s.maxScale) * 100)}%)` : `${nextVal} ${s.unit}`,
            status: nextStatus,
            sparkline: nextSpark,
            lastUpdated: 'Just now',
          };
        })
      );
    }, 4000);
    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  // Filtered sensor list
  const filteredSensors = useMemo(() => {
    return sensors.filter(s => {
      const matchesCat = selectedCategory === 'all' || s.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;
      const matchesSearch =
        !search.trim() ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.categoryLabel.toLowerCase().includes(search.toLowerCase()) ||
        (s.details && s.details.toLowerCase().includes(search.toLowerCase()));
      return matchesCat && matchesStatus && matchesSearch;
    });
  }, [sensors, selectedCategory, selectedStatus, search]);

  // Export CSV
  function handleExportCsv() {
    const headers = 'Sensor Code,Sensor Name,Category,Current Value,Unit,Min Safe,Max Safe,Status,Last Updated,Details\n';
    const rows = filteredSensors
      .map(s => `"${s.code}","${s.name}","${s.categoryLabel}","${s.value}","${s.unit}","${s.minSafe}","${s.maxSafe}","${s.status}","${s.lastUpdated}","${s.details || ''}"`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vehicle-${vehicleId}-sensor-telemetry.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Handle Record New Snapshot
  async function handleCreateSnapshot() {
    setSavingSnapshot(true);
    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(newSnapshotPayload);
      } catch {
        parsedPayload = { raw: newSnapshotPayload };
      }
      await apiFetch(`/v1/tracking/vehicles/${vehicleId}/sensor_snapshots`, {
        method: 'POST',
        body: JSON.stringify({
          snapshot_type: newSnapshotType,
          payload: parsedPayload,
          recorded_at: new Date().toISOString(),
        }),
      });
      setShowLogSnapshotModal(false);
      showAlert('Sensor snapshot recorded to telemetry storage.');
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save snapshot.');
    } finally {
      setSavingSnapshot(false);
    }
  }

  const activeAlertCount = sensors.filter(s => s.status === 'warning' || s.status === 'critical').length;
  const primaryFuel = sensors.find(s => s.id === 'sen-fuel-1');
  const coolantTemp = sensors.find(s => s.id === 'sen-temp-coolant');
  const systemVolt = sensors.find(s => s.id === 'sen-elec-volt');
  const engineRpm = sensors.find(s => s.id === 'sen-rpm');

  const allSelected = filteredSensors.length > 0 && filteredSensors.every(s => selectedSensorIds.has(s.id));
  function toggleSelectAll() {
    if (allSelected) setSelectedSensorIds(new Set());
    else setSelectedSensorIds(new Set(filteredSensors.map(s => s.id)));
  }
  function toggleSelectOne(id: string) {
    setSelectedSensorIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Subtitle & Top Control Bar (Dreamscore Style) ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            Vehicle IoT Telemetry & Sensor Channels
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
            {sensors.length} calibrated channels · {activeAlertCount === 0 ? 'All parameters within safety thresholds' : `${activeAlertCount} active threshold warning(s)`} · {snapshots.length} persisted DLR snapshots
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live Stream Pulse Switch */}
          <button
            type="button"
            onClick={() => setIsLiveStreaming(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 'var(--r)',
              border: `1px solid ${isLiveStreaming ? 'var(--green)' : 'var(--border)'}`,
              background: isLiveStreaming ? 'var(--green-l)' : 'var(--bg)',
              color: isLiveStreaming ? 'var(--green)' : 'var(--ink3)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isLiveStreaming ? 'var(--green)' : 'var(--ink3)',
                boxShadow: isLiveStreaming ? '0 0 0 3px rgba(16, 185, 129, 0.2)' : 'none',
              }}
            />
            {isLiveStreaming ? 'Live Polling Active' : 'Polling Paused'}
          </button>

          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Icon name="download" size={13} /> Export CSV
          </Button>

          <Button size="sm" onClick={() => setShowLogSnapshotModal(true)}>
            <Icon name="plus" size={13} /> Log Snapshot
          </Button>
        </div>
      </div>

      {/* ── 4-Column Hero KPI Cards (Dreamscore Products Metric Grid) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {/* Card 1: Active Sensors & Health */}
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <FeaturedIcon variant="brand" size="md" shape="circle">
              <Icon name="activity" size={18} />
            </FeaturedIcon>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'var(--green-l)', padding: '2px 8px', borderRadius: 12 }}>
              ↑ 99.8% Signal
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {sensors.length} Channels
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
              Active IoT Telemetry
            </div>
          </div>
          {/* Subtle bottom colored line */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--teal)' }} />
        </div>

        {/* Card 2: Powertrain & Engine */}
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <FeaturedIcon variant="success" size="md" shape="circle">
              <Icon name="bolt" size={18} />
            </FeaturedIcon>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'var(--green-l)', padding: '2px 8px', borderRadius: 12 }}>
              ● Engine Active
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {coolantTemp ? `${coolantTemp.value}°C` : '88.5°C'}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
              Coolant Temp · {engineRpm ? `${engineRpm.value} RPM` : '1,850 RPM'}
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--green)' }} />
        </div>

        {/* Card 3: Fuel & Fluid Levels */}
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <FeaturedIcon variant="brand" size="md" shape="circle">
              <Icon name="container" size={18} />
            </FeaturedIcon>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 12 }}>
              74% Capacity
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {primaryFuel ? `${primaryFuel.value} L` : '185.4 L'}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
              Fuel Remaining · ~680 km Range
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--gold)' }} />
        </div>

        {/* Card 4: Electrical & Battery */}
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <FeaturedIcon variant="info" size="md" shape="circle">
              <Icon name="zap" size={18} />
            </FeaturedIcon>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'var(--green-l)', padding: '2px 8px', borderRadius: 12 }}>
              ↑ Charging Stable
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {systemVolt ? `${systemVolt.value} V` : '24.4 V'}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
              System Voltage · 24V Commercial
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--teal)' }} />
        </div>
      </div>

      {/* ── Filter Toolbar & Control Bar (Dreamscore Pattern) ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Category Dropdown */}
          <div style={{ width: 190 }}>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Dropdown */}
          <div style={{ width: 180 }}>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(selectedCategory !== 'all' || selectedStatus !== 'all' || search.trim()) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedStatus('all');
                setSearch('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--teal)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Reset filters
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Search Box */}
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sensor, CAN code…"
            style={{ width: 240, fontSize: 12.5 }}
          />

          {/* View Mode Toggle Switcher (List vs Visual Cards) */}
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 'var(--r)', padding: 3, border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: viewMode === 'table' ? 'var(--white)' : 'transparent',
                color: viewMode === 'table' ? 'var(--teal)' : 'var(--ink3)',
                boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icon name="list" size={13} /> Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: viewMode === 'cards' ? 'var(--white)' : 'transparent',
                color: viewMode === 'cards' ? 'var(--teal)' : 'var(--ink3)',
                boxShadow: viewMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icon name="grid" size={13} /> Gauges
            </button>
          </div>
        </div>
      </div>

      {/* ── Table View Mode (Dreamscore Products Table Pattern) ── */}
      {viewMode === 'table' && (
        <SectionCard title={`Calibrated Telemetry Sensors (${filteredSensors.length})`} padded={false} collapsible={false}>
          {filteredSensors.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
              No sensor telemetry channels match your filter criteria.
            </div>
          ) : (
            <div className="rtbl-wrap">
              <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                      />
                    </th>
                    {['Sensor / Telemetry Channel', 'Category', 'Current Reading', 'Operating Range', 'Status', '24h Trend', 'Safe Bounds', 'Sync', 'Actions'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: 'var(--ink3)',
                          background: 'var(--bg)',
                          borderBottom: '1px solid var(--border)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSensors.map(sensor => {
                    const isSelected = selectedSensorIds.has(sensor.id);
                    // Calculate gauge percentage
                    const pct = Math.max(0, Math.min(100, Math.round(((sensor.value - sensor.minScale) / (sensor.maxScale - sensor.minScale)) * 100)));

                    return (
                      <tr
                        key={sensor.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isSelected ? 'var(--teal-l)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '12px 14px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(sensor.id)}
                            style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                          />
                        </td>

                        {/* Sensor Name & Code */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 'var(--r-sm)',
                                background: 'var(--bg)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--teal)',
                                border: '1px solid var(--border)',
                                flexShrink: 0,
                              }}
                            >
                              <Icon
                                name={
                                  sensor.category === 'fuel'
                                    ? 'container'
                                    : sensor.category === 'thermal'
                                    ? 'cloudRain'
                                    : sensor.category === 'electrical'
                                    ? 'zap'
                                    : sensor.category === 'tpms'
                                    ? 'disc' as any
                                    : 'activity'
                                }
                                size={16}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                                {sensor.name}
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'monospace' }}>
                                {sensor.code}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td style={{ padding: '12px 14px' }}>
                          <Badge variant="brand">{sensor.categoryLabel}</Badge>
                        </td>

                        {/* Current Value */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
                            {sensor.formattedValue}
                          </span>
                        </td>

                        {/* Operating Range Level Bar */}
                        <td style={{ padding: '12px 14px', minWidth: 140 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink3)' }}>
                              <span>{sensor.minScale}</span>
                              <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{pct}%</span>
                              <span>{sensor.maxScale}</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: sensor.status === 'critical' ? 'var(--red)' : sensor.status === 'warning' ? 'var(--gold)' : 'var(--teal)',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Status Pill Badge with Dot (Dreamscore Style) */}
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 9px',
                              borderRadius: 12,
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: sensor.status === 'critical' ? 'var(--red-l)' : sensor.status === 'warning' ? 'var(--gold-l)' : 'var(--green-l)',
                              color: sensor.status === 'critical' ? 'var(--red)' : sensor.status === 'warning' ? 'var(--gold)' : 'var(--green)',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: sensor.status === 'critical' ? 'var(--red)' : sensor.status === 'warning' ? 'var(--gold)' : 'var(--green)',
                              }}
                            />
                            {sensor.status === 'nominal' ? 'Nominal' : sensor.status === 'warning' ? 'Warning' : sensor.status === 'critical' ? 'Critical' : 'Offline'}
                          </span>
                        </td>

                        {/* 24h Inline Sparkline */}
                        <td style={{ padding: '12px 14px' }}>
                          <svg width="70" height="22" style={{ overflow: 'visible' }}>
                            {(() => {
                              const min = Math.min(...sensor.sparkline);
                              const max = Math.max(...sensor.sparkline);
                              const range = max - min || 1;
                              const points = sensor.sparkline
                                .map((val, idx) => {
                                  const x = (idx / (sensor.sparkline.length - 1)) * 68;
                                  const y = 20 - ((val - min) / range) * 16;
                                  return `${x},${y}`;
                                })
                                .join(' ');
                              const isRising = sensor.sparkline[sensor.sparkline.length - 1] >= sensor.sparkline[0];
                              const color = isRising ? 'var(--green)' : 'var(--teal)';
                              return (
                                <>
                                  <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
                                  <circle
                                    cx={(sensor.sparkline.length - 1) * (68 / (sensor.sparkline.length - 1))}
                                    cy={20 - ((sensor.sparkline[sensor.sparkline.length - 1] - min) / range) * 16}
                                    r="2.5"
                                    fill={color}
                                  />
                                </>
                              );
                            })()}
                          </svg>
                        </td>

                        {/* Safe Bounds */}
                        <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                          {sensor.minSafe} – {sensor.maxSafe} {sensor.unit}
                        </td>

                        {/* Sync Time */}
                        <td style={{ padding: '12px 14px', fontSize: 11.5, color: 'var(--ink3)' }}>
                          {sensor.lastUpdated}
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActiveChartSensor(sensor)}
                              title="View Telemetry Time Series"
                            >
                              <Icon name="barChart2" size={12} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActiveThresholdSensor(sensor)}
                              title="Configure Thresholds"
                            >
                              <Icon name="settings" size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Cards / Gauge Grid Mode ── */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {filteredSensors.map(sensor => {
            const pct = Math.max(0, Math.min(100, Math.round(((sensor.value - sensor.minScale) / (sensor.maxScale - sensor.minScale)) * 100)));
            return (
              <div
                key={sensor.id}
                style={{
                  background: 'var(--white)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{sensor.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'monospace' }}>{sensor.code}</div>
                  </div>
                  <Badge variant={sensor.status === 'critical' ? 'error' : sensor.status === 'warning' ? 'warning' : 'success'}>
                    {sensor.status.toUpperCase()}
                  </Badge>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                    {sensor.formattedValue}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Safe: {sensor.minSafe} – {sensor.maxSafe} {sensor.unit}
                  </span>
                </div>

                {/* Gauge Progress Bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)' }}>
                    <span>Min: {sensor.minScale}</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{pct}%</span>
                    <span>Max: {sensor.maxScale}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: sensor.status === 'critical' ? 'var(--red)' : sensor.status === 'warning' ? 'var(--gold)' : 'var(--teal)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Updated {sensor.lastUpdated}</span>
                  <Button size="sm" variant="outline" onClick={() => setActiveChartSensor(sensor)}>
                    <Icon name="barChart2" size={12} /> Trends
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Persisted Telemetry Snapshots History (from API) ── */}
      <SectionCard
        title={`Persisted Telemetry History Log (${snapshots.length} Records)`}
        padded={false}
        collapsible={false}
        action={
          <Button size="sm" variant="outline" onClick={loadData}>
            <Icon name="refresh" size={12} /> Reload Log
          </Button>
        }
      >
        {snapshots.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
            No raw sensor snapshots recorded yet. Click <strong>+ Log Snapshot</strong> above to register an IoT telemetry event.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Snapshot Event ID', 'Protocol / Snapshot Type', 'Payload Data Summary', 'Recorded Timestamp', 'Raw Data'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'var(--ink3)',
                        background: 'var(--bg)',
                        borderBottom: '1px solid var(--border)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.slice(0, 15).map(s => {
                  const payloadStr = typeof s.payload === 'string' ? s.payload : JSON.stringify(s.payload);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>
                        {s.id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant="brand">{s.snapshot_type}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {payloadStr}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                        {new Date(s.recorded_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Button size="sm" variant="ghost" onClick={() => setRawPayloadSnapshot(s)}>
                          <Icon name="eye" size={12} /> Inspect JSON
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Modal 1: Live Telemetry Time Series Visualizer ── */}
      {activeChartSensor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setActiveChartSensor(null)}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: 620,
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                  {activeChartSensor.name} — Telemetry Trend
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  {activeChartSensor.code} · Normal Operating Bounds: {activeChartSensor.minSafe} to {activeChartSensor.maxSafe} {activeChartSensor.unit}
                </div>
              </div>
              <button
                onClick={() => setActiveChartSensor(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {/* Time Series SVG Graph */}
            <div
              style={{
                background: 'var(--bg)',
                borderRadius: 'var(--r)',
                padding: '20px',
                border: '1px solid var(--border)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--ink2)' }}>Current: <strong>{activeChartSensor.formattedValue}</strong></span>
                <span style={{ color: 'var(--ink3)' }}>Safety Zone: <strong>{activeChartSensor.minSafe} – {activeChartSensor.maxSafe} {activeChartSensor.unit}</strong></span>
              </div>

              <svg width="100%" height="160" viewBox="0 0 500 160" style={{ overflow: 'visible' }}>
                {(() => {
                  const pts = activeChartSensor.sparkline;
                  const min = Math.min(...pts, activeChartSensor.minScale);
                  const max = Math.max(...pts, activeChartSensor.maxScale);
                  const range = max - min || 1;

                  const polylineCoords = pts
                    .map((val, idx) => {
                      const x = (idx / (pts.length - 1)) * 480 + 10;
                      const y = 140 - ((val - min) / range) * 120;
                      return `${x},${y}`;
                    })
                    .join(' ');

                  return (
                    <>
                      {/* Grid Lines */}
                      <line x1="10" y1="20" x2="490" y2="20" stroke="var(--border)" strokeDasharray="3 3" />
                      <line x1="10" y1="80" x2="490" y2="80" stroke="var(--border)" strokeDasharray="3 3" />
                      <line x1="10" y1="140" x2="490" y2="140" stroke="var(--border)" />

                      {/* Sparkline Curve */}
                      <polyline fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polylineCoords} />

                      {/* Data point dots */}
                      {pts.map((val, idx) => {
                        const x = (idx / (pts.length - 1)) * 480 + 10;
                        const y = 140 - ((val - min) / range) * 120;
                        return (
                          <g key={idx}>
                            <circle cx={x} cy={y} r="4" fill="var(--white)" stroke="var(--teal)" strokeWidth="2" />
                            <text x={x} y={y - 8} fontSize="10" textAnchor="middle" fill="var(--ink2)" fontWeight="600">
                              {val}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="outline" onClick={() => setActiveChartSensor(null)}>
                Close Viewer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Threshold & Calibration Settings ── */}
      {activeThresholdSensor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setActiveThresholdSensor(null)}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: 520,
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                  Calibrate Thresholds — {activeThresholdSensor.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  Configure automatic alerting limits and telematics safety bounds.
                </div>
              </div>
              <button onClick={() => setActiveThresholdSensor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Min Safety Limit ({activeThresholdSensor.unit})
                </label>
                <Input
                  type="number"
                  defaultValue={activeThresholdSensor.minSafe}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setSensors(prev => prev.map(s => s.id === activeThresholdSensor.id ? { ...s, minSafe: v } : s));
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Max Safety Limit ({activeThresholdSensor.unit})
                </label>
                <Input
                  type="number"
                  defaultValue={activeThresholdSensor.maxSafe}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setSensors(prev => prev.map(s => s.id === activeThresholdSensor.id ? { ...s, maxSafe: v } : s));
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button
                onClick={() => {
                  setActiveThresholdSensor(null);
                  showAlert('Sensor threshold configuration updated.');
                }}
              >
                Save Thresholds
              </Button>
              <Button variant="outline" onClick={() => setActiveThresholdSensor(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 3: Record Sensor Snapshot ── */}
      {showLogSnapshotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowLogSnapshotModal(false)}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: 540,
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                  Log Telemetry / Sensor Snapshot
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  Persist a diagnostic snapshot event to the vehicle telematics registry.
                </div>
              </div>
              <button onClick={() => setShowLogSnapshotModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                Protocol / Snapshot Type
              </label>
              <Select value={newSnapshotType} onValueChange={setNewSnapshotType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OBD2_TELEMETRY">OBD-II / CAN-Bus J1939 Telemetry</SelectItem>
                  <SelectItem value="REEFER_COLD_CHAIN">Cold Chain Temperature Log</SelectItem>
                  <SelectItem value="FUEL_CONSUMPTION">Fuel Level & Flow Audit</SelectItem>
                  <SelectItem value="TPMS_TIRE_PRESSURE">TPMS Tire Pressure Scan</SelectItem>
                  <SelectItem value="ECU_DIAGNOSTIC_DTC">ECU Diagnostic Trouble Code (DTC)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                Payload (JSON)
              </label>
              <textarea
                value={newSnapshotPayload}
                onChange={e => setNewSnapshotPayload(e.target.value)}
                rows={6}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  padding: '10px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button disabled={savingSnapshot} onClick={handleCreateSnapshot}>
                {savingSnapshot ? 'Saving Snapshot…' : 'Record Snapshot'}
              </Button>
              <Button variant="outline" onClick={() => setShowLogSnapshotModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 4: Raw Payload Inspector ── */}
      {rawPayloadSnapshot && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setRawPayloadSnapshot(null)}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: 580,
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                  Payload Inspector — {rawPayloadSnapshot.snapshot_type}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  Recorded at {new Date(rawPayloadSnapshot.recorded_at).toLocaleString()}
                </div>
              </div>
              <button onClick={() => setRawPayloadSnapshot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <pre
              style={{
                background: '#1A1E24',
                color: '#A5D6A7',
                padding: '16px',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                overflowX: 'auto',
                maxHeight: 340,
                fontFamily: 'monospace',
                lineHeight: 1.5,
              }}
            >
              {typeof rawPayloadSnapshot.payload === 'string'
                ? rawPayloadSnapshot.payload
                : JSON.stringify(rawPayloadSnapshot.payload, null, 2)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="outline" onClick={() => setRawPayloadSnapshot(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
