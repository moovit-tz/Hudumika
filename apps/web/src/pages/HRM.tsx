import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { EMPLOYEES } from '../data/staffData.js';
import type { EmpStatus, Employee } from '../data/staffData.js';
import { EMPLOYEES as SHIFT_EMPLOYEES, SHIFT_TYPES } from '../data/hrmData.js';
import type { AttendanceStatus, AttendanceRecord, ShiftType, ShiftAssignment, Employee as ShiftEmployee } from '../data/hrmData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { MultiSelectFilter } from '../components/ui/filter-dropdown.js';
import { DatePicker } from '../components/ui/date-picker.js';

function mapAttStatus(s: string): AttendanceStatus {
  switch (s) {
    case 'PRESENT':  return 'Present';
    case 'ABSENT':   return 'Absent';
    case 'LATE':     return 'Late';
    case 'HALF_DAY': return 'Half-Day';
    case 'ON_LEAVE': return 'On Leave';
    default:         return 'Present';
  }
}
function toAttStatusApi(s: AttendanceStatus): string { return s.toUpperCase().replace('-', '_'); }

/* -- Types -- */
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type AttStatus  = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE';
type PayStatus  = 'PAID' | 'PENDING' | 'PROCESSING';

/* -- Mock data -- */

const LEAVE_TYPES = ['Annual Leave','Sick Leave','Casual Leave','Maternity Leave','Emergency Leave'];

const ATT = [
  { emp:'Amina Hassan',  date:'2026-06-14', in:'08:02', out:'17:05', hrs:9.1, status:'PRESENT' as AttStatus },
  { emp:'John Baraka',   date:'2026-06-14', in:'07:58', out:'17:00', hrs:9.0, status:'PRESENT' as AttStatus },
  { emp:'Grace Mwamba',  date:'2026-06-14', in:'-',     out:'-',     hrs:0,   status:'ON_LEAVE' as AttStatus },
  { emp:'Said Ali',      date:'2026-06-14', in:'09:22', out:'17:00', hrs:7.6, status:'LATE'    as AttStatus },
  { emp:'Fatuma Juma',   date:'2026-06-14', in:'08:00', out:'17:02', hrs:9.0, status:'PRESENT' as AttStatus },
  { emp:'David Mlay',    date:'2026-06-14', in:'08:10', out:'17:05', hrs:8.9, status:'PRESENT' as AttStatus },
  { emp:'Rose Kimaro',   date:'2026-06-14', in:'07:55', out:'17:00', hrs:9.1, status:'PRESENT' as AttStatus },
  { emp:'Omar Shariff',  date:'2026-06-14', in:'-',     out:'-',     hrs:0,   status:'ABSENT'  as AttStatus },
];

const SHIFTS = [
  { name:'Morning Shift',   start:'06:00', end:'14:00', break:'30 min', employees:12 },
  { name:'Day Shift',       start:'08:00', end:'17:00', break:'60 min', employees:24 },
  { name:'Afternoon Shift', start:'14:00', end:'22:00', break:'30 min', employees:8  },
  { name:'Night Shift',     start:'22:00', end:'06:00', break:'60 min', employees:4  },
];


/* -- TZ PAYE Formula -- */
function calcPAYE(gross: number): number {
  if (gross < 270000)  return 0;
  if (gross < 520000)  return Math.round((gross - 270000) * 0.08);
  if (gross < 760000)  return Math.round((gross - 520000) * 0.20 + 20000);
  if (gross < 1000000) return Math.round((gross - 760000) * 0.25 + 68000);
  return Math.round((gross - 1000000) * 0.30 + 128000);
}
function calcNSSF(basic: number): number { return Math.round(basic * 0.10); }

/* -- Payslip Modal -- */
type PayslipRow = { emp: string; basic: number; allow: number; ded: number; status: string };

function PayslipModal({ row, monthLabel, onClose }: { row: PayslipRow; monthLabel: string; onClose: () => void }) {
  const gross = row.basic + row.allow;
  const paye  = calcPAYE(gross);
  const nssf  = calcNSSF(row.basic);
  const other = Math.max(0, row.ded - paye - nssf);
  const net   = gross - row.ded;

  return (
    <>
      {/* Print styles */}
      <style>{`@media print { .no-print { display: none !important; } body * { visibility: hidden; } #payslip-root, #payslip-root * { visibility: visible; } #payslip-root { position: fixed; inset: 0; background: #fff; } }`}</style>

      {/* Backdrop */}
      <div className="no-print" onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div id="payslip-root" onClick={e => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: 8, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', fontFamily: 'Arial, sans-serif' }}>

          {/* Actions bar */}
          <div className="no-print" style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}
              style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <Icon name="printer" size={14} /> Print / Save PDF
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ fontSize: 13 }}>Close</button>
          </div>

          {/* Payslip body */}
          <div style={{ padding: '32px 40px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 20, borderBottom: '2px solid #0891b2' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>Moovit Logistics Ltd</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Plot 15 Haile Selassie Road, Dar es Salaam</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>TIN: 100-200-300</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0891b2', letterSpacing: '0.05em' }}>PAYSLIP</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{monthLabel}</div>
              </div>
            </div>

            {/* Employee info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, padding: '14px 16px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              {[
                ['Employee', row.emp],
                ['Employee ID', 'EMP-' + row.emp.split(' ').map(w => w[0]).join('').toUpperCase() + '-001'],
                ['Pay Period', monthLabel],
                ['Payment Mode', 'Bank Transfer'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Earnings & Deductions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Earnings */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, padding: '6px 12px', background: 'rgba(8,145,178,0.06)', borderRadius: 4 }}>Earnings</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      { label: 'Basic Salary',   amount: row.basic },
                      { label: 'Allowances',      amount: row.allow },
                    ].map(r => (
                      <tr key={r.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '7px 4px', fontSize: 13, color: '#374151' }}>{r.label}</td>
                        <td style={{ padding: '7px 4px', fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>TZS {r.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '10px 4px', fontSize: 13, fontWeight: 700, color: '#1e293b', borderTop: '2px solid #e2e8f0' }}>Gross Pay</td>
                      <td style={{ padding: '10px 4px', fontSize: 14, fontWeight: 800, color: '#0891b2', textAlign: 'right', borderTop: '2px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>TZS {gross.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Deductions */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, padding: '6px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 4 }}>Deductions</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      { label: 'PAYE (Tax)',   amount: paye, note: paye === 0 ? 'Below threshold' : '' },
                      { label: 'NSSF (10%)',  amount: nssf },
                      ...(other > 0 ? [{ label: 'Other', amount: other }] : []),
                    ].map(r => (
                      <tr key={r.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '7px 4px', fontSize: 13, color: '#374151' }}>{r.label}{r.note ? <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>{r.note}</span> : null}</td>
                        <td style={{ padding: '7px 4px', fontSize: 13, fontWeight: 600, color: '#ef4444', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>TZS {r.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '10px 4px', fontSize: 13, fontWeight: 700, color: '#1e293b', borderTop: '2px solid #e2e8f0' }}>Total Deductions</td>
                      <td style={{ padding: '10px 4px', fontSize: 14, fontWeight: 800, color: '#ef4444', textAlign: 'right', borderTop: '2px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>TZS {row.ded.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Net Pay */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderRadius: 8, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Net Pay</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>After all deductions — {monthLabel}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                TZS {net.toLocaleString()}
              </div>
            </div>

            {/* PAYE Note */}
            <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: 6, marginBottom: 20, fontSize: 11, color: '#713f12' }}>
              <strong>PAYE calculated per TRA Tanzania rates:</strong> 0% up to TZS 270,000 — 8% (270k—520k) — 20% (520k—760k) — 25% (760k—1M) — 30% above TZS 1,000,000
            </div>

            {/* Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 32, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ height: 40, borderBottom: '1px solid #94a3b8', marginBottom: 6 }} />
                <div style={{ fontSize: 11, color: '#64748b' }}>Employee Signature</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>{row.emp}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ height: 40, borderBottom: '1px solid #94a3b8', marginBottom: 6 }} />
                <div style={{ fontSize: 11, color: '#64748b' }}>Authorised By</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>HR / Finance Manager</div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: '#94a3b8' }}>
              This is a computer-generated payslip — Moovit ClearOS — Generated on {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}





/* -- Shared helpers -- */
const AVATAR_COLORS = ['#e8461a','#0891b2','#7c3aed','#059669','#d97706','#9333ea'];
function avatarColor(n: string) { return AVATAR_COLORS[[...n].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]; }
function ini(n: string) { return n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }
function fmtTZS(n: number) { return 'TZS ' + n.toLocaleString(); }

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', flexShrink:0, background:avatarColor(name), color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.35, fontWeight:800 }}>
      {ini(name)}
    </div>
  );
}

const S: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:     { bg:'rgba(16,185,129,.12)',  color:'var(--green)', label:'Active'     },
  INACTIVE:   { bg:'rgba(148,163,184,.12)', color:'var(--ink3)',  label:'Inactive'   },
  ON_LEAVE:   { bg:'rgba(245,158,11,.12)',  color:'var(--gold)',  label:'On Leave'   },
  APPROVED:   { bg:'rgba(59,130,246,.12)',  color:'var(--blue)',  label:'Approved'   },
  REJECTED:   { bg:'rgba(239,68,68,.12)',   color:'var(--red)',   label:'Rejected'   },
  PENDING:    { bg:'rgba(245,158,11,.12)',  color:'var(--gold)',  label:'Pending'    },
  CANCELLED:  { bg:'rgba(148,163,184,.12)', color:'var(--ink3)', label:'Cancelled'  },
  PAID:       { bg:'rgba(16,185,129,.12)',  color:'var(--green)', label:'Paid'       },
  PROCESSING: { bg:'rgba(59,130,246,.12)',  color:'var(--blue)',  label:'Processing' },
  PRESENT:    { bg:'rgba(16,185,129,.12)',  color:'var(--green)', label:'Present'    },
  ABSENT:     { bg:'rgba(239,68,68,.12)',   color:'var(--red)',   label:'Absent'     },
  LATE:       { bg:'rgba(245,158,11,.12)',  color:'var(--gold)',  label:'Late'       },
  HALF_DAY:   { bg:'rgba(59,130,246,.12)',  color:'var(--blue)',  label:'Half Day'   },
  SUCCESS:    { bg:'rgba(16,185,129,.12)',  color:'var(--green)', label:'Success'    },
  FAILED:     { bg:'rgba(239,68,68,.12)',   color:'var(--red)',   label:'Failed'     },
  EXPIRED:    { bg:'rgba(148,163,184,.12)', color:'var(--ink3)', label:'Expired'    },
  ACCEPTED:   { bg:'rgba(16,185,129,.12)',  color:'var(--green)', label:'Accepted'   },
};

function Badge({ status }: { status: string }) {
  const c = S[status] ?? { bg:'var(--bg)', color:'var(--ink2)', label: status };
  return <span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:c.bg, color:c.color, whiteSpace:'nowrap' }}>{c.label}</span>;
}

