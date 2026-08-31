import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { slugify } from './types.js';
import type { StepProps } from './types.js';
import type { SubdomainCheckResponse } from '@hudumika/types';

export const StepDomain: React.FC<StepProps> = ({ draft, update, onNext, onBack }) => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [reason, setReason] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFilled   = useRef(false);

  // Auto-suggest a subdomain from the company name, once, the first time this step is shown
  useEffect(() => {
    if (!autoFilled.current && !draft.subdomain && draft.companyName) {
      update({ subdomain: slugify(draft.companyName) });
      autoFilled.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = draft.subdomain;
    if (!value || value.length < 3) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res: SubdomainCheckResponse = await apiFetch(`/v1/onboarding/check-subdomain?value=${encodeURIComponent(value)}`);
        setStatus(res.available ? 'available' : 'taken');
        setReason(res.reason);
      } catch {
        setStatus('idle');
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft.subdomain]);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (status !== 'available') return;
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form">
      <div className="login-field">
        <label className="reg-label">Choose your workspace address</label>
        <div className="ob-domain-row">
          <input
            type="text"
            placeholder="mycompany"
            value={draft.subdomain}
            onChange={e => update({ subdomain: slugify(e.target.value) })}
            className={`login-input ob-domain-input${status === 'taken' ? ' login-input--error' : ''}`}
            autoComplete="off"
          />
          <span className="ob-domain-suffix">.hudumika.tz</span>
        </div>
        {status === 'checking' && <span className="ob-field-status ob-field-status--checking">Checking availability…</span>}
        {status === 'available' && <span className="ob-field-status ob-field-status--ok"><Icon name="checkCircle" size={14} /> {draft.subdomain}.hudumika.tz is available</span>}
        {status === 'taken' && <span className="login-field-err">{reason || 'This subdomain is already taken'}</span>}
      </div>

      <div className="login-form-actions">
        <button type="button" onClick={onBack} className="login-back-btn">Back</button>
        <button type="submit" className="login-submit-btn" disabled={status !== 'available'}>Continue</button>
      </div>
    </form>
  );
};
