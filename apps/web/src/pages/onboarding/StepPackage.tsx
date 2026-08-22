import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import type { StepProps } from './types.js';
import type { Package } from '@hudumika/types';

const PaymentLogos = () => (
  <div className="ob-payment-logos">
    <span className="ob-pay-badge ob-pay-visa">VISA</span>
    <span className="ob-pay-badge ob-pay-mc">
      <span className="mc-red" />
      <span className="mc-yellow" />
    </span>
    <span className="ob-pay-badge ob-pay-gpay">
      <span style={{ color: '#4285F4' }}>G</span>
      <span style={{ color: '#EA4335' }}>P</span>
      <span style={{ color: '#FBBC05' }}>a</span>
      <span style={{ color: '#34A853' }}>y</span>
    </span>
    <span className="ob-pay-badge ob-pay-paypal">
      <span style={{ color: '#003087', fontWeight: 800 }}>Pay</span>
      <span style={{ color: '#0079C1', fontWeight: 800 }}>Pal</span>
    </span>
    <span className="ob-pay-badge ob-pay-apple"> Pay</span>
  </div>
);

export const StepPackage: React.FC<StepProps> = ({ draft, update, onNext, onBack, packages }) => {
  const [err, setErr] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!draft.package_code && packages.length) {
      const popular = packages.find((p: Package) => p.popular) ?? packages[0];
      update({ package_code: popular.code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages]);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft.package_code) { setErr('Please select a plan'); return; }
    onNext();
  };

  const toggleFaq = (idx: number) => {
    setOpenFaq(prev => prev === idx ? null : idx);
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
          >
            Monthly
          </button>
          <button
            type="button"
            className={`ob-billing-opt${draft.billing_cycle === 'annual' ? ' ob-billing-opt--active' : ''}`}
            onClick={() => update({ billing_cycle: 'annual' })}
          >
            Annually <span className="ob-billing-save">Save 30%</span>
          </button>
        </div>
      </div>

      {packages.length === 0 && <div className="ob-loading">Loading packages...</div>}
      {err && <span className="login-field-err" style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>{err}</span>}

      {/* 3-Column Pricing Grid (Imitating Sample Image) */}
      <div className="ob-pkg-grid">
        {packages.map((pkg, idx) => {
          const isCustom = pkg.code === 'enterprise';
          const seatPrice = isCustom ? 0 : (draft.billing_cycle === 'annual' ? Math.round(pkg.annual_price / 12) : pkg.monthly_price);
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
                  ${seatPrice}
                  <span>/user/mo</span>
                  {draft.billing_cycle === 'annual' && (
                    <span style={{ fontSize: '11px', display: 'block', color: 'var(--ink3)', fontWeight: 'normal', marginTop: 4 }}>
                      Billed annually (${pkg.annual_price}/seat/yr)
                    </span>
                  )}
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                className={`ob-pkg-btn ${isPro || selected ? 'ob-pkg-btn--solid' : 'ob-pkg-btn--outline'}`}
                onClick={(e) => { e.stopPropagation(); update({ package_code: pkg.code }); }}
              >
                {selected ? 'Plan Selected ✓' : isCustom ? 'Contact Sales' : 'Buy Plan'}
              </button>

              {/* Payment Logos Row */}
              <PaymentLogos />

              {/* Feature Groups */}
              <div className="ob-pkg-group">
                <div className="ob-pkg-group-title">Users &amp; Workspaces</div>
                <ul className="ob-pkg-feature-list">
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>{pkg.max_users === 0 ? 'Unlimited users' : `Up to ${pkg.max_users} users`}</span>
                    {idx === 1 && <span className="ob-boosted-pill">Boosted ↑</span>}
                  </li>
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
                    {idx === 1 && <span className="ob-boosted-pill">Boosted ↑</span>}
                  </li>
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>Customs &amp; TANCIS integration</span>
                  </li>
                  {!isCustom && pkg.code !== 'starter' && (
                    <li className="ob-pkg-feature-item">
                      <span className="ob-pkg-feature-icon">✓</span>
                      <span>Demurrage Risk Radar</span>
                      {idx === 1 && <span className="ob-boosted-pill">Boosted ↑</span>}
                    </li>
                  )}
                </ul>
              </div>

              <div className="ob-pkg-group">
                <div className="ob-pkg-group-title">Storage &amp; AI Compliance</div>
                <ul className="ob-pkg-feature-list">
                  <li className="ob-pkg-feature-item">
                    <span className="ob-pkg-feature-icon">✓</span>
                    <span>{pkg.code === 'starter' ? '10 GB Cloud Vault' : pkg.code === 'growth' ? '50 GB Cloud Vault' : 'Unlimited storage'}</span>
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

      {/* Feature Comparison Matrix Accordion */}
      <div className="ob-matrix-wrap">
        <button
          type="button"
          className="ob-matrix-toggle"
          onClick={() => setShowMatrix(prev => !prev)}
        >
          <span>{showMatrix ? 'Hide feature comparison' : 'Compare all features'}</span>
          <Icon name={showMatrix ? 'chevronUp' : 'chevronDown'} size={15} />
        </button>

        {showMatrix && (
          <table className="ob-matrix-table">
            <thead>
              <tr>
                <th>Features</th>
                <th>HuduStarter ($6/user)</th>
                <th>HuduPlus ($18/user)</th>
                <th>Hudu Advanced (Custom)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="ob-matrix-cat">Users &amp; Workspaces</td>
              </tr>
              <tr>
                <td>Team Members &amp; Staff</td>
                <td>Up to 300</td>
                <td>Up to 300</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Role-Based Access (RBAC)</td>
                <td>Basic</td>
                <td>Advanced</td>
                <td>Custom Roles</td>
              </tr>

              <tr>
                <td colSpan={4} className="ob-matrix-cat">Operations &amp; Logistics</td>
              </tr>
              <tr>
                <td>Monthly Shipment Cases</td>
                <td>100 / mo</td>
                <td>500 / mo</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Customs Declaration &amp; TANCIS</td>
                <td><Icon name="check" size={14} color="#059669" /></td>
                <td><Icon name="check" size={14} color="#059669" /></td>
                <td><Icon name="check" size={14} color="#059669" /></td>
              </tr>
              <tr>
                <td>Demurrage &amp; Storage Risk Radar</td>
                <td>—</td>
                <td><Icon name="check" size={14} color="#059669" /></td>
                <td><Icon name="check" size={14} color="#059669" /></td>
              </tr>

              <tr>
                <td colSpan={4} className="ob-matrix-cat">Storage &amp; Compliance</td>
              </tr>
              <tr>
                <td>Cloud Document Vault</td>
                <td>10 GB</td>
                <td>50 GB</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>OCR &amp; Document AI Extraction</td>
                <td><Icon name="check" size={14} color="#059669" /></td>
                <td><Icon name="check" size={14} color="#059669" /></td>
                <td><Icon name="check" size={14} color="#059669" /></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* FAQ Accordion Section */}
      <div className="ob-faq-wrap">
        <div className="ob-faq-title">Frequently asked questions</div>
        <div className="ob-faq-list">
          {[
            { q: 'Can I change or upgrade my plan later?', a: 'Yes! You can upgrade, downgrade, or switch between monthly and annual billing cycles at any time directly from your Workspace Settings.' },
            { q: 'What payment methods are supported?', a: 'We accept Visa, Mastercard, M-Pesa, Tigo Pesa, Airtel Money, and GePG direct bank transfer for East African businesses.' },
            { q: 'Is there a free trial period?', a: 'Yes! All packages come with a 14-day full-featured free trial so you can explore all features with zero upfront commitment.' }
          ].map((item, idx) => (
            <div className="ob-faq-item" key={idx}>
              <button
                type="button"
                className="ob-faq-question"
                onClick={() => toggleFaq(idx)}
              >
                <span>{item.q}</span>
                <Icon name={openFaq === idx ? 'chevronUp' : 'chevronDown'} size={14} />
              </button>
              {openFaq === idx && (
                <div className="ob-faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form Action Controls */}
      <div className="login-form-actions" style={{ marginTop: 28 }}>
        <button type="button" onClick={onBack} className="login-back-btn">Back</button>
        <button type="submit" className="login-submit-btn" disabled={packages.length === 0}>
          Continue to Step 4
        </button>
      </div>
    </form>
  );
};
