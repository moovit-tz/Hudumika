import React, { useState, useCallback, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import type { ShiftType, ShiftAssignment, Employee as ShiftEmployee } from '../../data/hrmData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { MultiSelectFilter } from '../../components/ui/filter-dropdown.js';
import { DatePicker } from '../../components/ui/date-picker.js';
import { Popover, PopoverAnchor, PopoverContent } from '../../components/ui/popover.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { SectionCard } from '../../components/SectionCard.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { Avatar, Badge, PageHeader, Card, TH, TD, Wrap, PrimaryBtn, ActionBtn, S, ini } from './shared.js';
/* ── Attendance Devices — Device Management (379_attendance_devices.sql) ── */

interface AttDevice {
  id: string; name: string; provider: string; serial_number: string; status: string;
  location: string | null; last_heartbeat_at: string | null; last_sync_at: string | null; created_at: string;
}
interface AttDeviceEnrollment {
  id: string; external_pin: string; method: string; user_id: string; user_name: string; created_at: string;
}
interface AttDeviceEvent {
  id: string; external_pin: string; user_id: string | null; user_name: string | null;
  punched_at: string; raw_status: string | null; processed: boolean;
}
interface AttDeviceSyncLog {
  id: string; started_at: string; finished_at: string | null;
  records_received: number; records_matched: number; status: string; error: string | null;
}

const DEVICE_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  online:       { bg: 'var(--green-l)', color: 'var(--green)', label: 'Online' },
  offline:      { bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', label: 'Offline' },
  unregistered: { bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', label: 'Awaiting first sync' },
  error:        { bg: 'var(--red-l)',  color: 'var(--red)',  label: 'Error' },
};
function DeviceStatusBadge({ status }: { status: string }) {
  const s = DEVICE_STATUS_STYLE[status] ?? DEVICE_STATUS_STYLE.unregistered;
  return <span style={{ padding: '2px 10px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>;
}
function relTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)} day(s) ago`;
}

export function DevicesPage() {
  const [devices, setDevices] = useState<AttDevice[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [justRegistered, setJustRegistered] = useState<{ name: string; serial_number: string; push_token: string; serverUrl: string } | null>(null);
  const [manageDevice, setManageDevice] = useState<AttDevice | null>(null);

  const loadDevices = useCallback(async () => {
    try { const res = await apiFetch('/v1/hr/attendance-devices'); if (Array.isArray(res)) setDevices(res); } catch { /* empty */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/staff');
      if (Array.isArray(data)) setStaff(data.map((u: any) => ({ id: u.id, name: u.name })));
    } catch { /* empty */ }
  }, []);
  useEffect(() => { loadDevices(); loadStaff(); }, [loadDevices, loadStaff]);

  async function registerDevice() {
    if (!newName.trim()) return;
    try {
      const res = await apiFetch('/v1/hr/attendance-devices', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), provider: 'zkteco', location: newLocation.trim() || undefined }),
      });
      setJustRegistered(res);
      setNewName(''); setNewLocation('');
      loadDevices();
    } catch (err: any) {
      showAlert(`Failed to register device: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function removeDevice(d: AttDevice) {
    if (!(await showConfirm(`Remove "${d.name}"? Its enrollments and punch history will be deleted.`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/hr/attendance-devices/${d.id}`, { method: 'DELETE' });
      if (manageDevice?.id === d.id) setManageDevice(null);
      loadDevices();
    } catch (err: any) {
      showAlert(`Failed to remove device: ${err?.message ?? 'Unknown error'}`);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      <PageHeader title="Attendance Devices" sub="Biometric terminals pushing real punches into Attendance — register a unit, enroll employees on it, and resolve unmatched punches.">
        <PrimaryBtn label="Register Device" icon="plus" onClick={() => { setJustRegistered(null); setShowRegister(true); }} />
      </PageHeader>

      <Wrap>
        <thead>
          <tr>
            <TH>Device</TH><TH>Provider</TH><TH>Serial</TH><TH>Location</TH><TH>Status</TH><TH>Last Sync</TH><TH right>Actions</TH>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No devices registered yet. Register one to get its push URL for a real ZKTeco unit's Server URL setting.
            </td></tr>
          )}
          {devices.map(d => (
            <tr key={d.id} className="hover-bg">
              <TD bold>{d.name}</TD>
              <TD>{d.provider}</TD>
              <TD mono muted>{d.serial_number}</TD>
              <TD muted>{d.location || '—'}</TD>
              <TD><DeviceStatusBadge status={d.status} /></TD>
              <TD muted>{relTime(d.last_sync_at)}</TD>
              <TD right>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button size="xs" variant="outline" onClick={() => setManageDevice(d)}>Manage</Button>
                  <Button size="xs" variant="outline" onClick={() => removeDevice(d)} style={{ color: 'var(--red)' }}>Remove</Button>
                </div>
              </TD>
            </tr>
          ))}
        </tbody>
      </Wrap>

      {/* Register Device drawer */}
      {showRegister && (
        <Sheet open onOpenChange={o => { if (!o) setShowRegister(false); }}>
          <SheetContent className="w-105 sm:max-w-105 flex flex-col p-0 gap-0">
            <SheetHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <SheetTitle style={{ fontSize: 16 }}>Register Device</SheetTitle>
            </SheetHeader>
            <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
              {justRegistered ? (
                <div>
                  <div style={{ padding: 14, borderRadius: 'var(--r)', background: 'var(--green-l)', border: '1px solid var(--green)', marginBottom: 18, fontSize: 12.5, color: 'var(--ink)' }}>
                    <strong>{justRegistered.name}</strong> is registered. Enter these into the physical unit's own menu (Comm → Cloud Server / ADMS) — the push token is shown only this once.
                  </div>
                  {([
                    ['Server URL', justRegistered.serverUrl],
                    ['Serial Number', justRegistered.serial_number],
                    ['Push Token', justRegistered.push_token],
                  ] as const).map(([label, val]) => (
                    <div key={label} style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</label>
                      <div style={{ padding: '9px 12px', borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5, wordBreak: 'break-all' }}>{val}</div>
                    </div>
                  ))}
                  <Button className="w-full" style={{ marginTop: 8 }} onClick={() => setShowRegister(false)}>Done</Button>
                </div>
              ) : (
                <form onSubmit={e => { e.preventDefault(); registerDevice(); }}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Device Name</label>
                    <input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Head Office Gate" required style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Provider</label>
                    <Select value="zkteco" onValueChange={() => {}}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="zkteco">ZKTeco (ADMS push)</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Location (optional)</label>
                    <input className="input-field" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Head Office — Main Gate" style={{ width: '100%' }} />
                  </div>
                  <Button type="submit" className="w-full" disabled={!newName.trim()}>Register Device</Button>
                </form>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {manageDevice && (
        <DeviceManageDrawer
          device={manageDevice}
          staff={staff}
          onClose={() => setManageDevice(null)}
        />
      )}
    </div>
  );
}

function DeviceManageDrawer({ device, staff, onClose }: {
  device: AttDevice; staff: { id: string; name: string }[]; onClose: () => void;
}) {
  const [enrollments, setEnrollments] = useState<AttDeviceEnrollment[]>([]);
  const [events, setEvents] = useState<AttDeviceEvent[]>([]);
  const [syncLogs, setSyncLogs] = useState<AttDeviceSyncLog[]>([]);
  const [enrollUserId, setEnrollUserId] = useState('');
  const [enrollPin, setEnrollPin] = useState('');
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');

  const load = useCallback(async () => {
    try { const r = await apiFetch(`/v1/hr/attendance-devices/${device.id}/enrollments`); if (Array.isArray(r)) setEnrollments(r); } catch { /* empty */ }
    try { const r = await apiFetch(`/v1/hr/attendance-devices/${device.id}/events`); if (Array.isArray(r)) setEvents(r); } catch { /* empty */ }
    try { const r = await apiFetch(`/v1/hr/attendance-devices/${device.id}/sync-logs`); if (Array.isArray(r)) setSyncLogs(r); } catch { /* empty */ }
  }, [device.id]);
  useEffect(() => { load(); }, [load]);

  async function addEnrollment() {
    if (!enrollUserId || !enrollPin.trim()) return;
    try {
      await apiFetch(`/v1/hr/attendance-devices/${device.id}/enrollments`, {
        method: 'POST', body: JSON.stringify({ userId: enrollUserId, externalPin: enrollPin.trim(), method: 'fingerprint' }),
      });
      setEnrollUserId(''); setEnrollPin('');
      load();
    } catch (err: any) {
      showAlert(`Failed to enroll: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function removeEnrollment(e: AttDeviceEnrollment) {
    if (!(await showConfirm(`Remove ${e.user_name}'s enrollment (PIN ${e.external_pin})?`, { variant: 'danger', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/hr/attendance-devices/${device.id}/enrollments/${e.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(`Failed to remove enrollment: ${err?.message ?? 'Unknown error'}`);
    }
  }

  async function assignOrphan(eventId: string) {
    if (!assignUserId) return;
    try {
      await apiFetch(`/v1/hr/attendance-devices/${device.id}/events/${eventId}/assign`, { method: 'PATCH', body: JSON.stringify({ userId: assignUserId }) });
      setAssigningEventId(null); setAssignUserId('');
      load();
    } catch (err: any) {
      showAlert(`Failed to assign punch: ${err?.message ?? 'Unknown error'}`);
    }
  }

  const staffOptions = staff.map(s => ({ value: s.id, label: s.name }));

  return (
    <>
      <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
        {/* Sheet's own Close (top-right X) already covers dismissal — no
            second, custom close button alongside it. */}
        <SheetContent className="w-130 sm:max-w-130 flex flex-col p-0 gap-0">
          <SheetHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <SheetTitle style={{ fontSize: 16 }}>{device.name}</SheetTitle>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Serial {device.serial_number} · <DeviceStatusBadge status={device.status} /></div>
          </SheetHeader>

        <div style={{ padding: 24, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Enrollments */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Enrolled Employees</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <Combobox options={staffOptions} value={enrollUserId} onChange={setEnrollUserId} placeholder="Select employee…" />
              </div>
              <input className="input-field" value={enrollPin} onChange={e => setEnrollPin(e.target.value)} placeholder="Device PIN" style={{ width: 110 }} />
              <Button size="sm" variant="outline" disabled={!enrollUserId || !enrollPin.trim()} onClick={addEnrollment}>Add</Button>
            </div>
            {enrollments.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No employees enrolled on this device yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enrollments.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                    <PersonAvatar userId={e.user_id} name={e.user_name} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{e.user_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>PIN {e.external_pin} · {e.method}</div>
                    </div>
                    <Button size="xs" variant="outline" onClick={() => removeEnrollment(e)} style={{ color: 'var(--red)' }}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw punch events — including unmatched/orphan punches to resolve */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Recent Punches</div>
            {events.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No punches received from this device yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {events.slice(0, 30).map(ev => (
                  <div key={ev.id} style={{ padding: '7px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: ev.user_id ? 'transparent' : 'var(--gold-l)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                        {ev.user_name ?? <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Unmatched PIN {ev.external_pin}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(ev.punched_at).toLocaleString()}</div>
                    </div>
                    {!ev.user_id && (
                      assigningEventId === ev.id ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <div style={{ flex: 1 }}>
                            <Combobox options={staffOptions} value={assignUserId} onChange={setAssignUserId} placeholder="Assign to…" />
                          </div>
                          <Button size="xs" disabled={!assignUserId} onClick={() => assignOrphan(ev.id)}>Save</Button>
                          <Button size="xs" variant="outline" onClick={() => setAssigningEventId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="xs" variant="outline" style={{ marginTop: 6 }} onClick={() => { setAssigningEventId(ev.id); setAssignUserId(''); }}>
                          Assign to employee
                        </Button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sync history */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Sync History</div>
            {syncLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No sync attempts yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {syncLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--ink)' }}>{new Date(log.started_at).toLocaleString()}</span>
                    <span style={{ color: log.status === 'error' ? 'var(--red)' : 'var(--ink3)' }}>
                      {log.records_matched}/{log.records_received} matched{log.status === 'error' ? ` — ${log.error}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function ShiftsPage() {
  const isMobile = useIsMobile();
  // Start empty and fill from the API — never seed with the sample fixtures,
  // which would render fabricated staff and shift types as if they were the
  // tenant's real roster/schedule.
  const [employees, setEmployees] = useState<ShiftEmployee[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday of current week
    return d;
  });

  const [filterEmp, setFilterEmp] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEmpIds, setBulkEmpIds] = useState<string[]>([]);

  // shift assign modal state
  const [activeCell, setActiveCell] = useState<{ empId: string, date: string } | null>(null);

  const loadStaff = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/staff');
      if (Array.isArray(data) && data.length > 0) {
        setEmployees(data.map((u: any): ShiftEmployee => ({
          id: u.id, name: u.name, department: u.dept || 'General', role: u.role, avatar: ini(u.name),
        })));
      }
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);

  const loadShiftTypes = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/shifts');
      if (Array.isArray(data) && data.length > 0) {
        setShiftTypes(data.map((s: any): ShiftType => ({
          id: s.id, name: s.name, startTime: s.start_time, endTime: s.end_time, color: s.color || 'var(--blue)',
        })));
      }
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/shift-assignments');
      if (Array.isArray(data)) {
        setAssignments(data.map((a: any): ShiftAssignment => ({
          id: a.id, employeeId: a.user_id, date: String(a.date).slice(0, 10), shiftId: a.shift_id,
        })));
      }
    } catch { /* keep empty */ }
  }, []);

  useEffect(() => { loadStaff(); loadShiftTypes(); loadAssignments(); }, [loadStaff, loadShiftTypes, loadAssignments]);

  // Generate days
  const days: Date[] = [];
  const numDays = view === 'week' ? 7 : 30;
  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }

  // Filter employees
  const filteredEmps = employees.filter(e => {
    if (filterEmp && e.id !== filterEmp) return false;
    if (filterDept && e.department !== filterDept) return false;
    return true;
  });

  const getDayFormat = (d: Date) => d.toISOString().split('T')[0];

  return (
    <div style={{ flex:1, overflowY:'auto', display: 'flex', flexDirection: 'column' }}>
      <PageHeader icon="timer" title="Shift Roster" sub="Manage employee shift schedules" backTo="/nexushr">
        <Button variant="outline" onClick={() => { setBulkEmpIds([]); setShowBulk(true); }}>
          <Icon name="users" size={14} /> Assign Bulk Shifts
        </Button>
      </PageHeader>

      {/* Filters & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: 'var(--white)', padding: '12px 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 180 }}>
            <Combobox
              options={[{ value: '', label: 'All Employees' }, ...employees.map(e => ({ value: e.id, label: e.name }))]}
              value={filterEmp} onChange={setFilterEmp}
              triggerClassName="h-8 text-xs"
            />
          </div>
          <Select value={filterDept || '__all__'} onValueChange={v => setFilterDept(v === '__all__' ? '' : v)}>
            <SelectTrigger className="input-field" style={{ width: 160, height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Departments</SelectItem>
              {Array.from(new Set(employees.map(e => e.department))).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterEmp || filterDept) && (
            <Button size="sm" variant="outline" onClick={() => { setFilterEmp(''); setFilterDept(''); }}>Clear</Button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="xs" variant="outline" onClick={() => {
              const d = new Date(startDate);
              d.setDate(d.getDate() - (view === 'week' ? 7 : 30));
              setStartDate(d);
            }}><Icon name="chevronLeft" size={14} /></Button>
            
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 160, textAlign: 'center' }}>
              {startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {days[days.length-1].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            
            <Button size="xs" variant="outline" onClick={() => {
              const d = new Date(startDate);
              d.setDate(d.getDate() + (view === 'week' ? 7 : 30));
              setStartDate(d);
            }}><Icon name="chevronRight" size={14} /></Button>
          </div>
          
          <Select value={view} onValueChange={v => setView(v as any)}>
            <SelectTrigger className="input-field" style={{ width: 120, height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Weekly View</SelectItem>
              <SelectItem value="month">Monthly View</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1 }}>
      <SectionCard padded={false}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: view === 'week' ? 800 : 2000 }}>
          <thead>
            <tr>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', left: 0, zIndex: 10, width: 200, textAlign: 'left', fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase' }}>Employee</th>
              {days.map(d => (
                <th key={d.toISOString()} style={{ padding: '8px', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmps.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', borderRight: '1px solid var(--border)', background: 'var(--white)', position: 'sticky', left: 0, zIndex: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PersonAvatar userId={emp.id} name={emp.name} size={32} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{emp.role}</div>
                    </div>
                  </div>
                </td>
                {days.map(d => {
                  const dStr = getDayFormat(d);
                  const a = assignments.find(x => x.employeeId === emp.id && x.date === dStr);
                  const sType = a?.shiftId ? shiftTypes.find(s => s.id === a.shiftId) : null;
                  
                  return (
                    <Popover key={dStr} open={activeCell?.empId === emp.id && activeCell.date === dStr} onOpenChange={o => { if (!o) setActiveCell(null); }}>
                      <PopoverAnchor asChild>
                        <td onClick={() => setActiveCell({ empId: emp.id, date: dStr })} style={{ padding: 4, borderRight: '1px solid var(--border)', cursor: 'pointer', verticalAlign: 'top' }}>
                          <div style={{ minHeight: 46, borderRadius: 'var(--r-sm)', border: '1px dashed transparent', padding: 6, transition: 'border 0.2s', ...((!sType) ? { ':hover': { borderColor: 'var(--border)' } } : {}) } as any}>
                            {sType ? (
                              <div style={{ background: `${sType.color}15`, border: `1px solid ${sType.color}40`, borderRadius: 'var(--r-sm)', padding: '4px 6px' }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: sType.color, marginBottom: 2 }}>{sType.name}</div>
                                <div style={{ fontSize: 9, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>{sType.startTime} - {sType.endTime}</div>
                              </div>
                            ) : (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="cell-hover">
                                <Icon name="plus" size={14} color="var(--ink3)" />
                              </div>
                            )}
                          </div>
                        </td>
                      </PopoverAnchor>
                      <PopoverContent align="center" className="w-55 p-3" onClick={e => e.stopPropagation()} onOpenAutoFocus={e => e.preventDefault()}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assign Shift</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {shiftTypes.map(st => (
                            <button key={st.id} type="button" onClick={async (e) => {
                              e.stopPropagation();
                              setAssignments(prev => [...prev.filter(x => !(x.employeeId === emp.id && x.date === dStr)), { id: `A_${Date.now()}`, employeeId: emp.id, date: dStr, shiftId: st.id }]);
                              setActiveCell(null);
                              try { await apiFetch('/v1/hr/shift-assignments', { method: 'POST', body: JSON.stringify({ user_id: emp.id, shift_id: st.id, date: dStr }) }); loadAssignments(); } catch (error: any) { loadAssignments(); showAlert(error?.message || 'Could not assign the shift.', { variant: 'error' }); }
                            }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py-sm) 8px', borderRadius: 'var(--r-sm)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} className="hover-bg">
                              <div style={{ width: 10, height: 10, borderRadius: 'var(--r-sm)', background: st.color }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{st.name}</span>
                            </button>
                          ))}
                          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                          <button type="button" onClick={async (e) => {
                            e.stopPropagation();
                            setAssignments(prev => prev.filter(x => !(x.employeeId === emp.id && x.date === dStr)));
                            setActiveCell(null);
                            try { await apiFetch('/v1/hr/shift-assignments', { method: 'POST', body: JSON.stringify({ user_id: emp.id, shift_id: null, date: dStr }) }); loadAssignments(); } catch (error: any) { loadAssignments(); showAlert(error?.message || 'Could not clear the shift.', { variant: 'error' }); }
                          }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py-sm) 8px', borderRadius: 'var(--r-sm)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} className="hover-bg">
                            <Icon name="x" size={12} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Clear Shift</span>
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </SectionCard>
      </div>

      {/* Bulk Assign Drawer */}
      <Sheet open={showBulk} onOpenChange={o => { if (!o) setShowBulk(false); }}>
        <SheetContent className="w-100 sm:max-w-100 flex flex-col p-0 gap-0">
          <SheetHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <SheetTitle style={{ fontSize: 16 }}>Assign Bulk Shifts</SheetTitle>
          </SheetHeader>
            <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
              <form onSubmit={async e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const emps = bulkEmpIds;
                const sDate = fd.get('startDate') as string;
                const eDate = fd.get('endDate') as string;
                const sId = fd.get('shiftId') as string;
                if (emps.length && sDate && eDate && sId) {
                  setShowBulk(false);
                  try {
                    const from = new Date(sDate);
                    const to   = new Date(eDate);
                    for (const uid of emps) {
                      const d = new Date(from);
                      while (d <= to) {
                        await apiFetch('/v1/hr/shift-assignments', { method: 'POST', body: JSON.stringify({ user_id: uid, shift_id: sId, date: d.toISOString().split('T')[0] }) });
                        d.setDate(d.getDate() + 1);
                      }
                    }
                    loadAssignments();
                  } catch (error: any) { showAlert(error?.message || 'Could not assign the selected shifts.', { variant: 'error' }); }
                }
              }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Select Employees</label>
                  <MultiSelectFilter
                    label="Employees"
                    options={employees.map(e => ({ value: e.id, label: `${e.name} (${e.department})` }))}
                    values={bulkEmpIds} onChange={setBulkEmpIds}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Start Date</label>
                    <DatePicker name="startDate" defaultDate={startDate} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>End Date</label>
                    <DatePicker name="endDate" defaultDate={days[days.length-1]} />
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Assign Shift</label>
                  <Select name="shiftId" required>
                    <SelectTrigger className="input-field"><SelectValue placeholder="-- Select Shift --" /></SelectTrigger>
                    <SelectContent>
                      {shiftTypes.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full">Assign Shifts</Button>
              </form>
            </div>
        </SheetContent>
      </Sheet>

      {/* Global styles for hover */}
      <style dangerouslySetInnerHTML={{__html: `
        .hover-bg:hover { background: var(--bg) !important; }
        td:hover .cell-hover { opacity: 1 !important; }
      `}} />
      
    </div>
  );
}

type HolidayRow = {
  id?: string; date: string; name: string; type: string;
  localName?: string | null; country?: string | null; category?: string;
  /** Follows a moon sighting — the date can still move by a day. */
  provisional?: boolean;
  source?: string;
};

export function HolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // The outcome of the last sync, kept on the page rather than thrown into an
  // alert that vanishes. A count nobody can re-read is a count nobody trusts.
  const [syncNote, setSyncNote] = useState<{ ok: boolean; text: string; problems: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/holidays');
      const data = Array.isArray(res) ? res : [];
      setHolidays(data.map((h: any) => ({
        id: h.id, date: String(h.date).slice(0,10), name: h.name, type: h.type,
        localName: h.local_name, country: h.country, category: h.category,
        provisional: !!h.is_provisional, source: h.source,
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setHolidays(prev => prev.filter(h => h.id !== id));
    try { await apiFetch(`/v1/hr/holidays/${id}`, { method: 'DELETE' }); } catch (error: any) { load(); showAlert(error?.message || 'Could not delete the holiday.', { variant: 'error' }); }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const r = await apiFetch('/v1/hr/holidays/sync', { method: 'POST' });
      await load();
      // Report what happened. The previous version said "synchronized
      // successfully" whatever came back — including a sync that reached no
      // provider and added nothing at all.
      const bits: string[] = [];
      if (r?.added) bits.push(`${r.added} added`);
      if (r?.updated) bits.push(`${r.updated} updated`);
      if (r?.preservedManual) bits.push(`${r.preservedManual} of your own left untouched`);
      setSyncNote({
        ok: !!r?.ok,
        text: r?.ok
          ? `${(r.countries ?? []).join(', ')} · ${(r.years ?? []).join(' and ')} — ${bits.join(', ') || 'already up to date'}`
          : 'Nothing was synchronised.',
        problems: Array.isArray(r?.problems) ? r.problems : [],
      });
    } catch (e: any) {
      setSyncNote({ ok: false, text: 'The sync could not run.', problems: [e?.message ?? String(e)] });
    } finally {
      setSyncing(false);
    }
  }

  // Days off first, then observances, then anything the tenant added itself.
  // An international observance is not a day off and must not sit in the same
  // list as one.
  const grouped: Record<string, HolidayRow[]> = {
    'Public': holidays.filter(h => h.category !== 'INTERNATIONAL' && h.type !== 'Company'),
    'Company': holidays.filter(h => h.type === 'Company'),
    'Observances (still working days)': holidays.filter(h => h.category === 'INTERNATIONAL'),
  };
  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="sun" title="Public Holidays" sub="Public and company-designated holidays" backTo="/nexushr">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={handleSync} disabled={syncing} style={{ whiteSpace: 'nowrap' }}>
            {syncing ? "Syncing..." : "Sync Public Holidays"}
          </Button>
          <PrimaryBtn label="Add Holiday" icon="plus" onClick={() => setShowNew(v => !v)} />
        </div>
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const date = fd.get('date') as string;
            const name = fd.get('name') as string;
            const type = fd.get('type') as string;
            if (!date || !name) return;
            try {
              await apiFetch('/v1/hr/holidays', { method: 'POST', body: JSON.stringify({ date, name, type }) });
              setShowNew(false); load();
            } catch (error: any) { showAlert(error?.message || 'Could not add the holiday.', { variant: 'error' }); }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Date</label>
              <DatePicker name="date" triggerClassName="w-auto" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Holiday Name</label>
              <input name="name" required placeholder="e.g. Founders Day" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Type</label>
              <Select name="type" defaultValue="Public">
                <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Public">Public</SelectItem>
                  <SelectItem value="Company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PrimaryBtn label="Create" type="submit" />
            <ActionBtn label="Cancel" onClick={() => setShowNew(false)} />
          </form>
        </Card>
      )}

      {syncNote && (
        <div style={{
          margin: '0 0 16px', padding: '12px 16px', borderRadius: 'var(--r)', fontSize: 13,
          background: syncNote.ok ? 'var(--green-l)' : 'var(--gold-l)',
          border: `1px solid ${syncNote.ok ? 'var(--green)' : 'var(--gold)'}`,
          color: 'var(--ink)',
        }}>
          <strong>{syncNote.ok ? 'Calendar updated' : 'Nothing was synchronised'}</strong>
          <div style={{ marginTop: 3, color: 'var(--ink2)' }}>{syncNote.text}</div>
          {syncNote.problems.map((p, i) => (
            <div key={i} style={{ marginTop: 5, fontSize: 12.5, color: 'var(--ink2)' }}>• {p}</div>
          ))}
        </div>
      )}

      {(Object.entries(grouped) as [string, HolidayRow[]][]).filter(([, l]) => l.length > 0).map(([type, list]) => (
        <div key={type} style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
            {type === 'Public' || type === 'Company' ? `${type} Holidays` : type}
          </div>
          <Wrap>
            <thead><tr><TH>Date</TH><TH>Holiday Name</TH><TH>Type</TH><TH right>Actions</TH></tr></thead>
            <tbody>
              {/* Keyed on id, not date: two holidays can now fall on one date —
                  Eid has landed on Union Day — and a duplicate key silently
                  drops the second row. */}
              {list.map(h => (
                <tr key={h.id ?? `${h.date}-${h.name}`} style={{ borderBottom:'1px solid var(--border)' }}>
                  <TD mono muted>{h.date}</TD>
                  <TD bold>
                    {h.name}
                    {h.localName && h.localName !== h.name && (
                      <span style={{ fontWeight:400, color:'var(--ink3)', marginLeft:8 }}>{h.localName}</span>
                    )}
                    {h.provisional && (
                      // Said plainly, because someone will plan around it: the
                      // date follows a moon sighting and can move by a day.
                      <span title="Date follows the sighting of the moon and may shift by a day" style={{
                        marginLeft:8, fontSize:10.5, fontWeight:700, padding:'1px 6px', borderRadius: 'var(--r-sm)',
                        background:'var(--gold-l)', color:'var(--gold)',
                      }}>PROVISIONAL</span>
                    )}
                  </TD>
                  <TD><span style={{ fontSize:11, padding:'2px 8px', borderRadius: 'var(--r-sm)', background: h.type==='Public'?'var(--blue-l)':'var(--purple-l)', color: h.type==='Public'?'var(--blue)':'var(--purple)', fontWeight:700 }}>{h.type}</span></TD>
                  <TD right>{h.id && <ActionBtn label="Delete" color="var(--red)" onClick={() => handleDelete(h.id!)} />}</TD>
                </tr>
              ))}
            </tbody>
          </Wrap>
        </div>
      ))}
    </div>
  );
}