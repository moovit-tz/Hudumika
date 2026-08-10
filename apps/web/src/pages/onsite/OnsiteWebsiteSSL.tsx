import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteWebsiteSSL() {
  const [searchQuery, setSearchQuery] = useState('');

  const sslCerts = [
    { domain: 'hudumika.tz', type: 'Lifetime SSL', status: 'Active', createdAt: '2026-05-02', expiresAt: 'Never' },
    { domain: 'oneid.hudumika.tz', type: 'Lifetime SSL', status: 'Active', createdAt: '2026-05-14', expiresAt: 'Never' },
  ];

  const filteredCerts = sslCerts.filter(c => c.domain.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Link to="/onsite/websites" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>Websites</Link>
        <span>›</span>
        <span>hudumika.tz</span>
        <span>›</span>
        <span>Security</span>
        <span>›</span>
        <span>SSL certificate</span>
      </div>

      <h1 style={{ fontSize: '1.625rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>SSL certificate</h1>

      {/* SSL Certificates Table Card (Image 2) */}
      <div className="onsite-card">
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', width: '100%', maxWidth: '360px' }}>
          <Icon name="search" size={16} style={{ color: 'var(--ink3)' }} />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', width: '100%', color: 'var(--ink)' }}
          />
        </div>

        <div className="onsite-table-wrapper">
          <table className="onsite-table">
            <thead>
              <tr>
                <th>Domain ↕</th>
                <th>SSL Type ↕</th>
                <th>Status ↕</th>
                <th>Created at ↕</th>
                <th>Will expire at ↕</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCerts.map((cert) => (
                <tr key={cert.domain}>
                  <td style={{ fontWeight: 600 }}>{cert.domain}</td>
                  <td>{cert.type}</td>
                  <td>
                    <span className="onsite-badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Icon name="checkCircle" size={14} /> {cert.status}
                    </span>
                  </td>
                  <td>{cert.createdAt}</td>
                  <td>{cert.expiresAt}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost">
                      <Icon name="moreVertical" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Knowledge Base Section (Image 2) */}
      <div>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 1rem 0' }}>Knowledge Base</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div className="onsite-card">
            <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--ink)' }}>What is SSL?</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink2)', margin: '0.5rem 0 1rem 0' }}>
              Check out this article where you will learn what is SSL and why you should have it on your domain
            </p>
            <button className="onsite-btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: 'fit-content' }}>
              <Icon name="externalLink" size={14} /> Learn more
            </button>
          </div>

          <div className="onsite-card">
            <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--ink)' }}>How to install SSL?</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink2)', margin: '0.5rem 0 1rem 0' }}>
              Watch this video on how to install Lifetime SSL on your domain with a few clicks
            </p>
            <button className="onsite-btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: 'fit-content' }}>
              <Icon name="externalLink" size={14} /> Learn more
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
