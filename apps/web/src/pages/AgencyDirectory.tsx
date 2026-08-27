import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import type { OnsiteAgencyProfile, AgencyPricingTier } from '@hudumika/types';
import './AgencyDirectory.css';

const TIER_LABEL: Record<AgencyPricingTier, string> = {
  budget: 'Budget-friendly',
  standard: 'Standard',
  premium: 'Premium',
};

export function AgencyDirectory() {
  const [profiles, setProfiles] = useState<OnsiteAgencyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<AgencyPricingTier | ''>('');
  const [region, setRegion] = useState('');
  const [serviceTag, setServiceTag] = useState('');
  const [activeInquiry, setActiveInquiry] = useState<OnsiteAgencyProfile | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (tier) params.set('pricing_tier', tier);
    if (region.trim()) params.set('region', region.trim());
    if (serviceTag.trim()) params.set('service_tag', serviceTag.trim());
    const qs = params.toString();
    apiFetch(`/v1/agency-directory${qs ? `?${qs}` : ''}`)
      .then((res: any) => setProfiles(Array.isArray(res) ? res : []))
      .catch((err: any) => setError(err.message ?? 'Could not load the directory.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tier, region, serviceTag]);

  const regions = Array.from(new Set(profiles.map(p => p.region).filter(Boolean))) as string[];

  return (
    <div className="ad-page">
      <header className="ad-topbar">
        <div className="ad-topbar-inner">
          <Link to="/" className="ad-brand">Hudumika <span>Agency Directory</span></Link>
          <nav className="ad-topbar-links">
            <Link to="/login">Sign in</Link>
            <Link to="/signup">List your agency</Link>
          </nav>
        </div>
      </header>

      <section className="ad-hero">
        <div className="ad-hero-inner">
          <div className="ad-eyebrow"><span className="ad-eyebrow-dot" />Hosting &amp; web agencies · Tanzania &amp; East Africa</div>
          <h1>Find an agency to run your hosting.</h1>
          <p>Every agency below manages real client sites on Hudumika Onsite — browse by specialty, budget and region, then reach out directly.</p>
        </div>
      </section>

      <div className="ad-filters">
        <div className="ad-filter-search">
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="Search agencies…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <select value={tier} onChange={e => setTier(e.target.value as AgencyPricingTier | '')} className="ad-filter-select">
          <option value="">Any budget</option>
          <option value="budget">Budget-friendly</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
        {regions.length > 0 && (
          <select value={region} onChange={e => setRegion(e.target.value)} className="ad-filter-select">
            <option value="">Any region</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {serviceTag && (
          <button type="button" className="ad-filter-chip" onClick={() => setServiceTag('')}>
            <Icon name="tag" size={12} />{serviceTag}<Icon name="x" size={12} />
          </button>
        )}
      </div>

      <main className="ad-grid-wrap">
        {loading ? (
          <div className="ad-empty">Loading agencies…</div>
        ) : error ? (
          <div className="ad-empty">Couldn't load the directory ({error}).</div>
        ) : profiles.length === 0 ? (
          <div className="ad-empty">
            <Icon name="briefcase" size={32} />
            <h3>No agencies match yet</h3>
            <p>Try a different search, or check back soon — agencies are reviewed before they're listed here.</p>
          </div>
        ) : (
          <div className="ad-grid">
            {profiles.map(p => (
              <article key={p.id} className="ad-card">
                <div className="ad-card-top">
                  <h3>{p.headline}</h3>
                  <span className={`ad-tier ad-tier-${p.pricing_tier}`}>{TIER_LABEL[p.pricing_tier]}</span>
                </div>
                <p className="ad-card-desc">{p.description}</p>
                <div className="ad-card-meta">
                  {p.region && <span><Icon name="mapPin" size={13} />{p.region}</span>}
                  <span><Icon name="users" size={13} />{p.client_count ?? 0} client{p.client_count === 1 ? '' : 's'} managed</span>
                  {p.languages.length > 0 && <span><Icon name="globe" size={13} />{p.languages.join(', ')}</span>}
                </div>
                {p.service_tags.length > 0 && (
                  <div className="ad-card-tags">
                    {p.service_tags.slice(0, 6).map(t => (
                      <button
                        key={t}
                        type="button"
                        className={`ad-tag${serviceTag === t ? ' ad-tag-active' : ''}`}
                        onClick={() => setServiceTag(serviceTag === t ? '' : t)}
                      >
                        <Icon name="tag" size={11} />{t}
                      </button>
                    ))}
                  </div>
                )}
                {p.portfolio_links.length > 0 && (
                  <div className="ad-card-portfolio">
                    {p.portfolio_links.slice(0, 3).map(url => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        <Icon name="link" size={12} />{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    ))}
                  </div>
                )}
                <div className="ad-card-footer">
                  <span className="ad-card-agency" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CompanyAvatar name={p.tenant_name ?? ''} logoUrl={p.tenant_logo_url} size={22} shape="square" />
                    {p.tenant_name}
                  </span>
                  <button type="button" className="ad-btn-contact" onClick={() => setActiveInquiry(p)}>
                    <Icon name="send" size={14} />Contact
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {activeInquiry && (
        <InquiryModal profile={activeInquiry} onClose={() => setActiveInquiry(null)} />
      )}
    </div>
  );
}

function InquiryModal({ profile, onClose }: { profile: OnsiteAgencyProfile; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = name.trim() && email.trim() && message.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiFetch(`/v1/agency-directory/${profile.id}/inquire`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      setSent(true);
    } catch (err: any) {
      showAlert(err.message || 'Could not send your message — please try again.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ad-modal-backdrop" onClick={onClose}>
      <div className="ad-modal" onClick={e => e.stopPropagation()}>
        <div className="ad-modal-header">
          <h3>Contact {profile.tenant_name}</h3>
          <button type="button" className="ad-modal-close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        {sent ? (
          <div className="ad-modal-sent">
            <Icon name="checkCircle" size={32} />
            <p>Your message is on its way to {profile.tenant_name}. They'll reach out to you directly at {email}.</p>
            <button type="button" className="ad-btn-contact" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="ad-modal-form">
            <label>Your name
              <input type="text" value={name} onChange={e => setName(e.target.value)} required />
            </label>
            <label>Your email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </label>
            <label>What do you need help with?
              <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} required />
            </label>
            <button type="submit" className="ad-btn-contact" disabled={!canSubmit}>
              {submitting ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
