import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteWebsiteAnalytics() {
  const { siteId } = useParams<{ siteId: string }>();
  const [timeFilter, setTimeFilter] = useState('6h');
  const [topListTab, setTopListTab] = useState<'countries' | 'ip' | 'requests' | 'domains'>('countries');
  const [activeLogTab, setActiveLogTab] = useState<'analytics' | 'access' | '5xx' | '4xx'>('analytics');

  const topCountries = [
    { name: 'France', count: 9 },
    { name: 'Lithuania', count: 2 },
    { name: 'United States', count: 2 },
    { name: 'Indonesia', count: 1 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Link to="/onsite/websites" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>Websites</Link>
        <span>›</span>
        <span>hudumika.tz</span>
        <span>›</span>
        <span>Analytics</span>
      </div>

      <h1 style={{ fontSize: '1.625rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Analytics</h1>

      {/* Main Stats Card (Image 1) */}
      <div className="onsite-card">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--ink)' }}>
              hudumika.tz <Icon name="externalLink" size={14} style={{ color: 'var(--ink3)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', marginBottom: '1.25rem' }}>Domain shown</div>

            <div style={{ display: 'flex', gap: '3rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)' }}>161.91 KB</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)' }}>Total bandwidth</div>
              </div>
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)' }}>14</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)' }}>Total Number of Requests</div>
              </div>
            </div>

            <div className="onsite-form-group" style={{ maxWidth: '360px', marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>Change domain</label>
              <select className="onsite-select" defaultValue="hudumika.tz">
                <option value="hudumika.tz">hudumika.tz</option>
                <option value="gmtl.co.tz">gmtl.co.tz</option>
                <option value="oneid.hudumika.tz">oneid.hudumika.tz</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ink)' }}>Filter by</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['Last 1 hour', 'Last 6 hours', 'Last 24 hours', 'Last 7 days'].map((f, i) => {
                  const key = ['1h', '6h', '24h', '7d'][i];
                  return (
                    <button
                      key={key}
                      className={`onsite-tab ${timeFilter === key ? 'active' : ''}`}
                      onClick={() => setTimeFilter(key)}
                      style={{ border: '1px solid var(--border)' }}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top List Box (Image 1) */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--ink)' }}>Top list</div>
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {(['countries', 'ip', 'requests', 'domains'] as const).map((tab) => (
                <button
                  key={tab}
                  className={`onsite-tab ${topListTab === tab ? 'active' : ''}`}
                  onClick={() => setTopListTab(tab)}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                >
                  {tab === 'countries' ? 'Countries' : tab === 'ip' ? 'IP Addresses' : tab === 'requests' ? 'Requests' : 'Domains'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topCountries.map((c, idx) => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span><strong style={{ color: 'var(--ink2)', marginRight: '0.5rem' }}>{idx + 1}</strong> <span style={{ color: 'var(--ink)' }}>{c.name}</span></span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Log Tabs & Requests Chart (Image 1) */}
      <div className="onsite-tabs" style={{ width: '100%', justifyContent: 'flex-start', background: 'transparent', borderBottom: '1px solid var(--border)', borderRadius: 0, paddingBottom: '0.5rem' }}>
        <button className={`onsite-tab ${activeLogTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveLogTab('analytics')}>Analytics</button>
        <button className={`onsite-tab ${activeLogTab === 'access' ? 'active' : ''}`} onClick={() => setActiveLogTab('access')}>Access logs</button>
        <button className={`onsite-tab ${activeLogTab === '5xx' ? 'active' : ''}`} onClick={() => setActiveLogTab('5xx')}>Error code 5xx</button>
        <button className={`onsite-tab ${activeLogTab === '4xx' ? 'active' : ''}`} onClick={() => setActiveLogTab('4xx')}>Error code 4xx</button>
      </div>

      {/* Total Requests Chart Container */}
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title">
            Total requests <Icon name="info" size={14} style={{ color: 'var(--ink3)' }} />
          </h3>
          <button className="btn btn-sm btn-ghost">▲</button>
        </div>

        {/* SVG Request Timeline Chart */}
        <div style={{ padding: '1rem 0', overflowX: 'auto' }}>
          <svg width="100%" height="180" viewBox="0 0 800 180" fill="none" style={{ overflow: 'visible' }}>
            <line x1="40" y1="30" x2="780" y2="30" stroke="var(--border)" strokeDasharray="4 4" />
            <text x="0" y="34" fill="var(--ink3)" fontSize="10">10 Requests</text>

            <line x1="40" y1="90" x2="780" y2="90" stroke="var(--border)" strokeDasharray="4 4" />
            <text x="0" y="94" fill="var(--ink3)" fontSize="10">5 Requests</text>

            <line x1="40" y1="150" x2="780" y2="150" stroke="var(--border)" />
            <text x="0" y="154" fill="var(--ink3)" fontSize="10">0 Requests</text>

            {/* Time markers */}
            <text x="120" y="170" fill="var(--ink3)" fontSize="11" textAnchor="middle">2 PM</text>
            <text x="320" y="170" fill="var(--ink3)" fontSize="11" textAnchor="middle">3 PM</text>
            <text x="520" y="170" fill="var(--ink3)" fontSize="11" textAnchor="middle">4 PM</text>
            <text x="720" y="170" fill="var(--ink3)" fontSize="11" textAnchor="middle">5 PM</text>

            {/* Request Line (spike at 3 PM) */}
            <path
              d="M 120 150 L 280 150 L 300 40 L 320 150 L 680 150 L 700 120 L 720 150 L 760 110 L 780 150"
              stroke="var(--purple)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
