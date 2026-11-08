import React from 'react';
import { useLocale } from '../../hooks/useLocale.js';
import { signupPackageAmount } from '@hudumika/types';
import { formatAmount } from '../../lib/currency.js';
import type { StepProps } from './types.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Link } from 'react-router-dom';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';

const TIMEZONES = ['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'Africa/Kigali', 'Africa/Lusaka'];
const CURRENCIES = ['TZS', 'KES', 'UGX', 'RWF', 'ZMW', 'USD'];

export const StepConfiguration: React.FC<StepProps> = ({
  draft,
  update,
  onNext,
  onBack,
  packages,
  submitting,
  industries = [],
  onEditStep,
  gatewayConfigured,
}) => {
  const pkg = packages.find(p => p.code === draft.package_code);
  const planPrice = pkg
    ? `${pkg.name} · ${formatAmount(signupPackageAmount(pkg, draft.billing_cycle), pkg.currency)}/${draft.billing_cycle === 'annual' ? 'yr' : 'mo'}`
    : draft.package_code === 'workspace-free' ? 'Hudumika Workspace · Included' : 'Select a plan';

  const maskedCard = draft.payment.method === 'card' && draft.payment.card_number
    ? `Card ending in •••• ${draft.payment.card_number.replace(/\s/g, '').slice(-4)}`
    : draft.payment.method === 'mpesa' ? `${draft.payment.mobile_provider} (${draft.payment.mobile_number || 'Mobile Money'})` : '';

  const selectedIndKeys = Array.isArray(draft.industries) && draft.industries.length
    ? draft.industries
    : draft.industry ? [draft.industry] : [];

  const selectedIndObjects = selectedIndKeys.map(k => {
    const found = industries.find(item => item.key === k);
    return {
      key: k,
      name: found?.name || k,
      isPrimary: k === draft.industry,
    };
  });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="login-form ob-review-form">
      <div className="ob-step-intro">
        <h2>Review &amp; launch your workspace</h2>
        <p>Confirm your business details, tailored apps suite, workspace address, and billing before launch.</p>
      </div>

      {/* ── Structured Review Sections with Edit Links ── */}
      <div className="ob-review-sections">
        {/* Section 1: Account / Identity */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <div className="ob-review-card-title">
              <Icon name="user" size={15} className="text-[var(--lp-ink3)]" />
              <span>Identity &amp; Account</span>
            </div>
            <button
              type="button"
              className="ob-review-edit-link"
              onClick={() => onEditStep?.(1)}
              disabled={submitting}
              aria-label="Edit account identity"
            >
              <Icon name="edit" size={12} />
              <span>Edit</span>
            </button>
          </div>
          <div className="ob-review-card-content">
            <div className="ob-review-field">
              <span className="ob-review-field-label">Full Name</span>
              <strong className="ob-review-field-value">{draft.name || '—'}</strong>
            </div>
            <div className="ob-review-field">
              <span className="ob-review-field-label">Verified Email</span>
              <strong className="ob-review-field-value">{draft.email || '—'}</strong>
            </div>
          </div>
        </div>

        {/* Section 2: Business & Industries */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <div className="ob-review-card-title">
              <Icon name="building" size={15} className="text-[var(--lp-ink3)]" />
              <span>Business &amp; Industries</span>
            </div>
            <button
              type="button"
              className="ob-review-edit-link"
              onClick={() => onEditStep?.(2)}
              disabled={submitting}
              aria-label="Edit business and industry details"
            >
              <Icon name="edit" size={12} />
              <span>Edit</span>
            </button>
          </div>
          <div className="ob-review-card-content">
            <div className="ob-review-field">
              <span className="ob-review-field-label">Organization</span>
              <strong className="ob-review-field-value">{draft.companyName || '—'}</strong>
            </div>
            <div className="ob-review-field">
              <span className="ob-review-field-label">Country</span>
              <strong className="ob-review-field-value">{draft.country}</strong>
            </div>
            <div className="ob-review-field col-span-2">
              <span className="ob-review-field-label">
                Selected Industries ({selectedIndObjects.length})
              </span>
              <div className="ob-review-industries-chips">
                {selectedIndObjects.map(ind => (
                  <span key={ind.key} className={`ob-review-chip${ind.isPrimary ? ' is-primary' : ''}`}>
                    {ind.name}
                    {ind.isPrimary && <Badge variant="success" className="text-[9px] h-3.5 px-1 ml-1 font-bold">Primary</Badge>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Apps & Plan */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <div className="ob-review-card-title">
              <Icon name="layers" size={15} className="text-[var(--lp-ink3)]" />
              <span>Apps &amp; Subscription Plan</span>
            </div>
            <button
              type="button"
              className="ob-review-edit-link"
              onClick={() => onEditStep?.(3)}
              disabled={submitting}
              aria-label="Edit apps and subscription plan"
            >
              <Icon name="edit" size={12} />
              <span>Edit</span>
            </button>
          </div>
          <div className="ob-review-card-content">
            <div className="ob-review-field">
              <span className="ob-review-field-label">Plan Tier</span>
              <strong className="ob-review-field-value text-emerald-600 dark:text-emerald-400">{planPrice}</strong>
            </div>
            <div className="ob-review-field">
              <span className="ob-review-field-label">Billing Cycle</span>
              <strong className="ob-review-field-value capitalize">{draft.billing_cycle}</strong>
            </div>
            <div className="ob-review-field col-span-2">
              <span className="ob-review-field-label">Products &amp; Modules</span>
              <span className="ob-review-field-value text-[12.5px] text-[var(--lp-ink2)]">
                {draft.initial_products.length
                  ? `Standalone products: ${draft.initial_products.join(', ')}`
                  : 'Tailor-made apps suite configured based on your selected industries.'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Workspace Address & Regional Settings */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <div className="ob-review-card-title">
              <Icon name="globe" size={15} className="text-[var(--lp-ink3)]" />
              <span>Workspace &amp; Regional Settings</span>
            </div>
            <button
              type="button"
              className="ob-review-edit-link"
              onClick={() => onEditStep?.(4)}
              disabled={submitting}
              aria-label="Edit workspace address and regional settings"
            >
              <Icon name="edit" size={12} />
              <span>Edit</span>
            </button>
          </div>
          <div className="ob-review-card-content">
            <div className="ob-review-field">
              <span className="ob-review-field-label">Workspace Address</span>
              <strong className="ob-review-field-value font-mono text-[var(--teal,#0d7a6b)]">
                {draft.subdomain}.hudumika.tz
              </strong>
            </div>
            <div className="ob-review-field">
              <span className="ob-review-field-label">Base Currency</span>
              <strong className="ob-review-field-value">{draft.currency}</strong>
            </div>
            <div className="ob-review-field">
              <span className="ob-review-field-label">Operating Timezone</span>
              <span className="ob-review-field-value text-[12px]">{draft.timezone}</span>
            </div>
            {draft.hq_city && (
              <div className="ob-review-field">
                <span className="ob-review-field-label">Headquarters City</span>
                <span className="ob-review-field-value text-[12px]">{draft.hq_city}</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 5: Billing Details */}
        <div className="ob-review-card">
          <div className="ob-review-card-header">
            <div className="ob-review-card-title">
              <Icon name="creditCard" size={15} className="text-[var(--lp-ink3)]" />
              <span>Billing Details</span>
            </div>
            <button
              type="button"
              className="ob-review-edit-link"
              onClick={() => onEditStep?.(5)}
              disabled={submitting}
              aria-label="Edit billing method"
            >
              <Icon name="edit" size={12} />
              <span>Edit</span>
            </button>
          </div>
          <div className="ob-review-card-content">
            <div className="ob-review-field col-span-2">
              <span className="ob-review-field-label">Payment Method</span>
              <strong className="ob-review-field-value">
                {draft.package_code === 'workspace-free' || (pkg && signupPackageAmount(pkg, draft.billing_cycle) === 0)
                  ? 'No payment required (Free Workspace)'
                  : gatewayConfigured
                    ? 'Secure Hosted Checkout (Flutterwave)'
                    : maskedCard || 'Card / Mobile Money setup'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Privacy Policy Acknowledgement ── */}
      <label className="flex items-start gap-3 text-sm text-[var(--lp-ink2)] my-3">
        <Checkbox
          checked={draft.privacy_acknowledged}
          onCheckedChange={checked => update({ privacy_acknowledged: checked === true })}
          disabled={!draft.privacy_policy_version_id || submitting}
          aria-label="Acknowledge the Privacy Policy"
        />
        <span>
          I acknowledge that I have reviewed the current{' '}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--lp-link-accent)] underline">
            Privacy Policy
          </Link>.
          This configures my tenant under Hudumika data governance.
        </span>
      </label>

      {/* ── Form Actions ── */}
      <div className="login-form-actions">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={submitting || !draft.privacy_policy_version_id || !draft.privacy_acknowledged}
        >
          {submitting ? 'Creating your workspace…' : 'Launch Workspace'}
        </Button>
      </div>
    </form>
  );
};

export function WorkspaceSettings({ draft, update }: Pick<StepProps, 'draft' | 'update'>) {
  const { t } = useLocale();
  return (
    <section className="ob-company-section ob-regional-settings" aria-label={t('onboarding.regionalLabel')}>
      <div className="ob-regional-grid">
        <div className="login-field">
          <Label htmlFor="workspace-timezone" className="reg-label">{t('onboarding.timezoneLabel')}</Label>
          <Select value={draft.timezone} onValueChange={v => update({ timezone: v })}>
            <SelectTrigger id="workspace-timezone" aria-label={t('onboarding.timezoneLabel')} className="login-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="login-field">
          <Label htmlFor="workspace-currency" className="reg-label">{t('onboarding.currencyLabel')}</Label>
          <Select value={draft.currency} onValueChange={v => update({ currency: v })}>
            <SelectTrigger id="workspace-currency" aria-label={t('onboarding.currencyLabel')} className="login-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="login-field">
        <Label htmlFor="signup-hq-city" className="reg-label">{t('onboarding.cityLabel')}</Label>
        <Input
          id="signup-hq-city"
          type="text"
          placeholder="e.g. Dar es Salaam"
          value={draft.hq_city}
          onChange={e => update({ hq_city: e.target.value })}
          className="login-input"
        />
      </div>
    </section>
  );
}
