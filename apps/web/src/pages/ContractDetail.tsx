import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { FileUploader } from '../components/ui/file-uploader.js';
import { apiFetch, apiDownload, apiViewBlob } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { SectionCard } from '../components/SectionCard.js';

// Contract detail (M2b) — Contract Information/Content/Attachments/Comments
// tabs. Attachments reuse the platform's existing generic Drive entity-tag
// mechanism (cloud_files.entity_type/entity_id — the same one Notes'
// image-attachment feature and customer/shipment files already use), no
// new storage; "View PDF"/"Download" reuse apiViewBlob/apiDownload, the
// same helpers Billing.tsx's own PDF actions already call.

interface ContractDetailData {
  id: string; ref: string | null; customer_id: string; customer_name: string | null; customer_email: string | null;
  project_id: string | null; project_name: string | null; subject: string;
  value: string | null; currency: string; type: string | null;
  start_date: string | null; end_date: string | null; description: string | null; content: string | null;
  status: string; sign_envelope_id: string | null; deleted_at: string | null;
  envelope_status: string | null; signed_at: string | null;
  renewals: { id: string; previous_end_date: string | null; new_end_date: string | null; note: string | null; created_at: string; actor_name: string }[];
}

const SIGN_STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'success' | 'error' | 'warning' }> = {
  draft: { label: 'Draft', variant: 'gray' },
  sent: { label: 'Awaiting Signature', variant: 'warning' },
  completed: { label: 'Signed', variant: 'success' },
  declined: { label: 'Declined', variant: 'error' },
  voided: { label: 'Voided', variant: 'error' },
  expired: { label: 'Expired', variant: 'error' },
};
interface CloudFileRow { id: string; name: string; size: number | null; mime_type: string | null; created_at: string }
interface CommentRow { id: string; content: string; created_at: string; author_id: string; author_name: string }

const SUGGESTED_TYPES = ['Contracts under Seal', 'Implied Contracts', 'Bilateral and Unilateral Contracts', 'Adhesion Contracts', 'Void and Voidable Contracts'];

async function searchCustomers(q: string): Promise<PickerItem[]> {
  const res = await apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []);
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
}

let cachedDriveId: string | null = null;
async function resolveDriveId(): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const drives = await apiFetch('/v1/drives');
  const list = Array.isArray(drives) ? drives : (drives.data ?? []);
  if (!list.length) throw new Error('No drive available');
  cachedDriveId = list[0].id;
  return cachedDriveId!;
}

