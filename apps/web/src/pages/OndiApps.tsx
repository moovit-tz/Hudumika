// ─── OndiApps.tsx — Ondi Personal · Authorized Apps Hub ─────────
// Every app this user has granted OAuth access to, backed by working
// consent rows (ondi_oauth_consents).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useEntitlements } from '../hooks/useEntitlements.js';
import { useBranding } from '../hooks/useBranding.js';
import { getOndiConfig } from '../lib/ondiConfig.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { TotpEnrollCard } from '../components/TotpEnrollCard.js';
import { LAUNCHER_APPS, LauncherAppSvg } from '../components/LauncherApps.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import './OndiApps.css';

// The OAuth client_id → LAUNCHER_APPS id mapping is `hudumika-<id>` for
// every first-party client except this one, where the OAuth client kept the
// product name ("hudufreight") but the launcher's own id is the older
// "tracking" (see LauncherApps.tsx) — kept as an explicit exception here
// rather than touching either established id, which other code keys off.
const CLIENT_ID_TO_APP_ID: Record<string, string> = { 'hudumika-hudufreight': 'tracking' };

/** Real, live-branded app icon (the same LauncherAppSvg every app switcher
 *  in the platform uses) for a first-party Hudumika OAuth client, falling
 *  back to the client's own stored logo_url (genuine third-party apps only
 *  ever have this) and finally a generic icon if neither resolves. */
function ConnectedAppLogo({ isFirstParty, clientId, logoUrl, size = 40 }: {
  isFirstParty: boolean; clientId: string; logoUrl: string | null; size?: number;
}) {
  const branding = useBranding();
  if (isFirstParty) {
    const appId = CLIENT_ID_TO_APP_ID[clientId] ?? clientId.replace(/^hudumika-/, '');
    const app = LAUNCHER_APPS.find(a => a.id === appId);
    if (app) {
      return <LauncherAppSvg id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={size} />;
    }
  }
  if (logoUrl) return <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  return <Icon name="grid" size={Math.round(size * 0.55)} color="var(--teal)" />;
}

/** Real official Google "G" mark — same paths/colors as GoogleSignInButton.tsx's
 *  GOOGLE_G_ICON, kept as a React element here rather than an innerHTML string. */
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

/** Real Microsoft four-square mark — same colors as MicrosoftSignInButton.tsx. */
function MicrosoftMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

interface Consent {
  id: string;
  client_id: string;
  client_name: string;
  logo_url: string | null;
  first_party: boolean;
  scopes: string[];
  granted_at: string;
}

interface FirstPartyClient {
  client_id: string;
  name: string;
  logo_url: string | null;
}

// Same allow-list the backend gates POST/PATCH/DELETE /v1/ondi/oauth-clients
// behind (requireRoleOrOrgPermission(..., 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN')
// + org permission 'sso_providers.manage', see ondi.routes.ts) — mirrored
// here only to decide whether to show the real "Register an application"
// link or an honest "ask your admin" notice; the server is what actually
// enforces it.
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

