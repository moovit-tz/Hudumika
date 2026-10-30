import React, { useState } from 'react';
import type { StepProps, OnboardingJourney } from './types.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Icon, type IconName } from '../../components/Icon.js';

const COUNTRIES  = ['Tanzania', 'Kenya', 'Uganda', 'Rwanda', 'Zambia', 'DR Congo', 'Other'];

const JOURNEY_ICONS: Record<string, string> = {
  logistics: 'truck', distribution: 'package', retail: 'shoppingBag', services: 'briefcase',
};

export const StepCompany: React.FC<StepProps> = ({ draft, update, onNext, onBack, journeys }) => {
  const [err, setErr] = useState<string | undefined>();

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft.companyName.trim()) { setErr('Company name is required'); return; }
    setErr(undefined);
    onNext();
  };

  const selectJourney = (j: OnboardingJourney) => {
    update({
      onboarding_journey: j.industry_key,
      industry: j.label,
    });
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

      {/* Industry Journey Picker */}
      {journeys && journeys.length > 0 && (
        <div className="login-field">
          <label className="reg-label">What does your business do?</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 6 }}>
            {journeys.map(j => {
              const selected = draft.onboarding_journey === j.industry_key;
              return (
                <button
                  key={j.industry_key}
                  type="button"
                  onClick={() => selectJourney(j)}
                  data-ui-native-button=""
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                    padding: '14px 16px', borderRadius: 12,
                    border: `2px solid ${selected ? 'var(--lp-link-accent, #0d7a6b)' : 'var(--lp-border, rgba(0,0,0,0.1))'}`,
                    background: selected ? 'var(--lp-surface-active, rgba(13,122,107,0.06))' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <Icon name={(JOURNEY_ICONS[j.industry_key] ?? 'layers') as IconName} size={20} style={{ color: selected ? 'var(--lp-link-accent, #0d7a6b)' : 'var(--lp-ink2, #6b7280)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-ink, #1a1a2e)' }}>{j.label}</span>
                  {j.description && <span style={{ fontSize: 11.5, color: 'var(--lp-ink2, #6b7280)', lineHeight: 1.35 }}>{j.description}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        <button type="button" onClick={onBack} className="login-back-btn" data-ui-native-button="">Back</button>
        <button type="submit" className="login-submit-btn" data-ui-native-button="">Continue</button>
      </div>
    </form>
  );
};
