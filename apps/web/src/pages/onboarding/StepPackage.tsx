import { useLocale } from '../../hooks/useLocale.js';
import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { apiFetch } from '../../lib/api.js';
import type { StepProps } from './types.js';
import type { Package } from '@hudumika/types';

interface StandaloneProduct {
  product_key: string;
  name: string;
  description: string | null;
  pricing: { currency: string; price_flat_monthly: string | number | null; price_flat_annual: string | number | null } | null;
}

const CORE_APP_DISPLAY: Record<string, string> = {
  gereji: 'Gereji',
  seal: 'Seal',
  ngao: 'Ngao',
  projects: 'Projects',
  pos: 'POS',
  inventory: 'Inventory',
  sales: 'Sales',
  procurement: 'Procurement',
  warehouse: 'Warehouse',
  manufacturing: 'Manufacturing',
  cargotracker: 'CargoTracker',
  clearos: 'ClearOS',
  tuma: 'Tuma',
  fleet: 'Fleet',
  hudufreight: 'HuduFreight',
  lexcore: 'LexCore',
  compliance: 'Compliance',
  documents: 'Documents',
  billing: 'Billing',
  finance: 'Finance',
  property: 'Property',
  timesheet: 'Timesheets',
  hospitality: 'Hospitality',
  education: 'Education',
  insurance: 'Insurance',
  lending: 'Lending',
};

const PRODUCT_META: Record<string, { icon: 'shield' | 'lock' | 'truck' | 'globe' | 'shoppingCart' | 'layers'; category: string; bullets: string[] }> = {
  clearos: {
    icon: 'shield',
    category: 'Customs & Declarations',
    bullets: ['Direct TANCIS customs gateway', 'Automated customs declarations', 'Duty reconciliation & vouchers'],
  },
  seal: {
    icon: 'lock',
    category: 'Bonded Warehouse',
    bullets: ['Container & pallet tally sheets', 'Cargo containment monitoring', 'Release order audit trails'],
  },
  hudufreight: {
    icon: 'truck',
    category: 'Fleet & GPS Dispatch',
    bullets: ['Real-time vehicle GPS tracking', 'Trip logs & fuel monitoring', 'Automated driver dispatch'],
  },
  cargotracker: {
    icon: 'globe',
    category: 'Supply Chain Tracking',
    bullets: ['AWB & Ocean B/L tracking', 'Shipping line webhook updates', 'Demurrage detention countdown'],
  },
  pos: {
    icon: 'shoppingCart',
    category: 'Retail & Register',
    bullets: ['Multi-register fast checkout', 'Thermal & digital QR receipts', 'Offline sales & cash drawer sync'],
  },
};

interface MatrixCategory {
  title: string;
  icon: 'users' | 'layers' | 'truck' | 'creditCard' | 'sparkle' | 'shield';
  rows: {
    label: string;
    sublabel?: string;
    starter: string | boolean;
    business: string | boolean;
    scale: string | boolean;
  }[];
}

