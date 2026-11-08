import { useLocale } from '../../hooks/useLocale.js';
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Button } from '../../components/ui/button.js';
import { slugify } from './types.js';
import { WorkspaceSettings } from './StepConfiguration.js';
import type { StepProps } from './types.js';
import type { SubdomainCheckResponse } from '@hudumika/types';

export const StepDomain: React.FC<StepProps> = ({ draft, update, onNext, onBack }) => {
  const { t } = useLocale();
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
    let active = true;
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
        if (!active) return;
        setStatus(res.available ? 'available' : 'taken');
        setReason(res.reason);
      } catch {
        if (active) setStatus('idle');
      }
    }, 400);
    return () => { active = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft.subdomain]);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (status !== 'available') return;
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form ob-workspace-form">
      <div className="ob-step-intro">
        <p>{t('onboarding.workspaceSummary')}</p>
      </div>
      <div className="login-field">
        <Label htmlFor="workspace-address" className="reg-label">{t('onboarding.addressLabel')}</Label>
        <div className="ob-domain-row" data-status={status}>
          <Input
            id="workspace-address"
            aria-describedby="workspace-domain-status"
            aria-invalid={status === 'taken'}
            type="text"
            placeholder="mycompany"
            value={draft.subdomain}
            onChange={e => update({ subdomain: slugify(e.target.value) })}
            className={`login-input ob-domain-input${status === 'taken' ? ' login-input--error' : ''}`}
            autoComplete="off"
          />
          <span className="ob-domain-suffix">.hudumika.tz</span>
        </div>
        <div id="workspace-domain-status" className="ob-domain-feedback" aria-live="polite">
          {status === 'checking' && <span className="ob-field-status ob-field-status--checking">{t('onboarding.checking')}</span>}
          {status === 'available' && <span className="ob-field-status ob-field-status--ok"><Icon name="checkCircle" size={14} /> {t('onboarding.addressAvailable')}</span>}
          {status === 'taken' && <span className="login-field-err"><Icon name="xCircle" size={14} /> {reason || t('onboarding.addressTaken')}</span>}
        </div>
      </div>

      <WorkspaceSettings draft={draft} update={update} />
      <div className="login-form-actions">
        <Button type="button" onClick={onBack} variant="ghost">{t('onboarding.back')}</Button>
        <Button type="submit" disabled={status !== 'available'}>{t('onboarding.continue')}</Button>
      </div>
    </form>
  );
};
