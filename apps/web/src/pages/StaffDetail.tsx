import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { BackButton } from '../components/ui/BackButton.js';
import { useAuth } from '../hooks/useAuth.js';
import type { EmpStatus } from '../data/staffData.js';
import type { UserProfileFields } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { RecordActivity } from '../components/RecordActivity.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { StaffContracts, StaffEmergencyContacts } from '../components/StaffContracts.js';

interface StaffData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  status: string;
  created_at: string;
  last_login_at: string | null;
  hireDate: string;
  /** True when hireDate is standing in for a real one, taken from created_at. */
  hire_date_is_estimated?: boolean;
  avatar_url?: string | null;
  profile?: UserProfileFields;
  // Statutory identity and pay. Columns rather than profile json, because the
  // payroll engine reads them and a value it depends on should not be able to
  // be overwritten by an unrelated profile save.
  hire_date?: string | null;
  tax_residency?: 'RESIDENT' | 'NON_RESIDENT' | null;
  national_id?: string | null;
  tax_id?: string | null;
  social_security_no?: string | null;
  health_insurance_no?: string | null;
  pension_fund?: 'NSSF' | 'PSSSF' | null;
  basic_salary?: string | null;
  pay_currency?: string | null;
  pay_method?: 'BANK' | 'MOBILE_MONEY' | 'CASH' | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
  mobile_money_provider?: string | null;
  mobile_money_number?: string | null;
  // Computed fallbacks for UI
  employee_code?: string;
  dept?: string;
  designation?: string;
  reports_to?: string;
  employment_type?: string;
  member_since?: string;
}

// Shared, so this page agrees with the header above it and with every other app.
import { nameColor as avatarBg, nameInitials as initials, forgetAvatar, squareAvatarDataUrl } from '../lib/identity.js';

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

/** Minutes as "6h 30m" — the timesheet stores minutes, nobody reads in minutes. */
function hhmm(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
}

/** Soft-tint status pill, on the same semantic colours as the rest of the app. */
function StatusChip({ value }: { value?: string | null }) {
  if (!value) return <span style={{ color: 'var(--ink4)' }}>—</span>;
  const v = String(value).toUpperCase();
  const tone =
    /VERIFIED|APPROVED|RESOLVED|CLOSED|ACTIVE|COMPLETE/.test(v) ? { bg: 'var(--green-l)', fg: 'var(--green)' }
    : /REJECTED|EXPIRED|OVERDUE|FAILED/.test(v) ? { bg: 'var(--red-l)', fg: 'var(--red)' }
    : /PENDING|OPEN|IN_PROGRESS|MISSING|DRAFT/.test(v) ? { bg: 'var(--gold-l)', fg: 'var(--gold)' }
    : { bg: 'var(--bg)', fg: 'var(--ink3)' };
  return (
    <span style={{ padding: 'var(--badge-py) var(--badge-px)', borderRadius: 'var(--r-sm)', fontSize: 'var(--badge-fs)', fontWeight: 700, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>
      {v.replace(/_/g, ' ')}
    </span>
  );
}

const PAY_METHOD_LABEL: Record<string, string> = {
  BANK: 'Bank transfer',
  MOBILE_MONEY: 'Mobile money',
  CASH: 'Cash',
};

/**
 * The four networks that actually move salaries in Tanzania. Free text here
 * would give the payment file four spellings of M-Pesa and no way to group them.
 */
const MOBILE_MONEY_PROVIDERS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa', 'T-Pesa'];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: 'rgba(16,185,129,.12)',  color: 'var(--green)', label: 'Active'   },
  INACTIVE: { bg: 'rgba(148,163,184,.12)', color: 'var(--ink3)',  label: 'Inactive' },
  ON_LEAVE: { bg: 'rgba(245,158,11,.12)',  color: 'var(--gold)',      label: 'On Leave' },
};

function FieldItem({ label, value }: { label: string; value?: string | null }) {
  const isMissing = !value || value === 'Not set';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: isMissing ? 'var(--ink4)' : 'var(--ink)', fontWeight: isMissing ? 400 : 500 }}>
        {value || 'Not set'}
      </div>
    </div>
  );
}

function ProfileCard({ icon, title, filled, total, children }: { icon: React.ReactNode, title: string, filled?: number, total?: number, children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            {icon}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
        </div>
        {filled !== undefined && total !== undefined && (
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{filled}/{total} filled</div>
        )}
      </div>
      <div style={{ padding: '20px 20px 4px 20px' }}>
        {children}
      </div>
    </div>
  );
}

function ActionLink({ label, onClick }: { label: string, onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>{label}</span>
      <Icon name="chevronRight" size={14} color="var(--border)" />
    </button>
  );
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7,
  fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)',
  boxSizing: 'border-box',
};

const ATT_TONE: Record<string, { bg: string; fg: string }> = {
  PRESENT: { bg: 'var(--green-l)', fg: 'var(--green)' },
  LATE:    { bg: 'var(--gold-l)',  fg: 'var(--gold)'  },
  ABSENT:  { bg: 'var(--red-l)',   fg: 'var(--red)'   },
};
const LEAVE_TONE: Record<string, { bg: string; fg: string }> = {
  APPROVED: { bg: 'var(--green-l)', fg: 'var(--green)' },
  PENDING:  { bg: 'var(--gold-l)',  fg: 'var(--gold)'  },
  REJECTED: { bg: 'var(--red-l)',   fg: 'var(--red)'   },
};
function Pill({ text, tone }: { text: string; tone?: { bg: string; fg: string } }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: tone?.bg ?? 'var(--bg)', color: tone?.fg ?? 'var(--ink3)',
    }}>{text}</span>
  );
}
const RUN_TONE: Record<string, { bg: string; fg: string }> = {
  PAID:      { bg: 'var(--green-l)', fg: 'var(--green)' },
  APPROVED:  { bg: 'var(--green-l)', fg: 'var(--green)' },
  CALCULATED:{ bg: 'var(--gold-l)',  fg: 'var(--gold)'  },
  DRAFT:     { bg: 'var(--bg)',      fg: 'var(--ink3)'  },
  CANCELLED: { bg: 'var(--red-l)',   fg: 'var(--red)'   },
};
function AttBadge({ status }: { status: string }) { return <Pill text={status} tone={ATT_TONE[status]} />; }
function LeaveBadge({ status }: { status: string }) { return <Pill text={status} tone={LEAVE_TONE[status]} />; }
function RunBadge({ status }: { status: string }) { return <Pill text={status} tone={RUN_TONE[status]} />; }

