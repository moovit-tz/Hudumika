import React, { useState, useRef, useCallback } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { AccountSecurityPanel } from '../components/AccountSecurityPanel.js';
import type { IconName } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Switch } from '../components/ui/switch.js';
import { showAlert } from '../lib/alert.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import './UserProfile.css';

/* â”€â”€ Role label mapping â”€â”€ */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrator',
  ADMIN: 'Company Administrator',
  TENANT_ADMIN: 'Company Administrator',
  MANAGER: 'Operations Manager',
  FINANCE: 'Finance Officer',
  SALES: 'Sales Officer',
  SENIOR: 'Senior Clearing Officer',
  JUNIOR: 'Junior Clearing Officer',
  OFFICER: 'Clearing Officer',
  CUSTOMER: 'Customer',
};

/* â”€â”€ Country defaults: capital city + closest timezone â”€â”€ */
const COUNTRY_DEFAULTS: Record<string, { city: string; timezone?: string }> = {
  Tanzania:   { city: 'Dar es Salaam', timezone: 'Africa/Dar_es_Salaam' },
  Kenya:      { city: 'Nairobi',       timezone: 'Africa/Nairobi'       },
  Uganda:     { city: 'Kampala',       timezone: 'Africa/Kampala'       },
  Rwanda:     { city: 'Kigali',        timezone: 'Africa/Kigali'        },
  Burundi:    { city: 'Bujumbura',     timezone: 'Africa/Kigali'        },
  Ethiopia:   { city: 'Addis Ababa',   timezone: 'Africa/Nairobi'       },
  Zambia:     { city: 'Lusaka'                                          },
  Malawi:     { city: 'Lilongwe'                                        },
  Mozambique: { city: 'Maputo'                                          },
};

/* â”€â”€ Tab configuration â”€â”€ */
interface Tab { key: string; label: string; icon: IconName }
const TABS: Tab[] = [
  { key: 'personal',      label: 'Personal Info',      icon: 'user'      },
  { key: 'security',      label: 'Security & Auth',    icon: 'lock'      },
  { key: 'notifications', label: 'Notifications',       icon: 'bell'      },
  { key: 'activity',      label: 'Account Activity',    icon: 'activity'  },
];

