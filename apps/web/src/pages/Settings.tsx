import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react';
import { useSearchParams, Link, Navigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { getCompany, setCompany } from '../data/companyStore.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { MetricsRow } from '../components/MetricCard.js';
import type { MetricCardProps } from '../components/MetricCard.js';
import { refreshTenantLocale } from '../lib/tenantLocale.js';
import { pushTenantBranding, useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import type { SupportedLocale } from '../i18n/index.js';
import './Settings.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { ColorSwatchPicker } from '../components/ui/color-swatch-picker.js';
import { Badge } from '../components/ui/badge.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeatureToggleRow } from '../components/ui/list-item-row.js';
import { SectionCard } from '../components/SectionCard.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { Button } from '../components/ui/button.js';
import { Switch } from '../components/ui/switch.js';
import { LauncherAppSvg, LAUNCHER_APPS } from '../components/LauncherApps.js';
import { SignaturePad } from '../components/SignaturePad.js';
import { showAlert } from '../lib/alert.js';
import { UpgradeNotice } from '../components/UpgradeNotice.js';
import { showConfirm } from '../lib/confirm.js';
import { useEntitlements, resetEntitlementsCache } from '../hooks/useEntitlements.js';
import { useAuth } from '../hooks/useAuth.js';
import { APP_META } from './Utilities.js';
import { AI_PROVIDERS } from '../lib/aiProviders.js';

// -- settings submodule imports ------------------------------------------------
export { NAV } from './settings/shared.js';
import { SettingsCtx, NAV, type SettingsCtxType } from './settings/shared.js';
import {
  CompanySection,
  LocationsSection,
  LocalizationSection,
  LandingExperienceSection,
  SiemExportSection,
  EmailSection,
} from './settings/workspace.js';
import {
  FinanceGeneralSection,
  InvoicesSection,
  QuotationsSection,
  PurchaseOrdersSection,
  PaymentGatewaysSection,
} from './settings/finance.js';
import {
  GoogleSection,
  MicrosoftSection,
  ShipsGoSection,
  GpswoxSection,
  OpenAISection,
  SMSSection,
  TRASection,
} from './settings/integrations.js';
import {
  MODULE_CATALOG,
  ModulesSection,
  AppLicensePanel,
} from './settings/modules.js';
import {
  NotificationsSection,
  FreightSection,
  EsignSection,
  ApiKeysSection,
  GenericSection,
  ElsewhereSection,
} from './settings/misc.js';
import { DataAccessSection } from './settings/data-access.js';

export function splitTitle(title: string): { plain: string; em: string } {
  const words = title.trim().split(/\s+/);
  if (words.length <= 1) return { plain: '', em: title.trim() };
  return { plain: words.slice(0, -1).join(' '), em: words[words.length - 1] };
}

/**
 * Two facts about this workspace, both counted.
 *
 * Replaces a five-tile strip of hardcoded values. Only what can be derived
 * appears — a figure nobody can check is worse than no figure.
 */
export const WorkspaceFacts: React.FC = () => {
  const entitlements = useEntitlements();
  const [integrations, setIntegrations] = useState<number | null>(null);

  useEffect(() => {
    apiFetch('/v1/settings')
      .then((r: any) => {
        const st = r?.settings ?? {};
        // An integration counts as configured when its section holds anything
        // beyond an off switch.
        const configured = Object.keys(st)
          .filter(k => k.startsWith('int-'))
          .filter(k => Object.keys(st[k] ?? {}).some(f => f !== 'on' && st[k][f]));
        setIntegrations(configured.length);
      })
      .catch(() => setIntegrations(null));
  }, []);

  // entitlements.features carries every plan-gated FeatureKey, which is
  // wider than "modules": tracking.cargo-loading/.warehouse/.analytics/
  // .reports and ondi.governance are sub-features of the tracking and ondi
  // apps, not separate modules — counting them here inflated both the
  // enabled and total figures against what Modules & Extensions actually
  // lists. Restricting to keys MODULE_CATALOG recognizes as a real app
  // keeps this stat and that page's own count in agreement by construction.
  const features = entitlements?.features ?? null;
  const moduleKeys = features ? Object.keys(features).filter(k => k in MODULE_CATALOG) : [];
  const enabled = features ? moduleKeys.filter(k => features[k]).length : null;
  const total = features ? moduleKeys.length : null;

  return (
    <div className="sett-strip">
      <div className="sett-strip-item">
        <div className="sett-strip-icon sett-strip-icon--t">
          <Icon name="grid" size={14} color="var(--teal)" />
        </div>
        <div className="sett-strip-info">
          <div className="sett-strip-val">{enabled === null ? '—' : `${enabled} / ${total}`}</div>
          <div className="sett-strip-label">Modules enabled</div>
        </div>
      </div>
      <div className="sett-strip-item">
        <div className="sett-strip-icon sett-strip-icon--bg">
          <Icon name="zap" size={14} color="var(--ink2)" />
        </div>
        <div className="sett-strip-info">
          <div className="sett-strip-val">{integrations === null ? '—' : integrations}</div>
          <div className="sett-strip-label">Integrations configured</div>
        </div>
      </div>
    </div>
  );
};

// -- section routing ---------------------------------------------------------
export function renderSection(key: string): React.ReactNode {
  switch (key) {
    case 'company':             return <CompanySection />;
    case 'locations':           return <LocationsSection />;
    case 'elsewhere':           return <ElsewhereSection />;
    // Merged into Company Information's own "Company Branding" card.
    case 'branding':            return <CompanySection />;
    case 'localization':        return <LocalizationSection />;
    case 'landing-experience':  return <LandingExperienceSection />;
    case 'email':               return <EmailSection />;
    case 'notifications':       return <NotificationsSection />;
    // Event emails are managed with their templates in the Email app; the
    // old ?s=communications link lands there instead of on a dead section.
    case 'communications':      return <Navigate to="/email/templates?tab=events" replace />;
    case 'app-freight':         return <FreightSection />;
    case 'finance-general':     return <FinanceGeneralSection />;
    case 'invoices':            return <InvoicesSection />;
    case 'quotations':          return <QuotationsSection />;
    case 'purchase-orders':     return <PurchaseOrdersSection />;
    // Both superseded by real FinOps features (tax codes/rates now live at
    // /finance/tax-codes; currency display used a hardcoded, never-updated
    // exchange-rate table where fx_rates.service.ts's real synced rates now
    // apply) — removed from NAV for that reason, but the switch case here
    // still rendered the old editable form to anyone who kept the ?s= link
    // or typed it in, letting them "save" numbers nothing downstream reads.
    case 'tax-rates':           return <ElsewhereSection />;
    case 'payment-gateways':    return <PaymentGatewaysSection />;
    // Moved to FinOps ▸ Expenses ▸ Manage Categories (/finance/expenses/
    // categories) — same underlying tenant_settings key, real page now.
    case 'expenses-categories': return <ElsewhereSection />;
    case 'int-google':          return <GoogleSection />;
    case 'int-microsoft':       return <MicrosoftSection />;
    // No Pusher integration exists anywhere in the backend — never had a
    // real reader, removed from NAV, but the switch case kept rendering the
    // editable App ID/Key/Secret form to anyone who reached it by URL.
    case 'int-shipsgo':         return <ShipsGoSection />;
    case 'int-gpswox':          return <GpswoxSection />;
    case 'int-ai':               return <OpenAISection />;
    case 'int-sms':             return <SMSSection />;
    case 'int-tancis':          return <TRASection />;
    case 'other-esign':         return <EsignSection />;
    case 'modules':             return <ModulesSection />;
    case 'data-access':         return <DataAccessSection />;
    case 'developer-api':       return <ApiKeysSection />;
    case 'siem-export':         return <SiemExportSection />;
    default: {
      const label = NAV.flatMap(g => g.items).find(i => i.key === key)?.label ?? key;
      return <GenericSection title={label} />;
    }
  }
}

export function getSectionTitle(key: string): string {
  if (key === 'modules') return 'Modules & Extensions';
  // No longer its own NAV entry — see renderSection's redirects.
  if (key === 'branding') return 'Company Information';
  if (key === 'expenses-categories') return 'Finance setup';
  return NAV.flatMap(g => g.items).find(i => i.key === key)?.label ?? 'Settings';
}

// -- main export -------------------------------------------------------------
export const Settings: React.FC = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const current = searchParams.get('s') ?? 'company';
  const [globalSettings, setGlobalSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    apiFetch('/v1/settings')
      .then((d: any) => { if (d?.settings) setGlobalSettings(d.settings); })
      .catch(() => {});
  }, []);

  /**
   * Save one section.
   *
   * The endpoint merges by default, so a section that sends only the fields it
   * owns no longer wipes the rest of its object. `replace` is for the sections
   * whose payload genuinely is the complete set — payment gateways omits the
   * disabled ones rather than sending false, so merging would leave a
   * switched-off gateway on.
   */
  const saveSection = async (key: string, data: Record<string, any>, opts?: { replace?: boolean }) => {
    await apiFetch('/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify(opts?.replace ? { [key]: data, $replace: [key] } : { [key]: data }),
    });
    setGlobalSettings(prev => ({ ...prev, [key]: data }));
  };

  const sectionTitle = getSectionTitle(current);
  const { plain, em } = splitTitle(sectionTitle);

  const getSubtitle = (key: string): string => {
    switch (key) {
      case 'modules':
        return 'Manage active applications, license assignments, and access policies for this workspace.';
      case 'company':
      case 'branding':
        return 'Organization identity, profile, and branding configuration.';
      case 'locations':
        return 'Branches, warehouses, and offices registered to this workspace.';
      case 'localization':
        return 'Configure workspace timezone, language, and regional preferences.';
      case 'landing-experience':
        return 'Customize default landing app and initial workspace overview.';
      case 'email':
        return 'SMTP credentials and outbound email dispatch settings.';
      case 'notifications':
        return 'Alert rules, notification channels, and operational thresholds.';
      case 'finance-general':
        return 'Finance defaults, fiscal calendar, and accounting preferences.';
      case 'payment-gateways':
        return 'Online payment providers and direct gateway integrations.';
      case 'invoices':
        return 'Invoice prefixing, numbering sequences, and payment terms.';
      case 'developer-api':
        return 'API keys, webhooks, and developer authorization credentials.';
      default:
        return 'Configure organization preferences and workspace controls.';
    }
  };

  return (
    <SettingsCtx.Provider value={{ s: globalSettings, save: saveSection }}>
      <div className="sett-page">
        {/* The house header, driven by the selected section */}
        <PageHeader
          crumbs={['Workspace', 'Settings']}
          titlePlain={plain}
          titleEm={em}
          subtitle={getSubtitle(current)}
        />

        {current === 'company' && <WorkspaceFacts />}

        {renderSection(current)}
      </div>
    </SettingsCtx.Provider>
  );
};