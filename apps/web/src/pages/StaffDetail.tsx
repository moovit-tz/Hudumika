import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { EMPLOYEES } from '../data/staffData.js';
import type { EmpStatus } from '../data/staffData.js';
import type { UserProfileFields } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';

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
  avatar_url?: string | null;
  profile?: UserProfileFields;
  // Computed fallbacks for UI
  employee_code?: string;
  dept?: string;
  designation?: string;
  reports_to?: string;
  employment_type?: string;
  member_since?: string;
}

const AVATAR_COLORS = ['#e8461a','#0891b2','#7c3aed','#059669','#d97706','#9333ea'];
function avatarBg(n: string) { return AVATAR_COLORS[[...(n ?? '?')].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]; }
function initials(n: string) { return n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

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

export const StaffDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

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
    } catch { /* fall through */ }
    
    // Fallback for mock data (e1, e2, etc)
    const mock = EMPLOYEES.find(e => e.id === id);
    if (mock) {
      setStaff({
        id: mock.id, name: mock.name, email: mock.email, phone: mock.phone,
        role: mock.role, active: mock.status !== 'INACTIVE',
        status: mock.status, created_at: mock.hireDate,
        last_login_at: null, hireDate: mock.hireDate,
        dept: mock.dept, designation: mock.designation,
        employee_code: `EMP-00${mock.id.replace('e', '')}`,
        reports_to: 'Ariana Cole',
        employment_type: 'Not set',
        member_since: formatDate(mock.hireDate),
        profile: {}
      });
    }

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
      }
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

      const updated = await apiFetch(`/v1/hr/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          profile: editForm.profile
        })
      });
      
      setStaff(prev => {
        if (!prev) return prev;
        const newProfile = { ...prev.profile, ...editForm.profile };
        return {
          ...prev,
          name: updated.name || prev.name,
          phone: updated.phone || prev.phone,
          profile: newProfile,
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top Header Section */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
        
        {/* Profile Info Row */}
        <div style={{ padding: '24px 32px 16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {staff.avatar_url ? (
              <img src={staff.avatar_url} alt={staff.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
                {initialsText}
              </div>
            )}
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

              <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}>Quick actions</div>
                <div>
                  <ActionLink label="Add payroll" />
                  <ActionLink label="Upload document" />
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

        {tab !== 'Profile' && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <Icon name="clock" size={32} color="var(--border)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>The {tab} module is coming soon</div>
          </div>
        )}
      </div>

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
