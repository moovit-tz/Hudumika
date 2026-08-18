import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch, BASE_URL } from '../lib/api.js';

/**
 * Reporting a problem from inside the app.
 *
 * A dedicated route rather than a modal: the form carries an attachment
 * upload and a captured calculation, it can be linked to from anywhere
 * ("Report an issue with this calculation"), and a half-written report
 * survives a mis-click on the backdrop.
 *
 * What gets captured is shown before it is sent. Silently attaching a
 * customer's cargo values to a support ticket would be the wrong default;
 * the reporter sees the summary and can send it or not.
 */

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'gray'> = {
  OPEN: 'warning', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'gray',
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'Being looked at', RESOLVED: 'Resolved', CLOSED: 'Closed',
};

const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/csv,text/plain,.xlsx,.xls';

interface Ticket {
  id: string;
  ref_number: string;
  subject: string;
  status: string;
  priority: string;
  kind: string;
  app: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const ReportIssuePage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const recordId = params.get('record') ?? '';

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [area, setArea] = useState('Landed Cost calculator');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [files, setFiles] = useState<File[]>([]);
  const [includeContext, setIncludeContext] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Ticket | null>(null);
  const [uploadNote, setUploadNote] = useState('');

  const [record, setRecord] = useState<any | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The calculation this report is about, if it was raised from one.
  useEffect(() => {
    if (!recordId) return;
    apiFetch(`/v1/customs/landed-cost/history/${recordId}`)
      .then(setRecord)
      .catch(() => setRecord(null));   // a missing record just means no context
  }, [recordId]);

