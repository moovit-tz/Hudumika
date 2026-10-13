import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { OnsiteDashboard } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import './Onsite.css';
import { Tip } from '../../components/ui/tooltip.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';

export function OnsiteOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<OnsiteDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadOverview = () => {
    setLoading(true);
    setLoadError('');
    apiFetch('/v1/onsite/overview')
      .then(setData)
      .catch(error => setLoadError(error.message || 'Unable to load infrastructure status'))
      .finally(() => setLoading(false));
  };
  useEffect(loadOverview, []);

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;
    const lower = promptText.toLowerCase();
    if (lower.includes('domain')) {
      navigate(`/onsite/domains/search?query=${encodeURIComponent(promptText)}`);
    } else if (lower.includes('site') || lower.includes('website')) {
      navigate('/onsite/websites');
    } else if (lower.includes('email') || lower.includes('mail')) {
      navigate('/onsite/emails');
    } else if (lower.includes('vps') || lower.includes('server')) {
      navigate('/onsite/servers');
    } else {
      navigate('/onsite/applications');
    }
  };

  const userName = user?.name ? user.name.split(' ')[0] : 'there';

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Overview']}
        titlePlain="Infrastructure"
        titleEm="overview"
        subtitle="Domains, websites, servers, applications and everything else running your infrastructure."
      />

      {loadError && <Banner variant="error" title="Infrastructure status unavailable" action={<Button variant="outline" onClick={loadOverview}>Retry</Button>}>{loadError}</Banner>}
      {/* Hostinger AI Greeting & Prompt Hero */}
      <div className="onsite-hero-greeting">
        <h2>Hi, {userName}! How can I help you today?</h2>
        <form onSubmit={handlePromptSubmit} className="onsite-prompt-box">
          <input
            type="text"
            className="onsite-prompt-input"
            placeholder="Find domains, websites, email, or servers"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          <Tip label="Find a service">
            <button type="submit" className="onsite-prompt-submit" aria-label="Find a service" data-ui-native-button="">
              <Icon name="arrowRight" size={16} />
            </button>
          </Tip>
        </form>

        {/* Quick Action Tag Pills */}
        <div className="onsite-prompt-pills">
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/domains/search')} data-ui-native-button="">
            <Icon name="globe" size={14} /> Get domain
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/websites')} data-ui-native-button="">
            <Icon name="layoutDashboard" size={14} /> Website records
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/emails')} data-ui-native-button="">
            <Icon name="mail" size={14} /> Email configuration
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/applications')} data-ui-native-button="">
            <Icon name="terminal" size={14} /> Applications
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/websites')} data-ui-native-button="">
            <Icon name="refresh" size={14} /> Website inventory
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/servers')} data-ui-native-button="">
            <Icon name="monitor" size={14} /> Track servers
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/emails')} data-ui-native-button="">
            <Icon name="send" size={14} /> Mail DNS
          </button>
        </div>
      </div>

      {/* Hostinger 3-Card Feature Banners */}
      <div className="onsite-feature-banners">
        {/* Banner 1: AI Website Builder */}
        <div className="onsite-feature-banner onsite-banner-ai">
          <div>
            <h3>Organize your websites</h3>
            <p>Track website configuration and domain links. Adding a record does not provision hosting or install a CMS.</p>
          </div>
          <Button onClick={() => navigate('/onsite/websites')}>
            Manage websites
          </Button>
        </div>

        {/* Banner 2: Ecommerce */}
        <div className="onsite-feature-banner onsite-banner-store">
          <div>
            <h3>Connect a deployment provider</h3>
            <p>Connect an existing provider account to trigger builds and follow real deployment status.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/onsite/settings')}>
            Provider connections
          </Button>
        </div>

        {/* Banner 3: Email */}
        <div className="onsite-feature-banner onsite-banner-email">
          <div>
            <h3>Review email configuration</h3>
            <p>Inspect mail DNS and connect an existing mailbox. Mailbox provisioning is not available here.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/onsite/emails')}>
            Review mail records
          </Button>
        </div>
      </div>

      {/* Control Plane Infrastructure Summary */}
      {data && (
        <div style={{ marginTop: '1rem' }}>
          <div className="onsite-header" style={{ marginBottom: '1rem' }}>
            <div className="onsite-header-title">
              <h2>Infrastructure status</h2>
              <p>Recorded resources and certificate expiry checks across your connected services.</p>
            </div>
          </div>

          <div className="onsite-stats-grid">
            <div className="onsite-stat-card">
              <div className="onsite-stat-icon">
                <Icon name="layoutDashboard" size={22} />
              </div>
              <div className="onsite-stat-body">
                <span className="onsite-stat-value">{data.applications}</span>
                <span className="onsite-stat-label">Applications</span>
              </div>
            </div>

            <div className="onsite-stat-card">
              <div className="onsite-stat-icon">
                <Icon name="globe" size={22} />
              </div>
              <div className="onsite-stat-body">
                <span className="onsite-stat-value">{data.domains}</span>
                <span className="onsite-stat-label">Managed Domains</span>
              </div>
            </div>

            <div className="onsite-stat-card">
              <div className="onsite-stat-icon">
                <Icon name="shield" size={22} />
              </div>
              <div className="onsite-stat-body">
                <span className="onsite-stat-value">{data.ssl_expiring_soon}</span>
                <span className="onsite-stat-label">SSL Expiring Within 30 Days</span>
              </div>
            </div>

            <div className="onsite-stat-card">
              <div className="onsite-stat-icon">
                <Icon name="monitor" size={22} />
              </div>
              <div className="onsite-stat-body">
                <span className="onsite-stat-value">{data.servers}</span>
                <span className="onsite-stat-label">Compute VPS Servers</span>
              </div>
            </div>

            <div className="onsite-stat-card">
              <div className="onsite-stat-icon">
                <Icon name="activity" size={22} />
              </div>
              <div className="onsite-stat-body">
                <span className="onsite-stat-value">{data.health_checks}</span>
                <span className="onsite-stat-label">Configured Uptime Probes</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
