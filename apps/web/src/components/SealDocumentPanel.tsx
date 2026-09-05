import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { SectionLoading } from './ui/spinner.js';
import { Badge } from './ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

interface SealDoc {
  id: string; doc_type: string; filename: string; size_bytes: number | null;
  status: string; notes: string | null; created_at: string;
}

const DOC_TYPES = [
  'bill_of_lading', 'commercial_invoice', 'packing_list', 'certificate_of_origin',
  'import_permit', 'phytosanitary_certificate', 'warehousing_entry',
  'customs_declaration', 'examination_report', 'stock_account_report', 'other',
];
const DOC_TYPE_LABELS: Record<string, string> = {
  bill_of_lading: 'Bill of Lading', commercial_invoice: 'Commercial Invoice', packing_list: 'Packing List',
  certificate_of_origin: 'Certificate of Origin', import_permit: 'Import Permit',
  phytosanitary_certificate: 'Phytosanitary Certificate', warehousing_entry: 'Warehousing Entry',
  customs_declaration: 'Customs Declaration', examination_report: 'Examination Report',
  stock_account_report: 'Stock-Account Report', other: 'Other',
};

/** Document vault panel, embedded in a lot/consignment/declaration detail
 *  page — documents belong to a specific entity, so there's no global list
 *  first (spec's deferred document-vault scope, Increment 4).
 *
 *  Every upload here is also mirrored into Cloud (Customers ▸ owner ▸ SEAL ▸
 *  label — see CloudSync.syncSealDoc), for lot/consignment/container only:
 *  customs_entry/compartment have no customer owner to link to, so "Open
 *  Drive" is hidden for those rather than resolving nothing. */
export function SealDocumentPanel({ entityType, entityId }: { entityType: 'lot' | 'consignment' | 'container' | 'customs_entry' | 'compartment'; entityId: string }) {
  const [docs, setDocs] = useState<SealDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [resolvingFolder, setResolvingFolder] = useState(false);
  const cloudLinked = entityType === 'lot' || entityType === 'consignment' || entityType === 'container';

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/seal/documents?entity_type=${entityType}&entity_id=${entityId}`).then(setDocs).finally(() => setLoading(false));
  }, [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  async function openCloudFolder() {
    setResolvingFolder(true);
    try {
      const folder = await apiFetch(`/v1/files/seal-folder/${entityType}/${entityId}`);
      const qs = new URLSearchParams({ drive: folder.drive_id, folder: folder.id, name: folder.name });
      if (folder.parent) { qs.set('parentId', folder.parent.id); qs.set('parentName', folder.parent.name); }
      window.open(`/cloud?${qs.toString()}`, '_blank', 'noopener');
    } catch (err: any) {
      showAlert(err.message || "Could not open this record's Drive folder");
    } finally {
      setResolvingFolder(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('entityType', entityType);
      fd.append('entityId', entityId);
      fd.append('docType', docType);
      fd.append('file', file);
      await apiFetch('/v1/seal/documents/upload', { method: 'POST', body: fd });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleVerify(id: string, status: 'VERIFIED' | 'REJECTED') {
    try {
      await apiFetch(`/v1/seal/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update document.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/v1/seal/documents/${id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete document.');
    }
  }

  return (
    <div className="seal-card">
      <div className="seal-card-hdr">
        <h2 className="seal-card-title">Documents</h2>
        {cloudLinked && (
          <button type="button" className="btn btn-secondary" disabled={resolvingFolder} onClick={openCloudFolder}>
            <Icon name="externalLink" size={13} />
            <span>{resolvingFolder ? 'Opening…' : 'Open Drive'}</span>
          </button>
        )}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cloudLinked && (
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: -4 }}>
            Uploaded documents are automatically mirrored into this record's own Drive folder.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="input-field" style={{ width: 220 }}><SelectValue /></SelectTrigger>
            <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
          <label className="btn btn-secondary" style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
            <Icon name="upload" size={13} />
            <span>{uploading ? 'Uploading…' : 'Upload File'}</span>
            <input type="file" style={{ display: 'none' }} disabled={uploading} onChange={handleUpload} />
          </label>
        </div>

        {loading ? (
          <SectionLoading />
        ) : docs.length === 0 ? (
          <div className="seal-empty">No documents uploaded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <Icon name="fileText" size={16} color="var(--ink3)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" onClick={() => handleDownloadClick(d.id)}
                     style={{ fontWeight: 600, color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    {d.filename}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type} · {new Date(d.created_at).toLocaleDateString()}
                    {d.size_bytes ? ` · ${(d.size_bytes / 1024).toFixed(0)} KB` : ''}
                  </div>
                </div>
                <Badge variant={d.status === 'VERIFIED' ? 'success' : d.status === 'REJECTED' ? 'error' : 'gray'}>{d.status}</Badge>
                {d.status === 'UPLOADED' && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => handleVerify(d.id, 'VERIFIED')}>Verify</button>
                    <button type="button" className="btn btn-secondary" onClick={() => handleVerify(d.id, 'REJECTED')}>Reject</button>
                  </>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => handleDelete(d.id)}><Icon name="trash" size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function handleDownloadClick(id: string) {
  const { apiViewBlob } = await import('../lib/api.js');
  const { showAlert } = await import('../lib/alert.js');
  try {
    await apiViewBlob(`/v1/seal/documents/${id}/download`);
  } catch (err: any) {
    showAlert(err.message || 'Failed to open document.');
  }
}
