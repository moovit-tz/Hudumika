import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { IconName } from '../../components/Icon.js';
import { getCompany, setCompany } from '../../data/companyStore.js';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { MetricsRow } from '../../components/MetricCard.js';
import type { MetricCardProps } from '../../components/MetricCard.js';
import { refreshTenantLocale } from '../../lib/tenantLocale.js';
import { pushTenantBranding, useBranding } from '../../hooks/useBranding.js';
import { useLocale } from '../../hooks/useLocale.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { Badge } from '../../components/ui/badge.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeatureToggleRow } from '../../components/ui/list-item-row.js';
import { SectionCard } from '../../components/SectionCard.js';
import { EntityPicker } from '../../components/EntityPicker.js';
import { Button } from '../../components/ui/button.js';
import { Switch } from '../../components/ui/switch.js';
import { LauncherAppSvg, LAUNCHER_APPS } from '../../components/LauncherApps.js';
import { SignaturePad } from '../../components/SignaturePad.js';
import { showAlert } from '../../lib/alert.js';
import { UpgradeNotice } from '../../components/UpgradeNotice.js';
import { showConfirm } from '../../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../../hooks/useEntitlements.js';
import { useAuth } from '../../hooks/useAuth.js';
import { APP_META } from '../Utilities.js';
import { AI_PROVIDERS } from '../../lib/aiProviders.js';
import { SettingsCtx, Toggle, Field, ToggleRow, Card, SaveRow, useFields, useSettingsFields } from './shared.js';

// -- section: Notifications --------------------------------------------------
export const NotificationsSection: React.FC = () => {
  const { s, save } = useContext(SettingsCtx);
  const [whatsapp, setWhatsapp] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [demurrageDays, setDemurrageDays] = useState(3);
  const [slaHours, setSlaHours] = useState(24);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s.notifications) {
      const d = s.notifications;
      setWhatsapp(d.whatsapp ?? true);
      setEmailNotifs(d.email ?? false);
      setDemurrageDays(d.demurrage_alert_days ?? 3);
      setSlaHours(d.sla_reminder_hours ?? 24);
      hydrated.current = true;
    }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('notifications', { whatsapp, email: emailNotifs, demurrage_alert_days: demurrageDays, sla_reminder_hours: slaHours }); } catch {}
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Channels" desc="Choose how your team and customers receive notifications">
        <ToggleRow label="WhatsApp Notifications" hint="Send stage updates via WhatsApp Business API · configure credentials in Integrations → SMS / WhatsApp" value={whatsapp} onChange={setWhatsapp} />
        <ToggleRow label="Email Notifications" hint="Send update emails · requires SMTP configured in General → Email" value={emailNotifs} onChange={setEmailNotifs} />
      </Card>
      <Card title="Alert Thresholds" desc="When to trigger proactive alerts for time-sensitive events">
        <Field label="Demurrage Alert Lead Time" hint="Days before container free time ends to trigger demurrage alert">
          <input type="number" min={1} max={30} className="input-field s-num-sm" value={demurrageDays} onChange={e => setDemurrageDays(Number(e.target.value))} />
        </Field>
        <Field label="SLA Breach Reminder" hint="Hours before SLA deadline to send reminder to assigned officer">
          <input type="number" min={1} max={168} className="input-field s-num-sm" value={slaHours} onChange={e => setSlaHours(Number(e.target.value))} />
        </Field>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- section: ClearOS / Freight app settings ---------------------------------
export const FreightSection: React.FC = () => {
  const { s, save } = useContext(SettingsCtx);
  const [freeTime, setFreeTime] = useState(7);
  const [autoRisk, setAutoRisk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (s.freight) {
      const d = s.freight;
      setFreeTime(d.free_time_days ?? 7);
      setAutoRisk(d.auto_risk_flags ?? true);
      hydrated.current = true;
    }
  }, [s]);

  async function handleSave() {
    setSaving(true);
    try { await save('freight', { free_time_days: freeTime, auto_risk_flags: autoRisk }); } catch {}
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Container & Demurrage" desc="Default thresholds for demurrage and risk calculation">
        <Field label="Default Container Free Time" hint="Days before demurrage charges begin">
          <input type="number" min={1} max={60} className="input-field s-num-sm" value={freeTime} onChange={e => setFreeTime(Number(e.target.value))} />
        </Field>
        <ToggleRow label="Auto Risk Flagging" hint="Automatically flag shipments that breach demurrage or SLA thresholds" value={autoRisk} onChange={setAutoRisk} />
      </Card>
      <Card title="Per-stage SLA" desc="Real, enforced SLA targets are set per clearance stage on each Workflow, not here.">
        <Link to="/studio/clearance" className="s-elsewhere-row">
          <div>
            <div className="s-elsewhere-label">ClearOS ▸ Workflow Builder</div>
            <div className="s-elsewhere-desc">Configure per-stage SLA hours on the workflow a shipment is actually assigned — this used to be a second, non-binding "reference" grid here that duplicated it.</div>
          </div>
          <Icon name="chevronRight" size={16} color="var(--ink3)" />
        </Link>
      </Card>
      <SaveRow saving={saving} saved={saved} onSave={handleSave} />
    </>
  );
};

