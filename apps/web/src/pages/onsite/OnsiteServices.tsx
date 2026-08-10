import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteServices() {
  const navigate = useNavigate();

  const services = [
    { title: 'Cloud CDN & DDoS Protection', desc: 'Global edge caching and automatic DDoS mitigation.', action: 'Enable CDN' },
    { title: 'Daily Automated Backups', desc: 'Full snapshot backups retained for 30 days with 1-click restore.', action: 'Configure' },
    { title: 'Google Workspace Integration', desc: 'Seamlessly link custom domains with Google Workspace email.', action: 'Setup' },
    { title: 'Staging Environment', desc: 'Clone production sites to test updates safely before deploying.', action: 'Create Staging' },
    { title: 'Malware & Vulnerability Scanner', desc: 'Automated daily malware scan for WordPress and PHP applications.', action: 'Run Scan' },
    { title: 'GPU & AI Workload Compute', desc: 'High-performance NVIDIA GPU instances for LLMs and AI models.', action: 'Deploy GPU' },
  ];

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>More Services</h1>
          <p>Extend your infrastructure with security, CDN, backups, and AI GPU compute tools.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {services.map((s, idx) => (
          <div key={idx} className="onsite-card" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3 className="onsite-card-title">{s.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#71717a', margin: '0.5rem 0 0 0' }}>{s.desc}</p>
            </div>
            <button className="onsite-btn-outline" style={{ width: 'fit-content', marginTop: '1rem' }}>
              {s.action} ↗
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
