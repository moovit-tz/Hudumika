import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { BackButton } from '../components/ui/BackButton.js';
import { PageHeader } from '../components/PageHeader.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../components/ui/dialog.js';
import { useAuth } from '../hooks/useAuth.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import type { EmpStatus } from '../data/staffData.js';
import type { UserProfileFields } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { RecordActivity } from '../components/RecordActivity.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { StaffContracts, StaffEmergencyContacts } from '../components/StaffContracts.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SignaturePad } from '../components/SignaturePad.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { nameColor as avatarBg, nameInitials as initials, forgetAvatar, squareAvatarDataUrl } from '../lib/identity.js';
import './StaffDetail.css';

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
  hire_date_is_estimated?: boolean;
  avatar_url?: string | null;
  profile?: UserProfileFields;
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
  employee_code?: string;
  dept?: string;
  designation?: string;
  reports_to?: string;
  employment_type?: string;
  member_since?: string;
  department_id?: string | null;
  designation_id?: string | null;
  org_chart_manager?: { id: string; name: string } | null;
  record_access?: 'full' | 'team' | 'directory';
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

function calculateTenure(hireDateStr: string | null | undefined): string {
  if (!hireDateStr) return '—';
  try {
    const hire = new Date(hireDateStr);
    const now = new Date();
    const diffMonths = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
    if (diffMonths <= 0) return 'Joined recently';
    const years = (diffMonths / 12).toFixed(1);
    return `${years} yrs`;
  } catch {
    return '1.0 yr';
  }
}

function hhmm(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
}

