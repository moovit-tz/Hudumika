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
import { Button } from '../../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { showPrompt } from '../../lib/prompt.js';
import { Tip } from '../../components/ui/tooltip.js';
// Reused as-is from Cloud's Lightbox, built earlier this session for the
// exact same underlying problem: an <iframe> showing a PDF via the
// browser's native viewer is a separate browsing context, and native
// HTML5 drag events don't reliably cross into/out of one — dragging a
// field from the palette onto the document silently failed everywhere
// except a sliver of margin outside the iframe, which for a full-bleed
// preview is nowhere at all. A real <canvas> render lives in the same DOM
// tree as everything else, so the existing onDrop/onClick handlers on the
// wrapping div see it like any other element.
import { usePdfDocument } from '../cloud/lib/usePdfDocument.js';
import { PdfPageCanvas } from '../cloud/components/PdfPageCanvas.js';
// Stirling-PDF (github.com/Stirling-Tools/Stirling-PDF, self-hosted, MIT) is
// this platform's PDF tool — Nutrient's Web SDK (nutrient.io) was tried
// first and removed: it needed a paid per-account license key just to load
// at all, where Stirling-PDF needs only a self-hosted container URL, and
// its own discrete-operation shape (rotate/watermark/redact/OCR/compress,
// submit-and-get-a-new-file) is what StirlingPdfTools.tsx below is built for.
import { StirlingPdfTools } from './StirlingPdfTools.js';
import { VersionHistoryPanel } from './VersionHistoryPanel.js';
import { draftKey, loadDraft, saveDraft, clearDraft, isMeaningfulDraft, type SignDraft } from './draftStore.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import './Sign.css';

