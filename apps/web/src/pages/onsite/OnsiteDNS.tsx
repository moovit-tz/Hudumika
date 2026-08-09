import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDnsRecord, DnsPropagationResult } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDNS() {
  const { domainId } = useParams<{ domainId: string }>();
  const [records, setRecords] = useState<OnsiteDnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('@');
  const [type, setType] = useState('A');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('3600');
  const [priority, setPriority] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check propagation state
  const [checkRecord, setCheckRecord] = useState<OnsiteDnsRecord | null>(null);
  const [checking, setChecking] = useState(false);
  const [propResults, setPropResults] = useState<DnsPropagationResult[] | null>(null);

  const fetchDNS = () => {
    if (!domainId) return;
    setLoading(true);
    apiFetch(`/v1/onsite/domains/${domainId}/dns`)
      .then((res: any) => setRecords(res.records || []))
      .catch((err: any) => setError(err.message ?? 'Failed to load DNS records'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDNS();
  }, [domainId]);

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainId || !name || !value) return;
    setSubmitting(true);
    try {
      await apiFetch(`/v1/onsite/domains/${domainId}/dns`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          type,
          value,
          ttl: parseInt(ttl, 10) || 3600,
          priority: priority ? parseInt(priority, 10) : undefined,
        }),
      });
      setShowAddModal(false);
      setName('@');
      setType('A');
      setValue('');
      setTtl('3600');
      setPriority('');
      fetchDNS();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add DNS record', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!domainId || !(await showConfirm('Are you sure you want to delete this DNS record?', { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/onsite/domains/${domainId}/dns/${recordId}`, { method: 'DELETE' });
      fetchDNS();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete record', { variant: 'error' });
    }
  };

  const handleCheckPropagation = async (record: OnsiteDnsRecord) => {
    if (!domainId) return;
    setCheckRecord(record);
    setChecking(true);
    setPropResults(null);
    try {
      const res: any = await apiFetch(`/v1/onsite/domains/${domainId}/dns/check-propagation`, {
        method: 'POST',
        body: JSON.stringify({
          name: record.name,
          type: record.type,
          expected: record.value,
        }),
      });
      setPropResults(res.results || []);
    } catch (err: any) {
      showAlert(err.message || 'Propagation check failed', { variant: 'error' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Domains', 'DNS']}
        titlePlain="DNS"
        titleEm="records"
        subtitle="Configure A, CNAME, MX, TXT, and SRV records for your domain."
        actions={<><button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Icon name="plus" size={16} /> Add Record
                  </button></>}
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading DNS zone records…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Value</th>
                  <th>TTL</th>
                  <th>Priority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="onsite-badge" style={{ background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 700 }}>
                        {r.type}
                      </span>
                    </td>
                    <td className="onsite-mono" style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="onsite-mono" style={{ maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.value}
                    </td>
                    <td style={{ color: 'var(--ink-muted)' }}>{r.ttl}s</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{r.priority ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleCheckPropagation(r)} title="Check Propagation">
                          <Icon name="globe" size={14} /> Probe
                        </button>
                        <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDeleteRecord(r.id)}>
                          <Icon name="trash2" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '520px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Add DNS Record</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddRecord} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Type *</label>
                  <select className="onsite-select" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="A">A</option>
                    <option value="AAAA">AAAA</option>
                    <option value="CNAME">CNAME</option>
                    <option value="MX">MX</option>
                    <option value="TXT">TXT</option>
                    <option value="NS">NS</option>
                    <option value="SRV">SRV</option>
                    <option value="CAA">CAA</option>
                  </select>
                </div>
                <div className="onsite-form-group">
                  <label>Name * (@ for root)</label>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="@ or subdomain"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="onsite-form-group">
                <label>Value / Target *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="e.g. 192.0.2.1 or mail.example.com"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>TTL (seconds)</label>
                  <input
                    type="number"
                    className="onsite-input"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                  />
                </div>
                {type === 'MX' && (
                  <div className="onsite-form-group">
                    <label>Priority</label>
                    <input
                      type="number"
                      className="onsite-input"
                      placeholder="10"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Propagation Check Modal */}
      {checkRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '520px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">DNS Propagation Probe</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setCheckRecord(null)}>✕</button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}>
              Checking global propagation for <strong>{checkRecord.type}</strong> <code>{checkRecord.name}</code>:
            </p>

            {checking ? (
              <p style={{ padding: '1rem 0' }}>Querying Cloudflare and Google DoH resolvers…</p>
            ) : propResults ? (
              <div className="onsite-table-wrapper">
                <table className="onsite-table">
                  <thead>
                    <tr>
                      <th>Resolver</th>
                      <th>Observed Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propResults.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.resolver}</td>
                        <td className="onsite-mono">{r.actual || 'No record'}</td>
                        <td>
                          {r.propagated ? (
                            <span className="onsite-badge succeeded">✓ Propagated</span>
                          ) : (
                            <span className="onsite-badge pending">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setCheckRecord(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