export const ContractDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'info' | 'content' | 'attachments' | 'comments'>('info');
  const [contract, setContract] = useState<ContractDetailData | null>(null);
  const [files, setFiles] = useState<CloudFileRow[] | null>(null);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [newComment, setNewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [renewDate, setRenewDate] = useState<Date | undefined>(undefined);
  const [renewNote, setRenewNote] = useState('');
  const [renewing, setRenewing] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    apiFetch(`/v1/contracts/${id}`).then(res => setContract(res.data)).catch(() => setContract(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!id) return;
    if (tab === 'attachments') {
      apiFetch(`/v1/files?entity_type=contract&entity_id=${id}`).then(res => setFiles(res.data || res || [])).catch(() => setFiles([]));
    }
    if (tab === 'comments') {
      apiFetch(`/v1/contracts/${id}/comments`).then(res => setComments(res.data || [])).catch(() => setComments([]));
    }
  }, [tab, id]);

  function patch(body: Record<string, unknown>) {
    if (!id) return;
    apiFetch(`/v1/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(load);
  }

  async function uploadFiles(fileList: File[]) {
    if (!id || fileList.length === 0) return;
    setUploading(true);
    try {
      const driveId = await resolveDriveId();
      for (const file of fileList) {
        const form = new FormData();
        form.append('file', file);
        await apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=contract&entity_id=${id}`, { method: 'POST', body: form });
      }
      const res = await apiFetch(`/v1/files?entity_type=contract&entity_id=${id}`);
      setFiles(res.data || res || []);
    } finally {
      setUploading(false);
    }
  }

  async function sendForSignature() {
    if (!id || sending) return;
    setSending(true);
    try {
      await apiFetch(`/v1/contracts/${id}/send-for-signature`, { method: 'POST' });
      load();
    } finally {
      setSending(false);
    }
  }

  async function submitRenewal() {
    if (!id || !renewDate || renewing) return;
    setRenewing(true);
    try {
      await apiFetch(`/v1/contracts/${id}/renew`, { method: 'POST', body: JSON.stringify({ newEndDate: toDateOnlyString(renewDate), note: renewNote.trim() || undefined }) });
      setRenewDate(undefined); setRenewNote('');
      load();
    } finally {
      setRenewing(false);
    }
  }

  async function postComment() {
    if (!id || !newComment.trim()) return;
    const res = await apiFetch(`/v1/contracts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content: newComment.trim() }) }).catch(() => null);
    if (res) { setComments(prev => [...(prev || []), res.data]); setNewComment(''); }
  }

  if (!contract) {
    return <div style={{ padding: 32, color: 'var(--ink3)', fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ padding: isMobile ? '16px 16px 0' : '24px 32px 0' }}>
        <button type="button" onClick={() => navigate('/projects/contracts')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12.5, fontWeight: 600, padding: 0, marginBottom: 10 }}>
          <Icon name="arrowLeft" size={13} /> All contracts
        </button>
        <PageHeader
          crumbs={['Projects', 'Contracts', contract.subject]}
          titlePlain="Contract"
          titleEm="detail"
          subtitle={contract.ref ? `${contract.subject} — ${contract.ref}` : contract.subject}
          actions={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(() => {
              const meta = contract.sign_envelope_id ? (SIGN_STATUS_META[contract.envelope_status || 'draft'] || SIGN_STATUS_META.draft) : { label: 'Not Sent', variant: 'gray' as const };
              const badge = <Badge variant={meta.variant}>{meta.label}</Badge>;
              return contract.sign_envelope_id
                ? <Link to={`/sign/envelope/${contract.sign_envelope_id}`} style={{ textDecoration: 'none' }} title="Open in eSign">{badge}</Link>
                : badge;
            })()}
            {!contract.sign_envelope_id && (
              <Button size="sm" onClick={sendForSignature} disabled={sending || !contract.customer_email}
                title={!contract.customer_email ? 'This customer has no email on file' : undefined}>
                <Icon name="stamp" size={13} /> {sending ? 'Sending…' : 'Send for Signature'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => id && apiViewBlob(`/v1/contracts/${id}/pdf`)}>
              <Icon name="fileText" size={13} /> View PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => id && apiDownload(`/v1/contracts/${id}/pdf`, `${contract.ref || 'contract'}.pdf`)}>
              <Icon name="download" size={13} /> Download
            </Button>
          </div>}
        />
        {contract.signed_at && (
          <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>Signed {new Date(contract.signed_at).toLocaleString()}</div>
        )}

        <div className="ds-tabs-list" data-variant="segmented" style={{ marginTop: 18 }}>
          {(['info', 'content', 'attachments', 'comments'] as const).map(t => (
            <button key={t} type="button" className="ds-tabs-trigger" data-variant="segmented"
              data-state={tab === t ? 'active' : 'inactive'} onClick={() => setTab(t)}
              style={{ textTransform: 'capitalize' }}>
              {t === 'info' ? 'Contract Information' : t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? 16 : 32, maxWidth: 720 }}>
        {tab === 'info' && (
          <SectionCard collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!contract.deleted_at} onChange={e => patch({ trashed: e.target.checked })} />
              Trash
            </label>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Customer</div>
              <EntityPicker
                value={contract.customer_name ? { id: contract.customer_id, label: contract.customer_name } : null}
                onChange={v => v && patch({ customerId: v.id })} search={searchCustomers}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Subject</div>
              <input defaultValue={contract.subject} onBlur={e => e.target.value.trim() && patch({ subject: e.target.value.trim() })}
                style={{ width: '100%', padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13.5, color: 'var(--ink)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Contract Value ({contract.currency})</div>
              <input type="number" min={0} defaultValue={contract.value ?? ''} onBlur={e => patch({ value: e.target.value ? Number(e.target.value) : null })}
                style={{ width: '100%', padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13.5, color: 'var(--ink)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Contract Type</div>
              <input list="contract-types" defaultValue={contract.type ?? ''} onBlur={e => patch({ type: e.target.value || null })}
                style={{ width: '100%', padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13.5, color: 'var(--ink)', boxSizing: 'border-box' }} />
              <datalist id="contract-types">{SUGGESTED_TYPES.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Start Date</div>
                <DatePicker date={contract.start_date ? parseDateOnly(contract.start_date) : undefined} onChange={d => patch({ startDate: d ? toDateOnlyString(d) : null })} placeholder="Not set" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>End Date</div>
                <DatePicker date={contract.end_date ? parseDateOnly(contract.end_date) : undefined} onChange={d => patch({ endDate: d ? toDateOnlyString(d) : null })} placeholder="Not set" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>Description</div>
              <textarea defaultValue={contract.description ?? ''} onBlur={e => patch({ description: e.target.value })} rows={5}
                style={{ width: '100%', padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Renewal History</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <DatePicker date={renewDate} onChange={setRenewDate} placeholder="New end date" />
                <input value={renewNote} onChange={e => setRenewNote(e.target.value)} placeholder="Note (optional)"
                  style={{ flex: 1, minWidth: 160, padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12.5, color: 'var(--ink)' }} />
                <Button size="sm" onClick={submitRenewal} disabled={!renewDate || renewing}>{renewing ? 'Renewing…' : 'Renew'}</Button>
              </div>
              {contract.renewals.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contract.renewals.map(r => (
                    <div key={r.id} style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--ink2)' }}>{r.actor_name}</span> extended {r.previous_end_date || '—'} → {r.new_end_date}
                      {r.note && <span> — {r.note}</span>}
                      <span style={{ color: 'var(--ink4)' }}> · {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </SectionCard>
        )}

        {tab === 'content' && (
          <SectionCard collapsible={false}>
            <textarea
              defaultValue={contract.content ?? ''}
              onBlur={e => patch({ content: e.target.value })}
              rows={20}
              placeholder="Contract body / terms…"
              style={{ width: '100%', padding: 'var(--ds-input-py, 7px) 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
          </SectionCard>
        )}

        {tab === 'attachments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FileUploader onUpload={uploadFiles} multiple />
            {uploading && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Uploading…</div>}
            {files === null ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : files.length === 0 ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No attachments yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {files.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <Icon name="fileText" size={14} color="var(--ink3)" />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{f.size ? `${(f.size / 1024).toFixed(0)} KB` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newComment} onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') postComment(); }}
                placeholder="Add a comment…"
                style={{ flex: 1, padding: 'var(--ds-input-py, 7px) 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13.5, color: 'var(--ink)' }} />
              <Button size="sm" onClick={postComment} disabled={!newComment.trim()}>Post</Button>
            </div>
            {comments === null ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            ) : comments.length === 0 ? (
              <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No comments yet.</div>
            ) : (
              comments.map(c => (
                <div key={c.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{c.author_name} <span style={{ fontWeight: 400, color: 'var(--ink4)', fontSize: 11 }}>· {new Date(c.created_at).toLocaleString()}</span></div>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{c.content}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