const FIELD_TYPES: { type: SignFieldType; label: string; icon: IconName; defaultW: number; defaultH: number }[] = [
  // Signature and stamp bumped up from 0.28x0.06 / 0.16x0.11 — both were
  // rendering small on the actual signed PDF (sign-pdf.service.ts scales
  // the drawn image to exactly fill field.width x field.height, so this is
  // the only lever there is; a placed field has no resize handle, only
  // drag-to-move, so the default is the field's size for good).
  { type: 'signature', label: 'Signature',   icon: 'edit',      defaultW: 0.34, defaultH: 0.09 },
  { type: 'initials',  label: 'Initials',    icon: 'edit',      defaultW: 0.12, defaultH: 0.05 },
  { type: 'date',      label: 'Date',        icon: 'calendar',  defaultW: 0.18, defaultH: 0.04 },
  { type: 'text',      label: 'Text Field',  icon: 'fileText',  defaultW: 0.25, defaultH: 0.04 },
  { type: 'checkbox',  label: 'Checkbox',    icon: 'check',     defaultW: 0.04, defaultH: 0.04 },
  { type: 'stamp',     label: 'Verification Stamp', icon: 'stamp', defaultW: 0.20, defaultH: 0.14 },
  // Only meaningful assigned to a recipient flagged "Certifying Advocate"
  // below — draws real text (name, roll number, firm, date), not an image,
  // since the legal weight is in those facts about a specific licensed
  // person, not a picture.
  { type: 'certification_stamp', label: 'Certified True Copy Stamp', icon: 'shield', defaultW: 0.30, defaultH: 0.16 },
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
  // Set when tagged to a real internal platform user via EntityPicker
  // rather than typed in freeform — see migration 276_sign_recipient_user_tag.
  user_id?: string | null;
  // Certified True Copy (migration 342) — this recipient is a licensed
  // advocate/notary/commissioner certifying the document, not an ordinary
  // signer. Optional, collapsed by default — most documents never need it.
  is_certifier?: boolean;
  certifier_title?: string;
  certifier_roll_number?: string;
  certifier_firm?: string;
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
  const [showPdfTools, setShowPdfTools] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  // What actually changed the document since it was last saved — set by
  // handleFile/handleEditedDocument, sent along on the next Save/Send so
  // the version history's change_summary/change_details are genuine
  // (SignEditor knows which tool just ran; the backend never has to guess
  // from a diff of opaque bytes), then cleared once that save lands.
  const [pendingChangeSummary, setPendingChangeSummary] = useState<{ summary: string; details?: unknown } | null>(null);
  // Local-only autosave (draftStore.ts, IndexedDB) — a reload before a real
  // Save/Send would otherwise lose everything typed so far. draftReadyRef
  // gates the autosave effect below until whichever restore path applies
  // (existing envelope loaded from the server, or a brand-new one's own
  // localStorage-adjacent draft) has finished, so the autosave effect can't
  // fire on the transient blank state and overwrite a real draft with it.
  const draftReadyRef = useRef(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  const isPdf = !!fileName?.toLowerCase().endsWith('.pdf');
  const { doc: pdfDoc, numPages: pdfNumPages, loading: pdfLoading, error: pdfError } = usePdfDocument(isPdf ? previewSrc : null);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  // The real page's own proportions, not a fixed A4 guess — sign-pdf.service.ts
  // bakes fields onto the real PDF using its own real page.getSize(), so the
  // editor's own "page box" has to be shaped like the actual page or a field
  // placed correctly here would land in the wrong spot once signed. Reset
  // whenever the document itself changes.
  const [naturalPageSize, setNaturalPageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => { setCurrentPdfPage(1); setNaturalPageSize(null); }, [pdfDoc]);
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    pdfDoc.getPage(1).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setNaturalPageSize({ width: vp.width, height: vp.height });
    });
    return () => { cancelled = true; };
  }, [pdfDoc]);
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { name: '', email: '', phone: '', role_label: '', sign_order: 1, user_id: null },
  ]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [activeRecipient, setActiveRecipient] = useState(0);
  const [placingType, setPlacingType] = useState<SignFieldType | null>(null);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'left' | 'center' | 'right'>('center');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The recipient picker below searches CRM customers first, then staff —
  // whoever this document is actually for is usually a customer, and staff
  // are the secondary case (an internal reviewer/counter-signer). Only a
  // staff pick can carry a real `user_id` (sign_recipients.user_id is a real
  // FK into `users`, migration 276 — a customer's id would violate it), so
  // each cached entry remembers which source it came from. EntityPicker's
  // own PickerItem only carries {id, label, sublabel}, not email/phone/
  // source, so the full record is cached here (by the prefixed id) to pull
  // it back once a result is actually picked, rather than a second round trip.
  const recipientCacheRef = useRef<Map<string, { source: 'customer' | 'staff'; name: string; email: string; phone: string | null }>>(new Map());
  const searchRecipients = useCallback(async (q: string): Promise<PickerItem[]> => {
    const [customersRes, staffRes] = await Promise.all([
      apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []),
      apiFetch(`/v1/hr/staff?search=${encodeURIComponent(q)}`).catch(() => []),
    ]);
    const customers = Array.isArray(customersRes) ? customersRes : (customersRes?.data ?? []);
    const staff = Array.isArray(staffRes) ? staffRes : [];

    const customerItems: PickerItem[] = customers.slice(0, 15).map((c: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; phone_wa: string | null }) => {
      const name = c.contact_name?.trim() || c.name;
      const key = `customer:${c.id}`;
      recipientCacheRef.current.set(key, { source: 'customer', name, email: c.email ?? '', phone: c.phone || c.phone_wa || null });
      return { id: key, label: name, sublabel: `Customer${c.contact_name?.trim() ? ` · ${c.name}` : ''}` };
    });
    const staffItems: PickerItem[] = staff.slice(0, 15).map((u: { id: string; name: string; email: string; phone: string | null }) => {
      const key = `staff:${u.id}`;
      recipientCacheRef.current.set(key, { source: 'staff', name: u.name, email: u.email, phone: u.phone ?? null });
      return { id: key, label: u.name, sublabel: `Staff · ${u.email}` };
    });
    // CRM first, staff after — matches "query CRM first, then staff".
    return [...customerItems, ...staffItems];
  }, []);

  // No match in either CRM or staff — accept the typed name as a one-off
  // external signer instead. Nothing is created in the CRM or staff
  // directory for this; the "creation" is just accepting the free-text
  // name so the recipient fields below fill in immediately rather than
  // making someone retype what they just searched for.
  const createExternalRecipient = useCallback(async (name: string): Promise<PickerItem> => ({ id: '', label: name }), []);

  // ── Load existing envelope ────────────────────────────────────────────────
  useEffect(() => {
    if (!envelopeId) return;
    apiFetch(`/v1/sign/envelopes/${envelopeId}`).then(async env => {
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
        setRecipients(env.recipients.map((r: RecipientInput & { id: string }) => ({
          name: r.name, email: r.email, phone: r.phone ?? '', role_label: r.role_label ?? '', sign_order: r.sign_order, user_id: r.user_id ?? null,
          is_certifier: r.is_certifier ?? false, certifier_title: r.certifier_title ?? '', certifier_roll_number: r.certifier_roll_number ?? '', certifier_firm: r.certifier_firm ?? '',
        })));
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

      // A local draft under this same envelope's id only survives past a
      // successful save (see clearDraft calls in handleSave/handleSend), so
      // if one is still here it's genuinely unsaved work from an interrupted
      // session — always more recent than whatever the server just returned.
      const draft = await loadDraft(draftKey(envelopeId));
      if (draft && isMeaningfulDraft(draft)) {
        setTitle(draft.title);
        setMessage(draft.message);
        setOrderMode(draft.orderMode);
        setRequireOtp(draft.requireOtp);
        setFileName(draft.fileName);
        setDocumentData(draft.documentData);
        setSourceFileId(draft.sourceFileId);
        setRecipients(draft.recipients as RecipientInput[]);
        setFields(draft.fields as PlacedField[]);
        setPendingChangeSummary(draft.pendingChangeSummary);
        if (draft.documentData) setPreviewSrc(draft.documentData);
        else if (draft.sourceFileId) {
          apiFetchBlob(`/v1/files/${draft.sourceFileId}/preview`).then(blob => setPreviewSrc(URL.createObjectURL(blob))).catch(console.error);
        }
        setDraftRestoredAt(draft.savedAt);
      }
      draftReadyRef.current = true;
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
        setRecipients(t.recipients.map((r: RecipientInput) => ({ name: r.name ?? '', email: r.email ?? '', phone: r.phone ?? '', role_label: r.role_label ?? '', sign_order: r.sign_order ?? 1, user_id: r.user_id ?? null })));
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

  // ── Restore a not-yet-created envelope's local draft ────────────────────
  // Skipped when ?fileId= or ?template= is present — arriving here from
  // Cloud's "Sign & Stamp" or "Use Template" is a deliberate fresh start,
  // which should win over an old, possibly unrelated abandoned draft.
  useEffect(() => {
    if (envelopeId) return;
    if (searchParams.get('fileId') || searchParams.get('template')) { draftReadyRef.current = true; return; }
    loadDraft(draftKey(undefined)).then(draft => {
      if (draft && isMeaningfulDraft(draft)) {
        setTitle(draft.title);
        setMessage(draft.message);
        setOrderMode(draft.orderMode);
        setRequireOtp(draft.requireOtp);
        setFileName(draft.fileName);
        setDocumentData(draft.documentData);
        setSourceFileId(draft.sourceFileId);
        setRecipients(draft.recipients as RecipientInput[]);
        setFields(draft.fields as PlacedField[]);
        setPendingChangeSummary(draft.pendingChangeSummary);
        if (draft.documentData) setPreviewSrc(draft.documentData);
        else if (draft.sourceFileId) {
          apiFetchBlob(`/v1/files/${draft.sourceFileId}/preview`).then(blob => setPreviewSrc(URL.createObjectURL(blob))).catch(console.error);
        }
        setDraftRestoredAt(draft.savedAt);
      }
      draftReadyRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId]);

  // ── Autosave the in-progress envelope locally (IndexedDB) ────────────────
  useEffect(() => {
    if (!draftReadyRef.current) return;
    const handle = setTimeout(() => {
      const draft: SignDraft = {
        title, message, orderMode, requireOtp, fileName, documentData, sourceFileId,
        recipients, fields, pendingChangeSummary, savedAt: Date.now(),
      };
      if (isMeaningfulDraft(draft)) saveDraft(draftKey(envelopeId), draft);
    }, 800);
    return () => clearTimeout(handle);
  }, [envelopeId, title, message, orderMode, requireOtp, fileName, documentData, sourceFileId, recipients, fields, pendingChangeSummary]);

  // ── File upload ───────────────────────────────────────────────────────────
  // Suggests a title from the file's own name (strip extension, turn
  // separators into spaces) rather than leaving "Envelope title…" empty —
  // purely a starting point: setTitle below only fills an empty field, and
  // the title input stays a normal controlled input, so typing over it or
  // editing it after the fact works exactly as it always did.
  function suggestTitleFromFileName(name: string): string {
    return name.replace(/\.[^./]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSourceFileId(null); // a fresh upload replaces whichever existing Cloud file this started from, if any
    setTitle(prev => prev.trim() ? prev : suggestTitleFromFileName(file.name));
    setPendingChangeSummary({ summary: documentData || sourceFileId ? 'Document replaced' : 'Document uploaded' });
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string ?? null;
      setDocumentData(dataUrl);
      setPreviewSrc(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  // The processed PDF coming back from a Stirling-PDF tool run (or a
  // reverted version from Version History) replaces the working document
  // exactly the same way a fresh local upload does above — it's a new
  // binary now, no longer in sync with whichever Cloud file (if any) it
  // started from. summary/details, when given, become this change's
  // version-history entry on the next save.
  function handleEditedDocument(blob: Blob, summary?: string, details?: unknown) {
    setSourceFileId(null);
    if (summary) setPendingChangeSummary({ summary, details });
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string ?? null;
      setDocumentData(dataUrl);
      setPreviewSrc(dataUrl);
    };
    reader.readAsDataURL(blob);
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
      page: currentPdfPage,
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
      page: currentPdfPage,
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
    if (!title.trim()) { showAlert('Please enter an envelope title'); return; }
    if (recipients.some(r => !r.name.trim() || !r.email.trim())) {
      showAlert('All recipients must have a name and email'); return;
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
      const body = {
        title, message, order_mode: orderMode, require_otp: requireOtp, file_name: fileName,
        document_data: sourceFileId ? null : documentData, file_id: sourceFileId, recipients, fields,
        changeSummary: pendingChangeSummary?.summary, changeDetails: pendingChangeSummary?.details,
      };
      if (envelopeId) {
        await apiFetch(`/v1/sign/envelopes/${envelopeId}`, { method: 'PUT', body: JSON.stringify(body) });
        navigate(`/sign/envelope/${envelopeId}`);
      } else {
        const env = await apiFetch('/v1/sign/envelopes', { method: 'POST', body: JSON.stringify(body) });
        navigate(`/sign/envelope/${env.id}`);
      }
      setPendingChangeSummary(null);
      clearDraft(draftKey(envelopeId));
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ── Send directly ─────────────────────────────────────────────────────────
  async function handleSend() {
    if (!title.trim() || recipients.some(r => !r.name.trim() || !r.email.trim())) {
      showAlert('Please fill in all required fields before sending'); return;
    }
    if (fields.length === 0) {
      if (!(await showConfirm('No signature fields have been placed on the document.', { title: 'Send anyway?', variant: 'warning', confirmLabel: 'Send Anyway' }))) return;
    }
    setSending(true);
    try {
      const body = {
        title, message, order_mode: orderMode, require_otp: requireOtp, file_name: fileName,
        document_data: sourceFileId ? null : documentData, file_id: sourceFileId, recipients, fields,
        changeSummary: pendingChangeSummary?.summary, changeDetails: pendingChangeSummary?.details,
      };
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
      setPendingChangeSummary(null);
      clearDraft(draftKey(envelopeId));
      navigate(`/sign/envelope/${envId}`);
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  // ── Save current layout as a reusable template ────────────────────────────
  async function handleSaveAsTemplate() {
    if (!title.trim()) { showAlert('Please enter an envelope title first'); return; }
    const name = await showPrompt('', { title: 'Template name', defaultValue: title, required: true, confirmLabel: 'Save Template' });
    if (!name?.trim()) return;
    try {
      await apiFetch('/v1/sign/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          fields: fields.map(f => ({ recipient_index: f.recipient_index, field_type: f.field_type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, placeholder: f.placeholder ?? null })),
          recipients: recipients.map(r => ({ name: r.name, email: r.email, phone: r.phone || null, user_id: r.user_id || null, role_label: r.role_label || null, sign_order: r.sign_order })),
          file_id: sourceFileId,
          file_name: fileName,
        }),
      });
      showAlert('Template saved — find it under Templates.', { variant: 'success' });
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to save template');
    }
  }

  // ── Computed page size ────────────────────────────────────────────────────
  const [pageW, setPageW] = useState(600);
  // The real PDF page's own aspect ratio once known (see naturalPageSize
  // above) — a plain A4 guess for anything else (an image, or before the
  // PDF has loaded), same as before.
  const pageH = Math.round(pageW * (naturalPageSize ? naturalPageSize.height / naturalPageSize.width : A4_ASPECT));
  // pdf.js scale that renders the real page at exactly pageW wide, so
  // "the box the editor places fields in" and "the canvas actually shown"
  // are the same size — required for the drop-position math below to land
  // fields where the cursor actually is.
  const pdfRenderScale = naturalPageSize ? pageW / naturalPageSize.width : 1;

  useEffect(() => {
    function measure() {
      const w = pageRef.current?.parentElement?.clientWidth ?? (window.innerWidth > 900 ? 600 : window.innerWidth - 32);
      setPageW(Math.max(280, Math.min(w - 32, 800)));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const addRecipient = () => setRecipients(prev => [...prev, { name: '', email: '', phone: '', role_label: '', sign_order: prev.length + 1, user_id: null }]);
  const removeRecipient = (i: number) => {
    setRecipients(prev => prev.filter((_, idx) => idx !== i));
    setFields(prev => prev.filter(f => f.recipient_index !== i).map(f => ({ ...f, recipient_index: f.recipient_index > i ? f.recipient_index - 1 : f.recipient_index })));
    if (activeRecipient >= i) setActiveRecipient(Math.max(0, activeRecipient - 1));
  };
  const removeField = (id: string) => { setFields(prev => prev.filter(f => f.id !== id)); setSelectedField(null); };
  const selectedFieldData = fields.find(f => f.id === selectedField);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font)', background: 'var(--bg)' }}>
      {/* Top control bar with responsive flex wrapping */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 250px' }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/sign')} style={{ fontWeight: 600, gap: 6, flexShrink: 0 }}>
            <Icon name="arrowLeft" size={14} /> Back
          </Button>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Envelope title…"
            style={{ flex: 1, minWidth: 120, fontSize: 14.5, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--ink)', outline: 'none', letterSpacing: '-0.01em', textOverflow: 'ellipsis' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <Select value={orderMode} onValueChange={v => setOrderMode(v as 'sequential' | 'parallel')}>
            <SelectTrigger className="w-40" style={{ height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">Sequential signing</SelectItem>
              <SelectItem value="parallel">Parallel signing</SelectItem>
            </SelectContent>
          </Select>

          <Tip label="Each recipient must have a phone number on file — they'll choose SMS or WhatsApp to receive their code">
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
              <input type="checkbox" checked={requireOtp} onChange={e => setRequireOtp(e.target.checked)} style={{ accentColor: 'var(--teal)' }} />
              OTP / WhatsApp
            </label>
          </Tip>

          <div style={{ height: 16, width: 1, background: 'var(--border)' }} />

          {isPdf && previewSrc && (
            <Tip label="Rotate, watermark, redact, OCR, compress">
              <Button variant="outline" size="sm" onClick={() => { setShowPdfTools(true); if (isMobile) setMobileTab('right'); }} style={{ height: 32, fontSize: 12, padding: '0 10px' }}>
                <Icon name="layers" size={13} /> PDF Tools
              </Button>
            </Tip>
          )}

          {envelopeId && (
            <Tip label="See every saved version of this document and what changed, with the ability to revert">
              <Button variant="outline" size="sm" onClick={() => setShowVersionHistory(true)} style={{ height: 32, fontSize: 12, padding: '0 10px' }}>
                <Icon name="clock" size={13} /> Version History
              </Button>
            </Tip>
          )}

          {/* Unified Save Dropdown Button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" style={{ height: 32, fontSize: 12, padding: '0 12px', gap: 5, fontWeight: 600 }}>
                <Icon name="save" size={13} /> {saving ? 'Saving…' : 'Save'} <Icon name="chevronDown" size={11} style={{ opacity: 0.6 }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" style={{ width: 175, padding: 4 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{ width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Icon name="fileText" size={14} color="var(--blue)" /> Save Draft
              </button>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                style={{ width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Icon name="copy" size={14} color="var(--teal)" /> Save as Template
              </button>
            </PopoverContent>
          </Popover>

          <Button variant="default" size="sm" onClick={handleSend} disabled={sending} style={{ height: 32, fontSize: 12, fontWeight: 700, padding: '0 14px' }}>
            {sending ? 'Sending…' : 'Send'} <Icon name="send" size={13} style={{ marginLeft: 4 }} />
          </Button>
        </div>
      </div>

      {draftRestoredAt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--blue-l)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--ink2)', flexShrink: 0 }}>
          <Icon name="clock" size={13} style={{ color: 'var(--blue)', flexShrink: 0 }} />
          <span>Restored your unsaved edits from {new Date(draftRestoredAt).toLocaleString()}.</span>
          <Button variant="ghost" size="xs" onClick={() => { clearDraft(draftKey(envelopeId)); window.location.reload(); }} style={{ marginLeft: 'auto', color: 'var(--ink3)' }}>
            Discard and start fresh
          </Button>
        </div>
      )}

      {/* Mobile Tab Switcher (visible on phones and tablets) */}
      {isMobile && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)', padding: '4px 8px', gap: 4 }}>
          {[
            { key: 'left', label: 'Recipients & Fields', icon: 'users' },
            { key: 'center', label: 'Document Canvas', icon: 'fileText' },
            showPdfTools ? { key: 'right', label: 'PDF Tools', icon: 'layers' } : { key: 'right', label: 'Field Options', icon: 'settings' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMobileTab(tab.key as any)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: mobileTab === tab.key ? 'var(--teal-l)' : 'transparent',
                color: mobileTab === tab.key ? 'var(--teal)' : 'var(--ink3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
              }}
            >
              <Icon name={tab.icon as any} size={13} /> {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Three-column editor body */}
      <div className="sign-editor-layout" style={{ flex: 1 }}>

        {/* LEFT: Field palette + Recipients */}
        <div className="sign-editor-left" style={{ display: isMobile && mobileTab !== 'left' ? 'none' : undefined }}>
          {/* Recipients — signatories and any legal certifier(s) render as
              two visibly distinct groups, not one flat list. A certifier
              (Certified True Copy — an advocate/notary attesting the copy,
              not just another person signing it) is a different kind of
              party on the document, so it gets its own labeled section
              rather than being buried among ordinary signers with only a
              small checkbox in the edit form to tell them apart. */}
          <div className="sign-panel-title">Signatories</div>
          <div style={{ padding: '0 12px 8px' }}>
            {recipients.map((r, i) => ({ r, i })).filter(({ r }) => !r.is_certifier).map(({ r, i }) => (
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
                  <Button variant="ghost" size="icon" className="h-6 w-6 min-h-0"
                    onClick={e => { e.stopPropagation(); removeRecipient(i); }} aria-label="Remove recipient">
                    <Icon name="x" size={13} />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {recipients.some(r => r.is_certifier) && (
            <>
              <div className="sign-panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="scale" size={12} style={{ color: 'var(--blue)' }} /> Certification
              </div>
              <div style={{ padding: '0 12px 8px' }}>
                {recipients.map((r, i) => ({ r, i })).filter(({ r }) => r.is_certifier).map(({ r, i }) => (
                  <div key={i} className={`sign-recipient-row ${activeRecipient === i ? 'active' : ''}`}
                    onClick={() => setActiveRecipient(i)}
                    style={{ background: 'var(--blue-l)', border: '1px solid var(--blue)' }}>
                    <div className="sign-recipient-color" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name || `Recipient ${i + 1}`}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.certifier_title || 'Advocate'} — Certifying Copy
                      </div>
                    </div>
                    {recipients.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 min-h-0"
                        onClick={e => { e.stopPropagation(); removeRecipient(i); }} aria-label="Remove recipient">
                        <Icon name="x" size={13} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ padding: '0 12px 8px' }}>
            <Button variant="outline" size="sm" onClick={addRecipient} style={{ width: '100%', marginTop: 4, borderStyle: 'dashed' }}>
              <Icon name="plus" size={13} /> Add Recipient
            </Button>
          </div>

          {/* Active recipient form */}
          <div style={{ padding: '0 12px 16px' }}>
            <EntityPicker
              label="Recipient"
              placeholder="Search customers or staff…"
              value={recipients[activeRecipient]?.name
                ? { id: recipients[activeRecipient].user_id ?? '', label: recipients[activeRecipient].name, sublabel: recipients[activeRecipient].email }
                : null}
              onChange={item => {
                if (!item) {
                  setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, user_id: null, name: '', email: '', phone: '' } : r));
                  return;
                }
                const full = recipientCacheRef.current.get(item.id);
                setRecipients(prev => prev.map((r, i) => i === activeRecipient ? {
                  ...r,
                  // Only a real staff pick gets user_id — sign_recipients.user_id
                  // is a FK into `users`, and a customer's id isn't one.
                  user_id: full?.source === 'staff' ? item.id.replace(/^staff:/, '') : null,
                  name: full?.name ?? item.label,
                  email: full?.email ?? r.email,
                  phone: full?.phone ?? r.phone,
                } : r));
              }}
              search={searchRecipients}
              onCreate={createExternalRecipient}
              createLabel={q => `Add "${q}" as an external signer`}
              hint="Searches customers, then staff. Picking a colleague auto-fills their details and adds an in-app notification alongside email/SMS. No match? Type their name and fill in the fields below."
            />
            {['name', 'email', 'phone', 'role_label'].map(key => (
              <input key={key}
                value={(recipients[activeRecipient] as any)?.[key] ?? ''}
                onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, [key]: e.target.value } : r))}
                placeholder={key === 'role_label' ? 'Role (e.g. Customer)' : key === 'phone' ? 'Phone (optional — WhatsApp delivery)' : key.charAt(0).toUpperCase() + key.slice(1)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, marginTop: 6, boxSizing: 'border-box' }}
              />
            ))}

            {/* Certified True Copy — collapsed behind its own checkbox since
                most documents never need it; a real legal attestation by a
                named licensed advocate/notary, not the tenant's own stamp. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer', marginTop: 10 }}>
              <input type="checkbox" checked={!!recipients[activeRecipient]?.is_certifier}
                onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, is_certifier: e.target.checked } : r))}
                style={{ accentColor: 'var(--teal)' }} />
              This recipient certifies a true copy (advocate / notary)
            </label>
            {recipients[activeRecipient]?.is_certifier && (
              <div style={{ marginTop: 6, padding: 10, borderRadius: 'var(--r-sm)', border: '1px dashed var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={recipients[activeRecipient]?.certifier_title ?? ''}
                  onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, certifier_title: e.target.value } : r))}
                  placeholder="Title (e.g. Advocate, Commissioner for Oaths)"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, boxSizing: 'border-box' }} />
                <input value={recipients[activeRecipient]?.certifier_roll_number ?? ''}
                  onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, certifier_roll_number: e.target.value } : r))}
                  placeholder="Practising certificate / roll number"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, boxSizing: 'border-box' }} />
                <input value={recipients[activeRecipient]?.certifier_firm ?? ''}
                  onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, certifier_firm: e.target.value } : r))}
                  placeholder="Law firm (optional)"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, boxSizing: 'border-box' }} />
                <p style={{ fontSize: 11, color: 'var(--ink3)', margin: 0, lineHeight: 1.4 }}>
                  Place a “Certified True Copy Stamp” field (below) and assign it to this recipient — the roll number above is baked into the signed PDF as real text, next to their signature.
                </p>
              </div>
            )}
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
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12.5, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* CENTER: A4 page preview */}
        <div className="sign-editor-center" style={{ display: isMobile && mobileTab !== 'center' ? 'none' : undefined }}>
          {/* Toolbar + canvas share a wrapper with no gap between them, so
              the dark bar and the white page below it read as one card, not
              two elements floating apart — .sign-editor-center's own 16px
              flex gap would otherwise land right between them, same as it
              correctly does around this whole group's other siblings. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: fileName ? 0 : 16, width: '100%' }}>
          {/* Dark document toolbar — filename + type badge + page nav, one
              bar, same "Studio Control Bar" design as the sender's own
              envelope detail view (SignInbox.tsx), the public signing page
              (SignPublicPage.tsx) and the Cloud Lightbox. Used to be a light
              filename banner with a separate dark pagination pill floating
              below it with a gap between them — merged into the one
              consistent bar every other document surface in the app uses. */}
          {fileName && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              background: '#0f172a', borderRadius: '10px 10px 0 0', padding: '10px 16px',
              marginBottom: 0, width: pageW, maxWidth: '100%', boxSizing: 'border-box',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Icon name="fileText" size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                <span style={{ fontSize: 10, fontWeight: 800, background: '#1e293b', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0 }}>
                  {fileName.split('.').pop() || 'PDF'}
                </span>
              </div>

              {/* Page navigation — real multi-page PDFs (a delivery order, a
                  multi-page contract) can now actually be paged through;
                  fields already carried a `page` property, it just had
                  nowhere to go before since page 1 was the only page ever
                  rendered. */}
              {isPdf && pdfDoc && pdfNumPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                  <button onClick={() => setCurrentPdfPage(p => Math.max(1, p - 1))} disabled={currentPdfPage <= 1}
                    style={{ background: 'none', border: 'none', cursor: currentPdfPage <= 1 ? 'default' : 'pointer', opacity: currentPdfPage <= 1 ? 0.3 : 1, display: 'flex', padding: 2 }}>
                    <Icon name="chevronLeft" size={14} color="#f8fafc" />
                  </button>
                  <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                    {currentPdfPage} / {pdfNumPages}
                  </span>
                  <button onClick={() => setCurrentPdfPage(p => Math.min(pdfNumPages, p + 1))} disabled={currentPdfPage >= pdfNumPages}
                    style={{ background: 'none', border: 'none', cursor: currentPdfPage >= pdfNumPages ? 'default' : 'pointer', opacity: currentPdfPage >= pdfNumPages ? 0.4 : 1, display: 'flex', padding: 2 }}>
                    <Icon name="chevronRight" size={14} color="#f8fafc" />
                  </button>
                  {fields.some(f => f.page !== currentPdfPage) && (
                    <span style={{ fontSize: 11, color: '#94a3b8', borderLeft: '1px solid #334155', paddingLeft: 8, marginLeft: 2 }}>
                      {fields.filter(f => f.page !== currentPdfPage).length} elsewhere
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* File upload area */}
          {!previewSrc && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{ width: pageW, height: Math.round(pageW * 0.3), border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--ink3)', transition: 'border-color 0.15s', marginTop: fileName ? 0 : undefined }}>
              <Icon name="file" size={36} style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Upload Document</div>
              <div style={{ fontSize: 12 }}>PDF, DOCX, PNG, JPG</div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" style={{ display: 'none' }} onChange={handleFile} />

          {/* Page canvas — sized to the real document page's own
              proportions (see naturalPageSize above), not a fixed A4 guess */}
          <div ref={pageRef} className="sign-page-canvas-wrap"
            style={{ width: pageW, height: pageH, cursor: placingType ? 'crosshair' : 'default' }}
            onClick={handlePageClick}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}>

            {/* Document background. A real <canvas> render for a PDF (not
                an <iframe> — a separate browsing context that silently
                swallowed every drag-and-drop attempt over the one file
                type most real documents on this platform actually are),
                a plain <img> for an image upload, a placeholder otherwise. */}
            {isPdf ? (
              pdfLoading || !pdfDoc ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
                  {pdfError ? "Couldn't load this PDF" : 'Loading document…'}
                </div>
              ) : (
                <PdfPageCanvas doc={pdfDoc} pageNumber={currentPdfPage} scale={pdfRenderScale} style={{ display: 'block' }} />
              )
            ) : previewSrc ? (
              <img src={previewSrc} alt="document" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
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

            {/* Placed fields — only this page's; a field is stored with a
                real page number now, not a permanent page: 1. */}
            {fields.filter(f => (f.page || 1) === currentPdfPage).map(field => (
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
          </div>

          {placingType && (
            <div style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>
              Click anywhere on the page to place the <strong>{placingType}</strong> field
            </div>
          )}
        </div>

        {/* RIGHT: Selected field properties — swapped out for PDF Tools
            while a tool is active, rather than PDF Tools covering the whole
            screen. Same panel, same mobile "Field Options" tab, so it stays
            reachable exactly the same way on a phone as on desktop. */}
        <div className="sign-editor-right" style={{ display: isMobile && mobileTab !== 'right' ? 'none' : undefined }}>
          {showPdfTools && previewSrc ? (
            <StirlingPdfTools
              embedded
              documentSrc={previewSrc}
              fileName={fileName ?? 'document.pdf'}
              onExport={blob => { handleEditedDocument(blob); setShowPdfTools(false); }}
              onClose={() => setShowPdfTools(false)}
            />
          ) : (
          <>
          <div className="sign-panel-title">Field Properties</div>
          {selectedFieldData ? (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Field Type</label>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{selectedFieldData.field_type}</div>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Assigned To</label>
                <Select value={String(selectedFieldData.recipient_index)}
                  onValueChange={v => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, recipient_index: Number(v) } : f))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {recipients.map((r, i) => (
                      <SelectItem key={i} value={String(i)}>{r.name || `Recipient ${i + 1}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Placeholder Text</label>
                <input value={selectedFieldData.placeholder ?? ''}
                  onChange={e => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, placeholder: e.target.value } : f))}
                  placeholder="e.g. Sign here"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedFieldData.required}
                  onChange={e => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, required: e.target.checked } : f))} />
                <span style={{ fontSize: 13 }}>Required field</span>
              </label>
              <Button variant="outline" size="sm" onClick={() => removeField(selectedFieldData.id)}
                style={{ borderColor: 'var(--sign-red)', background: 'var(--sign-red-l)', color: 'var(--sign-red)' }}>
                <Icon name="trash" size={13} /> Remove Field
              </Button>
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
                    onClick={() => { setSelectedField(f.id); setCurrentPdfPage(f.page || 1); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', background: selectedField === f.id ? 'var(--sign-blue-l)' : 'transparent', borderColor: selectedField === f.id ? 'var(--sign-blue)' : 'var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: RECIPIENT_COLORS[f.recipient_index % RECIPIENT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1 }}>{FIELD_TYPES.find(ft => ft.type === f.field_type)?.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>p.{f.page}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>

      {showVersionHistory && envelopeId && (
        <VersionHistoryPanel
          envelopeId={envelopeId}
          onRestore={(newDocumentData, newFileName) => {
            setSourceFileId(null);
            setDocumentData(newDocumentData);
            setPreviewSrc(newDocumentData);
            if (newFileName) setFileName(newFileName);
            // The restore itself was already saved server-side (it creates
            // its own version), so there's nothing pending for the next
            // Save/Send to additionally record.
            setPendingChangeSummary(null);
          }}
          onClose={() => setShowVersionHistory(false)}
        />
      )}
    </div>
  );
}
