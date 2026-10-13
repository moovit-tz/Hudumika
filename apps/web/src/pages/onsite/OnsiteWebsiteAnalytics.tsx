import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { NotProvisioned } from './NotProvisioned.js';
import './Onsite.css';

interface TrafficStats {
  period: string;
  visitors: number;
  pageViews: number;
  bandwidth: number;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ source: string; visits: number }>;
}

export function OnsiteWebsiteAnalytics() {
  const { siteId } = useParams<{ siteId: string }>();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [period, setPeriod] = useState('30d');

  const loadStats = (p: string) => {
    if (!siteId) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/v1/onsite/websites/${siteId}/analytics?period=${encodeURIComponent(p)}`)
      .then((res: any) => {
        setConnected(res.connected !== false);
        setStats(res.stats ?? null);
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStats(period); }, [siteId]);

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    loadStats(p);
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatNumber = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` :
    String(n);

  if (loading) return <SectionLoading />;

  if (!connected) {
    return (
      <NotProvisioned
        icon="barChart"
        title="No traffic has been measured yet"
        what="Once a hosting or CDN provider is connected, this shows bandwidth, requests, top countries and error rates for this website."
        needs="These figures come from a provider access log. None is connected, so nothing has been measured."
      />
    );
  }

  if (!stats) {
    return (
      <div className="onsite-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <Icon name="barChart2" size={32} style={{ color: 'var(--ink3)', marginBottom: '0.5rem' }} />
        <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: '0 0 0.5rem' }}>No analytics data</h3>
        <p style={{ color: 'var(--ink2)', fontSize: '0.875rem', margin: 0 }}>
          The hosting provider is connected but returned no traffic data for this period.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Period selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>
          <Icon name="barChart2" size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
          Traffic analytics
        </h3>
        <Select value={period} onValueChange={handlePeriodChange}>
          <SelectTrigger style={{ width: '160px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        <MetricCard label="Visitors" value={formatNumber(stats.visitors)} icon="users" />
        <MetricCard label="Page views" value={formatNumber(stats.pageViews)} icon="eye" />
        <MetricCard label="Bandwidth" value={formatBytes(stats.bandwidth)} icon="arrowUpDown" />
      </div>

      {/* Top pages & referrers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '1rem' }}>
        {/* Top pages */}
        <div className="onsite-card">
          <div className="onsite-card-header">
            <h3 className="onsite-card-title"><Icon name="file" size={16} /> Top pages</h3>
            <Badge variant="gray">{stats.topPages.length}</Badge>
          </div>
          {stats.topPages.length === 0 ? (
            <p style={{ color: 'var(--ink3)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>No page data for this period.</p>
          ) : (
            <div className="onsite-table-wrapper" style={{ marginTop: '0.5rem' }}>
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th style={{ textAlign: 'right' }}>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topPages.map((p, i) => (
                    <tr key={i}>
                      <td><code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{p.path}</code></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNumber(p.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top referrers */}
        <div className="onsite-card">
          <div className="onsite-card-header">
            <h3 className="onsite-card-title"><Icon name="externalLink" size={16} /> Top referrers</h3>
            <Badge variant="gray">{stats.topReferrers.length}</Badge>
          </div>
          {stats.topReferrers.length === 0 ? (
            <p style={{ color: 'var(--ink3)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>No referrer data for this period.</p>
          ) : (
            <div className="onsite-table-wrapper" style={{ marginTop: '0.5rem' }}>
              <table className="onsite-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th style={{ textAlign: 'right' }}>Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topReferrers.map((r, i) => (
                    <tr key={i}>
                      <td>{r.source}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNumber(r.visits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div className="onsite-card" style={{ padding: '1.25rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Icon name={icon} size={16} style={{ color: 'var(--ink3)' }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}
