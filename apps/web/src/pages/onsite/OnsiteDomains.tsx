import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteDomain } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDomains() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<OnsiteDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'owned' | 'shared'>('owned');

  const fetchDomains = () => {
    setLoading(true);
    apiFetch('/v1/onsite/domains')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setDomains(res);
        }
      })
      .catch(() => setDomains([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const externalDomains = [
    { name: 'aleka.co.tz', services: ['Website'] },
    { name: 'alekacapital.com', services: ['Website'], canTransfer: true },
    { name: 'darcentralsda.or.tz', services: ['Website', 'Email'] },
    { name: 'ecoscopefoundation.or.tz', services: ['Website', 'Email'] },
    { name: 'fortefreight.co.tz', services: ['Website'] },
  ];

  return (
    <div className="onsite-page">
      {/* Header */}
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Domain portfolio</h1>
        </div>
        <div className="onsite-header-actions">
          <button className="onsite-btn-outline" onClick={() => navigate('/onsite/domains/transfers')}>
            <Icon name="download" size={14} /> Transfer an existing domain
          </button>
          <button className="onsite-btn-purple" onClick={() => navigate('/onsite/domains/search')}>
            Get a new domain ▾
          </button>
        </div>
      </div>

      {/* Top Banner (Protect identity promo) */}
      <div className="onsite-card" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--purple-l)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="lock" size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink2)', fontWeight: 600 }}>Protect your internet identity</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                dccsaccos.online <span style={{ fontSize: '0.875rem', color: 'var(--purple)', fontWeight: 500, cursor: 'pointer', marginLeft: '0.5rem' }}>or See more options</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ background: 'var(--blue-l)', color: 'var(--blue)', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '9999px', marginRight: '0.5rem' }}>Save 97%</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--ink3)', textDecoration: 'line-through' }}>$35.99</span>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)' }}>$0.99<span style={{ fontSize: '0.75rem', color: 'var(--ink2)' }}>/1st yr</span></div>
            </div>
            <button className="onsite-btn-outline" onClick={() => navigate('/onsite/domains/search')}>
              Get now
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="onsite-tabs">
        <button
          className={`onsite-tab ${activeTab === 'owned' ? 'active' : ''}`}
          onClick={() => setActiveTab('owned')}
        >
          Owned domains
        </button>
        <button
          className={`onsite-tab ${activeTab === 'shared' ? 'active' : ''}`}
          onClick={() => setActiveTab('shared')}
        >
          Shared with you
        </button>
      </div>

      {/* Search Filter */}
      <div className="onsite-card" style={{ padding: '0.75rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Icon name="search" size={18} style={{ color: 'var(--ink3)' }} />
          <input
            type="text"
            className="onsite-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '0.4rem 0', width: '100%', color: 'var(--ink)' }}
          />
        </div>
      </div>

      {/* Table 1: Owned Domains */}
      <div className="onsite-card">
        <div className="onsite-table-wrapper">
          <table className="onsite-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}><input type="checkbox" /></th>
                <th>Domain name ↕</th>
                <th>Status ↕</th>
                <th>Expiration date ↕</th>
                <th>Auto-renewal</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Item: dccsaccos.com */}
              <tr>
                <td><input type="checkbox" /></td>
                <td style={{ fontWeight: 600 }}>dccsaccos.com</td>
                <td>
                  <span className="onsite-badge failed">
                    <Icon name="alertCircle" size={12} /> Expired
                  </span>
                </td>
                <td style={{ color: 'var(--red)', fontWeight: 600 }}>2026-07-06</td>
                <td>—</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="onsite-btn-outline" style={{ color: 'var(--purple)', borderColor: 'var(--border)' }}>
                      Renew
                    </button>
                    <button className="btn btn-sm btn-ghost">
                      <Icon name="moreVertical" size={16} />
                    </button>
                  </div>
                </td>
              </tr>

              {domains.map((d) => (
                <tr key={d.id}>
                  <td><input type="checkbox" /></td>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={`/onsite/domains/${d.id}`} style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                      {d.domain}
                    </Link>
                  </td>
                  <td>
                    <span className={`onsite-badge ${d.dns_status}`}>
                      {d.dns_status}
                    </span>
                  </td>
                  <td>{d.expires_at ? new Date(d.expires_at).toISOString().split('T')[0] : '2027-08-01'}</td>
                  <td>{d.auto_renew ? 'Enabled' : 'Disabled'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Link to={`/onsite/domains/${d.id}/dns`} className="onsite-btn-outline">
                        Manage DNS
                      </Link>
                      <button className="btn btn-sm btn-ghost">
                        <Icon name="moreVertical" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: External Domains */}
      <div style={{ marginTop: '1.5rem' }}>
        <div className="onsite-card-header" style={{ marginBottom: '1rem' }}>
          <h3 className="onsite-card-title">
            External domains <Icon name="info" size={16} style={{ color: 'var(--ink3)' }} />
          </h3>
        </div>

        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Domain name ↕</th>
                  <th>Connected services</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {externalDomains.map((ext, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{ext.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {ext.services.map((srv) => (
                          <span key={srv} style={{ background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--border)' }}>
                            <Icon name={srv === 'Website' ? 'layoutDashboard' : 'mail'} size={12} /> {srv}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        {ext.canTransfer && (
                          <button className="onsite-btn-outline" onClick={() => navigate('/onsite/domains/transfers')}>
                            Transfer
                          </button>
                        )}
                        <Link to={`/onsite/domains/1/dns`} className="onsite-btn-outline">
                          Manage DNS
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