const COMPARISON_CATEGORIES: MatrixCategory[] = [
  {
    title: 'Users, Workspaces & Access',
    icon: 'users',
    rows: [
      { label: 'Included team members', sublabel: 'Direct user accounts with sovereign identity', starter: '2 users included', business: '8 users included', scale: '25 users included' },
      { label: 'Additional seat add-ons', sublabel: 'Add team members as your organization grows', starter: 'Add-on available', business: 'Add-on available', scale: 'Volume discount' },
      { label: 'Business locations & branches', sublabel: 'Separate sites, warehouses and branch offices', starter: '1 location', business: 'Up to 3 locations', scale: 'Up to 10 locations' },
      { label: 'Role-based access control (RBAC)', sublabel: 'Granular permissions per department and role', starter: 'Standard roles', business: 'Granular departmental RBAC', scale: 'Custom roles & enterprise policies' },
      { label: 'Multi-device sync & mobile access', sublabel: 'Real-time synchronization across devices', starter: true, business: true, scale: true },
    ],
  },
  {
    title: 'Cloud Storage & Document Vault',
    icon: 'layers',
    rows: [
      { label: 'Cloud Vault storage capacity', sublabel: 'Secure tamper-evident document storage', starter: '10 GB Cloud Vault', business: '50 GB Cloud Vault', scale: '250 GB Cloud Vault' },
      { label: 'OCR & Document AI extraction', sublabel: 'Automated invoice and declaration processing', starter: '100 docs / month', business: '500 docs / month', scale: 'High-throughput extraction' },
      { label: 'Document archiving & compliance history', sublabel: 'Regulatory retention for tax and customs audits', starter: '30 days', business: '1 year', scale: '7-year compliance audit vault' },
      { label: 'Tamper-evident audit log export', sublabel: 'Cryptographic proof of custody and changes', starter: false, business: true, scale: 'Priority exports & webhooks' },
    ],
  },
  {
    title: 'Trade, Logistics & Customs',
    icon: 'truck',
    rows: [
      { label: 'Monthly shipments & consignments', sublabel: 'Commercial freight and clearance declarations', starter: '100 shipments / mo', business: '500 shipments / mo', scale: '2,000 shipments / mo' },
      { label: 'Customs declaration & TANCIS integration', sublabel: 'Automated TRA customs clearance gateway', starter: 'Standard gateway', business: 'Fast-track sync', scale: 'Priority dispatch queue' },
      { label: 'Demurrage risk radar & detention alerts', sublabel: 'Predictive port and ICD storage cost protection', starter: false, business: 'Included (Real-time)', scale: 'Priority radar + multi-port' },
      { label: 'SEAL bonded warehouse management', sublabel: 'Cargo containment, tally sheets & release orders', starter: false, business: true, scale: 'Multi-terminal tracking' },
      { label: 'External cargo tracking (AWB / B/L)', sublabel: 'Real-time shipping line and airline tracking', starter: 'Optional add-on', business: true, scale: true },
    ],
  },
  {
    title: 'Finance, Point of Sale & Taxes',
    icon: 'creditCard',
    rows: [
      { label: 'Invoices, quotations & proforma generation', sublabel: 'Multi-currency invoicing with payment links', starter: true, business: true, scale: true },
      { label: 'Point of Sale (POS) retail registers', sublabel: 'Fast barcode scanning and thermal receipts', starter: '1 active register', business: 'Up to 3 registers', scale: 'Unlimited registers' },
      { label: 'EFD / VAT tax calculation & compliance', sublabel: 'Automated TRA VFD virtual fiscal device sync', starter: 'Standard EFD', business: 'Automated tax engine', scale: 'Multi-entity & automated filings' },
      { label: 'Vendor bills & procurement approvals', sublabel: 'Purchase orders, 3-way matching and approvals', starter: 'Basic billing', business: 'Approval workflows', scale: 'Multi-tiered governance' },
      { label: 'Inventory, batch/serial & manufacturing', sublabel: 'Stock valuation, FIFO, BOM and serial tracking', starter: 'Basic inventory', business: 'Batch, serial & BOM', scale: 'Advanced multi-warehouse' },
    ],
  },
  {
    title: 'Automation, AI & Integrations',
    icon: 'sparkle',
    rows: [
      { label: 'Workflow Studio visual automations', sublabel: 'No-code event-driven business workflows', starter: '5 active workflows', business: '25 active workflows', scale: 'Unlimited automations' },
      { label: 'Smart anomaly & risk radar', sublabel: 'AI-assisted margin loss and fraud protection', starter: false, business: true, scale: 'Real-time proactive radar' },
      { label: 'REST API & developer webhooks', sublabel: 'Integration with internal ERPs and external tools', starter: 'Standard rate limit', business: 'High rate limit', scale: 'Dedicated throughput & support' },
    ],
  },
  {
    title: 'Security, Identity & Customer Support',
    icon: 'shield',
    rows: [
      { label: 'Ondi Single Sign-On (SSO) & MFA', sublabel: 'Unified authentication across all workspace apps', starter: true, business: true, scale: true },
      { label: 'Biometric passkeys & device security', sublabel: 'FIDO2 / WebAuthn passwordless authentication', starter: true, business: true, scale: true },
      { label: 'Support & Service Level Agreement', sublabel: 'Dedicated local technical response team', starter: 'Standard email (business hours)', business: '24/7 Priority email & chat', scale: 'Dedicated Account Manager & 99.9% SLA' },
    ],
  },
];

