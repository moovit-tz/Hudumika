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

// -- Settings API context ---------------------------------------------------
export interface SettingsCtxType {
  s: Record<string, any>;
  /** `replace` sends $replace for sections whose payload is the complete set. */
  save: (key: string, data: Record<string, any>, opts?: { replace?: boolean }) => Promise<void>;
}
export const SettingsCtx = createContext<SettingsCtxType>({ s: {}, save: async () => {} });

// -- nav structure ------------------------------------------------------------
// Exported: AdminShell.tsx builds the main app sidebar's Settings entries
// straight from this array (one expandable top-level item per group) rather
// than hand-duplicating the same list in two places. This used to be 8
// groups, several down to a single item after the DEAD/STUB cleanup below —
// regrouped into 5 properly populated categories instead of leaving
// one-item groups (Platform, Sales, App Settings, Other) standing alone.
export const NAV: Array<{ group: string; icon: IconName; items: Array<{ key: string; label: string; icon: IconName }> }> = [
  { group: 'General', icon: 'settings', items: [
    { key: 'company',            label: 'Company Information',  icon: 'building'      },
    { key: 'localization',       label: 'Localization',         icon: 'globe'         },
    { key: 'landing-experience', label: 'Landing Experience',   icon: 'layoutDashboard' },
    // 'branding' removed as its own nav entry — merged into Company
    // Information's "Company Branding" card (workspace name/colour/logo/
    // favicon, all in one place; see CompanySection). ?s=branding still
    // resolves, via renderSection's redirect below, so old links don't 404.
    { key: 'modules',            label: 'Modules & Extensions', icon: 'grid'          },
    { key: 'email',              label: 'Email',                icon: 'mail'          },
    { key: 'notifications',      label: 'Notifications',        icon: 'bell'          },
    { key: 'communications',     label: 'Communications',       icon: 'zap'           },
  ]},
  { group: 'Finance', icon: 'dollarSign', items: [
    { key: 'finance-general',    label: 'General',              icon: 'dollarSign'    },
    // Now the real source of truth for Petti's wallet gateway and the
    // onboarding charge flow — see lib/payment-gateway.ts. Payment Modes
    // and e-Invoice were removed: no component, no backend, gated nothing.
    { key: 'payment-gateways',   label: 'Payment Gateways',     icon: 'creditCard'    },
    { key: 'invoices',           label: 'Invoices',             icon: 'fileText'      },
    // Tax rates, quotations, purchase orders and currencies each had a panel
    // here that saved to a key nothing read, while the real implementations
    // live in FinOps. One control per thing; this one points at it.
    // Expense Categories used to be its own entry too — unlike its siblings
    // it was genuinely live (FinanceExpenseNew.tsx really reads this key),
    // so it moved rather than got deleted: FinOps ▸ Expenses ▸ Manage
    // Categories (/finance/expenses/categories), same underlying data,
    // reachable from where it's actually used. The row below still points
    // there for anyone who lands here first.
    { key: 'elsewhere',          label: 'Finance setup',        icon: 'externalLink' },
    // Credit Notes and Subscriptions removed: no component, no backend —
    // real credit-note/subscription concepts live elsewhere (Customers,
    // seal-billing, SuperAdmin's Company Subscriptions), not this key.
  ]},
  // "Configure Features" (Customers/Tasks/Support/Leads) removed. Tasks,
  // Support and Leads had no component or backend at all. Customers' one
  // real, enforced toggle (Enable Customer Portal) moved to NexusHR ▸ Team
  // ▸ People, per the "control access from Team" decision — the rest of
  // that panel (self-registration, VAT field, groups) either gated a
  // feature that doesn't exist (no customer self-signup route anywhere) or
  // was write-only with no consumer, so it didn't move with it.
  { group: 'Apps', icon: 'package', items: [
    { key: 'app-freight',        label: 'ClearOS / Freight',    icon: 'package'       },
    // Calendar, PDF and Tags removed: no component, no backend (PDF's
    // "engine: wkhtmltopdf" option didn't even match how this platform
    // actually generates PDFs — pdfkit, everywhere).
    { key: 'other-esign',        label: 'E-Sign',               icon: 'stamp'         },
  ]},
  { group: 'Integrations', icon: 'globe', items: [
    { key: 'int-google',         label: 'Google',               icon: 'globe'         },
    // Own OAuth app, same reasoning as mail-oauth.routes.ts/calendar-sync.routes.ts
    // each registering their own — this one backs contacts-sync.routes.ts's
    // real Outlook/Microsoft 365 contact sync (Contacts app ▸ Outlook sync).
    { key: 'int-microsoft',      label: 'Microsoft',            icon: 'globe'         },
    // 'int-ai' and 'int-openai' were two NAV rows pointing at the exact same
    // component and the exact same settings key (OpenAISection / 'int-ai')
    // — not two settings, one form shown twice. Kept the one label that
    // doesn't imply a specific provider, since the model picker inside
    // isn't OpenAI-only.
    { key: 'int-ai',             label: 'AI Integration',       icon: 'sparkle'       },
    // SMS only: no tenant-level WhatsApp credential exists anywhere in the
    // platform — whatsapp.ts always uses the platform-wide META_* env vars,
    // and the tenant-override params it accepts have no caller. This label
    // used to claim a WhatsApp config that didn't exist here or anywhere.
    { key: 'int-sms',            label: 'SMS',                  icon: 'messageSquare' },
    { key: 'int-tancis',         label: 'TRA VFD / EFDMS',      icon: 'anchor'        },
    // 'int-tpa' (TPA Port Authority) removed: no component (fell through to
    // the "Configuration pending" placeholder), no backend, and no real TPA
    // API integration anywhere in the platform to eventually back it with —
    // same category as the other dead placeholders already removed.
    { key: 'int-shipsgo',        label: 'ShipsGo / Ship24',     icon: 'compass'       },
    { key: 'int-gpswox',         label: 'GPSWOX Fleet Tracking', icon: 'mapPin'       },
    // MinIO, Redis/BullMQ and the vague "General" tab are removed. They are
    // platform infrastructure — the object store and the queue backend the
    // operator configures with REDIS_URL and S3 env vars — not tenant settings.
    // Nothing read them from a tenant's settings, and a tenant admin has no
    // business configuring the platform's message queue; a settings tab for it
    // is a category error, not just a dead stub.
  ]},
  { group: 'Developer', icon: 'key', items: [
    { key: 'developer-api',      label: 'API Keys',             icon: 'key'           },
    // SIEM Export moved off this sidebar — it streams Ondi's own security
    // audit chain (ondi_auth_events), so Ondi's own nav is where a security
    // engineer configuring it actually looks, not tenant billing settings.
    // The section itself (SiemExportSection below) didn't move — same
    // /v1/settings-backed key, still reachable at ?s=siem-export — only the
    // sidebar entry did. See OndiShell.tsx's Business nav.
  ]},
];

