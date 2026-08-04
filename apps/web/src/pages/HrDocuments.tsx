import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';

/**
 * HR documents and the templates they come from.
 *
 * `person_id` and `employment_id` are both nullable, so a document can sit in
 * the tenant filed against nobody. That is shown as unattached rather than as
 * a blank name — the difference matters when someone is looking for a missing
 * contract.
 *
 * Nothing here claims a document has been signed unless a signature request
 * says so; a document with no request is "no signature requested", not
 * "unsigned".
 */

interface Doc {
  id: string; name: string; type: string; status: string; storage_key: string;
  created_at: string; person_id: string | null; employment_id: string | null;
  person_name: string | null; signature_status: string | null;
}
interface Template {
  id: string; name: string; type: string; country_code: string | null;
  version: number; is_active: boolean;
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12,
  background: 'var(--card-bg, var(--white))', overflow: 'hidden',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink3)',
};

const DOC_STATUS: Record<string, 'success' | 'warning' | 'error' | 'brand' | 'gray'> = {
  FILED: 'success', SIGNED: 'success', DRAFT: 'gray',
  PENDING_SIGNATURE: 'warning', EXPIRED: 'error', VOID: 'gray',
};

export function HrDocuments() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('__all__');

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, t] = await Promise.all([
        apiFetch('/v1/hr/documents'),
        apiFetch('/v1/hr/documents/templates'),
      ]);
      setDocs(Array.isArray(d) ? d : []);
      setTemplates(Array.isArray(t) ? t : []);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load documents.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const types = useMemo(
    () => [...new Set(docs.map(d => d.type))].sort(),
    [docs]);

  const shown = useMemo(() => docs.filter(d => {
    if (type !== '__all__' && d.type !== type) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.person_name ?? '').toLowerCase().includes(q);
  }), [docs, type, search]);

  const unattached = useMemo(() => docs.filter(d => !d.person_name).length, [docs]);

  if (loading) return <div style={{ padding: 30, color: 'var(--ink3)' }}>Loading documents…</div>;

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>Documents</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>
          Contracts, letters and forms held against people, and the templates they come from.
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--red-l)',
                      color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {([
          ['Documents', docs.length, 'var(--ink)'],
          ['Templates', templates.length, 'var(--ink)'],
          ['Active templates', templates.filter(t => t.is_active).length, 'var(--ink)'],
          // Filed against nobody: findable here and nowhere else.
          ['Attached to nobody', unattached, unattached > 0 ? 'var(--gold)' : 'var(--ink)'],
        ] as const).map(([l, v, colour]) => (
          <div key={l} style={{ ...card, padding: '11px 14px' }}>
            <div style={label}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colour, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 230, flex: '0 1 300px' }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by document or person…" />
        </div>
        <SingleSelectFilter
          label="Type"
          value={type}
          onChange={v => setType(v ?? '__all__')}
          options={[{ value: '__all__', label: 'All types' }, ...types.map(t => ({ value: t, label: t.replace(/_/g, ' ').toLowerCase() }))]}
        />
      </div>

      <div style={{ ...card, marginBottom: 18 }}>
        {docs.length === 0 ? (
          <div style={{ padding: 34, textAlign: 'center' }}>
            <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="fileText" size={20} /></FeaturedIcon>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>No documents have been filed.</div>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: 26, textAlign: 'center', fontSize: 13, color: 'var(--ink2)' }}>
            No document matches that filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Document', 'About', 'Type', 'Status', 'Signature', 'Filed'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 14px', ...label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <FeaturedIcon variant="gray" size="sm" shape="square"><Icon name="file" size={12} /></FeaturedIcon>
                        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{d.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {d.person_name
                        ? <span style={{ color: 'var(--ink2)' }}>{d.person_name}</span>
                        : <span style={{ color: 'var(--gold)' }}>attached to nobody</span>}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--ink3)' }}>{d.type.replace(/_/g, ' ').toLowerCase()}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <Badge variant={DOC_STATUS[d.status] ?? 'gray'}>{d.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {/* Only a real signature request can say anything here. */}
                      {d.signature_status
                        ? <Badge variant={d.signature_status === 'COMPLETED' ? 'success' : 'warning'}>
                            {d.signature_status.toLowerCase()}
                          </Badge>
                        : <span style={{ color: 'var(--ink3)' }}>none requested</span>}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--ink3)' }}>{String(d.created_at).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ ...label, color: 'var(--ink)' }}>Templates</span>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
            The wording documents are generated from, versioned so an old contract still reads as it was issued.
          </div>
        </div>
        {templates.length === 0 ? (
          <div style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: 'var(--ink2)' }}>
            No templates yet — documents can still be filed, they just will not be generated from standard wording.
          </div>
        ) : templates.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{t.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                {t.type.replace(/_/g, ' ').toLowerCase()}
                {t.country_code ? ` · ${t.country_code}` : ' · not country-specific'}
                {` · v${t.version}`}
              </div>
            </div>
            <Badge variant={t.is_active ? 'success' : 'gray'}>{t.is_active ? 'in use' : 'retired'}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
