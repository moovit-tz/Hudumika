// ─── SignEditor.tsx — Envelope Builder with drag-drop field placement ─────────
// Layout: [Left: field palette + recipients] [Center: A4 page canvas] [Right: field properties]
// Fields are placed on the page by clicking the field type then clicking on the page.
// Coordinates stored as fractions (0–1) so they survive font/page-size changes.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import { COUNTRIES, type SignFieldType } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../../components/ui/button.js';
import { BackButton } from '../../components/ui/BackButton.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { MeetingLinkPanel, type MeetingLinkValue } from '../../components/MeetingLinkPanel.js';
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
import { Card } from '../../components/ui/card.js';
import './SignManagement.css';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Badge } from '../../components/ui/badge.js';
import { Banner } from '../../components/ui/alert.js';
import './Sign.css';
import './SignWorkspace.css';

const FIELD_TYPES: { type: SignFieldType; label: string; icon: IconName; defaultW: number; defaultH: number }[] = [
  // Signature and stamp bumped up from 0.28x0.06 / 0.16x0.11 — both were
  // rendering small on the actual signed PDF (sign-pdf.service.ts scales
  // the drawn image to exactly fill field.width x field.height, so this is
  // the only lever there is; a placed field has no resize handle, only
  // drag-to-move, so the default is the field's size for good).
  { type: 'signature', label: 'Signature',   icon: 'edit',      defaultW: 0.504, defaultH: 0.168 },
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

const RECIPIENT_COLORS = ['#1a56db','#0e9f6e','var(--gold)','#7c3aed','#db2777','#0891b2'];

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
  // Which certifier-directory entry (migration 417) these fields were
  // filled from, if any — freeform typing leaves this unset.
  certifier_id?: string;
  // Execution role (migration 416) — 'SIGNER' unless this recipient
  // witnesses another signer or certifies (kept in sync with is_certifier
  // above; the backend derives one from the other if only one is sent).
  execution_role?: 'SIGNER' | 'WITNESS' | 'AFFIANT' | 'CERTIFIER';
}

const A4_ASPECT = 1.414; // height/width ratio of A4

function DocumentTitle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const input = inputRef.current;
    const measure = measureRef.current;
    if (!input || !measure) return;
    const fit = () => setScale(Math.min(1, Math.max(1, input.clientWidth - 4) / Math.max(1, measure.getBoundingClientRect().width)));
    const observer = new ResizeObserver(fit);
    observer.observe(input);
    observer.observe(measure);
    fit();
    document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [value]);
  useLayoutEffect(() => { if (inputRef.current) inputRef.current.scrollLeft = 0; }, [scale, value]);
  return <div className="sign-workspace-title-wrap">
    <span ref={measureRef} className="sign-workspace-title-measure" aria-hidden="true">{value || 'Untitled document'}</span>
    <Input ref={inputRef} className="sign-workspace-title" aria-label="Document title" title={value || 'Untitled document'} value={value} onChange={event=>onChange(event.target.value)} placeholder="Untitled document" style={{fontSize:`calc(var(--page-title-size) * ${scale})`,paddingBlock:0,borderWidth:0}}/>
  </div>;
}

function PageThumbnail({ doc, page, active, onSelect }: { doc: PDFDocumentProxy; page: number; active: boolean; onSelect: () => void }) {
  const [scale, setScale] = useState<number>();
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    doc.getPage(page).then(value => { if (!cancelled) setScale(104 / value.getViewport({ scale: 1 }).width); }).catch(() => {});
    return () => { cancelled = true; };
  }, [doc, page, visible]);
  return <Button ref={ref} variant="ghost" size="sm" className="sign-workspace-thumbnail" aria-label={`Go to page ${page}`} aria-current={active?'page':undefined} onClick={onSelect}>
    <span className="sign-workspace-thumbnail-sheet">{scale ? <PdfPageCanvas doc={doc} pageNumber={page} scale={scale}/> : <Icon name="fileText" size={24}/>}</span>
    <span>Page {page}</span>
  </Button>;
}