/* â”€â”€ Activity audit log rows â”€â”€ */
const ACTIVITY_LOG = [
  { action: 'Session Login',           ip: '41.33.21.5',    location: 'Dar es Salaam, TZ', device: 'Chrome Â· Windows 11',  time: 'Just now',     ok: true  },
  { action: 'Password Authenticated',  ip: '41.33.21.5',    location: 'Dar es Salaam, TZ', device: 'Chrome Â· Windows 11',  time: '2 hours ago',  ok: true  },
  { action: 'Security Settings Audit', ip: '41.33.21.5',    location: 'Dar es Salaam, TZ', device: 'Chrome Â· Windows 11',  time: '3 days ago',   ok: true  },
  { action: 'Failed Login Attempt',    ip: '185.22.41.100', location: 'Frankfurt, DE',     device: 'Unknown Client Â· Linux',time: '5 days ago',  ok: false },
  { action: 'Mobile Web Authorization',ip: '41.33.21.5',    location: 'Dar es Salaam, TZ', device: 'Safari Â· iPhone 15',   time: '1 week ago',   ok: true  },
  { action: 'Profile Details Saved',   ip: '41.33.21.5',    location: 'Dar es Salaam, TZ', device: 'Chrome Â· Windows 11',  time: '2 weeks ago',  ok: true  },
];

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Main Component: UserProfile
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const UserProfile: React.FC = () => {
  usePageSEO('My Profile', 'Manage your account settings, personal details, security, and preferences.');
  const { user, logout, updateUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') || 'personal';

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  /* Form state */
  const buildInitialForm = () => ({
    name:           user?.name || '',
    phone:          user?.phone || '',
    cover_url:      user?.profile?.cover_url || '',
    cover_position: user?.profile?.cover_position || { x: 50, y: 50 },
    bio:            user?.profile?.bio || '',
    job_title:      user?.profile?.job_title || ROLE_LABELS[user?.role || ''] || '',
    employee_code:  user?.profile?.employee_code || 'EMP-0018',
    department:     user?.profile?.department || 'Executive & Operations',
    reports_to:     user?.profile?.reports_to || 'Board of Directors',
    city:           user?.profile?.city || 'Dar es Salaam',
    country:        user?.profile?.country || 'Tanzania',
    timezone:       user?.profile?.timezone || 'Africa/Dar_es_Salaam',
    language:       user?.profile?.language || 'en',
    website:        user?.profile?.website || '',
    hide_presence:  user?.profile?.hide_presence || false,
  });

  const [form, setForm] = useState(buildInitialForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* PII reveal state */
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const maskPhone = useCallback((phone: string) => {
    if (!phone || phone.length < 6) return phone;
    return phone.slice(0, 4) + ' â€¢â€¢â€¢ â€¢â€¢â€¢' + phone.slice(-3);
  }, []);

  /* Notifications state */
  const [notif, setNotif] = useState({
    email_shipment: true, email_invoice: true, email_document: false,
    email_reminder: true, email_news: false,
    wa_shipment: true, wa_urgent: true, wa_payment: true,
    app_all: true,
  });
  const [notifSaved, setNotifSaved] = useState(false);

  const setTab = (t: string) => setParams({ tab: t });

  const handleCopyEmail = () => {
    if (!user?.email) return;
    navigator.clipboard.writeText(user.email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

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
          profile: {
            bio: form.bio,
            job_title: form.job_title,
            city: form.city,
            country: form.country,
            timezone: form.timezone,
            language: form.language,
            website: form.website,
            cover_url: form.cover_url || null,
            cover_position: form.cover_position,
            hide_presence: form.hide_presence,
          },
        }),
      });
      if (res?.user) updateUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const persistCoverPatch = async (coverUrl: string | null, coverPosition?: { x: number; y: number }) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch('/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          profile: {
            cover_url: coverUrl,
            ...(coverPosition ? { cover_position: coverPosition } : {}),
          },
        }),
      });
      if (res?.user) updateUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save image.');
    } finally {
      setSaving(false);
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
      const centered = { x: 50, y: 50 };
      setForm(p => ({ ...p, cover_url: dataUrl, cover_position: centered }));
      persistCoverPatch(dataUrl, centered);
    };
    reader.readAsDataURL(file);
  };

  /* Cover reposition dragging */
  const coverBannerRef = useRef<HTMLDivElement>(null);
  const [draggingCover, setDraggingCover] = useState(false);
  const coverDragStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const handleCoverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!form.cover_url) return;
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
    coverDragStart.current = { x: e.clientX, y: e.clientY, posX: form.cover_position.x, posY: form.cover_position.y };
    setDraggingCover(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCoverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingCover || !coverDragStart.current) return;
    const rect = coverBannerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dxPct = ((e.clientX - coverDragStart.current.x) / rect.width) * 100;
    const dyPct = ((e.clientY - coverDragStart.current.y) / rect.height) * 100;
    const nextX = Math.min(100, Math.max(0, coverDragStart.current.posX - dxPct));
    const nextY = Math.min(100, Math.max(0, coverDragStart.current.posY - dyPct));
    setForm(p => ({ ...p, cover_position: { x: nextX, y: nextY } }));
  };

  const handleCoverPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingCover) return;
    setDraggingCover(false);
    coverDragStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    persistCoverPatch(form.cover_url, form.cover_position);
  };

  if (!user) return <SkeletonPage variant="detail" />;

  return (
    <div className="user-profile-page">
      {/* â”€â”€ Executive Hero Showcase Card â”€â”€ */}
      <div className="profile-hero-card">
        {/* Cover banner with integrated Header & glassmorphic actions */}
        <div
          ref={coverBannerRef}
          onPointerDown={handleCoverPointerDown}
          onPointerMove={handleCoverPointerMove}
          onPointerUp={handleCoverPointerUp}
          onPointerCancel={handleCoverPointerUp}
          style={{
            backgroundImage: form.cover_url
              ? `url("${form.cover_url}")`
              : 'linear-gradient(135deg, #0d3b4c 0%, #005a70 50%, #00877a 100%)',
            backgroundPosition: form.cover_url
              ? `${form.cover_position.x}% ${form.cover_position.y}%`
              : 'center',
            cursor: form.cover_url ? (draggingCover ? 'grabbing' : 'grab') : 'default',
            touchAction: draggingCover ? 'none' : undefined,
          }}
          className="profile-cover-banner"
        >
          {/* Inner Content Grid inside Cover */}
          <div className="profile-cover-inner">
            {/* Left Header info inside Cover */}
            <div className="profile-cover-header">
              <div className="profile-cover-crumbs">
                <span>WORKSPACE</span>
                <span className="profile-cover-crumb-sep">Â·</span>
                <span>MY PROFILE</span>
              </div>
              <h1 className="profile-cover-title">
                My<em>profile</em><span className="ph-dot">.</span>
              </h1>
              <p className="profile-cover-subtitle">
                Manage personal details, employment context, security credentials, and platform preferences.
              </p>
            </div>

            {/* Right Action buttons inside Cover */}
            <div className="profile-cover-actions-top">
              <Link to="/subscription" className="profile-cover-glass-btn">
                <Icon name="creditCard" size={13} strokeWidth={2} />
                Subscription
              </Link>
              <button
                type="button"
                className="profile-cover-glass-btn profile-cover-glass-btn--danger"
                onClick={logout}
              >
                <Icon name="externalLink" size={13} strokeWidth={2} />
                Sign Out
              </button>
              {form.cover_url && (
                <button
                  type="button"
                  className="profile-cover-glass-btn profile-cover-glass-btn--danger"
                  onClick={() => {
                    setForm(p => ({ ...p, cover_url: '', cover_position: { x: 50, y: 50 } }));
                    persistCoverPatch(null, { x: 50, y: 50 });
                  }}
                >
                  <Icon name="trash" size={12} strokeWidth={2} />
                  Remove
                </button>
              )}
              <button
                type="button"
                className="profile-cover-glass-btn"
                onClick={() => coverInputRef.current?.click()}
              >
                <Icon name="camera" size={13} strokeWidth={2} />
                {form.cover_url ? 'Change Cover' : 'Upload Cover'}
              </button>
            </div>
          </div>

          {form.cover_url && !draggingCover && (
            <div className="profile-cover-pill">
              <Icon name="hand" size={12} strokeWidth={2} />
              Drag to reposition cover
            </div>
          )}

          <input
            type="file"
            ref={coverInputRef}
            onChange={handleCoverFile}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>

        {/* Hero Identity Body */}
        <div className="profile-hero-body">
          <div className="profile-hero-identity-row">
            <div className="profile-hero-identity-left">
              {/* Avatar Picker with 4px concentric white ring */}
              <div className="profile-hero-avatar-wrap">
                <AvatarPicker id={user.id} kind="people" name={user.name} size={78} ring="#ffffff" />
              </div>

              {/* User Name & Metadata */}
              <div className="profile-hero-user-details">
                <div className="profile-hero-name-row">
                  <h2 className="profile-hero-name">{user.name}</h2>
                  <span className="profile-hero-role-tag">
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                </div>

                <div className="profile-hero-meta-bar">
                  <span className="profile-hero-meta-item">
                    <Icon name="mail" size={13} strokeWidth={2} />
                    {user.email}
                    <button
                      type="button"
                      className="profile-copy-btn"
                      onClick={handleCopyEmail}
                      title="Copy email to clipboard"
                    >
                      <Icon name="copy" size={12} strokeWidth={2} />
                      {copiedEmail && <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 750 }}>Copied!</span>}
                    </button>
                  </span>

                  {form.phone && (
                    <span className="profile-hero-meta-item">
                      <Icon name="phone" size={13} strokeWidth={2} />
                      {form.phone}
                    </span>
                  )}

                  <span className="profile-hero-meta-item">
                    <Icon name="globe" size={13} strokeWidth={2} />
                    {form.city ? `${form.city}, ${form.country}` : form.country}
                  </span>
                </div>
              </div>
            </div>

            <div className="profile-hero-identity-right">
              {activeTab === 'personal' && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: 'var(--ds-btn-py-sm) 16px',
                    border: 'none',
                    borderRadius: 'var(--r, 8px)',
                    background: saved ? 'var(--green)' : 'hsl(var(--primary))',
                    color: saved ? '#ffffff' : 'hsl(var(--primary-foreground))',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: 'var(--ctl-h-sm)',
                    boxSizing: 'border-box',
                    lineHeight: 1.25,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                    transition: 'background 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <Icon name="check" size={13} strokeWidth={2.4} />
                  {saved ? 'Saved!' : saving ? 'Savingâ€¦' : 'Save Changes'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab('security')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: 'var(--ds-btn-py-sm) 14px',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--r, 8px)',
                  background: 'var(--card-sunken, var(--bg))',
                  color: 'var(--ink2)',
                  fontSize: 12.5,
                  fontWeight: 650,
                  cursor: 'pointer',
                  minHeight: 'var(--ctl-h-sm)',
                  boxSizing: 'border-box',
                  lineHeight: 1.25,
                }}
              >
                <Icon name="lock" size={12} strokeWidth={2} />
                Security Settings
              </button>
            </div>
          </div>

          {/* 4 Executive KPI / Insight Showcase Tiles */}
          <div className="profile-hero-kpis-grid">
            <div className="profile-kpi-tile profile-kpi-tile--green">
              <span className="profile-kpi-num profile-kpi-num--green">
                <span className="profile-online-dot" aria-hidden="true" />
                Online
              </span>
              <span className="profile-kpi-sublabel">Presence</span>
            </div>

            <div className="profile-kpi-tile profile-kpi-tile--teal">
              <span className="profile-kpi-num profile-kpi-num--teal">
                <Icon name="shield" size={15} strokeWidth={2.4} />
                98% Protected
              </span>
              <span className="profile-kpi-sublabel">Security Posture</span>
            </div>

            <div className="profile-kpi-tile profile-kpi-tile--blue">
              <span className="profile-kpi-num profile-kpi-num--blue">
                <Icon name="activity" size={15} strokeWidth={2.4} />
                2 Sessions
              </span>
              <span className="profile-kpi-sublabel">Active Devices</span>
            </div>

            <div className="profile-kpi-tile profile-kpi-tile--purple">
              <span className="profile-kpi-num profile-kpi-num--purple">
                <Icon name="user" size={15} strokeWidth={2.4} />
                {ROLE_LABELS[user.role] ? ROLE_LABELS[user.role].split(' ')[0] : 'Admin'}
              </span>
              <span className="profile-kpi-sublabel">Access Tier</span>
            </div>
          </div>
        </div>

        {/* Integrated Segmented Tab Strip */}
        <div className="profile-tab-strip">
          <Tabs value={activeTab} onValueChange={(v) => setTab(v as any)} variant="segmented">
            <TabsList className="profile-tab-strip-list">
              {TABS.map(t => (
                <TabsTrigger key={t.key} value={t.key}>
                  <Icon name={t.icon} size={14} strokeWidth={activeTab === t.key ? 2.3 : 1.8} />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>
            Member since <strong style={{ color: 'var(--ink2)' }}>2025</strong> Â· Primary Tenant
          </div>
        </div>
      </div>

      {/* â”€â”€ Tab Content â”€â”€ */}
      <div className="profile-content-area">

        {/* â•â• TAB 1: PERSONAL INFO (BENTO GRID) â•â• */}
        {activeTab === 'personal' && (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="profile-card profile-card--attached">

              {/* Unified card header */}
              <div className="profile-card-header">
                <div className="profile-card-title-group">
                  <FeaturedIcon variant="brand" size="md" shape="squircle">
                    <Icon name="user" size={18} strokeWidth={2.2} />
                  </FeaturedIcon>
                  <div className="profile-card-heading">
                    <h3 className="profile-card-title">Personal Information</h3>
                    <p className="profile-card-subtitle">Identity, contact details, regional settings, and employment context.</p>
                  </div>
                </div>
              </div>

              {/* Two-column layout inside a single card body */}
              <div className="profile-card-body profile-card-body--cols">
                <div className="profile-bento-grid">

                  {/* Left Column (7-Col): Basic Info & Public Bio */}
                  <div className="profile-bento-main">
                    {/* Personal Identity subsection */}
                    <div className="profile-subsection">
                      <div className="profile-subsection-hdr">
                        <Icon name="user" size={13} color="var(--teal)" strokeWidth={2.2} />
                        Personal Identity
                      </div>
                      <div className="profile-subsection-body">
                    <div className="profile-form-grid-2">
                      <div className="profile-field-group">
                        <label className="profile-field-label">Full Name</label>
                        <input
                          className="profile-input"
                          value={form.name}
                          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="Your full legal name"
                          required
                        />
                      </div>

                      <div className="profile-field-group">
                        <label className="profile-field-label">
                          Email Address
                          <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 700, textTransform: 'none' }}>
                            Secured
                          </span>
                        </label>
                        <input
                          className="profile-input"
                          value={user.email}
                          disabled
                          title="Changing email requires security confirmation"
                        />
                        <span className="profile-field-hint">
                          Email is synced to login credentials.{' '}
                          <button
                            type="button"
                            onClick={() => setTab('security')}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: 'var(--teal)',
                              fontWeight: 700,
                              fontSize: 11.5,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Change via Security
                          </button>
                        </span>
                      </div>

                      <div className="profile-field-group">
                        <label className="profile-field-label">
                          Phone Number
                          <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 700, textTransform: 'none' }}>
                            PII
                          </span>
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            className="profile-input"
                            value={phoneRevealed ? form.phone : maskPhone(form.phone)}
                            onChange={e => {
                              if (phoneRevealed) setForm(p => ({ ...p, phone: e.target.value }));
                            }}
                            readOnly={!phoneRevealed}
                            placeholder="+255 712 345 678"
                            style={{ paddingRight: 80 }}
                          />
                          <button
                            type="button"
                            onClick={() => setPhoneRevealed(v => !v)}
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--teal)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontFamily: 'var(--font)',
                            }}
                          >
                            {phoneRevealed ? 'Hide' : 'Reveal'}
                          </button>
                        </div>
                      </div>

                      <div className="profile-field-group">
                        <label className="profile-field-label">Website / Portfolio</label>
                        <input
                          className="profile-input"
                          value={form.website}
                          onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                          placeholder="https://example.com"
                        />
                      </div>
                    </div>

                    <div className="profile-field-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="profile-field-label">Bio & Professional Summary</label>
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{form.bio.length} / 500</span>
                      </div>
                      <textarea
                        className="profile-textarea"
                        value={form.bio}
                        maxLength={500}
                        onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                        rows={3}
                        placeholder="Share a short summary of your responsibilities, clearing specializations, or certifications..."
                      />
                    </div>
                    </div>{/* end profile-subsection-body */}
                    </div>{/* end profile-subsection */}

                    {/* Regional & Localization subsection */}
                    <div className="profile-subsection profile-subsection--divided">
                      <div className="profile-subsection-hdr">
                        <Icon name="globe" size={13} color="var(--teal)" strokeWidth={2.2} />
                        Regional & Localization
                      </div>
                      <div className="profile-subsection-body">
                    <div className="profile-form-grid-2">
                      <div className="profile-field-group">
                        <label className="profile-field-label">Country / Territory</label>
                        <Select
                          value={form.country}
                          onValueChange={v => {
                            const defaults = COUNTRY_DEFAULTS[v];
                            setForm(p => ({
                              ...p,
                              country: v,
                              city: defaults?.city ?? p.city,
                              ...(defaults?.timezone ? { timezone: defaults.timezone } : {}),
                            }));
                          }}
                        >
                          <SelectTrigger aria-label="Country" className="profile-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['Tanzania', 'Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Zambia', 'Malawi', 'Mozambique', 'Ethiopia', 'Other'].map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="profile-field-group">
                        <label className="profile-field-label">City / Town</label>
                        <input
                          className="profile-input"
                          value={form.city}
                          onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                          placeholder="e.g. Dar es Salaam"
                        />
                      </div>

                      <div className="profile-field-group">
                        <label className="profile-field-label">Operational Timezone</label>
                        <Select value={form.timezone} onValueChange={v => setForm(p => ({ ...p, timezone: v }))}>
                          <SelectTrigger aria-label="Timezone" className="profile-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Africa/Dar_es_Salaam">East Africa Time (Africa/Dar_es_Salaam Â· UTC+3)</SelectItem>
                            <SelectItem value="Africa/Nairobi">Nairobi Time (Africa/Nairobi Â· UTC+3)</SelectItem>
                            <SelectItem value="Africa/Kampala">Uganda Time (Africa/Kampala Â· UTC+3)</SelectItem>
                            <SelectItem value="Africa/Kigali">Central Africa Time (Africa/Kigali Â· UTC+2)</SelectItem>
                            <SelectItem value="UTC">Coordinated Universal Time (UTC)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="profile-field-group">
                        <label className="profile-field-label">Interface Language</label>
                        <Select value={form.language} onValueChange={v => setForm(p => ({ ...p, language: v }))}>
                          <SelectTrigger aria-label="Language" className="profile-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English (Default)</SelectItem>
                            <SelectItem value="sw">Kiswahili (East Africa)</SelectItem>
                            <SelectItem value="fr">FranÃ§ais</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>{/* end profile-form-grid-2 (Regional) */}
                  </div>{/* end profile-subsection-body (Regional) */}
                </div>{/* end profile-subsection--divided (Regional) */}
              </div>{/* end profile-bento-main */}

              {/* Right Column (5-Col): Employment Context & Privacy */}
              <div className="profile-bento-side">

                {/* Employment & Hierarchy subsection */}
                <div className="profile-subsection">
                  <div className="profile-subsection-hdr">
                    <Icon name="briefcase" size={13} color="var(--teal)" strokeWidth={2.2} />
                    Employment & Hierarchy
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--badge-radius, 4px)',
                        background: 'var(--teal-l)',
                        color: 'var(--teal)',
                      }}
                    >
                      SYNCED
                    </span>
                  </div>
                  <div className="profile-subsection-body">
                    <div className="profile-sunken-matrix">
                      <div className="profile-sunken-cell">
                        <span className="profile-sunken-label">
                          <Icon name="contact" size={12} strokeWidth={2} />
                          Employee ID
                        </span>
                        <span className="profile-sunken-val" style={{ fontFamily: 'var(--font)' }}>
                          {form.employee_code || 'EMP-0018'}
                        </span>
                      </div>

                      <div className="profile-sunken-cell">
                        <span className="profile-sunken-label">
                          <Icon name="user" size={12} strokeWidth={2} />
                          Designation
                        </span>
                        <span className="profile-sunken-val">
                          {form.job_title || ROLE_LABELS[user.role] || 'Administrator'}
                        </span>
                      </div>

                      <div className="profile-sunken-cell">
                        <span className="profile-sunken-label">
                          <Icon name="grid" size={12} strokeWidth={2} />
                          Department
                        </span>
                        <span className="profile-sunken-val">
                          {form.department || 'Executive & Operations'}
                        </span>
                      </div>

                      <div className="profile-sunken-cell">
                        <span className="profile-sunken-label">
                          <Icon name="users" size={12} strokeWidth={2} />
                          Reports To
                        </span>
                        <span className="profile-sunken-val">
                          {form.reports_to || 'Board of Directors'}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.45 }}>
                      Official designation, reporting hierarchy, and company records are managed via{' '}
                      <Link to="/nexushr" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline' }}>
                        NexusHR Staff Hub
                      </Link>.
                    </div>
                  </div>{/* end subsection-body (Employment) */}
                </div>{/* end profile-subsection (Employment) */}

                {/* Presence & Privacy subsection */}
                <div className="profile-subsection profile-subsection--divided">
                  <div className="profile-subsection-hdr">
                    <Icon name="shield" size={13} color="var(--teal)" strokeWidth={2.2} />
                    Presence & Privacy
                  </div>
                  <div className="profile-subsection-body">
                    <div className="profile-switch-card">
                      <div className="profile-switch-info">
                        <span className="profile-switch-title">
                          Show Online Presence Dot
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 750,
                              color: !form.hide_presence ? 'var(--green)' : 'var(--ink3)',
                              marginLeft: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: !form.hide_presence ? 'var(--green)' : 'var(--ink3)',
                              }}
                            />
                            {!form.hide_presence ? 'Visible' : 'Hidden'}
                          </span>
                        </span>
                        <span className="profile-switch-desc">
                          Lets teammates see your live active / clocked-in status badge when collaborating on shipments, clearing jobs, and chats.
                        </span>
                      </div>
                      <Switch
                        checked={!form.hide_presence}
                        onCheckedChange={v => setForm(p => ({ ...p, hide_presence: !v }))}
                      />
                    </div>

                    <Link
                      to="/profile/privacy"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginTop: 10,
                        padding: '10px 14px',
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        textDecoration: 'none',
                        color: 'var(--ink)',
                      }}
                    >
                      <Icon name="shield" size={14} color="var(--teal)" />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Privacy Center</span>
                      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Download data, deletion requests, consent â†’</span>
                    </Link>
                  </div>{/* end subsection-body (Privacy) */}
                </div>{/* end profile-subsection--divided (Privacy) */}

              </div>{/* end profile-bento-side */}
            </div>{/* end profile-bento-grid */}
          </div>{/* end profile-card-body--cols */}
        </div>{/* end unified profile-card */}

            {/* Sticky / Pinned Save Actions Bar (Always visible) */}
            <div className="profile-footer-bar">
              <div className="profile-footer-status">
                {saveError ? (
                  <span style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="close" size={14} strokeWidth={2.5} />
                    {saveError}
                  </span>
                ) : saved ? (
                  <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="check" size={14} strokeWidth={2.5} />
                    Profile changes saved successfully!
                  </span>
                ) : (
                  <span style={{ color: 'var(--ink3)' }}>
                    Make sure to save your profile after updating contact or regional preferences.
                  </span>
                )}
              </div>

              <div className="profile-footer-actions">
                <button
                  type="button"
                  onClick={() => setForm(buildInitialForm())}
                  style={{
                    padding: 'var(--ds-btn-py) 20px',
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--r, 8px)',
                    background: 'var(--card-bg, var(--white))',
                    cursor: 'pointer',
                    fontSize: 13.5,
                    fontWeight: 600,
                    fontFamily: 'var(--font)',
                    color: 'var(--ink2)',
                    minHeight: 'var(--ctl-h)',
                    boxSizing: 'border-box',
                    lineHeight: 1.25,
                    transition: 'background 0.12s ease',
                  }}
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 'var(--ds-btn-py) 24px',
                    border: 'none',
                    borderRadius: 'var(--r, 8px)',
                    background: saved ? 'var(--green)' : 'hsl(var(--primary))',
                    color: saved ? '#ffffff' : 'hsl(var(--primary-foreground))',
                    cursor: 'pointer',
                    fontSize: 13.5,
                    fontWeight: 750,
                    fontFamily: 'var(--font)',
                    minHeight: 'var(--ctl-h)',
                    boxSizing: 'border-box',
                    lineHeight: 1.25,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    transition: 'background 0.15s ease, transform 0.15s ease',
                  }}
                >
                  {saved ? (
                    <>
                      <Icon name="check" size={14} strokeWidth={2.5} /> Saved!
                    </>
                  ) : saving ? (
                    'Saving changesâ€¦'
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* â•â• TAB 2: SECURITY & AUTH â•â• */}
        {activeTab === 'security' && (
          <div className="profile-security-embed">
            <AccountSecurityPanel />
          </div>
        )}

        {/* â•â• TAB 3: NOTIFICATIONS â•â• */}
        {activeTab === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Single unified notifications card */}
            <section className="profile-card profile-card--attached">
              <div className="profile-card-header">
                <div className="profile-card-title-group">
                  <FeaturedIcon variant="brand" size="md" shape="squircle">
                    <Icon name="bell" size={18} strokeWidth={2.2} />
                  </FeaturedIcon>
                  <div className="profile-card-heading">
                    <h3 className="profile-card-title">Notification Preferences</h3>
                    <p className="profile-card-subtitle">Choose which operational events reach you, and through which channel.</p>
                  </div>
                </div>
              </div>

              {/* Email Notifications subsection */}
              <div className="profile-subsection">
                <div className="profile-subsection-hdr">
                  <Icon name="mail" size={13} color="var(--teal)" strokeWidth={2.2} />
                  Email Notifications
                  <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--ink3)', marginLeft: 2 }}>
                    â€” {user.email}
                  </span>
                </div>
                <div className="profile-subsection-body" style={{ gap: 0 }}>
                  {([
                    { key: 'email_shipment', label: 'Shipment & Clearance Status Updates', sub: 'Receive instant notifications when a consignment transitions through customs stages or clearance checkpoints.' },
                    { key: 'email_invoice',  label: 'Invoice, Duty & Payment Alerts',      sub: 'Payment confirmations, official receipts, and approaching settlement due dates.' },
                    { key: 'email_document', label: 'Document & Compliance Requests',      sub: 'When an import/export permit, declaration form, or certificate is requested or approved.' },
                    { key: 'email_reminder', label: 'Task, Demurrage & SLA Reminders',    sub: 'Advance warnings for SLA deadlines, free-period expiration, and task assignments.' },
                    { key: 'email_news',     label: 'Product Updates & Platform News',     sub: 'Periodic announcements of new features, regulatory guides, and system maintenance.' },
                  ] as const).map(n => (
                    <div key={n.key} className="profile-notif-item">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{n.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.4 }}>{n.sub}</span>
                      </div>
                      <Switch
                        checked={notif[n.key]}
                        onCheckedChange={v => setNotif(p => ({ ...p, [n.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp Business subsection */}
              <div className="profile-subsection profile-subsection--divided">
                <div className="profile-subsection-hdr">
                  <Icon name="phone" size={13} color="var(--green)" strokeWidth={2.2} />
                  WhatsApp Business Direct Alerts
                </div>
                <div className="profile-subsection-body" style={{ gap: 0 }}>
                  {([
                    { key: 'wa_shipment', label: 'Urgent Shipment Milestone Alerts', sub: 'Live vessel arrival notifications, physical examination dates, and release orders.' },
                    { key: 'wa_urgent',   label: 'Demurrage & Critical Escalations', sub: 'Immediate warnings when shipments near demurrage thresholds or critical queries arise.' },
                    { key: 'wa_payment',  label: 'Duty & Port Charges Reminders',    sub: 'Duty payment assessment notices and TRA payment slips.' },
                  ] as const).map(n => (
                    <div key={n.key} className="profile-notif-item">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{n.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.4 }}>{n.sub}</span>
                      </div>
                      <Switch
                        checked={notif[n.key]}
                        onCheckedChange={v => setNotif(p => ({ ...p, [n.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* In-App Notifications subsection */}
              <div className="profile-subsection profile-subsection--divided">
                <div className="profile-subsection-hdr">
                  <Icon name="bell" size={13} color="var(--blue)" strokeWidth={2.2} />
                  In-App Alerts & Sound Notifications
                </div>
                <div className="profile-subsection-body">
                  <div className="profile-switch-card">
                    <div className="profile-switch-info">
                      <span className="profile-switch-title">All In-App Notifications</span>
                      <span className="profile-switch-desc">
                        Display real-time banner badges, live activity feeds, and bell counter inside the workspace navigation.
                      </span>
                    </div>
                    <Switch
                      checked={notif.app_all}
                      onCheckedChange={v => setNotif(p => ({ ...p, app_all: v }))}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Save Preferences Button */}
            <div className="profile-footer-bar">
              <span className="profile-footer-status" style={{ color: 'var(--ink3)' }}>
                {notifSaved ? (
                  <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="check" size={14} strokeWidth={2.5} />
                    Notification preferences updated!
                  </span>
                ) : (
                  'Customized notification channels apply to all active sessions.'
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNotifSaved(true);
                  setTimeout(() => setNotifSaved(false), 2500);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 'var(--ds-btn-py) 24px',
                  border: 'none',
                  borderRadius: 'var(--r, 8px)',
                  background: notifSaved ? 'var(--green)' : 'hsl(var(--primary))',
                  color: notifSaved ? '#ffffff' : 'hsl(var(--primary-foreground))',
                  cursor: 'pointer',
                  fontSize: 13.5,
                  fontWeight: 750,
                  fontFamily: 'var(--font)',
                  minHeight: 'var(--ctl-h)',
                  boxSizing: 'border-box',
                  lineHeight: 1.25,
                }}
              >
                {notifSaved ? <><Icon name="check" size={14} strokeWidth={2.5} /> Saved!</> : 'Save Notification Preferences'}
              </button>
            </div>
          </div>
        )}

        {/* â•â• TAB 4: ACCOUNT ACTIVITY â•â• */}
        {activeTab === 'activity' && (
          <section className="profile-card profile-card--attached">
            <div className="profile-card-header">
              <div className="profile-card-title-group">
                <FeaturedIcon variant="brand" size="md" shape="squircle">
                  <Icon name="activity" size={18} strokeWidth={2.2} />
                </FeaturedIcon>
                <div className="profile-card-heading">
                  <h3 className="profile-card-title">Security & Login Audit Ledger</h3>
                  <p className="profile-card-subtitle">Recent authentication events, device signatures, and geographical origins.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showAlert('Activity audit ledger exported to CSV format.')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: 'var(--ds-btn-py-sm) 14px',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--r, 8px)',
                  background: 'var(--card-bg, var(--white))',
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: 'var(--font)',
                  color: 'var(--ink2)',
                  minHeight: 'var(--ctl-h-sm)',
                  boxSizing: 'border-box',
                  lineHeight: 1.25,
                }}
              >
                <Icon name="download" size={13} strokeWidth={2} />
                Export Audit Log
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="profile-activity-table">
                <thead>
                  <tr>
                    <th>Action Event</th>
                    <th>IP Address</th>
                    <th>Location</th>
                    <th>Client & Platform</th>
                    <th>Timestamp</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTIVITY_LOG.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: row.ok ? 'var(--green)' : 'var(--red)',
                            }}
                          />
                          {row.action}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font)', fontSize: 12.5, color: 'var(--ink2)' }}>
                        {row.ip}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                        {row.location}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
                        {row.device}
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                        {row.time}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 9px',
                            borderRadius: 'var(--badge-radius, 4px)',
                            fontSize: 11.5,
                            fontWeight: 750,
                            background: row.ok ? 'var(--green-l)' : 'var(--red-l)',
                            color: row.ok ? 'var(--green)' : 'var(--red)',
                            border: `1px solid ${row.ok ? 'rgba(26, 127, 55, 0.2)' : 'rgba(220, 38, 38, 0.2)'}`,
                          }}
                        >
                          {row.ok ? 'âœ“ Authorized' : 'âœ— Blocked'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  );
};
export default UserProfile;
