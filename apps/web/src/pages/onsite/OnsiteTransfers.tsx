import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
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

      {/* Main Transfer Illustration Card */}
      <div className="onsite-transfer-card">
        <div className="onsite-transfer-icon">
          <Icon name="globe" size={36} />
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          Start with a new domain transfer
        </h2>
        <p style={{ color: 'var(--ink2)', fontSize: '0.9375rem', maxWidth: '480px', margin: 0 }}>
          Transfer a domain you have registered elsewhere or move a domain to another Onsite account.
        </p>

        <Button
          style={{ marginTop: '0.5rem', minHeight: '40px', padding: '0 1.5rem', fontSize: '0.875rem' }}
          onClick={() => setShowModal(true)}
        >
          Transfer to Onsite
        </Button>

        <Button
          variant="ghost"
          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          onClick={() => setShowModal(true)}
        >
          Move to another account
        </Button>
      </div>

      {/* Transfer Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Transfer Domain to Onsite</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInitiateTransfer} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  <p style={{ fontSize: '0.72rem', color: 'var(--ink3)', margin: '0.2rem 0 0' }}>
                    Optional — you can provide this later if you don't have it yet.
                  </p>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!domain.trim() || submitting}>
                {submitting ? <><ButtonSpinner /> Initiating…</> : 'Initiate Transfer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
