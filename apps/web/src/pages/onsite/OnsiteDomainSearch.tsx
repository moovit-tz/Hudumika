import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

interface SearchSuggestion {
  domain: string;
  tld: string;
  available: boolean;
  error: string | null;
}
interface SearchResults {
  query: string;
  suggestions: SearchSuggestion[];
}

export function OnsiteDomainSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('query') || '';
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/v1/onsite/domains/search-lookup?query=${encodeURIComponent(query)}`);
      setResults(res);
    } catch (err: any) {
      showAlert(err.message || 'Could not check availability right now.', { variant: 'error' });
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const handleRequest = async (domain: string) => {
    setRequesting(domain);
    try {
      await apiFetch('/v1/onsite/domains/request', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      showAlert(`${domain} has been recorded as a request. Connecting a registrar to complete the purchase isn't available yet — we'll follow up once it is.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Could not record this request.', { variant: 'error' });
    } finally {
      setRequesting(null);
    }
  };

  return (
    <div className="onsite-page">
      <div className="onsite-domain-search-hero">
        <h2>Search for a domain name</h2>

        <form onSubmit={handleSearch} className="onsite-prompt-box" style={{ width: '100%', maxWidth: '640px', background: '#ffffff' }}>
          <Icon name="search" size={20} style={{ color: '#a1a1aa' }} />
          <input
            type="text"
            className="onsite-prompt-input"
            placeholder="Type a domain name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="onsite-prompt-submit" disabled={searching}>
            <Icon name={searching ? 'refresh' : 'arrowRight'} size={16} className={searching ? 'onsite-spin' : ''} />
          </button>
        </form>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink3)', marginTop: '0.5rem' }}>
          Availability is checked live via RDAP — the real registry record for each name.
        </p>
      </div>

      {results && (
        <div className="onsite-card">
          <h3 className="onsite-card-title">Results for "{results.query}"</h3>
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
              <thead>
                <tr>
                  <th>Domain Name</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.suggestions.map((s) => (
                  <tr key={s.domain}>
                    <td style={{ fontWeight: 600, fontSize: '1rem' }}>{s.domain}</td>
                    <td>
                      {s.error ? (
                        <span className="onsite-badge unknown" title={s.error}>Couldn't check</span>
                      ) : s.available ? (
                        <span className="onsite-badge succeeded">Available</span>
                      ) : (
                        <span className="onsite-badge failed">Taken</span>
                      )}
                    </td>
                    <td>
                      {s.available && !s.error && (
                        <button
                          className="onsite-btn-purple"
                          disabled={requesting === s.domain}
                          onClick={() => handleRequest(s.domain)}
                        >
                          {requesting === s.domain ? 'Requesting…' : 'Request this domain'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink3)', marginTop: '0.75rem' }}>
            Requesting a domain records it as pending and notifies your workspace admins — connecting a registrar to complete the purchase automatically isn't available yet.
          </p>
        </div>
      )}

      <div className="onsite-feature-banners">
        <div className="onsite-feature-banner" style={{ background: '#4c1d95', color: '#ffffff' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '0.5rem', background: '#6d28d9', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="refresh" size={20} />
          </div>
          <div>
            <h3 style={{ color: '#ffffff', fontSize: '1.35rem', marginTop: '1rem' }}>Already own a domain?</h3>
            <p style={{ color: '#ddd6fe', marginTop: '0.5rem' }}>Bring it over — we'll record the transfer request for you.</p>
          </div>
          <button className="onsite-btn-outline" style={{ background: '#ffffff', color: '#18181b', marginTop: '1rem' }} onClick={() => navigate('/onsite/domains/transfers')}>
            Transfer domain ↗
          </button>
        </div>
      </div>
    </div>
  );
}
