import React, { useState } from 'react';
import type { StepProps } from './types.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';

function luhnValid(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return digits.length > 0 && sum % 10 === 0;
}

function formatCardNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

const MOBILE_PROVIDERS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa'];

export const StepPayment: React.FC<StepProps> = ({ draft, update, onNext, onBack }) => {
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  const p = draft.payment;

  const setPayment = (patch: Partial<typeof p>) => update({ payment: { ...p, ...patch } });

  const validate = () => {
    const e: Record<string, string | undefined> = {};
    if (p.method === 'card') {
      const digits = p.card_number.replace(/\s/g, '');
      if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) e.card_number = 'Enter a valid card number';
      if (!p.card_holder.trim()) e.card_holder = 'Cardholder name is required';
      if (!/^\d{2}\/\d{2}$/.test(p.card_expiry)) e.card_expiry = 'Use MM/YY';
      if (!/^\d{3,4}$/.test(p.card_cvc)) e.card_cvc = 'Invalid CVC';
    } else {
      const digits = p.mobile_number.replace(/\D/g, '');
      if (digits.length < 9) e.mobile_number = 'Enter a valid mobile money number';
    }
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form">
      <div className="ob-billing-toggle">
        <button type="button" className={`ob-billing-opt${p.method === 'card' ? ' ob-billing-opt--active' : ''}`} onClick={() => setPayment({ method: 'card' })}>Card</button>
        <button type="button" className={`ob-billing-opt${p.method === 'mpesa' ? ' ob-billing-opt--active' : ''}`} onClick={() => setPayment({ method: 'mpesa' })}>Mobile Money</button>
      </div>

      {p.method === 'card' ? (
        <>
          <div className="login-field">
            <label className="reg-label">Card number</label>
            <input
              type="text"
              placeholder="4242 4242 4242 4242"
              value={p.card_number}
              onChange={e => { setPayment({ card_number: formatCardNumber(e.target.value) }); setErr(x => ({ ...x, card_number: undefined })); }}
              className={`login-input${err.card_number ? ' login-input--error' : ''}`}
              autoComplete="cc-number"
            />
            {err.card_number && <span className="login-field-err">{err.card_number}</span>}
          </div>
          <div className="login-field">
            <label className="reg-label">Name on card</label>
            <input
              type="text"
              placeholder="John Mwangi"
              value={p.card_holder}
              onChange={e => { setPayment({ card_holder: e.target.value }); setErr(x => ({ ...x, card_holder: undefined })); }}
              className={`login-input${err.card_holder ? ' login-input--error' : ''}`}
              autoComplete="cc-name"
            />
            {err.card_holder && <span className="login-field-err">{err.card_holder}</span>}
          </div>
          <div className="ob-payment-row">
            <div className="login-field">
              <label className="reg-label">Expiry</label>
              <input
                type="text"
                placeholder="MM/YY"
                value={p.card_expiry}
                onChange={e => { setPayment({ card_expiry: formatExpiry(e.target.value) }); setErr(x => ({ ...x, card_expiry: undefined })); }}
                className={`login-input${err.card_expiry ? ' login-input--error' : ''}`}
                autoComplete="cc-exp"
              />
              {err.card_expiry && <span className="login-field-err">{err.card_expiry}</span>}
            </div>
            <div className="login-field">
              <label className="reg-label">CVC</label>
              <input
                type="text"
                placeholder="123"
                value={p.card_cvc}
                onChange={e => { setPayment({ card_cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }); setErr(x => ({ ...x, card_cvc: undefined })); }}
                className={`login-input${err.card_cvc ? ' login-input--error' : ''}`}
                autoComplete="cc-csc"
              />
              {err.card_cvc && <span className="login-field-err">{err.card_cvc}</span>}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="login-field">
            <label className="reg-label">Mobile money provider</label>
            <Select value={p.mobile_provider} onValueChange={v => setPayment({ mobile_provider: v })}>
              <SelectTrigger aria-label="Mobile money provider" className="login-input"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOBILE_PROVIDERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="login-field">
            <label className="reg-label">Mobile number</label>
            <input
              type="tel"
              placeholder="+255 7XX XXX XXX"
              value={p.mobile_number}
              onChange={e => { setPayment({ mobile_number: e.target.value }); setErr(x => ({ ...x, mobile_number: undefined })); }}
              className={`login-input${err.mobile_number ? ' login-input--error' : ''}`}
              autoComplete="tel"
            />
            {err.mobile_number && <span className="login-field-err">{err.mobile_number}</span>}
          </div>
        </>
      )}

      <p className="ob-payment-note">This is a demo checkout — no real charge will be made.</p>

      <div className="login-form-actions">
        <button type="button" onClick={onBack} className="login-back-btn">Back</button>
        <button type="submit" className="login-submit-btn">Continue</button>
      </div>
    </form>
  );
};
