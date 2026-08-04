import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyBrelaHistory } from '../hooks/useComply.js';
import type { CompBrelaSearchHistoryEntry } from '@hudumika/types';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function queryLabel(entry: CompBrelaSearchHistoryEntry): string {
  return entry.company_name || entry.inc_number || '(blank search — all records)';
}

export function ComplyBrelaHistory() {
  const navigate = useNavigate();
  const { history, loading, error, refresh } = useComplyBrelaHistory();
  const [selected, setSelected] = useState<CompBrelaSearchHistoryEntry | null>(null);

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'BRELA Search History']}
        titlePlain="BRELA Search"
        titleEm="history"
        subtitle="Every BRELA search run by your team, with what it found."
      />
      <div className="comply-page-hdr">
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={refresh} title="Refresh">
            <Icon name="refresh" size={13} />
          </button>
          <button type="button" className="comply-btn-primary" onClick={() => navigate('/complyos/brela-search')}>
            <Icon name="search" size={14} /> New Search
          </button>
        </div>
      </div>

      {error && <div className="comply-note comply-note--error">Failed to load search history: {error}</div>}

      <div className="comply-card">
        <div className="comply-card-body">
          <table className="comply-table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Searched</th>
                <th>Query</th>
                <th style={{ width: 130 }}>Type</th>
                <th style={{ width: 110 }}>Source</th>
                <th style={{ width: 90 }}>Results</th>
                <th style={{ width: 160 }}>By</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="comply-empty-hint">Loading search history…</td></tr>}
              {!loading && history.length === 0 && (
                <tr><td colSpan={6} className="comply-empty-hint">No BRELA searches yet — searches you run from BRELA Search will show up here.</td></tr>
              )}
              {history.map(entry => (
                <tr
                  key={entry.id}
                  className="comply-tr-click"
                  onClick={() => setSelected(entry)}
                  style={{ background: selected?.id === entry.id ? 'var(--comply-l)' : undefined }}
                >
                  <td className="comply-td-muted">{formatWhen(entry.created_at)}</td>
                  <td className="comply-table-name">{queryLabel(entry)}</td>
                  <td className="comply-td-muted">{entry.object_type}</td>
                  <td>
                    <span className={`comply-badge comply-badge--${entry.is_live ? 'active' : 'draft'}`}>
                      {entry.is_live ? 'Live' : 'Reference'}
                    </span>
                  </td>
                  <td className="comply-td-muted">{entry.result_count}</td>
                  <td className="comply-td-muted">{entry.searched_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="comply-card" style={{ marginTop: 24 }}>
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">
              <span className="comply-card-title-row">
                <Icon name="list" size={15} color="var(--comply)" />
                Results for "{queryLabel(selected)}" — {formatWhen(selected.created_at)}
              </span>
            </h3>
            <button type="button" className="comply-close-btn" title="Close" onClick={() => setSelected(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="comply-card-body">
            {(Array.isArray(selected.results) ? selected.results : []).length === 0 ? (
              <div className="comply-empty-hint">This search returned no matching records.</div>
            ) : (
              <table className="comply-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Object number</th>
                    <th style={{ width: 220 }}>Name</th>
                    <th>Address</th>
                    <th style={{ width: 110 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(selected.results) ? selected.results : []).map((r, i) => (
                    <tr key={i}>
                      <td className="comply-td-mono">{r.reg_number}</td>
                      <td className="comply-table-name">{r.name}</td>
                      <td style={{ fontSize: 12.5, lineHeight: 1.4 }}>{r.registered_office}</td>
                      <td><span className="comply-badge comply-badge--active">{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