const PaymentLogos = () => (
  <div className="ob-payment-logos">
    <span className="ob-pay-visa">VISA</span>
    <svg className="ob-pay-mc" width="34" height="21" viewBox="0 0 34 21" aria-label="Mastercard">
      <circle cx="13" cy="10.5" r="10.5" fill="#EB001B" />
      <circle cx="21" cy="10.5" r="10.5" fill="#F79E1B" />
      <path d="M17 3.2a10.47 10.47 0 0 1 0 14.6 10.47 10.47 0 0 1 0-14.6Z" fill="#FF5F00" />
    </svg>
    <span className="ob-payment-logo ob-payment-logo--mpesa"><img src="/payment-logos/mpesa.png" alt="M-Pesa" /></span>
    <span className="ob-payment-logo ob-payment-logo--mixx"><img src="/payment-logos/yas-mixx.avif" alt="Yas and Mixx by Yas" /></span>
    <span className="ob-payment-logo ob-payment-logo--selcom"><img src="/payment-logos/selcom-pesa.webp" alt="Selcom Pesa" /></span>
    <span className="ob-pay-airtel-wrap">
      <span className="ob-pay-badge-chip ob-pay-airtel">airtel</span>
      <span className="ob-pay-airtel-money">Money</span>
    </span>
  </div>
);

function storageLabel(pkg: Package): string {
  if (pkg.storage_limit_bytes == null || pkg.storage_limit_bytes <= 0) return 'Unlimited storage';
  const gb = Math.round(pkg.storage_limit_bytes / (1024 * 1024 * 1024));
  return `${gb} GB Cloud Vault`;
}

