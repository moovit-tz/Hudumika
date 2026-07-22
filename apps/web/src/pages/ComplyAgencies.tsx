import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyAgencyDirectory } from '../hooks/useComply.js';
import type { CompAgencyDirectoryEntry } from '@hudumika/types';
import './ComplyOS.css';

type Agency = CompAgencyDirectoryEntry;

const CATEGORIES = ['All', 'Corporate', 'Tax', 'Social Security', 'Regulatory', 'Financial'];

const PORTAL_TYPE_LABEL: Record<string, string> = {
  api: 'Live API', portal: 'Online', manual: 'Walk-in', legal_firm: 'Via Legal Firm',
};

export function ComplyAgencies() {
  const { agencies, loading } = useComplyAgencyDirectory();
  const [cat, setCat] = useState('All');
  const [selected, setSelected] = useState<Agency | null>(null);

  const visible = cat === 'All' ? agencies : agencies.filter(a => a.category === cat);

  return (
    <div className="comply-page">
      <div className="comply-page-hdr">
        <div>
          <h1 className="comply-page-title">Government Agencies</h1>
          <p className="comply-page-sub">All regulatory bodies relevant to business compliance in Tanzania</p>
        </div>
      </div>

      <div className="comply-filters">
        {CATEGORIES.map(c => (
          <button key={c} type="button" className={`comply-filter-btn${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="comply-card">
        <div className="comply-card-body">
          {loading ? (
            <div className="comply-empty">Loading agencies…</div>
          ) : (
          <table className="comply-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Category</th>
                <th>Key Obligations</th>
                <th>Turnaround</th>
                <th>Channel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(ag => (
                <tr key={ag.code} onClick={() => setSelected(ag)}>
                  <td>
                    <div className="comply-table-name">{ag.code}</div>
                    <div className="comply-table-sub">{ag.name}</div>
                  </td>
                  <td><span className={`comply-agency comply-agency--${ag.agency_class}`}>{ag.category}</span></td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {ag.obligations.slice(0, 2).map(o => <span key={o} className="comply-firm-tag" style={{ fontSize: 10.5 }}>{o}</span>)}
                      {ag.obligations.length > 2 && <span className="comply-firm-tag" style={{ fontSize: 10.5 }}>+{ag.obligations.length - 2}</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{ag.turnaround}</td>
                  <td>
                    {ag.portal_type === 'api' || ag.portal_type === 'portal'
                      ? <span className="comply-badge comply-badge--active">{PORTAL_TYPE_LABEL[ag.portal_type]}</span>
                      : <span className="comply-badge comply-badge--draft">{PORTAL_TYPE_LABEL[ag.portal_type]}</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <Link to="/complyos/applications" className="comply-btn-secondary comply-btn-sm">
                      Apply
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div
            style={{ width: 420, maxWidth: '100%', background: 'var(--white)', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginBottom: 4 }}>{selected.code}</div>
                <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{selected.name}</div>
              </div>
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} onClick={() => setSelected(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Category', val: selected.category },
                  { label: 'Location', val: selected.location },
                  { label: 'Phone', val: selected.phone },
                  { label: 'Website', val: selected.website },
                  { label: 'Turnaround', val: selected.turnaround },
                  { label: 'Portal', val: PORTAL_TYPE_LABEL[selected.portal_type] },
                ].map(m => (
                  <div key={m.label}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{m.label}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{m.val}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Obligations</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.obligations.map(o => (
                    <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <Icon name="fileText" size={13} />
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{o}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link to="/complyos/applications" className="comply-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setSelected(null)}>
                <Icon name="plus" size={13} /> Start Application
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