function PageHeader({ icon, title, sub, children, backTo }: { icon: IconName; title: string; sub?: string; children?: React.ReactNode; backTo?: string }) {
  return (
    <div style={{ marginBottom:20, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        {backTo !== undefined && (
          <Link to={backTo || '/nexushr'} title="Go back"
            style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'var(--white)', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
            <Icon name="arrowLeft" size={15} color="var(--ink2)" />
          </Link>
        )}
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'var(--ink)', margin:'0 0 4px', display:'flex', alignItems:'center', gap:10 }}>
            <Icon name={icon} size={20} strokeWidth={2.2} color="var(--teal)" />
            {title}
          </h1>
          {sub && <p style={{ fontSize:13, color:'var(--ink3)', margin:0 }}>{sub}</p>}
        </div>
      </div>
      {children && <div style={{ display:'flex', gap:8 }}>{children}</div>}
    </div>
  );
}

function Card({ children, mb = 16 }: { children: React.ReactNode; mb?: number }) {
  return <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', overflow:'hidden', marginBottom:mb }}>{children}</div>;
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{ padding:'10px 14px', textAlign:right?'right':'left', fontWeight:600, color:'var(--ink2)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.4px', background:'var(--bg)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>
    {children}
  </th>
);
const TD = ({ children, mono, right, muted, bold }: { children: React.ReactNode; mono?: boolean; right?: boolean; muted?: boolean; bold?: boolean }) => (
  <td style={{ padding:'11px 14px', textAlign:right?'right':'left', color:muted?'var(--ink3)':'var(--ink)', fontFamily:mono?'var(--mono)':undefined, fontSize:muted?12:13, fontWeight:bold?700:undefined }}>
    {children}
  </td>
);

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <Card><div className="rtbl-wrap">
      <table className="rtbl">{children}</table>
    </div></Card>
  );
}

function PrimaryBtn({ label, icon, onClick, type = 'button' }: { label: string; icon?: IconName; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button type={type} className="btn btn-primary" onClick={onClick} style={{ display:'flex', alignItems:'center', gap:6 }}>
      {icon && <Icon name={icon} size={13} color="#fff" />}
      {label}
    </button>
  );
}

function ActionBtn({ label, color = 'var(--teal)', onClick }: { label: string; color?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ fontSize:11.5, padding:'3px 9px', borderRadius:6, border:`1px solid ${color}`, color, background:'none', cursor:'pointer', fontFamily:'var(--font)', fontWeight:600, marginRight:4 }}>
      {label}
    </button>
  );
}

/* -- Sub-pages -- */