export const StepPackage: React.FC<StepProps> = ({ draft, update, onNext, onBack, packages, industries = [] }) => {
  const { t } = useLocale();
  const [err, setErr] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  // Selected industries summary for tailor-made recommendations
  const selectedIndKeys = Array.isArray(draft.industries) && draft.industries.length
    ? draft.industries
    : draft.industry ? [draft.industry] : [];

  const selectedIndList = selectedIndKeys
    .map(k => industries.find(item => item.key === k))
    .filter(Boolean);

  const configuredIndustriesText = selectedIndList.length > 0
    ? selectedIndList.map(i => i?.name).join(', ')
    : '';

  const tailorApps = selectedIndList.length > 0
    ? Array.from(new Set(selectedIndList.flatMap(i => i?.core_apps || [])))
    : [];

  const [mode, setMode] = useState<'plan' | 'product'>(draft.initial_products.length ? 'product' : 'plan');
  const [products, setProducts] = useState<StandaloneProduct[] | null>(null);

  useEffect(() => {
    apiFetch('/v1/onboarding/products').then(res => setProducts(res.data)).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (mode === 'plan' && packages.length && !packages.some(pkg => pkg.code === draft.package_code)) {
      const popular = packages.find((p: Package) => p.popular) ?? packages[0];
      update({ package_code: popular.code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, mode]);

  function switchMode(next: 'plan' | 'product') {
    setErr(null);
    setMode(next);
    if (next === 'product') {
      update({ package_code: 'workspace-free' });
    } else {
      update({ package_code: '', initial_products: [] });
    }
  }

  function toggleProduct(key: string) {
    const selected = draft.initial_products.includes(key)
      ? draft.initial_products.filter(k => k !== key)
      : [...draft.initial_products, key];
    update({ initial_products: selected });
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (mode === 'product') {
      if (draft.initial_products.length === 0) { setErr(t('onboarding.chooseProduct')); return; }
      onNext();
      return;
    }
    if (!packages.some(pkg => pkg.code === draft.package_code)) { setErr(t('onboarding.chooseAvailablePlan')); return; }
    onNext();
  };

  // Find standard plans
  const starterPkg = packages.find(p => p.code.includes('starter')) ?? packages[0];
  const businessPkg = packages.find(p => p.popular || p.code.includes('business')) ?? packages[1] ?? packages[0];
  const scalePkg = packages.find(p => p.code.includes('scale')) ?? packages[2] ?? packages[packages.length - 1];

  const planMapping: Record<'starter' | 'business' | 'scale', Package | undefined> = {
    starter: starterPkg,
    business: businessPkg,
    scale: scalePkg,
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form ob-package-form">
      {/* Header Section */}
      <div className="ob-pricing-top">
        <span className="ob-pricing-kicker">{t('onboarding.pricingKicker')}</span>
        <h2 className="ob-pricing-headline">{t('onboarding.choosePlan')}</h2>
        <p className="ob-pricing-subhead">
          All workspace plans include custom domain support, collaborative business tools, and enterprise sovereign identity.
        </p>

        <div className="ob-package-controls">
          {/* Billing Cycle Toggle */}
          <div className="ob-billing-toggle">
            <button
              type="button"
              className={`ob-billing-opt${draft.billing_cycle === 'monthly' ? ' ob-billing-opt--active' : ''}`}
              onClick={() => update({ billing_cycle: 'monthly' })}
              aria-pressed={draft.billing_cycle === 'monthly'}
              data-ui-native-button=""
            >
              {t('onboarding.monthly')}
            </button>
            <button
              type="button"
              className={`ob-billing-opt${draft.billing_cycle === 'annual' ? ' ob-billing-opt--active' : ''}`}
              onClick={() => update({ billing_cycle: 'annual' })}
              aria-pressed={draft.billing_cycle === 'annual'}
              data-ui-native-button=""
            >
              {t('onboarding.annual')}
              <span className="ob-save-badge">Save ~17%</span>
            </button>
          </div>

          {/* Standalone Product vs Full Plan Switcher */}
          <div className="ob-billing-toggle">
            <button
              type="button"
              className={`ob-billing-opt${mode === 'plan' ? ' ob-billing-opt--active' : ''}`}
              onClick={() => switchMode('plan')}
              aria-pressed={mode === 'plan'}
              data-ui-native-button=""
            >
              {t('onboarding.fullPlan')}
            </button>
            <button
              type="button"
              className={`ob-billing-opt${mode === 'product' ? ' ob-billing-opt--active' : ''}`}
              onClick={() => switchMode('product')}
              aria-pressed={mode === 'product'}
              data-ui-native-button=""
            >
              {t('onboarding.oneProduct')}
            </button>
          </div>
        </div>
      </div>

      {/* Tailor-made Recommendation Banner */}
      <div className="ob-tailor-package-banner">
        <div className="ob-tailor-package-header">
          <Icon name="sparkle" size={16} className="ob-tailor-sparkle shrink-0" />
          <div className="ob-tailor-text-wrap">
            <strong className="ob-tailor-company-title">
              Tailor-made for {draft.companyName || 'Aleka Holdings Ltd'}
            </strong>
            <div className="ob-tailor-package-subtitle">
              Configured for {configuredIndustriesText || 'Automotive & Workshop, Food & Beverage, Printing, Warehousing'}
            </div>
          </div>
        </div>
        <div className="ob-tailor-package-apps">
          {(tailorApps.length ? tailorApps : ['gereji', 'seal', 'ngao', 'projects']).map(app => (
            <span key={app} className="ob-tailor-app-tag">
              <span className="ob-app-check">✓</span>
              <span>{CORE_APP_DISPLAY[app] || app.charAt(0).toUpperCase() + app.slice(1)}</span>
            </span>
          ))}
        </div>
      </div>

      {err && <span className="login-field-err" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>{err}</span>}

      {mode === 'product' ? (
        /* Standalone Products View */
        <div className="ob-product-view-wrap">
          <div className="ob-product-intro">
            <h3>Individual Standalone Apps</h3>
            <p>Pick only the specific software modules your team needs today. You can add more apps anytime in Workspace Settings.</p>
          </div>

          <div className="ob-product-grid">
            {products === null && <div className="ob-loading">Loading products...</div>}
            {products?.length === 0 && <div className="ob-loading">No standalone products are available right now.</div>}
            {products?.map(p => {
              const selected = draft.initial_products.includes(p.product_key);
              const isAnnual = draft.billing_cycle === 'annual';
              const monthly = isAnnual && p.pricing?.price_flat_annual != null
                ? Math.round(Number(p.pricing.price_flat_annual) / 12)
                : p.pricing?.price_flat_monthly != null
                  ? Number(p.pricing.price_flat_monthly)
                  : null;
              const curr = p.pricing?.currency === 'TZS' ? 'TZS ' : '$';
              const meta = PRODUCT_META[p.product_key] || {
                icon: 'layers',
                category: 'Business Module',
                bullets: ['Sovereign cloud data isolation', 'Direct Ondi SSO integration', 'Automated workspace setup'],
              };

              return (
                <div
                  key={p.product_key}
                  onClick={() => toggleProduct(p.product_key)}
                  className={`ob-product-card${selected ? ' ob-product-card--selected' : ''}`}
                >
                  <div className="ob-product-card-top">
                    <div className="ob-product-icon-wrap">
                      <Icon name={meta.icon} size={22} />
                    </div>
                    <span className="ob-product-cat-badge">{meta.category}</span>
                  </div>

                  <div className="ob-product-card-body">
                    <h4 className="ob-product-name">{p.name}</h4>
                    <p className="ob-product-desc">{p.description || 'Specialized modular solution for enterprise workflow operations.'}</p>

                    <div className="ob-product-price-row">
                      <div className="ob-product-price">
                        {monthly != null ? `${curr}${monthly.toLocaleString()}` : 'Custom'}
                        {monthly != null && <span className="ob-product-price-unit">/mo</span>}
                      </div>
                      {isAnnual && p.pricing?.price_flat_annual && (
                        <span className="ob-product-annual-note">
                          Billed {curr}{Number(p.pricing.price_flat_annual).toLocaleString()}/yr
                        </span>
                      )}
                    </div>

                    <ul className="ob-product-bullets">
                      {meta.bullets.map((b, idx) => (
                        <li key={idx}>
                          <span className="ob-bullet-check">✓</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    className={`ob-product-btn ${selected ? 'ob-product-btn--solid' : 'ob-product-btn--outline'}`}
                    onClick={(e) => { e.stopPropagation(); toggleProduct(p.product_key); }}
                    aria-pressed={selected}
                    data-ui-native-button=""
                  >
                    {selected ? 'Added ✓' : '+ Add product'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected Products Footer Bar */}
          <div className="ob-product-summary-bar">
            <div className="ob-product-summary-text">
              <strong>{draft.initial_products.length} product{draft.initial_products.length === 1 ? '' : 's'} selected</strong>
              <span>
                {draft.initial_products.length > 0
                  ? draft.initial_products.map(k => products?.find(p => p.product_key === k)?.name || k).join(', ')
                  : 'Select at least one standalone product to proceed'}
              </span>
            </div>
            {draft.initial_products.length > 0 && (
              <span className="ob-product-summary-badge">Ready for workspace launch</span>
            )}
          </div>
        </div>
      ) : (
        /* Full Workspace Plans View */
        <>
          {packages.length === 0 && <div className="ob-loading">Loading packages...</div>}

          {/* 3-Column Google Workspace-Style Pricing Cards */}
          <div className="ob-pkg-grid" role="region" aria-label="Available plans" tabIndex={0} style={{ '--plan-count': packages.length || 3 } as React.CSSProperties}>
            {packages.map((pkg) => {
              const isCustom = pkg.code === 'enterprise';
              const isFlat = pkg.price_flat_monthly != null || pkg.price_flat_annual != null;
              const curr = pkg.currency === 'TZS' ? 'TZS' : '$';
              const sep = pkg.currency === 'TZS' ? ' ' : '';

              let displayPrice: string;
              let priceUnit: string;
              let annualNote: string | null = null;
              let seatsNote: string = '';

              if (pkg.included_seats) {
                seatsNote = `${pkg.included_seats} users included`;
              } else if (pkg.max_users > 0) {
                seatsNote = `${pkg.max_users} users included`;
              }

              if (isCustom) {
                displayPrice = 'Custom';
                priceUnit = '';
              } else if (isFlat) {
                const monthly = draft.billing_cycle === 'annual'
                  ? Math.round((pkg.price_flat_annual ?? (pkg.price_flat_monthly ?? 0) * 12) / 12)
                  : pkg.price_flat_monthly ?? 0;
                displayPrice = `${curr}${sep}${monthly.toLocaleString()}`;
                priceUnit = '/mo';
                if (draft.billing_cycle === 'annual') {
                  const annual = pkg.price_flat_annual ?? (pkg.price_flat_monthly ?? 0) * 12;
                  annualNote = `Billed ${curr}${sep}${annual.toLocaleString()}/yr`;
                }
              } else {
                const seatPrice = draft.billing_cycle === 'annual' ? Math.round(pkg.annual_price / 12) : pkg.monthly_price;
                displayPrice = `${curr}${sep}${seatPrice.toLocaleString()}`;
                priceUnit = '/user/mo';
                if (draft.billing_cycle === 'annual') {
                  annualNote = `Billed annually (${curr}${sep}${pkg.annual_price.toLocaleString()}/seat/yr)`;
                }
              }

              const selected = draft.package_code === pkg.code;
              const isPro = pkg.popular || pkg.code.includes('business');
              const isScale = pkg.code.includes('scale');

              const persona = isPro
                ? 'For growing businesses needing enhanced security, volume & compliance'
                : isScale
                  ? 'For established enterprises requiring advanced control & high volume'
                  : 'For small teams getting started with essential business tools';

              return (
                <div
                  key={pkg.code}
                  onClick={() => update({ package_code: pkg.code })}
                  className={`ob-pkg-card${isPro ? ' ob-pkg-card--pro' : ''}${selected ? ' ob-pkg-card--selected' : ''}`}
                >
                  {/* Pro Card Sparkle Icon */}
                  {isPro && (
                    <div className="ob-sparkle-topright">
                      <Icon name="sparkle" size={20} />
                    </div>
                  )}

                  {/* Title & Badge */}
                  <div className="ob-pkg-header-row">
                    <div className="ob-pkg-name">{pkg.name}</div>
                    {isPro && <span className="ob-badge-popular-green">{t('onboarding.popular')}</span>}
                  </div>

                  <p className="ob-pkg-tagline">{persona}</p>

                  {/* Price */}
                  {isCustom ? (
                    <div className="ob-pkg-price ob-pkg-price--custom">
                      Custom
                      <span className="ob-pkg-custom-note">Metered per enterprise quotation</span>
                    </div>
                  ) : (
                    <div className="ob-pkg-price">
                      <span className="ob-pkg-price-val">{displayPrice}</span>
                      {priceUnit && <span className="ob-pkg-price-unit">{priceUnit}</span>}
                      {seatsNote && <span className="ob-pkg-seats-note">{seatsNote}</span>}
                      {annualNote && (
                        <span className="ob-pkg-annual-note">{annualNote}</span>
                      )}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    type="button"
                    className={`ob-pkg-btn ${selected ? 'ob-pkg-btn--solid' : 'ob-pkg-btn--outline'}`}
                    onClick={(e) => { e.stopPropagation(); update({ package_code: pkg.code }); }}
                    aria-pressed={selected}
                    data-ui-native-button=""
                  >
                    {selected ? t('onboarding.selectedPlan') : isCustom ? t('onboarding.contactSales') : t('onboarding.buyPlan')}
                  </button>

                  {/* Feature Groups */}
                  <div className="ob-pkg-group">
                    <div className="ob-pkg-group-title">Users & Workspaces</div>
                    <ul className="ob-pkg-feature-list">
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>{pkg.max_users === 0 ? 'Unlimited users' : `${pkg.included_seats || pkg.max_users} users included`}</span>
                        {isPro && <span className="ob-boosted-pill"><Icon name="trendingUp" size={12} />Boosted</span>}
                      </li>
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>{pkg.max_locations === 0 ? 'Unlimited locations' : `Up to ${pkg.max_locations ?? 1} location${(pkg.max_locations ?? 1) > 1 ? 's' : ''}`}</span>
                      </li>
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>Built for East African enterprises</span>
                      </li>
                    </ul>
                  </div>

                  <div className="ob-pkg-group">
                    <div className="ob-pkg-group-title">Operations & Logistics</div>
                    <ul className="ob-pkg-feature-list">
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>{pkg.monthly_item_limit ? `${pkg.monthly_item_limit.toLocaleString()} shipments / month` : isScale ? '2,000 shipments / month' : isPro ? '500 shipments / month' : '100 shipments / month'}</span>
                        {isPro && <span className="ob-boosted-pill"><Icon name="trendingUp" size={12} />Boosted</span>}
                      </li>
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>Customs & TANCIS integration</span>
                      </li>
                      {(isPro || isScale) && (
                        <li className="ob-pkg-feature-item">
                          <span className="ob-pkg-feature-icon">✓</span>
                          <span>Demurrage Risk Radar</span>
                          {isPro && <span className="ob-boosted-pill"><Icon name="trendingUp" size={12} />Boosted</span>}
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="ob-pkg-group">
                    <div className="ob-pkg-group-title">Storage & AI Compliance</div>
                    <ul className="ob-pkg-feature-list">
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>{storageLabel(pkg)}</span>
                      </li>
                      <li className="ob-pkg-feature-item">
                        <span className="ob-pkg-feature-icon">✓</span>
                        <span>OCR & Document AI extraction</span>
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Secure Payment Badges */}
          <div className="ob-payment-trust">
            <span className="ob-payment-trust-label">SECURE PAYMENT VIA</span>
            <PaymentLogos />
          </div>

          {/* Google Workspace-Style Feature Comparison Matrix */}
          <div className="ob-matrix-section">
            <button
              type="button"
              className="ob-matrix-toggle-btn"
              aria-expanded={showMatrix}
              aria-controls="google-workspace-comparison"
              onClick={() => setShowMatrix(prev => !prev)}
              data-ui-native-button=""
            >
              <span>{showMatrix ? t('onboarding.hideComparison') : t('onboarding.compareFeatures')}</span>
              <Icon name={showMatrix ? 'chevronUp' : 'chevronDown'} size={18} />
            </button>

            {showMatrix && (
              <div id="google-workspace-comparison" className="ob-matrix-container" role="region" aria-label="Feature comparison">
                <table className="ob-gw-matrix-table">
                  {/* Sticky Table Header */}
                  <thead>
                    <tr>
                      <th className="ob-th-feature">
                        <span className="ob-th-title">Feature Overview</span>
                        <span className="ob-th-sub">Compare all plan capabilities side by side</span>
                      </th>
                      {(['starter', 'business', 'scale'] as const).map(tierKey => {
                        const pkg = planMapping[tierKey];
                        const isSelected = draft.package_code === pkg?.code;
                        const isPro = tierKey === 'business';
                        const monthly = pkg ? (draft.billing_cycle === 'annual' && pkg.price_flat_annual ? Math.round(pkg.price_flat_annual / 12) : (pkg.price_flat_monthly ?? 0)) : 0;

                        return (
                          <th
                            key={tierKey}
                            className={`ob-th-plan${isSelected ? ' ob-th-plan--selected' : ''}${isPro ? ' ob-th-plan--pro' : ''}`}
                            onClick={() => pkg && update({ package_code: pkg.code })}
                          >
                            <div className="ob-th-plan-badge-row">
                              <span className="ob-th-plan-name">{pkg?.name || tierKey.toUpperCase()}</span>
                              {isPro && <span className="ob-badge-popular-green">{t('onboarding.popular')}</span>}
                            </div>
                            <div className="ob-th-price">
                              TZS {monthly.toLocaleString()} <span className="ob-th-price-unit">/mo</span>
                            </div>
                            <button
                              type="button"
                              className={`ob-th-select-btn ${isSelected ? 'ob-th-select-btn--active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); pkg && update({ package_code: pkg.code }); }}
                              data-ui-native-button=""
                            >
                              {isSelected ? t('onboarding.selectedPlan') : t('onboarding.buyPlan')}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {COMPARISON_CATEGORIES.map(cat => (
                      <React.Fragment key={cat.title}>
                        {/* Category Row */}
                        <tr className="ob-tr-category">
                          <td colSpan={4} className="ob-td-category">
                            <div className="ob-cat-row-wrap">
                              <Icon name={cat.icon} size={16} />
                              <span>{cat.title}</span>
                            </div>
                          </td>
                        </tr>

                        {/* Feature Rows */}
                        {cat.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="ob-tr-feature">
                            <td className="ob-td-feature-name">
                              <div className="ob-feature-label">{row.label}</div>
                              {row.sublabel && <div className="ob-feature-sublabel">{row.sublabel}</div>}
                            </td>

                            {(['starter', 'business', 'scale'] as const).map(tierKey => {
                              const pkg = planMapping[tierKey];
                              const isSelected = draft.package_code === pkg?.code;
                              const val = row[tierKey];

                              return (
                                <td
                                  key={tierKey}
                                  className={`ob-td-feature-val${isSelected ? ' ob-td-feature-val--selected' : ''}`}
                                  onClick={() => pkg && update({ package_code: pkg.code })}
                                >
                                  {typeof val === 'boolean' ? (
                                    val ? (
                                      <span className="ob-matrix-check" title="Included">✓</span>
                                    ) : (
                                      <span className="ob-matrix-dash" title="Not included">—</span>
                                    )
                                  ) : (
                                    <span className="ob-matrix-text">{val}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Form Action Controls */}
      <div className="login-form-actions ob-package-actions">
        <Button type="button" onClick={onBack} variant="ghost">{t('onboarding.back')}</Button>
        <Button
          type="submit"
          disabled={mode === 'plan' ? !packages.some(pkg => pkg.code === draft.package_code) : !products?.some(product => draft.initial_products.includes(product.product_key))}
        >
          {t('onboarding.continueWorkspace')}
        </Button>
      </div>
    </form>
  );
};
