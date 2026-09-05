import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { OnsiteAgencyProfile, AgencyPricingTier } from '@hudumika/types';
import './Onsite.css';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Live in directory',
  rejected: 'Changes requested',
};
const STATUS_BADGE: Record<string, string> = {
  pending: 'pending',
  approved: 'active',
  rejected: 'failed',
};

interface FormState {
  headline: string;
  description: string;
  service_tags: string;
  portfolio_links: string;
  pricing_tier: AgencyPricingTier;
  region: string;
  languages: string;
}

const EMPTY_FORM: FormState = {
  headline: '', description: '', service_tags: '', portfolio_links: '',
  pricing_tier: 'standard', region: '', languages: '',
};

function toForm(p: OnsiteAgencyProfile): FormState {
  return {
    headline: p.headline,
    description: p.description,
    service_tags: p.service_tags.join(', '),
    portfolio_links: p.portfolio_links.join(', '),
    pricing_tier: p.pricing_tier,
    region: p.region ?? '',
    languages: p.languages.join(', '),
  };
}

function splitList(v: string): string[] {
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

export function OnsiteAgencyDirectoryProfile() {
  const [profile, setProfile] = useState<OnsiteAgencyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch('/v1/onsite/agency/directory/mine')
      .then((res: OnsiteAgencyProfile | null) => {
        setProfile(res);
        if (res) setForm(toForm(res));
      })
      .catch((err: any) => showAlert(err.message ?? 'Could not load your directory listing.', { variant: 'error' }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const canSubmit = form.headline.trim() && form.description.trim() && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    const body = {
      headline: form.headline.trim(),
      description: form.description.trim(),
      service_tags: splitList(form.service_tags),
      portfolio_links: splitList(form.portfolio_links),
      pricing_tier: form.pricing_tier,
      region: form.region.trim() || undefined,
      languages: splitList(form.languages),
    };
    try {
      const saved = await apiFetch('/v1/onsite/agency/directory/mine', {
        method: profile ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      setProfile(saved);
      setForm(toForm(saved));
      showAlert('Listing saved — it goes back to review before it reappears in the public directory.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message ?? 'Could not save your listing.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Agency', 'Directory listing']}
        titlePlain="Directory"
        titleEm="listing"
        subtitle="Your public profile in the Hudumika agency directory — prospective clients browse and contact you directly from here."
      />

      {loading ? (
        <div className="onsite-card"><SectionLoading /></div>
      ) : (
        <>
          {profile && (
            <div className="onsite-card" style={{ marginBottom: '1rem' }}>
              <div className="onsite-card-header">
                <h3 className="onsite-card-title">
                  <Icon name="briefcase" size={16} />Status
                </h3>
                <span className={`onsite-badge ${STATUS_BADGE[profile.status]}`}>{STATUS_LABEL[profile.status]}</span>
              </div>
              {profile.status === 'approved' && (
                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.8125rem', color: 'var(--ink2)' }}>
                  <span><strong style={{ color: 'var(--ink)' }}>{profile.profile_views}</strong> profile views</span>
                  <span><strong style={{ color: 'var(--ink)' }}>{profile.inquiries_count}</strong> inquiries received</span>
                  <span><strong style={{ color: 'var(--ink)' }}>{profile.client_count ?? 0}</strong> clients managed</span>
                </div>
              )}
              {profile.status === 'pending' && (
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink2)' }}>
                  A Hudumika moderator reviews new and edited listings before they go live — this usually doesn't take long.
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="onsite-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="onsite-form-group">
              <label>Headline *</label>
              <input
                className="onsite-input"
                value={form.headline}
                maxLength={200}
                placeholder="Full-service hosting &amp; support for growing businesses"
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                required
              />
            </div>
            <div className="onsite-form-group">
              <label>Description *</label>
              <textarea
                className="onsite-textarea"
                rows={4}
                value={form.description}
                placeholder="What you offer, who you work best with, and what makes your agency different."
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Pricing tier</label>
                <Select value={form.pricing_tier} onValueChange={v => setForm(f => ({ ...f, pricing_tier: v as AgencyPricingTier }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="budget">Budget-friendly</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="onsite-form-group">
                <label>Region</label>
                <input
                  className="onsite-input"
                  value={form.region}
                  maxLength={100}
                  placeholder="Dar es Salaam, Tanzania"
                  onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                />
              </div>
            </div>
            <div className="onsite-form-group">
              <label>Service tags (comma-separated)</label>
              <input
                className="onsite-input"
                value={form.service_tags}
                placeholder="WordPress, Ecommerce, Migrations"
                onChange={e => setForm(f => ({ ...f, service_tags: e.target.value }))}
              />
            </div>
            <div className="onsite-form-group">
              <label>Languages (comma-separated)</label>
              <input
                className="onsite-input"
                value={form.languages}
                placeholder="English, Swahili"
                onChange={e => setForm(f => ({ ...f, languages: e.target.value }))}
              />
            </div>
            <div className="onsite-form-group">
              <label>Portfolio links (comma-separated URLs)</label>
              <input
                className="onsite-input"
                value={form.portfolio_links}
                placeholder="https://example.com/case-study"
                onChange={e => setForm(f => ({ ...f, portfolio_links: e.target.value }))}
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {saving ? 'Saving…' : profile ? 'Save changes' : 'Submit for review'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
