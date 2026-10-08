import React, { useState, useCallback, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import type { Employee } from '../../data/staffData.js';
import type { AttendanceStatus, AttendanceRecord } from '../../data/hrmData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { MultiSelectFilter } from '../../components/ui/filter-dropdown.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import type { ShiftType, ShiftAssignment, Employee as ShiftEmployee } from '../../data/hrmData.js';
import { showAlert } from '../../lib/alert.js';
import { Avatar, Badge, PageHeader, Card, TH, TD, Wrap, PrimaryBtn, ActionBtn, mapAttStatus, toAttStatusApi, LeaveStatus, leaveTypeColor, LEAVE_TYPES, S, ini } from './shared.js';
type LeaveRow = {
  id: string; emp: string; type: string; from: string; to: string; days: number;
  reason: string; approvedBy: string; status: LeaveStatus;
  // Carried so a row can be matched to its entitlement. `type` alone cannot:
  // it is free text on older rows and a display name on newer ones.
  userId: string; typeCode: string;
};

function apiLeaveToRow(l: any): LeaveRow {
  return {
    id: l.id,
    emp: l.employee_name || l.emp || '',
    type: l.type,
    from: l.from_date ? String(l.from_date).slice(0, 10) : l.from,
    to: l.to_date   ? String(l.to_date).slice(0, 10)   : l.to,
    days: l.days,
    reason: l.reason || '',
    approvedBy: l.approved_by_name || l.approvedBy || '-',
    status: l.status as LeaveStatus,
    userId: l.user_id ?? '',
    typeCode: String(l.type_code ?? l.type ?? '').toUpperCase(),
  };
}

// A small pill toggle used for the boolean leave-type flags.
function FlagToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', fontSize:11.5, fontWeight:600, border:'1px solid var(--border)', borderRadius:'var(--r-sm)', cursor:'pointer', fontFamily:'var(--font)',
        background: on ? 'var(--teal-l)' : 'var(--bg)', color: on ? 'var(--teal)' : 'var(--ink3)' }} data-ui-native-button="">
      <span style={{ width:14, height:14, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', background: on ? 'hsl(var(--primary))' : 'var(--ink3)', color: on ? 'hsl(var(--primary-foreground))' : '#fff' }}>
        <Icon name={on ? 'check' : 'x'} size={9} strokeWidth={3} />
      </span>
      {label}
    </button>
  );
}

const ltInput: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', fontSize:13, fontFamily:'var(--font)', color:'var(--ink)', background:'var(--white)' };
const ltLabel: React.CSSProperties = { display:'block', fontSize:10.5, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 };

