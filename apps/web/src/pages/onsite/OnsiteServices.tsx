import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon.js';
import './Onsite.css';

/**
 * What Onsite can and cannot yet do, told straight.
 *
 * This page shipped as six cards — CDN, backups, malware scanning, GPU compute
 * and so on — each with an "Enable" / "Deploy" / "Run Scan" button that did
 * nothing at all. They described capabilities the platform does not have as if
 * they were one click away.
 *
 * The ones that are real link to where they live. The rest are named as not yet
 * built, because a control that does nothing is worse than an honest "not yet":
 * somebody clicks it, believes something happened, and finds out later that it
 * did not.
 */
interface Service {
  icon: IconName;
  title: string;
  desc: string;
  to?: string;        // present → the capability exists; the card links to it
  cta?: string;
}

const AVAILABLE: Service[] = [
  { icon: 'shield', title: 'SSL certificates', to: '/onsite/ssl',
    desc: 'Read the certificate each domain actually serves — issuer, validity and expiry from a live TLS handshake.', cta: 'Open SSL' },
  { icon: 'barChart', title: 'Uptime monitoring', to: '/onsite/monitoring',
    desc: 'Probe a URL on a schedule and track real 30-day availability, with an alert when it goes down.', cta: 'Open monitors' },
  { icon: 'globe', title: 'DNS management', to: '/onsite/domains',
    desc: 'Records with validation, zone import and export, and one-click setup templates.', cta: 'Open domains' },
  { icon: 'gitBranch', title: 'Deployments', to: '/onsite/deployments',
    desc: 'Trigger a build through a connected CI provider and follow it to done.', cta: 'Open deployments' },
];

const PLANNED: Service[] = [
  { icon: 'layers', title: 'Automated backups', desc: 'Scheduled snapshots with retention and one-click restore.' },
  { icon: 'zap', title: 'CDN & DDoS protection', desc: 'Edge caching and mitigation, once a CDN provider is connected.' },
  { icon: 'search', title: 'Malware scanning', desc: 'Scheduled scans for hosted applications.' },
  { icon: 'zap', title: 'GPU compute', desc: 'On-demand GPU instances for AI workloads.' },
];

export function OnsiteServices() {
  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>More services</h1>
          <p>What Onsite can do today, and what is on the way.</p>
        </div>
      </div>

      <h2 className="onsite-section-label">Available now</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {AVAILABLE.map(s => (
          <div key={s.title} className="onsite-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <Icon name={s.icon} size={18} color="var(--teal)" />
                <h3 className="onsite-card-title" style={{ margin: 0 }}>{s.title}</h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--ink2)', margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
            </div>
            <Link to={s.to!} className="btn btn-secondary btn-sm" style={{ width: 'fit-content' }}>{s.cta}</Link>
          </div>
        ))}
      </div>

      <h2 className="onsite-section-label">Not yet available</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {PLANNED.map(s => (
          <div key={s.title} className="onsite-card" style={{ opacity: 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <Icon name={s.icon} size={18} color="var(--ink3)" />
              <h3 className="onsite-card-title" style={{ margin: 0 }}>{s.title}</h3>
              <span className="onsite-badge" style={{ marginLeft: 'auto' }}>Planned</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink3)', margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
