import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import './Onsite.css';

export function OnsiteTransfers() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [domain, setDomain] = useState('');
  const [eppCode, setEppCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleInitiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/domains/transfer', {
        method: 'POST',
        body: JSON.stringify({ domain, eppCode }),
      });
      setShowModal(false);
      // What actually happened, not what a real registrar transfer would.
      // The endpoint records the domain as pending with its EPP code; no
      // registrar has been contacted, so this does not claim a transfer is
      // "initiated" — that would need a registrar integration Onsite does not
      // have yet.
      showAlert(
        `${domain} has been recorded as a pending transfer. Connecting a registrar to carry it out is not available yet.`,
        { title: 'Recorded', variant: 'info' },
      );
      navigate('/onsite/domains');
    } catch (err: any) {
      showAlert(err.message || 'That transfer could not be recorded.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={[{ label: 'Onsite', to: '/onsite' }, { label: 'Domain portfolio', to: '/onsite/domains' }, 'Transfer domain']}
        titlePlain="Domain"
        titleEm="transfers"
        subtitle="Transfer a domain you have registered elsewhere or move a domain to another Onsite account."
      />

      {/* Main Transfer Illustration Card (Image 5) */}
      <div className="onsite-transfer-card">
        <div className="onsite-transfer-icon">
          <Icon name="globe" size={36} />
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#18181b', margin: 0 }}>
          Start with a new domain transfer
        </h2>
        <p style={{ color: '#71717a', fontSize: '0.9375rem', maxWidth: '480px', margin: 0 }}>
          Transfer a domain you have registered elsewhere or move a domain to another Onsite account.
        </p>

        <button className="onsite-btn-purple" style={{ marginTop: '0.5rem', padding: '0.65rem 1.75rem', fontSize: '0.875rem' }} onClick={() => setShowModal(true)}>
          Transfer to Onsite
        </button>

        <button className="btn btn-ghost" style={{ fontSize: '0.8125rem', color: '#673de6', fontWeight: 600 }} onClick={() => setShowModal(true)}>
          Move to another account
        </button>
      </div>

      {/* Transfer Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Transfer Domain to Onsite</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleInitiateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Domain Name to Transfer *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>EPP / Auth Code (Authorization Key)</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="Secret EPP transfer code from current registrar"
                  value={eppCode}
                  onChange={(e) => setEppCode(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="onsite-btn-purple" disabled={submitting}>
                  {submitting ? 'Transferring…' : 'Initiate Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
