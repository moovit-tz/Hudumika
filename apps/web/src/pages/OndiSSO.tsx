// ─── OndiSSO.tsx — Perfected Ondi SSO, Inbound/Outbound IdP & Flow Architecture ──
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionCard } from '../components/SectionCard.js';
import { UpgradeNotice } from '../components/UpgradeNotice.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { useEntitlements } from '../hooks/useEntitlements.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog.js';
import { Tip } from '../components/ui/tooltip.js';
import { useAuth } from '../hooks/useAuth.js';

// The three real Studio triggers OAuth/SSO events emit (studio/triggers.ts)
const OAUTH_TRIGGER_IDS = new Set([
  'ondi.oauth_client_registered',
  'ondi.oauth_consent_granted',
  'ondi.oauth_consent_revoked',
]);

interface SsoProvider {
  id: string;
  provider_type: string;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
}

interface OauthClient {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  name: string;
  logo_url: string | null;
  redirect_uris: any;
  first_party: boolean;
  created_at: string;
}

interface SamlSpClient {
  id: string;
  name: string;
  entity_id: string;
  acs_url: string;
  slo_url: string | null;
  enabled: boolean;
  created_at: string;
}

interface SamlIdpKey {
  kid: string;
  status: 'active' | 'previous' | 'revoked';
  created_at: string;
  retired_at: string | null;
}

const PROVIDER_TYPES = ['GOOGLE', 'MICROSOFT', 'SAML', 'OIDC'];

function getProviderBadgeClass(type: string): string {
  switch (type.toUpperCase()) {
    case 'GOOGLE': return 'ondi-provider-badge google';
    case 'MICROSOFT': return 'ondi-provider-badge microsoft';
    case 'SAML': return 'ondi-provider-badge saml';
    case 'OIDC': return 'ondi-provider-badge oidc';
    default: return 'ondi-provider-badge';
  }
}