function LeaveTypeCard({ t, onSaved }: { t: any; onSaved: () => void }) {
  const [name, setName] = useState(String(t.name));
  const [days, setDays] = useState(String(t.days_entitled));
  const [cycle, setCycle] = useState(String(t.cycle_months));
  const [carry, setCarry] = useState(String(t.carry_forward_max));
  const [paid, setPaid] = useState(!!t.paid);
  const [reqDoc, setReqDoc] = useState(!!t.requires_document);
  const [active, setActive] = useState(!!t.active);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'warn' | 'err' } | null>(null);

  const dirty = name !== String(t.name) || days !== String(t.days_entitled) || cycle !== String(t.cycle_months)
    || carry !== String(t.carry_forward_max) || paid !== !!t.paid || reqDoc !== !!t.requires_document || active !== !!t.active;

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await apiFetch(`/v1/hr/leave-types/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, days_entitled: Number(days), cycle_months: Number(cycle), carry_forward_max: Number(carry), paid, requires_document: reqDoc, active }),
      });
      setMsg(res?.warning ? { text: res.warning, kind: 'warn' } : { text: 'Saved', kind: 'ok' });
      onSaved();
    } catch (e: any) {
      setMsg({ text: e?.message || 'Save failed', kind: 'err' });
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius: 'var(--r)', padding:16, display:'flex', flexDirection:'column', gap:12, opacity: active ? 1 : 0.72 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ width:10, height:10, borderRadius: 'var(--r-sm)', background: leaveTypeColor(t.code), flexShrink:0 }} />
        <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', fontFamily:'var(--font)' }}>{t.code}</span>
        {t.statutory && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius: 'var(--r)', background:'var(--blue-l)', color:'var(--blue)' }}>STATUTORY</span>}
        {t.applies_to && t.applies_to !== 'ALL' && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius: 'var(--r)', background:'var(--purple-l)', color:'var(--purple)' }}>{t.applies_to}</span>}
      </div>

      <div><label style={ltLabel}>Name</label><input style={ltInput} value={name} onChange={e => setName(e.target.value)} /></div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div><label style={ltLabel}>Days entitled</label><input style={ltInput} type="number" min="0" step="0.5" value={days} onChange={e => setDays(e.target.value)} /></div>
        <div><label style={ltLabel}>Cycle (months)</label><input style={ltInput} type="number" min="1" max="120" value={cycle} onChange={e => setCycle(e.target.value)} /></div>
      </div>
      <div><label style={ltLabel}>Carry-forward max (days)</label><input style={ltInput} type="number" min="0" step="0.5" value={carry} onChange={e => setCarry(e.target.value)} /></div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <FlagToggle label="Paid" on={paid} onChange={setPaid} />
        <FlagToggle label="Needs document" on={reqDoc} onChange={setReqDoc} />
        <FlagToggle label="Active" on={active} onChange={setActive} />
      </div>

      {msg && (
        <div style={{ fontSize:12, fontWeight:500, color: msg.kind==='err' ? 'var(--red)' : msg.kind==='warn' ? 'var(--gold)' : 'var(--green)' }}>{msg.text}</div>
      )}

      <div style={{ display:'flex', justifyContent:'flex-end', borderTop:'1px solid var(--border)', paddingTop:12 }}>
        <Button size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function LeaveTypesConfig({ types, onReload }: { types: any[]; onReload: () => void }) {
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const generate = async () => {
    setGen(true); setGenMsg(null);
    try {
      const r = await apiFetch('/v1/hr/leave-types/generate-statutory', { method: 'POST' });
      setGenMsg(`${r.created?.length ?? 0} created, ${r.kept?.length ?? 0} left as configured (${r.country}).`);
      onReload();
    } catch (e: any) {
      setGenMsg(e?.message || 'Could not generate statutory leave types.');
    } finally { setGen(false); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ fontSize:12.5, color:'var(--ink3)' }}>
          These entitlements drive every leave balance and the request checks. Statutory rows are seeded from the tenant's country.
        </div>
        <Button size="sm" variant="outline" disabled={gen} onClick={generate}>
          <Icon name="download" size={14} /> {gen ? 'Generating…' : 'Generate statutory types'}
        </Button>
      </div>
      {genMsg && <div style={{ fontSize:12.5, color:'var(--ink2)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius: 'var(--r)', padding:'8px 12px' }}>{genMsg}</div>}

      {types.length === 0 ? (
        <div style={{ background:'var(--white)', border:'1px dashed var(--border)', borderRadius: 'var(--r)', padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>No leave types configured</div>
          <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Generate the statutory set to start, then adjust the days and rules per type.</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:14 }}>
          {types.map(t => <LeaveTypeCard key={t.id} t={t} onSaved={onReload} />)}
        </div>
      )}
    </div>
  );
}

export function LeavesPage() {
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [everyBalance, setEveryBalance] = useState<any[]>([]);
  const [leaveSummary, setLeaveSummary] = useState<any | null>(null);
  const [leaveView, setLeaveView] = useState<'list' | 'calendar' | 'types'>('list');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [formPerson, setFormPerson] = useState('');
  const [formType, setFormType] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  const loadLeaves = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/leaves');
      const data = Array.isArray(res) ? res : (res?.data ?? []);
      setLeaves(data.map(apiLeaveToRow));
    } catch { /* empty */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch { /* empty */ }
  }, []);
  const loadEntitlement = useCallback(async () => {
    try { setLeaveTypes(await apiFetch('/v1/hr/leave-types') ?? []); } catch { setLeaveTypes([]); }
    try { setEveryBalance(await apiFetch('/v1/hr/leave-balances/all') ?? []); } catch { setEveryBalance([]); }
  }, []);
  const [summaryYear, setSummaryYear] = useState(() => String(new Date().getFullYear()));
  const loadSummary = useCallback(async (year?: string) => {
    try { setLeaveSummary(await apiFetch(`/v1/hr/leaves/summary?year=${year ?? summaryYear}`)); } catch { setLeaveSummary(null); }
  }, [summaryYear]);

  useEffect(() => { loadLeaves(); loadStaff(); loadEntitlement(); loadSummary(); }, [loadLeaves, loadStaff, loadEntitlement, loadSummary]);

  function downloadLeavesCsv() {
    const headers = ['Employee', 'Leave type', 'Days', 'Start', 'End', 'Status'];
    const csvRows = rows.map(l => [l.emp, l.type, l.days, l.from, l.to, l.status]);
    const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leaves_${summaryYear}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function handleStatus(id: string, status: LeaveStatus) {
    const before = leaves;
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    try {
      await apiFetch(`/v1/hr/leaves/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      loadLeaves(); loadEntitlement(); loadSummary();
    } catch (error: any) {
      // The row was flipped optimistically — put it back and say why, rather
      // than leaving a request showing as decided when the server refused it.
      setLeaves(before);
      showAlert(error?.message || 'Could not update the leave request.');
    }
  }

  // "Add Leave" toggled showNew, but nothing ever rendered a form for it — the
  // button did nothing. The server does the real work (working-day count,
  // overlap refusal, entitlement check) and answers in plain language.
  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    const type = leaveTypes.find(t => t.id === formType);
    if (!formPerson || !type || !formFrom || !formTo) { setFormError('Choose an employee, a leave type, and both dates.'); return; }
    setFormBusy(true); setFormError(null);
    try {
      await apiFetch('/v1/hr/leaves', { method: 'POST', body: JSON.stringify({
        user_id: formPerson, leave_type_id: type.id, type: type.code,
        from_date: formFrom, to_date: formTo, reason: formReason.trim() || undefined,
      }) });
      setShowNew(false); setFormPerson(''); setFormType(''); setFormFrom(''); setFormTo(''); setFormReason('');
      loadLeaves(); loadEntitlement(); loadSummary();
    } catch (error: any) {
      setFormError(error?.message || 'Could not submit the leave request.');
    } finally { setFormBusy(false); }
  }

  const rows = leaves.filter(l => {
    if (filter && l.typeCode !== filter && l.type !== filter) return false;
    if (search && !l.emp.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getStatusBadgeClass = (s: string) => {
    switch (s.toUpperCase()) {
      case 'APPROVED': return { bg: 'var(--green-l)', color: 'var(--green)', text: 'Approved' };
      case 'REJECTED': return { bg: 'var(--red-l)', color: 'var(--red)', text: 'Rejected' };
      default: return { bg: 'var(--gold-l)', color: 'var(--gold)', text: 'New / Pending' };
    }
  };

  const getLeaveTypeColor = (t: string) => {
    if (t.includes('Casual')) return 'var(--green)';
    if (t.includes('Maternity') || t.includes('Medical')) return 'var(--purple)';
    if (t.includes('Paternity')) return 'var(--gold)';
    return 'var(--blue)';
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* 🌟 Header Bar matching WorkDo Image 3 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>Dashboard</span> <span style={{ color: 'var(--ink3)' }}>/</span> <span style={{ color: 'var(--ink2)' }}>Leaves</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>
            Leaves
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button
            onClick={() => setShowNew(v => !v)}
            style={{ height: 38, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, borderRadius: 'var(--r)', padding: '0 16px', fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px hsl(var(--primary) / 0.3)' }}
          >
            <Icon name="plus" size={15} /> Add Leave
          </Button>
        </div>
      </div>

      {showNew && (
        <Card mb={0}>
          <form onSubmit={submitLeave} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Employee</label>
              <Combobox options={staff.map(s => ({ value: s.id, label: s.name }))} value={formPerson} onChange={setFormPerson} placeholder="Select employee" searchPlaceholder="Search people…" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Leave type</label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger aria-label="Leave type" style={{ width: 200 }}><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>From</label>
              <DatePicker date={parseDateOnly(formFrom)} onChange={d => setFormFrom(d ? toDateOnlyString(d) : '')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>To</label>
              <DatePicker date={parseDateOnly(formTo)} onChange={d => setFormTo(d ? toDateOnlyString(d) : '')} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Reason (optional)</label>
              <input value={formReason} onChange={e => setFormReason(e.target.value)} maxLength={2000} placeholder="e.g. Family event" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <PrimaryBtn label={formBusy ? 'Submitting…' : 'Submit request'} type="submit" />
            <ActionBtn label="Cancel" onClick={() => { setShowNew(false); setFormError(null); }} />
            {formError && <div role="alert" style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--red)' }}>{formError}</div>}
          </form>
        </Card>
      )}

      {/* Real KPI row — reads leaves/summary (year, pending_count,
          approved_count, on_leave_today, days_taken_ytd), a real endpoint
          this page was already calling and never rendering. Used to
          hardcode "Today Presents 94%", "Planned Leaves 12", "Unplanned
          Leaves 04", with Pending Requests falling back to a literal || 3. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { title: 'On leave today', count: String(leaveSummary?.on_leave_today ?? '—'), color: 'var(--blue)' },
          { title: `Approved (${summaryYear})`, count: String(leaveSummary?.approved_count ?? '—'), color: 'var(--gold)' },
          { title: `Days taken (${summaryYear})`, count: String(leaveSummary?.days_taken_ytd ?? '—'), color: 'var(--teal)' },
          { title: 'Pending requests', count: String(leaveSummary?.pending_count ?? leaves.filter(l => l.status === 'PENDING').length), color: 'var(--purple)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{k.title}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{k.count}</div>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: '50%', border: `4px solid ${k.color}`, borderTopColor: 'transparent', transform: 'rotate(-45deg)' }} />
          </div>
        ))}
      </div>

      {/* 📋 Main Data Table Container (WorkDo Leaves Style) */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
        {/* Table Filter Controls Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Employee's Leave</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', background: 'var(--card-sunken)', color: 'var(--ink)' }}
              />
            </div>

            <Button variant="outline" size="sm" onClick={downloadLeavesCsv} style={{ height: 34, fontSize: 12, borderRadius: 'var(--r)', borderColor: 'var(--border)' }}>
              Download Report
            </Button>

            <Select value={summaryYear} onValueChange={(y: string) => { setSummaryYear(y); loadSummary(y); }}>
              <SelectTrigger style={{ height: 34, borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 1, 2].map(back => {
                  const y = String(new Date().getFullYear() - back);
                  return <SelectItem key={y} value={y}>{y}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Name ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Leave Type ⇅</th>
                {/* Department column removed — /v1/hr/staff hardcodes dept:
                    '' (no user→department assignment exists anywhere in the
                    schema), so this rendered the fixed string "Software
                    Engineering" for every row. Same root cause, same fix, as
                    the earlier Payroll department column removal. */}
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Days ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Start ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>End ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Status ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Action ⇅</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No leave applications found.
                  </td>
                </tr>
              ) : (
                rows.map(l => {
                  const st = getStatusBadgeClass(l.status);
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar name={l.emp} size={30} userId={l.userId} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{l.emp}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: getLeaveTypeColor(l.type) }}>
                        {l.type}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {l.days} Days
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>
                        {l.from}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>
                        {l.to}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: st.bg, color: st.color }}>
                          {st.text} ∨
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {l.status === 'PENDING' ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button size="sm" onClick={() => handleStatus(l.id, 'APPROVED')} style={{ height: 26, fontSize: 11, padding: '0 8px' }}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleStatus(l.id, 'REJECTED')} style={{ height: 26, fontSize: 11, padding: '0 8px' }}>Reject</Button>
                          </div>
                        ) : (
                          <Icon name="moreHorizontal" size={18} color="var(--ink3)" style={{ cursor: 'pointer' }} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--ink2)' }}>
          <span>Showing 1 to {rows.length} of {leaves.length} entries</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button size="xs" variant="outline">«</Button>
            <Button size="xs" variant="outline">‹</Button>
            <Button size="xs">1</Button>
            <Button size="xs" variant="outline">2</Button>
            <Button size="xs" variant="outline">›</Button>
            <Button size="xs" variant="outline">»</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttendancePage() {
  const isMobile = useIsMobile();
  const [employees, setEmployees] = useState<ShiftEmployee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [view, setView] = useState<'grid' | 'member'>('grid');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEmpIds, setBulkEmpIds] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<{ empId: string, date: string } | null>(null);

  const loadStaff = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/staff');
      if (Array.isArray(data) && data.length > 0) {
        setEmployees(data.map((u: any): ShiftEmployee => ({
          id: u.id, name: u.name, department: u.dept || 'General', role: u.role, avatar: ini(u.name),
        })));
      }
    } catch { /* empty */ }
  }, []);

  const loadAttendance = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/attendance');
      if (Array.isArray(data)) {
        setRecords(data.map((a: any): AttendanceRecord => ({
          id: a.id, employeeId: a.user_id, date: String(a.date).slice(0, 10),
          clockIn: a.clock_in || '', clockOut: a.clock_out || '',
          status: mapAttStatus(a.status),
        })));
      }
    } catch { /* empty */ }
  }, []);

  useEffect(() => { loadStaff(); loadAttendance(); }, [loadStaff, loadAttendance]);

  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  const getDayFormat = (d: Date) => d.toISOString().split('T')[0];

  const monthFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const loadSummary = useCallback(async () => {
    try { setSummary(await apiFetch(`/v1/hr/attendance/summary?from=${monthFrom}&to=${monthTo}`)); }
    catch { setSummary(null); }
  }, [monthFrom, monthTo]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const filteredEmps = employees.filter(e => {
    if (filterDept && e.department !== filterDept) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const memberEmp = selectedEmpId ? employees.find(e => e.id === selectedEmpId) : filteredEmps[0];

  // Real per-day breakdown for the visible month — replaces a chart that
  // used to draw 12 fake bars from an index formula (40 + (idx % 3) * 15,
  // not attendance data at all). records isn't date-filtered by the fetch
  // itself, so this month's window is applied here.
  const monthRecords = records.filter(r => r.date >= monthFrom && r.date <= monthTo);
  const dailyBreakdown = days.map(d => {
    const dayStr = getDayFormat(d);
    const dayRecords = monthRecords.filter(r => r.date === dayStr);
    return {
      day: d.getDate(),
      present: dayRecords.filter(r => r.status === 'Present').length,
      late: dayRecords.filter(r => r.status === 'Late').length,
      absent: dayRecords.filter(r => r.status === 'Absent').length,
    };
  });
  const maxDailyTotal = Math.max(1, ...dailyBreakdown.map(d => d.present + d.late + d.absent));

  // Same real records, cut by status instead of by day — replaces the old
  // "Employee Type" donut, which hardcoded 800 Onsite / 105 Remote / 301
  // Hybrid with no such field anywhere in the schema.
  const statusCounts: Record<AttendanceStatus, number> = { Present: 0, Absent: 0, Late: 0, 'Half-Day': 0, 'On Leave': 0 };
  monthRecords.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1; });
  const totalMarked = monthRecords.length;
  const presentPct = totalMarked ? Math.round((statusCounts.Present / totalMarked) * 100) : 0;

  function downloadAttendanceCsv() {
    const headers = ['Employee', 'Date', 'Status', 'Clock in', 'Clock out'];
    const rows = monthRecords.map(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      return [emp?.name || r.employeeId, r.date, r.status, r.clockIn || '', r.clockOut || ''];
    });
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${year}-${String(month + 1).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const getStatusIcon = (s: AttendanceStatus) => {
    switch(s) {
      case 'Present': return 'check';
      case 'Absent': return 'x';
      case 'Late': return 'clock';
      case 'Half-Day': return 'pieChart';
      case 'On Leave': return 'coffee';
      default: return 'circle';
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* 🌟 Header Bar matching WorkDo Image 1 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>Dashboard</span> <span style={{ color: 'var(--ink3)' }}>/</span> <span style={{ color: 'var(--ink2)' }}>Attendance</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>
            Today, {date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button
            onClick={() => { setBulkEmpIds([]); setShowBulk(true); }}
            style={{ height: 38, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, borderRadius: 'var(--r)', padding: '0 16px', fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px hsl(var(--primary) / 0.3)' }}
          >
            <Icon name="plus" size={15} /> Add Employee
          </Button>
        </div>
      </div>

      {/* 📊 Top Charts & KPI Row (Attendance Rate + Employee Type Donut) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left Card: real daily Present/Late/Absent for the visible month */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Attendance rate — {date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
            <Button variant="outline" size="sm" onClick={downloadAttendanceCsv} style={{ height: 32, fontSize: 12, borderRadius: 'var(--r)', borderColor: 'var(--border)' }}>
              Download report
            </Button>
          </div>

          <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 3, padding: '10px 0', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
            {dailyBreakdown.map(d => {
              const total = d.present + d.late + d.absent;
              const scale = total ? (total / maxDailyTotal) * 130 : 0;
              const h1 = total ? (d.present / total) * scale : 0;
              const h2 = total ? (d.late / total) * scale : 0;
              const h3 = total ? (d.absent / total) * scale : 0;
              return (
                <div key={d.day} title={`${d.day}: ${d.present} present, ${d.late} late, ${d.absent} absent`}
                  style={{ flex: '1 0 auto', minWidth: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: 8, borderRadius: 'var(--r-sm)', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', height: `${Math.max(scale, 2)}px` }}>
                    <div style={{ height: `${h1}px`, background: 'var(--green)' }} />
                    <div style={{ height: `${h2}px`, background: 'var(--gold)' }} />
                    <div style={{ height: `${h3}px`, background: 'var(--ink3)' }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--ink3)' }}>{d.day}</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 12, color: 'var(--ink2)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)' }} /> Present</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)' }} /> Late</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ink3)' }} /> Absent</span>
          </div>
        </div>

        {/* Right Card: real status breakdown for the same month — replaces a
            donut that hardcoded 800 Onsite / 105 Remote / 301 Hybrid against
            a field ("work location") that doesn't exist anywhere in the schema. */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Attendance status</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '20px 0' }}>
            <svg width="180" height="100" viewBox="0 0 180 100">
              <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="var(--border)" strokeWidth="22" strokeLinecap="round" />
              <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="var(--green)" strokeWidth="22" strokeLinecap="round"
                strokeDasharray={`${(presentPct / 100) * 220} 220`} />
            </svg>
            <div style={{ position: 'absolute', bottom: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{presentPct}%</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Present</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 12, fontWeight: 600, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--green)' }}>● {statusCounts.Present} <span style={{ color: 'var(--ink2)', fontWeight: 400 }}>Present</span></span>
            <span style={{ color: 'var(--gold)' }}>● {statusCounts.Late} <span style={{ color: 'var(--ink2)', fontWeight: 400 }}>Late</span></span>
            <span style={{ color: 'var(--ink3)' }}>● {statusCounts.Absent} <span style={{ color: 'var(--ink2)', fontWeight: 400 }}>Absent</span></span>
          </div>
        </div>
      </div>

      {/* 📋 Main Data Table Container (WorkDo Style) */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
        {/* Table Filter Controls Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Employee Attendance</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', background: 'var(--card-sunken)', color: 'var(--ink)' }}
              />
            </div>

            <Button variant="outline" size="sm" style={{ height: 34, fontSize: 12, borderRadius: 'var(--r)', borderColor: 'var(--border)' }}>
              Download Report
            </Button>

            <Select defaultValue="2026">
              <SelectTrigger style={{ height: 34, borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Matrix Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', width: 180, position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 5 }}>
                  Employee Name ⇅
                </th>
                {days.slice(0, 31).map(d => (
                  <th key={d.toISOString()} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', minWidth: 30 }}>
                    {d.getDate()}
                  </th>
                ))}
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', minWidth: 80 }}>
                  Leave
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmps.length === 0 ? (
                <tr>
                  <td colSpan={33} style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No staff records found for this period.
                  </td>
                </tr>
              ) : (
                filteredEmps.map(emp => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', position: 'sticky', left: 0, background: 'var(--white)', zIndex: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PersonAvatar name={emp.name} size={28} userId={emp.id} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{emp.name}</span>
                    </td>
                    {days.slice(0, 31).map(d => {
                      const dStr = getDayFormat(d);
                      const rec = records.find(r => r.employeeId === emp.id && r.date === dStr);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      let bg = 'var(--white)';
                      let symbol = 'P';
                      if (isWeekend) { bg = 'var(--bg)'; symbol = 'W'; }
                      else if (rec?.status === 'Late') { bg = 'var(--gold-l)'; symbol = 'L'; }
                      else if (rec?.status === 'Absent') { bg = 'var(--red-l)'; symbol = 'A'; }
                      else if (rec?.status === 'Present') { bg = 'var(--green-l)'; symbol = 'P'; }
                      return (
                        <td key={dStr} style={{ textAlign: 'center', padding: 4, background: bg, fontSize: 11, fontWeight: 700, borderRight: '1px solid var(--border)' }}>
                          {symbol}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>
                      2 Days
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {view === 'member' && memberEmp && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {(() => {
              const memberRecords = days.map(d => records.find(x => x.employeeId === memberEmp.id && x.date === getDayFormat(d)));
              const wDays = days.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length;
              const p = memberRecords.filter(r => r?.status === 'Present').length;
              const l = memberRecords.filter(r => r?.status === 'Late').length;
              const a = memberRecords.filter(r => r?.status === 'Absent').length;
              return (
                <>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue-l)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Working Days</div><div style={{ fontSize: 20, fontWeight: 800 }}>{wDays}</div></div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--green-l)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Days Present</div><div style={{ fontSize: 20, fontWeight: 800 }}>{p}</div></div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gold-l)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="clock" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Late</div><div style={{ fontSize: 20, fontWeight: 800 }}>{l}</div></div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--red-l)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Absent</div><div style={{ fontSize: 20, fontWeight: 800 }}>{a}</div></div>
                  </div>
                </>
              );
            })()}
          </div>
          
          <Wrap>
            <thead><tr><TH>Date</TH><TH>Status</TH><TH>Clock In</TH><TH>Clock Out</TH><TH>Total</TH></tr></thead>
            <tbody>
              {days.map(d => {
                const dStr = getDayFormat(d);
                const a = records.find(x => x.employeeId === memberEmp.id && x.date === dStr);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                
                let total = '-';
                if (a && a.clockIn && a.clockOut) {
                  const [inH, inM] = a.clockIn.split(':').map(Number);
                  const [outH, outM] = a.clockOut.split(':').map(Number);
                  const diff = (outH * 60 + outM) - (inH * 60 + inM);
                  if (diff > 0) total = `${Math.floor(diff / 60)}h ${diff % 60}m`;
                }

                return (
                  <tr key={dStr} style={{ borderBottom: '1px solid var(--border)', background: isWeekend ? 'var(--bg)' : 'var(--white)' }}>
                    <TD bold>{d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</TD>
                    <TD>
                      {a ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-sm)', background: a.status === 'Present' ? 'var(--green-l)' : a.status === 'Late' ? 'var(--gold-l)' : 'var(--red-l)', color: a.status === 'Present' ? 'var(--green)' : a.status === 'Late' ? 'var(--gold)' : 'var(--red)', fontWeight: 700 }}>
                          {a.status}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{isWeekend ? 'Weekend' : 'No Record'}</span>
                      )}
                    </TD>
                    <TD mono>{a?.clockIn || '-'}</TD>
                    <TD mono>{a?.clockOut || '-'}</TD>
                    <TD mono bold>{total}</TD>
                  </tr>
                );
              })}
            </tbody>
          </Wrap>
        </div>
      )}

      {/* Bulk Assign Drawer */}
      {showBulk && (
        <Sheet open onOpenChange={o => { if (!o) setShowBulk(false); }}>
          <SheetContent className="w-100 sm:max-w-100 flex flex-col p-0 gap-0">
            <SheetHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <SheetTitle style={{ fontSize: 16 }}>Mark Attendance</SheetTitle>
            </SheetHeader>
            <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
              <form onSubmit={async e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const emps = bulkEmpIds;
                const sDate = fd.get('startDate') as string;
                const eDate = fd.get('endDate') as string;
                const stat = fd.get('status') as AttendanceStatus;
                const cIn = fd.get('clockIn') as string;
                const cOut = fd.get('clockOut') as string;
                if (emps.length && sDate && eDate && stat) {
                  setShowBulk(false);
                  try {
                    await apiFetch('/v1/hr/attendance/bulk', { method: 'POST', body: JSON.stringify({ user_ids: emps, from_date: sDate, to_date: eDate, status: toAttStatusApi(stat), clock_in: cIn || null, clock_out: cOut || null }) });
                    loadAttendance();
                  } catch (error: any) { showAlert(error?.message || 'Could not mark attendance.', { variant: 'error' }); }
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
                    <DatePicker name="startDate" defaultDate={new Date()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>End Date</label>
                    <DatePicker name="endDate" defaultDate={new Date()} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Status</label>
                  <Select name="status" required defaultValue="Present">
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Present">Present</SelectItem>
                      <SelectItem value="Absent">Absent</SelectItem>
                      <SelectItem value="Late">Late</SelectItem>
                      <SelectItem value="Half-Day">Half-Day</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Clock In</label>
                    <input type="time" name="clockIn" className="input-field" defaultValue="08:00" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Clock Out</label>
                    <input type="time" name="clockOut" className="input-field" defaultValue="17:00" />
                  </div>
                </div>

                <Button type="submit" className="w-full">Save Attendance</Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .hover-bg:hover td { background: var(--bg) !important; }
        td:hover .cell-hover-child { opacity: 1 !important; }
      `}} />
    </div>
  );
}