/**
 * Money, grouped and without decimals.
 *
 * The shilling has no subunit in daily use, so "489,300" is what a payslip
 * says. Rounding here is presentation only — the stored figures keep their
 * precision, because a total that disagrees with its own lines is unexplainable.
 */
function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

/** One table shape for every record tab, so they stay consistent as more land. */
function TabTable({ loading, rows, head, row, empty, summary }: {
  loading: boolean;
  rows: any[];
  head: string[];
  row: (r: any) => React.ReactNode[];
  empty: string;
  summary?: (rows: any[]) => string;
}) {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>Loading…</div>;
  }
  if (rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>{empty}</div>;
  }
  return (
    <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
      {summary && (
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600 }}>
          {summary(rows)}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {head.map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i} style={{ borderTop: '1px solid var(--border)' }}>
                {row(r).map((cell, j) => (
                  <td key={j} style={{ padding: '10px 16px', color: 'var(--ink2)', whiteSpace: j === head.length - 1 ? 'normal' : 'nowrap' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const StaffDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  /**
   * Pay is a different permission from a phone number. A manager keeps a team's
   * identity and contact details current; what somebody earns and which account
   * it lands in is an admin action. The API enforces this — this only decides
   * whether to render fields that would be refused, so nobody fills in a form
   * that cannot be saved.
   */
  const canSetPay = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(authUser?.role ?? '');

  const [staff, setStaff] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Profile');

  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<StaffData> & { profile: Partial<UserProfileFields> }>({ profile: {} });

  const TABS = [
    'Profile', 'Attendance', 'Leaves', 'Tasks', 'Projects', 'Timesheet', 
    'Documents', 'Payroll', 'Tickets', 'Shift Roster', 'Permissions', 'Activity'
  ];

  // The tabs with a real endpoint behind them. Loaded when the tab is opened
  // rather than with the profile, so viewing someone's details does not pull
  // eight weeks of attendance and a year of payslips nobody asked for.
  const LIVE_TABS: Record<string, string> = {
    Attendance: `/v1/hr/attendance?user_id=${id}`,
    Leaves: `/v1/hr/leaves?user_id=${id}`,
    Payroll: `/v1/payroll/employees/${id}/payslips`,
    Timesheet: `/v1/hr/staff/${id}/timesheet`,
    Projects: `/v1/hr/staff/${id}/projects`,
    Documents: `/v1/hr/staff/${id}/documents`,
    Tickets: `/v1/hr/staff/${id}/tickets`,
    'Shift Roster': `/v1/hr/staff/${id}/shift-roster`,
    Permissions: `/v1/hr/staff/${id}/permissions`,
    Activity: `/v1/hr/staff/${id}/activity`,
  };

  /**
   * Deliberately absent from LIVE_TABS. `tasks` is a private to-do list, scoped
   * to its owner everywhere else in the app; showing it to a manager here is a
   * product decision, not a wiring gap, so the tab says that instead of
   * rendering an empty table that implies the person has nothing on.
   */
  const WITHHELD_TABS: Record<string, string> = {
    Tasks: 'Tasks are a personal to-do list, private to the person who wrote them. ' +
           'Assigned work shows under Tickets and Timesheet.',
  };

  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  // The tabs added later all render from the same shape, so they share one
  // bucket rather than growing a useState each.
  const [tabRows, setTabRows] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState(false);
  // Payroll is the one tab that can legitimately refuse. "You may not see this"
  // and "there is nothing here" are different answers and must not look alike.
  const [tabDenied, setTabDenied] = useState<string | null>(null);

  const loadTab = useCallback(async (which: string) => {
    if (!id || !LIVE_TABS[which]) return;
    setTabLoading(true);
    setTabDenied(null);
    try {
      const rows = await apiFetch(LIVE_TABS[which]) ?? [];
      if (which === 'Attendance') setAttendance(rows);
      else if (which === 'Leaves') setLeaves(rows);
      else if (which === 'Payroll') setPayslips(rows);
      else setTabRows(prev => ({ ...prev, [which]: rows }));
    } catch (e: any) {
      // An empty list and a failed request must not look the same, so the
      // table says which it was rather than rendering a bare "no records".
      const msg = String(e?.message ?? e);
      if (/403|forbidden/i.test(msg)) {
        setTabDenied(which === 'Payroll'
          ? 'Your access level does not include other people’s pay.'
          : 'Your access level does not include other people’s records.');
      } else {
        setTabDenied(`This could not be loaded: ${msg}`);
      }
      if (which === 'Attendance') setAttendance([]);
      else if (which === 'Leaves') setLeaves([]);
      else if (which === 'Payroll') setPayslips([]);
      else setTabRows(prev => ({ ...prev, [which]: [] }));
    } finally {
      setTabLoading(false);
    }
  }, [id]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch(`/v1/hr/staff/${id}`);
      if (data?.id) {
        setStaff({
          ...data,
          profile: data.profile || {},
          employee_code: data.profile?.employee_code || `EMP-${data.id.substring(0, 3).toUpperCase()}`,
          dept: data.profile?.department || '',
          designation: data.profile?.job_title || '',
          reports_to: data.profile?.reports_to || '',
          employment_type: data.profile?.employment_type || '',
          member_since: formatDate(data.created_at)
        });
        return;
      }
    } catch { /* fall through to the honest not-found state below */ }

    // No sample-fixture fallback: an id the API can't resolve is a staff member
    // this tenant does not have, and the page must say so (the "Staff not found"
    // state) rather than render a fabricated profile ("Ariana Cole", a made-up
    // employee code) that reads as a real person.
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const startEdit = () => {
    if (!staff) return;
    setEditForm({
      name: staff.name,
      phone: staff.phone || '',
      profile: {
        employee_code: staff.profile?.employee_code || staff.employee_code,
        job_title: staff.profile?.job_title || staff.designation,
        department: staff.profile?.department || staff.dept,
        reports_to: staff.profile?.reports_to || staff.reports_to,
        employment_type: staff.profile?.employment_type || staff.employment_type,
        address: staff.profile?.address || '',
        city: staff.profile?.city || '',
        country: staff.profile?.country || '',
        date_of_birth: staff.profile?.date_of_birth || '',
        gender: staff.profile?.gender || '',
        language: staff.profile?.language || '',
        biometric_id: staff.profile?.biometric_id || ''
      },
      // Seeded from '' rather than left undefined so clearing a field sends ''
      // and is understood as "cleared" instead of "unchanged".
      hire_date: staff.hire_date || '',
      tax_residency: staff.tax_residency ?? null,
      national_id: staff.national_id || '',
      tax_id: staff.tax_id || '',
      social_security_no: staff.social_security_no || '',
      health_insurance_no: staff.health_insurance_no || '',
      pension_fund: staff.pension_fund ?? null,
      basic_salary: staff.basic_salary || '',
      pay_currency: staff.pay_currency || '',
      pay_method: staff.pay_method ?? null,
      bank_name: staff.bank_name || '',
      bank_branch: staff.bank_branch || '',
      bank_account_no: staff.bank_account_no || '',
      bank_account_name: staff.bank_account_name || '',
      mobile_money_provider: staff.mobile_money_provider || '',
      mobile_money_number: staff.mobile_money_number || '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!staff) return;
    setSaving(true);
    try {
      if (staff.id.startsWith('e')) {
        await new Promise(r => setTimeout(r, 400));
        setStaff(prev => {
          if (!prev) return prev;
          const newProfile = { ...prev.profile, ...editForm.profile };
          return {
            ...prev,
            name: editForm.name || prev.name,
            phone: editForm.phone || prev.phone,
            profile: newProfile,
            employee_code: newProfile.employee_code || prev.employee_code,
            dept: newProfile.department || prev.dept,
            designation: newProfile.job_title || prev.designation,
            reports_to: newProfile.reports_to || prev.reports_to,
            employment_type: newProfile.employment_type || prev.employment_type,
          };
        });
        setIsEditing(false);
        return;
      }

      // Pay fields are only sent when this user may set them. Sending them
      // anyway would have the API refuse the whole request, losing the identity
      // and contact edits alongside the one field they were not allowed to touch.
      const payload: Record<string, unknown> = {
        name: editForm.name,
        phone: editForm.phone,
        profile: editForm.profile,
        hire_date: editForm.hire_date,
        tax_residency: editForm.tax_residency,
        national_id: editForm.national_id,
        tax_id: editForm.tax_id,
        social_security_no: editForm.social_security_no,
        health_insurance_no: editForm.health_insurance_no,
        pension_fund: editForm.pension_fund,
      };
      if (canSetPay) {
        Object.assign(payload, {
          basic_salary: editForm.basic_salary,
          pay_currency: editForm.pay_currency,
          pay_method: editForm.pay_method,
          bank_name: editForm.bank_name,
          bank_branch: editForm.bank_branch,
          bank_account_no: editForm.bank_account_no,
          bank_account_name: editForm.bank_account_name,
          mobile_money_provider: editForm.mobile_money_provider,
          mobile_money_number: editForm.mobile_money_number,
        });
      }

      const updated = await apiFetch(`/v1/hr/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setStaff(prev => {
        if (!prev) return prev;
        const newProfile = { ...prev.profile, ...editForm.profile };
        return {
          // Spread what the server actually stored, so a value it trimmed,
          // upper-cased or rejected is what the screen goes on to show.
          ...prev,
          ...updated,
          name: updated.name || prev.name,
          phone: updated.phone || prev.phone,
          profile: newProfile,
          hireDate: updated.hire_date || prev.hireDate,
          employee_code: newProfile.employee_code || prev.employee_code,
          dept: newProfile.department || prev.dept,
          designation: newProfile.job_title || prev.designation,
          reports_to: newProfile.reports_to || prev.reports_to,
          employment_type: newProfile.employment_type || prev.employment_type,
        };
      });
      setIsEditing(false);
    } catch (e: any) {
      showAlert(e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const updateProfileField = (key: keyof UserProfileFields, value: string) => {
    setEditForm(prev => ({
      ...prev,
      profile: { ...prev.profile, [key]: value }
    }));
  };

  /**
   * Upload a document about this person. Multipart, not JSON — the row and the
   * file are created together server-side, so a document can never be listed
   * without something behind it.
   */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resolvingFolder, setResolvingFolder] = useState(false);

  // "Open Drive" — resolves (creating if needed) this person's real
  // "Employees ▸ <name>" Cloud folder and deep-links straight into it, same
  // pattern as the Customers profile page's own Open Drive button.
  const openEmployeeDrive = async () => {
    if (!id) return;
    setResolvingFolder(true);
    try {
      const folder = await apiFetch(`/v1/files/employee-folder/${id}`);
      const qs = new URLSearchParams({ drive: folder.drive_id, folder: folder.id, name: folder.name });
      if (folder.parent) { qs.set('parentId', folder.parent.id); qs.set('parentName', folder.parent.name); }
      window.open(`/cloud?${qs.toString()}`, '_blank', 'noopener');
    } catch (e: any) {
      showAlert(e?.message || "Could not open this person's Drive folder");
    } finally {
      setResolvingFolder(false);
    }
  };

  const uploadDocument = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const fd = new FormData();
      // Ordered so the server sees the fields before the file, since it reads
      // them off the same multipart stream.
      fd.append('user_id', id);
      fd.append('name', file.name);
      fd.append('type', 'OTHER');
      fd.append('file', file);
      // nexushr.routes is mounted at /v1/hr, same prefix as hr.routes.
      await apiFetch('/v1/hr/documents/upload', { method: 'POST', body: fd });
      setTab('Documents');
      await loadTab('Documents');
    } catch (e: any) {
      showAlert(e?.message || 'The document could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * Give this person a picture.
   *
   * PATCH /v1/hr/staff/:id/avatar has existed all along and nothing called it,
   * so an account could only get a photo if its own owner set one — which left
   * every newly created account faceless until they happened to visit their
   * profile. Same downscale as self-service, from the shared helper, so the two
   * paths cannot drift into different ideas of what an avatar is.
   */
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const canSetPhoto = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(authUser?.role ?? '');

  async function setStaffPhoto(file: File) {
    if (!id) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await squareAvatarDataUrl(file);
      // Their own picture goes through the self-service endpoint — the only one
      // a non-admin could use anyway.
      const path = authUser?.id === id ? '/v1/hr/profile/avatar' : `/v1/hr/staff/${id}/avatar`;
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify({ avatar_url: dataUrl }) });
      setStaff(prev => (prev ? { ...prev, avatar_url: dataUrl } : prev));
      // Every mounted avatar for this person, in every app, re-fetches.
      forgetAvatar(id);
    } catch (e: any) {
      showAlert(e?.message || 'That picture could not be saved.');
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  /** Statutory and pay fields are real columns, not profile json. */
  const updateField = (key: keyof StaffData, value: string | null) => {
    setEditForm(prev => ({ ...prev, [key]: value }));
  };

  /**
   * Radix refuses an empty-string SelectItem value, so "not set" travels as a
   * sentinel and is turned back into null at this boundary — the API and the
   * database both want null, and '__none__' must never reach either.
   */
  const NONE = '__none__';
  const selectValue = (v: string | null | undefined) => (v ? v : NONE);
  const fromSelect = (v: string) => (v === NONE ? null : v);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--ink3)', fontSize: 13 }}>Loading profile…</div>;
  }
  if (!staff) {
    return <div style={{ padding: 40 }}><h2>Staff not found</h2><Link to="/nexushr/employees">Back</Link></div>;
  }

  const ss = STATUS_STYLE[staff.status] ?? STATUS_STYLE.ACTIVE;
  const initialsText = initials(staff.name);

  // Calculate filled fields for cards
  const workFields = [staff.employee_code, staff.designation, staff.dept, staff.reports_to, staff.employment_type, staff.hireDate];
  const workFilled = workFields.filter(f => f && f !== 'Not set' && f !== '—').length;

  const contactFields = [staff.email, staff.phone, staff.profile?.address, staff.profile?.city, staff.profile?.country];
  const contactFilled = contactFields.filter(f => f && f !== 'Not set' && f !== '—').length;

  const personalFields = [staff.profile?.date_of_birth, staff.profile?.gender, staff.profile?.language, staff.profile?.biometric_id];
  const personalFilled = personalFields.filter(f => f && f !== 'Not set' && f !== '—').length;

  const statutoryFields = [staff.national_id, staff.tax_id, staff.social_security_no,
                           staff.pension_fund, staff.health_insurance_no, staff.tax_residency];
  const statutoryFilled = statutoryFields.filter(f => f && f !== 'Not set' && f !== '—').length;

  // Counted as four regardless of method: salary, currency, method, and the one
  // destination field that identifies the account for whichever method is set.
  const payDestination = staff.pay_method === 'MOBILE_MONEY' ? staff.mobile_money_number
    : staff.pay_method === 'BANK' ? staff.bank_account_no
    : staff.pay_method === 'CASH' ? 'CASH' : null;
  const payFilled = [staff.basic_salary, staff.pay_currency, staff.pay_method, payDestination]
    .filter(f => f && f !== 'Not set' && f !== '—').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top Header Section */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '24px 32px 0 32px' }}>
          <BackButton to="/nexushr/employees" label="Employees" color="var(--blue)" />
        </div>
        {/* Profile Info Row */}
        <div style={{ padding: '24px 32px 16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {/* Every account can have a picture, not only the ones whose owner
                thought to set one. This also read staff.avatar_url directly,
                missing the shared cache that keeps one picture consistent
                across apps — PersonAvatar handles both. */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <PersonAvatar userId={staff.id} name={staff.name} src={staff.avatar_url ?? undefined} size={64} />
              {canSetPhoto && (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setStaffPhoto(f); }}
                  />
                  <button
                    type="button"
                    title="Set profile picture"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                    style={{
                      position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%',
                      border: '2px solid var(--white)', background: 'var(--teal)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <Icon name={photoBusy ? 'clock' : 'camera'} size={11} color="#fff" />
                  </button>
                </>
              )}
            </div>
            <div>
              <h1 style={{ margin: '0 0 6px 0', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{staff.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink2)' }}>
                {staff.designation || 'No designation'} &bull; {staff.dept || 'No department'} &bull; <strong style={{ color: 'var(--ink)' }}>{staff.employee_code}</strong>
                <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: ss.bg, color: ss.color }}>{ss.label}</span>
              </div>
            </div>
          </div>
          <div>
            <button type="button" onClick={startEdit} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'var(--teal)', borderColor: 'var(--teal)' }}>
              <Icon name="edit" size={14} color="#fff" /> Edit
            </button>
          </div>
        </div>

        {/* Horizontal Tabs */}
        <div style={{ padding: '0 32px', display: 'flex', gap: 24, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', padding: '12px 0', cursor: 'pointer',
                fontSize: 14, fontWeight: tab === t ? 600 : 500, color: tab === t ? 'var(--teal)' : 'var(--ink2)',
                borderBottom: tab === t ? '2px solid var(--teal)' : '2px solid transparent',
                whiteSpace: 'nowrap'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {tab === 'Profile' && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            
            {/* Left Column (Data Cards) */}
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
              
              <ProfileCard icon={<Icon name="briefcase" size={14} />} title="Work" filled={workFilled} total={6}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <FieldItem label="Employee Code" value={staff.employee_code} />
                  <FieldItem label="Designation" value={staff.designation} />
                  <FieldItem label="Department" value={staff.dept} />
                  <FieldItem label="Reports To" value={staff.reports_to} />
                  <FieldItem label="Employment Type" value={staff.employment_type} />
                  <FieldItem label="Joining Date" value={formatDate(staff.hireDate)} />
                </div>
              </ProfileCard>

              <ProfileCard icon={<Icon name="mail" size={14} />} title="Contact" filled={contactFilled} total={5}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <FieldItem label="Email" value={staff.email} />
                  <FieldItem label="Phone" value={staff.phone} />
                  <FieldItem label="Address" value={staff.profile?.address} />
                  <FieldItem label="City" value={staff.profile?.city} />
                  <FieldItem label="Country" value={staff.profile?.country} />
                </div>
              </ProfileCard>

              <ProfileCard icon={<Icon name="user" size={14} />} title="Personal" filled={personalFilled} total={4}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <FieldItem label="Date of Birth" value={staff.profile?.date_of_birth} />
                  <FieldItem label="Gender" value={staff.profile?.gender} />
                  <FieldItem label="Language" value={staff.profile?.language || 'English'} />
                  <FieldItem label="Biometric ID" value={staff.profile?.biometric_id} />
                </div>
              </ProfileCard>

              {/* Everything payroll needs to file a return. Blank until somebody
                  enters it — the engine treats missing as missing, not zero. */}
              <ProfileCard icon={<Icon name="shield" size={14} />} title="Statutory identity" filled={statutoryFilled} total={6}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <FieldItem label="NIDA / National ID" value={staff.national_id} />
                  <FieldItem label="TIN" value={staff.tax_id} />
                  <FieldItem label="Social security no." value={staff.social_security_no} />
                  <FieldItem label="Pension fund" value={staff.pension_fund} />
                  <FieldItem label="NHIF no." value={staff.health_insurance_no} />
                  <FieldItem
                    label="Tax residency"
                    value={staff.tax_residency === 'NON_RESIDENT' ? 'Non-resident' : staff.tax_residency === 'RESIDENT' ? 'Resident' : null}
                  />
                </div>
                {staff.tax_residency === 'NON_RESIDENT' && (
                  <div style={{ fontSize: 12, color: 'var(--ink2)', background: 'var(--gold-l)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 16 }}>
                    PAYE is a flat 15% with no tax-free band for a non-resident.
                  </div>
                )}
                {staff.hire_date_is_estimated && (
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    No hire date recorded — the leave cycle is being counted from the
                    day this account was created, which is a guess. Enter the real one.
                  </div>
                )}
              </ProfileCard>

              {canSetPay && (
                <ProfileCard icon={<Icon name="creditCard" size={14} />} title="Pay & payment" filled={payFilled} total={4}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <FieldItem
                      label="Basic salary"
                      value={staff.basic_salary
                        ? `${staff.pay_currency || 'TZS'} ${Number(staff.basic_salary).toLocaleString()}`
                        : null}
                    />
                    <FieldItem label="Paid by" value={PAY_METHOD_LABEL[staff.pay_method ?? ''] ?? null} />
                    {staff.pay_method === 'MOBILE_MONEY' ? (
                      <>
                        <FieldItem label="Provider" value={staff.mobile_money_provider} />
                        <FieldItem label="Mobile number" value={staff.mobile_money_number} />
                      </>
                    ) : staff.pay_method === 'BANK' ? (
                      <>
                        <FieldItem label="Bank" value={staff.bank_name} />
                        <FieldItem label="Branch" value={staff.bank_branch} />
                        <FieldItem label="Account number" value={staff.bank_account_no} />
                        <FieldItem label="Account name" value={staff.bank_account_name} />
                      </>
                    ) : null}
                  </div>
                </ProfileCard>
              )}

            </div>

            {/* Right Column (Summary & Action Cards) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}>Account</div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Status</span>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: ss.bg, color: ss.color }}>{ss.label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Role</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{staff.role === 'OFFICER' ? 'Employee' : staff.role}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Last seen</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{staff.last_login_at ? formatDate(staff.last_login_at) : 'Never'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Member since</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{staff.member_since}</span>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Current Shift</div>
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Manage</button>
                </div>
                <div style={{ padding: '20px', fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
                  No shift assigned — office hours from HR Settings apply.
                </div>
              </div>

              {/* Both live in the right column beside Account, because they are
                  facts about the person rather than fields of the profile form. */}
              {id && <StaffContracts userId={id} canEdit={canSetPay} />}
              {id && <StaffEmergencyContacts userId={id} canEdit={canSetPay} />}

              <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}>Quick actions</div>
                <div>
                  <ActionLink label="Add payroll" />
                  <ActionLink label="Upload document" onClick={() => { setTab('Documents'); fileInputRef.current?.click(); }} />
                  <ActionLink label="Assign shift" />
                  <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>View attendance</span>
                    <Icon name="chevronRight" size={14} color="var(--border)" />
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {tab === 'Attendance' && (
          <TabTable
            loading={tabLoading}
            rows={attendance}
            empty="No attendance has been recorded for this person."
            head={['Date', 'Status', 'In', 'Out', 'Note']}
            row={(a: any) => [
              formatDate(a.date),
              <AttBadge key="s" status={a.status} />,
              a.clock_in ?? '—',
              a.clock_out ?? '—',
              a.notes ?? '—',
            ]}
            summary={(rows: any[]) => {
              const n = (st: string) => rows.filter(r => r.status === st).length;
              // The counts are what a manager actually reads; the list is the
              // evidence behind them.
              return `${rows.length} days recorded — ${n('PRESENT')} present, ${n('LATE')} late, ${n('ABSENT')} absent`;
            }}
          />
        )}

        {tab === 'Leaves' && (
          <TabTable
            loading={tabLoading}
            rows={leaves}
            empty="This person has not requested any leave."
            head={['Type', 'From', 'To', 'Days', 'Status', 'Reason']}
            row={(l: any) => [
              l.type,
              formatDate(l.from_date),
              formatDate(l.to_date),
              String(l.days),
              <LeaveBadge key="s" status={l.status} />,
              l.reason ?? '—',
            ]}
            summary={(rows: any[]) => {
              const pending = rows.filter(r => r.status === 'PENDING').length;
              const taken = rows.filter(r => r.status === 'APPROVED').reduce((t, r) => t + Number(r.days || 0), 0);
              return `${taken} day(s) approved` + (pending ? `, ${pending} awaiting a decision` : '');
            }}
          />
        )}

        {tab === 'Payroll' && (
          tabDenied ? (
            // Refusal is its own state. Showing "no payslips" to someone who is
            // merely not allowed to look would be a quiet lie.
            <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <Icon name="lock" size={28} color="var(--border)" />
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>Pay details are restricted</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)' }}>{tabDenied}</div>
            </div>
          ) : (
            <TabTable
              loading={tabLoading}
              rows={payslips}
              empty="No payslip has been issued to this person yet."
              head={['Period', 'Gross', 'Taxable', 'PAYE', 'Deductions', 'Net', 'Status']}
              row={(p: any) => [
                p.run_name,
                money(p.gross_pay),
                money(p.taxable_pay),
                money(p.income_tax),
                money(p.total_deductions),
                <strong key="n">{money(p.net_pay)}</strong>,
                <RunBadge key="s" status={p.run_status} />,
              ]}
              summary={(rows: any[]) => {
                const paid = rows.filter(r => ['APPROVED', 'PAID'].includes(r.run_status));
                const net = paid.reduce((t, r) => t + Number(r.net_pay || 0), 0);
                const tax = paid.reduce((t, r) => t + Number(r.income_tax || 0), 0);
                const draft = rows.length - paid.length;
                return `${paid.length} payslip(s) issued — ${money(net)} net, ${money(tax)} PAYE`
                  + (draft ? `, ${draft} not yet approved` : '');
              }}
            />
          )
        )}

        {/* The most recent payslip, line by line, so the figures above can be
            explained without anyone re-running the payroll. */}
        {tab === 'Payroll' && !tabDenied && payslips.length > 0 && Array.isArray(payslips[0]?.lines) && (
          <div style={{ marginTop: 16, background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)' }}>
              {payslips[0].run_name} — how it was calculated
            </div>
            {/* Employer contributions are split off rather than listed among the
                deductions. They are a cost the employer bears on top of pay, and
                a minus sign beside them reads as money taken from this person —
                it is not, and their net is unaffected by it. */}
            {(() => {
              const lines = payslips[0].lines as any[];
              const own = lines.filter(l => l.kind !== 'EMPLOYER_CONTRIBUTION');
              const employer = lines.filter(l => l.kind === 'EMPLOYER_CONTRIBUTION');
              const Row = ({ l, muted }: { l: any; muted?: boolean }) => (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 16px' }}>
                  <span style={{ fontSize: 13, color: muted ? 'var(--ink3)' : 'var(--ink)', minWidth: 200 }}>{l.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)', flex: 1 }}>
                    {l.basis ?? (l.kind === 'EARNING' ? 'earning' : '')}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: muted ? 'var(--ink3)' : l.kind === 'EARNING' ? 'var(--green)' : 'var(--ink)',
                  }}>
                    {l.kind === 'EARNING' || muted ? '' : '−'}{money(l.amount)}
                  </span>
                </div>
              );
              return (
                <>
                  <div style={{ padding: '4px 0' }}>
                    {own.map((l, i) => <Row key={i} l={l} />)}
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', padding: '10px 16px',
                    borderTop: '1px solid var(--border)', background: 'var(--bg)',
                    fontSize: 13, fontWeight: 700, color: 'var(--ink)',
                  }}>
                    <span>Net pay</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(payslips[0].net_pay)}</span>
                  </div>
                  {employer.length > 0 && (
                    <>
                      <div style={{ padding: '9px 16px', borderTop: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
                        Paid by the employer — not deducted from this pay
                      </div>
                      <div style={{ padding: '0 0 6px' }}>
                        {employer.map((l, i) => <Row key={i} l={l} muted />)}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* One refusal state for every tab but Payroll, which words it its own
            way. "You may not look" and "there is nothing here" are different
            answers; rendering an empty table for the first is a quiet lie. */}
        {tabDenied && tab !== 'Payroll' && tab !== 'Profile' && (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <Icon name="lock" size={28} color="var(--border)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>This tab could not be shown</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)' }}>{tabDenied}</div>
          </div>
        )}

        {tab === 'Timesheet' && !tabDenied && (
          <TabTable
            loading={tabLoading}
            rows={tabRows.Timesheet ?? []}
            empty="No time has been logged for this person."
            head={['Date', 'Task', 'Project', 'Billable', 'Duration', 'Note']}
            summary={rows => {
              const mins = rows.reduce((t, r) => t + Number(r.duration_minutes ?? 0), 0);
              const bill = rows.filter(r => r.is_billable).reduce((t, r) => t + Number(r.duration_minutes ?? 0), 0);
              return `${rows.length} entries · ${hhmm(mins)} logged, ${hhmm(bill)} of it billable`;
            }}
            row={r => [
              formatDate(r.date),
              r.task_name || '—',
              r.project_ref || '—',
              r.is_billable ? 'Yes' : 'No',
              hhmm(Number(r.duration_minutes ?? 0)),
              r.notes || '—',
            ]}
          />
        )}

        {tab === 'Projects' && !tabDenied && (
          <TabTable
            loading={tabLoading}
            rows={tabRows.Projects ?? []}
            empty="No project time has been logged for this person."
            head={['Project', 'Entries', 'Time', 'Billable', 'Last worked']}
            summary={() => 'Grouped from logged time — there is no separate project record behind this.'}
            row={r => [
              r.project === '(no project)'
                ? <span style={{ color: 'var(--ink3)' }}>No project</span>
                : r.project,
              r.entries,
              hhmm(r.minutes),
              hhmm(r.billable_minutes),
              r.last_worked ? formatDate(r.last_worked) : '—',
            ]}
          />
        )}

        {tab === 'Documents' && !tabDenied && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={openEmployeeDrive}
                disabled={resolvingFolder}
                className="btn btn-secondary btn-sm"
              >
                {resolvingFolder ? 'Opening…' : 'Open Drive'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }}
              >
                {uploading ? 'Uploading…' : 'Upload document'}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: -6, marginBottom: 12 }}>
              Uploaded documents are automatically mirrored into this person's own Drive folder.
            </div>
            <TabTable
              loading={tabLoading}
              rows={tabRows.Documents ?? []}
              empty="No documents are on file for this person."
              head={['Name', 'Type', 'Status', 'Added']}
              row={r => [r.name, r.type || '—', <StatusChip key="s" value={r.status} />, formatDate(r.created_at)]}
            />
          </div>
        )}

        {tab === 'Tickets' && !tabDenied && (
          <TabTable
            loading={tabLoading}
            rows={tabRows.Tickets ?? []}
            empty="No support tickets are assigned to this person."
            head={['Ref', 'Subject', 'Priority', 'Status', 'Opened', 'Resolved']}
            summary={rows => {
              const open = rows.filter(r => !r.resolved_at).length;
              return `${rows.length} assigned · ${open} still open`;
            }}
            row={r => [
              r.ref_number || '—', r.subject,
              r.priority || '—',
              <StatusChip key="s" value={r.status} />,
              formatDate(r.created_at),
              r.resolved_at ? formatDate(r.resolved_at) : '—',
            ]}
          />
        )}

        {tab === 'Shift Roster' && !tabDenied && (
          <TabTable
            loading={tabLoading}
            rows={tabRows['Shift Roster'] ?? []}
            empty="No shifts have been assigned to this person."
            head={['Date', 'Shift', 'Starts', 'Ends', 'Break', 'Grace']}
            row={r => [
              formatDate(r.date),
              <span key="n" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color || 'var(--teal)' }} />
                {r.shift_name}
              </span>,
              r.start_time, r.end_time,
              r.break_minutes != null ? `${r.break_minutes} min` : '—',
              r.grace_minutes != null ? `${r.grace_minutes} min` : '—',
            ]}
          />
        )}

        {tab === 'Activity' && !tabDenied && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Two different questions, so two sections rather than one merged
                list that answers neither: what this person did, and what was
                done to their record. */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Changes to this record</div>
              {id && <RecordActivity entityType="user" entityId={id}
                emptyText="Nothing has been changed on this record yet." />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>What this person did</div>
              <TabTable
                loading={tabLoading}
                rows={tabRows.Activity ?? []}
                empty="No activity has been logged for this person."
                head={['When', 'Module', 'What happened']}
                row={r => [formatDate(r.created_at), r.module || '—', r.action]}
              />
            </div>
          </div>
        )}

        {tab === 'Permissions' && !tabDenied && (
          tabLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>Loading…</div>
          ) : (
            <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, color: 'var(--ink2)' }}>
                Role <strong style={{ color: 'var(--ink)' }}>{tabRows.Permissions?.role ?? '—'}</strong>
                {tabRows.Permissions?.active === false && ' · account deactivated'}
                {/* Named as derived, because it is: there is no separate
                    permissions model, only the role checks in the routes. */}
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink3)' }}>
                  Derived from the role checks the API actually enforces, not from a separate permissions table.
                </div>
              </div>
              {(tabRows.Permissions?.capabilities ?? []).map((c: any) => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{c.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.granted ? 'var(--green)' : 'var(--ink4)' }}>
                    {c.granted ? 'Allowed' : 'Not allowed'}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {/* Withheld on purpose, and says so — an empty table here would read as
            "this person has nothing on", which is a different claim. */}
        {WITHHELD_TABS[tab] && (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <Icon name="lock" size={32} color="var(--border)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>Not shown here</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)', maxWidth: 460, margin: '6px auto 0' }}>
              {WITHHELD_TABS[tab]}
            </div>
          </div>
        )}

        {tab !== 'Profile' && !LIVE_TABS[tab] && !WITHHELD_TABS[tab] && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <Icon name="clock" size={32} color="var(--border)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>The {tab} module is coming soon</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)' }}>No endpoint backs this tab yet.</div>
          </div>
        )}
      </div>

      {/* Mounted always, not inside the Documents tab: the Profile quick action
          switches tab and opens the picker in the same handler, and an input
          that has not rendered yet cannot be clicked. */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); }}
      />

      {/* Edit Profile Modal */}
      {isEditing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Edit Employee Profile</h2>
              <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={20} /></button>
            </div>
            
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Work Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Employee Code</label>
                    <input value={editForm.profile.employee_code || ''} onChange={e => updateProfileField('employee_code', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Designation</label>
                    <input value={editForm.profile.job_title || ''} onChange={e => updateProfileField('job_title', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Department</label>
                    <input value={editForm.profile.department || ''} onChange={e => updateProfileField('department', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Reports To</label>
                    <input value={editForm.profile.reports_to || ''} onChange={e => updateProfileField('reports_to', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Employment Type</label>
                    <input value={editForm.profile.employment_type || ''} onChange={e => updateProfileField('employment_type', e.target.value)} style={inputSt} />
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Contact Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Full Name</label>
                    <input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Phone Number</label>
                    <input value={editForm.phone || ''} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} style={inputSt} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Address</label>
                    <input value={editForm.profile.address || ''} onChange={e => updateProfileField('address', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>City</label>
                    <input value={editForm.profile.city || ''} onChange={e => updateProfileField('city', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Country</label>
                    <input value={editForm.profile.country || ''} onChange={e => updateProfileField('country', e.target.value)} style={inputSt} />
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Personal Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Date of Birth</label>
                    <input type="date" value={editForm.profile.date_of_birth || ''} onChange={e => updateProfileField('date_of_birth', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Gender</label>
                    <select value={editForm.profile.gender || ''} onChange={e => updateProfileField('gender', e.target.value)} style={inputSt}>
                      <option value="">Select gender...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Language</label>
                    <input value={editForm.profile.language || ''} onChange={e => updateProfileField('language', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Biometric ID</label>
                    <input value={editForm.profile.biometric_id || ''} onChange={e => updateProfileField('biometric_id', e.target.value)} style={inputSt} />
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Statutory Identity</h3>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12, lineHeight: 1.5 }}>
                  What payroll needs to file a return. Leave a field blank rather than
                  inventing a placeholder — the engine treats missing as missing.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Hire date</label>
                    <input type="date" value={editForm.hire_date || ''} onChange={e => updateField('hire_date', e.target.value)} style={inputSt} />
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>The leave cycle resets on this anniversary, not on 1 January.</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Tax residency</label>
                    <Select value={selectValue(editForm.tax_residency)} onValueChange={v => updateField('tax_residency', fromSelect(v))}>
                      <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        <SelectItem value="RESIDENT">Resident</SelectItem>
                        <SelectItem value="NON_RESIDENT">Non-resident</SelectItem>
                      </SelectContent>
                    </Select>
                    {editForm.tax_residency === 'NON_RESIDENT' && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>PAYE becomes a flat 15% with no tax-free band.</div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>NIDA / National ID</label>
                    <input value={editForm.national_id || ''} onChange={e => updateField('national_id', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>TIN</label>
                    <input value={editForm.tax_id || ''} onChange={e => updateField('tax_id', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Social security number</label>
                    <input value={editForm.social_security_no || ''} onChange={e => updateField('social_security_no', e.target.value)} style={inputSt} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Pension fund</label>
                    <Select value={selectValue(editForm.pension_fund)} onValueChange={v => updateField('pension_fund', fromSelect(v))}>
                      <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        <SelectItem value="NSSF">NSSF — private sector</SelectItem>
                        <SelectItem value="PSSSF">PSSSF — public service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>NHIF number</label>
                    <input value={editForm.health_insurance_no || ''} onChange={e => updateField('health_insurance_no', e.target.value)} style={inputSt} />
                  </div>
                </div>
              </div>

              {canSetPay && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Pay &amp; Payment</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Basic salary</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={editForm.basic_salary ?? ''}
                        onChange={e => updateField('basic_salary', e.target.value)}
                        style={inputSt}
                      />
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                        Social security is 10% of basic; NHIF and WCF are on gross.
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
                      <input
                        value={editForm.pay_currency || ''}
                        onChange={e => updateField('pay_currency', e.target.value.toUpperCase())}
                        placeholder="TZS" maxLength={3} style={inputSt}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Paid by</label>
                      <Select value={selectValue(editForm.pay_method)} onValueChange={v => updateField('pay_method', fromSelect(v))}>
                        <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not set</SelectItem>
                          <SelectItem value="MOBILE_MONEY">Mobile money</SelectItem>
                          <SelectItem value="BANK">Bank transfer</SelectItem>
                          <SelectItem value="CASH">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Only the fields the chosen method actually uses. Showing both
                        sets invites half of each to be filled in, and a payment file
                        built from that fails at the bank rather than here. */}
                    {editForm.pay_method === 'MOBILE_MONEY' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Provider</label>
                          <Select value={selectValue(editForm.mobile_money_provider)} onValueChange={v => updateField('mobile_money_provider', fromSelect(v))}>
                            <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Not set</SelectItem>
                              {MOBILE_MONEY_PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Mobile number</label>
                          <input value={editForm.mobile_money_number || ''} onChange={e => updateField('mobile_money_number', e.target.value)} placeholder="07XX XXX XXX" style={inputSt} />
                        </div>
                      </>
                    )}

                    {editForm.pay_method === 'BANK' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Bank</label>
                          <input value={editForm.bank_name || ''} onChange={e => updateField('bank_name', e.target.value)} style={inputSt} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Branch</label>
                          <input value={editForm.bank_branch || ''} onChange={e => updateField('bank_branch', e.target.value)} style={inputSt} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Account number</label>
                          <input value={editForm.bank_account_no || ''} onChange={e => updateField('bank_account_no', e.target.value)} style={inputSt} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Account name</label>
                          <input value={editForm.bank_account_name || ''} onChange={e => updateField('bank_account_name', e.target.value)} style={inputSt} />
                          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>As it appears at the bank — not always the employee's own name.</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

            </div>
            
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg)' }}>
              <button type="button" onClick={() => setIsEditing(false)} className="btn btn-secondary" style={{ padding: '10px 20px', borderRadius: 8 }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
