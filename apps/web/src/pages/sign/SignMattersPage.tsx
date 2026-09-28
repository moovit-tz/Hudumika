// ─── SignMattersPage.tsx — Phase S7 consultant/matter model ─────────────────
// Grouped by sign_envelopes.matter_reference (migration 428) — there is no
// separate Matter entity, so this page is a live GROUP BY, not a CRUD list.
// Admin-only (see sign-matters.routes.ts's own gate): a matter aggregates
// envelopes across every user in the tenant, the same disclosure shape as
// "All Documents".
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Input } from '../../components/ui/input.js';

interface MatterSummary {
  matter_reference: string;
  envelope_count: number;
  last_updated: string;
  client_names: string[] | null;
}

interface MatterEnvelope {
  id: string;
  title: string;
  status: string;
  execution_type: string;
  client_id: string | null;
  client_name: string | null;
  updated_at: string;
  created_at: string;
}

type BadgeVariant = 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';
function envelopeBadgeVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    draft: 'gray', sent: 'info', completed: 'success', voided: 'error', declined: 'error', expired: 'gray',
  };
  return map[status] ?? 'gray';
}

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

function Pagination({ total, page, perPage, onPage }: { total: number; page: number; perPage: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }
  const btnBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 32, padding: '0 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', padding: '16px 0' }}>
      <button type="button" style={{ ...btnBase, opacity: page === 1 ? 0.4 : 1 }} disabled={page === 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" size={13} />
      </button>
      {pages.map((p, i) => p === '...' ? (
        <span key={`e${i}`} style={{ color: 'var(--ink3)', fontSize: 12.5, padding: '0 4px' }}>…</span>
      ) : (
        <button key={p} type="button" onClick={() => onPage(p as number)}
          style={{ ...btnBase, background: p === page ? 'hsl(var(--primary))' : 'var(--bg)', color: p === page ? 'hsl(var(--primary-foreground))' : 'var(--ink)', borderColor: p === page ? 'hsl(var(--primary))' : 'var(--border)' }}>
          {p}
        </button>
      ))}
      <button type="button" style={{ ...btnBase, opacity: page === totalPages ? 0.4 : 1 }} disabled={page === totalPages} onClick={() => onPage(page + 1)}>
        <Icon name="chevronRight" size={13} />
      </button>
      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink3)' }}>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
    </div>
  );
}

export function SignMattersPage() {
  const { reference } = useParams<{ reference?: string }>();

  if (reference) return <MatterDetail reference={decodeURIComponent(reference)} />;
  return <MattersList />;
}

function MattersList() {
  const navigate = useNavigate();
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    setLoading(true);
    apiFetch('/v1/sign/matters')
      .then((res: any) => setMatters(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setMatters([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(1); }, [search, perPage]);

  const filtered = useMemo(() => matters.filter(m =>
    !search.trim() || m.matter_reference.toLowerCase().includes(search.trim().toLowerCase()) ||
    (m.client_names ?? []).some(n => n.toLowerCase().includes(search.trim().toLowerCase())),
  ), [matters, search]);

  const pageItems = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign', 'Admin']}
        titlePlain="Case"
        titleEm="matters"
        subtitle="Every envelope tagged with a case or engagement reference, grouped together — the same free-text tag any preparer can set on an envelope."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none', zIndex: 1 }} />
          <Input
            type="search" placeholder="Search by reference or client…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', marginLeft: 'auto' }}>
          <span>Show</span>
          <Select value={String(perPage)} onValueChange={v => setPerPage(Number(v))}>
            <SelectTrigger style={{ height: 30, fontSize: 12, padding: '0 8px', width: 72 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 52, borderRadius: 'var(--r)', background: 'var(--border)', opacity: 0.4 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 280, gap: 12, color: 'var(--ink3)', textAlign: 'center', padding: 32 }}>
            <Icon name="briefcase" size={32} strokeWidth={1.25} />
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>No matters tagged yet</div>
            <div style={{ fontSize: 12, maxWidth: 360, lineHeight: 1.5 }}>
              Set a "Matter / Reference" on any envelope in the editor to group it here with everything else under the same case.
            </div>
          </div>
        ) : (
          <>
            <SectionCard padded={false}>
              {pageItems.map((m, i) => (
                <div key={m.matter_reference}
                  onClick={() => navigate(`/sign/matters/${encodeURIComponent(m.matter_reference)}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: i < pageItems.length - 1 ? '1px solid var(--bg)' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="briefcase" size={16} color="var(--teal)" strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.matter_reference}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {(m.client_names ?? []).join(', ') || 'No linked customer'} · Last activity {new Date(m.last_updated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <Badge variant="gray">{m.envelope_count} document{m.envelope_count === 1 ? '' : 's'}</Badge>
                  <Icon name="chevronRight" size={16} color="var(--ink3)" />
                </div>
              ))}
            </SectionCard>
            <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function MatterDetail({ reference }: { reference: string }) {
  const navigate = useNavigate();
  const [envelopes, setEnvelopes] = useState<MatterEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/sign/matters/${encodeURIComponent(reference)}/envelopes`)
      .then((res: any) => setEnvelopes(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setEnvelopes([]))
      .finally(() => setLoading(false));
  }, [reference]);

  useEffect(() => { setPage(1); }, [perPage]);

  const pageItems = useMemo(() => envelopes.slice((page - 1) * perPage, page * perPage), [envelopes, page, perPage]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['eSign', 'Admin', 'Matters']}
        titlePlain="Matter"
        titleEm={reference}
        subtitle="Every document sent under this case or engagement reference."
        actions={<Link to="/sign/matters" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>← All matters</Link>}
      />

      {envelopes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', marginBottom: 12, justifyContent: 'flex-end' }}>
          <span>Show</span>
          <Select value={String(perPage)} onValueChange={v => setPerPage(Number(v))}>
            <SelectTrigger style={{ height: 30, fontSize: 12, padding: '0 8px', width: 72 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {loading ? (
          <SectionLoading />
        ) : envelopes.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No documents found for this reference.</div>
        ) : (
          <>
            <SectionCard padded={false}>
              {pageItems.map((e, i) => (
                <div key={e.id}
                  onClick={() => navigate(`/sign/envelope/${e.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < pageItems.length - 1 ? '1px solid var(--bg)' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="stamp" size={16} color="var(--teal)" strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {e.client_name ?? 'No linked customer'} · {new Date(e.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <Badge variant={envelopeBadgeVariant(e.status)}>{e.status}</Badge>
                </div>
              ))}
            </SectionCard>
            <Pagination total={envelopes.length} page={page} perPage={perPage} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