function getProviderIconName(type: string) {
  switch (type.toUpperCase()) {
    case 'GOOGLE': return 'globe';
    case 'MICROSOFT': return 'server';
    case 'SAML': return 'shield';
    case 'OIDC': return 'key';
    default: return 'lock';
  }
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ── Add SAML SP Modal ───────────────────────────────────────────────── */
function AddSamlSpModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [acsUrl, setAcsUrl] = useState('');
  const [sloUrl, setSloUrl] = useState('');
  const [certificate, setCertificate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/ondi/saml/idp/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          entity_id: entityId.trim(),
          acs_url: acsUrl.trim(),
          slo_url: sloUrl.trim() || undefined,
          signing_certificate: certificate.trim(),
        }),
      });
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register SAML application');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800">
              <Icon name="shield" size={20} />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Register SAML Application
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Ondi acts as the Identity Provider. Provide the Service Provider details from the application.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Application Name <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Corporate Jira / Workday"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              SP Entity ID (Audience URI) <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              placeholder="https://app.example.com/saml/metadata"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Assertion Consumer Service (ACS) URL <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={acsUrl}
              onChange={e => setAcsUrl(e.target.value)}
              placeholder="https://app.example.com/saml/acs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Single Logout (SLO) URL (Optional)
            </label>
            <Input
              value={sloUrl}
              onChange={e => setSloUrl(e.target.value)}
              placeholder="https://app.example.com/saml/slo"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              SP Signing Certificate (X.509 PEM) <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={certificate}
              onChange={e => setCertificate(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              className="w-full h-24 p-2.5 font-mono text-xs rounded-md border border-border bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
              <Icon name="alertTriangle" size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !entityId.trim() || !acsUrl.trim() || !certificate.trim()}>
              {saving ? 'Registering…' : 'Register Application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add Outbound OAuth Client Modal ─────────────────────────────────── */
function AddClientModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [firstParty, setFirstParty] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientId.trim() || !redirectUris.trim()) return;
    setSaving(true);
    setError(null);

    const uris = redirectUris.split(',').map(u => u.trim()).filter(Boolean);

    try {
      await apiFetch('/v1/ondi/oauth-clients', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId.trim(),
          name: name.trim(),
          redirect_uris: uris,
          logo_url: logoUrl.trim() || null,
          first_party: firstParty,
          client_secret: clientSecret.trim() || null,
        }),
      });
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create client application');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <Icon name="share" size={20} />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Add Outbound SSO Client Application
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure an external app (relying party) to authenticate users using Ondi OAuth2/OIDC.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Application Display Name <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Corporate Helpdesk"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Client ID (Unique identifier slug) <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="e.g. corp-helpdesk"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Callback / Redirect URIs (comma-separated) <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={redirectUris}
              onChange={e => setRedirectUris(e.target.value)}
              placeholder="http://localhost:3000/callback, https://helpdesk.company.com/oauth"
              className="w-full h-16 p-2.5 font-mono text-xs rounded-md border border-border bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Client Secret (Optional — leave blank for Public PKCE clients)
            </label>
            <Input
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder="••••••••••••"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              App Logo URL (Optional)
            </label>
            <Input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://company.com/logo.png"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="firstParty"
              checked={firstParty}
              onCheckedChange={c => setFirstParty(c === true)}
            />
            <label htmlFor="firstParty" className="text-xs font-semibold text-foreground cursor-pointer">
              First-party application (Bypasses user consent prompt)
            </label>
          </div>

          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
              <Icon name="alertTriangle" size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !clientId.trim() || !redirectUris.trim()}>
              {saving ? 'Creating…' : 'Register Application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add Inbound Identity Provider Modal ─────────────────────────────── */
function AddProviderModal({
  onClose,
  onAdded,
  onStartSaml,
}: {
  onClose: () => void;
  onAdded: () => void;
  onStartSaml: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('GOOGLE');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (type === 'SAML') {
      onStartSaml(name.trim());
      return;
    }
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const config = { client_id: clientId.trim(), client_secret: clientSecret.trim(), metadata_url: metadataUrl.trim() };
      await apiFetch('/v1/ondi/sso-providers', {
        method: 'POST',
        body: JSON.stringify({ provider_type: type, name: name.trim(), config }),
      });
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add provider');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800">
              <Icon name="logIn" size={20} />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Add Identity Provider
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {type === 'SAML'
                  ? 'Real assertion handling walked through step by step.'
                  : 'Configure federated authentication for your workspace members.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Provider Type <span className="text-red-500">*</span>
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Provider type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map(t => (
                  <SelectItem key={t} value={t}>
                    <div className="flex items-center gap-2">
                      <span className={getProviderBadgeClass(t)}>{t}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground/85 block">
              Display Name <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'SAML' ? 'e.g. Company Okta' : 'e.g. Google Workspace'}
            />
          </div>

          {type === 'SAML' ? (
            <div className="p-3 text-xs rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800 flex items-start gap-2">
              <Icon name="shield" size={16} className="text-teal-600 shrink-0 mt-0.5" />
              <span>Continuing opens the guided setup wizard to exchange ACS URLs, Entity IDs, and signing certificates with Okta, Entra ID, or Google.</span>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">Client ID</label>
                <Input value={clientId} onChange={e => setClientId(e.target.value)} className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">Client Secret</label>
                <Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">Metadata URL (OIDC)</label>
                <Input value={metadataUrl} onChange={e => setMetadataUrl(e.target.value)} placeholder="https://..." />
              </div>
            </>
          )}

          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
              <Icon name="alertTriangle" size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? 'Saving…' : type === 'SAML' ? 'Continue to Wizard' : 'Add Provider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── SAML Setup Wizard ───────────────────────────────────────────────── */
type SamlWizardStep = 'basics' | 'your-side' | 'their-side' | 'test';

const SAML_VENDOR_GUIDES: Record<'okta' | 'azure' | 'google' | 'other', { label: string; steps: string[] }> = {
  okta: {
    label: 'Okta',
    steps: [
      'In Okta: Applications → Applications → Create App Integration.',
      'Choose "SAML 2.0" and continue.',
      'Name the app (e.g. "Hudumika"), then continue to Configure SAML.',
      'Paste the Single sign-on URL and Audience URI (SP Entity ID) below into the matching fields.',
      'Finish the wizard, open the app\'s Sign On tab, and click "View Setup Instructions" for certificates and URLs.',
    ],
  },
  azure: {
    label: 'Microsoft Entra ID',
    steps: [
      'In the Entra admin center: Enterprise Applications → New application → Create your own application.',
      'Open Single sign-on → SAML.',
      'Under Basic SAML Configuration, paste the Identifier (Entity ID) and Reply URL below into matching fields.',
      'Download Certificate (Base64) and copy the Login URL from Section 4.',
    ],
  },
  google: {
    label: 'Google Workspace',
    steps: [
      'In Admin console: Apps → Web and mobile apps → Add app → Add custom SAML app.',
      'Name the app, then copy Google SSO URL, Entity ID, and download certificate.',
      'On Service provider details, paste the ACS URL and Entity ID below into matching fields.',
    ],
  },
  other: {
    label: 'Another Provider',
    steps: [
      'Create a new SAML application in your identity provider.',
      'Use the values below as Assertion Consumer Service (ACS) URL and Entity ID / Audience.',
      'Copy your IdP\'s own Entity ID, SSO URL, and signing certificate into Step 3.',
    ],
  },
};

function samlConfigComplete(p: SsoProvider | null): boolean {
  const c = p?.config;
  return !!(c && c.idpEntityId && c.idpSsoUrl && c.idpCertificate);
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground block">{label}</label>
      <div className="flex gap-2 items-center">
        <code className="flex-1 font-mono text-xs bg-muted/60 p-2 rounded-md border border-border overflow-x-auto whitespace-nowrap text-foreground">
          {value}
        </code>
        <Tip label={copied ? 'Copied' : 'Copy'}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="h-8 px-2.5 text-xs shrink-0"
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} className={copied ? 'text-green-600' : ''} />
          </Button>
        </Tip>
      </div>
    </div>
  );
}

function SamlSetupWizard({
  existing,
  initialName,
  onClose,
  onSaved,
}: {
  existing: SsoProvider | null;
  initialName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<SamlWizardStep>(
    !existing ? 'basics' : samlConfigComplete(existing) ? 'test' : 'their-side'
  );
  const [vendor, setVendor] = useState<'okta' | 'azure' | 'google' | 'other'>(existing?.config?.vendor ?? 'okta');
  const [name, setName] = useState(existing?.name ?? initialName ?? '');
  const [provider, setProvider] = useState<SsoProvider | null>(existing);
  const [idpEntityId, setIdpEntityId] = useState(existing?.config?.idpEntityId ?? '');
  const [idpSsoUrl, setIdpSsoUrl] = useState(existing?.config?.idpSsoUrl ?? '');
  const [idpCertificate, setIdpCertificate] = useState(existing?.config?.idpCertificate ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAndContinue() {
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const row = await apiFetch('/v1/ondi/sso-providers', {
        method: 'POST',
        body: JSON.stringify({ provider_type: 'SAML', name: name.trim(), config: { vendor } }),
      });
      setProvider(row);
      setStep('your-side');
    } catch (err: any) {
      setError(err.message || 'Could not create this provider.');
    } finally {
      setSaving(false);
    }
  }

  async function saveIdpDetails() {
    if (!provider || !idpEntityId.trim() || !idpSsoUrl.trim() || !idpCertificate.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const row = await apiFetch(`/v1/ondi/sso-providers/${provider.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            vendor,
            idpEntityId: idpEntityId.trim(),
            idpSsoUrl: idpSsoUrl.trim(),
            idpCertificate: idpCertificate.trim(),
          },
        }),
      });
      setProvider(row);
      onSaved();
      setStep('test');
    } catch (err: any) {
      setError(err.message || 'Could not save those details.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabledHere() {
    if (!provider) return;
    const next = !enabled;
    setEnabled(next);
    try {
      await apiFetch(`/v1/ondi/sso-providers/${provider.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: next }),
      });
      onSaved();
    } catch {
      setEnabled(!next);
    }
  }

  const metadataUrl = provider ? `${BASE_URL}/v1/ondi/auth/saml/${provider.id}/metadata` : '';
  const acsUrl = provider ? `${BASE_URL}/v1/ondi/auth/saml/${provider.id}/acs` : '';
  const loginUrl = provider ? `${BASE_URL}/v1/ondi/auth/saml/${provider.id}/login` : '';

  const STEP_LABELS: Record<SamlWizardStep, string> = {
    basics: 'Name It',
    'your-side': 'Your Side',
    'their-side': 'Their Side',
    test: 'Test & Finish',
  };
  const STEP_ORDER: SamlWizardStep[] = ['basics', 'your-side', 'their-side', 'test'];

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose size="md">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-base font-bold text-foreground">
              {existing ? `Finish Setup — ${existing.name}` : 'Connect SAML Identity Provider'}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex gap-2 mt-3">
            {STEP_ORDER.map((s, i) => {
              const active = s === step;
              const done = STEP_ORDER.indexOf(step) > i;
              return (
                <div key={s} className="flex-1 text-center">
                  <div
                    className="h-1 rounded-full mb-1.5 transition-colors"
                    style={{ background: active || done ? 'var(--teal)' : 'var(--border)' }}
                  />
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: active ? 'var(--teal)' : 'var(--ink3)' }}
                  >
                    {STEP_LABELS[s]}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
              <Icon name="alertTriangle" size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1 — Name */}
          {step === 'basics' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Company Okta"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">
                  Which Identity Provider is this?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SAML_VENDOR_GUIDES) as Array<keyof typeof SAML_VENDOR_GUIDES>).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVendor(v)}
                      className={`p-3 rounded-lg border text-left text-xs font-bold transition-all ${
                        vendor === v
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {SAML_VENDOR_GUIDES[v].label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Customizes the guided configuration steps for your vendor. Underneath, every provider speaks standard SAML 2.0.
                </p>
              </div>
            </div>
          )}

          {/* Step 2 — Your Side */}
          {step === 'your-side' && provider && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Copy and paste these values into <strong>{SAML_VENDOR_GUIDES[vendor].label}</strong>:
              </p>
              <CopyRow label="ACS / Reply URL (Single Sign-On URL)" value={acsUrl} />
              <CopyRow label="Entity ID / Audience URI" value={metadataUrl} />

              <div className="p-3.5 bg-muted/50 rounded-lg border border-border">
                <div className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">
                  In {SAML_VENDOR_GUIDES[vendor].label}:
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-muted-foreground">
                  {SAML_VENDOR_GUIDES[vendor].steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Step 3 — Their Side */}
          {step === 'their-side' && provider && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Paste the connection credentials provided by {SAML_VENDOR_GUIDES[vendor].label}:
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">
                  IdP Entity ID / Issuer <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  value={idpEntityId}
                  onChange={e => setIdpEntityId(e.target.value)}
                  placeholder="https://your-idp.example.com/entity"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">
                  IdP SSO / Login URL <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  value={idpSsoUrl}
                  onChange={e => setIdpSsoUrl(e.target.value)}
                  placeholder="https://your-idp.example.com/sso"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/85 block">
                  IdP Signing Certificate (X.509 PEM) <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={idpCertificate}
                  onChange={e => setIdpCertificate(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  className="w-full h-24 p-2 font-mono text-xs rounded-md border border-border bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          {/* Step 4 — Test & Finish */}
          {step === 'test' && provider && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2 text-green-700 dark:text-green-300 text-xs font-bold">
                <Icon name="checkCircle" size={16} />
                <span>Both sides of the SAML trust are configured.</span>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Verify with a test sign-in before enabling for your workspace members:
                </p>
                <a
                  href={loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors"
                >
                  <Icon name="externalLink" size={14} /> Send Test Sign-In
                </a>
              </div>

              <label className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card cursor-pointer">
                <Checkbox checked={enabled} onCheckedChange={toggleEnabledHere} />
                <span className="text-xs text-foreground">
                  <strong>Enable this provider</strong> — members at your verified domain can sign in through it immediately.
                </span>
              </label>

              <CopyRow label="ACS / Reply URL" value={acsUrl} />
              <CopyRow label="Entity ID / Audience URI" value={metadataUrl} />
            </div>
          )}
        </DialogBody>

        <DialogFooter className="justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={step === 'basics' ? onClose : () => setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1])}
          >
            {step === 'basics' ? 'Cancel' : 'Back'}
          </Button>

          {step === 'basics' && (
            <Button type="button" onClick={createAndContinue} disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Continue'}
            </Button>
          )}

          {step === 'your-side' && (
            <Button type="button" onClick={() => setStep('their-side')}>
              I&apos;ve Done That — Continue
            </Button>
          )}

          {step === 'their-side' && (
            <Button
              type="button"
              onClick={saveIdpDetails}
              disabled={saving || !idpEntityId.trim() || !idpSsoUrl.trim() || !idpCertificate.trim()}
            >
              {saving ? 'Saving…' : 'Save & Continue'}
            </Button>
          )}

          {step === 'test' && (
            <Button type="button" onClick={() => { onSaved(); onClose(); }}>
              Finish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main OndiSSO Page Component ─────────────────────────────────────── */
export const OndiSSO: React.FC = () => {
  const { user } = useAuth();
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [clients, setClients] = useState<OauthClient[]>([]);
  const [samlSpClients, setSamlSpClients] = useState<SamlSpClient[]>([]);
  const [samlKeys, setSamlKeys] = useState<SamlIdpKey[]>([]);
  const [rotatingSamlKey, setRotatingSamlKey] = useState(false);
  const [samlKeyError, setSamlKeyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [samlWizard, setSamlWizard] = useState<SsoProvider | null | false>(false);
  const [samlWizardInitialName, setSamlWizardInitialName] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddSamlSp, setShowAddSamlSp] = useState(false);
  const [activeTab, setActiveTab] = useState<'registry' | 'flow'>('registry');

  const [searchParams] = useSearchParams();
  const canManageOutboundClients = user?.role === 'SUPER_ADMIN';
  const [subTab, setSubTab] = useState<'idps' | 'clients' | 'idp-clients'>(
    searchParams.get('tab') === 'clients' && canManageOutboundClients ? 'clients' : 'idps'
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);

  const entitlements = useEntitlements();
  const governanceEntitled = entitlements ? entitlements.features['ondi.governance'] !== false : true;

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/ondi/sso-providers')
      .then(setProviders)
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const reloadClients = useCallback(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      setClients([]);
      setLoadingClients(false);
      return;
    }
    setLoadingClients(true);
    apiFetch('/v1/ondi/oauth-clients')
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false));
  }, [user?.role]);

  const reloadSamlSpClients = useCallback(() => {
    apiFetch('/v1/ondi/saml/idp/clients').then(setSamlSpClients).catch(() => setSamlSpClients([]));
  }, []);

  const reloadSamlKeys = useCallback(() => {
    if (user?.role !== 'SUPER_ADMIN') return;
    apiFetch('/v1/ondi/saml/idp/keys')
      .then((result: any) => setSamlKeys(result.keys || []))
      .catch(() => setSamlKeys([]));
  }, [user?.role]);

  useEffect(() => {
    reload();
    reloadClients();
    reloadSamlSpClients();
    reloadSamlKeys();
  }, [reload, reloadClients, reloadSamlSpClients, reloadSamlKeys]);

  const [relatedAutomations, setRelatedAutomations] = useState<any[] | null>(null);
  const [sessionPolicy, setSessionPolicy] = useState<{ mfa_required: boolean } | null>(null);

  useEffect(() => {
    apiFetch('/v1/workflow-studio/apps').then((res: any) => {
      const all: any[] = Array.isArray(res) ? res : (res?.data ?? []);
      setRelatedAutomations(all.filter(a => OAUTH_TRIGGER_IDS.has(a.trigger_event)));
    }).catch(() => setRelatedAutomations([]));
    apiFetch('/v1/ondi/org/policies').then(setSessionPolicy).catch(() => setSessionPolicy(null));
  }, []);

  async function toggleEnabled(p: SsoProvider) {
    const enabled = !p.enabled;
    setProviders(prev => prev.map(x => x.id === p.id ? { ...x, enabled } : x));
    try {
      await apiFetch(`/v1/ondi/sso-providers/${p.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    } catch {
      reload();
    }
  }

  async function remove(id: string) {
    setProviders(prev => prev.filter(p => p.id !== id));
    try {
      await apiFetch(`/v1/ondi/sso-providers/${id}`, { method: 'DELETE' });
    } catch {
      reload();
    }
  }

  async function removeClient(id: string) {
    setClients(prev => prev.filter(c => c.id !== id));
    try {
      await apiFetch(`/v1/ondi/oauth-clients/${id}`, { method: 'DELETE' });
    } catch {
      reloadClients();
    }
  }

  async function removeSamlSpClient(id: string) {
    setSamlSpClients(prev => prev.filter(client => client.id !== id));
    try {
      await apiFetch(`/v1/ondi/saml/idp/clients/${id}`, { method: 'DELETE' });
    } catch {
      reloadSamlSpClients();
    }
  }

  async function rotateSamlKey() {
    if (!window.confirm('Rotate Ondi’s platform-wide SAML signing key? Existing certificates will remain published during the overlap period.')) return;
    setRotatingSamlKey(true);
    setSamlKeyError(null);
    try {
      await apiFetch('/v1/ondi/saml/idp/keys/rotate', { method: 'POST', body: '{}' });
      reloadSamlKeys();
    } catch (error) {
      setSamlKeyError(error instanceof Error ? error.message : 'Could not rotate SAML signing key.');
    } finally {
      setRotatingSamlKey(false);
    }
  }

  async function revokeSamlKey(kid: string) {
    if (!window.confirm('Remove this previous certificate from Ondi metadata? Service providers that have not trusted the new key may stop working.')) return;
    setSamlKeyError(null);
    try {
      await apiFetch(`/v1/ondi/saml/idp/keys/${encodeURIComponent(kid)}/revoke`, { method: 'POST', body: '{}' });
      reloadSamlKeys();
    } catch (error) {
      setSamlKeyError(error instanceof Error ? error.message : 'Could not revoke the SAML signing key.');
    }
  }

  function copyClientId(clientId: string) {
    navigator.clipboard.writeText(clientId);
    setCopiedClientId(clientId);
    setTimeout(() => setCopiedClientId(null), 2000);
  }

  // Filtered lists based on search
  const filteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(p => p.name.toLowerCase().includes(q) || p.provider_type.toLowerCase().includes(q));
  }, [providers, searchQuery]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(q) || c.client_id.toLowerCase().includes(q));
  }, [clients, searchQuery]);

  const filteredSamlSpClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return samlSpClients;
    return samlSpClients.filter(c => c.name.toLowerCase().includes(q) || c.entity_id.toLowerCase().includes(q));
  }, [samlSpClients, searchQuery]);

  const activeProvidersCount = providers.filter(p => p.enabled).length;

  return (
    <div className="ondi-page-container">
      {showAdd && (
        <AddProviderModal
          onClose={() => setShowAdd(false)}
          onAdded={reload}
          onStartSaml={(n) => {
            setShowAdd(false);
            setSamlWizardInitialName(n);
            setSamlWizard(null);
          }}
        />
      )}
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onAdded={reloadClients} />}
      {showAddSamlSp && <AddSamlSpModal onClose={() => setShowAddSamlSp(false)} onAdded={reloadSamlSpClients} />}
      {samlWizard !== false && (
        <SamlSetupWizard
          existing={samlWizard}
          initialName={samlWizard === null ? samlWizardInitialName : undefined}
          onClose={() => setSamlWizard(false)}
          onSaved={reload}
        />
      )}

      <PageHeader
        crumbs={['Ondi', 'SSO & Providers']}
        titlePlain="SSO "
        titleEm="architecture."
        subtitle="Identity provider registry, relying-party client applications, and SAML assertion authority."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                reload();
                reloadClients();
                reloadSamlSpClients();
                reloadSamlKeys();
              }}
              disabled={loading}
              className="h-9 px-3 gap-1.5"
              title="Refresh directory"
            >
              <Icon name="refresh" size={14} className={loading ? 'animate-spin text-teal-600' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {activeTab === 'registry' && (
              subTab === 'idps' ? (
                <Button
                  type="button"
                  onClick={() => governanceEntitled && setShowAdd(true)}
                  disabled={!governanceEntitled}
                  title={governanceEntitled ? undefined : 'Requires Enterprise Identity & Governance add-on'}
                  className="h-9 gap-1.5 shadow-sm"
                >
                  <Icon name="plus" size={15} />
                  <span>Add Provider</span>
                </Button>
              ) : subTab === 'clients' ? (
                <Button
                  type="button"
                  onClick={() => governanceEntitled && setShowAddClient(true)}
                  disabled={!governanceEntitled}
                  title={governanceEntitled ? undefined : 'Requires Enterprise Identity & Governance add-on'}
                  className="h-9 gap-1.5 shadow-sm"
                >
                  <Icon name="plus" size={15} />
                  <span>Add SSO Client</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => governanceEntitled && setShowAddSamlSp(true)}
                  disabled={!governanceEntitled}
                  className="h-9 gap-1.5 shadow-sm"
                >
                  <Icon name="plus" size={15} />
                  <span>Add SAML App</span>
                </Button>
              )
            )}
          </div>
        }
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        {/* Total Inbound Providers */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setActiveTab('registry'); setSubTab('idps'); }}
          onKeyDown={e => { if (e.key === 'Enter') { setActiveTab('registry'); setSubTab('idps'); } }}
          className={`ondi-kpi-card ${activeTab === 'registry' && subTab === 'idps' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Inbound IdPs</span>
            <div className="ondi-kpi-icon-box purple">
              <Icon name="logIn" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{providers.length}</span>
            <span className="ondi-kpi-sub">configured providers</span>
          </div>
        </div>

        {/* Active for Sign-in */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setActiveTab('registry'); setSubTab('idps'); }}
          onKeyDown={e => { if (e.key === 'Enter') { setActiveTab('registry'); setSubTab('idps'); } }}
          className={`ondi-kpi-card ${activeTab === 'registry' && subTab === 'idps' && activeProvidersCount > 0 ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Live for Sign-In</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="checkCircle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--green)' }}>{activeProvidersCount}</span>
            <span className="ondi-kpi-sub">active federation</span>
          </div>
        </div>

        {/* Outbound Clients */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (canManageOutboundClients) { setActiveTab('registry'); setSubTab('clients'); } }}
          onKeyDown={e => { if (e.key === 'Enter' && canManageOutboundClients) { setActiveTab('registry'); setSubTab('clients'); } }}
          className={`ondi-kpi-card ${activeTab === 'registry' && subTab === 'clients' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Outbound Clients</span>
            <div className="ondi-kpi-icon-box blue">
              <Icon name="share" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--blue)' }}>{clients.length}</span>
            <span className="ondi-kpi-sub">relying party apps</span>
          </div>
        </div>

        {/* SAML as IdP */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setActiveTab('registry'); setSubTab('idp-clients'); }}
          onKeyDown={e => { if (e.key === 'Enter') { setActiveTab('registry'); setSubTab('idp-clients'); } }}
          className={`ondi-kpi-card ${activeTab === 'registry' && subTab === 'idp-clients' ? 'is-active' : ''}`}
        >
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">SAML as IdP</span>
            <div className="ondi-kpi-icon-box gold">
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--gold)' }}>{samlSpClients.length}</span>
            <span className="ondi-kpi-sub">registered apps</span>
          </div>
        </div>
      </div>

      {!governanceEntitled && activeTab === 'registry' && (
        <div className="mb-4">
          <UpgradeNotice
            title="Enterprise Identity & Governance"
            message="Real SAML SSO federation and outbound OIDC clients require this add-on. Existing configured providers remain readable, but adding or editing credentials is gated."
          />
        </div>
      )}

      {/* Segmented Primary Tab Navigation */}
      <div className="ondi-nav-tabstrip" role="tablist" aria-label="SSO Navigation">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'registry'}
          className={`ondi-tab-btn ${activeTab === 'registry' ? 'active' : ''}`}
          onClick={() => setActiveTab('registry')}
        >
          <Icon name="server" size={14} />
          <span>Identity Providers</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'flow'}
          className={`ondi-tab-btn ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          <Icon name="layers" size={14} />
          <span>Sign-In Flow & Architecture</span>
        </button>
      </div>

      {/* ── Tab 1: Provider Registry ────────────────────────────────────────── */}
      {activeTab === 'registry' && (
        <div className="space-y-4">
          {/* Sub-tabs selection bar without 3D icons */}
          <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)} variant="pill">
            <TabsList>
              <TabsTrigger value="idps" className="gap-2">
                <Icon name="logIn" size={14} />
                <span>Inbound Identity Providers</span>
                <span className="ondi-tab-badge ml-1">{providers.length}</span>
              </TabsTrigger>

              {canManageOutboundClients && (
                <TabsTrigger value="clients" className="gap-2">
                  <Icon name="share" size={14} />
                  <span>Outbound SSO Clients</span>
                  <span className="ondi-tab-badge ml-1">{clients.length}</span>
                </TabsTrigger>
              )}

              <TabsTrigger value="idp-clients" className="gap-2">
                <Icon name="shield" size={14} />
                <span>Ondi as Identity Provider</span>
                <span className="ondi-tab-badge ml-1">{samlSpClients.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Sub-tab 1: Inbound IdPs */}
          {subTab === 'idps' && (
            <SectionCard padded={false} className="overflow-hidden border border-border shadow-sm">
              <div className="ondi-toolbar">
                <div className="ondi-search-input">
                  <Icon name="search" size={14} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search providers by name or type…"
                    aria-label="Search providers"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                      aria-label="Clear search"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Icon name="alertTriangle" size={13} className="text-amber-500" />
                  <span>Google, Microsoft & SAML connect to real Ondi Auth Server routes when enabled.</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="ondi-table">
                  <thead>
                    <tr>
                      <th>Provider Name</th>
                      <th>Type</th>
                      <th>Readiness</th>
                      <th>Status</th>
                      <th>Configured Date</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && filteredProviders.map(p => {
                      const isSaml = p.provider_type === 'SAML';
                      const needsSetup = isSaml && !samlConfigComplete(p);

                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="flex items-center gap-2.5 font-bold text-foreground">
                              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                <Icon name={getProviderIconName(p.provider_type)} size={16} />
                              </div>
                              <span>{p.name}</span>
                            </div>
                          </td>

                          <td>
                            <span className={getProviderBadgeClass(p.provider_type)}>
                              {p.provider_type}
                            </span>
                          </td>

                          <td>
                            {isSaml ? (
                              needsSetup ? (
                                <span className="ondi-status-pill warning">
                                  <span className="ondi-status-dot" />
                                  Needs Setup
                                </span>
                              ) : (
                                <span className="ondi-status-pill success">
                                  <span className="ondi-status-dot" />
                                  Ready
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground font-mono">—</span>
                            )}
                          </td>

                          <td>
                            <button
                              type="button"
                              onClick={() => toggleEnabled(p)}
                              disabled={needsSetup || !governanceEntitled}
                              title={needsSetup ? 'Finish setup before enabling' : !governanceEntitled ? 'Requires Enterprise Identity & Governance add-on' : undefined}
                              className={`ondi-status-pill ${p.enabled ? 'success' : 'gray'} cursor-pointer hover:opacity-80 transition-opacity`}
                            >
                              <span className="ondi-status-dot" />
                              {p.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                          </td>

                          <td className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmt(p.created_at)}
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div className="flex items-center justify-end gap-1.5">
                              {isSaml && (
                                needsSetup ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => governanceEntitled && setSamlWizard(p)}
                                    disabled={!governanceEntitled}
                                    className="h-7 text-xs font-bold text-teal-600 border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40"
                                  >
                                    Finish Setup
                                  </Button>
                                ) : (
                                  <Tip label="View connection details">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSamlWizard(p)}
                                      className="h-7 px-2 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                                    >
                                      <Icon name="link" size={13} />
                                    </Button>
                                  </Tip>
                                )
                              )}
                              <Tip label="Remove Provider">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => remove(p.id)}
                                  className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Icon name="trash" size={13} />
                                </Button>
                              </Tip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {!loading && filteredProviders.length === 0 && (
                  <div className="py-16 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-3">
                      <Icon name="logIn" size={20} />
                    </div>
                    <div className="text-sm font-bold text-foreground">No identity providers found</div>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      {searchQuery
                        ? 'No configured identity providers match your search.'
                        : 'Connect Google, Microsoft, or SAML 2.0 to allow workspace members to authenticate.'}
                    </p>
                    {!searchQuery && governanceEntitled && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowAdd(true)}
                        className="mt-4 text-xs font-bold gap-1.5"
                      >
                        <Icon name="plus" size={14} />
                        <span>Add First Provider</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Sub-tab 2: Outbound SSO Clients */}
          {subTab === 'clients' && (
            <div className="space-y-4">
              <SectionCard padded={false} className="overflow-hidden border border-border shadow-sm">
                <div className="ondi-toolbar">
                  <div className="ondi-search-input">
                    <Icon name="search" size={14} />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search client applications…"
                      aria-label="Search client applications"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                        aria-label="Clear search"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Icon name="shield" size={13} className="text-teal-600" />
                    <span>Registered clients initiate OAuth2/OIDC flows using PKCE or confidential client secrets.</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="ondi-table">
                    <thead>
                      <tr>
                        <th>Application</th>
                        <th>Client ID</th>
                        <th>Party Type</th>
                        <th>Auth Signature</th>
                        <th>Callback URIs</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loadingClients && filteredClients.map(c => {
                        const callbackList = Array.isArray(c.redirect_uris) ? c.redirect_uris : [];
                        return (
                          <tr key={c.id}>
                            <td>
                              <div className="flex items-center gap-2.5 font-bold text-foreground">
                                {c.logo_url ? (
                                  <img
                                    src={c.logo_url}
                                    alt=""
                                    className="w-7 h-7 rounded-md object-contain border border-border"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                                    <Icon name="globe" size={14} />
                                  </div>
                                )}
                                <span>{c.name}</span>
                              </div>
                            </td>

                            <td>
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-xs bg-muted/60 px-2 py-0.5 rounded border border-border text-foreground">
                                  {c.client_id}
                                </code>
                                <Tip label={copiedClientId === c.client_id ? 'Copied!' : 'Copy Client ID'}>
                                  <button
                                    type="button"
                                    onClick={() => copyClientId(c.client_id)}
                                    className="ondi-copy-btn"
                                  >
                                    <Icon
                                      name={copiedClientId === c.client_id ? 'check' : 'copy'}
                                      size={12}
                                      style={copiedClientId === c.client_id ? { color: 'var(--green)' } : undefined}
                                    />
                                  </button>
                                </Tip>
                              </div>
                            </td>

                            <td>
                              <span className={`ondi-status-pill ${c.first_party ? 'success' : 'gray'}`}>
                                <span className="ondi-status-dot" />
                                {c.first_party ? 'First Party' : 'Third Party'}
                              </span>
                            </td>

                            <td>
                              <span className={`ondi-status-pill ${c.client_secret_hash ? 'info' : 'warning'}`}>
                                <span className="ondi-status-dot" />
                                {c.client_secret_hash ? 'Confidential' : 'Public (PKCE)'}
                              </span>
                            </td>

                            <td className="max-w-[240px] truncate text-xs text-muted-foreground font-mono" title={callbackList.join(', ')}>
                              {callbackList.join(', ') || 'None configured'}
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <Tip label="Remove Client">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeClient(c.id)}
                                  className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Icon name="trash" size={13} />
                                </Button>
                              </Tip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {!loadingClients && filteredClients.length === 0 && (
                    <div className="py-16 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-3">
                        <Icon name="share" size={20} />
                      </div>
                      <div className="text-sm font-bold text-foreground">No SSO clients registered</div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        External web and mobile applications can register here to authenticate against Ondi.
                      </p>
                      {governanceEntitled && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowAddClient(true)}
                          className="mt-4 text-xs font-bold gap-1.5"
                        >
                          <Icon name="plus" size={14} />
                          <span>Register First Client</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Related Automation & Session Policy */}
              <SectionCard>
                <div className="flex items-center gap-3 mb-3.5">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="gitBranch" size={15} />
                  </FeaturedIcon>
                  <div>
                    <div className="text-sm font-bold text-foreground">Related Studio Automations</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Workflows triggered by OAuth client registration, consent granted, or consent revoked.
                    </p>
                  </div>
                </div>

                {relatedAutomations === null ? (
                  <SectionLoading />
                ) : relatedAutomations.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-1">
                    No Studio automation currently reacts to OAuth events.{' '}
                    <Link to="/studio/new" className="text-teal-600 font-bold hover:underline">
                      Build an automation in Studio →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {relatedAutomations.map((a) => (
                      <Link
                        key={a.id}
                        to={`/studio/w/${a.id}`}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                      >
                        <div>
                          <div className="text-xs font-bold text-foreground">{a.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.trigger_event === 'ondi.oauth_client_registered'
                              ? 'Fires on client registration'
                              : a.trigger_event === 'ondi.oauth_consent_granted'
                              ? 'Fires on consent granted'
                              : 'Fires on consent revoked'}
                          </div>
                        </div>
                        <Badge variant={a.status === 'ACTIVE' ? 'success' : a.status === 'PAUSED' ? 'warning' : 'gray'}>
                          {a.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}

                {sessionPolicy && (
                  <div className="mt-4 pt-3.5 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      Workspace Sign-In Policy — Multi-Factor Authentication (MFA)
                    </span>
                    <div className="flex items-center gap-2.5">
                      <Badge variant={sessionPolicy.mfa_required ? 'success' : 'gray'}>
                        {sessionPolicy.mfa_required ? 'MFA Required' : 'MFA Optional'}
                      </Badge>
                      <Link to="/ondi/policies" className="text-xs font-bold text-teal-600 hover:underline">
                        Manage Policy →
                      </Link>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* Sub-tab 3: Ondi as Identity Provider */}
          {subTab === 'idp-clients' && (
            <div className="space-y-4">
              <SectionCard padded={false} className="overflow-hidden border border-border shadow-sm">
                <div className="p-4 px-5 border-b border-border">
                  <div className="text-sm font-bold text-foreground">
                    SAML Relying Party Applications ({samlSpClients.length})
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Ondi signs SAML assertions for applications registered below using your tenant signing certificate.
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="ondi-table">
                    <thead>
                      <tr>
                        <th>Application</th>
                        <th>SP Entity ID</th>
                        <th>Assertion Status</th>
                        <th>Metadata Document</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSamlSpClients.map(client => (
                        <tr key={client.id}>
                          <td className="font-bold text-foreground">
                            <div className="flex items-center gap-2">
                              <Icon name="shield" size={15} className="text-teal-600" />
                              <span>{client.name}</span>
                            </div>
                          </td>
                          <td className="text-xs text-muted-foreground font-mono max-w-[320px] truncate" title={client.entity_id}>
                            {client.entity_id}
                          </td>
                          <td>
                            <span className={`ondi-status-pill ${client.enabled ? 'success' : 'gray'}`}>
                              <span className="ondi-status-dot" />
                              {client.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td>
                            <a
                              href={`${BASE_URL}/v1/ondi/saml/idp/${client.id}/metadata`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:underline"
                            >
                              <Icon name="download" size={12} />
                              <span>Download XML</span>
                            </a>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeSamlSpClient(client.id)}
                              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Icon name="trash" size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {samlSpClients.length === 0 && (
                    <div className="py-16 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-3">
                        <Icon name="shield" size={20} />
                      </div>
                      <div className="text-sm font-bold text-foreground">No SAML applications connected</div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        Register external service providers to enable single sign-on with Ondi as the Identity Provider.
                      </p>
                      {governanceEntitled && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowAddSamlSp(true)}
                          className="mt-4 text-xs font-bold gap-1.5"
                        >
                          <Icon name="plus" size={14} />
                          <span>Register Application</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>

              {user?.role === 'SUPER_ADMIN' && (
                <SectionCard>
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">Ondi Platform Signing Keypair</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Rotations publish active and previous certificates concurrently to prevent downtime across connected service providers.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={rotateSamlKey}
                      disabled={rotatingSamlKey}
                      className="h-8 text-xs font-bold gap-1.5"
                    >
                      <Icon name="refresh" size={13} className={rotatingSamlKey ? 'animate-spin' : ''} />
                      <span>{rotatingSamlKey ? 'Rotating…' : 'Rotate Key'}</span>
                    </Button>
                  </div>

                  <div className="space-y-2 mt-2">
                    {samlKeyError && (
                      <div className="p-2.5 text-xs rounded bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
                        <Icon name="alertTriangle" size={14} />
                        <span>{samlKeyError}</span>
                      </div>
                    )}
                    {samlKeys.map(key => (
                      <div
                        key={key.kid}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <code className="font-mono text-muted-foreground">{key.kid}</code>
                          <Badge variant={key.status === 'active' ? 'success' : key.status === 'previous' ? 'warning' : 'gray'}>
                            {key.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                          {key.status === 'previous' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => revokeSamlKey(key.kid)}
                              className="h-6 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10 px-2"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {samlKeys.length === 0 && (
                      <div className="text-xs text-muted-foreground py-2">
                        The signing key is generated automatically when the first SAML metadata document is requested.
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Sign-In Flow & Architecture ──────────────────────────────── */}
      {activeTab === 'flow' && (
        <div className="space-y-4">
          <SectionCard title="Ondi OAuth2 / OIDC Authorization Code Flow with PKCE">
            <div className="p-2 space-y-6">
              {/* 5-step flow grid */}
              <div className="ondi-flow-grid">
                {[
                  { step: '01', title: 'Browser Hit', desc: 'Client application initiates login and redirects browser with PKCE code_challenge.', icon: 'globe' },
                  { step: '02', title: '/authorize', desc: 'Ondi authenticates user, verifies device trust, and handles user consent.', icon: 'lock' },
                  { step: '03', title: 'Auth Callback', desc: 'Browser receives authorization code at verified redirect URI.', icon: 'key' },
                  { step: '04', title: '/oauth/token', desc: 'Client backend exchanges authorization code + code_verifier for signed JWTs.', icon: 'server' },
                  { step: '05', title: 'JWKS Verify', desc: 'Relying party validates RS256 token signatures via Ondi public keyset.', icon: 'checkCircle' },
                ].map((s) => (
                  <div key={s.step} className="ondi-flow-step-card">
                    <div className="flex items-center justify-between">
                      <span className="ondi-flow-step-badge">STEP {s.step}</span>
                      <Icon name={s.icon as any} size={15} className="text-teal-600" />
                    </div>
                    <div className="ondi-flow-step-title">{s.title}</div>
                    <div className="ondi-flow-step-desc">{s.desc}</div>
                  </div>
                ))}
              </div>

              {/* Technical Specifications Deck */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800">
                      <Icon name="shield" size={15} />
                    </div>
                    <h4 className="text-sm font-bold text-foreground">Continuous Policy Decision Point (PDP)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    On every sensitive endpoint call, products query Ondi&apos;s Policy Decision Point (<code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border border-border">POST /authz/check</code>).
                    This verifies active device safety, hardware biometric posture, and minimum trust score, returning ALLOW, DENY, or STEP_UP.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
                      <Icon name="key" size={15} />
                    </div>
                    <h4 className="text-sm font-bold text-foreground">Session & JWT Token Claims</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Every issued token carries <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border border-border">sub</code> (the signed-in user ID) and <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border border-border">tenant_id</code> (their workspace).
                    Workspace legal entity verification is separately validated under Business Verification (KYB).
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default OndiSSO;
