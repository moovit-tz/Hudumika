import React, { useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { ButtonSpinner } from '../components/ui/spinner.js';
import './UserProfile.css';

const COUNTRY_DEFAULTS: Record<string, { city: string; timezone?: string }> = {
  Tanzania: { city: 'Dar es Salaam', timezone: 'Africa/Dar_es_Salaam' },
  Kenya: { city: 'Nairobi', timezone: 'Africa/Nairobi' },
  Uganda: { city: 'Kampala', timezone: 'Africa/Kampala' },
  Rwanda: { city: 'Kigali', timezone: 'Africa/Kigali' },
  Burundi: { city: 'Bujumbura', timezone: 'Africa/Kigali' },
  Ethiopia: { city: 'Addis Ababa', timezone: 'Africa/Nairobi' },
  Zambia: { city: 'Lusaka' }, Malawi: { city: 'Lilongwe' }, Mozambique: { city: 'Maputo' },
};
const TIMEZONES = [
  ['Africa/Dar_es_Salaam', 'Dar es Salaam (UTC+3)'], ['Africa/Nairobi', 'Nairobi (UTC+3)'],
  ['Africa/Kampala', 'Kampala (UTC+3)'], ['Africa/Kigali', 'Kigali (UTC+2)'], ['UTC', 'UTC'],
];
const ONDI_LINKS: { label: string; desc: string; path: string; icon: IconName }[] = [
  { label: 'Security',  desc: 'Password, 2FA, sessions',      path: 'security',  icon: 'lock'       },
  { label: 'Privacy',   desc: 'Visibility and data controls',  path: 'privacy',   icon: 'shield'     },
  { label: 'Devices',   desc: 'Trusted devices and apps',      path: 'devices',   icon: 'smartphone' },
  { label: 'Activity',  desc: 'Login and audit history',       path: 'activity',  icon: 'activity'   },
];

export const UserProfile: React.FC = () => {
  usePageSEO('My Profile', 'Your workspace profile and preferences.');
  const { user, updateUser } = useAuth();
  const [params] = useSearchParams();

  const buildInitialForm = () => ({
    name:             user?.name || '',
    bio:              user?.profile?.bio || '',
    website:          user?.profile?.website || '',
    city:             user?.profile?.city || 'Dar es Salaam',
    country:          user?.profile?.country || 'Tanzania',
    timezone:         user?.profile?.timezone || 'Africa/Dar_es_Salaam',
    language:         user?.profile?.language || 'en',
    cover_url:        user?.profile?.cover_url || '',
    cover_position:   user?.profile?.cover_position || { x: 50, y: 50 },
  });

  const [form, setForm]       = useState(buildInitialForm);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const coverInput  = useRef<HTMLInputElement>(null);
  const coverBanner = useRef<HTMLDivElement>(null);
  const dragStart   = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const savePatch = async (patch: Record<string, unknown>) => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await apiFetch('/v1/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
      if (res?.user) updateUser(res.user);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally { setSaving(false); }
  };

  const updateField = (key: keyof typeof form, value: string) => {
    setForm(c => ({ ...c, [key]: value })); setSaved(false);
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const { name, ...profile } = form;
    void savePatch({ name, profile: { ...profile, cover_url: profile.cover_url || null } });
  };

  const uploadCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showAlert('Choose an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { showAlert('Choose an image under 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const cover_url = String(reader.result);
      const cover_position = { x: 50, y: 50 };
      setForm(c => ({ ...c, cover_url, cover_position }));
      void savePatch({ profile: { cover_url, cover_position } });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const removeCover = () => {
    setForm(c => ({ ...c, cover_url: '' }));
    void savePatch({ profile: { cover_url: null } });
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0 || !form.cover_url || saving) return;
    dragStart.current = { x: event.clientX, y: event.clientY, posX: form.cover_position.x, posY: form.cover_position.y };
    setDragging(true); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    const rect  = coverBanner.current?.getBoundingClientRect();
    if (!start || !rect) return;
    setForm(c => ({ ...c, cover_position: {
      x: Math.min(100, Math.max(0, start.posX - (event.clientX - start.x) / rect.width * 100)),
      y: Math.min(100, Math.max(0, start.posY - (event.clientY - start.y) / rect.height * 100)),
    } }));
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void savePatch({ profile: { cover_position: form.cover_position } });
  };

  const legacyTab = params.get('tab');
  if (legacyTab === 'security' || legacyTab === 'activity' || legacyTab === 'privacy') {
    return <Navigate to={`/ondi/personal/${legacyTab}`} replace />;
  }
  if (!user) return <SkeletonPage variant="detail" />;

  const isStaff      = user.role !== 'CUSTOMER';
  const locationLabel = [form.city, form.country !== 'Other' ? form.country : ''].filter(Boolean).join(', ');

  return (
    <div className="up-root">
      <PageHeader
        crumbs={['Workspace', 'Profile']}
        titlePlain="My" titleEm="profile"
        subtitle="Your workspace profile and preferences."
      />

      {/* ── Identity Hero ── */}
      <Card className="up-hero-card">

        {/* Cover photo area */}
        {form.cover_url ? (
          <div
            ref={coverBanner}
            className={`up-cover has-cover${dragging ? ' is-dragging' : ''}`}
            style={{
              backgroundImage: `url("${form.cover_url}")`,
              backgroundPosition: `${form.cover_position.x}% ${form.cover_position.y}%`,
            }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* Bottom scrim + drag hint */}
            <div className="up-cover-scrim">
              <span className="up-cover-drag-hint">
                <Icon name="hand" size={13} /> Drag to reposition
              </span>
            </div>
            {/* Frosted icon buttons — top right */}
            <div className="up-cover-actions" onPointerDown={e => e.stopPropagation()}>
              <button
                type="button"
                className="up-cover-btn"
                title="Change cover photo"
                disabled={saving}
                onClick={e => { e.stopPropagation(); coverInput.current?.click(); }}
               data-ui-native-button="">
                <Icon name="camera" size={15} />
              </button>
              <button
                type="button"
                className="up-cover-btn is-remove"
                title="Remove cover photo"
                disabled={saving}
                onClick={e => { e.stopPropagation(); removeCover(); }}
               data-ui-native-button="">
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="up-cover is-empty"
            onClick={() => coverInput.current?.click()}
           data-ui-native-button="">
            <span className="up-cover-empty-icon"><Icon name="camera" size={18} /></span>
            <span className="up-cover-empty-label">Add a cover photo</span>
          </button>
        )}

        {/* Identity strip */}
        <CardContent className={`up-identity${form.cover_url ? ' has-cover' : ''}`}>
          <div className="up-id-avatar">
            <AvatarPicker id={user.id} kind="people" name={user.name} size={72} controls="default" />
          </div>
          <div className="up-id-body">
            <div className="up-id-name">{user.name}</div>
            <div className="up-id-email">{user.email}</div>
            <div className="up-id-chips">
              <Badge variant="brand">{user.role.replaceAll('_', ' ').toLowerCase()}</Badge>
              {locationLabel && (
                <span className="up-id-location">
                  <Icon name="mapPin" size={11} /> {locationLabel}
                </span>
              )}
            </div>
          </div>
        </CardContent>

        <input ref={coverInput} type="file" accept="image/*" hidden onChange={uploadCover} />
      </Card>

      {/* ── 2-col body ── */}
      <div className="up-main-grid">

        {/* Left — form */}
        <form className="up-form" onSubmit={handleSave}>

          <Card>
            <CardHeader className="up-ch">
              <CardTitle>About you</CardTitle>
              <CardDescription>Your display name and short introduction.</CardDescription>
            </CardHeader>
            <CardContent className="up-cc up-fields">
              <div className="up-field">
                <Label htmlFor="up-name">Full name</Label>
                <Input id="up-name" autoComplete="name" required value={form.name}
                  onChange={e => updateField('name', e.target.value)} />
              </div>
              <div className="up-field">
                <Label htmlFor="up-website">Website</Label>
                <Input id="up-website" type="url" placeholder="https://" value={form.website}
                  onChange={e => updateField('website', e.target.value)} />
              </div>
              <div className="up-field up-field-wide">
                <div className="up-bio-row">
                  <Label htmlFor="up-bio">Bio</Label>
                  <span className="up-char-count">{form.bio.length}/500</span>
                </div>
                <Textarea id="up-bio" rows={3} maxLength={500} value={form.bio}
                  onChange={e => updateField('bio', e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="up-ch">
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Location, time zone, and language.</CardDescription>
            </CardHeader>
            <CardContent className="up-cc up-fields">
              <div className="up-field">
                <Label htmlFor="up-country">Country</Label>
                <Select value={form.country} onValueChange={country => {
                  const d = COUNTRY_DEFAULTS[country];
                  setForm(c => ({ ...c, country, city: d?.city ?? c.city, timezone: d?.timezone ?? c.timezone }));
                  setSaved(false);
                }}>
                  <SelectTrigger id="up-country"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...Object.keys(COUNTRY_DEFAULTS), 'Other'].map(c =>
                      <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="up-field">
                <Label htmlFor="up-city">City</Label>
                <Input id="up-city" autoComplete="address-level2" value={form.city}
                  onChange={e => updateField('city', e.target.value)} />
              </div>
              <div className="up-field">
                <Label htmlFor="up-timezone">Time zone</Label>
                <Select value={form.timezone} onValueChange={v => updateField('timezone', v)}>
                  <SelectTrigger id="up-timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="up-field">
                <Label htmlFor="up-language">Language</Label>
                <Select value={form.language} onValueChange={v => updateField('language', v)}>
                  <SelectTrigger id="up-language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sw">Kiswahili</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Save bar */}
          <div className="up-save-bar">
            <span
              role={error ? 'alert' : 'status'}
              className={`up-save-status${error ? ' is-error' : saved ? ' is-saved' : ''}`}
            >
              {saved && <Icon name="checkCircle" size={14} />}
              {error || (saved ? 'All changes saved.' : 'Save your changes when ready.')}
            </span>
            <div className="up-save-actions">
              <Button type="button" variant="outline" size="sm" disabled={saving}
                onClick={() => { setForm(buildInitialForm()); setSaved(false); setError(null); }}>
                Reset
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving && <ButtonSpinner />}{saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </form>

        {/* Right — sidebar */}
        <aside className="up-sidebar" aria-label="Account and employment">
          <Card>
            <CardHeader className="up-sidebar-ch">
              <FeaturedIcon variant="brand" size="sm"><Icon name="shield" /></FeaturedIcon>
              <div className="up-sidebar-ch-text">
                <CardTitle>Ondi</CardTitle>
                <CardDescription>Identity &amp; account settings</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="up-cc up-nav-list">
              <Button asChild className="up-nav-primary">
                <Link to="/ondi/personal">
                  Open Ondi
                  <Icon name="externalLink" size={13} style={{ marginLeft: 'auto' }} />
                </Link>
              </Button>
              <div className="up-nav-links">
                {ONDI_LINKS.map(item => (
                  <Link key={item.path} to={`/ondi/personal/${item.path}`} className="up-nav-link">
                    <span className="up-nav-link-icon"><Icon name={item.icon} size={14} /></span>
                    <span className="up-nav-link-body">
                      <span className="up-nav-link-label">{item.label}</span>
                      <span className="up-nav-link-desc">{item.desc}</span>
                    </span>
                    <Icon name="chevronRight" size={13} className="up-nav-link-arrow" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {isStaff && (
            <Card>
              <CardHeader className="up-sidebar-ch">
                <FeaturedIcon variant="success" size="sm"><Icon name="building" /></FeaturedIcon>
                <div className="up-sidebar-ch-text">
                  <CardTitle>NexusHR</CardTitle>
                  <CardDescription>Employment, leave &amp; pay</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="up-cc up-nav-list">
                <Button asChild className="up-nav-primary">
                  <Link to="/nexushr/me">
                    My HR portal
                    <Icon name="externalLink" size={13} style={{ marginLeft: 'auto' }} />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
};
