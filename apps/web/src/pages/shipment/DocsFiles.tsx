import React, { useState, useEffect, useRef } from 'react';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { ExaminationsQueue } from '../../components/ExaminationsQueue.js';
import { DangerousGoodsPanel } from '../../components/DangerousGoodsPanel.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Spinner, PageLoading } from '../../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { RelatedRecordsPanel } from '../../components/RelatedRecordsPanel.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { IconName } from '../../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../../lib/watermark.js';
import { useCompany, getCompany } from '../../data/companyStore.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { useClockIn } from '../../contexts/ClockInContext.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  jobUiSteps, jobCurrentIdx, jobStageLabel, jobBackendStage,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
  type JobChargeLine,
} from '../clearanceData.js';
import { ChBadge } from '../../components/ClearanceChips.js';
import { VesselLiveStatus } from '../../components/VesselLiveStatus.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../../data/staffData.js';
import type { Employee } from '../../data/staffData.js';
import { CUSTOMER_MILESTONES, MILESTONE_LABELS, STAGE_TO_MILESTONE } from '@hudumika/types';
import type { CustomerMilestone, ClearanceStage } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Badge } from '../../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../components/ui/hover-card.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
import { clockGate, fdate, ftime, fdatetime, fmtTZS, Av, DOC_TYPE_LABEL, docIcon, Card } from './utils.js';
import { SpecRow } from './OverviewUpdates.js';
export function ExtractedView({ doc }: { doc: ShipDoc }) {
  const ex = doc.extracted;
  if (!ex) return null;
  if (ex.status === 'processing') return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 8 }}>Extracting with AI…</div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '65%', background: 'var(--teal)', borderRadius: 'var(--r-sm)'}} />
      </div>
    </div>
  );
  if (ex.status === 'pending') return <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 0' }}>Click "Extract with AI" to parse this document.</div>;
  if (ex.status === 'failed')  return <div style={{ fontSize: 13, color: 'var(--red)' }}>Extraction failed. Please retry.</div>;
  return (
    <div>
      {ex.summary && <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14, padding: '10px 14px', background: 'var(--green-l)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--green)', lineHeight: 1.5 }}>{ex.summary}</div>}
      {ex.sections?.map(sec => (
        <div key={sec.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{sec.title}</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {sec.fields.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', padding: '8px 14px', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)', borderBottom: i < sec.fields.length - 1 ? '1px solid var(--border)' : 'none', gap: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)', width: 200, flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: f.flag === 'err' ? 'var(--red)' : f.flag === 'warn' ? 'var(--gold)' : 'var(--ink)' }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {ex.tables?.map(tbl => (
        <div key={tbl.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{tbl.title}</div>
          <div className="rtbl-wrap" style={{ border: '1px solid var(--border)' }}>
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{tbl.headers.map(h => <th key={h} style={{ padding: '8px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {tbl.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                    {row.map((cell, ci) => <td key={ci} style={{ padding: '7px 12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{cell}</td>)}
                  </tr>
                ))}
                {tbl.totalRow && (
                  <tr style={{ background: 'var(--bg)', fontWeight: 700 }}>
                    {tbl.totalRow.map((cell, ci) => <td key={ci} style={{ padding: '8px 12px', color: 'var(--ink)', borderTop: '2px solid var(--border)' }}>{cell}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BL', label: 'Bill of Lading' },
  { value: 'AWB', label: 'Air Waybill' },
  { value: 'INVOICE', label: 'Commercial Invoice' },
  { value: 'PACKING_LIST', label: 'Packing List' },
  { value: 'PERMIT', label: 'Permit' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'CUSTOMS_ENTRY', label: 'Customs Entry' },
  { value: 'DUTY_RECEIPT', label: 'Duty Receipt' },
  { value: 'RELEASE_ORDER', label: 'Release Order' },
  { value: 'DELIVERY_NOTE', label: 'Delivery Note' },
  { value: 'PRE_ASSESSMENT', label: 'Pre-assessment' },
  { value: 'FINAL_ASSESSMENT', label: 'Final assessment' },
  { value: 'TISS', label: 'TISS' },
  { value: 'PAYMENT_NOTE', label: 'Payment note' },
  { value: 'TISS_PAYMENT_INVOICE', label: 'TISS payment invoice' },
  { value: 'TBS_CHARGES', label: 'TBS charges' },
  { value: 'COC', label: 'Certificate of Conformity (COC)' },
  { value: 'WHARFAGE', label: 'Wharfage' },
  { value: 'OTHER', label: 'Other' },
];

// The full document manifest for a shipment — the whole clearance checklist in
// ONE place, not two overlapping panels. `required` gates the move to payment;
// the rest are the shipping/clearance and optional docs, including the ones
// uploaded in later steps. Any uploaded document whose type isn't listed here
// still shows, under "Other documents".
export const DOC_MANIFEST: { title: string; required?: boolean; optional?: boolean; docs: { type: string; label: string }[] }[] = [
  { title: 'Shipping & clearance', docs: [
    { type: 'BL', label: 'Bill of Lading' },
    { type: 'INVOICE', label: 'Commercial Invoice' },
    { type: 'PACKING_LIST', label: 'Packing List' },
    { type: 'CUSTOMS_ENTRY', label: 'Customs Entry' },
    { type: 'DUTY_RECEIPT', label: 'Duty Receipt' },
  ] },
  { title: 'Required before payment', required: true, docs: [
    { type: 'PRE_ASSESSMENT', label: 'Pre-assessment' },
    { type: 'FINAL_ASSESSMENT', label: 'Final assessment' },
    { type: 'TISS', label: 'TISS' },
    { type: 'PAYMENT_NOTE', label: 'Payment note' },
    { type: 'TISS_PAYMENT_INVOICE', label: 'TISS payment invoice' },
  ] },
  { title: 'Optional — depends on the flow', optional: true, docs: [
    { type: 'TBS_CHARGES', label: 'TBS charges' },
    { type: 'COC', label: 'Certificate of Conformity' },
    { type: 'WHARFAGE', label: 'Wharfage' },
  ] },
];

export function DocumentsPanel({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const canUpload = !!(user && user.role !== 'CUSTOMER');
  const canVerify = !!(user && user.role !== 'CUSTOMER');
  const [uploading, setUploading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const targetType = React.useRef('');

  const docFor = (type: string) => job.documents.find(d => (d.apiType || '').toUpperCase() === type && !d.pending);

  function pick(type: string) {
    if (!isLive) { showAlert('Uploading is only available for live shipments, not demo data.'); return; }
    targetType.current = type;
    fileRef.current?.click();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const type = targetType.current;
    setUploading(type);
    try {
      const fd = new FormData(); fd.append('type', type); fd.append('file', file);
      await apiFetch(`/v1/shipments/${shipmentId}/documents/upload?type=${encodeURIComponent(type)}`, { method: 'POST', body: fd });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Upload failed'); }
    finally { setUploading(null); }
  }

  async function viewDoc(doc: ShipDoc) {
    try { await apiViewBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`); }
    catch (err: any) { showAlert(err.message || 'Could not open document'); }
  }
  async function shareDoc(doc: ShipDoc) {
    try {
      const blob = await apiFetchBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`);
      const file = new File([blob], doc.name, { type: blob.type || 'application/octet-stream' });
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: doc.name });   // real OS share sheet with the actual file
      } else {
        // Most desktop browsers can't share files — hand the file over so it can
        // be attached to whatever the user shares it through. No fake link.
        await apiDownload(`/v1/shipments/${shipmentId}/documents/${doc.id}/download`, doc.name);
        showAlert("This browser can't open a share sheet, so the file was downloaded — attach it to share.", { variant: 'info', title: 'Downloaded to share' });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;   // user dismissed the share sheet
      showAlert(err?.message || 'Could not share document');
    }
  }
  async function downloadDoc(doc: ShipDoc) {
    try { await apiDownload(`/v1/shipments/${shipmentId}/documents/${doc.id}/download`, doc.name); }
    catch (err: any) { showAlert(err.message || 'Download failed'); }
  }
  async function verifyDoc(doc: ShipDoc) {
    if (!isLive || verifying) return;
    setVerifying(doc.id);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${doc.id}/verify`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not verify document'); }
    finally { setVerifying(null); }
  }
  async function deleteDoc(doc: ShipDoc) {
    if (!isLive) { showAlert('Deleting is only available for live shipments, not demo data.'); return; }
    const ok = await showConfirm(`Delete "${DOC_TYPE_LABEL[doc.type] ?? doc.type}"? The file is removed and this can't be undone.`, { title: 'Delete document', variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    setDeleting(doc.id);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${doc.id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not delete document'); }
    finally { setDeleting(null); }
  }

  // Workflow-driven required list: the document entry-conditions of THIS
  // shipment's workflow (each step's `document:<TYPE>` requirement). This is
  // what makes the checklist change with the workflow — a Sea-import flow asks
  // for different docs than Air or Transit. When the workflow declares none
  // (e.g. a legacy shipment), fall back to the default required set.
  const wfDocTypes: { type: string; label: string }[] = [];
  {
    const seen = new Set<string>();
    for (const step of job.workflowSteps ?? []) {
      for (const req of step.requirements ?? []) {
        const f = req.field;
        if (f && f.startsWith('document:')) {
          const t = f.slice('document:'.length).toUpperCase();
          if (!seen.has(t)) { seen.add(t); wfDocTypes.push({ type: t, label: DOC_TYPE_LABEL[t.toLowerCase()] ?? t }); }
        }
      }
    }
  }
  const shipping = DOC_MANIFEST.find(g => !g.required && !g.optional)!;
  const optionalGroup = DOC_MANIFEST.find(g => g.optional)!;
  const requiredGroup = wfDocTypes.length > 0
    ? { title: 'Required by this workflow', required: true, docs: wfDocTypes }
    : DOC_MANIFEST.find(g => g.required)!;

  type Grp = { title: string; required?: boolean; optional?: boolean; docs: { type: string; label: string }[] };
  const requiredTypes = new Set(requiredGroup.docs.map(d => d.type));
  const groups: Grp[] = [
    requiredGroup,
    { title: shipping.title, docs: shipping.docs.filter(d => !requiredTypes.has(d.type)) },
    { title: optionalGroup.title, optional: true, docs: optionalGroup.docs.filter(d => !requiredTypes.has(d.type)) },
  ].filter(g => g.docs.length > 0);

  const requiredDocs = requiredGroup.docs;
  const haveCount = requiredDocs.filter(d => docFor(d.type)).length;
  const ready = haveCount === requiredDocs.length;

  const listedTypes = new Set(groups.flatMap(g => g.docs.map(d => d.type)));
  const others = job.documents.filter(d => !d.pending && !listedTypes.has((d.apiType || '').toUpperCase()));
  const uploadedAny = job.documents.some(d => !d.pending);

  // One row — a manifest slot (with or without its file) or an extra upload.
  const row = (key: string, type: string, label: string, doc: ShipDoc | undefined, required: boolean, pendingLabel: string) => (
    <div key={key} style={{
      display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
      // A lighter wash of the app accent for an uploaded row — the canonical
      // --teal-l tint blended most of the way to white, so it still reads as
      // "this app's colour" (orange in ClearOS, pink in NexusHR…) but softly.
      border: `1px solid ${doc ? 'color-mix(in srgb, var(--teal-m), var(--white) 40%)' : 'var(--border)'}`,
      borderRadius: 'var(--r, 10px)', padding: '10px 12px',
      background: doc ? 'color-mix(in srgb, var(--teal-l), var(--white) 55%)' : 'var(--white)',
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 'var(--r-sm, 8px)', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: doc ? 'var(--teal)' : required ? 'var(--gold-l)' : 'var(--bg)',
      }}>
        <Icon name={doc ? 'check' : required ? 'alertCircle' : 'fileText'} size={15}
          color={doc ? '#fff' : required ? 'var(--gold)' : 'var(--ink3)'} strokeWidth={doc ? 3 : 1.75} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        <div title={doc ? doc.name : undefined} style={{ fontSize: 11.5, color: doc ? 'var(--ink2)' : required ? 'var(--gold)' : 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {doc ? `${doc.name} · ${fdate(doc.uploadedAt)}` : pendingLabel}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {doc && (
          <>
            {doc.status === 'VERIFIED' ? (
              <Tip label="Verified"><span className="doc-act is-verified" aria-label="Verified"><Icon name="checkCircle" size={17} /></span></Tip>
            ) : canVerify ? (
              <Tip label="Mark as verified"><button type="button" className="doc-act" onClick={() => verifyDoc(doc)} disabled={verifying === doc.id} aria-label="Mark as verified" data-ui-native-button=""><Icon name="checkCircle" size={16} /></button></Tip>
            ) : null}
            <Tip label="View document"><button type="button" className="doc-act" onClick={() => viewDoc(doc)} aria-label="View document" data-ui-native-button=""><Icon name="eye" size={16} /></button></Tip>
            <Tip label="Share document"><button type="button" className="doc-act" onClick={() => shareDoc(doc)} aria-label="Share document" data-ui-native-button=""><Icon name="send" size={16} /></button></Tip>
            <Tip label="Download document"><button type="button" className="doc-act" onClick={() => downloadDoc(doc)} aria-label="Download document" data-ui-native-button=""><Icon name="download" size={16} /></button></Tip>
            <Tip label="Delete document"><button type="button" className="doc-act is-delete" onClick={() => deleteDoc(doc)} disabled={deleting === doc.id} aria-label="Delete document" data-ui-native-button=""><Icon name="trash2" size={16} /></button></Tip>
          </>
        )}
        {canUpload && (
          <Tip label={doc ? 'Replace document' : 'Upload document'}>
            <button type="button" className="doc-act" onClick={() => pick(type)} disabled={uploading === type} aria-label={doc ? 'Replace document' : 'Upload document'} data-ui-native-button="">
              <Icon name="upload" size={16} />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );

  return (
    <Card title="Documents" collapsible defaultOpen action={uploadedAny ? (
      <button type="button" onClick={() => job.documents.filter(d => !d.pending).forEach(downloadDoc)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} data-ui-native-button="">
        <Icon name="download" size={12} color="var(--teal)" /> Download All
      </button>
    ) : undefined}>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />
      <div style={{ fontSize: 12, fontWeight: 600, color: ready ? 'var(--teal)' : 'var(--ink3)', marginBottom: 14 }}>
        {haveCount} of {requiredDocs.length} required uploaded{ready ? ' — ready to move to payment.' : ' — all required before the payment step.'}
      </div>
      {groups.map(group => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{group.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.docs.map(d => row(d.type, d.type, d.label, docFor(d.type), !!group.required, group.required ? 'Required' : group.optional ? 'Optional' : 'Not uploaded yet'))}
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Other documents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {others.map(d => row(d.id, (d.apiType || d.type || '').toUpperCase(), DOC_TYPE_LABEL[d.type] ?? d.type, d, false, ''))}
          </div>
        </div>
      )}
    </Card>
  );
}

export interface StagedFile { id: string; file: File; type: string; }

export function fmtFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function FilesTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const canVerify = !!(user && user.role !== 'CUSTOMER');
  const [verifying, setVerifying] = useState<string | null>(null);
  async function verifyDoc(docId: string) {
    if (!isLive || verifying) return;
    setVerifying(docId);
    try {
      await apiFetch(`/v1/shipments/${shipmentId}/documents/${docId}/verify`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      onRefresh();
    } catch (err: any) { showAlert(err.message || 'Could not verify document'); }
    finally { setVerifying(null); }
  }
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState('OTHER');
  const [uploadError, setUploadError] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [savingStaged, setSavingStaged] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadTargetType = React.useRef('OTHER');

  function handleUploadClick(type?: string) {
    if (!isLive) { showAlert('Uploading is only available for live shipments, not demo data.'); return; }
    uploadTargetType.current = type || uploadType;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const docType = uploadTargetType.current;
    setUploadError('');
    const newlyStaged: StagedFile[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file, type: docType,
    }));
    setStagedFiles(prev => [...prev, ...newlyStaged]);
    e.target.value = '';
  }

  function removeStaged(id: string) {
    setStagedFiles(prev => prev.filter(f => f.id !== id));
  }

  function setStagedType(id: string, type: string) {
    setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, type } : f));
  }

  async function saveStagedFiles() {
    if (stagedFiles.length === 0) return;
    setSavingStaged(true);
    setUploadError('');
    try {
      for (const sf of stagedFiles) {
        const formData = new FormData();
        formData.append('type', sf.type);
        formData.append('file', sf.file);
        await apiFetch(`/v1/shipments/${shipmentId}/documents/upload?type=${encodeURIComponent(sf.type)}`, {
          method: 'POST',
          body: formData,
        });
      }
      setStagedFiles([]);
      onRefresh();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setSavingStaged(false);
    }
  }

  function handleDownload(doc: ShipDoc) {
    if (!isLive) { showAlert('Downloading is only available for live shipments, not demo data.'); return; }
    apiDownload(`/v1/shipments/${shipmentId}/documents/${doc.id}/download`, doc.name).catch(err => showAlert(err.message || 'Download failed'));
  }

  function handleView(doc: ShipDoc) {
    if (!isLive) { showAlert('Viewing is only available for live shipments, not demo data.'); return; }
    apiViewBlob(`/v1/shipments/${shipmentId}/documents/${doc.id}/view`).catch(err => showAlert(err.message || 'View failed'));
  }

  async function handleExtract(docId: string) {
    updateJob(job.id, j => ({ ...j, documents: j.documents.map(d => d.id === docId ? { ...d, extracted: { ...(d.extracted || {}), status: 'processing' as const } } : d) }));
    try {
      const blob = await apiFetchBlob(`/v1/shipments/${shipmentId}/documents/${docId}/view`);
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const image_base64 = dataUrl.split(',')[1];
      const media_type = blob.type || 'application/pdf';
      const res = await apiFetch('/v1/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64, media_type }),
      });
      const r = res.result || {};
      const toFields = (obj: Record<string, any>) =>
        Object.entries(obj || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }));
      const sections = [
        { title: 'Overview', fields: toFields(r.overview) },
        { title: 'Parties', fields: toFields(r.parties) },
        { title: 'Financial', fields: toFields(r.financial) },
      ].filter(sec => sec.fields.length > 0);
      const confidence = typeof r.confidence === 'number' ? Math.round(r.confidence * 100) : undefined;
      updateJob(job.id, j => ({
        ...j,
        documents: j.documents.map(d => d.id === docId ? {
          ...d,
          extracted: {
            status: 'done' as const,
            docType: r.doc_type || 'Document',
            confidence,
            sections,
            summary: res.simulated
              ? 'Simulated extraction (no OCR key configured for this platform) — verify the fields below against the original document.'
              : `Extracted as ${r.doc_type || 'a document'} by AI. Review and verify the fields below.`,
          },
        } : d),
      }));
    } catch (err: any) {
      updateJob(job.id, j => ({ ...j, documents: j.documents.map(d => d.id === docId ? { ...d, extracted: { status: 'failed' as const } } : d) }));
      showAlert(err.message || 'Document extraction failed.');
    }
  }

  const uploadedDocuments = job.documents.filter(d => !d.pending);
  const extracted = uploadedDocuments.filter(d => d.extracted?.status === 'done');

  return (
    <div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileChange} />

      {extracted.length > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '14px 20px', background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 'var(--r)', marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{extracted.length}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Documents Extracted by AI</div>
            <div style={{ fontSize: 12, color: 'var(--green)' }}>Data captured from {extracted.map(d => d.name).join(', ')}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value={uploadType} onValueChange={setUploadType} disabled={savingStaged}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => handleUploadClick()} disabled={savingStaged}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: savingStaged ? 'wait' : 'pointer', opacity: savingStaged ? 0.75 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
            <Icon name="upload" size={14} /> Upload Document
          </button>
        </div>
        {uploadError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{uploadError}</div>}
      </div>

      {stagedFiles.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--teal)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} ready to upload
            </div>
            <button type="button" onClick={() => setStagedFiles([])} disabled={savingStaged}
              style={{ fontSize: 12, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }} data-ui-native-button="">
              Clear all
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {stagedFiles.map(sf => (
              <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                <Icon name={docIcon(sf.type.toLowerCase())} size={18} color="var(--teal)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.file.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtFileSize(sf.file.size)}</div>
                </div>
                <Select value={sf.type} onValueChange={v => setStagedType(sf.id, v)} disabled={savingStaged}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => removeStaged(sf.id)} disabled={savingStaged} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', flexShrink: 0 }} data-ui-native-button="">
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => handleUploadClick()} disabled={savingStaged}
              style={{ padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
              + Add more
            </button>
            <button type="button" onClick={saveStagedFiles} disabled={savingStaged}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: savingStaged ? 'wait' : 'pointer', opacity: savingStaged ? 0.75 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
              {savingStaged ? 'Saving…' : `Save ${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {uploadedDocuments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink3)', fontSize: 14 }}>
          No documents uploaded yet. Upload B/L, Invoice, Assessment docs to begin.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {uploadedDocuments.map(doc => {
          const isExp = expanded === doc.id; const ex = doc.extracted;
          return (
            <div key={doc.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : doc.id)}
                role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExp ? null : doc.id); } }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
                  <Icon name={docIcon(doc.type)} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{DOC_TYPE_LABEL[doc.type] ?? doc.type}</div>
                  <div title={doc.name} style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name} · Uploaded by {doc.uploadedBy} · {fdate(doc.uploadedAt)}</div>
                  {ex?.status === 'done' && ex.summary && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.summary}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {ex?.status === 'done'       && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--green-l)', color: 'var(--green)', fontWeight: 700, border: '1px solid var(--green)' }}>✓ AI Extracted · {ex.confidence}%</span>}
                  {ex?.status === 'processing' && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--gold-l)', color: 'var(--gold)', fontWeight: 700 }}>Processing…</span>}
                  {(!ex || ex.status === 'pending') && (
                    <button type="button" onClick={e => { e.stopPropagation(); handleExtract(doc.id); }} style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', border: '1px solid var(--teal)', color: 'var(--teal)', background: 'var(--white)', cursor: 'pointer', fontWeight: 700, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                      Extract with AI
                    </button>
                  )}
                  {doc.status === 'VERIFIED' ? (
                    <span title="Verified" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--green-l)', color: 'var(--green)', border: '1px solid var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="checkCircle" size={12} color="var(--green)" /> Verified</span>
                  ) : canVerify ? (
                    <button type="button" onClick={e => { e.stopPropagation(); verifyDoc(doc.id); }} disabled={verifying === doc.id} title="Mark this document as verified" style={{ fontSize: 12, padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--r)', border: '1px solid var(--green)', color: 'var(--green)', background: 'var(--white)', cursor: verifying === doc.id ? 'default' : 'pointer', fontWeight: 700, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
                      {verifying === doc.id ? '…' : 'Verify'}
                    </button>
                  ) : null}
                  <button type="button" onClick={e => { e.stopPropagation(); handleView(doc); }} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} data-ui-native-button=""><Icon name="eye" size={16} /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); handleDownload(doc); }} title="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} data-ui-native-button=""><Icon name="download" size={16} /></button>
                  <Icon name={isExp ? 'chevronUp' : 'chevronDown'} size={16} />
                </div>
              </div>
              {isExp && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--bg)' }}>
                  <ExtractedView doc={doc} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CO2 / Sustainability Tab ──────────────────────────────────────────────────

export function CO2Tab({ job, shipmentId, isLive, onRefresh }: { job: ClearanceJob; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const isMobile = useIsMobile();
  const [calcSaving, setCalcSaving] = useState(false);
  const [calcError, setCalcError] = useState('');
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  const hasOriginDest = !!(job.origin && job.origin !== '—' && job.destination && job.destination !== '—');
  const hasWeight = !!job.weight;
  const canCalculate = hasOriginDest && hasWeight;

  // Pulled straight from the shipment — nothing to type. The backend
  // resolves these free-text names to port/airport codes itself.
  async function handleCalculate() {
    if (!canCalculate) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setCalcSaving(true);
    setCalcError('');
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/co2`, { method: 'POST', body: JSON.stringify({}) });
        onRefresh();
      } else {
        const factor = job.mode.includes('AIR') ? 1.25 : 0.015;
        const w = Number(job.weight!.replace(/[^0-9.]/g, '')) / 1000;
        const dist = 5000;
        const em = dist * w * factor;
        const cred = (em * 0.25) / 1000;
        updateJob(job.id, j => ({ ...j, co2EmissionsKg: em, carbonCreditsSaved: cred, co2CalcDetails: { origin: job.origin, destination: job.destination, distance_km: dist, mode: 'SEA' } }));
      }
    } catch (err: any) {
      setCalcError(err.message || 'Failed to calculate CO2');
    } finally {
      setCalcSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Results */}
      {job.co2EmissionsKg !== undefined && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--green)' }}>
              <Icon name="activity" size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total CO₂ Emissions</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font)' }}>
              {job.co2EmissionsKg.toLocaleString()} <span style={{ fontSize: 16, fontWeight: 600 }}>kg</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--gold)' }}>
              <Icon name="sun" size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Carbon Credits Saved</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font)' }}>
              {job.carbonCreditsSaved?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 16, fontWeight: 600 }}>credits</span>
            </div>
          </div>
        </div>
      )}

      <Card title="CO₂ Emissions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>GLEC Framework v3.2 / ISO 14083 — computed directly from this shipment's route and weight.</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '0 24px', margin: '16px 0' }}>
          <SpecRow label="Origin" value={job.origin && job.origin !== '—' ? job.origin : 'Not set'} />
          <SpecRow label="Destination" value={job.destination && job.destination !== '—' ? job.destination : 'Not set'} />
          <SpecRow label="Gross Weight" value={job.weight || 'Not set'} />
        </div>

        {!canCalculate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--gold)', marginBottom: 14 }}>
            <Icon name="alertCircle" size={14} color="var(--gold)" />
            Add {[!hasOriginDest && 'origin/destination', !hasWeight && 'gross weight'].filter(Boolean).join(' and ')} on the Edit page to enable calculation.
          </div>
        )}

        {calcError && (
          <div style={{ marginBottom: 14 }}><Banner variant="error">{calcError}</Banner></div>
        )}

        <button type="button" onClick={handleCalculate} disabled={!canCalculate || calcSaving}
          style={{ padding: 'var(--ds-btn-py) 22px', background: canCalculate ? 'var(--green)' : 'var(--border)', color: canCalculate ? 'hsl(var(--green-foreground))' : 'var(--ink3)', border: 'none', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, cursor: canCalculate && !calcSaving ? 'pointer' : 'default', opacity: calcSaving ? 0.7 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
          {calcSaving ? 'Calculating…' : job.co2EmissionsKg !== undefined ? 'Recalculate CO₂' : 'Calculate CO₂'}
        </button>

        {job.co2CalcDetails && (
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--ink3)' }}>
            <strong>Calculation details:</strong> Distance {job.co2CalcDetails.distance_km}km · Mode {job.co2CalcDetails.mode}{job.co2CalcDetails.factor ? ` · GLEC Factor ${job.co2CalcDetails.factor}` : ''}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Job Charges Tab — CargoWise-style cost+sell grid ────────────────────────

export const CHARGE_CODE_DEFAULTS: Record<string, string> = {
  CCLR: 'Customs Clearance / Agency Fees',  OCART: 'Pick Up Cartage',
  OSEC: 'Origin Security Surcharge',         ECCLR: 'Export Customs Clearance Fee',
  OSSC: 'Origin Security Screening Charge',  FRT:   'International Freight',
  DUTY: 'Import Duty',                       VAT:   'Value Added Tax',
  EXCISE: 'Excise Duty',                     CPF:   'Customs Processing Fee',
  RDL:  'Railway Development Levy',          TPA:   'Tanzania Ports Authority (TPA) Levy',
  ICD:  'ICD Handling & Storage',            TBS:   'TBS Conformity Assessment',
  WFGE: 'Wharfage',                          INS:   'Marine Insurance',
  TRANS:'Inland Transport / Delivery',        DEM:   'Demurrage & Detention',
  BOND: 'Bond / Guarantee Fee',              MISC:  'Miscellaneous Charges',
};