// -- API Keys (developer / partner access) -----------------------------------
export const API_SCOPE_OPTIONS = [
  'ai', 'clearos', 'cloud', 'complyos', 'contacts', 'email', 'finops', 'ondi', 'nexushr', 'tracking',
  'finance.core', 'finance.accounting.advanced', 'finance.budgets', 'finance.fixed_assets',
  'finance.multi_currency', 'finance.inventory', 'finance.procurement', 'finance.pos', 'finance.consolidation',
];

export interface ApiKeyRow {
  id: string; name: string; key_prefix: string; scopes: string[];
  last_used_at: string | null; revoked_at: string | null; created_at: string;
}

// -- section: E-Sign (company stamp) -----------------------------------------
// The 'other-esign' nav entry existed with no case in renderSection below —
// it fell through to a placeholder GenericSection. This is the tenant's one
// company stamp (sign_stamps, owner_type='tenant' — migration 277), applied
// to documents by whoever has stamp access (role gate: M5) or via the
// generic cross-app stamp API (M6). A person's own personal signature is a
// separate, self-managed thing under their own NexusHR profile, not here.
export const EsignSection: React.FC = () => {
  const [stamp, setStamp] = useState<{ id: string; image_data: string; label: string | null } | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPad, setShowPad] = useState(false);

  useEffect(() => {
    apiFetch('/v1/sign/stamps/tenant').then(setStamp).catch(() => setStamp(null));
  }, []);

  async function handleCapture(dataUrl: string) {
    setSaving(true);
    try {
      const row = await apiFetch('/v1/sign/stamps/tenant', { method: 'PUT', body: JSON.stringify({ image_data: dataUrl }) });
      setStamp(row);
      setShowPad(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Remove the company stamp? Anyone applying a tenant stamp to a document will no longer have one until a new one is saved.')) return;
    await apiFetch('/v1/sign/stamps/tenant', { method: 'DELETE' });
    setStamp(null);
  }

  return (
    <>
      <Card title="Company Stamp" desc="The one official stamp your team applies to documents through Hudumika eSign — visible on any envelope or cross-app document a person with stamp access signs on the company's behalf.">
        {stamp === undefined ? (
          <SectionLoading />
        ) : stamp && !showPad ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Square, not the old 160×90 letterbox — a round or circular
                stamp (the common case) needs equal width and height to show
                at a legible size instead of being shrunk to fit a short box. */}
            <div style={{ width: 160, height: 160, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <img src={stamp.image_data} alt="Company stamp" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => setShowPad(true)}>Replace</Button>
              <Button variant="outline" size="sm" onClick={handleRemove} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>Remove</Button>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <SignaturePad onCapture={handleCapture} kind="stamp" />
            {stamp && <Button variant="ghost" size="sm" onClick={() => setShowPad(false)} style={{ marginTop: 8 }}>Cancel</Button>}
          </div>
        )}
      </Card>
      {saving && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 8 }}>Saving…</div>}
      {saved && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 8 }}>Saved.</div>}
      <Card title="Who can apply the stamp">
        <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
          Managed from NexusHR ▸ <Link to="/nexushr/roles" style={{ color: 'var(--blue)' }}>Roles &amp; Permissions</Link> — the platform's real access-control page, not a second copy of it here.
        </div>
      </Card>
    </>
  );
};

