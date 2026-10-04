import React, { useState, useEffect, useRef } from 'react';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { ExaminationsQueue } from '../../components/ExaminationsQueue.js';
import { DangerousGoodsPanel } from '../../components/DangerousGoodsPanel.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Spinner, PageLoading } from '../../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { RelatedRecordsPanel } from '../../components/RelatedRecordsPanel.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { IconName } from '../../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../../lib/watermark.js';
import { useCompany, getCompany } from '../../data/companyStore.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { useClockIn } from '../../contexts/ClockInContext.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  jobUiSteps, jobCurrentIdx, jobStageLabel, jobBackendStage,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
  type JobChargeLine,
} from '../clearanceData.js';
import { ChBadge } from '../../components/ClearanceChips.js';
import { VesselLiveStatus } from '../../components/VesselLiveStatus.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../../data/staffData.js';
import type { Employee } from '../../data/staffData.js';
import { CUSTOMER_MILESTONES, MILESTONE_LABELS, STAGE_TO_MILESTONE } from '@hudumika/types';
import type { CustomerMilestone, ClearanceStage } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Badge } from '../../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../components/ui/hover-card.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
import { clockGate, fdate, ftime, fdatetime, fmtTZS, fmtServiceRate, avatarBg, initials, isUUID, friendlyAssignee, Av, Card } from './utils.js';
export function StaffPickerModal({ jobId, shipmentId, isLive, onRefresh, existing, onClose, mode = 'tag', listenerType = 'internal', onAssign, declaredCustomer }: {
  jobId: string;
  shipmentId: string;
  isLive: boolean;
  onRefresh: () => void;
  existing: string[];
  onClose: () => void;
  mode?: 'tag' | 'assign';
  listenerType?: 'internal' | 'customer';
  onAssign?: (ids: string[], names: string[]) => void;
  declaredCustomer?: { name: string; id?: string };
}) {
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Employee[]>([]);
  const [channels, setChannels]     = useState<Channel[]>(['email', 'whatsapp']);
  const [saved, setSaved]           = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [staff, setStaff]           = useState<Employee[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState(false);
  // Slide-in drawer — Sheet (Radix) now owns mount/animate-in and
  // animate-out-then-close itself; requestClose is kept as a name since a
  // couple of call sites below delay it after a "Saved!" confirmation.
  function requestClose() { onClose(); }

  useEffect(() => {
    setStaffLoading(true);
    setStaffError(false);

    if (listenerType === 'customer') {
      const custName = declaredCustomer?.name || 'Declared Customer';
      apiFetch('/v1/customers')
        .then((res: any) => {
          const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
          const matchingCustomer = list.find(c =>
            (declaredCustomer?.id && c.id === declaredCustomer.id) ||
            (c.name && custName && c.name.toLowerCase() === custName.toLowerCase()) ||
            (c.name && custName && custName.toLowerCase().includes(c.name.toLowerCase()))
          );

          const customerPeople: Employee[] = [];
          const cName = matchingCustomer?.name || custName;

          if (matchingCustomer) {
            customerPeople.push(
              {
                id: matchingCustomer.id,
                name: matchingCustomer.contact_person || `${cName} (Primary Contact)`,
                email: matchingCustomer.email || '',
                phone: matchingCustomer.phone || '',
                dept: cName,
                designation: 'Primary Customer Representative',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `${matchingCustomer.id}_ops`,
                name: `${cName} — Operations Contact`,
                email: matchingCustomer.email ? `ops@${matchingCustomer.email.split('@')[1] || 'customer.com'}` : '',
                phone: matchingCustomer.phone || '',
                dept: cName,
                designation: 'Logistics Coordinator',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `${matchingCustomer.id}_finance`,
                name: `${cName} — Accounts & Billing`,
                email: matchingCustomer.email ? `finance@${matchingCustomer.email.split('@')[1] || 'customer.com'}` : '',
                phone: matchingCustomer.phone || '',
                dept: cName,
                designation: 'Accounts Payable',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              }
            );
          } else {
            customerPeople.push(
              {
                id: `cust_${cName.replace(/\s+/g, '_').toLowerCase()}_main`,
                name: `${cName} (Primary Representative)`,
                email: '',
                phone: '',
                dept: cName,
                designation: 'Declared Importer / Consignee',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `cust_${cName.replace(/\s+/g, '_').toLowerCase()}_ops`,
                name: `${cName} — Operations Representative`,
                email: '',
                phone: '',
                dept: cName,
                designation: 'Logistics Contact',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              },
              {
                id: `cust_${cName.replace(/\s+/g, '_').toLowerCase()}_billing`,
                name: `${cName} — Finance & Billing Contact`,
                email: '',
                phone: '',
                dept: cName,
                designation: 'Accounts Contact',
                role: 'Customer',
                status: 'ACTIVE',
                hireDate: '',
              }
            );
          }

          // Also include other registered customer accounts
          const otherCustomers = list.filter(c => !matchingCustomer || c.id !== matchingCustomer.id);
          otherCustomers.forEach(c => {
            customerPeople.push({
              id: c.id,
              name: `${c.name} (${c.contact_person || 'Representative'})`,
              email: c.email || '',
              phone: c.phone || '',
              dept: c.name,
              designation: 'Customer Account',
              role: 'Customer',
              status: 'ACTIVE',
              hireDate: '',
            });
          });

          setStaff(customerPeople);
        })
        .catch(() => {
          setStaff([
            {
              id: `cust-fallback-1`,
              name: `${custName} (Primary Representative)`,
              email: '',
              phone: '',
              dept: custName,
              designation: 'Declared Importer',
              role: 'Customer',
              status: 'ACTIVE',
              hireDate: '',
            },
            {
              id: `cust-fallback-2`,
              name: `${custName} — Operations Representative`,
              email: '',
              phone: '',
              dept: custName,
              designation: 'Logistics Contact',
              role: 'Customer',
              status: 'ACTIVE',
              hireDate: '',
            },
          ]);
        })
        .finally(() => setStaffLoading(false));
      return;
    }

    apiFetch('/v1/hr/staff')
      .then((res: any) => {
        const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
        setStaff(list.map(u => ({
          id:          u.id,
          name:        u.name,
          email:       u.email       ?? '',
          phone:       u.phone       ?? '',
          dept:        u.dept        ?? u.department ?? '',
          designation: u.designation ?? (u.role ?? '').replace(/_/g, ' '),
          role:        u.role        ?? '',
          status:      (u.status === 'INACTIVE' ? 'INACTIVE' : u.status === 'ON_LEAVE' ? 'ON_LEAVE' : 'ACTIVE') as Employee['status'],
          hireDate:    u.hireDate    ?? '',
        })));
      })
      .catch(() => setStaffError(true))
      .finally(() => setStaffLoading(false));
  }, [listenerType, declaredCustomer?.id, declaredCustomer?.name]);

  const filtered = staff.filter(e =>
    e.status !== 'INACTIVE' &&
    !existing.includes(e.id) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.dept.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()))
  );

  function toggleEmp(e: Employee) {
    setSelected(prev => prev.find(x => x.id === e.id) ? prev.filter(x => x.id !== e.id) : [...prev, e]);
  }

  function toggleCh(ch: Channel) {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }

  const STATUS_COLOR: Record<string, string> = { ACTIVE: 'var(--green)', ON_LEAVE: 'var(--gold)' };

  async function handleConfirm() {
    if (staffLoading || staffError || selected.length === 0 || confirming) return;
    if (mode === 'assign') {
      onAssign?.(selected.map(e => e.id), selected.map(e => e.name));
      setSaved(true);
      setTimeout(() => { requestClose(); }, 900);
      return;
    }
    setConfirming(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/listeners`, {
          method: 'POST',
          body: JSON.stringify({
            type: listenerType,
            people: selected.map(e => ({ id: e.id, name: e.name, role: e.designation })),
            channels,
          }),
        });
        onRefresh();
      } else {
        const newListeners: import('../clearanceData.js').Listener[] = selected.map(e => ({
          id: e.id, name: e.name, role: e.designation, type: listenerType, channel: channels,
        }));
        updateJob(jobId, j => ({
          ...j,
          listeners: [...j.listeners, ...newListeners],
          activity: [
            ...j.activity,
            {
              id: `act-${Date.now()}`,
              action: 'assigned' as const,
              userId: 'me',
              userName: 'You',
              ts: new Date(),
              subject: `Tagged ${selected.map(e => e.name).join(', ')} via ${channels.join(', ')}`,
            },
          ],
        }));
      }
      setSaved(true);
      setTimeout(() => { requestClose(); }, 900);
    } catch (err: any) {
      showAlert(err.message || 'Failed to tag staff');
    } finally {
      setConfirming(false);
    }
  }

  // Slide-in drawer anchored to the right edge — wider than the 248px sidebar
  // column it's triggered from, and "light": no dark backdrop dimming the rest
  // of the page, just a transparent click-outside-to-close catcher (via
  // Sheet's overlayClassName escape hatch, see ui/sheet.tsx).
  return (
    <Sheet open onOpenChange={o => { if (!o) requestClose(); }}>
      <SheetContent overlayClassName="bg-transparent" className="w-105 max-w-[92vw] flex flex-col p-0 gap-0">

        {/* Header */}
        <SheetHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <SheetTitle style={{ fontSize: 15 }}>
            {listenerType === 'customer' ? 'Add Customer Listener' : mode === 'assign' ? 'Assign Team Member' : 'Tag Internal Staff'}
          </SheetTitle>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {listenerType === 'customer'
              ? `Customer declared for this shipment: ${declaredCustomer?.name || 'Shipment Customer'}`
              : 'Select team members to notify and assign to this shipment'}
          </div>
        </SheetHeader>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, department, or role…"
              style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' as const }} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {staffLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0', color: 'var(--ink3)', fontSize: 13 }}>
              <Spinner size={18} trackColor="var(--teal-l)" />
              Loading staff…
            </div>
          )}
          {!staffLoading && staffError && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--red)', fontSize: 13 }}>
              Failed to load staff. Please close and try again.
            </div>
          )}
          {!staffLoading && !staffError && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--ink3)', fontSize: 13 }}>
              {search ? 'No staff match your search.' : 'All active staff are already added.'}
            </div>
          )}
          {!staffLoading && !staffError && filtered.map(e => {
            const on = !!selected.find(x => x.id === e.id);
            return (
              <button key={e.id} type="button" onClick={() => toggleEmp(e)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 'var(--ds-btn-py) 20px', border: 'none', background: on ? 'var(--teal-l)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'background .1s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: empAvatarColor(e.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {empInitials(e.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--teal)' : 'var(--ink)' }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{e.designation} · {e.dept}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-sm)', background: STATUS_COLOR[e.status] ? `${STATUS_COLOR[e.status]}20` : 'var(--bg)', color: STATUS_COLOR[e.status] ?? 'var(--ink3)', flexShrink: 0 }}>{e.status === 'ON_LEAVE' ? 'On Leave' : 'Active'}</span>
                <div style={{ width: 20, height: 20, borderRadius: 'var(--r-sm)', border: `2px solid ${on ? 'var(--teal)' : 'var(--border)'}`, background: on ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {on && <Icon name="check" size={11} color="#fff" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Notify via */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Notify via</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['email', 'whatsapp'] as Channel[]).map(ch => {
              const on = channels.includes(ch);
              const COLORS: Record<string, string> = { email: 'var(--teal)', whatsapp: 'var(--green)', sms: 'var(--gold)', teams: 'var(--purple)' };
              return (
                <button key={ch} type="button" onClick={() => toggleCh(ch)}
                  style={{ fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 10px', borderRadius: 'var(--r)', cursor: 'pointer', border: `1.5px solid ${on ? COLORS[ch] : 'var(--border)'}`, background: on ? `${COLORS[ch]}18` : 'var(--white)', color: on ? COLORS[ch] : 'var(--ink3)', transition: 'all .12s', textTransform: 'capitalize', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {ch === 'whatsapp' ? 'WhatsApp' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {selected.length > 0 ? `${selected.length} person${selected.length > 1 ? 's' : ''} selected` : 'Select staff to tag'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={requestClose} style={{ padding: 'var(--ds-btn-py) 16px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="button" disabled={staffLoading || staffError || selected.length === 0 || saved || confirming} onClick={handleConfirm}
              style={{ padding: 'var(--ds-btn-py) 18px', background: saved ? 'var(--green)' : selected.length > 0 ? 'var(--teal)' : 'var(--border)', color: selected.length > 0 || saved ? '#fff' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: selected.length > 0 && !confirming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, transition: 'background .15s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saved ? <><Icon name="check" size={13} color="#fff" /> Done!</> : confirming ? 'Saving…' : <><Icon name="userPlus" size={13} color={selected.length > 0 ? '#fff' : 'var(--ink3)'} /> {mode === 'assign' ? 'Assign' : 'Tag & Notify'}</>}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Listeners Sidebar ────────────────────────────────────────────────────────

// Only channels with a real send integration behind them (WhatsApp/Email) — SMS
// and Teams have no working integration anywhere in this codebase today, so
// they're not offered here rather than being fake toggles that silently no-op.
export const ALL_CHANNELS: Channel[] = ['whatsapp', 'email'];

export function ChannelToggle({ ch, active, onToggle, readOnly }: { ch: Channel; active: boolean; onToggle: () => void; readOnly?: boolean }) {
  const cfg = CH_CFG[ch];
  return (
    <Tip label={readOnly ? cfg.label : `${active ? 'Disable' : 'Enable'} ${cfg.label}`}>
      <span>
        <button type="button" onClick={readOnly ? undefined : onToggle} disabled={readOnly}
          style={{ fontSize: 10, padding: 'var(--ds-btn-py-xs) 7px', borderRadius: 'var(--r)', cursor: readOnly ? 'default' : 'pointer', border: `1px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'var(--white)', color: active ? cfg.color : 'var(--ink3)', fontWeight: 600, transition: 'all 0.12s', opacity: readOnly && !active ? 0.6 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
          {cfg.label}
        </button>
      </span>
    </Tip>
  );
}

