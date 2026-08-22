// ─── SignEditor.tsx — Envelope Builder with drag-drop field placement ─────────
// Layout: [Left: field palette + recipients] [Center: A4 page canvas] [Right: field properties]
// Fields are placed on the page by clicking the field type then clicking on the page.
// Coordinates stored as fractions (0–1) so they survive font/page-size changes.

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import type { SignFieldType } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import './Sign.css';

const FIELD_TYPES: { type: SignFieldType; label: string; icon: IconName; defaultW: number; defaultH: number }[] = [
  { type: 'signature', label: 'Signature',   icon: 'edit',      defaultW: 0.28, defaultH: 0.06 },
  { type: 'initials',  label: 'Initials',    icon: 'edit',      defaultW: 0.12, defaultH: 0.05 },
  { type: 'date',      label: 'Date',        icon: 'calendar',  defaultW: 0.18, defaultH: 0.04 },
  { type: 'text',      label: 'Text Field',  icon: 'fileText',  defaultW: 0.25, defaultH: 0.04 },
  { type: 'checkbox',  label: 'Checkbox',    icon: 'check',     defaultW: 0.04, defaultH: 0.04 },
  { type: 'stamp',     label: 'Verification Stamp', icon: 'stamp', defaultW: 0.16, defaultH: 0.11 },
];

const RECIPIENT_COLORS = ['#1a56db','#0e9f6e','#d97706','#7c3aed','#db2777','#0891b2'];

interface PlacedField {
  id: string;
  field_type: SignFieldType;
  recipient_index: number;
  page: number;
  x: number; y: number; width: number; height: number;
  required: boolean;
  placeholder?: string;
}

interface RecipientInput {
  name: string; email: string; phone: string; role_label: string; sign_order: number;
}

const A4_ASPECT = 1.414; // height/width ratio of A4

