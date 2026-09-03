import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

/**
 * Milestone 3 of decomposing SuperAdmin's "god admin" pages into per-domain
 * insights layers: moved out of SuperAdmin.tsx (was /admin/devices) into
 * NexusHR's own shell, SUPER_ADMIN-gated — this is biometric attendance
 * hardware (379_attendance_devices.sql), a NexusHR-domain concept, not an
 * Ondi one. Ondi's own "devices" means personal login/session devices
 * (OndiPersonalDevices.tsx, OndiSessions.tsx) — a different, unrelated data
 * model that happens to share the English word. See the Title Treatment
 * Audit-adjacent plan (Decompose SuperAdmin) for the full reasoning.
 *
 * Platform-owner "monitor, troubleshoot, audit" over every tenant's devices,
 * never "manage" — matches superadmin.routes.ts's own view/support-only
 * stance toward tenant leave/attendance elsewhere in that file. Backed by
 * GET /v1/superadmin/devices, unchanged by this move.
 */

interface PlatformDevice {
  id: string; name: string; provider: string; serial_number: string; status: string;
  location: string | null; last_heartbeat_at: string | null; last_sync_at: string | null; created_at: string;
  tenant_id: string; tenant_name: string; event_count: number;
}

const DEVICE_STATUS_TINT: Record<string, { bg: string; color: string; label: string }> = {
  online:       { bg: 'var(--green-l)', color: '#059669',    label: 'Online' },
  offline:      { bg: 'var(--bg)',      color: 'var(--ink3)', label: 'Offline' },
  unregistered: { bg: 'var(--bg)',      color: 'var(--ink3)', label: 'Awaiting first sync' },
  error:        { bg: 'var(--red-l)',   color: 'var(--red)',  label: 'Error' },
};
function PlatformDeviceStatusBadge({ status }: { status: string }) {
  const s = DEVICE_STATUS_TINT[status] ?? DEVICE_STATUS_TINT.unregistered;
  return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function relTimeShort(iso: string | null): string {
  if (!iso) return 'Never';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/* Same plain headers+children shape SuperAdmin.tsx's own local DataTable
   uses — kept local rather than shared, since this is the only table this
   page needs and the two are free to diverge later. */
function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rtbl-wrap">
      <table className="rtbl">
        <thead>
          <tr>
            {headers.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function TR({ children }: { children: React.ReactNode }) {
  return <tr>{children}</tr>;
}
function TD({ children, right, nowrap }: { children: React.ReactNode; right?: boolean; nowrap?: boolean }) {
  return <td style={{ textAlign: right ? 'right' : undefined, whiteSpace: nowrap ? 'nowrap' : undefined }}>{children}</td>;
}

export function SuperAdminAttendanceDevices() {
  const [devices, setDevices] = useState<PlatformDevice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');

  useEffect(() => {
    apiFetch('/v1/superadmin/devices')
      .then((res: any) => { setDevices(res?.data ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const filtered = devices.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.tenant_name.toLowerCase().includes(search.toLowerCase()) && !d.serial_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        crumbs={['NexusHR', 'Devices']}
        titlePlain="Attendance"
        titleEm="devices"
        subtitle={loaded ? `${devices.length} biometric terminal(s) registered across every tenant.` : 'Loading…'}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search device, tenant, serial…" className="input-field" style={{ width: '100%', paddingLeft: 34 }} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="input-field" style={{ width: 190 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="unregistered">Awaiting first sync</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loaded && devices.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
          No tenant has registered an attendance device yet.
        </div>
      ) : (
        <DataTable headers={['Device', 'Tenant', 'Provider', 'Serial', 'Location', 'Status', 'Last Sync', 'Punches']}>
          {filtered.map(d => (
            <TR key={d.id}>
              <TD nowrap>{d.name}</TD>
              <TD nowrap>{d.tenant_name}</TD>
              <TD nowrap>{d.provider}</TD>
              <TD nowrap><span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>{d.serial_number}</span></TD>
              <TD>{d.location || '—'}</TD>
              <TD><PlatformDeviceStatusBadge status={d.status} /></TD>
              <TD nowrap>{relTimeShort(d.last_sync_at)}</TD>
              <TD right>{d.event_count}</TD>
            </TR>
          ))}
        </DataTable>
      )}
    </div>
  );
}

export default SuperAdminAttendanceDevices;
