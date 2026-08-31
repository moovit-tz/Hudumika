import React, { useState } from 'react';
import type { StepProps } from './types.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';

const TIMEZONES = ['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'Africa/Kigali', 'Africa/Lusaka'];
const CURRENCIES = ['TZS', 'KES', 'UGX', 'RWF', 'ZMW', 'USD'];

export const StepConfiguration: React.FC<StepProps> = ({ draft, update, onNext, onBack, packages, submitting, submitError }) => {
  const [localErr, setLocalErr] = useState<string | null>(null);
  const error = localErr ?? submitError ?? null;

  const pkg = packages.find(p => p.code === draft.package_code);
  const price = pkg ? (draft.billing_cycle === 'annual' ? pkg.annual_price : pkg.monthly_price) : null;
  const maskedCard = draft.payment.method === 'card' && draft.payment.card_number
    ? `•••• ${draft.payment.card_number.replace(/\s/g, '').slice(-4)}`
    : draft.payment.method === 'mpesa' ? draft.payment.mobile_provider : '';

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft.hq_city.trim()) { setLocalErr('HQ city is required'); return; }
    setLocalErr(null);
    // The wizard shell owns the actual API call (POST /v1/onboarding/complete)
    // and login — for this last step, onNext() triggers the real submit.
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form">
      <div className="ob-payment-row">
        <div className="login-field">
          <label className="reg-label">Timezone</label>
          <Select value={draft.timezone} onValueChange={v => update({ timezone: v })}>
            <SelectTrigger aria-label="Timezone" className="login-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="login-field">
          <label className="reg-label">Currency</label>
          <Select value={draft.currency} onValueChange={v => update({ currency: v })}>
            <SelectTrigger aria-label="Currency" className="login-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="login-field">
        <label className="reg-label">Headquarters city</label>
        <input
          type="text"
          placeholder="Dar es Salaam"
          value={draft.hq_city}
          onChange={e => { update({ hq_city: e.target.value }); setLocalErr(null); }}
          className={`login-input${error ? ' login-input--error' : ''}`}
        />
        {error && <span className="login-field-err">{error}</span>}
      </div>

      <div className="ob-review">
        <div className="ob-review-title">Review</div>
        <div className="ob-review-row"><span>Account</span><span>{draft.name} · {draft.email}</span></div>
        <div className="ob-review-row"><span>Company</span><span>{draft.companyName}</span></div>
        <div className="ob-review-row"><span>Plan</span><span>{pkg?.name || draft.package_code} — ${price}/{draft.billing_cycle === 'annual' ? 'yr' : 'mo'}</span></div>
        <div className="ob-review-row"><span>Workspace</span><span>{draft.subdomain}.hudumika.tz</span></div>
        <div className="ob-review-row"><span>Payment</span><span>{maskedCard}</span></div>
      </div>

      <div className="login-form-actions">
        <button type="button" onClick={onBack} className="login-back-btn" disabled={submitting}>Back</button>
        <button type="submit" className="login-submit-btn" disabled={submitting}>
          {submitting ? 'Creating your workspace…' : 'Create my workspace'}
        </button>
      </div>
    </form>
  );
};
