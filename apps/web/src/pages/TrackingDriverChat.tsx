import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { DriverChatPanel } from '../components/DriverChatPanel.js';

interface Driver { id: string; name: string; phone: string | null }

export const TrackingDriverChat: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/drivers').then((list: Driver[]) => {
      setDrivers(list);
      if (!driverId && list.length > 0) setDriverId(list[0].id);
    }).catch(() => setDrivers([]));
  }, []);

  const driver = drivers.find(d => d.id === driverId);

  return (
    <div style={{ padding: 24, display: 'flex', gap: 20, height: 'calc(100vh - 140px)', boxSizing: 'border-box' }}>
      <div style={{ width: 260, flexShrink: 0, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Driver Chat</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {drivers.map(d => (
            <div key={d.id} onClick={() => setDriverId(d.id)}
              style={{ padding: '12px 16px', cursor: 'pointer', background: driverId === d.id ? 'var(--teal-l)' : 'transparent', borderLeft: driverId === d.id ? '3px solid var(--teal)' : '3px solid transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{d.phone || 'No phone on file'}</div>
            </div>
          ))}
          {drivers.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--ink3)' }}>No drivers yet.</div>}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {driver
          ? <DriverChatPanel driverId={driver.id} driverName={driver.name} driverPhone={driver.phone} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9 }}>Select a driver to start chatting.</div>}
      </div>
    </div>
  );
};