export function SignEditor() {
  const navigate = useNavigate();
  const { id: envelopeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();

  // ── State ────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [orderMode, setOrderMode] = useState<'sequential' | 'parallel'>('sequential');
  const [requireOtp, setRequireOtp] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [documentData, setDocumentData] = useState<string | null>(null); // base64 of a freshly uploaded PDF/image — sent to the server as-is
  // A real existing Cloud file (cloud_files.id), e.g. arriving via
  // ?fileId=&fileName= from Cloud's own "Sign & Stamp" button — sign_envelopes.
  // file_id already has a real FK to cloud_files (migration 267), so this
  // envelope references the file in place rather than duplicating it as a
  // second base64 copy. previewSrc is only ever for rendering the canvas —
  // never sent to the server.
  const [sourceFileId, setSourceFileId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { name: '', email: '', phone: '', role_label: '', sign_order: 1 },
  ]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [activeRecipient, setActiveRecipient] = useState(0);
  const [placingType, setPlacingType] = useState<SignFieldType | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load existing envelope ────────────────────────────────────────────────
  useEffect(() => {
    if (!envelopeId) return;
    apiFetch(`/v1/sign/envelopes/${envelopeId}`).then(env => {
      setTitle(env.title ?? '');
      setMessage(env.message ?? '');
      setOrderMode(env.order_mode ?? 'sequential');
      setRequireOtp(!!env.require_otp);
      setFileName(env.file_name ?? null);
      setDocumentData(env.document_data ?? null);
      if (env.document_data) setPreviewSrc(env.document_data);
      else if (env.file_id) {
        setSourceFileId(env.file_id);
        apiFetchBlob(`/v1/files/${env.file_id}/preview`).then(blob => setPreviewSrc(URL.createObjectURL(blob))).catch(console.error);
      }
      if (env.recipients?.length) {
        setRecipients(env.recipients.map((r: RecipientInput & { id: string }) => ({ name: r.name, email: r.email, phone: r.phone ?? '', role_label: r.role_label ?? '', sign_order: r.sign_order })));
      }
      if (env.fields?.length) {
        setFields(env.fields.map((f: PlacedField & { id: string; recipient_id: string }) => ({
          id: f.id,
          field_type: f.field_type,
          recipient_index: env.recipients?.findIndex((r: { id: string }) => r.id === f.recipient_id) ?? 0,
          page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
          required: f.required, placeholder: f.placeholder ?? undefined,
        })));
      }
    }).catch(console.error);
  }, [envelopeId]);

  // ── Start from an existing Cloud file (e.g. Cloud's own "Sign & Stamp"
  // button — GET /sign/editor?fileId=&fileName=) ─────────────────────────────
  // Only for a brand-new envelope; an existing one's own file_id (above)
  // takes priority once envelopeId is set.
  useEffect(() => {
    if (envelopeId) return;
    const fileId = searchParams.get('fileId');
    const name = searchParams.get('fileName');
    if (!fileId) return;
    setSourceFileId(fileId);
    if (name) { setFileName(name); setTitle(prev => prev || `Sign — ${name}`); }
    apiFetchBlob(`/v1/files/${fileId}/preview`).then(blob => setPreviewSrc(URL.createObjectURL(blob))).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId]);

  // ── Start from a saved template (SignTemplates.tsx's "Use Template" button
  // — GET /sign/editor?template=<id>) ─────────────────────────────────────────
  // Only for a brand-new envelope, same reasoning as the Cloud-file effect above.
  useEffect(() => {
    if (envelopeId) return;
    const templateId = searchParams.get('template');
    if (!templateId) return;
    apiFetch(`/v1/sign/templates/${templateId}`).then(t => {
      setTitle(prev => prev || t.name);
      if (t.recipients?.length) {
        setRecipients(t.recipients.map((r: RecipientInput) => ({ name: r.name ?? '', email: r.email ?? '', phone: r.phone ?? '', role_label: r.role_label ?? '', sign_order: r.sign_order ?? 1 })));
      }
      if (t.fields?.length) {
        setFields(t.fields.map((f: Omit<PlacedField, 'id'>) => ({
          id: crypto.randomUUID(),
          field_type: f.field_type, recipient_index: f.recipient_index ?? 0, page: f.page ?? 1,
          x: f.x, y: f.y, width: f.width, height: f.height,
          required: f.required ?? true, placeholder: f.placeholder ?? undefined,
        })));
      }
      if (t.file_id) {
        setSourceFileId(t.file_id);
        if (t.file_name) setFileName(t.file_name);
        apiFetchBlob(`/v1/files/${t.file_id}/preview`).then(blob => setPreviewSrc(URL.createObjectURL(blob))).catch(console.error);
      }
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId]);

  // ── File upload ───────────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSourceFileId(null); // a fresh upload replaces whichever existing Cloud file this started from, if any
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string ?? null;
      setDocumentData(dataUrl);
      setPreviewSrc(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  // ── Drag and Drop handlers ────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;

    // Check if moving an existing field
    const moveFieldId = e.dataTransfer.getData('text/move-field-id');
    if (moveFieldId) {
      setFields(prev => prev.map(f => {
        if (f.id === moveFieldId) {
          return {
            ...f,
            x: Math.max(0, Math.min(1 - f.width, xFrac - f.width / 2)),
            y: Math.max(0, Math.min(1 - f.height, yFrac - f.height / 2)),
          };
        }
        return f;
      }));
      setSelectedField(moveFieldId);
      return;
    }

    // Otherwise, dropping a new field from the palette
    const type = e.dataTransfer.getData('text/plain') as SignFieldType;
    if (!type) return;
    const tpl = FIELD_TYPES.find(f => f.type === type);
    if (!tpl) return;

    const newField: PlacedField = {
      id: crypto.randomUUID(),
      field_type: type,
      recipient_index: activeRecipient,
      page: 1,
      x: Math.max(0, Math.min(1 - tpl.defaultW, xFrac - tpl.defaultW / 2)),
      y: Math.max(0, Math.min(1 - tpl.defaultH, yFrac - tpl.defaultH / 2)),
      width: tpl.defaultW,
      height: tpl.defaultH,
      required: true,
    };
    setFields(prev => [...prev, newField]);
    setSelectedField(newField.id);
  }

  // ── Place field on page click ─────────────────────────────────────────────
  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placingType || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;
    const tpl = FIELD_TYPES.find(f => f.type === placingType)!;
    const newField: PlacedField = {
      id: crypto.randomUUID(),
      field_type: placingType,
      recipient_index: activeRecipient,
      page: 1,
      x: Math.max(0, Math.min(1 - tpl.defaultW, xFrac - tpl.defaultW / 2)),
      y: Math.max(0, Math.min(1 - tpl.defaultH, yFrac - tpl.defaultH / 2)),
      width: tpl.defaultW,
      height: tpl.defaultH,
      required: true,
    };
    setFields(prev => [...prev, newField]);
    setPlacingType(null);
    setSelectedField(newField.id);
  }

  // ── Save as draft ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) { alert('Please enter an envelope title'); return; }
    if (recipients.some(r => !r.name.trim() || !r.email.trim())) {
      alert('All recipients must have a name and email'); return;
    }
    setSaving(true);
    try {
      // `fields` is already recipient_index-shaped (an index into
      // `recipients`, not a recipient_id) — POST /envelopes and PUT
      // /envelopes/:id both resolve that index into the real recipient row
      // server-side, the same way, so the same body works unmodified for
      // both a brand-new envelope and an edit of an existing draft. PUT
      // used to be sent `recipient_id: ''` on every field here, which the
      // backend's NOT NULL uuid column rejected outright on every save of
      // an already-created draft that had any fields placed.
      const body = { title, message, order_mode: orderMode, require_otp: requireOtp, file_name: fileName, document_data: sourceFileId ? null : documentData, file_id: sourceFileId, recipients, fields };
      if (envelopeId) {
        await apiFetch(`/v1/sign/envelopes/${envelopeId}`, { method: 'PUT', body: JSON.stringify(body) });
        navigate(`/sign/envelope/${envelopeId}`);
      } else {
        const env = await apiFetch('/v1/sign/envelopes', { method: 'POST', body: JSON.stringify(body) });
        navigate(`/sign/envelope/${env.id}`);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ── Send directly ─────────────────────────────────────────────────────────
  async function handleSend() {
    if (!title.trim() || recipients.some(r => !r.name.trim() || !r.email.trim())) {
      alert('Please fill in all required fields before sending'); return;
    }
    if (fields.length === 0) {
      if (!confirm('No signature fields placed. Send anyway?')) return;
    }
    setSending(true);
    try {
      const body = { title, message, order_mode: orderMode, require_otp: requireOtp, file_name: fileName, document_data: sourceFileId ? null : documentData, file_id: sourceFileId, recipients, fields };
      let envId = envelopeId;
      if (!envId) {
        const env = await apiFetch('/v1/sign/envelopes', { method: 'POST', body: JSON.stringify(body) });
        envId = env.id;
      } else {
        // An existing draft's current title/recipients/fields must actually
        // be persisted before sending — this used to build `body` and then
        // never send it on this path, jumping straight to /send, so any
        // edit made since the last "Save Draft" click was silently lost.
        await apiFetch(`/v1/sign/envelopes/${envId}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      await apiFetch(`/v1/sign/envelopes/${envId}/send`, { method: 'POST' });
      navigate(`/sign/envelope/${envId}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  // ── Save current layout as a reusable template ────────────────────────────
  async function handleSaveAsTemplate() {
    if (!title.trim()) { alert('Please enter an envelope title first'); return; }
    const name = window.prompt('Template name:', title);
    if (!name?.trim()) return;
    try {
      await apiFetch('/v1/sign/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          fields: fields.map(f => ({ recipient_index: f.recipient_index, field_type: f.field_type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, placeholder: f.placeholder ?? null })),
          recipients: recipients.map(r => ({ name: r.name, email: r.email, phone: r.phone || null, role_label: r.role_label || null, sign_order: r.sign_order })),
          file_id: sourceFileId,
          file_name: fileName,
        }),
      });
      alert('Template saved — find it under Templates.');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save template');
    }
  }

  // ── Computed page size ────────────────────────────────────────────────────
  const [pageW, setPageW] = useState(600);
  const pageH = Math.round(pageW * A4_ASPECT);

  useEffect(() => {
    function measure() {
      const w = pageRef.current?.parentElement?.clientWidth ?? 600;
      setPageW(Math.min(w - 48, 800));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const addRecipient = () => setRecipients(prev => [...prev, { name: '', email: '', phone: '', role_label: '', sign_order: prev.length + 1 }]);
  const removeRecipient = (i: number) => {
    setRecipients(prev => prev.filter((_, idx) => idx !== i));
    setFields(prev => prev.filter(f => f.recipient_index !== i).map(f => ({ ...f, recipient_index: f.recipient_index > i ? f.recipient_index - 1 : f.recipient_index })));
    if (activeRecipient >= i) setActiveRecipient(Math.max(0, activeRecipient - 1));
  };
  const removeField = (id: string) => { setFields(prev => prev.filter(f => f.id !== id)); setSelectedField(null); };
  const selectedFieldData = fields.find(f => f.id === selectedField);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)', flexShrink: 0 }}>
        <button onClick={() => navigate('/sign')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 18, padding: 4 }}>←</button>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Envelope title…"
          style={{ flex: 1, fontSize: 16, fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--ink)', outline: 'none' }} />
        <select value={orderMode} onChange={e => setOrderMode(e.target.value as 'sequential' | 'parallel')}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13 }}>
          <option value="sequential">Sequential signing</option>
          <option value="parallel">Parallel signing</option>
        </select>
        <label title="Each recipient must have a phone number on file — they'll get a text code before they can sign"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={requireOtp} onChange={e => setRequireOtp(e.target.checked)} />
          Require SMS verification
        </label>
        <button onClick={handleSaveAsTemplate}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          Save as Template
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button onClick={handleSend} disabled={sending}
          style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {sending ? 'Sending…' : 'Send ➤'}
        </button>
      </div>

      {/* Three-column editor body */}
      <div className="sign-editor-layout" style={{ flex: 1 }}>

        {/* LEFT: Field palette + Recipients */}
        <div className="sign-editor-left">
          {/* Recipients */}
          <div className="sign-panel-title">Recipients</div>
          <div style={{ padding: '0 12px 8px' }}>
            {recipients.map((r, i) => (
              <div key={i} className={`sign-recipient-row ${activeRecipient === i ? 'active' : ''}`}
                onClick={() => setActiveRecipient(i)}>
                <div className="sign-recipient-color" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name || `Recipient ${i + 1}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email || 'no email'}</div>
                </div>
                {recipients.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); removeRecipient(i); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, fontSize: 14 }}>✕</button>
                )}
              </div>
            ))}
            <button onClick={addRecipient}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', fontSize: 12.5, marginTop: 4 }}>
              + Add Recipient
            </button>
          </div>

          {/* Active recipient form */}
          <div style={{ padding: '0 12px 16px' }}>
            {['name', 'email', 'phone', 'role_label'].map(key => (
              <input key={key}
                value={(recipients[activeRecipient] as any)?.[key] ?? ''}
                onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, [key]: e.target.value } : r))}
                placeholder={key === 'role_label' ? 'Role (e.g. Customer)' : key === 'phone' ? 'Phone (optional — WhatsApp delivery)' : key.charAt(0).toUpperCase() + key.slice(1)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, marginTop: 6, boxSizing: 'border-box' }}
              />
            ))}
          </div>

          {/* Field type palette */}
          <div className="sign-panel-title">Fields — drag or click to place</div>
          <div className="sign-field-palette">
            {FIELD_TYPES.map(ft => (
              <button key={ft.type} className="sign-field-type-btn"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', ft.type);
                }}
                style={{ background: placingType === ft.type ? 'var(--sign-blue-l)' : undefined, borderColor: placingType === ft.type ? 'var(--sign-blue)' : undefined, color: placingType === ft.type ? 'var(--sign-blue)' : undefined }}
                onClick={() => setPlacingType(prev => prev === ft.type ? null : ft.type)}>
                <Icon name={ft.icon} size={15} style={{ marginRight: 8 }} />
                <span>{ft.label}</span>
                {placingType === ft.type && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700 }}>CLICK PAGE ↑</span>}
              </button>
            ))}
          </div>

          {/* Message */}
          <div className="sign-panel-title">Message (optional)</div>
          <div style={{ padding: '0 12px 16px' }}>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Add a personal message to signers…"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* CENTER: A4 page preview */}
        <div className="sign-editor-center">
          {/* File upload area */}
          {!previewSrc && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{ width: pageW, height: Math.round(pageW * 0.3), border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--ink3)', transition: 'border-color 0.15s' }}>
              <Icon name="file" size={36} style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Upload Document</div>
              <div style={{ fontSize: 12 }}>PDF, DOCX, PNG, JPG</div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" style={{ display: 'none' }} onChange={handleFile} />

          {/* A4 page canvas */}
          <div ref={pageRef} className="sign-page-canvas-wrap"
            style={{ width: pageW, height: pageH, cursor: placingType ? 'crosshair' : 'default' }}
            onClick={handlePageClick}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}>

            {/* Document background — this used to always render <img src=
                {documentData}>, even for a PDF upload (the dropzone's own
                label promises "PDF, DOCX, PNG, JPG"): a PDF data URL isn't
                image data, so the canvas just showed a broken-image icon
                for the one file type most real documents in this platform
                actually are. */}
            {previewSrc ? (
              fileName?.toLowerCase().endsWith('.pdf')
                ? <iframe src={previewSrc} title={fileName} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
                : <img src={previewSrc} alt="document" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', padding: '5% 8%', boxSizing: 'border-box', gap: 8 }}>
                {/* Simulated document lines */}
                <div style={{ height: 3, background: '#dbeafe', borderRadius: 2, width: '60%' }} />
                {Array.from({ length: 22 }).map((_, i) => (
                  <div key={i} style={{ height: 2, background: i % 5 === 0 ? '#e5e7eb' : '#f3f4f6', borderRadius: 1, width: i % 7 === 0 ? '70%' : i % 3 === 0 ? '85%' : '95%' }} />
                ))}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, opacity: 0.5 }}>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Upload a document above or place fields directly</div>
                </div>
              </div>
            )}

            {/* Placed fields */}
            {fields.map(field => (
              <div key={field.id}
                className={`sign-field-overlay`}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/move-field-id', field.id);
                }}
                style={{
                  left: `${field.x * 100}%`, top: `${field.y * 100}%`,
                  width: `${field.width * 100}%`, height: `${field.height * 100}%`,
                  borderColor: RECIPIENT_COLORS[field.recipient_index % RECIPIENT_COLORS.length],
                  background: `${RECIPIENT_COLORS[field.recipient_index % RECIPIENT_COLORS.length]}18`,
                  color: RECIPIENT_COLORS[field.recipient_index % RECIPIENT_COLORS.length],
                  outline: selectedField === field.id ? '2px solid currentColor' : 'none',
                  borderRadius: field.field_type === 'stamp' ? '50%' : '4px',
                }}
                onClick={e => { e.stopPropagation(); setSelectedField(field.id); setPlacingType(null); }}>
                <span style={{ fontSize: 9, fontWeight: 700, userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: '100%', width: '100%', textAlign: 'center', padding: 2, boxSizing: 'border-box' }}>
                  <Icon name={FIELD_TYPES.find(ft => ft.type === field.field_type)?.icon || 'fileText'} size={12} />
                  {field.field_type === 'stamp' ? 'Stamp' : field.field_type}
                </span>
              </div>
            ))}

            {/* Stamp badge (decorative, shows bottom-right on completed) */}
            {fields.length > 0 && (
              <div style={{ position: 'absolute', bottom: 12, right: 12, opacity: 0.25, pointerEvents: 'none' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#1a56db', border: '1px solid #1a56db', borderRadius: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.9)', letterSpacing: '0.05em', fontWeight: 700 }}>
                  HSGN-XXXXXX-XXXXXX
                </div>
              </div>
            )}
          </div>

          {placingType && (
            <div style={{ background: 'var(--sign-blue)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500 }}>
              Click anywhere on the page to place the <strong>{placingType}</strong> field
            </div>
          )}
        </div>

        {/* RIGHT: Selected field properties */}
        <div className="sign-editor-right">
          <div className="sign-panel-title">Field Properties</div>
          {selectedFieldData ? (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Field Type</label>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{selectedFieldData.field_type}</div>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Assigned To</label>
                <select value={selectedFieldData.recipient_index}
                  onChange={e => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, recipient_index: Number(e.target.value) } : f))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                  {recipients.map((r, i) => (
                    <option key={i} value={i}>{r.name || `Recipient ${i + 1}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Placeholder Text</label>
                <input value={selectedFieldData.placeholder ?? ''}
                  onChange={e => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, placeholder: e.target.value } : f))}
                  placeholder="e.g. Sign here"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedFieldData.required}
                  onChange={e => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, required: e.target.checked } : f))} />
                <span style={{ fontSize: 13 }}>Required field</span>
              </label>
              <button onClick={() => removeField(selectedFieldData.id)}
                style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--sign-red)', background: 'var(--sign-red-l)', color: 'var(--sign-red)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                🗑 Remove Field
              </button>
            </div>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              Select a field on the page to edit its properties
            </div>
          )}

          {/* Field list */}
          {fields.length > 0 && (
            <>
              <div className="sign-panel-title" style={{ marginTop: 8 }}>All Fields ({fields.length})</div>
              <div style={{ padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fields.map((f, i) => (
                  <div key={f.id}
                    onClick={() => setSelectedField(f.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', background: selectedField === f.id ? 'var(--sign-blue-l)' : 'transparent', borderColor: selectedField === f.id ? 'var(--sign-blue)' : 'var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: RECIPIENT_COLORS[f.recipient_index % RECIPIENT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1 }}>{FIELD_TYPES.find(ft => ft.type === f.field_type)?.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>p.{f.page}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