export const ApiKeysSection: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ total_calls: number; error_calls: number; top_endpoints: { endpoint: string; count: number }[] } | null>(null);

  function reload() {
    apiFetch('/v1/api-keys').then(res => setKeys(res.keys || [])).finally(() => setLoading(false));
    apiFetch('/v1/api-keys/usage').then(setUsage).catch(() => {});
  }
  useEffect(() => { reload(); }, []);

  function toggleScope(scope: string) {
    setNewScopes(prev => {
      if (prev.includes(scope)) {
        return scope === 'finops'
          ? prev.filter(item => item !== 'finops' && !item.startsWith('finance.'))
          : prev.filter(item => item !== scope);
      }
      if (scope.startsWith('finance.')) return [...new Set([...prev, 'finops', scope])];
      return [...prev, scope];
    });
  }

  async function createKey() {
    if (!newName.trim() || newScopes.length === 0) return;
    setCreating(true);
    try {
      const res = await apiFetch('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: newName.trim(), scopes: newScopes }) });
      setMintedKey(res.key);
      setNewName(''); setNewScopes([]);
      reload();
    } catch (err: any) {
      showAlert(`Failed to create key: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!(await showConfirm('Revoke this API key? Any application using it will immediately lose access.', { confirmLabel: 'Revoke' }))) return;
    await apiFetch(`/v1/api-keys/${id}`, { method: 'DELETE' });
    setKeys(prev => prev.map(k => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k));
  }

  return (
    <>
      <Card title="API Keys" desc="Programmatic access for partner integrations and scripts. Each key is scoped to specific features and limited by your plan." action={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} data-ui-native-button="">
          <Icon name="plus" size={13} /> New Key
        </button>
      }>
        <div className="s-fld--full">
          {loading ? (
            <SectionLoading />
          ) : keys.length === 0 ? (
            <p style={{ color: 'var(--ink3)' }}>No API keys yet. Create one to get started.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Name', 'Key', 'Scopes', 'Last Used', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: 'var(--ink)' }}>{k.name}</td>
                    <td style={{ padding: '8px', fontFamily: 'var(--font)', color: 'var(--ink3)' }}>{k.key_prefix}…</td>
                    <td style={{ padding: '8px', color: 'var(--ink2)' }}>{k.scopes.join(', ')}</td>
                    <td style={{ padding: '8px', color: 'var(--ink3)' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-sm)', color: k.revoked_at ? 'var(--red)' : 'var(--green)', background: k.revoked_at ? 'var(--red-l)' : 'var(--green-l)' }}>
                        {k.revoked_at ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {!k.revoked_at && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => revokeKey(k.id)} data-ui-native-button="">Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {usage && (
        <Card title="Usage (last 30 days)" desc="Calls made across all of this tenant's API keys and sessions.">
          <div className="s-fld--full" style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
            <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{usage.total_calls}</div><div style={{ fontSize: 11, color: 'var(--ink3)' }}>Total calls</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{usage.error_calls}</div><div style={{ fontSize: 11, color: 'var(--ink3)' }}>Errors</div></div>
          </div>
          {usage.top_endpoints.length > 0 && (
            <div className="s-fld--full">
              {usage.top_endpoints.map(e => (
                <div key={e.endpoint} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--ink2)', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font)' }}>{e.endpoint}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setMintedKey(null); }}>
          <div className="card" style={{ width: 440, padding: 26 }} onClick={e => e.stopPropagation()}>
            {mintedKey ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Key created</div>
                <p style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>Copy this now · it won't be shown again.</p>
                <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 12, wordBreak: 'break-all', marginBottom: 16 }}>{mintedKey}</div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setShowCreate(false); setMintedKey(null); }} data-ui-native-button="">Done</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>New API Key</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Name</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Warehouse integration" className="input-field" style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Scopes</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
                    {API_SCOPE_OPTIONS.map(scope => (
                      <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <Checkbox checked={newScopes.includes(scope)} onCheckedChange={() => toggleScope(scope)} />
                        {scope}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)} data-ui-native-button="">Cancel</button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={creating || !newName.trim() || newScopes.length === 0} onClick={createKey} data-ui-native-button="">
                    {creating ? 'Creating…' : 'Create Key'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// -- generic fallback --------------------------------------------------------
export const GenericSection: React.FC<{ title: string }> = ({ title }) => (
  <Card title={title}>
    <div className="s-fld--full s-gen-body">
      <div className="s-gen-icon-wrap">
        <div className="s-gen-icon">
          <Icon name="settings" size={26} strokeWidth={1.6} color="var(--ink3)" />
        </div>
      </div>
      <div className="s-gen-title">Configuration pending</div>
      <div className="s-gen-sub">This section will be available in an upcoming release.</div>
    </div>
  </Card>
);

/**
 * Where the finance configuration actually lives.
 *
 * This screen used to carry its own Tax Rates, Currencies, Quotations and
 * Purchase Orders panels. All four saved to keys nothing in the platform ever
 * read, while the real implementations sat in FinOps the whole time — so an
 * admin could spend an afternoon configuring tax rates here and change nothing.
 * Four dead panels replaced by four working links.
 */
export const ElsewhereSection: React.FC = () => (
  <Card title="Finance setup" desc="These are configured in FinOps, where they take effect.">
    <div className="s-elsewhere">
      {[
        { to: '/finance/tax-codes',       label: 'Tax codes & rates',  desc: 'Duty and VAT codes used by declarations, invoices and landed cost.' },
        { to: '/finance/quotations',      label: 'Quotations',         desc: 'Templates, numbering and validity for customer quotes.' },
        { to: '/finance/purchase-orders', label: 'Purchase orders',    desc: 'Approval flow and numbering for POs.' },
        { to: '/finance/expenses/categories', label: 'Expense categories', desc: 'The categories expenses are booked against.' },
      ].map(item => (
        <Link key={item.to} to={item.to} className="s-elsewhere-row">
          <div>
            <div className="s-elsewhere-label">{item.label}</div>
            <div className="s-elsewhere-desc">{item.desc}</div>
          </div>
          <Icon name="chevronRight" size={16} color="var(--ink3)" />
        </Link>
      ))}
    </div>
  </Card>
);