// -- primitives -------------------------------------------------------------
export const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`s-tog${value ? ' s-tog--on' : ''}`}
    title={value ? 'Disable' : 'Enable'}
    disabled={disabled}
   data-ui-native-button="">
    <span className="s-tog-label"><span>{value ? 'On' : 'Off'}</span></span>
    <span className="s-tog-thumb" />
  </button>
);

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; full?: boolean }> = ({ label, hint, children, full }) => (
  <div className={full ? 's-fld s-fld--full' : 's-fld'}>
    <label className="s-fld-lbl">{label}</label>
    {children}
    {hint && <p className="s-fld-hint">{hint}</p>}
  </div>
);

export const ToggleRow: React.FC<{ label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, hint, value, onChange }) => (
  <div className="s-tog-row">
    <div>
      <div className="s-tog-row-lbl">{label}</div>
      {hint && <div className="s-tog-row-hint">{hint}</div>}
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

export const Card: React.FC<{ title: string; desc?: string; children: React.ReactNode; twoCol?: boolean; action?: React.ReactNode }> = ({ title, desc, children, twoCol, action }) => (
  <div className="s-card">
    <div className={`s-card-hdr${action ? ' s-card-hdr--row' : ''}`}>
      <div>
        <h3 className="s-card-title">{title}</h3>
        {desc && <p className="s-card-desc">{desc}</p>}
      </div>
      {action}
    </div>
    <div className={`s-card-grid${twoCol ? ' s-card-grid--2' : ''}`}>
      {children}
    </div>
  </div>
);

export const SaveRow: React.FC<{ extra?: React.ReactNode; onSave?: () => void; saving?: boolean; saved?: boolean }> = ({ extra, onSave, saving, saved }) => (
  <div className="s-save-row">
    {saved && <span className="s-save-ok"><Icon name="check" size={13} color="var(--green)" /> Saved</span>}
    {extra}
    <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving} data-ui-native-button="">
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  </div>
);

// -- helpers -----------------------------------------------------------------
export function useFields<T extends Record<string, string>>(init: T): [T, (k: keyof T, v: string) => void] {
  const [f, setF] = useState<T>(init);
  const set = (k: keyof T, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return [f, set];
}

/** Like useFields, but re-syncs its initial values from the already-saved
 * settings blob (SettingsCtx's `s[key]`) the first time it becomes available —
 * fixes every section that "saves successfully" but always shows hardcoded
 * defaults again on reload, because plain useState(init) only reads its
 * initializer once and `s` arrives asynchronously after GET /v1/settings resolves. */
export function useSettingsFields<T extends Record<string, string>>(key: string, defaults: T): [T, (k: keyof T, v: string) => void] {
  const { s } = useContext(SettingsCtx);
  const [f, setF] = useState<T>(defaults);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    if (s[key]) { setF(prev => ({ ...prev, ...s[key] })); hydrated.current = true; }
  }, [s, key]);
  const set = (k: keyof T, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return [f, set];
}