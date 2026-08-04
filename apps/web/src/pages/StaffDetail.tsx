import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { EMPLOYEES } from '../data/staffData.js';
import type { EmpStatus } from '../data/staffData.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';

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
  dept?: string;
  designation?: string;
  avatar_url?: string | null;
  stats?: { approved_leaves: number; present_days: number };
  recent_leaves?: Array<{ id: string; type: string; from_date: string; to_date: string; status: string; reason: string | null }>;
}

const AVATAR_COLORS = ['#e8461a','#0891b2','#7c3aed','#059669','#d97706','#9333ea'];
function avatarBg(n: string) { return AVATAR_COLORS[[...n].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]; }
function initials(n: string) { return n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:   { bg: 'rgba(16,185,129,.12)',  color: 'var(--green)', label: 'Active'   },
  INACTIVE: { bg: 'rgba(148,163,184,.12)', color: 'var(--ink3)',  label: 'Inactive' },
  ON_LEAVE: { bg: 'rgba(245,158,11,.12)',  color: '#f59e0b',      label: 'On Leave' },
};

const LEAVE_BADGE: Record<string, { bg: string; color: string }> = {
  APPROVED:  { bg: 'rgba(16,185,129,.12)',  color: 'var(--green)' },
  PENDING:   { bg: '#fffbeb',               color: '#f59e0b'      },
  REJECTED:  { bg: 'rgba(239,68,68,.12)',   color: 'var(--red)'   },
  CANCELLED: { bg: 'var(--bg)',             color: 'var(--ink3)'  },
};

const ROLES = ['OFFICER', 'SENIOR', 'JUNIOR', 'MANAGER', 'ADMIN', 'FINANCE', 'SALES', 'TENANT_ADMIN'];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
      <div style={{ fontSize: 10, color: 'var(--ink3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', background: 'var(--white)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7,
  fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--white)',
  boxSizing: 'border-box',
};
const valueSt: React.CSSProperties = { fontSize: 13, color: 'var(--ink)', fontWeight: 500 };

