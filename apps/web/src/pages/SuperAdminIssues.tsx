import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch, BASE_URL } from '../lib/api.js';

/**
 * The platform's bug list: everything every tenant has reported, in one queue.
 *
 * Deliberately cross-tenant — which is the one thing every other read path in
 * this app must never be. The API gates it on SUPER_ADMIN at the route level
 * rather than filtering by the caller's tenant, and this page is mounted only
 * inside the SuperAdmin shell's own RequireRoles.
 */

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'gray'> = {
  OPEN: 'warning', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'gray',
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed',
};
const PRIORITY_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'error'> = {
  LOW: 'gray', NORMAL: 'info', HIGH: 'warning', URGENT: 'error',
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const SuperAdminIssues: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [apps, setApps] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('bug');
  const [status, setStatus] = useState('all');
  const [app, setApp] = useState('all');
  const [sort, setSort] = useState('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [open, setOpen] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingToLens, setSendingToLens] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ sort, dir, limit: '150' });
      if (q.trim()) p.set('q', q.trim());
      if (kind !== 'all') p.set('kind', kind);
      if (status !== 'all') p.set('status', status);
      if (app !== 'all') p.set('app', app);
      const res: any = await apiFetch(`/v1/superadmin/issues?${p}`);
      setRows(res.data ?? []);
      setApps(res.apps ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the issue queue.');
      setRows([]);
    }
    setLoading(false);
  }, [q, kind, status, app, sort, dir]);

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  // Deep-link from a Lens card's "hudumika_issue" back-link
  // (?ticket=<ref_number>) — open the matching issue once the queue has
  // loaded, then drop the param so a refresh doesn't re-trigger it.
  useEffect(() => {
    const ref = searchParams.get('ticket');
    if (!ref || rows.length === 0) return;
    const match = rows.find(r => r.ref_number === ref);
    if (match) {
      openIssue(match.id);
      setSearchParams(p => { p.delete('ticket'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  async function openIssue(id: string) {
    try {
      const full = await apiFetch(`/v1/superadmin/issues/${id}`);
      setOpen(full);
      setResolution((full as any).resolution ?? '');
      setReply('');
    } catch (e: any) { setError(e?.message ?? 'Could not open that issue.'); }
  }

  async function patch(body: Record<string, unknown>) {
    if (!open) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/superadmin/issues/${open.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await openIssue(open.id);
      await load();
    } catch (e: any) { setError(e?.message ?? 'That change did not save.'); }
    setSaving(false);
  }

  async function sendReply() {
    if (!open || !reply.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/superadmin/issues/${open.id}/reply`, { method: 'POST', body: JSON.stringify({ message: reply.trim() }) });
      setReply('');
      await openIssue(open.id);
    } catch (e: any) { setError(e?.message ?? 'The reply did not send.'); }
    setSaving(false);
  }

  async function sendToLens() {
    if (!open) return;
    setSendingToLens(true);
    try {
      const res: any = await apiFetch(`/v1/superadmin/issues/${open.id}/send-to-lens`, { method: 'POST' });
      setOpen((o: any) => o && { ...o, lens_ref: res.ref });
    } catch (e: any) { setError(e?.message ?? 'Could not send this to Lens.'); }
    setSendingToLens(false);
  }

  const counts = STATUSES.map(s => ({ s, n: rows.filter(r => r.status === s).length }));

  return (
    <div className="sai-page">
      <style>{`
        .sai-page { padding: 24px 32px; }
        .sai-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border);
                    border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,.04); overflow: hidden; --ctl-h: 44px; }
        .sai-card .input-field, .sai-card [data-slot="select-trigger"] {
          height: var(--ctl-h); border-radius: var(--r-sm); padding-top: 0; padding-bottom: 0; }
        .sai-card textarea.input-field { height: auto; padding: 11px 13px; }
        .sai-tools { display: grid; grid-template-columns: minmax(0,1fr) 150px 160px 150px; gap: 12px;
                     padding: 18px; border-bottom: 1px solid var(--border); }
        .sai-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 10px; margin-top: 12px; }
        .sai-stat { padding: 12px 14px; border-radius: var(--r); background: var(--card-bg, var(--white)); border: 1px solid var(--border); }
        .sai-split { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,1fr); gap: 16px; align-items: start; margin-top: 12px; }
        .sai-scroll { max-height: 64vh; overflow: auto; overscroll-behavior: contain;
                      scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .sai-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .sai-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .sai-scroll table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 640px; }
        .sai-scroll th { position: sticky; top: 0; z-index: 2; background: var(--card-bg, var(--white));
                         text-align: left; padding: 10px 12px; font-size: 10.5px; font-weight: 700; color: var(--ink3);
                         text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid var(--border);
                         white-space: nowrap; cursor: pointer; user-select: none; }
        .sai-scroll td { padding: 11px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .sai-scroll tbody tr { cursor: pointer; }
        .sai-scroll tbody tr:hover { background: var(--teal-l); }
        .sai-detail { padding: 20px; }
        .sai-ctx { font-family: var(--mono, monospace); font-size: 11px; line-height: 1.6; color: var(--ink2);
                   background: var(--surface, rgba(0,0,0,.03)); border: 1px solid var(--border);
                   border-radius: var(--r-sm); padding: 12px; max-height: 240px; overflow: auto;
                   white-space: pre-wrap; word-break: break-word; }
        .sai-att { display: flex; align-items: center; gap: 10px; padding: 9px 12px; margin-top: 8px;
                   border: 1px solid var(--border); border-radius: var(--r-sm); font-size: 12.5px;
                   text-decoration: none; color: inherit; }
        .sai-att:hover { border-color: var(--teal); }
        @media (max-width: 1200px) { .sai-split { grid-template-columns: minmax(0,1fr); } }
        @media (max-width: 900px) { .sai-page { padding: 14px; } .sai-tools { grid-template-columns: 1fr; } }
      `}</style>

      <PageHeader
        crumbs={['Platform', 'Issues']}
        titlePlain="Reported"
        titleEm="Issues"
        subtitle="Every problem reported from inside the apps, across all tenants — with what the reporter was looking at when it happened."
      />

      {error && (
        <div style={{ margin: '12px 0', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12.5, display: 'flex', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="var(--red)" /> {error}
        </div>
      )}

      <div className="sai-stats">
        {counts.map(({ s, n }) => (
          <div key={s} className="sai-stat">
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{STATUS_LABEL[s]}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>{n}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>on this page</div>
          </div>
        ))}
      </div>

      <div className="sai-split">
        <div className="sai-card">
          <div className="sai-tools">
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
              <input className="input-field" placeholder="Search subject, reference or tenant…" value={q}
                onChange={e => setQ(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, fontSize: 13 }} />
            </div>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug reports</SelectItem>
                <SelectItem value="general">Support requests</SelectItem>
                <SelectItem value="all">Everything</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={app} onValueChange={setApp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any app</SelectItem>
                {apps.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="sai-scroll">
            <table>
              <thead>
                <tr>
                  <th onClick={() => { setSort('created_at'); setDir(d => (sort === 'created_at' && d === 'desc' ? 'asc' : 'desc')); }}>Raised</th>
                  <th onClick={() => { setSort('tenant'); setDir(d => (sort === 'tenant' && d === 'asc' ? 'desc' : 'asc')); }}>Tenant</th>
                  <th>Issue</th>
                  <th onClick={() => { setSort('priority'); setDir(d => (sort === 'priority' && d === 'asc' ? 'desc' : 'asc')); }}>Priority</th>
                  <th onClick={() => { setSort('status'); setDir(d => (sort === 'status' && d === 'asc' ? 'desc' : 'asc')); }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} onClick={() => openIssue(r.id)} style={open?.id === r.id ? { background: 'var(--teal-l)' } : undefined}>
                    <td style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtWhen(r.created_at)}</td>
                    <td style={{ color: 'var(--ink2)' }}>{r.tenant_name ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>{r.ref_number}</span>
                        {r.app && <Badge variant="gray">{r.app}</Badge>}
                        {Number(r.attachment_count) > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--ink3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Icon name="paperclip" size={11} color="var(--ink3)" />{r.attachment_count}
                          </span>
                        )}
                        {r.lens_ref && (
                          <span title={`Tracked in Lens as ${r.lens_ref}`} style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Icon name="externalLink" size={11} color="var(--teal)" />{r.lens_ref}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>{r.subject}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{r.category} · {r.reporter_name ?? r.reporter_email ?? 'unknown reporter'}</div>
                    </td>
                    <td><Badge variant={PRIORITY_VARIANT[r.priority] ?? 'gray'}>{r.priority}</Badge></td>
                    <td><Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--ink3)' }}>Nothing matches those filters.</td></tr>
                )}
                {loading && <tr><td colSpan={5} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '13px 18px', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink3)' }}>
            {total.toLocaleString()} matching {total === 1 ? 'issue' : 'issues'}{rows.length < total ? ` · showing the first ${rows.length}` : ''}
          </div>
        </div>

        <div className="sai-card">
          {!open ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              Select an issue to read it, reply, and set where it stands.
            </div>
          ) : (
            <div className="sai-detail">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>{open.ref_number}</span>
                <Badge variant={STATUS_VARIANT[open.status] ?? 'gray'}>{STATUS_LABEL[open.status]}</Badge>
                <Badge variant={PRIORITY_VARIANT[open.priority] ?? 'gray'}>{open.priority}</Badge>
                {open.app && <Badge variant="brand">{open.app}</Badge>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4 }}>{open.subject}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, marginBottom: 16 }}>
                {open.tenant_name} · {open.reporter_name ?? 'unknown'}{open.reporter_email ? ` (${open.reporter_email})` : ''} · {fmtWhen(open.created_at)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <Select value={open.status} onValueChange={v => patch({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={open.priority} onValueChange={v => patch({ priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div style={{ marginBottom: 16 }}>
                {open.lens_ref ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                    <Icon name="checkCircle" size={14} color="var(--teal)" />
                    <span style={{ color: 'var(--ink2)' }}>Sent to Lens as</span>
                    <span style={{ fontFamily: 'var(--mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{open.lens_ref}</span>
                  </div>
                ) : (
                  <button type="button" className="btn btn-secondary" disabled={sendingToLens}
                    style={{ fontSize: 13, gap: 6 }} onClick={sendToLens}>
                    <Icon name="externalLink" size={13} />
                    {sendingToLens ? 'Sending…' : 'Send to Lens'}
                  </button>
                )}
              </div>

              {(open.messages ?? []).map((m: any) => (
                <div key={m.id} style={{
                  padding: '11px 13px', marginBottom: 8, borderRadius: 'var(--r-sm)', fontSize: 12.5, lineHeight: 1.55,
                  background: m.is_platform_staff ? 'var(--teal-l)' : 'var(--surface, rgba(0,0,0,.03))',
                  border: `1px solid ${m.is_platform_staff ? 'var(--teal-m, var(--teal-l))' : 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.is_platform_staff ? 'var(--teal)' : 'var(--ink3)', marginBottom: 3 }}>
                    {m.author_name}{m.is_platform_staff ? ' · Hudumika' : ''} · {fmtWhen(m.created_at)}
                  </div>
                  <div style={{ color: 'var(--ink2)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              ))}

              {(open.attachments ?? []).length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 6 }}>Attachments</div>
                  {open.attachments.map((a: any) => (
                    <a key={a.id} className="sai-att" href={`${BASE_URL}/v1/platform-support/attachments/${a.id}`} target="_blank" rel="noreferrer">
                      <Icon name={String(a.mime_type).startsWith('image/') ? 'image' : 'fileText'} size={14} color="var(--teal)" />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                      <span style={{ color: 'var(--ink3)' }}>{(a.size_bytes / 1024).toFixed(0)} KB</span>
                    </a>
                  ))}
                </div>
              )}

              {open.context && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 6 }}>
                    What they were looking at
                  </div>
                  <div className="sai-ctx">{JSON.stringify(open.context, null, 2)}</div>
                </div>
              )}

              {open.record && (
                <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 6 }}>
                    The calculation it refers to
                  </div>
                  <div style={{ color: 'var(--ink2)' }}>{open.record.description}</div>
                  <div style={{ color: 'var(--ink3)', marginTop: 3 }}>
                    {open.record.hs_code} · TZS {Number(open.record.total_tzs ?? 0).toLocaleString()} · {fmtWhen(open.record.created_at)}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 6 }}>
                  Reply to the tenant
                </label>
                <textarea className="input-field" rows={3} value={reply} onChange={e => setReply(e.target.value)}
                  placeholder="They see this in their own Report an issue page."
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical' }} />
                <button type="button" className="btn btn-secondary" disabled={saving || !reply.trim()}
                  style={{ marginTop: 8, fontSize: 13 }} onClick={sendReply}>
                  {saving ? 'Sending…' : 'Send reply'}
                </button>
              </div>

              <div style={{ marginTop: 18 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 6 }}>
                  Outcome
                </label>
                <textarea className="input-field" rows={2} value={resolution} onChange={e => setResolution(e.target.value)}
                  placeholder="What was actually done. Shown to the tenant beside the status — 'Resolved' on its own is not an answer."
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical' }} />
                <button type="button" className="btn btn-primary" disabled={saving}
                  style={{ marginTop: 8, fontSize: 13 }} onClick={() => patch({ resolution })}>
                  Save outcome
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminIssues;
