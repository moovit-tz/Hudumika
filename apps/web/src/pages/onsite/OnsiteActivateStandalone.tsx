import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteActivateStandalone() {
  const navigate = useNavigate();
  const [activating, setActivating] = useState(false);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await apiFetch('/v1/onsite/plan/activate-standalone', { method: 'POST' });
      showAlert('Onsite is now active on your own plan.', { variant: 'success' });
      navigate('/onsite');
    } catch (err: any) {
      showAlert(err.message || 'Failed to activate', { variant: 'error' });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Activate']}
        titlePlain="Activate"
        titleEm="hosting"
        subtitle="Keep your sites, domains and DNS running on your own plan."
      />

      <div className="onsite-card" style={{ maxWidth: '480px', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Icon name="globe" size={28} style={{ color: 'var(--teal)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>Onsite</div>
            <div style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Hosting, domains &amp; DNS — nothing else</div>
          </div>
        </div>

        <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1rem' }}>
          $9<span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink-muted)' }}>/month</span>
        </div>

        <ul style={{ margin: '0 0 1.5rem', paddingLeft: '1.25rem', color: 'var(--ink2)', fontSize: '0.875rem', lineHeight: 1.8 }}>
          <li>Websites, domains &amp; DNS management</li>
          <li>Application deployments</li>
          <li>Uptime monitoring</li>
        </ul>

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={activating} onClick={handleActivate}>
          {activating ? 'Activating…' : 'Activate'}
        </button>
      </div>
    </div>
  );
}