export const StaffDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: authUser, updateUser } = useAuth();

  const [staff, setStaff]           = useState<StaffData | null>(null);
  const [loading, setLoading]        = useState(true);
  const [tab, setTab]                = useState<'personal' | 'hr' | 'leaves' | 'roles'>('personal');
  const [editing, setEditing]        = useState(false);
  const [editName, setEditName]      = useState('');
  const [editPhone, setEditPhone]    = useState('');
  const [saving, setSaving]          = useState(false);
  const [saveErr, setSaveErr]        = useState('');
  const [newRole, setNewRole]        = useState('');
  const [savingRole, setSavingRole]  = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [resetSent, setResetSent]    = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch(`/v1/hr/staff/${id}`);
      if (data?.id) {
        const mock = EMPLOYEES.find(e => e.email === data.email);
        setStaff({
          ...data,
          dept:        mock?.dept        ?? data.dept        ?? '',
          designation: mock?.designation ?? data.designation ?? '',
        });
        setNewRole(data.role);
        return;
      }
    } catch { /* fall through to mock */ }

    const mock = EMPLOYEES.find(e => e.id === id);
    if (mock) {
      setStaff({
        id: mock.id, name: mock.name, email: mock.email, phone: mock.phone,
        role: mock.role, active: mock.status !== 'INACTIVE',
        status: mock.status as EmpStatus, created_at: mock.hireDate,
        last_login_at: null, hireDate: mock.hireDate,
        dept: mock.dept, designation: mock.designation,
        stats: { approved_leaves: 0, present_days: 0 },
        recent_leaves: [],
      });
      setNewRole(mock.role);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const startEdit = () => {
    if (!staff) return;
    setEditName(staff.name);
    setEditPhone(staff.phone ?? '');
    setSaveErr('');
    setEditing(true);
  };

  const savePersonal = async () => {
    if (!staff) return;
    setSaving(true);
    setSaveErr('');
    try {
      const updated = await apiFetch(`/v1/hr/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, phone: editPhone }),
      });
      setStaff(prev => prev ? { ...prev, name: updated.name ?? editName, phone: updated.phone ?? editPhone } : prev);
      setEditing(false);
    } catch {
      setSaveErr('Failed to save — try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async () => {
    if (!staff || newRole === staff.role) return;
    setSavingRole(true);
    try {
      const updated = await apiFetch(`/v1/hr/staff/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setStaff(prev => prev ? { ...prev, role: updated.role ?? newRole } : prev);
    } catch {
      setNewRole(staff.role);
    } finally {
      setSavingRole(false);
    }
  };

  const toggleStatus = async () => {
    if (!staff) return;
    const newActive = !staff.active;
    setSavingStatus(true);
    try {
      const updated = await apiFetch(`/v1/hr/staff/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: newActive }),
      });
      const resolvedActive = updated.active ?? newActive;
      setStaff(prev => prev ? { ...prev, active: resolvedActive, status: resolvedActive ? 'ACTIVE' : 'INACTIVE' } : prev);
    } catch { /* ignore */ }
    finally { setSavingStatus(false); }
  };

  const sendResetLink = async () => {
    if (!staff) return;
    setSendingReset(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: staff.email }) });
      setResetSent(true);
    } catch { /* ignore */ }
    finally { setSendingReset(false); }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showAlert('Photo must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setUploadingAvatar(true);
      try {
        const endpoint = id === 'me'
          ? '/v1/hr/profile/avatar'
          : `/v1/hr/staff/${id}/avatar`;
        await apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify({ avatar_url: dataUrl }) });
        setStaff(prev => prev ? { ...prev, avatar_url: dataUrl } : prev);
        if (id === 'me' || id === authUser?.id) updateUser({ avatar_url: dataUrl });
      } catch { /* ignore */ }
      finally { setUploadingAvatar(false); }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink3)', fontSize: 13 }}>
        <Icon name="activity" size={16} /> Loading staff profile…
      </div>
    );
  }

  if (!staff) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--ink)', marginBottom: 12 }}>Staff member not found</h2>
        <Link to="/nexushr/employees" className="btn btn-secondary">Back to HR</Link>
      </div>
    );
  }

  const ss = STATUS_STYLE[staff.status] ?? STATUS_STYLE.ACTIVE;

  const TABS = [
    { key: 'personal', icon: 'user',      label: 'Personal Info'    },
    { key: 'hr',       icon: 'briefcase', label: 'HR Details'       },
    { key: 'leaves',   icon: 'calendar',  label: 'Leave History'    },
    { key: 'roles',    icon: 'shield',    label: 'Roles & Access'   },
  ] as const;

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button type="button" onClick={() => navigate(-1)} title="Go back"
          style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Icon name="arrowLeft" size={16} color="var(--ink2)" />
        </button>
        <div>
          <PageHeader
            crumbs={['NexusHR', 'Staff']}
            titlePlain="Staff"
            titleEm="profile"
          />
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>Manage {staff.name.split(' ')[0]}'s account and details</p>
        </div>
        <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ss.bg, color: ss.color }}>{ss.label}</span>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 260, flexShrink: 0, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Avatar block */}
          <div style={{ padding: '24px 20px 18px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
            <input ref={avatarInputRef} type="file" accept="image/*" title="Upload profile photo" aria-label="Upload profile photo" style={{ display: 'none' }} onChange={handleAvatarFile} />
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, position: 'relative' }}>
              {staff.avatar_url ? (
                <img src={staff.avatar_url} alt={staff.name}
                  style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: avatarBg(staff.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>
                  {initials(staff.name)}
                </div>
              )}
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
                title="Change photo"
                style={{ position: 'absolute', bottom: 0, right: 'calc(50% - 44px)', width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--teal)', border: '2px solid var(--white)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="upload" size={11} color="#fff" />
              </button>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{staff.name}</div>
            <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginBottom: 4 }}>{staff.designation || staff.role}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 10 }}>{staff.dept || 'General'}</div>
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ss.bg, color: ss.color }}>{ss.label}</span>
          </div>

          {/* Stats */}
          {staff.stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '12px 8px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)' }}>{staff.stats.present_days}</div>
                <div style={{ fontSize: 9, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Days Present</div>
              </div>
              <div style={{ padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{staff.stats.approved_leaves}</div>
                <div style={{ fontSize: 9, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Leave Days</div>
              </div>
            </div>
          )}

          {/* Tab nav */}
          <div style={{ padding: '8px' }}>
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: tab === t.key ? 'var(--bg)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', color: tab === t.key ? 'var(--teal)' : 'var(--ink2)', fontWeight: tab === t.key ? 600 : 400, fontFamily: 'var(--font)', fontSize: 12.5, marginBottom: 1 }}>
                <Icon name={t.icon} size={14} color={tab === t.key ? 'var(--teal)' : 'var(--ink3)'} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main Pane ── */}
        <div style={{ flex: 1, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden', minHeight: 400 }}>

          {/* ── Personal Tab ── */}
          {tab === 'personal' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 3px' }}>Personal Information</h3>
                  <p style={{ fontSize: 12, color: 'var(--ink3)', margin: 0 }}>Name, phone, and contact details</p>
                </div>
                {!editing ? (
                  <button type="button" className="btn btn-secondary" onClick={startEdit} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} style={{ fontSize: 12 }}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={savePersonal} disabled={saving}
                      style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Icon name="save" size={13} />
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>

              {saveErr && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,.08)', borderRadius: 7, fontSize: 12, color: 'var(--red)', border: '1px solid rgba(239,68,68,.2)' }}>{saveErr}</div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <FieldRow label="Full Name">
                  {editing
                    ? <input value={editName} onChange={e => setEditName(e.target.value)} style={inputSt} />
                    : <span style={valueSt}>{staff.name}</span>}
                </FieldRow>
                <FieldRow label="Email Address">
                  <span style={{ ...valueSt, color: 'var(--ink2)' }}>{staff.email}</span>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>Contact admin to change email</div>
                </FieldRow>
                <FieldRow label="Phone Number">
                  {editing
                    ? <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+255 700 000 000" style={inputSt} />
                    : <span style={valueSt}>{staff.phone || '—'}</span>}
                </FieldRow>
                <FieldRow label="Joined">
                  <span style={valueSt}>{formatDate(staff.hireDate || staff.created_at)}</span>
                </FieldRow>
                {staff.last_login_at && (
                  <FieldRow label="Last Login">
                    <span style={valueSt}>
                      {new Date(staff.last_login_at).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </FieldRow>
                )}
              </div>
            </div>
          )}

          {/* ── HR Details Tab ── */}
          {tab === 'hr' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 3px' }}>HR & Employment Details</h3>
                <p style={{ fontSize: 12, color: 'var(--ink3)', margin: 0 }}>Role, department, and work statistics</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                <FieldRow label="System Role">
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>{staff.role}</span>
                </FieldRow>
                <FieldRow label="Account Status">
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ss.bg, color: ss.color }}>{ss.label}</span>
                </FieldRow>
                <FieldRow label="Department">
                  <span style={valueSt}>{staff.dept || '—'}</span>
                </FieldRow>
                <FieldRow label="Designation">
                  <span style={valueSt}>{staff.designation || '—'}</span>
                </FieldRow>
                <FieldRow label="Joined">
                  <span style={valueSt}>{formatDate(staff.hireDate || staff.created_at)}</span>
                </FieldRow>
                {staff.last_login_at && (
                  <FieldRow label="Last Login">
                    <span style={valueSt}>
                      {new Date(staff.last_login_at).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </FieldRow>
                )}
              </div>

              {staff.stats && (
                <div style={{ background: 'var(--bg)', borderRadius: 9, padding: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Performance Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                    <StatBox value={staff.stats.present_days}    label="Present Days"   color="var(--teal)"  />
                    <StatBox value={staff.stats.approved_leaves} label="Leave Days Used" color="#f59e0b"      />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Leave History Tab ── */}
          {tab === 'leaves' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 3px' }}>Leave History</h3>
                <p style={{ fontSize: 12, color: 'var(--ink3)', margin: 0 }}>Recent leave requests for this staff member</p>
              </div>

              {(!staff.recent_leaves || staff.recent_leaves.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink3)', fontSize: 13 }}>
                  No leave records found
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {staff.recent_leaves.map(l => {
                    const lb = LEAVE_BADGE[l.status] ?? LEAVE_BADGE.CANCELLED;
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <Icon name="calendar" size={16} color="var(--ink3)" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{l.type}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                            {formatDate(l.from_date)} → {formatDate(l.to_date)}
                          </div>
                          {l.reason && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, fontStyle: 'italic' }}>"{l.reason}"</div>}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: lb.bg, color: lb.color, whiteSpace: 'nowrap' }}>{l.status}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Roles & Access Tab ── */}
          {tab === 'roles' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 3px' }}>Roles & Access</h3>
                <p style={{ fontSize: 12, color: 'var(--ink3)', margin: 0 }}>System access level and account security</p>
              </div>

              {/* Change Role */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: 20, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>System Role</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger style={{ flex: 1 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button type="button" className="btn btn-primary" onClick={changeRole} disabled={savingRole || newRole === staff.role}
                    style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                    {savingRole ? 'Applying…' : 'Apply Role'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                  Current: <strong>{staff.role}</strong> — determines which modules and actions this user can access
                </div>
              </div>

              {/* Suspend / Activate */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 20, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: staff.active ? 'var(--red)' : 'var(--green)', marginBottom: 3 }}>
                    {staff.active ? 'Suspend Account' : 'Activate Account'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {staff.active ? 'Temporarily revoke all system access for this user.' : 'Restore system access for this user.'}
                  </div>
                </div>
                <button type="button" onClick={toggleStatus} disabled={savingStatus}
                  className={staff.active ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={staff.active
                    ? { background: 'var(--red)', borderColor: 'var(--red)', fontSize: 12, whiteSpace: 'nowrap' }
                    : { color: 'var(--green)', borderColor: 'var(--green)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {savingStatus ? 'Updating…' : staff.active ? 'Suspend' : 'Activate'}
                </button>
              </div>

              {/* Reset Password */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>Reset Password</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Send a password reset link to {staff.email}</div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={sendResetLink} disabled={sendingReset} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {sendingReset ? 'Sending…' : resetSent ? 'Sent ✓' : 'Send Reset Link'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
