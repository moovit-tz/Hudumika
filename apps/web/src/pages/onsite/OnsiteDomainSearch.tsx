import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDomainSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('query') || '';
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any | null>(null);

  const tldPricing = [
    { tld: '.com', orig: '$19.99', price: '$0.01' },
    { tld: '.net', orig: '$17.99', price: '$11.99' },
    { tld: '.io', orig: '$74.99', price: '$31.99' },
    { tld: '.org', orig: '$17.99', price: '$8.99' },
    { tld: '.online', orig: '$35.99', price: '$0.99' },
    { tld: '.shop', orig: '$34.99', price: '$0.99' },
  ];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/v1/onsite/domains/search-lookup?query=${encodeURIComponent(query)}`);
      setResults(res);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="onsite-page">
      {/* Hostinger Hero Search Banner (Image 4) */}
      <div className="onsite-domain-search-hero">
        <h2>Search for a domain name</h2>

        <form onSubmit={handleSearch} className="onsite-prompt-box" style={{ width: '100%', maxWidth: '640px', background: '#ffffff' }}>
          <Icon name="search" size={20} style={{ color: '#a1a1aa' }} />
          <input
            type="text"
            className="onsite-prompt-input"
            placeholder="Type a domain or describe your idea"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="onsite-prompt-submit">
            <Icon name="arrowRight" size={16} />
          </button>
        </form>

        {/* TLD Price Cards */}
        <div className="onsite-tld-cards">
          {tldPricing.map((item) => (
            <div key={item.tld} className="onsite-tld-card">
              <div className="onsite-tld-name">{item.tld}</div>
              <div className="onsite-tld-orig-price">{item.orig}</div>
              <div className="onsite-tld-price">{item.price}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search Results if submitted */}
      {results && (
        <div className="onsite-card">
          <h3 className="onsite-card-title">Available Domain Extensions for "{results.query}"</h3>
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Domain Name</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.suggestions.map((s: any) => (
                  <tr key={s.domain}>
                    <td style={{ fontWeight: 600, fontSize: '1rem' }}>{s.domain}</td>
                    <td>
                      <span className="onsite-badge succeeded">Available</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', color: '#a1a1aa', textDecoration: 'line-through', marginRight: '0.5rem' }}>{s.originalPrice}</span>
                      <span style={{ fontWeight: 700, color: '#673de6' }}>{s.price}</span>
                    </td>
                    <td>
                      <button className="onsite-btn-purple">
                        Add to cart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3 Promo Banners Grid (Image 4) */}
      <div className="onsite-feature-banners">
        {/* Banner 1: .com promo */}
        <div className="onsite-feature-banner" style={{ background: '#673de6', color: '#ffffff' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '0.5rem', background: '#ccff00', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.125rem' }}>
            %
          </div>
          <div>
            <h3 style={{ color: '#ffffff', fontSize: '1.35rem', marginTop: '1rem' }}>
              Register .com domain for only $0.01*/1st yr
            </h3>
            <p style={{ color: '#e4d4ff', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
              *Applicable when you choose a 3-year term. Standard renewal rates apply after year one.
            </p>
          </div>
        </div>

        {/* Banner 2: 9M+ domains */}
        <div className="onsite-feature-banner" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: '#ffffff' }}>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff' }}>9M+</div>
            <div style={{ fontSize: '0.9375rem', color: '#c7d2fe' }}>domains registered</div>

            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '1.5rem' }}>400+</div>
            <div style={{ fontSize: '0.9375rem', color: '#c7d2fe' }}>domain extensions</div>
          </div>
        </div>

        {/* Banner 3: Transfer promo */}
        <div className="onsite-feature-banner" style={{ background: '#4c1d95', color: '#ffffff' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '0.5rem', background: '#6d28d9', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="refresh" size={20} />
          </div>
          <div>
            <h3 style={{ color: '#ffffff', fontSize: '1.35rem', marginTop: '1rem' }}>Domain transfer</h3>
            <p style={{ color: '#ddd6fe', marginTop: '0.5rem' }}>Bring your domain over easily — .com from $9.99</p>
          </div>
          <button className="onsite-btn-outline" style={{ background: '#ffffff', color: '#18181b', marginTop: '1rem' }} onClick={() => navigate('/onsite/domains/transfers')}>
            Transfer domain ↗
          </button>
        </div>
      </div>

      {/* Trustpilot Banner */}
      <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#71717a', fontSize: '0.875rem' }}>
        Excellent ★★★★★ <strong style={{ color: '#18181b' }}>71,028 reviews</strong> on <strong>Trustpilot</strong>
      </div>
    </div>
  );
}
