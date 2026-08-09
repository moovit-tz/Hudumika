import React, { useState, useRef } from 'react';
import { forgetAvatar } from '../lib/identity.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow } from '../components/MetricCard.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { SkeletonPage } from '../components/ui/skeleton.js';

/* ── Avatar ── */
const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30'];
function avColor(name: string) { return AV_COLORS[((name ?? '?').charCodeAt(0)) % AV_COLORS.length]; }
function initials(name: string) { return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

/* ── Role label ── */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrator', ADMIN: 'Company Administrator', TENANT_ADMIN: 'Company Administrator',
  MANAGER: 'Operations Manager', FINANCE: 'Finance Officer',
  SALES: 'Sales Officer', SENIOR: 'Senior Clearing Officer', JUNIOR: 'Junior Clearing Officer',
  OFFICER: 'Clearing Officer', CUSTOMER: 'Customer',
};

/* ── Tab config ── */
interface Tab { key: string; label: string; icon: IconName }
const TABS: Tab[] = [
  { key: 'personal',      label: 'Personal Info',      icon: 'user'      },
  { key: 'security',      label: 'Security',            icon: 'lock'      },
  { key: 'notifications', label: 'Notifications',       icon: 'bell'      },
  { key: 'activity',      label: 'Account Activity',    icon: 'activity'  },
];

/* ── Toggle switch ── */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{ width: 42, height: 24, borderRadius: 'var(--r)', background: on ? 'var(--teal)' : 'var(--border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: 'var(--white)', transition: 'left 0.2s', boxShadow: 'var(--elev-sm)' }} />
    </button>
  );
}

/* ── Section card ── */
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

/* ── Form field ── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const INPUT = { width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)', boxSizing: 'border-box' as const, outline: 'none' };
const INPUT_DISABLED = { ...INPUT, background: 'var(--bg)', color: 'var(--ink3)', cursor: 'not-allowed' };

/* ── Activity log row ── */
const ACTIVITY_LOG = [
  { action: 'Logged in',           ip: '41.33.21.5',   device: 'Chrome · Windows',  time: '2 hours ago',  ok: true  },
  { action: 'Changed password',     ip: '41.33.21.5',   device: 'Chrome · Windows',  time: '3 days ago',   ok: true  },
  { action: 'Failed login attempt', ip: '185.22.41.100',device: 'Unknown · Linux',   time: '5 days ago',   ok: false },
  { action: 'Logged in',           ip: '41.33.21.5',   device: 'Safari · iPhone',   time: '1 week ago',   ok: true  },
  { action: 'Profile updated',      ip: '41.33.21.5',   device: 'Chrome · Windows',  time: '2 weeks ago',  ok: true  },
  { action: 'Logged in',           ip: '41.33.21.5',   device: 'Chrome · Windows',  time: '3 weeks ago',  ok: true  },
];