export function SignEditor() {
  const navigate = useNavigate();
  const { id: envelopeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();

  // ── State ────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  // Phase S7 — a free-text case/engagement reference (migration 428), not a
  // structured entity. Optional; most tenants leave it blank.
  const [matterReference, setMatterReference] = useState('');
  // Phase S5 — jurisdiction engine. Fetched once; the advisory shown below
  // is picked from these rows by whichever execution type the current
  // recipients resolve to (mirrors sign.routes.ts's own inferExecutionType,
  // client-side, so the advisory updates live as roles are toggled instead
  // of waiting on a round trip).
  const [jurisdiction, setJurisdiction] = useState<{ jurisdiction_code: string | null; rules: Array<{ execution_type: string; status: string; legal_basis: string | null; conditions: string | null; notes: string | null }> }>({ jurisdiction_code: null, rules: [] });
  // Phase S4 — remote session. Reuses the exact same component Calendar/
  // Tasks/Notes already share (MeetingLinkPanel.tsx) — real Bliss meeting
  // when entitled, a real Jitsi fallback otherwise. Shown only for a
  // NOTARIAL_CERTIFICATION envelope, matching the plan's own framing.
  const [meetingLink, setMeetingLink] = useState<MeetingLinkValue>({ meetingUrl: null, blissMeetingId: null });
  // Phase S8 — AI assistance. Suggestions only, never shown as a validity
  // verdict (see sign-ai-assist.service.ts's own header).
  const [aiAssist, setAiAssist] = useState<{ available: boolean; missingFields: Array<{ description: string; page: number | null }>; blocks: Array<{ type: string; description: string; page: number | null }>; reason?: string } | null>(null);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
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
    if(currentPdfPage>pdfNumPages)return;
    pdfDoc.getPage(currentPdfPage).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setNaturalPageSize({ width: vp.width, height: vp.height });
    }).catch(()=>{if(!cancelled)setNaturalPageSize(null);});
    return () => { cancelled = true; };
  }, [pdfDoc,currentPdfPage,pdfNumPages]);
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { name: '', email: '', phone: '', role_label: '', sign_order: 1, user_id: null },
  ]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [activeRecipient, setActiveRecipient] = useState(0);
  const [placingType, setPlacingType] = useState<SignFieldType | null>(null);
  const isMobile = useIsMobile();

  // Certifier directory (migration 417) — fetched once; picking an entry
  // here fills the freeform fields below from a real, reusable credential
  // instead of retyping a roll number every time. Loaded lazily/silently —
  // most envelopes never touch the certifier panel at all.
  const [certifiers, setCertifiers] = useState<Array<{ id: string; name: string; title: string; roll_number: string | null; firm: string | null; expiry_date: string | null; verification_status: string }>>([]);
  useEffect(() => {
    apiFetch('/v1/sign/certifiers').then(setCertifiers).catch(() => {});
  }, []);
  const [mobileTab, setMobileTab] = useState<'left' | 'center' | 'right'>('center');
  const [sidebarMode,setSidebarMode] = useState<'fields'|'recipients'|'review'>('fields');
  const [showAllFields,setShowAllFields] = useState(false);
  const [zoom,setZoom] = useState(1);
  const editorCenterRef = useRef<HTMLDivElement>(null);
  const persistedEnvelopeIdRef = useRef(envelopeId);
  useEffect(()=>{persistedEnvelopeIdRef.current=envelopeId;},[envelopeId]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  function openSidebar(mode: 'fields'|'recipients'|'review') {setSidebarMode(mode);setShowPdfTools(false);if(isMobile)setMobileTab(mode==='recipients'?'left':'right');}

  const pageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  // When true, bypass the upload-first screen and go straight into the editor
  // (user clicked "start without a document"). Persists for this session only.
  const [skipUploadStep, setSkipUploadStep] = useState(false);

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
      return {
        id: key,
        label: name,
        sublabel: `Customer${c.contact_name?.trim() ? ` · ${c.name}` : ''}`,
        avatarUserId: c.id,
        avatarKind: 'customers' as const,
        avatarType: 'company' as const,
      };
    });
    const staffItems: PickerItem[] = staff.slice(0, 15).map((u: { id: string; name: string; email: string; phone: string | null }) => {
      const key = `staff:${u.id}`;
      recipientCacheRef.current.set(key, { source: 'staff', name: u.name, email: u.email, phone: u.phone ?? null });
      return {
        id: key,
        label: u.name,
        sublabel: `Staff · ${u.email}`,
        avatarUserId: u.id,
        avatarKind: 'people' as const,
        avatarType: 'person' as const,
      };
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

  useEffect(() => {
    if (!searchParams.get('document') && !envelopeId) apiFetch('/v1/sign/jurisdiction-rules/mine').then(setJurisdiction).catch(() => {});
  }, []);

  async function runAiAssist() {
    setAiAssistLoading(true);
    setAiAssist(null);
    try {
      const body = sourceFileId ? { file_id: sourceFileId } : { document_data: documentData };
      const result = await apiFetch('/v1/sign/ai-assist/analyze', { method: 'POST', body: JSON.stringify(body) });
      setAiAssist(result);
    } catch (err: any) {
      setAiAssist({ available: false, missingFields: [], blocks: [], reason: err.message || 'Analysis failed' });
    } finally {
      setAiAssistLoading(false);
    }
  }

  // Same priority order as sign.routes.ts's own inferExecutionType — kept
  // in sync deliberately, not imported, since that function lives
  // server-side and this only needs to preview what the server will infer.
  const inferredExecutionType = recipients.some(r => r.execution_role === 'CERTIFIER' || r.is_certifier) ? 'NOTARIAL_CERTIFICATION'
    : recipients.some(r => r.execution_role === 'AFFIANT') ? 'AFFIDAVIT'
    : recipients.some(r => r.execution_role === 'WITNESS') ? 'WITNESSED_SIGNATURE'
    : 'NORMAL_SIGN';
  const jurisdictionRule = jurisdiction.rules.find(r => r.execution_type === inferredExecutionType);

  // ── Load existing envelope ────────────────────────────────────────────────
  useEffect(() => {
    if (!envelopeId) return;
    apiFetch(`/v1/sign/envelopes/${envelopeId}`).then(async env => {
      setTitle(env.title ?? '');
      setMessage(env.message ?? '');
      setMatterReference(env.matter_reference ?? '');
      setMeetingLink({ meetingUrl: env.meeting_url ?? null, blissMeetingId: env.bliss_meeting_id ?? null });
      setOrderMode(env.order_mode ?? 'sequential');
      setRequireOtp(!!env.require_otp);
      setFileName(env.file_name ?? null);
      setDocumentData(env.document_data ?? null);
      if (env.document_jurisdiction) {
        const code = COUNTRIES.find(country => country.name === env.document_jurisdiction || country.code === env.document_jurisdiction)?.code;
        if (code) apiFetch(`/v1/sign/jurisdiction-rules?jurisdiction=${code}`).then(result => setJurisdiction({ jurisdiction_code: code, rules: result.data })).catch(() => {});
        else setJurisdiction({ jurisdiction_code: env.document_jurisdiction, rules: [] });
      } else {
        apiFetch('/v1/sign/jurisdiction-rules/mine').then(setJurisdiction).catch(() => {});
      }
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

  useEffect(() => {
    const documentId = searchParams.get('document');
    if (envelopeId || !documentId) return;
    apiFetch(`/v1/sign/generated-documents/${documentId}/pdf?format=source`).then(source => {
      setTitle(source.title); setFileName(source.file_name);
      setDocumentData(source.document_data); setPreviewSrc(source.document_data);
      setSourceFileId(null);
      if (source.jurisdiction_code) apiFetch(`/v1/sign/jurisdiction-rules?jurisdiction=${encodeURIComponent(source.jurisdiction_code)}`).then(result => setJurisdiction({ jurisdiction_code: source.jurisdiction_code, rules: result.data })).catch(() => {});
      else setJurisdiction({ jurisdiction_code: source.jurisdiction, rules: [] });
    }).catch(error => showAlert(error.message));
  }, [envelopeId, searchParams]);

  // ── Start from a saved template (SignTemplates.tsx's "Use Template" button
  // — GET /sign/editor?template=<id>) ─────────────────────────────────────────
  // Only for a brand-new envelope, same reasoning as the Cloud-file effect above.
  useEffect(() => {
    if (envelopeId) return;
    const templateId = searchParams.get('template');
    if (!templateId) return;
    apiFetch(`/v1/sign/templates/${templateId}`).then(t => {
      setTitle(prev => prev || t.name);
      setSkipUploadStep(true);
      if (t.recipients?.length) {
        setRecipients(t.recipients.map((r: RecipientInput) => ({ ...r, name: r.name ?? '', email: r.email ?? '', phone: r.phone ?? '', role_label: r.role_label ?? '', sign_order: r.sign_order ?? 1, user_id: r.user_id ?? null })));
      }
      if (t.fields?.length) {
        setFields(t.fields.map((f: Omit<PlacedField, 'id'>) => ({
          id: crypto.randomUUID(),
          field_type: f.field_type, recipient_index: f.recipient_index ?? 0, page: f.page ?? 1,
          x: f.x, y: f.y, width: f.width, height: f.height,
          required: f.required ?? true, placeholder: f.placeholder ?? undefined,
        })));
      }
      if (t.document_data) {setDocumentData(t.document_data);setPreviewSrc(t.document_data);setFileName(t.file_name || `${t.name}.pdf`);}
      else if (t.file_id) {
        setSourceFileId(t.file_id);
        if (t.file_name) setFileName(t.file_name);
        apiFetchBlob(`/v1/files/${t.file_id}/preview`).then(blob => setPreviewSrc(URL.createObjectURL(blob))).catch(console.error);
      }
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId, searchParams]);

  // ── Restore a not-yet-created envelope's local draft ────────────────────
  // Skipped when ?fileId= or ?template= is present — arriving here from
  // Cloud's "Sign & Stamp" or "Use Template" is a deliberate fresh start,
  // which should win over an old, possibly unrelated abandoned draft.
  useEffect(() => {
    if (envelopeId) return;
    if (searchParams.get('fileId') || searchParams.get('template') || searchParams.get('document')) { draftReadyRef.current = true; return; }
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
  // separators into spaces) rather than leaving "Document title…" empty —
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
  // reverted version from Versions) replaces the working document
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
    if (!title.trim()) { showAlert('Please enter an document title'); return; }
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
        generated_document_id: searchParams.get('document') || undefined,
        title, message, matter_reference: matterReference.trim() || null,
        meeting_url: meetingLink.meetingUrl, bliss_meeting_id: meetingLink.blissMeetingId,
        order_mode: orderMode, require_otp: requireOtp, file_name: fileName,
        document_data: sourceFileId ? null : documentData, file_id: sourceFileId, recipients, fields,
        changeSummary: pendingChangeSummary?.summary, changeDetails: pendingChangeSummary?.details,
      };
      const targetId=envelopeId || persistedEnvelopeIdRef.current;
      if (targetId) {
        await apiFetch(`/v1/sign/envelopes/${targetId}`, { method: 'PUT', body: JSON.stringify(body) });
        navigate(`/sign/envelope/${targetId}`);
      } else {
        const env = await apiFetch('/v1/sign/envelopes', { method: 'POST', body: JSON.stringify(body) });
        persistedEnvelopeIdRef.current=env.id;
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
        generated_document_id: searchParams.get('document') || undefined,
        title, message, matter_reference: matterReference.trim() || null,
        meeting_url: meetingLink.meetingUrl, bliss_meeting_id: meetingLink.blissMeetingId,
        order_mode: orderMode, require_otp: requireOtp, file_name: fileName,
        document_data: sourceFileId ? null : documentData, file_id: sourceFileId, recipients, fields,
        changeSummary: pendingChangeSummary?.summary, changeDetails: pendingChangeSummary?.details,
      };
      let envId = envelopeId || persistedEnvelopeIdRef.current;
      if (!envId) {
        const env = await apiFetch('/v1/sign/envelopes', { method: 'POST', body: JSON.stringify(body) });
        envId = env.id;
        persistedEnvelopeIdRef.current=env.id;
      } else {
        // An existing draft's current title/recipients/fields must actually
        // be persisted before sending — this used to build `body` and then
        // never send it on this path, jumping straight to /send, so any
        // edit made since the last "Save draft" click was silently lost.
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
    if (!title.trim()) { showAlert('Please enter an document title first'); return; }
    const name = await showPrompt('', { title: 'Template name', defaultValue: title, required: true, confirmLabel: 'Save Template' });
    if (!name?.trim()) return;
    try {
      await apiFetch('/v1/sign/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          fields: fields.map(f => ({ recipient_index: f.recipient_index, field_type: f.field_type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, placeholder: f.placeholder ?? null })),
          recipients: recipients.map(r => ({ ...r, phone: r.phone || null, user_id: r.user_id || null, role_label: r.role_label || null })),
          file_id: sourceFileId,
          file_name: fileName,
          document_data: documentData,
        }),
      });
      showAlert('Template saved — find it under Templates.', { variant: 'success' });
    } catch (e: unknown) {
      showAlert(e instanceof Error ? e.message : 'Failed to save template');
    }
  }

  // ── Computed page size ────────────────────────────────────────────────────
  const [basePageW, setPageW] = useState(600);
  const pageW=Math.round(basePageW*zoom);
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
      const w = editorCenterRef.current?.clientWidth;
      if(w) setPageW(Math.max(220, w - 40));
    }
    measure();
    window.addEventListener('resize', measure);
    const observer=new ResizeObserver(measure);
    if(editorCenterRef.current) observer.observe(editorCenterRef.current);
    return () => {window.removeEventListener('resize', measure);observer.disconnect();};
  }, [skipUploadStep,previewSrc,mobileTab]);

  const addRecipient = () => setRecipients(prev => [...prev, { name: '', email: '', phone: '', role_label: '', sign_order: prev.length + 1, user_id: null }]);
  const removeRecipient = (i: number) => {
    setRecipients(prev => prev.filter((_, idx) => idx !== i));
    setFields(prev => prev.filter(f => f.recipient_index !== i).map(f => ({ ...f, recipient_index: f.recipient_index > i ? f.recipient_index - 1 : f.recipient_index })));
    if (activeRecipient >= i) setActiveRecipient(Math.max(0, activeRecipient - 1));
  };
  const removeField = (id: string) => { setFields(prev => prev.filter(f => f.id !== id)); setSelectedField(null); };
  const selectedFieldData = fields.find(f => f.id === selectedField);
  function updateGeometry(key:'x'|'y'|'width'|'height',value:number) {
    if(!Number.isFinite(value))return;
    setFields(previous=>previous.map(field=>{
      if(field.id!==selectedField)return field;
      const next={...field,[key]:Math.max(key==='width'||key==='height'?0.01:0,Math.min(1,value/100))};
      next.x=Math.min(next.x,1-next.width);next.y=Math.min(next.y,1-next.height);
      return next;
    }));
  }

  // ── Upload-first screen — new envelope, no document yet ───────────────────
  // Shown instead of the full 3-panel editor until a file is chosen. Once
  // previewSrc is set (by handleFile, a restored draft, or ?fileId=), this
  // branch is skipped and the full editor renders automatically.
  if (!previewSrc && !envelopeId && !skipUploadStep) {
    return (
      <main className="sign-new-envelope-page">
        <Card className="sign-new-envelope-card" aria-label="Create a new document">
          <div className="sign-new-envelope-header">
            <BackButton to="/sign" label="Back" color="var(--ink2)" />
            <PageHeader
              crumbs={[]}
              titlePlain="New"
              titleEm="document"
              subtitle="Add a document, choose recipients, and place signing fields."
            />
          </div>

          <div className="sign-editor-steps" aria-label="Preparation steps">
            <span><Icon name="fileText" size={16} />1. Document</span>
            <span><Icon name="users" size={16} />2. Recipients</span>
            <span><Icon name="edit" size={16} />3. Fields</span>
            <span><Icon name="send" size={16} />4. Send</span>
          </div>
          <div className="sign-new-envelope-title-row">
            <label htmlFor="envelope-title">Document title</label>
            <Input
              id="envelope-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Optional — filled from the filename"
            />
          </div>

          <div className="sign-new-envelope-body">
            <div className="sign-new-envelope-chooser">
              <div className="sign-new-envelope-chooser-heading">
                <FeaturedIcon variant="brand" size="lg" shape="circle"><Icon name="fileText" size={20} /></FeaturedIcon>
                <div>
                  <h2>Create your document</h2>
                  <p>Import a template, write your own document, or upload a file for signing.</p>
                </div>
              </div>
              <div className="sign-new-envelope-actions">
                <Button type="button" variant="outline" className="sign-new-envelope-action" onClick={()=>navigate('/sign/editor?mode=import')}>
                  <FeaturedIcon variant="brand" size="lg"><Icon name="layers" size={20}/></FeaturedIcon>
                  <span className="sign-new-envelope-action-copy"><strong>Import template</strong><small>Preview, answer key decisions, and generate</small></span><Icon name="arrowRight" size={16}/>
                </Button>
                <Button type="button" variant="outline" className="sign-new-envelope-action" onClick={()=>navigate('/sign/editor?mode=author')}>
                  <FeaturedIcon variant="brand" size="lg"><Icon name="edit" size={20}/></FeaturedIcon>
                  <span className="sign-new-envelope-action-copy"><strong>Write a document</strong><small>Create wording and save a reusable template</small></span><Icon name="arrowRight" size={16}/>
                </Button>
                <Tip label="Choose an existing PDF, DOCX, PNG, or JPG from your device">
                  <Button type="button" variant="outline" className="sign-new-envelope-action" onClick={() => fileInputRef.current?.click()}>
                    <FeaturedIcon variant="brand" size="lg" shape="circle"><Icon name="upload" size={20} /></FeaturedIcon>
                    <span className="sign-new-envelope-action-copy"><strong>Upload file</strong><small>PDF, DOCX, PNG or JPG</small></span>
                    <Icon name="arrowRight" size={16} className="sign-new-envelope-action-arrow" />
                  </Button>
                </Tip>
                <Tip label="Open your device camera to capture a document">
                  <Button type="button" variant="outline" className="sign-new-envelope-action" onClick={() => scanInputRef.current?.click()}>
                    <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="camera" size={20} /></FeaturedIcon>
                    <span className="sign-new-envelope-action-copy"><strong>Scan document</strong><small>Use your device camera</small></span>
                    <Icon name="arrowRight" size={16} className="sign-new-envelope-action-arrow" />
                  </Button>
                </Tip>
              </div>

              <div className="sign-new-envelope-divider"><span>or</span></div>
              <div className="sign-new-envelope-blank">
                <div><strong>Start blank</strong><span>Prepare a page without uploading a file.</span></div>
                <Tip label="Open a blank signing page without attaching a document">
                  <Button type="button" variant="outline" size="default" onClick={() => setSkipUploadStep(true)}>
                    Start blank <Icon name="arrowRight" size={14} />
                  </Button>
                </Tip>
              </div>
            </div>
          </div>
        </Card>

        <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={scanInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      </main>
    );
  }

  return (
    <div className="sign-workspace" data-mobile={isMobile} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font)', background: 'var(--card-bg)' }}>
      <header className="sign-workspace-header">
        <div className="sign-workspace-identity">
          <FeaturedIcon variant="brand" size="sm" shape="squircle"><Icon name="fileText" size={18}/></FeaturedIcon>
          <div className="sign-workspace-identity-body">
            <DocumentTitle value={title} onChange={setTitle}/>
            <div className="sign-workspace-document-state">
              <Badge variant="gray" className="font-semibold text-[11px]">Draft</Badge>
              <span>{fields.length} fields · {recipients.length} recipients</span>
            </div>
          </div>
        </div>
        <div className="sign-workspace-header-actions">
          <span className="sign-workspace-step">Step {sidebarMode==='review'?3:2} of 3</span>
          <Button variant="outline" size="sm" onClick={()=>navigate('/sign')} className="sign-header-btn-back">
            <Icon name="chevronLeft" size={14}/>
            <span>Back</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving||sending} className="sign-header-btn-save">
            <Icon name="save" size={14}/>
            <span>{saving?'Saving…':'Save draft'}</span>
          </Button>
          <Button size="sm" onClick={()=>openSidebar('review')} disabled={sending} className="sign-header-btn-send font-semibold">
            <Icon name="send" size={14}/>
            <span>Review and send</span>
          </Button>
        </div>
      </header>
      <div className="sign-workspace-toolbar" role="toolbar" aria-label="Document tools">
        <div className="sign-toolbar-left">
          <Select value={String(zoom)} onValueChange={value=>setZoom(Number(value))}>
            <SelectTrigger aria-label="Document zoom" className="sign-workspace-zoom">
              <SelectValue/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Fit width</SelectItem>
              <SelectItem value="0.75">75%</SelectItem>
              <SelectItem value="1.25">125%</SelectItem>
              <SelectItem value="1.5">150%</SelectItem>
            </SelectContent>
          </Select>
          <span className="sign-workspace-toolbar-divider"/>
          <span className="sign-workspace-file-label" title={fileName || 'Blank document'}>{fileName || 'Blank document'}</span>
        </div>
        <div className="sign-toolbar-right">
          <div className="sign-workspace-page-nav">
            <Button variant="ghost" size="icon" aria-label="Previous document page" disabled={currentPdfPage<=1} onClick={()=>setCurrentPdfPage(p=>Math.max(1,p-1))} className="sign-page-nav-arrow">
              <Icon name="chevronLeft" size={14}/>
            </Button>
            <span className="sign-page-nav-text">Page {currentPdfPage} of {pdfNumPages || 1}</span>
            <Button variant="ghost" size="icon" aria-label="Next document page" disabled={currentPdfPage>=(pdfNumPages || 1)} onClick={()=>setCurrentPdfPage(p=>Math.min(pdfNumPages || 1,p+1))} className="sign-page-nav-arrow">
              <Icon name="chevronRight" size={14}/>
            </Button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="sign-toolbar-actions-btn">
                <Icon name="layers" size={14}/>
                <span>Document actions</span>
                <Icon name="chevronDown" size={12} className="opacity-70"/>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="sign-workspace-document-menu w-52 p-1.5">
              {isPdf&&previewSrc&&<Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={()=>{openSidebar('fields');setShowPdfTools(true);}}><Icon name="layers" size={14}/>PDF tools</Button>}
              {isPdf&&previewSrc&&(sourceFileId||documentData)&&<Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={()=>{openSidebar('recipients');runAiAssist();}} disabled={aiAssistLoading}><Icon name="sparkle" size={14}/>{aiAssistLoading?'Scanning…':'AI scan'}</Button>}
              {envelopeId&&<Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={()=>setShowVersionHistory(true)}><Icon name="clock" size={14}/>Version history</Button>}
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSaveAsTemplate}><Icon name="copy" size={14}/>Save as template</Button>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={async()=>{if(await showConfirm("Importing a template starts a new document. Save this draft first if you want to keep it.",{title:"Import template?",confirmLabel:"Choose template"}))navigate("/sign/editor?mode=import");}}><Icon name="layers" size={14}/>Import template</Button>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={()=>fileInputRef.current?.click()}><Icon name="upload" size={14}/>Replace document</Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {draftRestoredAt && (
        <div className="sign-workspace-restore-banner">
          <div className="sign-restore-info">
            <Icon name="info" size={14} className="sign-restore-icon" />
            <span>Restored your unsaved edits from {new Date(draftRestoredAt).toLocaleString()}.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { clearDraft(draftKey(envelopeId)); window.location.reload(); }} className="sign-restore-discard-btn">
            Discard and start fresh
          </Button>
        </div>
      )}

      {/* Three-column editor body */}
      <div className="sign-editor-layout" style={{ flex: 1 }}>
        <Tabs className="sign-workspace-sidebar-nav" value={isMobile && mobileTab==='center' ? 'document' : sidebarMode} onValueChange={value=>{if(value==='document')setMobileTab('center');else openSidebar(value as 'fields'|'recipients'|'review');}}>
          <TabsList aria-label="Editor panels">
            {isMobile&&<TabsTrigger value="document">Document</TabsTrigger>}
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="recipients">Recipients</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* LEFT: Field palette + Recipients */}
        <div className="sign-editor-left" style={{ display: sidebarMode !== 'recipients' || (isMobile && mobileTab !== 'left') ? 'none' : undefined }}>
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
                <PersonAvatar userId={r.user_id || undefined} name={r.name || `Recipient ${i+1}`} size={30}/>
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
                    <PersonAvatar userId={r.user_id || undefined} name={r.name || `Recipient ${i+1}`} size={30}/>
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
            <Button variant="outline" size="default" onClick={addRecipient} style={{ width: '100%', marginTop: 4, borderStyle: 'dashed' }}>
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
            {(['name', 'email', 'phone', 'role_label'] as const).map(key => (
              <Input key={key}
                value={(recipients[activeRecipient] as any)?.[key] ?? ''}
                onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, [key]: e.target.value } : r))}
                placeholder={key === 'role_label' ? 'Role (e.g. Customer)' : key === 'phone' ? 'Phone (optional — WhatsApp delivery)' : key.charAt(0).toUpperCase() + key.slice(1)}
                style={{ marginTop: 6 }}
              />
            ))}

            <div className="sign-workspace-execution-role">
              <label htmlFor="sign-execution-role">Signing capacity</label>
              <Select value={recipients[activeRecipient]?.execution_role || (recipients[activeRecipient]?.is_certifier?'CERTIFIER':'SIGNER')} onValueChange={value=>setRecipients(prev=>prev.map((r,i)=>i===activeRecipient?{...r,execution_role:value as RecipientInput['execution_role'],is_certifier:value==='CERTIFIER'}:r))}>
                <SelectTrigger id="sign-execution-role"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIGNER">Signer</SelectItem>
                  <SelectItem value="WITNESS">Witness</SelectItem>
                  <SelectItem value="AFFIANT">Affiant / declarant under oath</SelectItem>
                  <SelectItem value="CERTIFIER">Notary / commissioner for oaths</SelectItem>
                </SelectContent>
              </Select>
              <p>{recipients[activeRecipient]?.execution_role==='AFFIANT'?'The person making the sworn statement. Add the notary or commissioner as a separate recipient.':recipients[activeRecipient]?.execution_role==='WITNESS'?'Place the witness after the person whose signature they witness.':recipients[activeRecipient]?.is_certifier?'Enter the official’s credentials and assign their signature and certification fields.':'Choose the capacity in which this recipient signs the document.'}</p>
            </div>
            {recipients[activeRecipient]?.is_certifier && (
              <div style={{ marginTop: 6, padding: 10, borderRadius: 'var(--r-sm)', border: '1px dashed var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {certifiers.length > 0 && (
                  <Select
                    value={recipients[activeRecipient]?.certifier_id || '__none__'}
                    onValueChange={id => {
                      const c = certifiers.find(x => x.id === id);
                      if (!c) return;
                      setRecipients(prev => prev.map((r, i) => i === activeRecipient ? {
                        ...r, certifier_id: c.id, certifier_title: c.title, certifier_roll_number: c.roll_number ?? '', certifier_firm: c.firm ?? '',
                      } : r));
                    }}
                  >
                    <SelectTrigger className="input-field" style={{ marginBottom: 2 }}><SelectValue placeholder="Pick from certifier directory (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>Pick from certifier directory (optional)</SelectItem>
                      {certifiers.map(c => {
                        const expired = c.expiry_date && new Date(c.expiry_date) < new Date();
                        return (
                          <SelectItem key={c.id} value={c.id} disabled={expired || c.verification_status === 'revoked'}>
                            {c.name} — {c.title}{c.roll_number ? ` (${c.roll_number})` : ''}{expired ? ' — EXPIRED' : c.verification_status === 'revoked' ? ' — REVOKED' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                {recipients[activeRecipient]?.certifier_id && (() => {
                  const c = certifiers.find(x => x.id === recipients[activeRecipient]?.certifier_id);
                  const expired = c?.expiry_date && new Date(c.expiry_date) < new Date();
                  return expired ? (
                    <p style={{ fontSize: 11, color: 'var(--red)', margin: 0, fontWeight: 600 }}>
                      This credential expired on {c!.expiry_date} — signing will be rejected until it's renewed in the directory.
                    </p>
                  ) : null;
                })()}
                <Input value={recipients[activeRecipient]?.certifier_title ?? ''}
                  onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, certifier_title: e.target.value } : r))}
                  placeholder="Title (e.g. Advocate, Commissioner for Oaths)" />
                <Input value={recipients[activeRecipient]?.certifier_roll_number ?? ''}
                  onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, certifier_roll_number: e.target.value } : r))}
                  placeholder="Practising certificate / roll number" />
                <Input value={recipients[activeRecipient]?.certifier_firm ?? ''}
                  onChange={e => setRecipients(prev => prev.map((r, i) => i === activeRecipient ? { ...r, certifier_firm: e.target.value } : r))}
                  placeholder="Law firm (optional)" />
                <p style={{ fontSize: 11, color: 'var(--ink3)', margin: 0, lineHeight: 1.4 }}>
                  Place a "Certified True Copy Stamp” field (below) and assign it to this recipient — the roll number above is baked into the signed PDF as real text, next to their signature.
                </p>
              </div>
            )}
          </div>

          {/* Message */}
          <div className="sign-panel-title">Message (optional)</div>
          <div style={{ padding: '0 12px 16px' }}>
            <Textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Add a personal message to signers…"
              rows={3} />
          </div>

          {/* Matter / Reference — Phase S7, a free-text case tag, not a
              structured entity (see migration 428's own header). Groups
              onto /sign/matters once set; most tenants leave it blank. */}
          <div className="sign-panel-title">Matter / Reference (optional)</div>
          <div style={{ padding: '0 12px 16px' }}>
            <Input value={matterReference} onChange={e => setMatterReference(e.target.value)}
              placeholder="e.g. CASE-2026-014" />
          </div>

          {/* Remote session — Phase S4. Reuses Bliss's own meeting system
              (the same MeetingLinkPanel Calendar/Tasks/Notes already share)
              rather than a second video system — see migration 432's own
              header. Shown for a notarial execution, where the certifier
              and affiant may need to meet live. */}
          {(inferredExecutionType === 'NOTARIAL_CERTIFICATION' || inferredExecutionType === 'AFFIDAVIT') && (
            <>
              <div className="sign-panel-title">Notary / oath session (optional)</div>
              <div style={{ padding: '0 12px 16px' }}>
                <MeetingLinkPanel title={title || 'Notary Session'} value={meetingLink} onChange={setMeetingLink} />
              </div>
            </>
          )}

          {/* Jurisdiction advisory — Phase S5. Informational only, never a
              hard block: a real, reviewed legal-status note (migration
              430's own header cites the actual source sections), shown
              for whatever execution type the current recipients resolve
              to. Never renders "legally valid" — only what the seeded row
              actually says. */}
          {jurisdiction.jurisdiction_code && jurisdictionRule && (
            <>
              <div className="sign-panel-title">Jurisdiction</div>
              <div style={{ margin: '0 12px 16px', padding: '10px 12px', borderRadius: 'var(--r-sm)', fontSize: 11.5, lineHeight: 1.5, ...(
                jurisdictionRule.status === 'SUPPORTED' ? { background: 'var(--green-l)', border: '1px solid var(--green)', color: 'var(--green)' } :
                jurisdictionRule.status === 'SUPPORTED_WITH_CONDITIONS' || jurisdictionRule.status === 'REQUIRES_PROFESSIONAL_REVIEW' ? { background: 'var(--gold-l)', border: '1px solid var(--gold)', color: 'var(--gold)' } :
                { background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)' }
              ) }}>
                <div style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: 10 }}>
                  {jurisdiction.jurisdiction_code} · {jurisdictionRule.status.replace(/_/g, ' ')}
                </div>
                {jurisdictionRule.conditions && <div style={{ marginTop: 4, color: 'var(--ink2)' }}>{jurisdictionRule.conditions}</div>}
                {jurisdictionRule.legal_basis && <div style={{ marginTop: 4, color: 'var(--ink3)', fontStyle: 'italic' }}>{jurisdictionRule.legal_basis}</div>}
              </div>
            </>
          )}

          {/* AI Scan results — Phase S8. Suggestions the preparer can act on
              or ignore; never phrased as a completeness/validity verdict. */}
          {aiAssist && (
            <>
              <div className="sign-panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>AI Scan</span>
                <Button variant="ghost" size="icon" onClick={() => setAiAssist(null)} style={{ height: 20, width: 20, minHeight: 0, color: 'var(--ink3)' }}><Icon name="x" size={13} /></Button>
              </div>
              <div style={{ margin: '0 12px 16px' }}>
                {!aiAssist.available ? (
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r-sm)' }}>
                    {aiAssist.reason || 'Analysis is not available right now.'}
                  </div>
                ) : aiAssist.missingFields.length === 0 && aiAssist.blocks.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r-sm)' }}>
                    Nothing flagged — no blank fields or witness/notary blocks detected. This isn't a completeness check; review the document yourself before sending.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {aiAssist.missingFields.map((f, i) => (
                      <div key={`f${i}`} style={{ fontSize: 11.5, padding: '7px 10px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r-sm)', color: 'var(--ink2)' }}>
                        <strong style={{ color: 'var(--gold)' }}>{f.page ? `Page ${f.page} — ` : ''}Blank field:</strong> {f.description}
                      </div>
                    ))}
                    {aiAssist.blocks.map((b, i) => (
                      <div key={`b${i}`} style={{ fontSize: 11.5, padding: '7px 10px', background: 'var(--blue-l)', border: '1px solid var(--blue)', borderRadius: 'var(--r-sm)', color: 'var(--ink2)' }}>
                        <strong style={{ color: 'var(--blue)' }}>{b.page ? `Page ${b.page} — ` : ''}{b.type === 'witness' ? 'Witness block:' : 'Notary/oath block:'}</strong> {b.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {isPdf && pdfDoc && !isMobile && <nav className="sign-workspace-thumbnails" aria-label="Document pages">
          <div className="sign-panel-title">Pages</div>
          {Array.from({length: pdfNumPages}, (_, index) => <PageThumbnail key={index+1} doc={pdfDoc} page={index+1} active={currentPdfPage===index+1} onSelect={()=>{setCurrentPdfPage(index+1);editorCenterRef.current?.scrollTo({top:0});}}/>)}
        </nav>}
        {/* CENTER: A4 page preview */}
        <div ref={editorCenterRef} className="sign-editor-center" style={{ display: isMobile && mobileTab !== 'center' ? 'none' : undefined }}>
          {/* Toolbar + canvas share a wrapper with no gap between them, so
              the dark bar and the white page below it read as one card, not
              two elements floating apart — .sign-editor-center's own 16px
              flex gap would otherwise land right between them, same as it
              correctly does around this whole group's other siblings. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minWidth: pageW + 40, width: '100%' }}>
          {/* File upload area — two actions: Upload File and Scan Document */}
          {!previewSrc && (
            <div style={{ width: pageW, border: '2px dashed var(--border)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '32px 24px', background: 'var(--card-bg)', color: 'var(--ink3)', boxSizing: 'border-box' }}>
              <Icon name="fileText" size={40} style={{ opacity: 0.3 }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Add a document to get started</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>PDF, DOCX, PNG, JPG — every page will be loaded</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="outline" size="default" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="upload" size={14} /> Upload File
                </Button>
                <Button variant="outline" size="default" onClick={() => scanInputRef.current?.click()}>
                  <Icon name="camera" size={14} /> Scan Document
                </Button>
              </div>
            </div>
          )}
          {/* Document page-count confirmation — shown once a PDF is loaded so
              the user knows all pages came through before placing fields */}
          {isPdf && pdfDoc && pdfNumPages > 1 && !pdfLoading && (
            <div style={{ width: pageW, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 'var(--r-sm)', boxSizing: 'border-box', fontSize: 12.5, color: 'var(--ink2)' }}>
              <Icon name="checkCircle" size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <span><strong style={{ color: 'var(--ink)' }}>{pdfNumPages} pages</strong> loaded — use the page controls above to navigate</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" style={{ display: 'none' }} onChange={handleFile} />
          {/* Camera/scan input — capture="environment" opens the back camera on mobile;
              on desktop it falls back to a regular image file picker */}
          <input ref={scanInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

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
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 'var(--r-sm)', padding: '4px 8px', background: 'rgba(255,255,255,0.9)', letterSpacing: '0.05em', fontWeight: 700 }}>
                  HSGN-XXXXXX-XXXXXX
                </div>
              </div>
            )}
          </div>
          </div>

          {placingType && (
            <div className="sign-placing-guide-banner">
              <div className="sign-placing-guide-text">
                <Icon name="target" size={15} />
                <span>Click anywhere on the page to place the <strong>{FIELD_TYPES.find(f => f.type === placingType)?.label || placingType}</strong> field</span>
              </div>
              <Button variant="ghost" size="xs" onClick={() => setPlacingType(null)} className="sign-placing-cancel-btn">
                <Icon name="close" size={12} />
                <span>Cancel</span>
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT: Selected field properties — swapped out for PDF tools
            while a tool is active, rather than PDF tools covering the whole
            screen. Same panel, same mobile "Field Options" tab, so it stays
            reachable exactly the same way on a phone as on desktop. */}
        <div className="sign-editor-right" style={{ display: sidebarMode === 'recipients' || (isMobile && mobileTab !== 'right') ? 'none' : undefined }}>
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
          {sidebarMode==='review' ? <div className="sign-workspace-review">
            <h2>Review and send</h2><p>Confirm the document, signing order and recipients before sending their invitations.</p>
            <div className="sign-workspace-review-document"><Icon name="fileText" size={20}/><div><strong>{title || 'Untitled document'}</strong><span>{fileName || 'Blank signing page'} · {pdfNumPages || 1} page(s)</span></div></div>
            <label>Signing order<Select value={orderMode} onValueChange={value=>setOrderMode(value as 'sequential'|'parallel')}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sequential">Sequential signing</SelectItem><SelectItem value="parallel">Parallel signing</SelectItem></SelectContent></Select></label>
            <label className="sign-workspace-review-otp"><Checkbox checked={requireOtp} onCheckedChange={value=>setRequireOtp(value===true)}/>Require SMS / WhatsApp verification</label>
            <h3>Recipients</h3>
            {recipients.map((r,index)=><div className="sign-workspace-review-recipient" key={index}><PersonAvatar userId={r.user_id || undefined} name={r.name || `Recipient ${index+1}`} size={30}/><div><strong>{r.name || 'Missing name'}</strong><span>{r.email || 'Missing email'}</span><small>{fields.filter(f=>f.recipient_index===index).length} fields · {r.execution_role || 'SIGNER'}</small></div></div>)}
            {(!title.trim() || recipients.some(r=>!r.name.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)))&&<Banner variant="warning">Enter a document title and a valid name and email for every recipient.</Banner>}
            {requireOtp&&recipients.some(r=>!r.phone.trim())&&<Banner variant="warning">Every recipient needs a phone number for verification.</Banner>}
            {fields.length===0&&<Banner variant="warning">No signing fields have been placed.</Banner>}
            <label>Message to recipients<Textarea rows={3} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Add a message…"/></label>
            <Button variant="outline" onClick={()=>openSidebar('recipients')}>Edit recipients and settings</Button>
            <Button onClick={handleSend} disabled={sending||saving||!title.trim()||recipients.some(r=>!r.name.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))||(requireOtp&&recipients.some(r=>!r.phone.trim()))}><Icon name="send" size={15}/>{sending?'Sending…':'Send document'}</Button>
          </div> : <>          <div className="sign-workspace-active-recipient"><PersonAvatar userId={recipients[activeRecipient]?.user_id || undefined} name={recipients[activeRecipient]?.name || 'Recipient'} size={34}/><div><strong>{recipients[activeRecipient]?.name || 'Choose a recipient'}</strong><span>{recipients[activeRecipient]?.email || 'Add signer details to assign fields'}</span></div></div>
          <div className="sign-workspace-assignee"><Select value={String(activeRecipient)} onValueChange={value=>setActiveRecipient(Number(value))}><SelectTrigger aria-label="Assign new fields to"><SelectValue/></SelectTrigger><SelectContent>{recipients.map((r,index)=><SelectItem key={index} value={String(index)}>{r.name || `Recipient ${index+1}`}</SelectItem>)}</SelectContent></Select></div>          {/* Field type palette */}
          <div className="sign-panel-title">Add fillable fields</div>
          <div className="sign-field-palette">
            {FIELD_TYPES.filter(ft=>showAllFields || ft.type!=='checkbox').map(ft => {
              const isPlacing = placingType === ft.type;
              return (
                <Button
                  variant="outline"
                  key={ft.type}
                  size="sm"
                  className={cn("sign-field-type-btn group", isPlacing && "is-placing")}
                  aria-pressed={isPlacing}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', ft.type);
                  }}
                  onClick={() => {
                    setPlacingType(prev => prev === ft.type ? null : ft.type);
                    if (isMobile) setMobileTab('center');
                  }}
                >
                  <span className="sign-field-icon-squircle">
                    <Icon name={ft.icon} size={15} />
                  </span>
                  <span className="sign-field-type-label">{ft.label}</span>
                  {isPlacing ? (
                    <span className="sign-field-active-pill">
                      Click page <Icon name="arrowUp" size={10} />
                    </span>
                  ) : (
                    <span className="sign-field-drag-hint" title="Drag onto page">
                      <Icon name="moreVertical" size={13} />
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          <div className="sign-workspace-more-fields">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllFields(value => !value)}
              className="sign-more-fields-btn"
            >
              <Icon name={showAllFields ? 'chevronUp' : 'chevronDown'} size={14} className="opacity-70" />
              <span>{showAllFields ? 'Hide extra fields' : 'More fields'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openSidebar('recipients')}
              className="sign-manage-recipients-btn font-semibold"
            >
              <Icon name="users" size={14} />
              <span>Manage recipients</span>
            </Button>
            <div className="sign-workspace-stamp-notice">
              <Icon name="info" size={13} className="shrink-0 text-muted-foreground mt-0.5" />
              <span>Verification stamps use the configured company stamp. Certified copies use the assigned official’s credentials.</span>
            </div>
          </div>          {selectedFieldData&&<div className="sign-panel-title">Field properties</div>}
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
                <Input value={selectedFieldData.placeholder ?? ''}
                  onChange={e => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, placeholder: e.target.value } : f))}
                  placeholder="e.g. Sign here" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Checkbox checked={selectedFieldData.required}
                  onCheckedChange={c => setFields(prev => prev.map(f => f.id === selectedField ? { ...f, required: c === true } : f))} />
                <span style={{ fontSize: 13 }}>Required field</span>
              </label>
              <div className="sign-workspace-geometry">{(['x','y','width','height'] as const).map(key=><label key={key} htmlFor={`field-${key}`}>{{x:'Left (%)',y:'Top (%)',width:'Width (%)',height:'Height (%)'}[key]}<Input id={`field-${key}`} type="number" min={key==='width'||key==='height'?1:0} max={100} step={0.5} value={Math.round(selectedFieldData[key]*1000)/10} onChange={e=>updateGeometry(key,Number(e.target.value))}/></label>)}</div>
              <Button variant="outline" size="default" onClick={() => removeField(selectedFieldData.id)}
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
                    onClick={() => { setSelectedField(f.id); setCurrentPdfPage(f.page || 1);if(isMobile)setMobileTab('center'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', cursor: 'pointer', background: selectedField === f.id ? 'var(--sign-blue-l)' : 'transparent', borderColor: selectedField === f.id ? 'var(--sign-blue)' : 'var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: RECIPIENT_COLORS[f.recipient_index % RECIPIENT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1 }}>{FIELD_TYPES.find(ft => ft.type === f.field_type)?.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>p.{f.page}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          </>}
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
