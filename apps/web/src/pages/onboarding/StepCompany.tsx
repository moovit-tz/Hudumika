import React, { useState } from 'react';
import type { StepProps } from './types.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';

const INDUSTRIES = ['Freight & Logistics', 'Manufacturing', 'Retail & Trade', 'Construction', 'Agriculture', 'Healthcare', 'Technology', 'Other'];
const COUNTRIES  = ['Tanzania', 'Kenya', 'Uganda', 'Rwanda', 'Zambia', 'DR Congo', 'Other'];

export const StepCompany: React.FC<StepProps> = ({ draft, update, onNext, onBack }) => {
  const [err, setErr] = useState<string | undefined>();

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft.companyName.trim()) { setErr('Company name is required'); return; }
    setErr(undefined);
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form">
      <div className="login-field">
        <label className="reg-label">Company name</label>
        <input
          type="text"
          placeholder="Msomi Freight Ltd"
          value={draft.companyName}
          onChange={e => { update({ companyName: e.target.value }); setErr(undefined); }}
          className={`login-input${err ? ' login-input--error' : ''}`}
          autoComplete="organization"
        />
        {err && <span className="login-field-err">{err}</span>}
      </div>

      <div className="login-field">
        <label className="reg-label">Industry</label>
        <Select value={draft.industry || '__none__'} onValueChange={v => update({ industry: v === '__none__' ? '' : v })}>
          <SelectTrigger aria-label="Industry" className="login-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select an industry (optional)</SelectItem>
            {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="login-field">
        <label className="reg-label">Country</label>
        <Select value={draft.country} onValueChange={v => update({ country: v })}>
          <SelectTrigger aria-label="Country" className="login-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="login-form-actions">
        <button type="button" onClick={onBack} className="login-back-btn">Back</button>
        <button type="submit" className="login-submit-btn">Continue</button>
      </div>
    </form>
  );
};
