import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import './LexCore.css';

interface Client { id: string; name: string; client_type: string; }
interface Matter { id: string; title: string; matter_number: string; status: string; }
interface SearchResult { clients: Client[]; matters: Matter[]; potential_conflicts: boolean; }

export function LexCoreConflicts() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const parties = query.split(',').map(p => p.trim()).filter(Boolean);
      if (parties.length === 0) return;
      const res = await apiFetch('/v1/legal/conflicts/search', { method: 'POST', body: JSON.stringify({ parties }) });
      setResult(res);
    } catch (err: any) { showAlert(err.message); } finally { setSearching(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Compliance']}
        titlePlain="Conflict"
        titleEm="checks"
        subtitle="Party-versus-party conflict screening across all open and historical matters."
      />

      <SectionCard>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter party names, comma-separated…" style={{ flex: 1 }} />
          <Button type="submit" disabled={searching || !query.trim()}>
            <Icon name="search" size={14} /> {searching ? 'Searching…' : 'Search'}
          </Button>
        </form>
      </SectionCard>

      {result && (
        <div style={{ marginTop: 16 }}>
          <SectionCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {result.potential_conflicts ? (
                <Badge variant="error">Potential conflict detected</Badge>
              ) : (
                <Badge variant="success">No conflicts found</Badge>
              )}
            </div>

            {result.clients.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>Matched Clients</div>
                <table className="lc-table" style={{ marginBottom: 16 }}>
                  <thead><tr><th>Name</th><th>Type</th></tr></thead>
                  <tbody>
                    {result.clients.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td><Badge variant="info">{c.client_type}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {result.matters.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>Related Matters</div>
                <table className="lc-table">
                  <thead><tr><th>Number</th><th>Title</th><th>Status</th></tr></thead>
                  <tbody>
                    {result.matters.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{m.matter_number}</td>
                        <td style={{ fontWeight: 600 }}>{m.title}</td>
                        <td><Badge variant="gray">{m.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
