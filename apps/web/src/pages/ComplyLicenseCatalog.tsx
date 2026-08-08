import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useComplyLicenseCatalog } from '../hooks/useComply.js';
import type { CompLicenseCatalogEntry } from '@hudumika/types';
import { Combobox } from '../components/ui/combobox.js';
import './ComplyOS.css';

function formatFee(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  if (amount === 0) return 'Nil';
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  return currency === 'USD' ? `USD ${formatted}` : `TZS ${formatted}/=`;
}

export function ComplyLicenseCatalog() {
  const navigate = useNavigate();
  const { catalog, loading, error } = useComplyLicenseCatalog();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('__all__');
  const [selected, setSelected] = useState<CompLicenseCatalogEntry | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of catalog) if (!seen.has(c.sn)) seen.set(c.sn, c.category);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([sn, name]) => ({ value: String(sn), label: `${sn}. ${name}` }));
  }, [catalog]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(c => {
      if (category !== '__all__' && String(c.sn) !== category) return false;
      if (!q) return true;
      return c.category.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || (c.tier ?? '').toLowerCase().includes(q);
    });
  }, [catalog, search, category]);

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Business Licence Catalogue']} 
        titlePlain="Business Licence"
        titleEm="catalogue"
        subtitle={<> Tanzania Business Licensing Act fee schedule — {catalog.length} licence options across 37 categories </>}
      />

      {error && <div className="comply-note comply-note--error">Failed to load the licence catalogue: {error}</div>}

      <div className="comply-filters" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="input-field"
            style={{ paddingLeft: 32 }}
            placeholder="Search licence, category or tier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Combobox
          triggerClassName="input-field"
          value={category}
          onChange={setCategory}
          placeholder="All categories"
          searchPlaceholder="Search category…"
          options={[{ value: '__all__', label: 'All categories' }, ...categories]}
        />
      </div>

      <div className="comply-card">
        <div className="comply-card-body">
          <table className="comply-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Licence</th>
                <th>Tier</th>
                <th>Principal Fee</th>
                <th>Sub-Licence Fee</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="comply-empty-hint">Loading licence catalogue…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={6} className="comply-empty-hint">No licences match your search.</td></tr>
              )}
              {visible.map(c => (
                <tr key={c.id} className="comply-tr-click" onClick={() => setSelected(c)}>
                  <td className="comply-td-muted" style={{ whiteSpace: 'nowrap' }}>{c.sn}. {c.category}</td>
                  <td className="comply-table-name">{c.description}</td>
                  <td className="comply-td-muted">{c.tier ?? '—'}</td>
                  <td className="comply-td-mono">{formatFee(c.principal_fee, c.principal_currency)}</td>
                  <td className="comply-td-mono">{formatFee(c.subsidiary_fee, c.subsidiary_currency)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="comply-btn-secondary comply-btn-sm"
                      onClick={() => navigate(`/complyos/license-catalog/apply/${c.id}`)}
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="comply-overlay comply-overlay--end" onClick={() => setSelected(null)}>
          <div className="comply-drawer" onClick={e => e.stopPropagation()}>
            <div className="comply-panel-hdr">
              <div>
                <div className="comply-panel-hdr-title">{selected.description}</div>
                <span className="comply-badge comply-badge--draft">{selected.sn}. {selected.category}</span>
              </div>
              <button type="button" title="Close" className="comply-close-btn" onClick={() => setSelected(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="comply-panel-body">
              <div className="comply-meta-grid">
                {[
                  { label: 'Tier', val: selected.tier ?? '—' },
                  { label: 'Principal Fee', val: formatFee(selected.principal_fee, selected.principal_currency) },
                  { label: 'Sub-Licence Fee', val: formatFee(selected.subsidiary_fee, selected.subsidiary_currency) },
                  { label: 'Issuing Authority', val: 'Local Government Authority (LGA)' },
                ].map(m => (
                  <div key={m.label}>
                    <div className="comply-meta-key">{m.label}</div>
                    <div className="comply-meta-val">{m.val}</div>
                  </div>
                ))}
              </div>

              {selected.notes && (
                <div className="comply-note"><strong>Note: </strong>{selected.notes}</div>
              )}

              <div>
                <div className="comply-section-title">Typical Requirements</div>
                <p style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10, lineHeight: 1.5 }}>
                  A general starting checklist — not an official per-licence list. You can edit it when you apply.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.requirements.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <Icon name="fileText" size={13} color="var(--comply)" />
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="comply-btn-primary"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => navigate(`/complyos/license-catalog/apply/${selected.id}`)}
              >
                <Icon name="send" size={13} /> Apply for this Licence
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