  const loadTickets = () => {
    apiFetch('/v1/platform-support/tickets')
      .then((r: any) => setTickets(Array.isArray(r) ? r : []))
      .catch(() => setTickets([]));
  };
  useEffect(loadTickets, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setUploadNote('');
    const next: File[] = [...files];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { rejected.push(`${f.name} (limit is ${MAX_FILES} files)`); continue; }
      if (f.size > MAX_BYTES) { rejected.push(`${f.name} (${(f.size / 1048576).toFixed(1)} MB, limit ${MAX_BYTES / 1048576} MB)`); continue; }
      next.push(f);
    }
    setFiles(next);
    // Rejections are named rather than silently dropped — a screenshot that
    // never attached is worse than one that was refused out loud.
    if (rejected.length) setUploadNote(`Not attached: ${rejected.join('; ')}.`);
  }

  /** What travels with the report. Shown in full before it is sent. */
  function buildContext() {
    const ctx: Record<string, unknown> = {
      area,
      route: window.location.pathname + window.location.search,
      reported_at: new Date().toISOString(),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      user_agent: navigator.userAgent,
    };
    if (record) {
      ctx.calculation = {
        id: record.id,
        when: record.created_at,
        hs_code: record.hs_code,
        description: record.description,
        customer: record.customer_name,
        line_items: record.item_count,
        mode: record.shipment_mode,
        fx_rate: record.fx_rate,
        cif_tzs: record.cif_tzs,
        duty: record.duty_amount,
        vat: record.vat_amount,
        total_tzs: record.total_tzs,
      };
    }
    return ctx;
  }

  async function submit() {
    if (!subject.trim() || !message.trim()) {
      setError('A short summary and a description are both needed — they are what a person reads first.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const ticket: any = await apiFetch('/v1/platform-support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          kind: 'bug',
          app: 'clearos',
          category: area,
          priority,
          context: includeContext ? buildContext() : { area },
          record_id: includeContext && record ? record.id : undefined,
        }),
      });

      // Attachments go up one at a time against the created ticket. A failed
      // upload is reported by name; the report itself is already filed, and
      // losing it because a screenshot was rejected would be the worse outcome.
      const failed: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        try {
          await apiFetch(`/v1/platform-support/tickets/${ticket.id}/attachments`, { method: 'POST', body: fd });
        } catch (e: any) {
          failed.push(`${f.name} — ${e?.message ?? 'upload failed'}`);
        }
      }
      if (failed.length) setUploadNote(`Report ${ticket.ref_number} was filed, but these did not attach: ${failed.join('; ')}. You can reply to the ticket to add them.`);

      setSent(ticket);
      setSubject(''); setMessage(''); setFiles([]);
      loadTickets();
    } catch (e: any) {
      setError(e?.message ?? 'The report could not be filed.');
    }
    setSending(false);
  }

  async function openTicket(id: string) {
    try { setOpen(await apiFetch(`/v1/platform-support/tickets/${id}`)); }
    catch (e: any) { setError(e?.message ?? 'Could not open that report.'); }
  }

  const ctxPreview = buildContext();

  return (
    <div className="ri-page">
      <style>{`
        .ri-page { padding: 0; }
        .ri-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 12px; }
        .ri-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border);
                   border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); --ctl-h: 44px; }
        .ri-card .input-field, .ri-card .btn, .ri-card [data-slot="select-trigger"] {
          height: var(--ctl-h); border-radius: var(--r-sm); padding-top: 0; padding-bottom: 0;
        }
        .ri-card textarea.input-field { height: auto; padding: 12px 14px; }
        .ri-lab { display: block; font-size: 11.5px; font-weight: 700; color: var(--ink3);
                  text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
        .ri-field { margin-bottom: 16px; }
        .ri-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ri-drop { border: 1.5px dashed var(--border); border-radius: var(--r); padding: 20px;
                   text-align: center; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
        .ri-drop:hover { border-color: var(--teal); background: var(--teal-l); }
        .ri-file { display: flex; align-items: center; gap: 10px; padding: 9px 12px; margin-top: 8px;
                   border: 1px solid var(--border); border-radius: var(--r-sm); font-size: 12.5px; }
        .ri-ctx { font-family: var(--mono, monospace); font-size: 11px; line-height: 1.6; color: var(--ink2);
                  background: var(--surface, rgba(0,0,0,.03)); border: 1px solid var(--border);
                  border-radius: var(--r-sm); padding: 12px; max-height: 220px; overflow: auto;
                  white-space: pre-wrap; word-break: break-word; }
        .ri-tick { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--r-sm);
                   margin-bottom: 8px; cursor: pointer; }
        .ri-tick:hover { border-color: var(--teal); }
        @media (max-width: 1000px) { .ri-grid { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 900px) { .ri-page { padding: 14px; } .ri-card { padding: 18px; } }
        @media (max-width: 480px) { .ri-row2 { grid-template-columns: 1fr; } }
      `}</style>

      <PageHeader
        crumbs={['Customs Tools', 'Report an issue']}
        titlePlain="Report an"
        titleEm="Issue"
        subtitle="Tell us what went wrong. It reaches the Hudumika platform team as a tracked ticket, and you can follow it here."
        actions={
          <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={() => navigate(-1)}>
            <Icon name="arrowLeft" size={14} /> Back
          </button>
        }
      />

      <div className="ri-grid">
        <div className="ri-card">
          {sent ? (
            <div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                <Icon name="checkCircle" size={22} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>Report {sent.ref_number} filed</div>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.6 }}>
                    It is now on the platform team's list. Its status appears in <strong>Your reports</strong> alongside, and updates
                    from the team are added to the thread — no email address needed.
                  </div>
                </div>
              </div>
              {uploadNote && (
                <div style={{ padding: '11px 14px', borderRadius: 'var(--r-sm)', background: 'var(--gold-l)', border: '1px solid var(--gold-m, var(--gold-l))', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 14 }}>
                  {uploadNote}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { setSent(null); setUploadNote(''); }}>
                  Report something else
                </button>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => openTicket(sent.id)}>
                  Open this report
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alertCircle" size={18} color="var(--teal)" /> What went wrong?
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 20 }}>
                A wrong figure, a control that does nothing, a report that will not print — all of it is worth reporting.
              </div>

              {error && (
                <div style={{ marginBottom: 16, padding: '12px 15px', borderRadius: 'var(--r-sm)', background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="alertCircle" size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} /> {error}
                </div>
              )}

              <div className="ri-field">
                <label className="ri-lab">Summary</label>
                <input className="input-field" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Landed total does not match the per-line reference"
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 13.5 }} />
              </div>

              <div className="ri-field ri-row2">
                <div>
                  <label className="ri-lab">Where in the app</label>
                  <Select value={area} onValueChange={setArea}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Landed Cost calculator">Landed Cost calculator</SelectItem>
                      <SelectItem value="Printed report / PDF">Printed report / PDF</SelectItem>
                      <SelectItem value="HS code suggestions">HS code suggestions</SelectItem>
                      <SelectItem value="Invoice import">Invoice import</SelectItem>
                      <SelectItem value="Rate Card">Rate Card</SelectItem>
                      <SelectItem value="Calculation history">Calculation history</SelectItem>
                      <SelectItem value="Somewhere else">Somewhere else</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="ri-lab">How badly it blocks you</label>
                  <Select value={priority} onValueChange={v => setPriority(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Minor — cosmetic or a nuisance</SelectItem>
                      <SelectItem value="NORMAL">Normal — I can work around it</SelectItem>
                      <SelectItem value="HIGH">High — it is holding up a job</SelectItem>
                      <SelectItem value="URGENT">Urgent — a figure went out wrong</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="ri-field">
                <label className="ri-lab">What happened</label>
                <textarea className="input-field" value={message} onChange={e => setMessage(e.target.value)} rows={6}
                  placeholder={'What you did, what you expected, and what happened instead.\n\nExample: imported a 206-line invoice, accepted the suggested HS codes, and the FOB on the report was $312 lower than the invoice states.'}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 13.5, resize: 'vertical', lineHeight: 1.6 }} />
              </div>

              <div className="ri-field">
                <label className="ri-lab">Screenshot or file</label>
                <div className="ri-drop" onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
                  <Icon name="upload" size={20} color="var(--teal)" />
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginTop: 8 }}>
                    Drop a screenshot here, or choose a file
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                    Images, PDF, CSV or a spreadsheet · up to {MAX_FILES} files, {MAX_BYTES / 1048576} MB each
                  </div>
                </div>
                <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
                  onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="ri-file">
                    <Icon name={f.type.startsWith('image/') ? 'image' : 'fileText'} size={14} color="var(--teal)" />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{f.name}</span>
                    <span style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}>
                      <Icon name="x" size={14} color="var(--red)" />
                    </button>
                  </div>
                ))}
                {uploadNote && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gold)' }}>{uploadNote}</div>}
              </div>

              <div className="ri-field">
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeContext} onChange={e => setIncludeContext(e.target.checked)} style={{ marginTop: 3 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--ink)' }}>Send what I was looking at.</strong> Everything below travels with the report so
                    nobody has to ask you to reproduce it. Uncheck to send only the description.
                  </span>
                </label>
                {includeContext && (
                  <div className="ri-ctx" style={{ marginTop: 10 }}>{JSON.stringify(ctxPreview, null, 2)}</div>
                )}
              </div>

              <button type="button" className="btn btn-primary" disabled={sending}
                style={{ width: '100%', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={submit}>
                <Icon name="send" size={14} color="#fff" />
                {sending ? 'Filing the report…' : 'File this report'}
              </button>
            </>
          )}
        </div>

        <div className="ri-card">
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={17} color="var(--teal)" /> Your reports
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
            Everything this workspace has raised with the platform team, and where each one stands.
          </div>
          {tickets.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '24px 0', textAlign: 'center' }}>
              Nothing reported yet.
            </div>
          )}
          {tickets.map(t => (
            <div key={t.id} className="ri-tick" onClick={() => openTicket(t.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11.5, fontWeight: 700, color: 'var(--teal)' }}>{t.ref_number}</span>
                <Badge variant={STATUS_VARIANT[t.status] ?? 'gray'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                {t.kind === 'bug' && <Badge variant="error">Bug</Badge>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>{t.subject}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>Raised {fmtWhen(t.created_at)}</div>
              {t.resolution && (
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--green-l)', fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--green)' }}>Outcome: </strong>{t.resolution}
                </div>
              )}
            </div>
          ))}

          {open && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{open.ref_number} · thread</strong>
                <button type="button" onClick={() => setOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                  <Icon name="x" size={14} color="var(--ink3)" />
                </button>
              </div>
              {(open.messages ?? []).map((m: any) => (
                <div key={m.id} style={{
                  padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--r-sm)', fontSize: 12.5, lineHeight: 1.55,
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
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 6 }}>Attachments</div>
                  {open.attachments.map((a: any) => (
                    <a key={a.id} href={`${BASE_URL}/v1/platform-support/attachments/${a.id}`} target="_blank" rel="noreferrer"
                      className="ri-file" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Icon name={String(a.mime_type).startsWith('image/') ? 'image' : 'fileText'} size={14} color="var(--teal)" />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                      <span style={{ color: 'var(--ink3)' }}>{(a.size_bytes / 1024).toFixed(0)} KB</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportIssuePage;