const SCOPE_LABELS: Record<string, { label: string; icon: 'user' | 'mail' | 'shield' | 'key' }> = {
  openid: { label: 'Confirm identity', icon: 'shield' },
  profile: { label: 'View profile details', icon: 'user' },
  email: { label: 'View primary email', icon: 'mail' },
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OndiApps: React.FC = () => {
  const { user } = useAuth();
  const entitlements = useEntitlements();
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'first_party' | 'third_party'>('all');
  const [firstPartyApps, setFirstPartyApps] = useState<FirstPartyClient[] | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [ssoConfig, setSsoConfig] = useState<{ google_client_id: string | null; microsoft_client_id: string | null } | null>(null);
  const [ssoStatus, setSsoStatus] = useState<{ google: { last_used_at: string | null }; microsoft: { last_used_at: string | null } } | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/ondi/oauth/consents');
      setConsents(data);
    } catch {
      setConsents([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    apiFetch('/v1/ondi/oauth/clients/first-party').then(setFirstPartyApps).catch(() => setFirstPartyApps([]));
  }, []);

  useEffect(() => {
    getOndiConfig().then(setSsoConfig).catch(() => setSsoConfig({ google_client_id: null, microsoft_client_id: null }));
    apiFetch('/v1/security/sso-status').then(setSsoStatus).catch(() => setSsoStatus(null));
  }, []);

  const canManageOauthClients = !!user && (ADMIN_ROLES.includes(user.role) || !!user.org_permissions?.includes('sso_providers.manage'));

  // Only apps this tenant's plan actually includes, and not already
  // connected — a client_id like "hudumika-clearos" maps to the appId
  // ("clearos") useEntitlements()/RequireAppEnabled key off directly.
  const connectableApps = useMemo(() => {
    if (!firstPartyApps || !consents) return [];
    const connected = new Set(consents.map((c) => c.client_id));
    return firstPartyApps.filter((a) => {
      if (connected.has(a.client_id)) return false;
      const appId = a.client_id.replace(/^hudumika-/, '');
      return entitlements ? entitlements.features[appId] !== false : true;
    });
  }, [firstPartyApps, consents, entitlements]);

  async function connectApp(app: FirstPartyClient) {
    setConnectingId(app.client_id);
    try {
      await apiFetch('/v1/ondi/oauth/consents/preauthorize', { method: 'POST', body: JSON.stringify({ client_id: app.client_id }) });
      showAlert(`${app.name} connected to your Ondi identity.`, { variant: 'success' });
      await reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not connect this app.');
    } finally {
      setConnectingId(null);
    }
  }

  async function revoke(c: Consent) {
    const confirmed = await showConfirm(
      `Revoke ${c.client_name}'s access to your identity? You will need to sign in again to re-authorize this application.`,
      { variant: 'warning', confirmLabel: 'Revoke Access' }
    );
    if (!confirmed) return;

    setRevoking(c.id);
    try {
      await apiFetch(`/v1/ondi/oauth/consents/${c.id}`, { method: 'DELETE' });
      showAlert(`Access for ${c.client_name} revoked.`, { variant: 'success' });
      await reload();
    } catch (err: any) {
      showAlert(err.message || 'Could not revoke app consent.');
    } finally {
      setRevoking(null);
    }
  }

  const firstPartyCount = consents ? consents.filter((c) => c.first_party).length : 0;
  const thirdPartyCount = consents ? consents.filter((c) => !c.first_party).length : 0;
  const totalScopesCount = consents
    ? consents.reduce((acc, c) => acc + (c.scopes ? c.scopes.length : 0), 0)
    : 0;

  const filteredConsents = consents
    ? consents.filter((c) => {
        const matchesSearch = c.client_name.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (typeFilter === 'first_party') return c.first_party;
        if (typeFilter === 'third_party') return !c.first_party;
        return true;
      })
    : [];

  return (
    <div className="oa-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Authorized"
        titleEm="apps."
        subtitle="Manage applications and services connected to your Ondi identity credentials."
      />

      {/* ── Top Executive Posture KPI Grid (2x2 on Mobile) ── */}
      <div className="oa-kpi-grid">
        <div className="oa-kpi-card">
          <div className="oa-kpi-header">
            <span className="oa-kpi-title">Connected Apps</span>
            <div className="oa-kpi-icon primary">
              <Icon name="grid" size={17} />
            </div>
          </div>
          <div className="oa-kpi-body">
            <div className="oa-kpi-val">{consents ? consents.length : '—'}</div>
            <div className="oa-kpi-sub">
              <Icon name="checkCircle" size={12} color="var(--green)" />
              Active OAuth grants
            </div>
          </div>
        </div>

        <div className="oa-kpi-card">
          <div className="oa-kpi-header">
            <span className="oa-kpi-title">Hudumika Native</span>
            <div className="oa-kpi-icon success">
              <Icon name="shield" size={17} />
            </div>
          </div>
          <div className="oa-kpi-body">
            <div className="oa-kpi-val" style={{ color: 'var(--green, #10b981)' }}>
              {firstPartyCount}
            </div>
            <div className="oa-kpi-sub">First-party platform apps</div>
          </div>
        </div>

        <div className="oa-kpi-card">
          <div className="oa-kpi-header">
            <span className="oa-kpi-title">External Clients</span>
            <div className="oa-kpi-icon purple">
              <Icon name="link" size={17} />
            </div>
          </div>
          <div className="oa-kpi-body">
            <div className="oa-kpi-val" style={{ color: 'var(--purple, #8b5cf6)' }}>
              {thirdPartyCount}
            </div>
            <div className="oa-kpi-sub">Third-party integrations</div>
          </div>
        </div>

        <div className="oa-kpi-card">
          <div className="oa-kpi-header">
            <span className="oa-kpi-title">Active Scopes</span>
            <div className="oa-kpi-icon warning">
              <Icon name="key" size={17} />
            </div>
          </div>
          <div className="oa-kpi-body">
            <div className="oa-kpi-val">{totalScopesCount}</div>
            <div className="oa-kpi-sub">Granted identity permissions</div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Content Grid (2 Columns Desktop) ── */}
      <div className="oa-layout-grid">
        <div className="oa-main-col">
          {/* Apps Management Card */}
          <div className="oa-card">
            <div className="oa-card-hdr">
              <div className="oa-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="grid" size={15} />
                </FeaturedIcon>
                <div>
                  <h3 className="oa-card-title">Authorized OAuth Applications</h3>
                  <p className="oa-card-sub">Review access permissions granted via OpenID Connect sign-in</p>
                </div>
              </div>
              <Badge variant="info">OAuth 2.0 Governed</Badge>
            </div>

            <div className="oa-card-body">
              {/* Filter and Search Bar */}
              <div className="oa-toolbar">
                <div className="oa-search-box">
                  <Icon name="search" size={14} color="var(--ink3)" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search connected apps…"
                    className="oa-search-input"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('all')}
                    style={{
                      background: typeFilter === 'all' ? 'hsl(var(--primary))' : 'var(--bg)',
                      color: typeFilter === 'all' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm, 7px)',
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    All ({consents ? consents.length : 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('first_party')}
                    style={{
                      background: typeFilter === 'first_party' ? 'hsl(var(--primary))' : 'var(--bg)',
                      color: typeFilter === 'first_party' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm, 7px)',
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Hudumika ({firstPartyCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('third_party')}
                    style={{
                      background: typeFilter === 'third_party' ? 'hsl(var(--primary))' : 'var(--bg)',
                      color: typeFilter === 'third_party' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm, 7px)',
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    External ({thirdPartyCount})
                  </button>
                </div>
              </div>

              {/* App List */}
              {consents === null && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  Loading authorized apps…
                </div>
              )}

              {consents && filteredConsents.length === 0 && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  {search ? 'No apps matched your search.' : "You haven't authorized any applications yet."}
                </div>
              )}

              {filteredConsents.length > 0 && (
                <div className="oa-app-list">
                  {filteredConsents.map((c) => (
                    <div key={c.id} className="oa-app-item">
                      <div className="oa-app-left">
                        <div className="oa-app-logo">
                          <ConnectedAppLogo isFirstParty={c.first_party} clientId={c.client_id} logoUrl={c.logo_url} />
                        </div>

                        <div className="oa-app-info">
                          <div className="oa-app-name-row">
                            <span className="oa-app-name">{c.client_name}</span>
                            {c.first_party && (
                              <Badge variant="success">Verified Platform App</Badge>
                            )}
                            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                              Authorized {fmtDate(c.granted_at)}
                            </span>
                          </div>

                          <div className="oa-scopes-list">
                            {c.scopes &&
                              c.scopes.map((s) => {
                                const info = SCOPE_LABELS[s] || { label: s, icon: 'shield' };
                                return (
                                  <span key={s} className="oa-scope-chip">
                                    <Icon name={info.icon} size={11} color="var(--teal)" />
                                    {info.label}
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                      </div>

                      <div className="oa-app-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoking === c.id}
                          onClick={() => revoke(c)}
                          style={{ color: 'var(--red)', borderColor: 'var(--border)' }}
                        >
                          <Icon name="trash" size={13} style={{ marginRight: 4 }} />
                          {revoking === c.id ? 'Revoking…' : 'Revoke Access'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Connect a Hudumika app — self-service pre-authorize for the
              platform's own first-party apps (never third-party clients).
              First-party apps already auto-approve consent the moment
              they're actually opened; this just creates that consent row
              early so it shows here before that first visit. */}
          <div className="oa-card">
            <div className="oa-card-hdr">
              <div className="oa-card-hdr-left">
                <FeaturedIcon variant="success" size="sm" shape="square">
                  <Icon name="plus" size={15} />
                </FeaturedIcon>
                <div>
                  <h3 className="oa-card-title">Connect a Hudumika app</h3>
                  <p className="oa-card-sub">Pre-authorize one of your workspace's own apps to sign in with this identity</p>
                </div>
              </div>
            </div>

            <div className="oa-card-body">
              {firstPartyApps === null && (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading available apps…</div>
              )}

              {firstPartyApps && connectableApps.length === 0 && (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  Every Hudumika app in your workspace's plan is already connected.
                </div>
              )}

              {connectableApps.length > 0 && (
                <div className="oa-app-list">
                  {connectableApps.map((app) => (
                    <div key={app.client_id} className="oa-app-item">
                      <div className="oa-app-left">
                        <div className="oa-app-logo">
                          <ConnectedAppLogo isFirstParty clientId={app.client_id} logoUrl={app.logo_url} />
                        </div>
                        <div className="oa-app-info">
                          <div className="oa-app-name-row">
                            <span className="oa-app-name">{app.name}</span>
                            <Badge variant="success">Verified Platform App</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="oa-app-actions">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={connectingId === app.client_id}
                          onClick={() => connectApp(app)}
                        >
                          <Icon name="plus" size={13} style={{ marginRight: 4 }} />
                          {connectingId === app.client_id ? 'Connecting…' : 'Connect'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Single Sign-On — Google/Microsoft are sign-in-time email
              matching (ondi-auth.routes.ts), not a "link my account" record,
              so this reports real usage history from GET /sso-status rather
              than offering a fake "Connect" button with nothing behind it. */}
          {ssoConfig && (ssoConfig.google_client_id || ssoConfig.microsoft_client_id) && (
            <div className="oa-card">
              <div className="oa-card-hdr">
                <div className="oa-card-hdr-left">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="link" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oa-card-title">Single Sign-On</h3>
                    <p className="oa-card-sub">Identity providers you can sign in with</p>
                  </div>
                </div>
              </div>

              <div className="oa-card-body">
                <div className="oa-app-list">
                  {ssoConfig.google_client_id && (
                    <div className="oa-app-item">
                      <div className="oa-app-left">
                        <div className="oa-app-logo" style={{ background: 'var(--white)' }}>
                          <GoogleMark size={22} />
                        </div>
                        <div className="oa-app-info">
                          <div className="oa-app-name-row">
                            <span className="oa-app-name">Google</span>
                            {ssoStatus?.google.last_used_at ? (
                              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                                Last used {fmtDate(ssoStatus.google.last_used_at)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="oa-app-actions">
                        <Badge variant={ssoStatus?.google.last_used_at ? 'success' : 'gray'}>
                          {ssoStatus?.google.last_used_at ? 'Connected' : 'Not connected yet'}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {ssoConfig.microsoft_client_id && (
                    <div className="oa-app-item">
                      <div className="oa-app-left">
                        <div className="oa-app-logo" style={{ background: 'var(--white)' }}>
                          <MicrosoftMark size={22} />
                        </div>
                        <div className="oa-app-info">
                          <div className="oa-app-name-row">
                            <span className="oa-app-name">Microsoft</span>
                            {ssoStatus?.microsoft.last_used_at ? (
                              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                                Last used {fmtDate(ssoStatus.microsoft.last_used_at)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="oa-app-actions">
                        <Badge variant={ssoStatus?.microsoft.last_used_at ? 'success' : 'gray'}>
                          {ssoStatus?.microsoft.last_used_at ? 'Connected' : 'Not connected yet'}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '10px 0 0', lineHeight: 1.5 }}>
                  Signing in with a provider above uses your account email to match it to this identity — there's nothing separate to disconnect here.
                </p>
              </div>
            </div>
          )}

          {/* Authenticator app — "add an app for authentication" read
              literally: register a TOTP app as a sign-in factor. Same real
              /v1/security/2fa/* flow as Security Hub, mounted a second time
              here since that's where this request pointed. */}
          <TotpEnrollCard />
        </div>

        {/* ── Right Column: OAuth Security Principles ── */}
        <div className="oa-side-col">
          <div className="oa-card">
            <div className="oa-card-hdr">
              <div className="oa-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="shield" size={15} />
                </FeaturedIcon>
                <div>
                  <h4 className="oa-card-title">Token Safeguards</h4>
                  <p className="oa-card-sub">OpenID Connect security rules</p>
                </div>
              </div>
            </div>

            <div className="oa-card-body" style={{ gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Zero Password Disclosure</strong>
                  Connected applications never receive or store your account password or biometric credentials.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Instant Session Invalidation</strong>
                  Revoking access terminates active refresh tokens across the target application immediately.
                </div>
              </div>
            </div>
          </div>

          {/* Register a new application — this is a governance action (a
              registered client can request tokens for anyone in the
              tenant), so it stays gated to the same admin roles/permission
              the server already enforces on POST /v1/ondi/oauth-clients
              rather than duplicating a secret-issuing form on a personal
              self-service page. */}
          <div className="oa-card">
            <div className="oa-card-hdr">
              <div className="oa-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="grid" size={15} />
                </FeaturedIcon>
                <div>
                  <h4 className="oa-card-title">Register a new application</h4>
                  <p className="oa-card-sub">Add a third-party or internal app that signs in with Ondi</p>
                </div>
              </div>
            </div>
            <div className="oa-card-body">
              {canManageOauthClients ? (
                <>
                  <p style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, margin: 0 }}>
                    Issue a client ID (and secret, for confidential clients) so a new app can offer "Sign in with Ondi".
                  </p>
                  <Link to="/ondi/sso?tab=clients">
                    <Button variant="default" size="sm" style={{ marginTop: 12 }}>
                      <Icon name="externalLink" size={13} style={{ marginRight: 5 }} />
                      Open SSO & Providers
                    </Button>
                  </Link>
                </>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, margin: 0 }}>
                  Registering a new application is a workspace admin action — a registered client can request access on behalf of anyone in your organization. Ask a workspace admin to add it under SSO & Providers.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OndiApps;
