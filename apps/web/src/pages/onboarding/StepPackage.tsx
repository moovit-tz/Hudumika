import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import type { StepProps } from './types.js';
import type { Package } from '@hudumika/types';

interface StandaloneProduct {
  product_key: string;
  name: string;
  description: string | null;
  pricing: { currency: string; price_flat_monthly: string | number | null; price_flat_annual: string | number | null } | null;
}

// Cards still clear fine here, but GPay/PayPal/Apple Pay have close to no
// real reach in Tanzania -- mobile money is how this region actually pays.
// M-Pesa, Mixx by Yas (Tigo Pesa's own current name since the Axian/Yas
// rebrand in Nov 2024 -- using "Tigo Pesa" here would already be a stale
// brand name) and Airtel Money are the three mobile money rails an East
// African workspace's own buyers are actually holding a wallet on.
//
// None of these are licensed brand-asset files (no verified source for
// exact vector artwork was available) -- each mark below is redrawn to
// match its real-world visual identity as closely as good-faith reference
// allows: Mastercard's interlocking circles are real official geometry
// (equal-radius circles, centers offset 0.7x the radius, #EB001B/#F79E1B),
// not a placeholder. M-PESA and Airtel Money's real acceptance marks are
// colored badges (not bare colored text, which is what this used to be),
// so those got the badge treatment; Visa and Mixx by Yas are genuinely
// wordmark-only brands, so a refined wordmark is the accurate shape for them.
const PaymentLogos = () => (
  <div className="ob-payment-logos">
    <span className="ob-pay-visa">VISA</span>
    <svg className="ob-pay-mc" width="34" height="21" viewBox="0 0 34 21" aria-label="Mastercard">
      <circle cx="13" cy="10.5" r="10.5" fill="#EB001B" />
      <circle cx="21" cy="10.5" r="10.5" fill="#F79E1B" />
      <path d="M17 3.2a10.47 10.47 0 0 1 0 14.6 10.47 10.47 0 0 1 0-14.6Z" fill="#FF5F00" />
    </svg>
    <span className="ob-pay-badge-chip ob-pay-mpesa">M-PESA</span>
    <span className="ob-pay-mixx">
      <span className="ob-pay-mixx-word">Mixx</span>
      <span className="ob-pay-mixx-by"> by Yas</span>
    </span>
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

export const StepPackage: React.FC<StepProps> = ({ draft, update, onNext, onBack, packages }) => {
  const [err, setErr] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  // "product" mode: a standalone-product signup (e.g. SEAL-only) — no
  // Hudumika Business tier at all, package_code is forced to the $0
  // workspace-free row (migration 692) and initial_products carries what
  // was actually picked. Starts in "product" mode if a previous visit to
  // this step already picked one (e.g. the user went Back from a later step).
  const [mode, setMode] = useState<'plan' | 'product'>(draft.initial_products.length ? 'product' : 'plan');
  const [products, setProducts] = useState<StandaloneProduct[] | null>(null);

  useEffect(() => {
    apiFetch('/v1/onboarding/products').then(res => setProducts(res.data)).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (mode === 'plan' && !draft.package_code && packages.length) {
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
      if (draft.initial_products.length === 0) { setErr('Please select at least one product'); return; }
      onNext();
      return;
    }
    if (!draft.package_code) { setErr('Please select a plan'); return; }
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form">
      {/* Sample Header Section */}
      <div className="ob-pricing-top">
        <div className="ob-pricing-tag">PRICING</div>
        <h2 className="ob-pricing-headline">Choose the plan that fits your needs</h2>

        {/* Billing Cycle Toggle */}
        <div className="ob-billing-toggle">
          <button
            type="button"
            className={`ob-billing-opt${draft.billing_cycle === 'monthly' ? ' ob-billing-opt--active' : ''}`}
            onClick={() => update({ billing_cycle: 'monthly' })}
           data-ui-native-button="">
            Monthly
          </button>
          <button
            type="button"
            className={`ob-billing-opt${draft.billing_cycle === 'annual' ? ' ob-billing-opt--active' : ''}`}
            onClick={() => update({ billing_cycle: 'annual' })}
           data-ui-native-button="">
            Annually <span className="ob-billing-save">Save 30%</span>
          </button>
        </div>

        {/* Standalone-product signup — no Hudumika Business tier at all,
            just one or more independent products (SEAL, ClearOS, etc.) on
            the free Workspace substrate. */}
        <div className="ob-billing-toggle" style={{ marginTop: 10 }}>
          <button type="button" className={`ob-billing-opt${mode === 'plan' ? ' ob-billing-opt--active' : ''}`} onClick={() => switchMode('plan')} data-ui-native-button="">
            Full plan
          </button>
          <button type="button" className={`ob-billing-opt${mode === 'product' ? ' ob-billing-opt--active' : ''}`} onClick={() => switchMode('product')} data-ui-native-button="">
            Just one product
          </button>
        </div>
      </div>

      {err && <span className="login-field-err" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>{err}</span>}

      {mode === 'product' ? (
        <div className="ob-pkg-grid">
          {products === null && <div className="ob-loading">Loading products...</div>}
          {products?.length === 0 && <div className="ob-loading">No standalone products are available right now.</div>}
          {products?.map(p => {
            const selected = draft.initial_products.includes(p.product_key);
            const monthly = p.pricing?.price_flat_monthly != null ? Number(p.pricing.price_flat_monthly) : null;
            const curr = p.pricing?.currency === 'TZS' ? 'TZS ' : '$';
            return (
              <div
                key={p.product_key}
                onClick={() => toggleProduct(p.product_key)}
                className={`ob-pkg-card${selected ? ' ob-pkg-card--selected' : ''}`}
              >
                <div className="ob-pkg-header-row">
                  <div className="ob-pkg-name">{p.name}</div>
                </div>
                <div className="ob-pkg-price">
                  {monthly != null ? `${curr}${monthly.toLocaleString()}` : 'Custom'}
                  {monthly != null && <span>/mo</span>}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 12px' }}>{p.description}</p>
                <button
                  type="button"
                  className={`ob-pkg-btn ${selected ? 'ob-pkg-btn--solid' : 'ob-pkg-btn--outline'}`}
                  onClick={(e) => { e.stopPropagation(); toggleProduct(p.product_key); }}
                 data-ui-native-button="">
                  {selected ? 'Selected ✓' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
      <>
      {packages.length === 0 && <div className="ob-loading">Loading packages...</div>}

      {/* 3-Column Pricing Grid (Imitating Sample Image) */}
      <div className="ob-pkg-grid">
        {packages.map((pkg, idx) => {
          const isCustom = pkg.code === 'enterprise';
          const isFlat = pkg.price_flat_monthly != null;
          const curr = pkg.currency === 'TZS' ? 'TZS' : '$';
          const sep = pkg.currency === 'TZS' ? ' ' : '';

          let displayPrice: string;
          let priceUnit: string;
          let annualNote: string | null = null;

          if (isCustom) {
            displayPrice = 'Custom';
            priceUnit = '';
          } else if (isFlat) {
            const monthly = draft.billing_cycle === 'annual'
              ? Math.round((pkg.price_flat_annual ?? pkg.price_flat_monthly! * 10) / 12)
              : pkg.price_flat_monthly!;
            displayPrice = `${curr}${sep}${monthly.toLocaleString()}`;
            priceUnit = '/mo';
            if (pkg.included_seats) {
              annualNote = `${pkg.included_seats} user${pkg.included_seats > 1 ? 's' : ''} included`;
            }
            if (draft.billing_cycle === 'annual') {
              const annual = pkg.price_flat_annual ?? pkg.price_flat_monthly! * 10;
              annualNote = `Billed ${curr}${sep}${annual.toLocaleString()}/yr` + (pkg.included_seats ? ` · ${pkg.included_seats} users included` : '');
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
          const isPro = pkg.popular || idx === 1;

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
                {isPro && <span className="ob-badge-popular-green">Most popular</span>}
              </div>

              {/* Price */}
              {isCustom ? (
                <div className="ob-pkg-price" style={{ fontSize: '24px' }}>
                  Custom
                  <span style={{ fontSize: '12px', display: 'block', fontWeight: 'normal', color: 'var(--ink3)' }}>Metered per quotation</span>
                </div>
              ) : (
                <div className="ob-pkg-price">
                  {displayPrice}
                  {priceUnit && <span>{priceUnit}</span>}
                  {annualNote && (
                    <span style={{ fontSize: '11px', display: 'block', color: 'var(--ink3)', fontWeight: 'normal', marginTop: 4 }}>
                      {annualNote}
                    </span>
                  )}
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                className={`ob-pkg-btn ${isPro || selected ? 'ob-pkg-btn--solid' : 'ob-pkg-btn--outline'}`}
                onClick={(e) => { e.stopPropagation(); update({ package_code: pkg.code }); }}
               data-ui-native-button="">
                {selected ? 'Plan Selected ✓' : isCustom ? 'Contact Sales' : 'Buy Plan'}
              </button>

              {/* Feature Groups */}
              <div className="ob-pkg-group">
                <div className="ob-pkg-group-title">Users &amp; Workspaces</div>
                <ul className="ob-pkg-feature-list">
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>{pkg.max_users === 0 ? 'Unlimited users' : pkg.included_seats ? `${pkg.included_seats} users included` : `Up to ${pkg.max_users} users`}</span>
                    {idx === 1 && <span className="ob-boosted-pill"><Icon name="trendingUp" size={10} /> Boosted</span>}
                  </li>
                  {pkg.max_locations != null && (
                    <li className="ob-pkg-feature-item">
                      <span className="ob-pkg-feature-icon">✓</span>
                      <span>{pkg.max_locations === 0 ? 'Unlimited locations' : `Up to ${pkg.max_locations} location${pkg.max_locations > 1 ? 's' : ''}`}</span>
                    </li>
                  )}
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>Built for East African enterprises</span>
                  </li>
                </ul>
              </div>

              <div className="ob-pkg-group">
                <div className="ob-pkg-group-title">Operations &amp; Logistics</div>
                <ul className="ob-pkg-feature-list">
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>
                      {pkg.monthly_item_limit === null ? 'Unlimited shipments / month' : `${pkg.monthly_item_limit.toLocaleString()} shipments / month`}
                    </span>
                    {idx === 1 && <span className="ob-boosted-pill"><Icon name="trendingUp" size={10} /> Boosted</span>}
                  </li>
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>Customs &amp; TANCIS integration</span>
                  </li>
                  {!isCustom && !pkg.code.startsWith('starter') && (
                    <li className="ob-pkg-feature-item">
                      <span className="ob-pkg-feature-icon">✓</span>
                      <span>Demurrage Risk Radar</span>
                      {idx === 1 && <span className="ob-boosted-pill"><Icon name="trendingUp" size={10} /> Boosted</span>}
                    </li>
                  )}
                </ul>
              </div>

              <div className="ob-pkg-group">
                <div className="ob-pkg-group-title">Storage &amp; AI Compliance</div>
                <ul className="ob-pkg-feature-list">
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>{storageLabel(pkg)}</span>
                  </li>
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>OCR &amp; Document AI extraction</span>
                  </li>
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment methods — shown once for the whole grid rather than once
          per card (all plans take the same payment methods, and repeating
          this row inside every card was most of why the cards read as
          cramped once there were four of them instead of three). */}
      <div className="ob-payment-trust">
        <span className="ob-payment-trust-label">Secure payment via</span>
        <PaymentLogos />
      </div>

      {/* Feature Comparison Matrix Accordion */}
      <div className="ob-matrix-wrap">
        <button
          type="button"
          className="ob-matrix-toggle"
          onClick={() => setShowMatrix(prev => !prev)}
         data-ui-native-button="">
          <span>{showMatrix ? 'Hide feature comparison' : 'Compare all features'}</span>
          <Icon name={showMatrix ? 'chevronUp' : 'chevronDown'} size={15} />
        </button>

        {showMatrix && (
          <div className="ob-matrix-grid">
            {packages.map(pkg => (
              <div key={pkg.code} className="ob-matrix-col">
                <div className="ob-matrix-col-name">{pkg.name}</div>
                <ul className="ob-pkg-feature-list">
                  {pkg.features.map(feature => (
                    <li key={feature} className="ob-pkg-feature-item">
                      <span className="ob-pkg-feature-icon">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {/* Form Action Controls */}
      <div className="login-form-actions" style={{ marginTop: 28 }}>
        <button type="button" onClick={onBack} className="login-back-btn" data-ui-native-button="">Back</button>
        <button
          type="submit"
          className="login-submit-btn"
          disabled={mode === 'plan' ? packages.length === 0 : !products || products.length === 0}
         data-ui-native-button="">
          Continue to Step 4
        </button>
      </div>
    </form>
  );
};