/* ══════════════════════════════════════════
   Main Component
══════════════════════════════════════════ */
export const UserProfile: React.FC = () => {
  usePageSEO('My Profile', 'Manage your account settings and preferences.');
  const { user, logout, updateUser } = useAuth();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') || 'personal';

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  /* Personal info form */
  const buildInitialForm = () => ({
    name:       user?.name || '',
    phone:      user?.phone || '',
    avatar_url: user?.avatar_url || '',
    cover_url:  user?.profile?.cover_url || '',
    bio:        user?.profile?.bio || '',
    job_title:  user?.profile?.job_title || ROLE_LABELS[user?.role || ''] || '',
    employee_code: user?.profile?.employee_code || '',
    department: user?.profile?.department || '',
    reports_to: user?.profile?.reports_to || '',
    city:       user?.profile?.city || '',
    country:    user?.profile?.country || 'Tanzania',
    timezone:   user?.profile?.timezone || 'Africa/Dar_es_Salaam',
    language:   user?.profile?.language || 'en',
    website:    user?.profile?.website || '',
  });
  const [form, setForm] = useState(buildInitialForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Security form */
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [twoFa, setTwoFa]   = useState(true);
  const [activityLogs, setActivityLogs] = useState(true);

  /* Notifications */
  const [notif, setNotif] = useState({
    email_shipment: true, email_invoice: true, email_document: false,
    email_reminder: true, email_news: false,
    wa_shipment: true, wa_urgent: true, wa_payment: true,
    app_all: true,
  });

  const setTab = (t: string) => setParams({ tab: t });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch('/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          avatar_url: form.avatar_url || null,
          profile: {
            bio: form.bio, job_title: form.job_title, city: form.city,
            country: form.country, timezone: form.timezone, language: form.language, website: form.website,
            cover_url: form.cover_url || null,
          },
        }),
      });
      if (res?.user) updateUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save changes.');
    } finally { setSaving(false); }
  };

  const persistImagePatch = async (avatarUrl?: string | null, coverUrl?: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, any> = {};
      if (avatarUrl !== undefined) payload.avatar_url = avatarUrl;
      if (coverUrl !== undefined) payload.profile = { cover_url: coverUrl };

      const res = await apiFetch('/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res?.user) updateUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save image.');
    } finally { setSaving(false); }
  };

  /**
   * Centre-cropped square, downscaled, as a JPEG data URI.
   *
   * `avatar_url` is a text column holding the image itself, so whatever is
   * uploaded is what every payload carrying this user hauls around — and this
   * accepted the raw file up to 5MB. The one seeded avatar in this database is
   * 560KB of base64, for a picture usually drawn at 32px. 256px of JPEG is
   * ~20KB and indistinguishable at the sizes these render.
   */
  const AVATAR_EDGE = 256;
  const toSquareDataUrl = async (file: File): Promise<string> => {
    const bitmap = await createImageBitmap(file);
    const edge = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_EDGE;
    canvas.height = AVATAR_EDGE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image in this browser.');
    ctx.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
    bitmap.close?.();
    // JPEG, not PNG — a photo as PNG is several times larger for no visible gain.
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showAlert('That file is not an image.'); return; }
    try {
      const dataUrl = await toSquareDataUrl(file);
      setForm(p => ({ ...p, avatar_url: dataUrl }));
      await persistImagePatch(dataUrl, undefined);
      // Tell every mounted avatar to re-fetch. The module cache in
      // lib/identity.ts is what lets one picture serve every app without a
      // request per render — and it was also pinning the old picture
      // everywhere until a full page reload.
      if (user?.id) forgetAvatar(user.id);
    } catch (err: any) {
      showAlert(err?.message || 'That picture could not be processed.');
    } finally {
      e.target.value = '';
    }
  };

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showAlert('Cover image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setForm(p => ({ ...p, cover_url: dataUrl }));
      persistImagePatch(undefined, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handlePwSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { showAlert('New passwords do not match.'); return; }
    if (pwForm.next.length < 8) { showAlert('Password must be at least 8 characters.'); return; }
    setPwSaving(true);
    try {
      await apiFetch('/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }) });
      setPwForm({ current: '', next: '', confirm: '' });
      showAlert('Password changed successfully.');
    } catch (err: any) { showAlert(err.message || 'Failed to change password.'); } finally { setPwSaving(false); }
  };

  if (!user) return <SkeletonPage variant="detail" />;

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font)', padding: isMobile ? '16px' : '32px' }}>
      <style>{`
        .profile-container {
          max-width: 1600px;
          margin: 0 auto;
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,0.03);
          transition: max-width 0.25s ease;
        }
        [data-layout="full"] .profile-container {
          max-width: 100%;
        }
      `}</style>
      <div className="profile-container">
        {/* ── Profile header card ── */}
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {/* Cover banner */}
        <div style={{
          height: 150,
          background: form.cover_url ? `url("${form.cover_url}") center/cover no-repeat` : 'linear-gradient(135deg, var(--navy) 0%, var(--teal) 100%)',
          position: 'relative',
          transition: 'background 0.3s ease',
        }}>
          <div style={{ position: 'absolute', top: 12, right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            {form.cover_url && (
              <button
                type="button"
                onClick={() => {
                  setForm(p => ({ ...p, cover_url: '' }));
                  persistImagePatch(undefined, null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25, backdropFilter: 'blur(4px)' }}
              >
                <Icon name="trash" size={12} strokeWidth={2} />
                Remove Cover
              </button>
            )}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-sm) 14px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25, backdropFilter: 'blur(4px)' }}
            >
              <Icon name="camera" size={13} strokeWidth={2} />
              {form.cover_url ? 'Change Cover' : 'Upload Cover'}
            </button>
          </div>
          <input
            type="file"
            ref={coverInputRef}
            onChange={handleCoverFile}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>

        <div style={{ padding: '0 28px 20px', position: 'relative' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -42 }}>
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => avatarInputRef.current?.click()} title="Click to change profile picture">
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: avColor(user.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, border: '4px solid #fff', boxShadow: 'var(--elev)', overflow: 'hidden' }}>
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt={form.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  initials(form.name || user.name)
                )}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); avatarInputRef.current?.click(); }}
                title="Upload profile picture"
                style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: '50%', background: 'var(--teal)', border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}
              >
                <Icon name="camera" size={12} strokeWidth={2.5} style={{ color: '#fff' } as React.CSSProperties} />
              </button>
              {form.avatar_url && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setForm(p => ({ ...p, avatar_url: '' }));
                    persistImagePatch(null, undefined);
                  }}
                  title="Remove profile picture"
                  style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}
                >
                  <Icon name="x" size={11} strokeWidth={3} style={{ color: '#fff' } as React.CSSProperties} />
                </button>
              )}
            </div>
            <input
              type="file"
              ref={avatarInputRef}
              onChange={handleAvatarFile}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
              <Link to="/subscription" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: '1.5px solid var(--border)', borderRadius: 9, background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink)', textDecoration: 'none' }}>
                <Icon name="creditCard" size={13} strokeWidth={2} />
                Subscription
              </Link>
              <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--red)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="externalLink" size={13} strokeWidth={2} />
                Sign Out
              </button>
            </div>
          </div>

          {/* Name / meta */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>{user.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{user.email}</span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ink3)' }} />
              <span style={{ padding: '2px 10px', borderRadius: 20, background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 11.5, fontWeight: 700 }}>{ROLE_LABELS[user.role] || user.role}</span>
              {user.active && <span style={{ padding: '2px 10px', borderRadius: 20, background: 'var(--green-l)', color: 'var(--green)', fontSize: 11.5, fontWeight: 700 }}>● Active</span>}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', padding: '0 28px', borderTop: '1px solid var(--border)', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: activeTab === t.key ? 'var(--teal)' : 'var(--ink3)', borderBottom: activeTab === t.key ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name={t.icon} size={14} strokeWidth={activeTab === t.key ? 2.3 : 1.8} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Activity metrics ── */}
      <div style={{ padding: '0 28px 20px' }}>
        <MetricsRow cards={[
          {
            title: 'Cases Handled',
            value: '—',
            sub1Label: 'THIS MONTH', sub1Value: '—',
            sub2Label: 'THIS WEEK', sub2Value: '—', barHighlight: 'var(--blue)',
          },
          {
            title: 'Login Streak',
            value: '6d',
            sub1Label: 'LAST LOGIN', sub1Value: '2h ago',
            sub2Label: 'SESSIONS', sub2Value: String(ACTIVITY_LOG.filter(l => l.action === 'Logged in').length), barHighlight: 'var(--green)',
          },
          {
            title: 'Security Score',
            value: twoFa ? '94%' : '68%',
            trend: twoFa ? 4.1 : -8.3,
            invertTrend: !twoFa,
            sub1Label: '2FA', sub1Value: twoFa ? 'Enabled' : 'Disabled',
            sub2Label: 'FAILED LOGINS', sub2Value: String(ACTIVITY_LOG.filter(l => !l.ok).length), barHighlight: twoFa ? 'var(--green)' : 'var(--red)',
          },
        ]} />
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: '0 28px 32px' }}>

        {/* ══ PERSONAL INFO ══ */}
        {activeTab === 'personal' && (
          <form onSubmit={handleSave}>
            <Card title="Basic Information" subtitle="Update your personal details and public profile.">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 20px' }}>
                <Field label="Full Name">
                  <input style={INPUT} value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
                </Field>
                <Field label="Email Address" hint="Contact support to change your email address.">
                  <input style={INPUT_DISABLED} value={user.email} disabled />
                </Field>
                <Field label="Phone Number">
                  <input style={INPUT} value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+255712345678" />
                </Field>
                <Field label="Website">
                  <input style={INPUT} value={form.website} onChange={e => setForm(p => ({...p, website: e.target.value}))} placeholder="https://..." />
                </Field>
                <Field label="User Role" hint="Role is managed by your administrator.">
                  <input style={INPUT_DISABLED} value={ROLE_LABELS[user.role] || user.role} disabled />
                </Field>
              </div>
              <Field label="Bio">
                <textarea value={form.bio} onChange={e => setForm(p => ({...p, bio: e.target.value}))} rows={3} placeholder="Brief description about yourself…" style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }} />
              </Field>
            </Card>

            <Card title="Employment Details (NexusHR)" subtitle="Managed by NexusHR. Please ask your manager to request an update from the Admin.">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 20px' }}>
                <Field label="Employee ID">
                  <input style={INPUT_DISABLED} value={form.employee_code || '—'} disabled />
                </Field>
                <Field label="Job Title">
                  <input style={INPUT_DISABLED} value={form.job_title || '—'} disabled />
                </Field>
                <Field label="Department">
                  <input style={INPUT_DISABLED} value={form.department || '—'} disabled />
                </Field>
                <Field label="Reports To (Manager)">
                  <input style={INPUT_DISABLED} value={form.reports_to || '—'} disabled />
                </Field>
              </div>
            </Card>

            <Card title="Address & Region" subtitle="Your location is used for timezone and reporting.">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 20px' }}>
                <Field label="Country">
                  <Select value={form.country} onValueChange={v => setForm(p => ({...p, country: v}))}>
                    <SelectTrigger aria-label="Country" style={INPUT}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Tanzania','Kenya','Uganda','Rwanda','Burundi','Zambia','Malawi','Mozambique','Ethiopia','Other'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="City / Town">
                  <input style={INPUT} value={form.city} onChange={e => setForm(p => ({...p, city: e.target.value}))} />
                </Field>
                <Field label="Timezone">
                  <Select value={form.timezone} onValueChange={v => setForm(p => ({...p, timezone: v}))}>
                    <SelectTrigger aria-label="Timezone" style={INPUT}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Africa/Dar_es_Salaam','Africa/Nairobi','Africa/Kampala','Africa/Kigali','UTC'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Language">
                  <Select value={form.language} onValueChange={v => setForm(p => ({...p, language: v}))}>
                    <SelectTrigger aria-label="Language" style={INPUT}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="sw">Swahili</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Card>

            {saveError && <p style={{ fontSize: 12.5, color: 'var(--red)', textAlign: 'right', marginBottom: 8 }}>{saveError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setForm(buildInitialForm())} style={{ padding: 'var(--ds-btn-py) 20px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                Discard
              </button>
              <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 22px', border: 'none', borderRadius: 'var(--r)', background: saved ? 'var(--green)' : 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                {saved ? <><Icon name="check" size={14} strokeWidth={2.5} /> Saved!</> : saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {/* ══ SECURITY ══ */}
        {activeTab === 'security' && (
          <>
            <Card title="Change Password" subtitle="Use a strong password with letters, numbers and symbols.">
              <form onSubmit={handlePwSave}>
                <Field label="Current Password">
                  <input type="password" style={INPUT} value={pwForm.current} onChange={e => setPwForm(p => ({...p, current: e.target.value}))} placeholder="Your current password" required />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 20px' }}>
                  <Field label="New Password" hint="At least 8 characters.">
                    <input type="password" style={INPUT} value={pwForm.next} onChange={e => setPwForm(p => ({...p, next: e.target.value}))} placeholder="New password" required />
                  </Field>
                  <Field label="Confirm New Password">
                    <input type="password" style={INPUT} value={pwForm.confirm} onChange={e => setPwForm(p => ({...p, confirm: e.target.value}))} placeholder="Repeat new password" required />
                  </Field>
                </div>
                {pwForm.next && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Strength</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[8,12,16].map((min, i) => (
                        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: pwForm.next.length >= min ? (min===16?'var(--green)':min===12?'var(--gold)':'var(--red)') : 'var(--border)' }} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" onClick={() => setPwForm({current:'',next:'',confirm:''})} style={{ padding: 'var(--ds-btn-py) 20px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
                  <button type="submit" disabled={pwSaving} style={{ padding: 'var(--ds-btn-py) 22px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    {pwSaving ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </form>
            </Card>

            <Card title="Two-Factor Authentication" subtitle="Add an extra layer of security to your account.">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>Authenticator App</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Use an authenticator app (Google, Authy) to generate codes.</div>
                </div>
                <Toggle on={twoFa} onChange={setTwoFa} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>Save Activity Logs</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Record all account activity and detect unusual access patterns.</div>
                </div>
                <Toggle on={activityLogs} onChange={setActivityLogs} />
              </div>
            </Card>

            <Card title="Active Sessions" subtitle="Devices currently logged into your account.">
              {[
                { device: 'Chrome on Windows', ip: '41.33.21.5',    location: 'Dar es Salaam, TZ', current: true,  time: 'Active now' },
                { device: 'Safari on iPhone',  ip: '41.33.22.11',   location: 'Dar es Salaam, TZ', current: false, time: '2 hours ago' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i === 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="monitor" size={18} strokeWidth={1.75} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.device}
                      {s.current && <span style={{ padding: '1px 8px', borderRadius: 20, background: 'var(--green-l)', color: 'var(--green)', fontSize: 10.5, fontWeight: 700 }}>Current</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{s.ip} · {s.location} · {s.time}</div>
                  </div>
                  {!s.current && <button style={{ padding: 'var(--ds-btn-py-sm) 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 13, color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>Revoke</button>}
                </div>
              ))}
            </Card>

            <Card title="Danger Zone" subtitle="Irreversible actions. Proceed with caution.">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Deactivate Account</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>Temporarily disable your account. You can reactivate at any time.</div>
                </div>
                <button style={{ padding: 'var(--ds-btn-py) 16px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Deactivate</button>
              </div>
            </Card>
          </>
        )}

        {/* ══ NOTIFICATIONS ══ */}
        {activeTab === 'notifications' && (
          <>
            <Card title="Email Notifications" subtitle="Choose which events trigger email notifications.">
              {([
                { key: 'email_shipment', label: 'Shipment status updates',      sub: 'When a shipment changes stage or status.' },
                { key: 'email_invoice',  label: 'Invoice & payment alerts',     sub: 'New invoices, payment receipts, overdue reminders.' },
                { key: 'email_document', label: 'Document requests',            sub: 'When a document is required or approved.' },
                { key: 'email_reminder', label: 'Task & deadline reminders',    sub: 'Upcoming due dates and SLA warnings.' },
                { key: 'email_news',     label: 'Product updates & news',       sub: 'New features and platform announcements.' },
              ] as const).map((n, i, arr) => (
                <div key={n.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{n.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{n.sub}</div>
                  </div>
                  <Toggle on={notif[n.key]} onChange={v => setNotif(p => ({...p, [n.key]: v}))} />
                </div>
              ))}
            </Card>

            <Card title="WhatsApp Notifications" subtitle="Push updates via WhatsApp Business.">
              {([
                { key: 'wa_shipment', label: 'Shipment updates',   sub: 'Stage changes, arrivals and clearance updates.' },
                { key: 'wa_urgent',   label: 'Urgent alerts',      sub: 'Demurrage risk, SLA breach, urgent cases.' },
                { key: 'wa_payment',  label: 'Payment reminders',  sub: 'Due dates for invoices and duty payments.' },
              ] as const).map((n, i, arr) => (
                <div key={n.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{n.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{n.sub}</div>
                  </div>
                  <Toggle on={notif[n.key]} onChange={v => setNotif(p => ({...p, [n.key]: v}))} />
                </div>
              ))}
            </Card>

            <Card title="In-App Notifications" subtitle="Notifications inside the Hudumika platform.">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>All in-app notifications</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Show notification badges and real-time alerts inside the app.</div>
                </div>
                <Toggle on={notif.app_all} onChange={v => setNotif(p => ({...p, app_all: v}))} />
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={{ padding: 'var(--ds-btn-py) 22px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Save Preferences</button>
            </div>
          </>
        )}

        {/* ══ ACCOUNT ACTIVITY ══ */}
        {activeTab === 'activity' && (
          <Card title="Login & Activity Log" subtitle="Recent account activity. Contact support if you notice anything suspicious.">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="download" size={13} strokeWidth={2} />
                Export Log
              </button>
            </div>
            <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Action', 'IP Address', 'Device', 'Time', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTIVITY_LOG.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 12px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{row.action}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{row.ip}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--ink3)' }}>{row.device}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{row.time}</td>
                    <td style={{ padding: '11px 12px' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: row.ok ? 'var(--green-l)' : 'var(--red-l)', color: row.ok ? 'var(--green)' : 'var(--red)' }}>
                        {row.ok ? '✓ OK' : '✗ Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}

      </div>
      </div>
    </div>
  );
};
