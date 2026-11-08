import { useLocale } from '../../hooks/useLocale.js';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { COUNTRIES } from '@hudumika/types';
import type { StepProps, OnboardingIndustry, OnboardingDraft } from './types.js';
import { ACCEPTED_REGISTRY_INDUSTRIES } from './types.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../../components/ui/command.js';

const JOURNEY_FOR_INDUSTRY: Record<string, string> = {
  logistics: 'logistics', warehousing: 'logistics',
  wholesale: 'distribution', manufacturing: 'distribution', printing: 'distribution', food_beverage: 'distribution',
  retail: 'retail', ecommerce: 'retail', restaurant: 'retail', hospitality: 'retail', automotive: 'retail',
};

function comboboxFilter(value: string, search: string): number {
  const v = value.toLowerCase();
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  if (v === q) return 1;
  if (v.startsWith(q)) return 0.9;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(v)) return 0.7;
  if (v.includes(q)) return 0.4;
  return 0;
}

export const StepCompany: React.FC<StepProps> = ({
  draft,
  update,
  onNext,
  onBack,
  journeys,
  industries = [],
  industriesLoading,
  industriesError,
  onRetryIndustries,
}) => {
  const { t } = useLocale();
  const [industryOpen, setIndustryOpen] = useState(false);
  const industryTrigger = useRef<HTMLButtonElement>(null);
  const [industryTheme, setIndustryTheme] = useState<React.CSSProperties>({});
  function openIndustries(open: boolean) {
    if (open && industryTrigger.current) {
      const computed = getComputedStyle(industryTrigger.current);
      const properties = ['--lp-ink', '--lp-ink2', '--lp-ink3', '--lp-input-bg', '--lp-input-border', '--lp-row-border', '--lp-card-bg', '--lp-link-accent', '--lp-accent-surface', '--lp-accent-surface-fg', '--lp-tabs-bg', '--font', '--teal', '--teal-l'];
      setIndustryTheme(Object.fromEntries(properties.map(key => [key, computed.getPropertyValue(key)])) as React.CSSProperties);
    }
    setIndustryOpen(open);
  }
  const [error, setError] = useState<string | null>(null);
  const [companyStatus, setCompanyStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [checkingCompany, setCheckingCompany] = useState(false);
  useEffect(() => {
    let active = true;
    setCompanyStatus('idle');
    if (draft.companyName.trim().length < 2) return;
    const timer = setTimeout(async () => {
      setCompanyStatus('checking');
      try {
        const result = await apiFetch('/v1/onboarding/check-company', { method: 'POST', body: JSON.stringify({ name: draft.companyName, country: draft.country, ondi_ticket: draft.ondi_ticket }) });
        if (active) setCompanyStatus(result.available ? 'available' : 'taken');
      } catch { if (active) setCompanyStatus('error'); }
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [draft.companyName, draft.country, draft.ondi_ticket]);

  // Guarantee all 20 accepted registry industries are present
  const availableIndustries = useMemo<OnboardingIndustry[]>(() => {
    const list = industries && industries.length > 0 ? industries : ACCEPTED_REGISTRY_INDUSTRIES;
    const map = new Map<string, OnboardingIndustry>();
    for (const ind of list) {
      map.set(ind.key, ind);
    }
    for (const fallback of ACCEPTED_REGISTRY_INDUSTRIES) {
      if (!map.has(fallback.key)) {
        map.set(fallback.key, fallback);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [industries]);

  // Selected industry keys array
  const selectedKeys = useMemo<string[]>(() => {
    if (Array.isArray(draft.industries) && draft.industries.length > 0) {
      return draft.industries;
    }
    if (draft.industry) {
      return [draft.industry];
    }
    return [];
  }, [draft.industries, draft.industry]);

  const primaryKey = draft.industry || (selectedKeys.length > 0 ? selectedKeys[0] : '');

  // Synchronize draft when keys reconcile
  useEffect(() => {
    if (selectedKeys.length > 0 && (!draft.industries?.length || draft.industry !== primaryKey)) {
      update({ industries: selectedKeys, industry: primaryKey });
    }
  }, [selectedKeys, primaryKey, draft.industries, draft.industry, update]);

  function toggleIndustry(key: string) {
    setError(null);
    let nextKeys: string[];
    let nextPrimary = primaryKey;

    if (selectedKeys.includes(key)) {
      nextKeys = selectedKeys.filter(k => k !== key);
      if (nextPrimary === key) {
        nextPrimary = nextKeys[0] || '';
      }
    } else {
      nextKeys = [...selectedKeys, key];
      if (!nextPrimary) {
        nextPrimary = key;
      }
    }

    const journeyKey = JOURNEY_FOR_INDUSTRY[nextPrimary] ?? (journeys?.some(item => item.industry_key === nextPrimary) ? nextPrimary : 'services');
    const journey = journeys?.find(item => item.industry_key === journeyKey);
    const indObj = availableIndustries.find(item => item.key === nextPrimary);

    const patch: Partial<OnboardingDraft> = {
      industry: nextPrimary,
      industries: nextKeys,
      onboarding_journey: journey?.industry_key ?? '',
    };

    const recommendation = indObj?.recommended_package_code ?? journey?.recommended_package_code;
    if (recommendation && !draft.package_code && !draft.initial_products.length) {
      patch.package_code = recommendation;
    }

    update(patch);
  }

  function setPrimary(key: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!selectedKeys.includes(key)) return;

    const journeyKey = JOURNEY_FOR_INDUSTRY[key] ?? (journeys?.some(item => item.industry_key === key) ? key : 'services');
    const journey = journeys?.find(item => item.industry_key === journeyKey);
    const indObj = availableIndustries.find(item => item.key === key);

    const patch: Partial<OnboardingDraft> = {
      industry: key,
      onboarding_journey: journey?.industry_key ?? '',
    };

    const recommendation = indObj?.recommended_package_code ?? journey?.recommended_package_code;
    if (recommendation && !draft.package_code && !draft.initial_products.length) {
      patch.package_code = recommendation;
    }

    update(patch);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.companyName.trim()) {
      setError(t('onboarding.companyRequired'));
      return;
    }
    if (selectedKeys.length === 0 || !primaryKey) {
      setError(t('onboarding.industryRequired'));
      return;
    }
    if (!draft.country) {
      setError(t('onboarding.countryRequired'));
      return;
    }

    setCheckingCompany(true);
    try {
      const result = await apiFetch('/v1/onboarding/check-company', { method: 'POST', body: JSON.stringify({ name: draft.companyName, country: draft.country, ondi_ticket: draft.ondi_ticket }) });
      if (!result.available) {
        setCompanyStatus('taken');
        setError(t('onboarding.duplicateError'));
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.checkError'));
      return;
    } finally { setCheckingCompany(false); }
    setError(null);
    update({
      companyName: draft.companyName.trim(),
      industry: primaryKey,
      industries: selectedKeys,
    });
    onNext();
  }

  return (
    <form onSubmit={submit} noValidate className="login-form ob-company-form">
      {error && <Banner variant="error">{error}</Banner>}

      <div className="ob-company-grid">
        {/* ── Left Column: Field Entry ── */}
        <div className="ob-company-col ob-company-col--fields">
          <div className="ob-step-intro">
            <h2>{t('onboarding.businessTitle')}</h2>
            <p>{t('onboarding.businessIntro')}</p>
          </div>

          <section className="ob-company-section" aria-labelledby="company-details-heading">
            <h3 id="company-details-heading">{t('onboarding.businessDetails')}</h3>
            <div className="login-field">
              <Label htmlFor="signup-company-name" className="reg-label">{t('onboarding.companyName')}</Label>
              <Input
                id="signup-company-name"
                className="login-input"
                data-entity-status={companyStatus}
                aria-invalid={companyStatus === 'taken'}
                aria-describedby="company-entity-status"
                value={draft.companyName}
                maxLength={200}
                autoComplete="organization"
                placeholder={t('onboarding.companyPlaceholder')}
                onChange={event => { update({ companyName: event.target.value }); setError(null); }}
              />
              <div id="company-entity-status" role="status" aria-live="polite" aria-atomic="true">
                {companyStatus !== 'idle' && (
                  <Banner
                    className="ob-entity-status"
                    role="presentation"
                    variant={companyStatus === 'available' ? 'success' : companyStatus === 'taken' ? 'error' : companyStatus === 'error' ? 'warning' : 'info'}
                    title={companyStatus === 'available' ? t('onboarding.available') : companyStatus === 'taken' ? t('onboarding.taken') : companyStatus === 'error' ? t('onboarding.unavailable') : t('onboarding.checkingEntity')}
                  >
                    {companyStatus === 'available' ? t('onboarding.availableDetail')
                      : companyStatus === 'taken' ? t('onboarding.takenDetail')
                      : companyStatus === 'error' ? t('onboarding.retryDetail')
                      : t('onboarding.checkingDetail')}
                  </Banner>
                )}
              </div>
            </div>
            <fieldset className="ob-picker-field">
              <legend className="reg-label">{t('onboarding.country')}</legend>
              <Combobox
                options={[...COUNTRIES.map(item => ({ value: item.name, label: item.name })), { value: 'Other', label: 'Other' }]}
                value={draft.country}
                onChange={country => update({ country, hq_country: country })}
                placeholder={t('onboarding.searchCountries')}
                searchPlaceholder={t('onboarding.findCountry')}
                triggerClassName="login-input"
              />
              <p className="ob-field-help">{t('onboarding.countryHelp')}</p>
            </fieldset>
          </section>
        </div>

        {/* ── Right Column: Industry Selection ── */}
        <div className="ob-company-col ob-company-col--industry">
          <section className="ob-company-section" aria-labelledby="company-industry-heading">
            <div className="ob-section-heading">
              <h3 id="company-industry-heading">{t('onboarding.industry')}</h3>
              {!industriesLoading && !industriesError && (
                <span className="ob-industry-count-badge">
                  ({t('onboarding.industryCount', { count: availableIndustries.length })})
                </span>
              )}
            </div>
            <p className="ob-field-help">
              {t('onboarding.industryHelp')}
            </p>

            {industriesLoading ? (
              <SectionLoading />
            ) : industriesError && !availableIndustries.length ? (
              <Banner variant="error">
                <p>{industriesError}</p>
                <Button type="button" variant="outline" size="sm" onClick={onRetryIndustries}>
                  {t('onboarding.reloadIndustries')}
                </Button>
              </Banner>
            ) : (
              <fieldset className="ob-picker-field">
                <legend className="sr-only">{t('onboarding.industrySelection')}</legend>
                <Popover open={industryOpen} onOpenChange={openIndustries}>
                  <PopoverTrigger asChild>
                    <Button ref={industryTrigger} type="button" variant="outline" className="ob-industry-trigger" aria-label={t('onboarding.industrySelection')}>
                      <span>{selectedKeys.length
                        ? `${availableIndustries.find(ind => ind.key === primaryKey)?.name || primaryKey}${selectedKeys.length > 1 ? ` +${selectedKeys.length - 1}` : ''}`
                        : t('onboarding.industrySelection')}</span>
                      <Icon name="chevronDown" size={16} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="ob-industry-browser ob-industry-dropdown" style={industryTheme}>
                    <Command filter={comboboxFilter}>
                      <CommandInput placeholder={`Search ${t('onboarding.industryCount', { count: availableIndustries.length })}…`} />
                      <CommandList className="ob-industry-list">
                        <CommandEmpty className="py-5 text-center text-xs text-[var(--lp-ink3)]">
                          {t('onboarding.noIndustry')}
                        </CommandEmpty>
                        <CommandGroup>
                          {availableIndustries.map(ind => {
                            const isSelected = selectedKeys.includes(ind.key);
                            const isPrimary = ind.key === primaryKey;

                            return (
                              <CommandItem
                                key={ind.key}
                                value={`${ind.name} ${ind.description ?? ''} ${ind.key}`}
                                onSelect={() => toggleIndustry(ind.key)}
                                data-picked={isSelected}
                                className="ob-industry-option cursor-pointer flex items-start gap-2.5 text-xs"
                              >
                                <div className="ob-industry-check" aria-hidden="true">
                                  {isSelected && <Icon name="check" size={11} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="ob-industry-name font-semibold text-sm">
                                      {ind.name}
                                    </span>
                                    {isPrimary && (
                                      <Badge variant="brand">
                                        {t('onboarding.primary')}
                                      </Badge>
                                    )}
                                  </div>
                                  {ind.description && (
                                    <p className="text-[11.5px] text-[var(--lp-ink3)] leading-tight mt-0.5">
                                      {ind.description}
                                    </p>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </fieldset>
            )}

            {/* Selected Industry Chips */}
            {selectedKeys.length > 0 && (
              <div className="ob-industry-selections flex flex-wrap gap-1.5">
                {selectedKeys.map(k => {
                  const ind = availableIndustries.find(i => i.key === k);
                  const isPrimary = k === primaryKey;
                  return (
                    <span
                      key={k}
                      className="ob-industry-chip"
                      data-primary={isPrimary}
                    >
                      <span>{ind?.name || k}</span>
                      {isPrimary ? (
                        <span className="text-[9.5px] font-bold uppercase tracking-wide opacity-80">(Primary)</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => setPrimary(k, e)}
                          className="text-[10px] text-[var(--lp-ink3)] hover:text-[var(--teal,#0d7a6b)] underline cursor-pointer"
                          title={t('onboarding.primaryTitle')}
                        >
                          {t('onboarding.makePrimary')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleIndustry(k)}
                        className="text-[var(--lp-ink3)] hover:text-red-600 cursor-pointer ml-0.5 text-xs font-bold leading-none"
                        aria-label={`Remove ${ind?.name || k}`}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

          </section>
        </div>
      </div>

      {/* ── Form Actions ── */}
      <div className="login-form-actions ob-company-actions">
        <Button type="button" onClick={onBack} variant="ghost">
          {t('onboarding.back')}
        </Button>
        <Button
          type="submit"
          disabled={checkingCompany || companyStatus === 'taken' || industriesLoading || Boolean(industriesError) || selectedKeys.length === 0}
        >
          {checkingCompany ? t('onboarding.checking') : t('onboarding.continue')}
        </Button>
      </div>
    </form>
  );
};