export function ListenersSidebar({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [channelToggling, setChannelToggling] = useState<string | null>(null);
  const [staffPickerType, setStaffPickerType] = useState<'internal' | 'customer' | null>(null);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  // Read-only status indicator only now — WhatsApp on/off is a tenant-wide
  // decision (Workspace ▸ Settings ▸ Notifications), not a per-shipment
  // control; the toggle card that used to live on this page never actually
  // gated message-sending anyway (nothing in the backend checked it).
  const waActive = job.whatsappBotActive !== false;
  const { user } = useAuth();
  // Re-assigning ownership and re-tagging who gets notified is a management
  // decision — junior/officer roles can see who's assigned/tagged but not change it.
  const canManage = !!(user && MGMT_ROLES.includes(user.role));

  const [editingDate, setEditingDate] = useState<'created' | 'due' | null>(null);
  const [savingDate, setSavingDate] = useState(false);
  const [savingReportToggle, setSavingReportToggle] = useState(false);

  // null (inherit the customer's own setting) displays as "on" — the
  // platform default — since there's no per-shipment override yet to show.
  async function handleDailyReportToggle(enabled: boolean) {
    setSavingReportToggle(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}`, { method: 'PATCH', body: JSON.stringify({ daily_report_enabled: enabled }) });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, dailyReportEnabled: enabled }));
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to update daily report setting');
    } finally {
      setSavingReportToggle(false);
    }
  }

  async function handleKeyDateChange(field: 'created_at' | 'due_date', label: string, d: Date | undefined) {
    setEditingDate(null);
    setSavingDate(true);
    try {
      if (isLive) {
        // The backend fires a real KEY_DATE_CHANGED notification to this
        // shipment's listeners on a genuine change — nothing more to do here
        // beyond refreshing so the new value shows up.
        await apiFetch(`/v1/shipments/${shipmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: d ? d.toISOString() : null }),
        });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, [field === 'due_date' ? 'dueDate' : 'createdAt']: d }));
      }
    } catch (err: any) {
      showAlert(err.message || `Failed to update ${label.toLowerCase()}`);
    } finally {
      setSavingDate(false);
    }
  }

  async function handleAssign(employeeIds: string[], names: string[]) {
    if (isLive) {
      try {
        await apiFetch(`/v1/shipments/${shipmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ assigned_to: employeeIds[0] }),
        });
        onRefresh();
      } catch (err: any) { showAlert(err.message || 'Assign failed'); }
    } else {
      updateJob(job.id, j => ({
        ...j,
        assignees: [...new Set([...j.assignees, ...employeeIds])],
        activity: [...j.activity, { id: `act-${Date.now()}`, action: 'assigned' as const, userId: 'me', userName: 'You', ts: new Date(), subject: `Assigned ${names.join(', ')}` }],
      }));
    }
  }

  async function toggleListenerCh(listener: Listener, ch: Channel) {
    const next = listener.channel.includes(ch) ? listener.channel.filter(c => c !== ch) : [...listener.channel, ch];
    if (isLive) {
      if (!listener.listenerId) return;
      setChannelToggling(listener.listenerId);
      try {
        await apiFetch(`/v1/shipments/${shipmentId}/listeners/${listener.listenerId}`, {
          method: 'PATCH',
          body: JSON.stringify({ channels: next }),
        });
        onRefresh();
      } catch (err: any) { showAlert(err.message || 'Failed to update notification channel'); }
      finally { setChannelToggling(null); }
    } else {
      updateJob(job.id, j => ({ ...j, listeners: j.listeners.map(l => l.id === listener.id ? { ...l, channel: next } : l) }));
    }
  }

  const internal  = job.listeners.filter(l => l.type === 'internal');
  const customers = job.listeners.filter(l => l.type === 'customer');

  return (
    <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Assigned To */}
      <Card title="Assigned To" padded={false} action={canManage ? (
        <button type="button" onClick={() => setShowAssignPicker(true)}
          style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
          {job.assignees.length > 0 ? 'Change' : '+ Assign'}
        </button>
      ) : undefined}>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {job.assignees.length === 0 ? (
            canManage ? (
              <button type="button" onClick={() => setShowAssignPicker(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 'var(--r)', padding: '8px 12px', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'var(--font)' }}>
                <Icon name="userPlus" size={14} color="var(--ink3)" /> Assign an agent…
              </button>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No agent assigned yet.</div>
            )
          ) : job.assignees.length === 1 ? (
            job.assignees.map(a => {
              const label = (a === job.assignees[0] && job.assigneeName) || friendlyAssignee(a);
              return (
                <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Av name={label} userId={a} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Assigned Officer</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              {job.assignees.slice(0, 4).map((a, index) => {
                const label = (a === job.assignees[0] && job.assigneeName) || friendlyAssignee(a);
                return (
                  <button
                    key={a}
                    type="button"
                    style={{
                      border: '2px solid var(--white)',
                      background: 'none',
                      padding: 0,
                      cursor: 'default',
                      borderRadius: '50%',
                      outline: 'none',
                      display: 'flex',
                      marginRight: -8,
                      zIndex: 10 - index,
                    }}
                    title={label}
                  >
                    <Av name={label} userId={a} size={28} />
                  </button>
                );
              })}
              {job.assignees.length > 4 && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    marginRight: -6,
                    zIndex: 5,
                  }}
                  title={`${job.assignees.length - 4} more agents`}
                >
                  +{job.assignees.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Listeners Card */}
      <Card title="Listeners" padded={false} action={(
        <span style={{ display: 'flex', gap: 5 }}>
          <span style={{ padding: '1px 7px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}>{job.listeners.length}</span>
          {customers.length > 0 && (
            <span style={{ padding: '1px 7px', background: waActive ? 'var(--green-l)' : 'var(--bg)', color: waActive ? 'var(--green)' : 'var(--ink3)', borderRadius: 'var(--r)', fontSize: 10, fontWeight: 700 }}>WA {waActive ? '✓' : '✕'}</span>
          )}
        </span>
      )}>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          
          {/* Staff Section */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
              Staff ({internal.length})
            </div>
            {internal.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>None added</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('internal')}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Add Staff Listener"
                  >
                    <Icon name="plus" size={11} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginRight: internal.length > 4 ? 4 : 0 }}>
                  {internal.slice(0, 4).map((l, index) => (
                    <HoverCard key={l.id} openDelay={100} closeDelay={300}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          style={{
                            border: '2px solid var(--white)',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            borderRadius: '50%',
                            outline: 'none',
                            display: 'flex',
                            marginRight: -8,
                            zIndex: 10 - index,
                          }}
                        >
                          <Av name={l.name} userId={l.id} size={28} />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="start" side="bottom" sideOffset={6} className="w-60 p-3">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <Av name={l.name} userId={l.id} size={30} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.role}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          Notification Channels
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {ALL_CHANNELS.map(ch => (
                            <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  ))}
                </div>

                {internal.length > 4 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--bg)',
                          border: '1.5px solid var(--border)',
                          color: 'var(--ink2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          outline: 'none',
                          marginRight: 6,
                          zIndex: 5,
                        }}
                      >
                        +{internal.length - 4}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2 flex flex-col gap-1 max-h-60 overflow-y-auto">
                      <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                        Additional Staff
                      </div>
                      {internal.slice(4).map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <Av name={l.name} userId={l.id} size={22} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>
                              {l.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 6 }}>
                            {ALL_CHANNELS.map(ch => (
                              <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('internal')}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      padding: 0,
                      marginLeft: internal.length > 4 ? 0 : 10,
                    }}
                    title="Add Staff Listener"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Customers Section */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
              Customers ({customers.length})
            </div>
            {customers.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>None added</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('customer')}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Add Customer Listener"
                  >
                    <Icon name="plus" size={11} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginRight: customers.length > 4 ? 4 : 0 }}>
                  {customers.slice(0, 4).map((l, index) => (
                    <HoverCard key={l.id} openDelay={100} closeDelay={300}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          style={{
                            border: '2px solid var(--white)',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            borderRadius: '50%',
                            outline: 'none',
                            display: 'flex',
                            marginRight: -8,
                            zIndex: 10 - index,
                          }}
                        >
                          <Av name={l.name} userId={l.id} size={28} />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="start" side="bottom" sideOffset={6} className="w-60 p-3">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <Av name={l.name} userId={l.id} size={30} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.role}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          Notification Channels
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {ALL_CHANNELS.map(ch => (
                            <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  ))}
                </div>

                {customers.length > 4 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--bg)',
                          border: '1.5px solid var(--border)',
                          color: 'var(--ink2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          outline: 'none',
                          marginRight: 6,
                          zIndex: 5,
                        }}
                      >
                        +{customers.length - 4}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2 flex flex-col gap-1 max-h-60 overflow-y-auto">
                      <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                        Additional Customers
                      </div>
                      {customers.slice(4).map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <Av name={l.name} userId={l.id} size={22} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>
                              {l.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 6 }}>
                            {ALL_CHANNELS.map(ch => (
                              <ChannelToggle key={ch} ch={ch} active={l.channel.includes(ch)} onToggle={() => toggleListenerCh(l, ch)} readOnly={!canManage || channelToggling === l.listenerId} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={() => setStaffPickerType('customer')}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '1px dashed var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--ink3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      padding: 0,
                      marginLeft: customers.length > 4 ? 0 : 10,
                    }}
                    title="Add Customer Listener"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </Card>

      {showAssignPicker && canManage && (
        <StaffPickerModal
          jobId={job.id}
          shipmentId={shipmentId}
          isLive={isLive}
          onRefresh={onRefresh}
          existing={job.assignees}
          onClose={() => setShowAssignPicker(false)}
          mode="assign"
          onAssign={handleAssign}
        />
      )}

      {staffPickerType && canManage && (
        <StaffPickerModal
          jobId={job.id}
          shipmentId={shipmentId}
          isLive={isLive}
          onRefresh={onRefresh}
          existing={job.listeners.filter(l => l.type === staffPickerType).map(l => l.id)}
          onClose={() => setStaffPickerType(null)}
          listenerType={staffPickerType}
          declaredCustomer={{ name: job.customer, id: job.customerId }}
        />
      )}

      {/* Key Dates — editable; saving notifies this shipment's listeners
          (same WhatsApp/Email/in-app channels as above) via the backend's
          KEY_DATE_CHANGED trigger, so a date change is never silent. */}
      <Card title="Key Dates" padded={false}>
        {[
          { key: 'created' as const, label: 'Created',  date: job.createdAt, field: 'created_at', warn: false },
          { key: 'due' as const,     label: 'Due Date', date: job.dueDate,   field: 'due_date',    warn: !!(job.dueDate && new Date() > job.dueDate) },
        ].map((item, i, arr) => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0 }}>{item.label}</span>
            {editingDate === item.key ? (
              <DatePicker
                date={item.date}
                onChange={(d) => handleKeyDateChange(item.field as 'created_at' | 'due_date', item.label, d)}
                className="w-auto"
                triggerClassName="h-7 text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => canManage && setEditingDate(item.key)}
                disabled={!canManage || savingDate}
                title={canManage ? 'Click to change' : 'Only managers can change this'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0,
                  cursor: canManage ? 'pointer' : 'default', fontSize: 12, fontWeight: 600,
                  color: item.warn ? 'var(--red)' : 'var(--ink)',
                }}
              >
                {item.date ? fdate(item.date) : '—'}
                {canManage && <Icon name="edit" size={11} color="var(--ink3)" />}
              </button>
            )}
          </div>
        ))}
      </Card>

      {/* Daily shipment-report automation (migration 258) — email (PDF) +
          WhatsApp (link) around 21:00 EAT. A shipment-level override; the
          customer-level default lives on the customer record itself. */}
      <Card title="Automation" padded={false}>
        <div style={{ padding: '4px 16px' }}>
          <SwitchRow
            title="Daily progress report"
            description="Sends today's PDF report by email and a live-status link by WhatsApp, ~21:00 EAT."
            checked={job.dailyReportEnabled !== false}
            onCheckedChange={handleDailyReportToggle}
            disabled={!canManage || savingReportToggle}
          />
        </div>
      </Card>

      {/* Tags & Flags — pulled off this sidebar for now, tracked as
          LENS-xxxx (area: clearos) for a proper pass later rather than left
          silently unused: job.flags/FlagChip are untouched, so restoring
          this is a one-block re-add, not a rebuild. */}

      {/* Workflow — which track governs this case, and (while it is still in
          flight) the ability to move it onto another one. */}
      <WorkflowCard job={job} shipmentId={shipmentId} isLive={isLive} onRefresh={onRefresh} canManage={canManage} />
    </div>
  );
}

// ─── Workflow card (re-route a shipment onto another workflow) ────────────────

export function WorkflowCard({ job, shipmentId, isLive, onRefresh, canManage }: {
  job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void; canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  // Result of the switch-and-verify: which of the NEW landing step's checks the
  // shipment already meets, and which it now needs. Shown on the card so the
  // operator sees the consequence of the switch without a failed Advance first.
  const [verifyMsg, setVerifyMsg] = useState<{ valid: boolean; failures: string[]; met: number; total: number; stepName: string } | null>(null);

  const steps = jobUiSteps(job);
  const curIdx = jobCurrentIdx(job);
  const curStep = curIdx >= 0 ? steps[curIdx] : undefined;
  const total = steps.length;
  // A finished clearance is not re-routed: blocked once resolved or on the
  // final step of its current workflow.
  const locked = !!job.isDone || !!curStep?.isTerminal;

  useEffect(() => {
    if (!open || workflows.length > 0) return;
    apiFetch('/v1/workflows').then(res => setWorkflows(((res as any).data || res || []).filter((w: any) => w.isActive !== false))).catch(() => {});
  }, [open, workflows.length]);

  // Steps of the target for the effect preview: the legacy ladder, or the
  // chosen workflow's own steps.
  const targetSteps: { id: string; name: string }[] = target === 'legacy'
    ? STAGES.map(s => ({ id: s.id, name: s.label }))
    : (workflows.find(w => w.id === target)?.steps || []).slice().sort((a: any, b: any) => a.order - b.order).map((s: any) => ({ id: s.id, name: s.name }));
  const landingIdx = targetSteps.length > 0 ? Math.min(curIdx < 0 ? 0 : curIdx, targetSteps.length - 1) : -1;
  const targetName = target === 'legacy' ? 'Standard stages' : (workflows.find(w => w.id === target)?.name || '');

  async function apply() {
    if (!target || saving) return;
    setSaving(true);
    try {
      if (isLive) {
        const res: any = await apiFetch(`/v1/shipments/${shipmentId}/workflow`, { method: 'POST', body: JSON.stringify({ workflow_id: target }) });
        const v = res?.verification;
        if (v && Array.isArray(v.outcomes)) {
          setVerifyMsg({
            valid: !!v.valid,
            failures: v.failures ?? [],
            met: v.outcomes.filter((o: any) => o.passed).length,
            total: v.outcomes.length,
            stepName: res.stepName ?? '',
          });
        } else {
          setVerifyMsg(null);
        }
        onRefresh();
      }
      setOpen(false); setTarget('');
    } catch (err: any) { showAlert(err.message || 'Could not change workflow'); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Workflow" action={locked ? (
      <span title="A completed shipment cannot be re-routed" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}><Icon name="lock" size={11} /> Locked</span>
    ) : undefined}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{job.workflowName || (job.workflowKind === 'CUSTOM' ? 'Workflow' : 'Standard stages')}</div>
      {curStep && (
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
          {curStep.label}{total > 0 && curIdx >= 0 ? ` · step ${curIdx + 1} of ${total}` : ''}
        </div>
      )}

      {verifyMsg && (
        <div style={{ marginTop: 10, borderRadius: 'var(--r)', padding: '9px 11px', fontSize: 11.5, lineHeight: 1.5,
          background: verifyMsg.valid ? 'var(--green-l)' : 'var(--gold-l)',
          border: `1px solid ${verifyMsg.valid ? 'var(--green)' : 'var(--gold)'}`, color: 'var(--ink2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
              <Icon name={verifyMsg.valid ? 'checkCircle' : 'alertCircle'} size={12} />{' '}
              {verifyMsg.total === 0 ? 'No checks on this step' : `${verifyMsg.met} of ${verifyMsg.total} checks met`}
            </span>
            <button type="button" onClick={() => setVerifyMsg(null)} style={{ border: 'none', background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }} aria-label="Dismiss">×</button>
          </div>
          {!verifyMsg.valid && verifyMsg.failures.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {verifyMsg.failures.map((f, i) => <li key={i} style={{ marginTop: 2 }}>{f}</li>)}
            </ul>
          )}
          {verifyMsg.valid && verifyMsg.total > 0 && (
            <div style={{ marginTop: 3, color: 'var(--ink3)' }}>This step's requirements are already satisfied — you can Advance from here.</div>
          )}
        </div>
      )}

      {!locked && canManage && !open && (
        <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="gitBranch" size={13} /> Change workflow
        </button>
      )}

      {!locked && canManage && open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Select value={target || '__none__'} onValueChange={v => setTarget(v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Choose a workflow…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Choose a workflow…</SelectItem>
              {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              <SelectItem value="legacy">Standard stages</SelectItem>
            </SelectContent>
          </Select>

          {target && landingIdx >= 0 && (
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '9px 11px' }}>
              <div><strong style={{ color: 'var(--ink)' }}>Now:</strong> {curStep?.label ?? '—'}{curIdx >= 0 ? ` (step ${curIdx + 1} of ${total})` : ''}</div>
              <div style={{ marginTop: 3 }}><strong style={{ color: 'var(--ink)' }}>After:</strong> {targetSteps[landingIdx]?.name} (step {landingIdx + 1} of {targetSteps.length}) in {targetName}</div>
              <div style={{ marginTop: 5, color: 'var(--ink3)' }}>Progress is kept at the same position where the new workflow has one, otherwise its nearest step. You can refine the stage afterward from Advance Stage.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setOpen(false); setTarget(''); }} style={{ flex: 1, padding: 'var(--ds-btn-py-sm) 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>Cancel</button>
            <button type="button" disabled={!target || saving} onClick={apply} style={{ flex: 1, padding: 'var(--ds-btn-py-sm) 12px', border: 'none', borderRadius: 'var(--r)', background: target && !saving ? 'hsl(var(--primary))' : 'var(--border)', color: target && !saving ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: target && !saving ? 'pointer' : 'default', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>{saving ? 'Applying…' : 'Apply'}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Linked operational documents ──────────────────────────────────────────
// Delivery Documents (release/delivery orders + delivery notes, merged —
// migration 263, lives in FinOps) soft-link to a shipment via a real
// shipment id — surfaced here so they resolve to this one shipment instead
// of living in a disconnected app tab with no visible relationship to it.
export interface LinkedDoc { id: string; doc_type: string; doc_number: string | null; status: string; }
export interface LinkedCoO { id: string; agreement_code: string; eligibility_status: string; certificate_number: string | null; status: string; }

export const LINKED_DOC_TYPE_ICON: Record<string, IconName> = { RELEASE_ORDER: 'fileText', DELIVERY_ORDER: 'fileText', DELIVERY_NOTE: 'truck' };
export const LINKED_DOC_TYPE_LABEL: Record<string, string> = { RELEASE_ORDER: 'Release Order', DELIVERY_ORDER: 'Delivery Order', DELIVERY_NOTE: 'Delivery Note' };

export function LinkedOperationalDocs({ shipmentId }: { shipmentId: string }) {
  const [docs, setDocs] = useState<LinkedDoc[]>([]);
  const [coos, setCoos] = useState<LinkedCoO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/v1/delivery-documents?shipment_id=${shipmentId}`).catch(() => []),
      apiFetch(`/v1/customs/certificates-of-origin?shipment_id=${shipmentId}`).catch(() => []),
    ]).then(([docRes, coRes]) => {
      setDocs(Array.isArray(docRes) ? docRes : []);
      setCoos(Array.isArray(coRes) ? coRes : []);
    }).finally(() => setLoading(false));
  }, [shipmentId]);

  const docVariant: Record<string, 'gray' | 'info' | 'success' | 'warning' | 'error'> = {
    draft: 'gray', issued: 'info', dispatched: 'info', delivered: 'success', used: 'success',
    returned: 'warning', expired: 'warning', cancelled: 'error',
  };
  const coVariant: Record<string, 'gray' | 'success' | 'error' | 'warning'> = {
    ELIGIBLE: 'success', NOT_ELIGIBLE: 'error', NEEDS_REVIEW: 'warning', INSUFFICIENT_DATA: 'gray',
  };

  if (loading) return null;
  if (docs.length === 0 && coos.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
    <Card title="Linked operational documents">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {docs.map(d => (
          <Link key={d.id} to={`/finance/delivery-documents?shipment=${shipmentId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <Icon name={LINKED_DOC_TYPE_ICON[d.doc_type] ?? 'fileText'} size={14} color="var(--ink3)" />
            <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{LINKED_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}{d.doc_number ? ` · ${d.doc_number}` : ''}</span>
            <Badge variant={docVariant[d.status] ?? 'gray'}>{d.status}</Badge>
          </Link>
        ))}
        {coos.map(co => (
          <Link key={co.id} to={`/clearos/compliance/origin?shipment=${shipmentId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <Icon name="award" size={14} color="var(--ink3)" />
            <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>Certificate of Origin ({co.agreement_code}){co.certificate_number ? ` · ${co.certificate_number}` : ''}</span>
            <Badge variant={coVariant[co.eligibility_status] ?? 'gray'}>{co.status === 'issued' ? 'issued' : co.eligibility_status.replace('_', ' ').toLowerCase()}</Badge>
          </Link>
        ))}
      </div>
    </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export type Tab = 'overview' | 'tasks' | 'timesheets' | 'declaration' | 'updates' | 'files' | 'ledger' | 'charges' | 'co2';

/**
 * What a customer is shown on their own shipment.
 *
 * The tab strip was not filtered by role, so a customer opening their job saw
 * Tasks, Timesheets and Ledger — the internal work breakdown, the hours booked
 * against them, and Shipment Economics, which states revenue, expenses and
 * gross margin. That is our commercial position on their job, and LedgerTab has
 * no role check of its own.
 *
 * Declaration is excluded too: it is a working document with editable fields,
 * not something to hand a customer mid-preparation.
 */
export const CUSTOMER_TABS = new Set<Tab>(['overview', 'updates', 'files', 'co2']);

export const TAB_CFG: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview',     label: 'Overview',     icon: 'barChart'    },
  { id: 'tasks',        label: 'Tasks',        icon: 'tasks'       },
  { id: 'timesheets',   label: 'Timesheets',   icon: 'clock'       },
  { id: 'declaration',  label: 'Declaration',  icon: 'clipboard'   },
  { id: 'updates',      label: 'Updates',      icon: 'send'        },
  { id: 'files',        label: 'Files',        icon: 'folder'      },
  { id: 'ledger',       label: 'Ledger',       icon: 'receipt'     },
  { id: 'charges',      label: 'Job Charges',  icon: 'dollarSign'  },
  { id: 'co2',          label: 'CO2',          icon: 'activity'    },
];