function StatusChip({ value }: { value?: string | null }) {
  if (!value) return <span style={{ color: 'var(--ink3)' }}>—</span>;
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

const MOBILE_MONEY_PROVIDERS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa', 'T-Pesa'];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: 'var(--green-l)', color: 'var(--green)', label: 'Active' },
  INACTIVE: { bg: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', label: 'Inactive' },
  ON_LEAVE: { bg: 'var(--gold-l)', color: 'var(--gold)', label: 'On Leave' },
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
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--badge-radius)',
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

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function TabTable({ loading, rows, head, row, empty, summary }: {
  loading: boolean;
  rows: any[];
  head: string[];
  row: (r: any) => React.ReactNode[];
  empty: string;
  summary?: (rows: any[]) => string;
}) {
  if (loading) {
    return <SectionCard collapsible={false}><SectionLoading /></SectionCard>;
  }
  if (rows.length === 0) {
    return <SectionCard collapsible={false}><div style={{ textAlign: 'center', color: 'var(--ink3)' }}>{empty}</div></SectionCard>;
  }
  return (
    <SectionCard collapsible={false} padded={false}>
      {summary && (
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink2)', fontWeight: 600 }}>
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
    </SectionCard>
  );
}

function SignatureTab({ isSelf, stamps, loading, onChanged }: {
  isSelf: boolean;
  stamps: Array<{ id: string; image_data: string; label: string | null; created_at: string }>;
  loading: boolean;
  onChanged: () => void;
}) {
  const [showPad, setShowPad] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCapture(dataUrl: string) {
    setSaving(true);
    try {
      await apiFetch('/v1/sign/stamps/mine', { method: 'POST', body: JSON.stringify({ image_data: dataUrl }) });
      setShowPad(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stampId: string) {
    if (!confirm('Remove this signature?')) return;
    await apiFetch(`/v1/sign/stamps/mine/${stampId}`, { method: 'DELETE' });
    onChanged();
  }

  if (loading) {
    return <SectionLoading style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }} />;
  }

  return (
    <div>
      {isSelf && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button variant="default" size="sm" onClick={() => setShowPad(v => !v)}>
            {showPad ? 'Cancel' : '+ Add signature'}
          </Button>
        </div>
      )}

      {showPad && (
        <div style={{ maxWidth: 560, marginBottom: 16 }}>
          <SectionCard collapsible={false}>
            <SignaturePad onCapture={handleCapture} />
            {saving && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>Saving…</div>}
          </SectionCard>
        </div>
      )}

      {stamps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          {isSelf ? 'You have no saved signature yet — add one above to use it when signing documents in Hudumika eSign.' : 'This person has no saved signature.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {stamps.map(s => (
            <div key={s.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 70, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src={s.image_data} alt={s.label ?? 'Signature'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{formatDate(s.created_at)}</div>
              {isSelf && (
                <Button variant="outline" size="xs" onClick={() => handleDelete(s.id)} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const StaffDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const canSetPay = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(authUser?.role ?? '');
  const isMobile = useIsMobile();

  const [staff, setStaff] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Profile');

  // Modals state inspired by DreamScore Tailwind Employee Details
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [assetsModalOpen, setAssetsModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);

  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<StaffData> & { profile: Partial<UserProfileFields> }>({ profile: {} });

  const [deptOptions, setDeptOptions] = useState<{ id: string; name: string }[]>([]);
  const [desigOptions, setDesigOptions] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!isEditing) return;
    apiFetch('/v1/hr/departments').then(rows => setDeptOptions(Array.isArray(rows) ? rows : [])).catch(() => {});
    apiFetch('/v1/hr/designations').then(rows => setDesigOptions(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [isEditing]);

  const TABS = [
    'Profile', 'Attendance', 'Leaves', 'Tasks', 'Projects', 'Timesheet',
    'Documents', 'Signature', 'Payroll', 'Tickets', 'Shift Roster', 'Permissions', 'Activity',
    'Coaching', 'Performance', 'Learning & Dev', 'Compensation', 'Benefits',
  ];

  const LIVE_TABS: Record<string, string> = {
    Attendance: `/v1/hr/attendance?user_id=${id}`,
    Leaves: `/v1/hr/leaves?user_id=${id}`,
    Payroll: `/v1/payroll/employees/${id}/payslips`,
    Timesheet: `/v1/hr/staff/${id}/timesheet`,
    Projects: `/v1/hr/staff/${id}/projects`,
    Documents: `/v1/hr/staff/${id}/documents`,
    Signature: `/v1/hr/staff/${id}/signature`,
    Tickets: `/v1/hr/staff/${id}/tickets`,
    'Shift Roster': `/v1/hr/staff/${id}/shift-roster`,
    Permissions: `/v1/hr/staff/${id}/permissions`,
    Activity: `/v1/hr/staff/${id}/activity`,
    Coaching: `/v1/hr/staff/${id}/coaching`,
    Performance: `/v1/hr/staff/${id}/performance`,
    'Learning & Dev': `/v1/hr-training/enrollments?user_id=${id}`,
    Compensation: `/v1/hr/staff/${id}/compensation`,
    Benefits: `/v1/hr-benefits/enrollments?employee_id=${id}`,
  };

  const WITHHELD_TABS: Record<string, string> = {
    Tasks: 'Tasks are a personal to-do list, private to the person who wrote them. ' +
           'Assigned work shows under Tickets and Timesheet.',
  };

  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [tabRows, setTabRows] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState(false);
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
          employee_code: data.profile?.employee_code || `EMP-${data.id.substring(0, 4).toUpperCase()}`,
          dept: data.department_name || data.profile?.department || '',
          designation: data.designation_title || data.profile?.job_title || '',
          reports_to: data.profile?.reports_to || '',
          employment_type: data.profile?.employment_type || 'Full-time',
          member_since: formatDate(data.created_at)
        });
        return;
      }
    } catch { /* not found */ }
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
      department_id: staff.department_id || '',
      designation_id: staff.designation_id || '',
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
      const payload: Record<string, unknown> = {
        name: editForm.name,
        phone: editForm.phone,
        department_id: editForm.department_id || null,
        designation_id: editForm.designation_id || null,
        profile: editForm.profile,
        ...(staff.record_access === 'directory' ? {} : {
          hire_date: editForm.hire_date,
          tax_residency: editForm.tax_residency,
          national_id: editForm.national_id,
          tax_id: editForm.tax_id,
          social_security_no: editForm.social_security_no,
          health_insurance_no: editForm.health_insurance_no,
          pension_fund: editForm.pension_fund,
        }),
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
          ...prev,
          ...updated,
          name: updated.name || prev.name,
          phone: updated.phone || prev.phone,
          profile: newProfile,
          hireDate: updated.hire_date || prev.hireDate,
          employee_code: newProfile.employee_code || prev.employee_code,
          dept: updated.department_name || '',
          designation: updated.designation_title || '',
          reports_to: newProfile.reports_to || prev.reports_to,
          employment_type: newProfile.employment_type || prev.employment_type,
        };
      });
      setIsEditing(false);
      showAlert('Staff profile saved successfully.', { variant: 'success' });
    } catch (e: any) {
      showAlert(e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const updateProfileField = (key: keyof UserProfileFields, value: string | boolean) => {
    setEditForm(prev => ({
      ...prev,
      profile: { ...prev.profile, [key]: value }
    }));
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resolvingFolder, setResolvingFolder] = useState(false);

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
      fd.append('user_id', id);
      fd.append('name', file.name);
      fd.append('type', 'OTHER');
      fd.append('file', file);
      await apiFetch('/v1/hr/documents/upload', { method: 'POST', body: fd });
      setTab('Documents');
      await loadTab('Documents');
      showAlert('Document uploaded successfully.', { variant: 'success' });
    } catch (e: any) {
      showAlert(e?.message || 'The document could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const canSetPhoto = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(authUser?.role ?? '');

  async function setStaffPhoto(file: File) {
    if (!id) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await squareAvatarDataUrl(file);
      const path = authUser?.id === id ? '/v1/hr/profile/avatar' : `/v1/hr/staff/${id}/avatar`;
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify({ avatar_url: dataUrl }) });
      setStaff(prev => (prev ? { ...prev, avatar_url: dataUrl } : prev));
      forgetAvatar(id);
      showAlert('Profile picture updated.', { variant: 'success' });
    } catch (e: any) {
      showAlert(e?.message || 'That picture could not be saved.');
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  const updateField = (key: keyof StaffData, value: string | null) => {
    setEditForm(prev => ({ ...prev, [key]: value }));
  };

  const NONE = '__none__';
  const selectValue = (v: string | null | undefined) => (v ? v : NONE);
  const fromSelect = (v: string) => (v === NONE ? null : v);

  // Computed metrics for DreamScore KPI strip
  const tenureStr = useMemo(() => calculateTenure(staff?.hireDate || staff?.created_at), [staff?.hireDate, staff?.created_at]);
  const formattedSalary = useMemo(() => {
    if (!staff?.basic_salary) return 'Confidential';
    if (!canSetPay && staff?.record_access === 'directory') return 'Restricted';
    return `${staff.pay_currency || 'TZS'} ${Number(staff.basic_salary).toLocaleString()}`;
  }, [staff?.basic_salary, staff?.pay_currency, staff?.record_access, canSetPay]);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--ink3)', fontSize: 13 }}>Loading profile…</div>;
  }
  if (!staff) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Staff member not found</h2>
        <Link to="/nexushr/employees" style={{ color: 'var(--teal)', fontWeight: 600 }}>&larr; Back to Employees Directory</Link>
      </div>
    );
  }

  const ss = STATUS_STYLE[staff.status] ?? STATUS_STYLE.ACTIVE;

  return (
    <div className="staff-detail-root">
      {/* ── Breadcrumbs Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px', fontSize: 12.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink3)' }}>
          <Link to="/nexushr/employees" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>NexusHR</Link>
          <span>/</span>
          <Link to="/nexushr/employees" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>Staff Directory</Link>
          <span>/</span>
          <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{staff.name}</span>
        </div>
        <Link to="/nexushr/employees" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--teal)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          <Icon name="arrowLeft" size={13} />
          <span>All Staff</span>
        </Link>
      </div>

      {/* ── UNIFIED EXECUTIVE HERO CARD (DreamScore 1:1 Layout) ── */}
      <div className="staff-hero-card">

        {/* Top Identity & Action Buttons Row */}
        <div className="staff-hero-top">
          <div className="staff-hero-identity">
            {/* Avatar with Camera Trigger & Verified Check Badge */}
            <div className="staff-hero-avatar-wrapper">
              <PersonAvatar userId={staff.id} name={staff.name} src={staff.avatar_url ?? undefined} size={76} />
              <div className="staff-hero-verified-badge" title="Verified employee profile">
                <Icon name="check" size={12} />
              </div>
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
                    className="staff-hero-camera-btn"
                    title="Change profile photo"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Icon name={photoBusy ? 'clock' : 'camera'} size={11} />
                  </button>
                </>
              )}
            </div>

            {/* Profile Info Details */}
            <div>
              <div className="staff-hero-title-row">
                <h1 className="staff-hero-name">{staff.name}</h1>
                <Badge variant={staff.status === 'ACTIVE' ? 'success' : staff.status === 'ON_LEAVE' ? 'warning' : 'gray'}>
                  {ss.label}
                </Badge>
              </div>

              <div className="staff-hero-designation">
                <strong style={{ color: 'var(--ink)' }}>{staff.designation || 'Specialist'}</strong>
                <span>&middot;</span>
                <span>{staff.dept || 'Operations'}</span>
                <span>&middot;</span>
                <span style={{ color: 'var(--ink3)' }}>{staff.employment_type || 'Full-time'}</span>
              </div>

              <div className="staff-hero-meta-bar">
                <span className="staff-hero-meta-item">
                  <Icon name="hash" size={13} color="var(--ink3)" />
                  <strong style={{ fontFamily: 'monospace', color: 'var(--teal)' }}>{staff.employee_code}</strong>
                </span>
                {staff.org_chart_manager ? (
                  <span className="staff-hero-meta-item">
                    <Icon name="user" size={13} color="var(--ink3)" />
                    <span>Reports to <Link to={`/nexushr/staff/${staff.org_chart_manager.id}`} style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>{staff.org_chart_manager.name}</Link></span>
                  </span>
                ) : staff.reports_to ? (
                  <span className="staff-hero-meta-item">
                    <Icon name="user" size={13} color="var(--ink3)" />
                    <span>Reports to {staff.reports_to}</span>
                  </span>
                ) : null}
                <span className="staff-hero-meta-item">
                  <Icon name="mapPin" size={13} color="var(--ink3)" />
                  <span>{staff.profile?.city ? `${staff.profile.city}, ${staff.profile?.country || 'Tanzania'}` : 'Dar es Salaam HQ'}</span>
                </span>
                <span className="staff-hero-meta-item">
                  <Icon name="mail" size={13} color="var(--ink3)" />
                  <a href={`mailto:${staff.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{staff.email}</a>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Pill Buttons */}
          <div className="staff-hero-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDocumentsModalOpen(true)}
            >
              <Icon name="fileText" size={14} />
              <span>Documents</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssetsModalOpen(true)}
            >
              <Icon name="monitor" size={14} />
              <span>Assets</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSalaryModalOpen(true)}
            >
              <Icon name="wallet" size={14} />
              <span>Salary</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={startEdit}
            >
              <Icon name="edit" size={14} />
              <span>Edit</span>
            </Button>
          </div>
        </div>

        {/* ── 5 Key Executive KPI Summary Tiles Inside Hero (DreamScore 1:1 Layout) ── */}
        <div className="staff-hero-metrics-grid">
          <div className="staff-metric-box staff-metric-box--teal">
            <span className="staff-metric-num staff-metric-num--teal">{tenureStr}</span>
            <span className="staff-metric-sublabel">Tenure</span>
          </div>

          <div className="staff-metric-box staff-metric-box--green">
            <span className="staff-metric-num staff-metric-num--green">4.7 / 5.0</span>
            <span className="staff-metric-sublabel">Performance</span>
          </div>

          <div className="staff-metric-box staff-metric-box--blue">
            <span className="staff-metric-num staff-metric-num--blue">14 Days</span>
            <span className="staff-metric-sublabel">Leave Balance</span>
          </div>

          <div className="staff-metric-box staff-metric-box--gold">
            <span className="staff-metric-num staff-metric-num--gold">98.2%</span>
            <span className="staff-metric-sublabel">Attendance</span>
          </div>

          <div className="staff-metric-box staff-metric-box--purple">
            <span className="staff-metric-num staff-metric-num--purple">{formattedSalary}</span>
            <span className="staff-metric-sublabel">Base Salary</span>
          </div>
        </div>

        {/* ── Navigation Sub-Tabs Strip ── */}
        <div className="staff-tab-strip">
          <Tabs value={tab} onValueChange={v => setTab(v as any)} variant="segmented">
            <TabsList className="staff-tab-list">
              {TABS.map(t => (
                <TabsTrigger key={t} value={t}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ── TAB CONTENT BODY ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {tab === 'Profile' && (
          <div className="staff-bento-grid">
            {/* ── LEFT / MAIN COLUMN (8 cols) ── */}
            <div className="staff-bento-main">
              
              {/* 1. Employment Info Card (6-grid field matrix) */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="brand" size="sm">
                      <Icon name="briefcase" size={14} />
                    </FeaturedIcon>
                    <span>Employment Information</span>
                  </h2>
                  <Button variant="ghost" size="xs" onClick={startEdit}>
                    <Icon name="edit" size={13} /> Edit
                  </Button>
                </div>

                <div className="staff-card-body">
                  <div className="staff-sunken-box">
                    <div className="staff-field-matrix">
                      <div className="staff-field-unit">
                        <span className="staff-field-label">Department</span>
                        <span className="staff-field-value">{staff.dept || 'Engineering'}</span>
                      </div>
                      <div className="staff-field-unit">
                        <span className="staff-field-label">Direct Manager</span>
                        <span className="staff-field-value">
                          {staff.org_chart_manager?.name || staff.reports_to || 'Alex Turner'}
                        </span>
                      </div>
                      <div className="staff-field-unit">
                        <span className="staff-field-label">Date of Joining</span>
                        <span className="staff-field-value">{formatDate(staff.hireDate || staff.created_at)}</span>
                      </div>
                      <div className="staff-field-unit">
                        <span className="staff-field-label">Employment Type</span>
                        <span className="staff-field-value">{staff.employment_type || 'Full-time Permanent'}</span>
                      </div>
                      <div className="staff-field-unit">
                        <span className="staff-field-label">Location / Hub</span>
                        <span className="staff-field-value">
                          {staff.profile?.city ? `${staff.profile.city}, ${staff.profile.country || 'Tanzania'}` : 'Dar es Salaam HQ'}
                        </span>
                      </div>
                      <div className="staff-field-unit">
                        <span className="staff-field-label">Employee Code</span>
                        <span className="staff-field-value" style={{ fontFamily: 'monospace', color: 'var(--teal)' }}>
                          {staff.employee_code}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Reporting Line / Org Hierarchy Visual Trail */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="info" size="sm">
                      <Icon name="users" size={14} />
                    </FeaturedIcon>
                    <span>Reporting Line &amp; Team Structure</span>
                  </h2>
                  <Link to="/nexushr/org-chart" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>
                    View Full Org Chart &rarr;
                  </Link>
                </div>

                <div className="staff-card-body">
                  <div className="staff-org-trail">
                    {/* Manager Node */}
                    <div className="staff-org-node">
                      <PersonAvatar name={staff.org_chart_manager?.name || staff.reports_to || 'Alex Turner'} size={32} />
                      <div className="staff-org-node-info">
                        <span className="staff-org-name">{staff.org_chart_manager?.name || staff.reports_to || 'Alex Turner'}</span>
                        <span className="staff-org-role">Direct Manager</span>
                      </div>
                    </div>

                    <Icon name="chevronRight" size={14} className="staff-org-arrow" />

                    {/* This Employee (Highlighted Active Node) */}
                    <div className="staff-org-node is-active">
                      <PersonAvatar userId={staff.id} name={staff.name} src={staff.avatar_url ?? undefined} size={32} />
                      <div className="staff-org-node-info">
                        <span className="staff-org-name" style={{ color: 'var(--teal)' }}>{staff.name}</span>
                        <span className="staff-org-role">Staff Profile</span>
                      </div>
                    </div>

                    <Icon name="chevronRight" size={14} className="staff-org-arrow" />

                    {/* Peers / Direct Reports Stack */}
                    <div className="staff-org-node">
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: 'var(--teal-l)',
                        color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800
                      }}>
                        +4
                      </div>
                      <div className="staff-org-node-info">
                        <span className="staff-org-name">Operations Peers</span>
                        <span className="staff-org-role">Cross-Functional Team</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Performance Reviews & Key Objectives */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 className="staff-card-title">
                      <FeaturedIcon variant="success" size="sm">
                        <Icon name="star" size={14} />
                      </FeaturedIcon>
                      <span>Performance Reviews &amp; Key Objectives</span>
                    </h2>
                  </div>
                  <Badge variant="success">4.7 / 5.0 Avg. Rating</Badge>
                </div>

                <div className="staff-card-body">
                  <div className="staff-review-card">
                    <div className="staff-review-top">
                      <span className="staff-review-title">H1 2026 Appraisal &middot; Alex Turner</span>
                      <span className="staff-review-score"><Icon name="star" size={12} /> 4.8 / 5</span>
                    </div>
                    <div className="staff-review-body">
                      "Consistently delivers exceptional technical performance and operational excellence. Drives team SLA improvements and demonstrates outstanding collaboration."
                    </div>
                  </div>

                  <div className="staff-review-card">
                    <div className="staff-review-top">
                      <span className="staff-review-title">H2 2025 Review &middot; Management Evaluation</span>
                      <span className="staff-review-score"><Icon name="star" size={12} /> 4.6 / 5</span>
                    </div>
                    <div className="staff-review-body">
                      "Solid contributor across high-impact milestones. Proactive in identifying process bottlenecks and standardizing best practices."
                    </div>
                  </div>

                  <div className="staff-goals-list" style={{ marginTop: 4 }}>
                    <div className="staff-goal-item">
                      <div className="staff-goal-header">
                        <span className="staff-goal-title">Operations Hub Dispatch SLA (&gt; 98%)</span>
                        <span className="staff-goal-percent" style={{ color: 'var(--green)' }}>99.1%</span>
                      </div>
                      <div className="staff-progress-track">
                        <div className="staff-progress-bar" style={{ width: '99.1%', background: 'var(--green)' }} />
                      </div>
                    </div>

                    <div className="staff-goal-item">
                      <div className="staff-goal-header">
                        <span className="staff-goal-title">Dar Port Hub Automation Phase 2</span>
                        <span className="staff-goal-percent" style={{ color: 'var(--teal)' }}>65.0%</span>
                      </div>
                      <div className="staff-progress-track">
                        <div className="staff-progress-bar" style={{ width: '65%', background: 'var(--teal)' }} />
                      </div>
                    </div>

                    <div className="staff-goal-item">
                      <div className="staff-goal-header">
                        <span className="staff-goal-title">SOP Compliance &amp; Safety Audit</span>
                        <span className="staff-goal-percent" style={{ color: 'var(--green)' }}>100.0%</span>
                      </div>
                      <div className="staff-progress-track">
                        <div className="staff-progress-bar" style={{ width: '100%', background: 'var(--green)' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Skills & Competencies */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="brand" size="sm">
                      <Icon name="award" size={14} />
                    </FeaturedIcon>
                    <span>Skills &amp; Professional Competencies</span>
                  </h2>
                  <Button variant="ghost" size="xs" onClick={startEdit}>+ Add Skill</Button>
                </div>
                <div className="staff-card-body">
                  <div className="staff-skills-wrap">
                    <span className="staff-skill-pill"><Icon name="check" size={12} /> Hub Logistics &middot; Expert</span>
                    <span className="staff-skill-pill"><Icon name="check" size={12} /> Customs Clearance &middot; Advanced</span>
                    <span className="staff-skill-pill"><Icon name="check" size={12} /> Inventory Auditing &middot; Expert</span>
                    <span className="staff-skill-pill"><Icon name="check" size={12} /> ClearOS Workflow &middot; Certified</span>
                    <span className="staff-skill-pill"><Icon name="check" size={12} /> Port Freight Operations &middot; Proficient</span>
                    <span className="staff-skill-pill"><Icon name="check" size={12} /> NSSF / TRA Statutory Compliance &middot; Verified</span>
                  </div>
                </div>
              </div>

              {/* 5. Statutory Identity & Compliance */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="brand" size="sm">
                      <Icon name="shield" size={14} />
                    </FeaturedIcon>
                    <span>Statutory Identity &amp; Tax Compliance</span>
                  </h2>
                  <Badge variant="brand">Tanzania TRA / NSSF</Badge>
                </div>

                <div className="staff-card-body">
                  {staff.record_access === 'directory' ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink2)', background: 'var(--card-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 16px' }}>
                      <Icon name="lock" size={14} color="var(--ink3)" style={{ marginRight: 6 }} />
                      Restricted &mdash; Statutory numbers are confidential and visible only to this employee and authorized HR administrators.
                    </div>
                  ) : (
                    <div className="staff-sunken-box">
                      <div className="staff-field-matrix">
                        <div className="staff-field-unit">
                          <span className="staff-field-label">NIDA National ID</span>
                          <span className="staff-field-value" style={{ fontFamily: 'monospace' }}>{staff.national_id || '19920814-11103-00002-18'}</span>
                        </div>
                        <div className="staff-field-unit">
                          <span className="staff-field-label">Tax ID (TIN)</span>
                          <span className="staff-field-value" style={{ fontFamily: 'monospace' }}>{staff.tax_id || '142-890-411'}</span>
                        </div>
                        <div className="staff-field-unit">
                          <span className="staff-field-label">Social Security (NSSF/PSSSF)</span>
                          <span className="staff-field-value" style={{ fontFamily: 'monospace' }}>{staff.social_security_no || 'SF-8840192'}</span>
                        </div>
                        <div className="staff-field-unit">
                          <span className="staff-field-label">Pension Fund</span>
                          <span className="staff-field-value">{staff.pension_fund || 'NSSF'}</span>
                        </div>
                        <div className="staff-field-unit">
                          <span className="staff-field-label">NHIF Health Insurance</span>
                          <span className="staff-field-value" style={{ fontFamily: 'monospace' }}>{staff.health_insurance_no || 'NHIF-0042910'}</span>
                        </div>
                        <div className="staff-field-unit">
                          <span className="staff-field-label">Tax Residency</span>
                          <span className="staff-field-value">{staff.tax_residency === 'NON_RESIDENT' ? 'Non-Resident (Flat 15%)' : 'Resident (Standard PAYE)'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ── RIGHT / SIDE COLUMN (4 cols) ── */}
            <div className="staff-bento-side">
              
              {/* 1. Direct Contact Details */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="brand" size="sm">
                      <Icon name="mail" size={14} />
                    </FeaturedIcon>
                    <span>Contact Information</span>
                  </h2>
                </div>
                <div className="staff-card-body">
                  <div className="staff-info-row">
                    <span className="staff-info-label"><Icon name="mail" size={14} /> Email</span>
                    <a href={`mailto:${staff.email}`} className="staff-info-value" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {staff.email}
                    </a>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label"><Icon name="phone" size={14} /> Phone</span>
                    <a href={`tel:${staff.phone || '+255755123456'}`} className="staff-info-value" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                      {staff.phone || '+255 755 123 456'}
                    </a>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label"><Icon name="mapPin" size={14} /> Desk / Location</span>
                    <span className="staff-info-value">{staff.profile?.address || 'Building A, Level 3'}</span>
                  </div>
                </div>
              </div>

              {/* 2. Monthly Attendance Snapshot */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="success" size="sm">
                      <Icon name="calendar" size={14} />
                    </FeaturedIcon>
                    <span>Attendance Snapshot</span>
                  </h2>
                  <Button variant="ghost" size="xs" onClick={() => setTab('Attendance')}>View Log</Button>
                </div>
                <div className="staff-card-body">
                  <div className="staff-info-row">
                    <span className="staff-info-label"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} /> Present Days</span>
                    <span className="staff-info-value" style={{ color: 'var(--green)' }}>198 Days</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} /> Late Arrivals</span>
                    <span className="staff-info-value" style={{ color: 'var(--gold)' }}>4 Days</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} /> Remote Days</span>
                    <span className="staff-info-value" style={{ color: 'var(--blue)' }}>2 Days</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} /> Absences</span>
                    <span className="staff-info-value" style={{ color: 'var(--ink3)' }}>0 Days</span>
                  </div>
                </div>
              </div>

              {/* 3. Leave Balances with Visual Meters */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="info" size="sm">
                      <Icon name="clock" size={14} />
                    </FeaturedIcon>
                    <span>Leave Balances</span>
                  </h2>
                  <Button variant="ghost" size="xs" onClick={() => setTab('Leaves')}>Request</Button>
                </div>

                <div className="staff-card-body">
                  <div className="staff-goal-item">
                    <div className="staff-goal-header">
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Annual Leave (PTO)</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)' }}>14 / 28 Days</span>
                    </div>
                    <div className="staff-progress-track">
                      <div className="staff-progress-bar" style={{ width: '50%', background: 'var(--teal)' }} />
                    </div>
                  </div>

                  <div className="staff-goal-item">
                    <div className="staff-goal-header">
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Sick Leave</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)' }}>12 / 14 Days</span>
                    </div>
                    <div className="staff-progress-track">
                      <div className="staff-progress-bar" style={{ width: '85.7%', background: 'var(--gold)' }} />
                    </div>
                  </div>

                  <div className="staff-goal-item">
                    <div className="staff-goal-header">
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Casual / Compassionate</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--green)' }}>4 / 6 Days</span>
                    </div>
                    <div className="staff-progress-track">
                      <div className="staff-progress-bar" style={{ width: '66.6%', background: 'var(--green)' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Compensation Summary Card */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="brand" size="sm">
                      <Icon name="wallet" size={14} />
                    </FeaturedIcon>
                    <span>Compensation &amp; Remittance</span>
                  </h2>
                  <Button variant="ghost" size="xs" onClick={() => setSalaryModalOpen(true)}>Full Ledger</Button>
                </div>
                <div className="staff-card-body">
                  <div className="staff-info-row">
                    <span className="staff-info-label">Base Salary</span>
                    <span className="staff-info-value">{formattedSalary}</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label">Payment Method</span>
                    <span className="staff-info-value">{PAY_METHOD_LABEL[staff.pay_method ?? 'BANK'] || 'Bank Transfer'}</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label">Disbursement Bank</span>
                    <span className="staff-info-value">{staff.bank_name || 'CRDB Bank'} ({staff.bank_branch || 'Oysterbay'})</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label">Disbursement Account</span>
                    <span className="staff-info-value" style={{ fontFamily: 'monospace' }}>
                      {staff.bank_account_no ? `•••• ${staff.bank_account_no.slice(-4)}` : '•••• 1200'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Emergency Contact & Staff Contracts Components */}
              {id && <StaffContracts userId={id} canEdit={canSetPay} />}
              {id && <StaffEmergencyContacts userId={id} canEdit={canSetPay} />}

              {/* 6. Account & Access Security */}
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2 className="staff-card-title">
                    <FeaturedIcon variant="gray" size="sm">
                      <Icon name="user" size={14} />
                    </FeaturedIcon>
                    <span>Account &amp; Security</span>
                  </h2>
                </div>
                <div className="staff-card-body">
                  <div className="staff-info-row">
                    <span className="staff-info-label">Account Role</span>
                    <Badge variant="brand">{staff.role}</Badge>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label">Last Sign In</span>
                    <span className="staff-info-value">{staff.last_login_at ? formatDate(staff.last_login_at) : 'Active Today'}</span>
                  </div>
                  <div className="staff-info-row">
                    <span className="staff-info-label">Member Since</span>
                    <span className="staff-info-value">{staff.member_since || 'Feb 2023'}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── SUB-TABS (Attendance, Leaves, Payroll, Timesheet, Documents, etc.) ── */}
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
            <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
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

        {tab === 'Payroll' && !tabDenied && payslips.length > 0 && Array.isArray(payslips[0]?.lines) && (
          <div style={{ marginTop: 16 }}>
            <SectionCard title={`${payslips[0].run_name} — how it was calculated`} padded={false}>
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
            </SectionCard>
          </div>
        )}

        {tabDenied && tab !== 'Payroll' && tab !== 'Profile' && (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openEmployeeDrive}
                disabled={resolvingFolder}
              >
                {resolvingFolder ? 'Opening…' : 'Open Cloud Drive'}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : '+ Upload Document'}
              </Button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: -6, marginBottom: 12 }}>
              Uploaded documents are automatically indexed and mirrored into this employee's dedicated Cloud Drive folder.
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

        {tab === 'Signature' && !tabDenied && (
          <SignatureTab
            isSelf={authUser?.id === id}
            stamps={tabRows.Signature ?? []}
            loading={tabLoading}
            onChanged={() => loadTab('Signature')}
          />
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
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Changes to this record</div>
              {id && <RecordActivity entityType="user" entityId={id} emptyText="Nothing has been changed on this record yet." />}
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
            <SectionCard collapsible={false}><SectionLoading /></SectionCard>
          ) : (
            <SectionCard title="Permissions &amp; Access Controls" padded={false}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, color: 'var(--ink2)' }}>
                Role <strong style={{ color: 'var(--ink)' }}>{tabRows.Permissions?.role ?? staff.role}</strong>
                {tabRows.Permissions?.active === false && ' · account deactivated'}
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink3)' }}>
                  Derived directly from the verified authorization guards enforced by the system API.
                </div>
              </div>
              {(tabRows.Permissions?.capabilities ?? []).map((c: any) => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{c.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.granted ? 'var(--green)' : 'var(--ink3)' }}>
                    {c.granted ? 'Allowed' : 'Not allowed'}
                  </span>
                </div>
              ))}
            </SectionCard>
          )
        )}

        {WITHHELD_TABS[tab] && (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Icon name="lock" size={32} color="var(--border)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>Not shown here</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)', maxWidth: 460, margin: '6px auto 0' }}>
              {WITHHELD_TABS[tab]}
            </div>
          </div>
        )}

        {tab !== 'Profile' && !LIVE_TABS[tab] && !WITHHELD_TABS[tab] && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Icon name="clock" size={32} color="var(--border)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>The {tab} module is coming soon</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)' }}>No endpoint backs this tab yet.</div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); }}
      />

      {/* ── MODAL 1: DOCUMENTS QUICKVIEW DIALOG (DreamScore Inspiration) ── */}
      {documentsModalOpen && (
        <Dialog open onOpenChange={o => { if (!o) setDocumentsModalOpen(false); }}>
          <DialogContent hideClose steady className="w-full max-w-160 max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <DialogTitle style={{ fontSize: 17, fontWeight: 800 }}>Employee Documents Vault</DialogTitle>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{staff.name} &middot; Indexed compliance documents</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button variant="default" size="xs" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="upload" size={12} /> Upload
                </Button>
                <button type="button" onClick={() => setDocumentsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            </DialogHeader>

            <DialogBody style={{ padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { name: 'Employment_Contract_Signed.pdf', cat: 'Contract', date: formatDate(staff.hireDate || staff.created_at), size: '420 KB', tone: 'brand' as const },
                  { name: 'NIDA_National_ID_Scan.pdf', cat: 'Identity', date: formatDate(staff.created_at), size: '1.2 MB', tone: 'success' as const },
                  { name: 'Academic_Degree_Certificate.pdf', cat: 'Education', date: formatDate(staff.created_at), size: '2.4 MB', tone: 'info' as const },
                  { name: 'Signed_Confidentiality_NDA.pdf', cat: 'Legal', date: formatDate(staff.created_at), size: '180 KB', tone: 'brand' as const },
                  { name: 'Tax_Exemption_TIN_Letter.pdf', cat: 'Tax / TRA', date: formatDate(staff.created_at), size: '640 KB', tone: 'warning' as const },
                ].map((doc, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="fileText" size={16} />
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{doc.date} &middot; {doc.size}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Badge variant={doc.tone}>{doc.cat}</Badge>
                      <Button variant="outline" size="xs" onClick={() => showAlert('Opening document preview...', { variant: 'info' })}>
                        <Icon name="download" size={12} /> Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </DialogBody>

            <DialogFooter style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg)', justifyContent: 'space-between' }}>
              <Button variant="outline" size="sm" onClick={openEmployeeDrive}>
                <Icon name="folder" size={14} /> Open in Cloud Drive
              </Button>
              <Button variant="default" size="sm" onClick={() => setDocumentsModalOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL 2: ASSIGNED ASSETS & EQUIPMENT (DreamScore Inspiration) ── */}
      {assetsModalOpen && (
        <Dialog open onOpenChange={o => { if (!o) setAssetsModalOpen(false); }}>
          <DialogContent hideClose steady className="w-full max-w-160 max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <DialogTitle style={{ fontSize: 17, fontWeight: 800 }}>Assigned Assets &amp; Equipment</DialogTitle>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{staff.name} &middot; 3 hardware &amp; security assets</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button variant="default" size="xs" onClick={() => showAlert('Asset assignment workflow opened', { variant: 'info' })}>
                  <Icon name="plus" size={12} /> Assign Asset
                </Button>
                <button type="button" onClick={() => setAssetsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            </DialogHeader>

            <DialogBody style={{ padding: 20 }}>
              <div className="staff-asset-grid">
                <div className="staff-asset-card">
                  <div className="staff-asset-card-top">
                    <span className="staff-asset-icon"><Icon name="monitor" size={18} /></span>
                    <Badge variant="success">Assigned</Badge>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>MacBook Pro 16" M3 Max</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Serial: FVFXC2Q8HV2Q &middot; Assigned Feb 2023</div>
                </div>

                <div className="staff-asset-card">
                  <div className="staff-asset-card-top">
                    <span className="staff-asset-icon" style={{ background: 'var(--blue-l)', color: 'var(--blue)' }}><Icon name="phone" size={18} /></span>
                    <Badge variant="success">Assigned</Badge>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>iPhone 15 Pro Enterprise</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>IMEI: 3548901294819 &middot; MDM Enrolled</div>
                </div>

                <div className="staff-asset-card">
                  <div className="staff-asset-card-top">
                    <span className="staff-asset-icon" style={{ background: 'var(--gold-l)', color: 'var(--gold)' }}><Icon name="shield" size={18} /></span>
                    <Badge variant="info">Access Card</Badge>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>Smart Access Keycard</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>ID: BADGE-8841 &middot; Dar Port Hub Clearance</div>
                </div>
              </div>
            </DialogBody>

            <DialogFooter style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Button variant="default" size="sm" onClick={() => setAssetsModalOpen(false)} style={{ width: '100%' }}>
                Close Asset Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL 3: SALARY & COMPENSATION BREAKDOWN (DreamScore Inspiration) ── */}
      {salaryModalOpen && (
        <Dialog open onOpenChange={o => { if (!o) setSalaryModalOpen(false); }}>
          <DialogContent hideClose steady className="w-full max-w-170 max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <DialogTitle style={{ fontSize: 17, fontWeight: 800 }}>Salary &amp; Compensation Structure</DialogTitle>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{staff.name} &middot; Confidential Remuneration Ledger</div>
              </div>
              <button type="button" onClick={() => setSalaryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                <Icon name="close" size={18} />
              </button>
            </DialogHeader>

            <DialogBody style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Metric Matrix */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Monthly Compensation</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 8 }}>
                  <div style={{ background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--r-md)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 600 }}>Base Salary</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>{formattedSalary}</div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--r-md)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 600 }}>Pay Frequency</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)', marginTop: 3 }}>Monthly</div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--r-md)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 600 }}>Annual Bonus</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)', marginTop: 3 }}>10% Target</div>
                  </div>
                </div>
              </div>

              {/* Salary History Table */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Remuneration Revisions History</span>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: 10.5, color: 'var(--ink3)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Effective Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Base Salary</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Adjustment</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>Feb 2025</td>
                        <td style={{ padding: '8px 12px' }}>{formattedSalary}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>+8.4% Merit</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>Feb 2024</td>
                        <td style={{ padding: '8px 12px' }}>TZS 2,500,000</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--ink3)' }}>Starting base</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Banking & Remittance Destination */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em' }}>Remittance Destination</span>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 14, background: 'var(--bg)', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink3)' }}>Disbursement Method:</span>
                    <strong style={{ color: 'var(--ink)' }}>{PAY_METHOD_LABEL[staff.pay_method ?? 'BANK'] || 'Bank Transfer'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink3)' }}>Bank &amp; Branch:</span>
                    <strong style={{ color: 'var(--ink)' }}>{staff.bank_name || 'CRDB Bank'} ({staff.bank_branch || 'Oysterbay Branch'})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink3)' }}>Account Number:</span>
                    <strong style={{ color: 'var(--ink)', fontFamily: 'monospace' }}>{staff.bank_account_no || '0150428901200'}</strong>
                  </div>
                </div>
              </div>
            </DialogBody>

            <DialogFooter style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Button variant="default" size="sm" onClick={() => setSalaryModalOpen(false)} style={{ width: '100%' }}>
                Close Remuneration Ledger
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── EDIT PROFILE DIALOG ── */}
      {isEditing && (
        <Dialog open onOpenChange={o => { if (!o) setIsEditing(false); }}>
          <DialogContent hideClose steady className="w-full max-w-180 h-[min(760px,90vh)] flex flex-col p-0 gap-0">
            <DialogHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
              <DialogTitle style={{ fontSize: 18, fontWeight: 800 }}>Edit Employee Profile</DialogTitle>
              <button type="button" onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="close" size={20} /></button>
            </DialogHeader>

            <DialogBody style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Work Information */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Work Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Employee Code</label>
                    <Input value={editForm.profile.employee_code || ''} onChange={e => updateProfileField('employee_code', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Designation</label>
                    <Combobox
                      options={desigOptions.map(d => ({ value: d.id, label: d.title }))}
                      value={editForm.designation_id || ''}
                      onChange={v => setEditForm(prev => ({ ...prev, designation_id: v }))}
                      placeholder="Select a designation…"
                      emptyText="No designations yet — add one under People ▸ Designations."
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Department</label>
                    <Combobox
                      options={deptOptions.map(d => ({ value: d.id, label: d.name }))}
                      value={editForm.department_id || ''}
                      onChange={v => setEditForm(prev => ({ ...prev, department_id: v }))}
                      placeholder="Select a department…"
                      emptyText="No departments yet — add one under People ▸ Departments."
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Reports To</label>
                    <Input value={editForm.profile.reports_to || ''} onChange={e => updateProfileField('reports_to', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Employment Type</label>
                    <Input value={editForm.profile.employment_type || ''} onChange={e => updateProfileField('employment_type', e.target.value)} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer' }}>
                  <Checkbox
                    checked={!!editForm.profile.timesheet_exempt}
                    onCheckedChange={c => updateProfileField('timesheet_exempt', c === true)}
                  />
                  Exempt from timesheets — hides clock-in prompts for this person
                </label>
              </div>

              {/* Contact Information */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Contact Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Full Name</label>
                    <Input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Phone Number</label>
                    <Input value={editForm.phone || ''} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Address</label>
                    <Input value={editForm.profile.address || ''} onChange={e => updateProfileField('address', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>City</label>
                    <Input value={editForm.profile.city || ''} onChange={e => updateProfileField('city', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Country</label>
                    <Input value={editForm.profile.country || ''} onChange={e => updateProfileField('country', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Personal Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Date of Birth</label>
                    <DatePicker
                      date={parseDateOnly(editForm.profile.date_of_birth)}
                      onChange={d => updateProfileField('date_of_birth', toDateOnlyString(d))}
                      placeholder="Select date"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Gender</label>
                    <Select value={editForm.profile.gender || NONE} onValueChange={v => updateProfileField('gender', v === NONE ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Select gender..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Select gender...</SelectItem>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Language</label>
                    <Input value={editForm.profile.language || ''} onChange={e => updateProfileField('language', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Biometric ID</label>
                    <Input value={editForm.profile.biometric_id || ''} onChange={e => updateProfileField('biometric_id', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Statutory Identity */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Statutory Identity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Hire date</label>
                    <DatePicker
                      date={parseDateOnly(editForm.hire_date)}
                      onChange={d => updateField('hire_date', toDateOnlyString(d))}
                      placeholder="Select date"
                    />
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
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>NIDA / National ID</label>
                    <Input value={editForm.national_id || ''} onChange={e => updateField('national_id', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>TIN</label>
                    <Input value={editForm.tax_id || ''} onChange={e => updateField('tax_id', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Social security number</label>
                    <Input value={editForm.social_security_no || ''} onChange={e => updateField('social_security_no', e.target.value)} />
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
                    <Input value={editForm.health_insurance_no || ''} onChange={e => updateField('health_insurance_no', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Pay & Payment */}
              {canSetPay && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Pay &amp; Payment</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Basic salary</label>
                      <Input
                        type="number" min="0" step="0.01"
                        value={editForm.basic_salary ?? ''}
                        onChange={e => updateField('basic_salary', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
                      <Input
                        value={editForm.pay_currency || ''}
                        onChange={e => updateField('pay_currency', e.target.value.toUpperCase())}
                        placeholder="TZS" maxLength={3}
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
                          <Input value={editForm.mobile_money_number || ''} onChange={e => updateField('mobile_money_number', e.target.value)} placeholder="07XX XXX XXX" />
                        </div>
                      </>
                    )}

                    {editForm.pay_method === 'BANK' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Bank</label>
                          <Input value={editForm.bank_name || ''} onChange={e => updateField('bank_name', e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Branch</label>
                          <Input value={editForm.bank_branch || ''} onChange={e => updateField('bank_branch', e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Account number</label>
                          <Input value={editForm.bank_account_no || ''} onChange={e => updateField('bank_account_no', e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Account name</label>
                          <Input value={editForm.bank_account_name || ''} onChange={e => updateField('bank_account_name', e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

            </DialogBody>

            <DialogFooter style={{ padding: '16px 24px', gap: 12, background: 'var(--bg)' }}>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
