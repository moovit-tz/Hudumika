import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { OnsiteDashboard } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<OnsiteDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [promptText, setPromptText] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/onsite/overview')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

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
      {/* Hostinger AI Greeting & Prompt Hero */}
      <div className="onsite-hero-greeting">
        <h2>Hi, {userName}! How can I help you today?</h2>
        <form onSubmit={handlePromptSubmit} className="onsite-prompt-box">
          <input
            type="text"
            className="onsite-prompt-input"
            placeholder="Type what you're looking for or ask a question"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          <button type="submit" className="onsite-prompt-submit" title="Ask AI / Search">
            <Icon name="arrowRight" size={16} />
          </button>
        </form>

        {/* Quick Action Tag Pills */}
        <div className="onsite-prompt-pills">
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/domains/search')}>
            <Icon name="globe" size={14} /> Get domain
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/websites')}>
            <Icon name="layoutDashboard" size={14} /> Create website
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/emails')}>
            <Icon name="mail" size={14} /> Get email
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/applications')}>
            <Icon name="terminal" size={14} /> Try vibe coding
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/websites')}>
            <Icon name="refresh" size={14} /> Migrate site
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/servers')}>
            <Icon name="monitor" size={14} /> Get VPS
          </button>
          <button className="onsite-prompt-pill" onClick={() => navigate('/onsite/emails')}>
            <Icon name="send" size={14} /> Try email marketing
          </button>
        </div>
      </div>

      {/* Hostinger 3-Card Feature Banners */}
      <div className="onsite-feature-banners">
        {/* Banner 1: AI Website Builder */}
        <div className="onsite-feature-banner onsite-banner-ai">
          <div>
            <h3>Get your website live – in minutes</h3>
            <p>Just describe your idea and let AI build your site. From portfolios and online stores to business sites and more – get yours online today.</p>
          </div>
          <button className="onsite-btn-black" onClick={() => navigate('/onsite/websites')}>
            Try AI Builder
          </button>
        </div>

        {/* Banner 2: Ecommerce */}
        <div className="onsite-feature-banner onsite-banner-store">
          <div>
            <h3>Build your online store with AI</h3>
            <p>Sell on your site, social media, and more. Manage products, orders, and sales – all from one place.</p>
          </div>
          <button className="onsite-btn-outline" onClick={() => navigate('/onsite/websites')}>
            Get started
          </button>
        </div>

        {/* Banner 3: Email */}
        <div className="onsite-feature-banner onsite-banner-email">
          <div>
            <h3>Claim your free email</h3>
            <p>Show you're a credible business with a professional email address, like <code>you@yourdomain.com</code>.</p>
          </div>
          <button className="onsite-btn-outline" onClick={() => navigate('/onsite/emails')}>
            Claim email
          </button>
        </div>
      </div>

      {/* Control Plane Infrastructure Summary */}
      {data && (
        <div style={{ marginTop: '1rem' }}>
          <div className="onsite-header" style={{ marginBottom: '1rem' }}>
            <div className="onsite-header-title">
              <h1>Infrastructure Status</h1>
              <p>Live health and resource summary across your connected services.</p>
            </div>
          </div>

          <div className="onsite-stats-grid">
            <div className="onsite-stat-card">
              <div className="onsite-stat-icon">
                <Icon name="layoutDashboard" size={22} />
              </div>
              <div className="onsite-stat-body">
                <span className="onsite-stat-value">{data.applications}</span>
                <span className="onsite-stat-label">Websites & Apps</span>
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
                <span className="onsite-stat-value">{data.domains}</span>
                <span className="onsite-stat-label">Active SSL Certificates</span>
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
                <span className="onsite-stat-label">Active Uptime Probes</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