export function EmployeesPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [search,    setSearch]    = useState('');
  const [deptF,     setDeptF]     = useState('');
  const [statusF,   setStatusF]   = useState('');
  const [viewMode,  setViewMode]  = useState<'list' | 'grid'>('list');
  const [showOnboard, setShowOnboard] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/hr/staff');
      setEmployees((Array.isArray(data) ? data : []).map((u: any): Employee => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone || '',
        // Em dash, not 'Operations'/'Officer'. Those defaults gave every
        // unassigned person a department this tenant has never created and a
        // job title nobody gave them — indistinguishable, in the table, from
        // someone genuinely assigned to Operations.
        dept: u.dept || '—', designation: u.designation || '—',
        role: u.role, status: (u.status || 'ACTIVE') as EmpStatus,
        hireDate: u.hireDate || (u.created_at ? String(u.created_at).split('T')[0] : ''),
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const depts = [...new Set(employees.map(e => e.dept))];
  const rows  = employees.filter(e =>
    (!search   || e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase())) &&
    (!deptF    || e.dept   === deptF) &&
    (!statusF  || e.status === statusF)
  );

  const STATUS_CHIPS = [
    { key: '',         label: 'All Members',  count: employees.length },
    { key: 'ACTIVE',   label: 'Active',        count: employees.filter(e => e.status === 'ACTIVE').length },
    { key: 'ON_LEAVE', label: 'On Leave',      count: employees.filter(e => e.status === 'ON_LEAVE').length },
    { key: 'INACTIVE', label: 'Inactive',      count: employees.filter(e => e.status === 'INACTIVE').length },
  ];

  const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    Manager:      { bg: 'var(--purple-l)', color: 'var(--purple)' },
    Officer:      { bg: 'var(--teal-l)', color: 'var(--teal)' },
    Finance:      { bg: 'rgba(16,185,129,.12)', color: 'var(--green)' },
    'Tenant Admin': { bg: 'var(--purple-l)', color: 'var(--purple)' },
  };
  function roleColor(role: string) { return ROLE_COLORS[role] || { bg: 'var(--bg)', color: 'var(--ink3)' }; }
  function statusBar(s: EmpStatus) { return s === 'ACTIVE' ? '#10b981' : s === 'ON_LEAVE' ? 'var(--gold)' : 'var(--ink3)'; }

  return (
    <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader icon="users" title="Manage Staff" sub={`${employees.filter(e => e.status === 'ACTIVE').length} active — ${employees.length} total`} backTo="/nexushr">
        <PrimaryBtn label="Invite User" icon="userPlus" onClick={() => setShowOnboard(true)} />
      </PageHeader>

      <MetricsRow cards={[
        { title: 'Total Staff',    value: String(employees.length),                                          trend: 12, sub1Label: 'ACTIVE',   sub1Value: String(employees.filter(e => e.status === 'ACTIVE').length),   sub2Label: 'ON LEAVE', sub2Value: String(employees.filter(e => e.status === 'ON_LEAVE').length), bars: spark(100, 15, 'up'),   barColor: 'var(--blue-l)',  barHighlight: 'var(--blue)'  },
        { title: 'New This Month', value: '2',                                                               trend: 0,  sub1Label: 'DEPT',      sub1Value: String(depts.length),                                           sub2Label: 'ROLES',    sub2Value: '4',                                                       bars: spark(101, 15, 'flat'), barColor: 'var(--green-l)', barHighlight: 'var(--green)' },
        { title: 'Inactive',       value: String(employees.filter(e => e.status === 'INACTIVE').length),     trend: -5, sub1Label: 'PENDING',   sub1Value: '1',                                                            sub2Label: 'LEFT YTD', sub2Value: '2',                                               bars: spark(102, 15, 'down'), barColor: 'var(--red-l)',   barHighlight: 'var(--red)'   },
      ]} />

      {/* -- Toolbar -- */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Status chips */}
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUS_CHIPS.map(chip => (
            <button key={chip.key} type="button" onClick={() => setStatusF(chip.key)}
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font)', background: statusF === chip.key ? 'var(--teal)' : 'var(--bg)', color: statusF === chip.key ? '#fff' : 'var(--ink3)', display: 'flex', gap: 5, alignItems: 'center' }}>
              {chip.label}
              <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 9, background: statusF === chip.key ? 'rgba(255,255,255,.25)' : 'var(--border)', color: statusF === chip.key ? '#fff' : 'var(--ink3)' }}>{chip.count}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', width: 260 }}>
          <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email—"
            style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid var(--border)', borderRadius: 9, fontFamily: 'var(--font)', fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' as const }} />
        </div>

        {/* Dept filter */}
        <Select value={deptF || '__all__'} onValueChange={v => setDeptF(v === '__all__' ? '' : v)}>
          <SelectTrigger style={{ width: 'auto', padding: '7px 10px', height: 'auto' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Departments</SelectItem>
            {depts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          {(['list', 'grid'] as const).map(mode => (
            <button key={mode} type="button" title={mode === 'list' ? 'List view' : 'Card grid view'} onClick={() => setViewMode(mode)}
              style={{ padding: '7px 11px', border: 'none', cursor: 'pointer', background: viewMode === mode ? 'var(--teal)' : 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}>
              <Icon name={mode === 'list' ? 'list' : 'grid'} size={15} color={viewMode === mode ? '#fff' : 'var(--ink3)'} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
        Showing {rows.length} of {employees.length} members
      </div>

      {/* -- Grid View -- */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16, marginBottom: 16 }}>
          {rows.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--ink3)', fontSize: 14 }}>No staff match current filters.</div>}
          {rows.map(e => {
            const rCol = roleColor(e.role);
            return (
              <Link key={e.id} to={'/nexushr/staff/' + e.id} style={{ display: 'block', background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ height: 3, background: statusBar(e.status) }} />
                <div style={{ padding: '18px 16px 12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    <Avatar name={e.name} size={60} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginBottom: 2 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginBottom: 8 }}>{e.designation}</div>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink3)', fontWeight: 600 }}>{e.dept}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: rCol.bg, color: rCol.color, fontWeight: 700 }}>{e.role}</span>
                    <Badge status={e.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Icon name="mail" size={10} color="var(--ink3)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{e.email}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Icon name="phone" size={10} color="var(--ink3)" />
                      {e.phone}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* -- List / Table View -- */
        <Wrap>
          <thead>
            <tr><TH>Employee</TH><TH>Department</TH><TH>Designation</TH><TH>Role</TH><TH>Hired</TH><TH>Status</TH></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No staff match current filters.</td></tr>}
            {rows.map(e => {
              const rCol = roleColor(e.role);
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => navigate('/nexushr/staff/' + e.id)}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = '')}>
                  <TD>
                    <Link to={'/nexushr/staff/' + e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar name={e.name} size={34} />
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: statusBar(e.status), border: '2px solid var(--white)' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>{e.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{e.email}</div>
                      </div>
                    </Link>
                  </TD>
                  <TD muted>{e.dept}</TD>
                  <TD>{e.designation}</TD>
                  <TD><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: rCol.bg, color: rCol.color, fontWeight: 700 }}>{e.role}</span></TD>
                  <TD muted>{new Date(e.hireDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</TD>
                  <TD><Badge status={e.status} /></TD>
                </tr>
              );
            })}
          </tbody>
        </Wrap>
      )}

      {/* -- Invite / Onboard Modal -- */}
      {showOnboard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: 32, width: 460, maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Invite New Staff</h2>
              <button type="button" title="Close" onClick={() => setShowOnboard(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Icon name="x" size={20} color="var(--ink3)" /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 24px' }}>Sends an email invite. They'll set their own name and password when they accept.</p>

            <form onSubmit={async e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const email = fd.get('email') as string;
              const role = fd.get('role') as string;
              if (!email || !role) return;
              try {
                await apiFetch('/v1/hr/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
                setShowOnboard(false);
              } catch { /* ignore */ }
            }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Work Email</label>
                <input name="email" type="email" required placeholder="john@company.com" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 9, boxSizing: 'border-box' as const, fontFamily: 'var(--font)' }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>System Role</label>
                <Select name="role" required defaultValue="OFFICER">
                  <SelectTrigger style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFFICER">Officer</SelectItem>
                    <SelectItem value="SENIOR">Senior Officer</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="FINANCE">Finance</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="TENANT_ADMIN">Tenant Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowOnboard(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Send Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Roles & Permissions (full implementation) ------------- */

const ROLE_META: Record<string, { color: string; bg: string; desc: string; label: string }> = {
  ADMIN:       { color:'var(--purple)', bg:'var(--purple-l)', label:'Admin',          desc:'Full access to all modules except super-admin settings' },
  MANAGER:     { color:'var(--blue)', bg:'var(--blue-l)', label:'Manager',        desc:'Manage teams, approve workflows, view all reports'      },
  FINANCE:     { color:'var(--green)', bg:'var(--green-l)', label:'Finance',        desc:'Finance module: invoices, payments, payroll, reports'   },
  SALES:       { color:'var(--gold)', bg:'var(--gold-l)', label:'Sales',          desc:'Sales pipeline, CRM, leads and customer management'     },
  SENIOR:      { color:'var(--blue)', bg:'var(--blue-l)', label:'Senior Officer', desc:'Senior ops: all shipments, clearance, docs'             },
  JUNIOR:      { color:'var(--ink3)', bg:'var(--bg)', label:'Junior Officer', desc:'Entry-level: assigned clearance tasks, limited access'  },
  OFFICER:     { color:'var(--ink3)', bg:'var(--bg)', label:'Officer',        desc:'Core operations: shipments, clearing, invoicing'        },
  TENANT_ADMIN:{ color:'var(--purple)', bg:'var(--purple-l)', label:'Tenant Admin',  desc:'Full tenant access including billing and settings'      },
};

const RESOURCE_LABELS: Record<string, string> = {
  shipments:'Shipments', clearance:'Customs & Clearance', finance:'Finance & Billing',
  hr:'HR & People', sales:'Sales', crm:'CRM & Customers',
  documents:'Documents', reports:'Reports & Analytics', settings:'System Settings',
};
const RESOURCES = Object.keys(RESOURCE_LABELS);
const ACTIONS   = ['view','create','edit','delete','approve','export'];
const ACTION_COLORS: Record<string,string> = {
  view:'var(--teal)', create:'var(--green)', edit:'var(--gold)',
  delete:'var(--red)', approve:'var(--purple)', export:'#0ea5e9',
};

interface PermRow { id?: string; role: string; resource: string; action: string; allowed: boolean }

export function RolesPage() {
  const navigate = useNavigate();
  const [perms,     setPerms]     = useState<PermRow[]>([]);
  const [userCounts,setUserCounts]= useState<Record<string,number>>({});
  const [selected,  setSelected]  = useState<string | null>(null); // selected role key
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([
        apiFetch('/v1/permissions'),
        apiFetch('/v1/permissions/users-by-role'),
      ]);
      if (Array.isArray(p)) setPerms(p);
      if (Array.isArray(u)) {
        const m: Record<string,number> = {};
        u.forEach((r: any) => { m[r.role] = Number(r.count); });
        setUserCounts(m);
      }
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function isAllowed(role: string, resource: string, action: string) {
    return perms.find(p => p.role === role && p.resource === resource && p.action === action)?.allowed ?? false;
  }

  function toggle(role: string, resource: string, action: string) {
    setPerms(prev => {
      const exists = prev.find(p => p.role === role && p.resource === resource && p.action === action);
      if (exists) return prev.map(p => p.role === role && p.resource === resource && p.action === action ? { ...p, allowed: !p.allowed } : p);
      return [...prev, { role, resource, action, allowed: true }];
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/permissions', { method: 'PATCH', body: JSON.stringify({ permissions: perms }) });
      setDirty(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  const roles = Object.entries(ROLE_META);
  const selMeta = selected ? ROLE_META[selected] : null;

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="shield" title="Roles & Permissions" sub="Manage access control for each role across all modules" backTo="/nexushr">
        {dirty && (
          <button type="button" onClick={save} disabled={saving}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'none', background:'var(--teal)', color:'#fff', fontWeight:700, fontSize:13, fontFamily:'var(--font)', cursor:'pointer' }}>
            <Icon name="save" size={14} color="#fff" />{saving ? 'Saving—' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      {/* Role cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16, marginBottom:28 }}>
        {roles.map(([key, meta]) => {
          const allowed = perms.filter(p => p.role === key && p.allowed).length;
          const total   = RESOURCES.length * ACTIONS.length;
          const pct     = total > 0 ? Math.round((allowed / total) * 100) : 0;
          const isActive = selected === key;
          return (
            <div key={key} onClick={() => setSelected(isActive ? null : key)}
              style={{ background:'var(--white)', borderRadius:10, border:`2px solid ${isActive ? meta.color : 'var(--border)'}`,
                padding:20, cursor:'pointer', transition:'all 0.15s',
                boxShadow: isActive ? '0 4px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="shield" size={22} color={meta.color} strokeWidth={1.8} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:14, color:'var(--ink)' }}>{meta.label}</div>
                  <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>
                    {userCounts[key] ?? 0} {(userCounts[key] ?? 0) === 1 ? 'user' : 'users'}
                  </div>
                </div>
                {isActive && <Icon name="check" size={16} color={meta.color} />}
              </div>
              <p style={{ fontSize:12, color:'var(--ink3)', margin:'0 0 12px', lineHeight:1.5 }}>{meta.desc}</p>
              <div style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:11, color:'var(--ink3)' }}>Access level</span>
                  <span style={{ fontSize:11, fontWeight:700, color:meta.color }}>{pct}%</span>
                </div>
                <div style={{ height:5, borderRadius:3, background:'var(--border)' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:meta.color, borderRadius:3, transition:'width 0.5s' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {RESOURCES.slice(0,4).map(r => {
                  const hasView = isAllowed(key, r, 'view');
                  return (
                    <span key={r} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, fontWeight:600,
                      background: hasView ? meta.bg : 'var(--bg)',
                      color: hasView ? meta.color : 'var(--ink3)' }}>
                      {RESOURCE_LABELS[r]}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission matrix for selected role */}
      {selected && selMeta && (
        <div style={{ background:'var(--white)', borderRadius:10, border:`1px solid var(--border)`, overflow:'hidden', marginBottom:24 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12,
            background: selMeta.bg }}>
            <div style={{ width:34, height:34, borderRadius:8, background:selMeta.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon name="shield" size={17} color={selMeta.color} />
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--ink)' }}>{selMeta.label} — Permission Matrix</div>
              <div style={{ fontSize:11.5, color:'var(--ink3)' }}>Click checkboxes to grant or revoke access. Save when done.</div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, color:'var(--ink3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', width:180 }}>Module</th>
                  {ACTIONS.map(a => (
                    <th key={a} style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:ACTION_COLORS[a], fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)' }}>
                      {a}
                    </th>
                  ))}
                  <th style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:'var(--ink3)', fontSize:11, borderBottom:'1px solid var(--border)' }}>All</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((res, ri) => {
                  const allOn = ACTIONS.every(a => isAllowed(selected, res, a));
                  return (
                    <tr key={res} style={{ borderBottom:'1px solid var(--border)', background: ri % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                      <td style={{ padding:'10px 16px', fontWeight:600, color:'var(--ink)', fontSize:13 }}>
                        {RESOURCE_LABELS[res]}
                      </td>
                      {ACTIONS.map(a => {
                        const on = isAllowed(selected, res, a);
                        return (
                          <td key={a} style={{ padding:'8px 12px', textAlign:'center' }}>
                            <button type="button" onClick={() => toggle(selected, res, a)}
                              style={{ width:22, height:22, borderRadius:5, border:`2px solid ${on ? selMeta.color : 'var(--border)'}`,
                                background: on ? selMeta.color : 'transparent', cursor:'pointer',
                                display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all 0.12s' }}>
                              {on && <Icon name="check" size={11} color="#fff" />}
                            </button>
                          </td>
                        );
                      })}
                      <td style={{ padding:'8px 12px', textAlign:'center' }}>
                        <button type="button" onClick={() => ACTIONS.forEach(a => {
                          const on = isAllowed(selected, res, a);
                          if (on !== !allOn) toggle(selected, res, a);
                        })}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6, border:'none', cursor:'pointer',
                            background: allOn ? selMeta.bg : 'var(--bg)', color: allOn ? selMeta.color : 'var(--ink3)', fontFamily:'var(--font)' }}>
                          {allOn ? 'Revoke all' : 'Grant all'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users table */}
      <div style={{ background:'var(--white)', borderRadius:10, border:'1px solid var(--border)', overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Staff by Role</span>
          <Link to="/nexushr/employees"
            style={{ fontSize:11, fontWeight:600, color:'var(--teal)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font)', textDecoration:'none' }}>
            Manage Staff ?
          </Link>
        </div>
        <div style={{ padding:'8px 0' }}>
          {roles.map(([key, meta]) => {
            const count = userCounts[key] ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / Math.max(1, Object.values(userCounts).reduce((a,b) => a+b, 0))) * 100);
            return (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:14, padding:'9px 18px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:32, height:32, borderRadius:8, background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="shield" size={15} color={meta.color} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:3 }}>{meta.label}</div>
                  <div style={{ height:4, borderRadius:2, background:'var(--border)' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:meta.color, borderRadius:2 }} />
                  </div>
                </div>
                <span style={{ fontSize:13, fontWeight:800, color:meta.color, minWidth:24, textAlign:'right' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PermissionsPage() {
  const [perms,  setPerms]  = useState<PermRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await apiFetch('/v1/permissions');
      if (Array.isArray(p)) setPerms(p);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function isAllowed(role: string, resource: string, action: string) {
    return perms.find(p => p.role === role && p.resource === resource && p.action === action)?.allowed ?? false;
  }

  function toggle(role: string, resource: string, action: string) {
    setPerms(prev => {
      const exists = prev.find(p => p.role === role && p.resource === resource && p.action === action);
      if (exists) return prev.map(p => p.role === role && p.resource === resource && p.action === action ? { ...p, allowed: !p.allowed } : p);
      return [...prev, { role, resource, action, allowed: true }];
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/permissions', { method:'PATCH', body: JSON.stringify({ permissions: perms }) });
      setDirty(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  const displayRoles = Object.entries(ROLE_META).filter(([k]) => !['TENANT_ADMIN'].includes(k));
  const filteredRes  = RESOURCES.filter(r => !filter || RESOURCE_LABELS[r].toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="key" title="Permission Matrix" sub="Full cross-role permission overview — toggle access per module and action" backTo="/nexushr">
        {dirty && (
          <button type="button" onClick={save} disabled={saving}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'none', background:'var(--teal)', color:'#fff', fontWeight:700, fontSize:13, fontFamily:'var(--font)', cursor:'pointer' }}>
            <Icon name="save" size={14} color="#fff" />{saving ? 'Saving—' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      {/* Filter */}
      <div style={{ marginBottom:16, maxWidth:340 }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter modules—"
          style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'var(--font)', color:'var(--ink)', background:'var(--white)', boxSizing:'border-box' as const }} />
      </div>

      <div style={{ background:'var(--white)', borderRadius:10, border:'1px solid var(--border)', overflow:'hidden', marginBottom:24 }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--bg)' }}>
                <th style={{ padding:'12px 16px', textAlign:'left', fontWeight:700, color:'var(--ink3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', position:'sticky', left:0, background:'var(--bg)', minWidth:160 }}>
                  Module / Action
                </th>
                {displayRoles.map(([key, meta]) => (
                  <th key={key} colSpan={ACTIONS.length}
                    style={{ padding:'10px 8px', textAlign:'center', borderBottom:'1px solid var(--border)', borderLeft:'2px solid var(--border)', background:meta.bg }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:meta.color }} />
                      <span style={{ fontSize:11, fontWeight:800, color:meta.color }}>{meta.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
              <tr style={{ background:'var(--white)' }}>
                <th style={{ padding:'6px 16px', borderBottom:'1px solid var(--border)', position:'sticky', left:0, background:'var(--white)' }} />
                {displayRoles.map(([key, meta]) =>
                  ACTIONS.map(a => (
                    <th key={`${key}-${a}`} style={{ padding:'5px 4px', textAlign:'center', borderBottom:'1px solid var(--border)', borderLeft: a === 'view' ? '2px solid var(--border)' : undefined }}>
                      <span style={{ fontSize:9, fontWeight:700, color:ACTION_COLORS[a], textTransform:'uppercase' }}>{a.slice(0,3)}</span>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRes.map((res, ri) => (
                <tr key={res} style={{ borderBottom:'1px solid var(--border)', background: ri % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:600, color:'var(--ink)', fontSize:13, position:'sticky', left:0, background: ri % 2 === 0 ? 'var(--white)' : 'var(--bg)', whiteSpace:'nowrap' }}>
                    {RESOURCE_LABELS[res]}
                  </td>
                  {displayRoles.map(([key, meta]) =>
                    ACTIONS.map(a => {
                      const on = isAllowed(key, res, a);
                      return (
                        <td key={`${key}-${a}`} style={{ padding:'6px 4px', textAlign:'center', borderLeft: a === 'view' ? '2px solid var(--border)' : undefined }}>
                          <button type="button" onClick={() => toggle(key, res, a)}
                            style={{ width:20, height:20, borderRadius:4, border:`2px solid ${on ? meta.color : 'var(--border)'}`,
                              background: on ? meta.color : 'transparent', cursor:'pointer',
                              display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all 0.1s' }}>
                            {on && <Icon name="check" size={10} color="#fff" />}
                          </button>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
        {ACTIONS.map(a => (
          <div key={a} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:12, height:12, borderRadius:3, background:ACTION_COLORS[a] }} />
            <span style={{ fontSize:12, color:'var(--ink2)', fontWeight:600 }}>{a.charAt(0).toUpperCase() + a.slice(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DeleteReqRow = { id: string; user_name: string; user_email: string; requested_by_name: string; reason: string | null; status: string; created_at: string };

export function DeleteRequestsPage() {
  const [reqs, setReqs] = useState<DeleteReqRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setReqs(await apiFetch('/v1/hr/delete-requests')); } catch { /* none yet */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch { /* keep empty */ }
  }, []);
  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    try { await apiFetch(`/v1/hr/delete-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); } catch { /* ignore */ }
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="userMinus" title="Delete Requests" sub="User account deletion requests pending review" backTo="/nexushr">
        <PrimaryBtn label="New Request" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const userId = fd.get('user_id') as string;
            const reason = fd.get('reason') as string;
            if (!userId) return;
            try {
              await apiFetch('/v1/hr/delete-requests', { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) });
              setShowNew(false); load();
            } catch { /* ignore */ }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Staff Member</label>
              <Select name="user_id" required>
                <SelectTrigger style={{ width: 220 }}><SelectValue placeholder="-- Select --" /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Reason</label>
              <input name="reason" placeholder="e.g. Resigned from company" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <PrimaryBtn label="Submit Request" type="submit" />
          </form>
        </Card>
      )}

      <Wrap>
        <thead><tr><TH>User</TH><TH>Email</TH><TH>Requested By</TH><TH>Reason</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {reqs.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>No delete requests.</td></tr>}
          {reqs.map(r => (
            <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD bold>{r.user_name}</TD>
              <TD muted>{r.user_email}</TD>
              <TD muted>{r.requested_by_name}</TD>
              <TD muted>{r.reason || '-'}</TD>
              <TD><Badge status={r.status} /></TD>
              <TD right>{r.status==='PENDING' && <><ActionBtn label="Approve" color="var(--green)" onClick={() => decide(r.id, 'APPROVED')} /><ActionBtn label="Reject" color="var(--red)" onClick={() => decide(r.id, 'REJECTED')} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type DeptRow = { id?: string; name: string; head: string; head_user_id?: string | null; employees: number; status: string };

function DeptForm({ staff, initial, onCancel, onSubmit }: {
  staff: Employee[]; initial?: DeptRow; onCancel: () => void; onSubmit: (v: { name: string; head_user_id: string; status: string }) => void;
}) {
  return (
    <Card>
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const headId = fd.get('head_user_id') as string;
        onSubmit({ name: fd.get('name') as string, head_user_id: headId === '__none__' ? '' : headId, status: fd.get('status') as string });
      }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Department Name</label>
          <input name="name" required defaultValue={initial?.name} placeholder="e.g. Operations" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Head</label>
          <Select name="head_user_id" defaultValue={initial?.head_user_id || '__none__'}>
            <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- None --</SelectItem>
              {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Status</label>
          <Select name="status" defaultValue={initial?.status || 'ACTIVE'}>
            <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PrimaryBtn label={initial ? 'Save' : 'Create'} type="submit" />
        <ActionBtn label="Cancel" onClick={onCancel} />
      </form>
    </Card>
  );
}

export function DepartmentsPage() {
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<DeptRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/departments');
      const data = Array.isArray(res) ? res : [];
      setDepts(data.map((d: any) => ({
        id: d.id, name: d.name, head: d.head_name || '-', head_user_id: d.head_user_id,
        employees: d.employee_count || 0, status: d.status || 'ACTIVE',
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch { /* keep empty */ }
  }, []);
  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  async function create(v: { name: string; head_user_id: string; status: string }) {
    try {
      await apiFetch('/v1/hr/departments', { method: 'POST', body: JSON.stringify({ name: v.name, head_user_id: v.head_user_id || null, status: v.status }) });
      setShowNew(false); load();
    } catch { /* ignore */ }
  }
  async function save(id: string, v: { name: string; head_user_id: string; status: string }) {
    try {
      await apiFetch(`/v1/hr/departments/${id}`, { method: 'PATCH', body: JSON.stringify({ name: v.name, head_user_id: v.head_user_id || null, status: v.status }) });
      setEditing(null); load();
    } catch { /* ignore */ }
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="building" title="Departments" sub="Organisational departments and their leads" backTo="/nexushr">
        <PrimaryBtn label="Add Department" icon="plus" onClick={() => { setEditing(null); setShowNew(v => !v); }} />
      </PageHeader>

      {showNew && <DeptForm staff={staff} onCancel={() => setShowNew(false)} onSubmit={create} />}
      {editing && <DeptForm staff={staff} initial={editing} onCancel={() => setEditing(null)} onSubmit={v => save(editing.id!, v)} />}

      <Wrap>
        <thead><tr><TH>Department</TH><TH>Head</TH><TH right>Employees</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {depts.map(d => (
            <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD bold>{d.name}</TD>
              <TD>{d.head === '-' ? <span style={{ color:'var(--ink3)' }}>—</span> : <div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={d.head} size={24} />{d.head}</div>}</TD>
              <TD right bold>{d.employees}</TD>
              <TD><Badge status={d.status} /></TD>
              <TD right>{d.id && <ActionBtn label="Edit" onClick={() => { setShowNew(false); setEditing(d); }} />}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type TeamRow = { id: string; name: string; lead_user_id: string | null; lead_name: string | null; members: { user_id: string; user_name: string }[] };

export function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTeams(await apiFetch('/v1/hr/teams')); } catch { /* none yet */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch { /* keep empty */ }
  }, []);
  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  async function addMember(teamId: string, userId: string) {
    if (!userId) return;
    try { await apiFetch(`/v1/hr/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }); setAddingTo(null); load(); } catch { /* ignore */ }
  }
  async function removeMember(teamId: string, userId: string) {
    try { await apiFetch(`/v1/hr/teams/${teamId}/members/${userId}`, { method: 'DELETE' }); load(); } catch { /* ignore */ }
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="users" title="Teams" sub="Cross-functional working groups and project teams" backTo="/nexushr">
        <PrimaryBtn label="Create Team" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = fd.get('name') as string;
            const leadIdRaw = fd.get('lead_user_id') as string;
            const leadId = leadIdRaw === '__none__' ? '' : leadIdRaw;
            if (!name) return;
            try {
              await apiFetch('/v1/hr/teams', { method: 'POST', body: JSON.stringify({ name, lead_user_id: leadId || null }) });
              setShowNew(false); load();
            } catch { /* ignore */ }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Team Name</label>
              <input name="name" required placeholder="e.g. Finance Team" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Team Lead</label>
              <Select name="lead_user_id" defaultValue="__none__">
                <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <PrimaryBtn label="Create" type="submit" />
          </form>
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
        {teams.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 32, color: 'var(--ink3)' }}>No teams yet.</div>}
        {teams.map(t => (
          <div key={t.id} style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', padding:18 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)', marginBottom:4 }}>{t.name}</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:12 }}>Lead: {t.lead_name || '—'} — {t.members.length} member{t.members.length!==1?'s':''}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
              {t.members.map(m => (
                <div key={m.user_id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Avatar name={m.user_name} size={22} />
                  <span style={{ fontSize:12.5, color:'var(--ink)', flex:1 }}>{m.user_name}</span>
                  <button type="button" title="Remove" onClick={() => removeMember(t.id, m.user_id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)' }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
            {addingTo === t.id ? (
              <Combobox
                options={staff.filter(s => !t.members.some(m => m.user_id === s.id)).map(s => ({ value: s.id, label: s.name }))}
                value="" onChange={v => v && addMember(t.id, v)}
                placeholder="-- Select staff to add --"
              />
            ) : (
              <ActionBtn label="Add Member" onClick={() => setAddingTo(t.id)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type InvitationRow = { id: string; email: string; role: string; invited_by_name: string | null; status: string; expires_at: string; created_at: string };

export function InvitationsPage() {
  const [invites, setInvites] = useState<InvitationRow[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setInvites(await apiFetch('/v1/hr/invitations')); } catch { /* none yet */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resend(id: string) {
    try { await apiFetch(`/v1/hr/invitations/${id}/resend`, { method: 'POST' }); } catch { /* ignore */ }
  }
  async function revoke(id: string) {
    try { await apiFetch(`/v1/hr/invitations/${id}`, { method: 'DELETE' }); load(); } catch { /* ignore */ }
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="userPlus" title="Invitations" sub="Pending and sent user invitations" backTo="/nexushr">
        <PrimaryBtn label="Send Invitation" icon="send" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const email = fd.get('email') as string;
            const role = fd.get('role') as string;
            if (!email || !role) return;
            try {
              await apiFetch('/v1/hr/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
              setShowNew(false); load();
            } catch { /* ignore */ }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Work Email</label>
              <input name="email" type="email" required placeholder="name@company.com" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Role</label>
              <Select name="role" required defaultValue="OFFICER">
                <SelectTrigger style={{ width: 160 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFFICER">Officer</SelectItem>
                  <SelectItem value="SENIOR">Senior Officer</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="FINANCE">Finance</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PrimaryBtn label="Send" icon="send" type="submit" />
          </form>
        </Card>
      )}

      <Wrap>
        <thead><tr><TH>Email</TH><TH>Role</TH><TH>Invited By</TH><TH>Expires</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {invites.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>No invitations sent yet.</td></tr>}
          {invites.map(inv => (
            <tr key={inv.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD mono>{inv.email}</TD>
              <TD><span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink2)' }}>{inv.role}</span></TD>
              <TD>{inv.invited_by_name || '-'}</TD>
              <TD muted>{new Date(inv.expires_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</TD>
              <TD><Badge status={inv.status} /></TD>
              <TD right>{inv.status==='PENDING' && <><ActionBtn label="Resend" onClick={() => resend(inv.id)} /><ActionBtn label="Revoke" color="var(--red)" onClick={() => revoke(inv.id)} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}


type ActivityRow = { id: string; user_name: string | null; action: string; module: string; created_at: string };

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  // A swallowed failure here rendered "No activity recorded yet", which is a
  // different claim from "we could not load it" — and for three years this
  // module returned 403 to SUPER_ADMIN while showing exactly that empty state.
  const [err, setErr] = useState('');
  useEffect(() => { apiFetch('/v1/hr/activity-log').then(setLogs).catch((e: any) => setErr(e?.message ?? 'Could not load activity.')); }, []);

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="activity" title="User Activity Logs" sub="Recent actions taken through the HR module" backTo="/nexushr" />
      <Wrap>
        <thead><tr><TH>User</TH><TH>Action</TH><TH>Module</TH><TH>Time</TH></tr></thead>
        <tbody>
          {logs.length === 0 && <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: err ? 'var(--red)' : 'var(--ink3)' }}>{err || 'No activity recorded yet.'}</td></tr>}
          {logs.map(l => (
            <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={l.user_name || '?'} size={24} />{l.user_name || 'Unknown'}</div></TD>
              <TD>{l.action}</TD>
              <TD><span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink2)' }}>{l.module}</span></TD>
              <TD muted>{new Date(l.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type LoginHistoryRow = { id: string; user_name: string; ip: string | null; user_agent: string | null; status: string; created_at: string };

export function LoginHistoryPage() {
  const [rows, setRows] = useState<LoginHistoryRow[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { apiFetch('/v1/hr/login-history').then(setRows).catch((e: any) => setErr(e?.message ?? 'Could not load login history.')); }, []);

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="lock" title="Login History" sub="Authentication events for all users" backTo="/nexushr" />
      <Wrap>
        <thead><tr><TH>User</TH><TH>IP Address</TH><TH>Device</TH><TH>Status</TH><TH>Time</TH></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: err ? 'var(--red)' : 'var(--ink3)' }}>{err || 'No login history recorded yet.'}</td></tr>}
          {rows.map(l => (
            <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={l.user_name} size={24} />{l.user_name}</div></TD>
              <TD mono muted>{l.ip || '-'}</TD>
              <TD muted><span style={{ display: 'inline-block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{l.user_agent || '-'}</span></TD>
              <TD><Badge status={l.status} /></TD>
              <TD muted>{new Date(l.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type DeviceRow = { id: string; user_name: string; device_label: string; device_type: string; trusted: boolean; last_used_at: string };

export function DeviceManagementPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setDevices(await apiFetch('/v1/hr/devices')); setErr(''); }
    catch (e: any) { setErr(e?.message ?? 'Could not load devices.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setTrusted(id: string, trusted: boolean) {
    try { await apiFetch(`/v1/hr/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ trusted }) }); load(); } catch { /* ignore */ }
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="smartphone" title="Device Management" sub="Trusted and known devices per user" backTo="/nexushr" />
      <Wrap>
        <thead><tr><TH>User</TH><TH>Device</TH><TH>Type</TH><TH>Last Used</TH><TH>Trusted</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {devices.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: err ? 'var(--red)' : 'var(--ink3)' }}>{err || 'No devices recorded yet.'}</td></tr>}
          {devices.map(d => (
            <tr key={d.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={d.user_name} size={24} />{d.user_name}</div></TD>
              <TD bold>{d.device_label}</TD>
              <TD muted>{d.device_type}</TD>
              <TD muted>{new Date(d.last_used_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</TD>
              <TD>
                {d.trusted
                  ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'rgba(16,185,129,.12)', color:'var(--green)', fontWeight:700 }}>Trusted</span>
                  : <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'rgba(239,68,68,.12)', color:'var(--red)', fontWeight:700 }}>Unknown</span>}
              </TD>
              <TD right>
                {!d.trusted && <ActionBtn label="Trust" color="var(--green)" onClick={() => setTrusted(d.id, true)} />}
                <ActionBtn label="Block" color="var(--red)" onClick={() => setTrusted(d.id, false)} />
              </TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type LeaveRow = { id: string; emp: string; type: string; from: string; to: string; days: number; reason: string; approvedBy: string; status: LeaveStatus };

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
  };
}

export function LeavesPage() {
  const [filter, setFilter] = useState('');
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [showNew, setShowNew] = useState(false);

  const loadLeaves = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/leaves');
      const data = Array.isArray(res) ? res : (res?.data ?? []);
      setLeaves(data.map(apiLeaveToRow));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  const loadStaff = useCallback(async () => {
    try { setStaff(await apiFetch('/v1/hr/staff')); } catch { /* keep empty */ }
  }, []);

  useEffect(() => { loadLeaves(); loadStaff(); }, [loadLeaves, loadStaff]);

  async function handleStatus(id: string, status: LeaveStatus) {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    try {
      await apiFetch(`/v1/hr/leaves/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      loadLeaves();
    } catch { /* local update already applied */ }
  }

  const chips = ['', ...LEAVE_TYPES];
  const rows = filter ? leaves.filter(l => l.type === filter) : leaves;
  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="calendar" title="Leave Management" sub="Employee leave requests and approvals" backTo="/nexushr">
        <PrimaryBtn label="New Request" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const user_id = fd.get('user_id') as string;
            const type = fd.get('type') as string;
            const from_date = fd.get('from_date') as string;
            const to_date = fd.get('to_date') as string;
            const reason = fd.get('reason') as string;
            if (!user_id || !from_date || !to_date) return;
            const days = Math.max(1, Math.round((new Date(to_date).getTime() - new Date(from_date).getTime()) / 86400000) + 1);
            try {
              await apiFetch('/v1/hr/leaves', { method: 'POST', body: JSON.stringify({ user_id, type, from_date, to_date, days, reason }) });
              setShowNew(false); loadLeaves();
            } catch { /* ignore */ }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Employee</label>
              <Select name="user_id" required>
                <SelectTrigger style={{ width: 180 }}><SelectValue placeholder="-- Select --" /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Type</label>
              <Select name="type" required defaultValue={LEAVE_TYPES[0]}>
                <SelectTrigger style={{ width: 160 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>From</label>
              <DatePicker name="from_date" triggerClassName="w-auto" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>To</label>
              <DatePicker name="to_date" triggerClassName="w-auto" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Reason</label>
              <input name="reason" placeholder="Optional" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <PrimaryBtn label="Submit" type="submit" />
            <ActionBtn label="Cancel" onClick={() => setShowNew(false)} />
          </form>
        </Card>
      )}

      <MetricsRow cards={[
        { title:'Pending',  value:String(leaves.filter(l=>l.status==='PENDING').length),  trend:0, sub1Label:'THIS MONTH', sub1Value:String(leaves.length), sub2Label:'APPROVED', sub2Value:String(leaves.filter(l=>l.status==='APPROVED').length), bars:spark(200,15,'flat'), barColor:'var(--gold-l)',  barHighlight:'var(--gold)'  },
        { title:'Approved', value:String(leaves.filter(l=>l.status==='APPROVED').length), trend:0, sub1Label:'REJECTED',   sub1Value:String(leaves.filter(l=>l.status==='REJECTED').length), sub2Label:'TYPES', sub2Value:String(LEAVE_TYPES.length), bars:spark(201,15,'up'), barColor:'var(--green-l)', barHighlight:'var(--green)' },
        { title:'Days Used (Avg)', value:'3.1', trend:0, sub1Label:'ANNUAL BALANCE', sub1Value:'18 days', sub2Label:'REMAINING', sub2Value:'15 days', bars:spark(202,15,'flat'), barColor:'var(--blue-l)', barHighlight:'var(--blue)' },
      ]} />
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {chips.map(c => (
          <button key={c||'all'} type="button" onClick={()=>setFilter(c)}
            style={{ padding:'5px 14px', fontSize:12, fontWeight:600, border:'none', borderRadius: 9, cursor:'pointer', background:filter===c?'var(--teal)':'var(--bg)', color:filter===c?'#fff':'var(--ink2)', fontFamily:'var(--font)' }}>
            {c || 'All Types'}
          </button>
        ))}
      </div>
      <Wrap>
        <thead><tr><TH>Employee</TH><TH>Type</TH><TH>From</TH><TH>To</TH><TH right>Days</TH><TH>Reason</TH><TH>Approved By</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {rows.map(l => (
            <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={l.emp} size={24} />{l.emp}</div></TD>
              <TD muted>{l.type}</TD>
              <TD muted>{l.from}</TD>
              <TD muted>{l.to}</TD>
              <TD right bold>{l.days}</TD>
              <TD muted>{l.reason}</TD>
              <TD muted>{l.approvedBy}</TD>
              <TD><Badge status={l.status} /></TD>
              <TD right>{l.status==='PENDING' && <><ActionBtn label="Approve" color="var(--green)" onClick={() => handleStatus(l.id, 'APPROVED')} /><ActionBtn label="Reject" color="var(--red)" onClick={() => handleStatus(l.id, 'REJECTED')} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

export function AttendancePage() {
  const isMobile = useIsMobile();
  const [employees, setEmployees] = useState<ShiftEmployee[]>(SHIFT_EMPLOYEES);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [view, setView] = useState<'grid' | 'member'>('grid');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1); // first of current month
  });

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
    } catch { /* leave the list empty — see note at top of file */ }
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
    } catch { /* keep empty — falls back to no records rendered */ }
  }, []);

  useEffect(() => { loadStaff(); loadAttendance(); }, [loadStaff, loadAttendance]);

  // Generate days for the month
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    return new Date(year, month, i + 1);
  });

  const getDayFormat = (d: Date) => d.toISOString().split('T')[0];

  const filteredEmps = employees.filter(e => {
    if (filterDept && e.department !== filterDept) return false;
    return true;
  });

  const memberEmp = selectedEmpId ? employees.find(e => e.id === selectedEmpId) : filteredEmps[0];

  const getStatusColor = (s: AttendanceStatus) => {
    switch(s) {
      case 'Present': return 'var(--green)';
      case 'Absent': return 'var(--red)';
      case 'Late': return 'var(--gold)';
      case 'Half-Day': return 'var(--purple)';
      case 'On Leave': return 'var(--blue)';
      default: return 'var(--ink3)';
    }
  };

  const getStatusBg = (s: AttendanceStatus) => {
    switch(s) {
      case 'Present': return 'var(--green-l)';
      case 'Absent': return 'var(--red-l)';
      case 'Late': return 'var(--gold-l)';
      case 'Half-Day': return 'var(--purple-l)';
      case 'On Leave': return 'var(--blue-l)';
      default: return 'var(--bg)';
    }
  };

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
    <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', flex:1, overflowY:'auto', display: 'flex', flexDirection: 'column' }}>
      <PageHeader icon="clock" title="Attendances" sub="Daily staff attendance and clock records" backTo="/nexushr">
        <button type="button" className="btn btn-secondary" onClick={() => { setBulkEmpIds([]); setShowBulk(true); }} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Icon name="tasks" size={14} /> Mark Attendance
        </button>
      </PageHeader>

      {/* Filters & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: 'var(--white)', padding: '12px 16px', borderRadius: 9, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {view === 'member' ? (
            <div style={{ width: 220 }}>
              <Combobox
                options={filteredEmps.map(e => ({ value: e.id, label: `${e.name} (${e.department})` }))}
                value={selectedEmpId || ''} onChange={setSelectedEmpId}
                triggerClassName="h-8 text-xs"
              />
            </div>
          ) : (
            <Select value={filterDept || '__all__'} onValueChange={v => setFilterDept(v === '__all__' ? '' : v)}>
              <SelectTrigger className="input-field" style={{ width: 160, height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Departments</SelectItem>
                {Array.from(new Set(employees.map(e => e.department))).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => setDate(new Date(year, month - 1, 1))}>
              <Icon name="chevronLeft" size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', minWidth: 120, textAlign: 'center' }}>
              {date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => setDate(new Date(year, month + 1, 1))}>
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          
          <Select value={view} onValueChange={v => setView(v as any)}>
            <SelectTrigger className="input-field" style={{ width: 160, height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Summary Grid</SelectItem>
              <SelectItem value="member">Attendance by Member</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {view === 'grid' && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', left: 0, zIndex: 10, width: 200, textAlign: 'left', fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase' }}>Employee</th>
                {days.map(d => (
                  <th key={d.toISOString()} style={{ padding: '8px', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'center', minWidth: 44, width: 44 }}>
                    <div style={{ fontSize: 10, color: 'var(--ink3)' }}>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover-bg">
                  <td style={{ padding: '8px 16px', borderRight: '1px solid var(--border)', background: 'var(--white)', position: 'sticky', left: 0, zIndex: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 9, background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{emp.avatar}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{emp.name}</div>
                    </div>
                  </td>
                  {days.map(d => {
                    const dStr = getDayFormat(d);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const a = records.find(x => x.employeeId === emp.id && x.date === dStr);
                    
                    return (
                      <td key={dStr} onClick={() => setActiveCell({ empId: emp.id, date: dStr })} style={{ padding: 0, borderRight: '1px solid var(--border)', cursor: 'pointer', verticalAlign: 'middle', textAlign: 'center', background: isWeekend ? 'var(--bg)' : 'transparent', position: 'relative' }}>
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36 }} className="cell-hover-parent">
                          {a ? (
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: getStatusBg(a.status), color: getStatusColor(a.status), display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={`${a.status} ${a.clockIn ? `(${a.clockIn} - ${a.clockOut})` : ''}`}>
                              <Icon name={getStatusIcon(a.status) as any} size={12} />
                            </div>
                          ) : (
                            <div style={{ opacity: 0, transition: 'opacity 0.2s', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="cell-hover-child">
                              <Icon name="plus" size={14} color="var(--ink3)" />
                            </div>
                          )}
                        </div>
                        
                        {activeCell?.empId === emp.id && activeCell.date === dStr && (
                          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 100, padding: 12, width: 220, marginTop: 4, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Edit Attendance</div>
                            <form onSubmit={async (e) => {
                              e.preventDefault();
                              const fd = new FormData(e.currentTarget);
                              const status = fd.get('status') as AttendanceStatus;
                              const clockIn = fd.get('clockIn') as string;
                              const clockOut = fd.get('clockOut') as string;
                              setRecords(prev => {
                                const next = prev.filter(x => !(x.employeeId === emp.id && x.date === dStr));
                                next.push({ id: a?.id || `ATT_${Date.now()}`, employeeId: emp.id, date: dStr, status, clockIn, clockOut });
                                return next;
                              });
                              setActiveCell(null);
                              try {
                                await apiFetch('/v1/hr/attendance', { method: 'POST', body: JSON.stringify({ user_id: emp.id, date: dStr, status: toAttStatusApi(status), clock_in: clockIn || null, clock_out: clockOut || null }) });
                                loadAttendance();
                              } catch { /* local state already updated */ }
                            }}>
                              <div style={{ marginBottom: 8 }}>
                                <Select name="status" required defaultValue={a?.status || 'Present'}>
                                  <SelectTrigger className="input-field" style={{ width: '100%', fontSize: 12, height: 28 }}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Present">Present</SelectItem>
                                    <SelectItem value="Absent">Absent</SelectItem>
                                    <SelectItem value="Late">Late</SelectItem>
                                    <SelectItem value="Half-Day">Half-Day</SelectItem>
                                    <SelectItem value="On Leave">On Leave</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 12 }}>
                                <input type="time" name="clockIn" className="input-field" defaultValue={a?.clockIn || '08:00'} style={{ fontSize: 12, height: 28, padding: '0 4px' }} />
                                <input type="time" name="clockOut" className="input-field" defaultValue={a?.clockOut || '17:00'} style={{ fontSize: 12, height: 28, padding: '0 4px' }} />
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1, padding: 4 }}>Save</button>
                                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1, padding: 4 }} onClick={() => setActiveCell(null)}>Cancel</button>
                              </div>
                            </form>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '16px', display: 'flex', gap: 16, borderTop: '1px solid var(--border)' }}>
            {(['Present', 'Absent', 'Late', 'Half-Day', 'On Leave'] as AttendanceStatus[]).map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink2)' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: getStatusBg(s), color: getStatusColor(s), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={getStatusIcon(s) as any} size={10} />
                </div>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--blue-l)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Working Days</div><div style={{ fontSize: 20, fontWeight: 800 }}>{wDays}</div></div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--green-l)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Days Present</div><div style={{ fontSize: 20, fontWeight: 800 }}>{p}</div></div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--gold-l)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="clock" size={20} /></div>
                    <div><div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase' }}>Late</div><div style={{ fontSize: 20, fontWeight: 800 }}>{l}</div></div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--red-l)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} /></div>
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
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: getStatusBg(a.status), color: getStatusColor(a.status), fontWeight: 700 }}>
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
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000 }} onClick={() => setShowBulk(false)} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 400, background: 'var(--white)', zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Mark Attendance</div>
              <button type="button" onClick={() => setShowBulk(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={20} /></button>
            </div>
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
                  } catch { /* ignore */ }
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

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Attendance</button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .hover-bg:hover td { background: var(--bg) !important; }
        td:hover .cell-hover-child { opacity: 1 !important; }
      `}} />
      
      {activeCell && <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setActiveCell(null)} />}
    </div>
  );
}

export function ShiftsPage() {
  const isMobile = useIsMobile();
  const [employees, setEmployees] = useState<ShiftEmployee[]>(SHIFT_EMPLOYEES);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>(SHIFT_TYPES);
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
    <div style={{ padding: isMobile ? '14px 16px' : '24px 32px', flex:1, overflowY:'auto', display: 'flex', flexDirection: 'column' }}>
      <PageHeader icon="timer" title="Shift Roster" sub="Manage employee shift schedules" backTo="/nexushr">
        <button type="button" className="btn btn-secondary" onClick={() => { setBulkEmpIds([]); setShowBulk(true); }} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Icon name="users" size={14} /> Assign Bulk Shifts
        </button>
      </PageHeader>

      {/* Filters & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: 'var(--white)', padding: '12px 16px', borderRadius: 9, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
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
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setFilterEmp(''); setFilterDept(''); }}>Clear</button>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => {
              const d = new Date(startDate);
              d.setDate(d.getDate() - (view === 'week' ? 7 : 30));
              setStartDate(d);
            }}><Icon name="chevronLeft" size={14} /></button>
            
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', minWidth: 160, textAlign: 'center' }}>
              {startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {days[days.length-1].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            
            <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => {
              const d = new Date(startDate);
              d.setDate(d.getDate() + (view === 'week' ? 7 : 30));
              setStartDate(d);
            }}><Icon name="chevronRight" size={14} /></button>
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
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflowX: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: view === 'week' ? 800 : 2000 }}>
          <thead>
            <tr>
              <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', left: 0, zIndex: 10, width: 200, textAlign: 'left', fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase' }}>Employee</th>
              {days.map(d => (
                <th key={d.toISOString()} style={{ padding: '8px', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmps.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', borderRight: '1px solid var(--border)', background: 'var(--white)', position: 'sticky', left: 0, zIndex: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{emp.avatar}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{emp.role}</div>
                    </div>
                  </div>
                </td>
                {days.map(d => {
                  const dStr = getDayFormat(d);
                  const a = assignments.find(x => x.employeeId === emp.id && x.date === dStr);
                  const sType = a?.shiftId ? shiftTypes.find(s => s.id === a.shiftId) : null;
                  
                  return (
                    <td key={dStr} onClick={() => setActiveCell({ empId: emp.id, date: dStr })} style={{ padding: 4, borderRight: '1px solid var(--border)', cursor: 'pointer', verticalAlign: 'top', position: 'relative' }}>
                      <div style={{ minHeight: 46, borderRadius: 6, border: '1px dashed transparent', padding: 6, transition: 'border 0.2s', ...((!sType) ? { ':hover': { borderColor: 'var(--border)' } } : {}) } as any}>
                        {sType ? (
                          <div style={{ background: `${sType.color}15`, border: `1px solid ${sType.color}40`, borderRadius: 4, padding: '4px 6px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: sType.color, marginBottom: 2 }}>{sType.name}</div>
                            <div style={{ fontSize: 9, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{sType.startTime} - {sType.endTime}</div>
                          </div>
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="cell-hover">
                            <Icon name="plus" size={14} color="var(--ink3)" />
                          </div>
                        )}
                      </div>
                      
                      {/* Active Cell Modal (Popover) */}
                      {activeCell?.empId === emp.id && activeCell.date === dStr && (
                        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 100, padding: 12, width: 220, marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assign Shift</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {shiftTypes.map(st => (
                              <button key={st.id} type="button" onClick={async (e) => {
                                e.stopPropagation();
                                setAssignments(prev => [...prev.filter(x => !(x.employeeId === emp.id && x.date === dStr)), { id: `A_${Date.now()}`, employeeId: emp.id, date: dStr, shiftId: st.id }]);
                                setActiveCell(null);
                                try { await apiFetch('/v1/hr/shift-assignments', { method: 'POST', body: JSON.stringify({ user_id: emp.id, shift_id: st.id, date: dStr }) }); loadAssignments(); } catch { /**/ }
                              }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }} className="hover-bg">
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: st.color }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{st.name}</span>
                              </button>
                            ))}
                            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                            <button type="button" onClick={async (e) => {
                              e.stopPropagation();
                              setAssignments(prev => prev.filter(x => !(x.employeeId === emp.id && x.date === dStr)));
                              setActiveCell(null);
                              try { await apiFetch('/v1/hr/shift-assignments', { method: 'POST', body: JSON.stringify({ user_id: emp.id, shift_id: null, date: dStr }) }); loadAssignments(); } catch { /**/ }
                            }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--red)' }} className="hover-bg">
                              <Icon name="x" size={12} />
                              <span style={{ fontSize: 12, fontWeight: 600 }}>Clear Shift</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Assign Drawer */}
      {showBulk && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000 }} onClick={() => setShowBulk(false)} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 400, background: 'var(--white)', zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Assign Bulk Shifts</div>
              <button type="button" onClick={() => setShowBulk(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={20} /></button>
            </div>
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
                  } catch { /* ignore */ }
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

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Assign Shifts</button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Global styles for hover */}
      <style dangerouslySetInnerHTML={{__html: `
        .hover-bg:hover { background: var(--bg) !important; }
        td:hover .cell-hover { opacity: 1 !important; }
      `}} />
      
      {/* Click outside active cell listener */}
      {activeCell && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setActiveCell(null)} />
      )}
    </div>
  );
}

type HolidayRow = { id?: string; date: string; name: string; type: string };

export function HolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/holidays');
      const data = Array.isArray(res) ? res : [];
      setHolidays(data.map((h: any) => ({ id: h.id, date: String(h.date).slice(0,10), name: h.name, type: h.type })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setHolidays(prev => prev.filter(h => h.id !== id));
    try { await apiFetch(`/v1/hr/holidays/${id}`, { method: 'DELETE' }); } catch { load(); }
  }

  const grouped = { Public: holidays.filter(h=>h.type==='Public'), Company: holidays.filter(h=>h.type==='Company') };
  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="sun" title="Holidays" sub="Public and company-designated holidays" backTo="/nexushr">
        <PrimaryBtn label="Add Holiday" icon="plus" onClick={() => setShowNew(v => !v)} />
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
            } catch { /* ignore */ }
          }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Date</label>
              <DatePicker name="date" triggerClassName="w-auto" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Holiday Name</label>
              <input name="name" required placeholder="e.g. Founders Day" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
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

      {(Object.entries(grouped) as [string, HolidayRow[]][]).map(([type, list]) => (
        <div key={type} style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{type} Holidays</div>
          <Wrap>
            <thead><tr><TH>Date</TH><TH>Holiday Name</TH><TH>Type</TH><TH right>Actions</TH></tr></thead>
            <tbody>
              {list.map(h => (
                <tr key={h.date} style={{ borderBottom:'1px solid var(--border)' }}>
                  <TD mono muted>{h.date}</TD>
                  <TD bold>{h.name}</TD>
                  <TD><span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background: h.type==='Public'?'rgba(59,130,246,.12)':'rgba(124,58,237,.12)', color: h.type==='Public'?'var(--blue)':'var(--purple)', fontWeight:700 }}>{h.type}</span></TD>
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

type DesigRow = { id?: string; title: string; dept: string; department_id?: string | null; employees: number };
type DeptOption = { id: string; name: string };

function DesigForm({ depts, initial, onCancel, onSubmit }: {
  depts: DeptOption[]; initial?: DesigRow; onCancel: () => void; onSubmit: (v: { title: string; department_id: string }) => void;
}) {
  return (
    <Card>
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const deptId = fd.get('department_id') as string;
        onSubmit({ title: fd.get('title') as string, department_id: deptId === '__none__' ? '' : deptId });
      }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Title</label>
          <input name="title" required defaultValue={initial?.title} placeholder="e.g. Senior Officer" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Department</label>
          <Select name="department_id" defaultValue={initial?.department_id || '__none__'}>
            <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- None --</SelectItem>
              {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <PrimaryBtn label={initial ? 'Save' : 'Create'} type="submit" />
        <ActionBtn label="Cancel" onClick={onCancel} />
      </form>
    </Card>
  );
}

export function DesignationsPage() {
  const [desigs, setDesigs] = useState<DesigRow[]>([]);
  const [depts, setDepts] = useState<DeptOption[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<DesigRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/designations');
      const data = Array.isArray(res) ? res : [];
      setDesigs(data.map((d: any) => ({ id: d.id, title: d.title, dept: d.department_name || '', department_id: d.department_id, employees: d.employee_count || 0 })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  const loadDepts = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/departments');
      if (Array.isArray(res)) setDepts(res.map((d: any) => ({ id: d.id, name: d.name })));
    } catch { /* keep empty */ }
  }, []);
  useEffect(() => { load(); loadDepts(); }, [load, loadDepts]);

  async function handleDelete(id: string) {
    setDesigs(prev => prev.filter(d => d.id !== id));
    try { await apiFetch(`/v1/hr/designations/${id}`, { method: 'DELETE' }); } catch { load(); }
  }
  async function create(v: { title: string; department_id: string }) {
    try {
      await apiFetch('/v1/hr/designations', { method: 'POST', body: JSON.stringify({ title: v.title, department_id: v.department_id || null }) });
      setShowNew(false); load();
    } catch { /* ignore */ }
  }
  async function save(id: string, v: { title: string; department_id: string }) {
    try {
      await apiFetch(`/v1/hr/designations/${id}`, { method: 'PATCH', body: JSON.stringify({ title: v.title, department_id: v.department_id || null }) });
      setEditing(null); load();
    } catch { /* ignore */ }
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="award" title="Designations" sub="Job titles and role classifications" backTo="/nexushr">
        <PrimaryBtn label="Add Designation" icon="plus" onClick={() => { setEditing(null); setShowNew(v => !v); }} />
      </PageHeader>

      {showNew && <DesigForm depts={depts} onCancel={() => setShowNew(false)} onSubmit={create} />}
      {editing && <DesigForm depts={depts} initial={editing} onCancel={() => setEditing(null)} onSubmit={v => save(editing.id!, v)} />}

      <Wrap>
        <thead><tr><TH>Designation / Title</TH><TH>Department</TH><TH right>Employees</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {desigs.map(d => (
            <tr key={d.title} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD bold>{d.title}</TD>
              <TD muted>{d.dept}</TD>
              <TD right bold>{d.employees}</TD>
              <TD right>{d.id && <><ActionBtn label="Edit" onClick={() => { setShowNew(false); setEditing(d); }} /><ActionBtn label="Delete" color="var(--red)" onClick={() => handleDelete(d.id!)} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type PayRow = { id?: string; emp: string; basic: number; allow: number; ded: number; status: PayStatus };

export function PayrollPage() {
  const now = new Date();
  const [monthIdx,    setMonthIdx]    = useState(now.getMonth() + 1);
  const [year,        setYear]        = useState(now.getFullYear());
  const [payroll,     setPayroll]     = useState<PayRow[]>([]);
  const [slipRow,     setSlipRow]     = useState<PayRow | null>(null);
  const [running,     setRunning]     = useState(false);
  const monthLabel = new Date(year, monthIdx - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/v1/hr/payroll?month=${monthIdx}&year=${year}`);
      const data = Array.isArray(res) ? res : [];
      setPayroll(data.map((p: any) => ({
        id: p.id, emp: p.employee_name || p.emp || '',
        basic: Number(p.basic_pay || p.basic), allow: Number(p.allowances || p.allow),
        ded: Number(p.deductions || p.ded), status: p.status as PayStatus,
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, [monthIdx, year]);
  useEffect(() => { load(); }, [load]);

  async function handlePay(id: string) {
    setPayroll(prev => prev.map(p => p.id === id ? { ...p, status: 'PAID' as PayStatus } : p));
    try { await apiFetch(`/v1/hr/payroll/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'PAID' }) }); } catch { load(); }
  }

  async function runPayroll() {
    setRunning(true);
    try {
      const staff: any[] = await apiFetch('/v1/hr/staff');
      const existingNames = new Set(payroll.map(p => p.emp));
      const active = staff.filter((s: any) => s.status !== 'INACTIVE' && !existingNames.has(s.name));
      for (const s of active) {
        await apiFetch('/v1/hr/payroll', {
          method: 'POST',
          body: JSON.stringify({ user_id: s.id, period_month: monthIdx, period_year: year, basic_pay: 0, allowances: 0, deductions: 0, status: 'PENDING' }),
        });
      }
      load();
    } catch { /* ignore */ }
    finally { setRunning(false); }
  }

  const total = payroll.reduce((s, p) => s + (p.basic + p.allow - p.ded), 0);

  function exportCsv() {
    const header = ['Employee', 'Basic Pay', 'Allowances', 'Deductions', 'Net Pay', 'Status'];
    const lines = payroll.map(p => [p.emp, p.basic, p.allow, p.ded, p.basic + p.allow - p.ded, p.status].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${year}-${String(monthIdx).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="dollarSign" title="Payroll" sub={`Monthly payroll — ${monthLabel}`} backTo="/nexushr">
        <button type="button" className="btn btn-secondary" onClick={exportCsv} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Icon name="download" size={13} color="var(--ink2)" /> Export
        </button>
        <PrimaryBtn label={running ? 'Running—' : 'Run Payroll'} onClick={running ? undefined : runPayroll} />
      </PageHeader>
      <MetricsRow cards={[
        { title:'Total Payroll', value:'TZS ' + (total/1_000_000).toFixed(1) + 'M', trend:3.2, sub1Label:'BASIC',      sub1Value:'TZS '+(payroll.reduce((s,p)=>s+p.basic,0)/1_000_000).toFixed(1)+'M', sub2Label:'ALLOWANCES', sub2Value:'TZS '+(payroll.reduce((s,p)=>s+p.allow,0)/1_000_000).toFixed(1)+'M', bars:spark(400,15,'up'), barColor:'var(--green-l)', barHighlight:'var(--green)' },
        { title:'Paid',       value:String(payroll.filter(p=>p.status==='PAID').length),       trend:0, sub1Label:'PROCESSING', sub1Value:String(payroll.filter(p=>p.status==='PROCESSING').length), sub2Label:'PENDING', sub2Value:String(payroll.filter(p=>p.status==='PENDING').length), bars:spark(401,15,'flat'), barColor:'var(--blue-l)',  barHighlight:'var(--blue)'  },
        { title:'Deductions', value:'TZS '+(payroll.reduce((s,p)=>s+p.ded,0)/1_000_000).toFixed(1)+'M', trend:0, sub1Label:'PAYE',sub1Value:'70%', sub2Label:'NSSF',sub2Value:'30%', bars:spark(402,15,'flat'), barColor:'var(--red-l)',   barHighlight:'var(--red)'   },
      ]} />
      <Wrap>
        <thead><tr><TH>Employee</TH><TH right>Basic Pay</TH><TH right>Allowances</TH><TH right>Deductions</TH><TH right>Net Pay</TH><TH>Status</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {payroll.map(p => {
            const net = p.basic + p.allow - p.ded;
            return (
              <tr key={p.emp} style={{ borderBottom:'1px solid var(--border)' }}>
                <TD><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={p.emp} size={24} />{p.emp}</div></TD>
                <TD right mono muted>{fmtTZS(p.basic)}</TD>
                <TD right mono muted>{fmtTZS(p.allow)}</TD>
                <TD right mono muted>{fmtTZS(p.ded)}</TD>
                <TD right mono bold>{fmtTZS(net)}</TD>
                <TD><Badge status={p.status} /></TD>
                <TD right><ActionBtn label="Slip" onClick={() => setSlipRow(p)} />{p.status==='PENDING' && p.id && <ActionBtn label="Pay Now" color="var(--green)" onClick={() => handlePay(p.id!)} />}</TD>
              </tr>
            );
          })}
        </tbody>
      </Wrap>
      {slipRow && <PayslipModal row={slipRow} monthLabel={monthLabel} onClose={() => setSlipRow(null)} />}
    </div>
  );
}

type AnnRow = { id: string; title: string; category: string; body: string; author: string; date: string; audience: string };

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AnnRow[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/announcements');
      const data = Array.isArray(res) ? res : [];
      setAnnouncements(data.map((a: any) => ({
        id: a.id, title: a.title, category: a.category, body: a.body,
        author: a.author_name || a.author || '', date: String(a.created_at || a.date || '').slice(0,10),
        audience: a.audience,
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    try { await apiFetch(`/v1/hr/announcements/${id}`, { method: 'DELETE' }); } catch { load(); }
  }

  const catColor: Record<string, string> = { HR:'var(--purple)', Policy:'var(--teal)', IT:'var(--blue)' };
  const catBg: Record<string, string> = { HR:'var(--purple-l)', Policy:'var(--teal-l)', IT:'var(--blue-l)' };
  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="volume2" title="Announcements" sub="Company-wide announcements and notices" backTo="/nexushr">
        <PrimaryBtn label="Post Announcement" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = fd.get('title') as string;
            const body = fd.get('body') as string;
            const category = fd.get('category') as string;
            const audience = fd.get('audience') as string;
            if (!title || !body) return;
            try {
              await apiFetch('/v1/hr/announcements', { method: 'POST', body: JSON.stringify({ title, body, category, audience }) });
              setShowNew(false); load();
            } catch { /* ignore */ }
          }} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Title</label>
                <input name="title" required placeholder="e.g. Office closed for public holiday" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Category</label>
                <Select name="category" defaultValue="HR">
                  <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Policy">Policy</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Audience</label>
                <Select name="audience" defaultValue="All Staff">
                  <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Staff">All Staff</SelectItem>
                    <SelectItem value="Management">Management</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Message</label>
              <textarea name="body" required rows={4} placeholder="Write the announcement..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <PrimaryBtn label="Post" icon="send" type="submit" />
              <ActionBtn label="Cancel" onClick={() => setShowNew(false)} />
            </div>
          </form>
        </Card>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {announcements.map(a => (
          <div key={a.id} style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', padding:20 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:10 }}>
              <div>
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, background:catBg[a.category]||'var(--bg)', color:catColor[a.category]||'var(--ink2)', marginRight:8 }}>{a.category}</span>
                <span style={{ fontSize:11, color:'var(--ink3)' }}>Visible to: {a.audience}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <span style={{ fontSize:11.5, color:'var(--ink3)' }}>{a.date}</span>
                <ActionBtn label="Delete" color="var(--red)" onClick={() => handleDelete(a.id)} />
              </div>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>{a.title}</div>
            <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.65, margin:'0 0 12px' }}>{a.body}</p>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink3)' }}>
              <Avatar name={a.author} size={20} />
              Posted by <strong style={{ color:'var(--ink)' }}>{a.author}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- Page routing -- */
export function HrmDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [metrics, setMetrics] = useState<any>(null);
  const [depts, setDepts] = useState<{ name: string; employees: number }[]>([]);
  const [payroll, setPayroll] = useState<{ status: string; basic: number; allow: number; ded: number }[]>([]);

  useEffect(() => {
    apiFetch('/v1/hr/tools-overview').then(d => setMetrics(d)).catch(() => {});
    // Both panels below used to render module-level constants — six invented
    // departments totalling 39 people, and a payroll of TZS 14.7M — on a
    // dashboard whose own headline said "Total Staff: 1". They read the API now.
    apiFetch('/v1/hr/departments')
      .then((r: any) => setDepts((Array.isArray(r) ? r : []).map((d: any) => ({ name: d.name, employees: d.employee_count || 0 }))))
      .catch(() => setDepts([]));
    const now = new Date();
    apiFetch(`/v1/hr/payroll?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
      .then((r: any) => setPayroll((Array.isArray(r) ? r : []).map((p: any) => ({
        status: p.status, basic: Number(p.basic_pay) || 0, allow: Number(p.allowances) || 0, ded: Number(p.deductions) || 0,
      }))))
      .catch(() => setPayroll([]));
  }, []);

  // Zeros, not invented staffing. A dashboard that cannot reach the API says
  // nothing rather than claiming eight employees.
  const hr = metrics?.hr ?? { total_staff:0, active_staff:0, on_leave:0, pending_leaves:0, today_present:0, today_absent:0 };
  const attRate = hr.active_staff > 0 ? Math.round((hr.today_present / hr.active_staff) * 100) : 0;
  const deptTotal = depts.reduce((s, d) => s + d.employees, 0);

  const kpis = [
    { label:'Total Staff',       value: hr.total_staff,       icon:'users'      as IconName, color:'var(--teal)',  bg:'rgba(8,145,178,0.1)',  path:'/nexushr/employees' },
    { label:'Present Today',     value: hr.today_present,     icon:'check'      as IconName, color:'var(--green)', bg:'rgba(16,185,129,0.1)', path:'/nexushr/attendance' },
    { label:'On Leave',          value: hr.on_leave,          icon:'calendar'   as IconName, color:'var(--gold)',      bg:'rgba(245,158,11,0.1)', path:'/nexushr/leaves' },
    { label:'Pending Leaves',    value: hr.pending_leaves,    icon:'clock'      as IconName, color:'var(--red)',   bg:'rgba(239,68,68,0.1)',  path:'/nexushr/leaves' },
  ];

  return (
    <div style={{ padding:'24px 32px', flex:1, overflowY:'auto' }}>
      <PageHeader icon="briefcase" title="HR Dashboard" sub="Live view of your workforce" />

      {/* KPI Row */}
      <div style={{ display:'flex', gap:16, marginBottom:24, flexWrap:'wrap' }}>
        {kpis.map(k => (
          <Link key={k.label} to={k.path} style={{
            flex:1, minWidth:160, display:'block', background:'var(--white)', borderRadius:9, border:'1px solid var(--border)',
            padding:'18px 20px', cursor:'pointer', transition:'box-shadow 0.15s', textDecoration:'none', color:'inherit',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow=''}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
              <div style={{ width:38, height:38, borderRadius:9, background:k.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon name={k.icon} size={18} color={k.color} />
              </div>
            </div>
            <div style={{ fontSize:28, fontWeight:900, color:'var(--ink)', letterSpacing:'-0.03em', lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:12, color:'var(--ink3)', marginTop:4 }}>{k.label}</div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:20 }}>

        {/* Attendance summary */}
        <div style={{ background:'var(--white)', borderRadius:9, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'11px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Today's Attendance</span>
            <Link to="/nexushr/attendance" style={{ fontSize:11, fontWeight:600, color:'var(--teal)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font)', textDecoration:'none' }}>Mark →</Link>
          </div>
          <div style={{ padding:'16px 18px' }}>
            {[
              { label:'Present',  val:hr.today_present, total:hr.active_staff, color:'var(--green)' },
              { label:'On Leave', val:hr.on_leave,      total:hr.active_staff, color:'var(--gold)'      },
              { label:'Absent',   val:hr.today_absent,  total:hr.active_staff, color:'var(--red)'   },
            ].map(row => {
              const pct = hr.active_staff > 0 ? Math.round((row.val / hr.active_staff) * 100) : 0;
              return (
                <div key={row.label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>{row.label}</span>
                    <span style={{ fontSize:12.5, fontWeight:700, color:row.color }}>{row.val} <span style={{ color:'var(--ink3)', fontWeight:400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:'var(--border)' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:row.color, borderRadius:3, transition:'width 0.6s' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:14, padding:'10px 14px', background:'var(--bg)', borderRadius:7 }}>
              <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:2 }}>Attendance Rate</div>
              <div style={{ fontSize:22, fontWeight:800, color: attRate >= 70 ? 'var(--green)' : 'var(--red)' }}>{attRate}%</div>
            </div>
          </div>
        </div>

        {/* Department breakdown */}
        <div style={{ background:'var(--white)', borderRadius:9, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'11px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Departments</span>
            <Link to="/nexushr/departments" style={{ fontSize:11, fontWeight:600, color:'var(--teal)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font)', textDecoration:'none' }}>Manage →</Link>
          </div>
          <div style={{ padding:'14px 18px' }}>
            {depts.length === 0 && (
              <div style={{ fontSize:12.5, color:'var(--ink3)', padding:'6px 0' }}>No departments defined yet.</div>
            )}
            {depts.map((d, i) => {
              const colors = ['var(--teal)','var(--blue)','var(--purple)','var(--green)','var(--gold)','var(--red)'];
              const pct = deptTotal > 0 ? Math.round((d.employees / deptTotal) * 100) : 0;
              return (
                <div key={d.name} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:colors[i % colors.length], flexShrink:0 }} />
                  <span style={{ fontSize:12.5, color:'var(--ink)', flex:1 }}>{d.name}</span>
                  <div style={{ width:80, height:5, borderRadius:3, background:'var(--border)' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:colors[i % colors.length], borderRadius:3 }} />
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)', minWidth:20, textAlign:'right' }}>{d.employees}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payroll summary */}
        <div style={{ background:'var(--white)', borderRadius:9, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'11px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Payroll — This Month</span>
            <Link to="/nexushr/payroll" style={{ fontSize:11, fontWeight:600, color:'var(--teal)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font)', textDecoration:'none' }}>View All →</Link>
          </div>
          <div style={{ padding:'16px 18px' }}>
            {[
              { label:'Paid',       count:payroll.filter(p=>p.status==='PAID').length,       color:'var(--green)', bg:'rgba(16,185,129,0.1)' },
              { label:'Processing', count:payroll.filter(p=>p.status==='PROCESSING').length, color:'var(--blue)',  bg:'rgba(59,130,246,0.1)' },
              { label:'Pending',    count:payroll.filter(p=>p.status==='PENDING').length,    color:'var(--gold)',      bg:'rgba(245,158,11,0.1)' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:row.bg, borderRadius:7, marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{row.label}</span>
                <span style={{ fontSize:16, fontWeight:800, color:row.color }}>{row.count}</span>
              </div>
            ))}
            <div style={{ marginTop:10, padding:'10px 12px', background:'var(--bg)', borderRadius:7, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'var(--ink3)' }}>Total Net Pay</span>
              <span style={{ fontSize:14, fontWeight:800, color:'var(--ink)' }}>
                TZS {(payroll.reduce((s,p) => s + (p.basic + p.allow - p.ded), 0) / 1_000_000).toFixed(1)}M
              </span>
            </div>
          </div>
        </div>

        {/* Quick access module cards */}
        <div style={{ background:'var(--white)', borderRadius:9, border:'1px solid var(--border)', overflow:'hidden', gridColumn:'1 / -1' }}>
          <div style={{ padding:'11px 18px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Quick Access</span>
          </div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:10 }}>
            {[
              { label:'Manage Staff',    icon:'users'      as IconName, path:'/nexushr/employees',   color:'var(--blue)', bg:'rgba(37,99,235,0.08)' },
              { label:'Attendance',      icon:'clock'      as IconName, path:'/nexushr/attendance',  color:'var(--teal)', bg:'rgba(20,184,166,0.08)' },
              { label:'Leave Requests',  icon:'calendar'   as IconName, path:'/nexushr/leaves',      color:'var(--gold)', bg:'rgba(245,158,11,0.08)' },
              { label:'Payroll',         icon:'dollarSign' as IconName, path:'/nexushr/payroll',     color:'var(--green)', bg:'rgba(22,163,74,0.08)' },
              { label:'Departments',     icon:'building'   as IconName, path:'/nexushr/departments', color:'var(--purple)', bg:'rgba(124,58,237,0.08)' },
              { label:'Shift Roster',    icon:'timer'      as IconName, path:'/nexushr/shifts',      color:'var(--blue)', bg:'rgba(8,145,178,0.08)' },
              { label:'Roles & Access',  icon:'shield'     as IconName, path:'/nexushr/roles',       color:'var(--red)', bg:'rgba(220,38,38,0.08)' },
              { label:'Announcements',   icon:'volume2'    as IconName, path:'/nexushr/announcements',color:'var(--ink3)',bg:'rgba(100,116,139,0.08)' },
              { label:'Org Chart',       icon:'users'      as IconName, path:'/nexushr/org-chart',   color:'var(--blue)', bg:'rgba(8,145,178,0.08)' },
              { label:'Invitations',     icon:'userPlus'   as IconName, path:'/nexushr/invitations', color:'var(--purple)', bg:'rgba(124,58,237,0.08)' },
            ].map(m => (
              <Link key={m.path} to={m.path}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', fontFamily:'var(--font)', textAlign:'left', textDecoration:'none' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = m.bg; (e.currentTarget as HTMLElement).style.borderColor = m.color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                <div style={{ width:30, height:30, borderRadius:7, background:m.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name={m.icon} size={14} color={m.color} />
                </div>
                <span style={{ fontSize:12.5, fontWeight:500, color:'var(--ink)', lineHeight:1.3 }}>{m.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

