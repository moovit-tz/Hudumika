import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { slugify } from '../onboarding/types.js';
import type { AgencyManagedClient, SubdomainCheckResponse } from '@hudumika/types';
import './Onsite.css';

export function OnsiteAgencyClients() {
  const [clients, setClients] = useState<AgencyManagedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);

  const fetchClients = () => {
    setLoading(true);
    apiFetch('/v1/onsite/agency/clients')
      .then((res: any) => setClients(res?.data ?? []))
      .catch((err: any) => setError(err.message ?? 'Failed to load clients'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleRelease = async (c: AgencyManagedClient) => {
    const ok = await showConfirm(
      `Release ${c.tenant_name}? They'll keep their account and all their data, but lose Onsite access under your package until they activate a plan of their own.`,
      { title: 'Release this client', variant: 'danger', confirmLabel: 'Release' },
    );
    if (!ok) return;
    setReleasing(c.tenant_id);
    try {
      await apiFetch(`/v1/onsite/agency/clients/${c.tenant_id}/detach`, { method: 'POST' });
      fetchClients();
    } catch (err: any) {
      showAlert(err.message || 'Failed to release client', { variant: 'error' });
    } finally {
      setReleasing(null);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Agency clients']}
        titlePlain="Agency"
        titleEm="clients"
        subtitle="Every client you host under your own package — each on its own independent account, free to detach or move on at any time."
        actions={
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="userPlus" size={16} /> New client
          </Button>
        }
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink3)' }}>Loading clients…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--red)' }}>Error: {error}</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="onsite-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Icon name="users" size={48} style={{ color: 'var(--ink3)', margin: '0 auto 1rem auto' }} />
          <h3>No clients yet</h3>
          <p style={{ color: 'var(--ink3)', marginBottom: '1.5rem' }}>
            Set up hosting for your first client. They get their own account and login — billed under your package until they detach.
          </p>
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="userPlus" size={16} /> New client
          </Button>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Subdomain</th>
                  <th>Status</th>
                  <th>Attached</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.tenant_name}</td>
                    <td className="onsite-mono">{c.tenant_subdomain ? `${c.tenant_subdomain}.hudumika.tz` : '—'}</td>
                    <td>
                      <Badge variant={c.status === 'active' ? 'success' : 'gray'}>
                        {c.status === 'active' ? 'Active' : 'Detached'}
                      </Badge>
                    </td>
                    <td>{new Date(c.attached_at).toISOString().split('T')[0]}</td>
                    <td style={{ textAlign: 'right' }}>
                      {c.status === 'active' && (
                        <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Link to={`/onsite/agency/clients/${c.tenant_id}`}>
                            <Button variant="outline" size="sm">Manage</Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ color: 'var(--red)' }}
                            disabled={releasing === c.tenant_id}
                            onClick={() => handleRelease(c)}
                          >
                            {releasing === c.tenant_id ? <><ButtonSpinner /> Releasing…</> : 'Release'}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <NewClientModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            fetchClients();
          }}
        />
      )}
    </div>
  );
}

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [subStatus, setSubStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [subReason, setSubReason] = useState<string | undefined>();
  const [adminEmail, setAdminEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-derive the subdomain from the company name until the user edits it directly.
  useEffect(() => {
    if (!subdomainTouched) setSubdomain(slugify(companyName));
  }, [companyName, subdomainTouched]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!subdomain || subdomain.length < 3) {
      setSubStatus('idle');
      return;
    }
    setSubStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res: SubdomainCheckResponse = await apiFetch(`/v1/onboarding/check-subdomain?value=${encodeURIComponent(subdomain)}`);
        setSubStatus(res.available ? 'available' : 'taken');
        setSubReason(res.reason);
      } catch {
        setSubStatus('idle');
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [subdomain]);

  const canSubmit = companyName.trim() && adminEmail.trim() && subStatus === 'available' && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiFetch('/v1/onsite/agency/clients', {
        method: 'POST',
        body: JSON.stringify({
          company_name: companyName.trim(),
          subdomain,
          admin_email: adminEmail.trim(),
        }),
      });
      showAlert(`${companyName.trim()} is set up. An activation email is on its way to ${adminEmail.trim()}.`, { variant: 'success' });
      onCreated();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create client', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Company name *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="Client Co Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div className="onsite-form-group">
                <label>Subdomain *</label>
                <div className="ob-domain-row">
                  <input
                    type="text"
                    className="onsite-input"
                    value={subdomain}
                    onChange={(e) => { setSubdomainTouched(true); setSubdomain(slugify(e.target.value)); }}
                    autoComplete="off"
                    required
                  />
                  <span className="ob-domain-suffix">.hudumika.tz</span>
                </div>
                {subStatus === 'checking' && <span className="ob-field-status ob-field-status--checking">Checking availability…</span>}
                {subStatus === 'available' && <span className="ob-field-status ob-field-status--ok"><Icon name="checkCircle" size={14} /> Available</span>}
                {subStatus === 'taken' && <span className="login-field-err">{subReason || 'This subdomain is already taken'}</span>}
              </div>
              <div className="onsite-form-group">
                <label>Client admin email *</label>
                <input
                  type="email"
                  className="onsite-input"
                  placeholder="jane@clientco.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--ink3)' }}>
                  We'll email them an activation link. They'll manage their own login from there.
                </span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? <><ButtonSpinner /> Creating…</> : 'Create client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
