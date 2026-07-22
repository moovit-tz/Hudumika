import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import type { StepProps } from './types.js';
import type { Package } from '@hudumika/types';

export const StepPackage: React.FC<StepProps> = ({ draft, update, onNext, onBack, packages }) => {
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form">
      <div className="ob-billing-toggle">
        <button type="button" className={`ob-billing-opt${draft.billing_cycle === 'monthly' ? ' ob-billing-opt--active' : ''}`} onClick={() => update({ billing_cycle: 'monthly' })}>Monthly</button>
        <button type="button" className={`ob-billing-opt${draft.billing_cycle === 'annual' ? ' ob-billing-opt--active' : ''}`} onClick={() => update({ billing_cycle: 'annual' })}>Annual <span className="ob-billing-save">save ~17%</span></button>
      </div>

      {packages.length === 0 && <div className="ob-loading">Loading plans…</div>}
      {err && <span className="login-field-err">{err}</span>}

      <div className="ob-pkg-grid">
        {packages.map(pkg => {
          const price = draft.billing_cycle === 'annual' ? pkg.annual_price : pkg.monthly_price;
          const selected = draft.package_code === pkg.code;
          return (
            <button
              type="button"
              key={pkg.code}
              onClick={() => update({ package_code: pkg.code })}
              className={`ob-pkg-card${selected ? ' ob-pkg-card--selected' : ''}`}
              style={{ '--pkg-color': pkg.color } as React.CSSProperties}
            >
              {pkg.popular && <span className="ob-pkg-badge">Most popular</span>}
              <div className="ob-pkg-name">{pkg.name}</div>
              <div className="ob-pkg-price">${price}<span>/{draft.billing_cycle === 'annual' ? 'yr' : 'mo'}</span></div>
              <div className="ob-pkg-users">{pkg.max_users === 0 ? 'Unlimited users' : `Up to ${pkg.max_users} users`}</div>
              <ul className="ob-pkg-features">
                {pkg.features.slice(0, 4).map(f => (
                  <li key={f}><Icon name="check" size={13} /><span>{f}</span></li>
                ))}
              </ul>
              {selected && <div className="ob-pkg-selected-tick"><Icon name="checkCircle" size={18} /></div>}
            </button>
          );
        })}
      </div>

      <div className="login-form-actions">
        <button type="button" onClick={onBack} className="login-back-btn">Back</button>
        <button type="submit" className="login-submit-btn" disabled={packages.length === 0}>Continue</button>
      </div>
    </form>
  );
};
