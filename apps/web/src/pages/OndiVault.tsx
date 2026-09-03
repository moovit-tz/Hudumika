// ─── OndiVault.tsx — Ondi Personal · Document Vault ──────────────
// Real document storage, wired to this platform's existing Drive/Cloud
// file system (files.routes.ts) — the previous version of this page
// simulated encryption with setTimeout()s and downloaded a hardcoded fake
// blob. Files here live in the signed-in user's own employee Drive folder
// (GET /v1/files/employee-folder/:userId, the same one HR document
// features already use), tagged entity_type='employee' so nothing new was
// needed server-side.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch, apiDownload, apiUploadWithProgress } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface VaultFile { id: string; name: string; size: number; created_at: string; type: string }

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const OndiVault: React.FC = () => {
  const { user } = useAuth();
  const [folder, setFolder] = useState<{ id: string; drive_id: string } | null>(null);
  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (folderId: string) => {
    try {
      const rows: VaultFile[] = await apiFetch(`/v1/files?entity_type=employee&entity_id=${user!.id}`);
      setFiles(rows.filter(f => f.type !== 'folder'));
    } catch { setFiles([]); }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    apiFetch(`/v1/files/employee-folder/${user.id}`)
      .then(f => { setFolder(f); reload(f.id); })
      .catch(() => setFiles([]));
  }, [user, reload]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !folder) return;
    setUploading(true);
    setUploadPct(0);
    try {
      for (const file of Array.from(fileList)) {
        const qs = new URLSearchParams({ parent_id: folder.id, drive_id: folder.drive_id });
        const form = new FormData();
        form.append('file', file);
        const { promise } = apiUploadWithProgress(`/v1/files/upload?${qs.toString()}`, form, setUploadPct);
        await promise;
      }
      await reload(folder.id);
    } catch (err: any) {
      showAlert(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(f: VaultFile) {
    if (!(await showConfirm(`Delete "${f.name}"? This cannot be undone.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/files/${f.id}`, { method: 'DELETE' });
      setFiles(prev => prev ? prev.filter(x => x.id !== f.id) : prev);
    } catch (err: any) {
      showAlert(err.message || 'Could not delete this document.');
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Your ID"
        titleEm="documents"
        subtitle="Your own identity documents, stored in your personal Drive folder."
      />

      <SectionCard title="My ID Documents" padded={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', fontSize: 12.5, color: 'var(--ink2)', margin: 16 }}>
          <Icon name="shield" size={15} style={{ flexShrink: 0, color: 'var(--teal)' } as React.CSSProperties} />
          <span>Stored in your own Drive folder, visible only to you and your workspace admins — the same access rules as every other document in this workspace.</span>
        </div>

        {files === null && <div style={{ padding: '20px 18px', textAlign: 'center', color: 'var(--ink4)', fontSize: 12.5 }}>Loading…</div>}
        {files?.length === 0 && <div style={{ padding: '20px 18px', textAlign: 'center', color: 'var(--ink4)', fontSize: 12.5 }}>No documents yet.</div>}
        {files?.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderTop: '1px solid var(--border)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
              <Icon name="fileText" size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{fmtSize(f.size)} · Uploaded {fmtDate(f.created_at)}</div>
            </div>
            <button type="button" title="Download" onClick={() => apiDownload(`/v1/files/${f.id}/download`, f.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--teal)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
              <Icon name="download" size={14} />
            </button>
            <button type="button" title="Delete" onClick={() => handleDelete(f)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--red)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}

        <div style={{ padding: 16 }}>
          <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || !folder}
            style={{ width: '100%', height: 42, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 700, borderRadius: 10, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: uploading || !folder ? 0.6 : 1 }}>
            <Icon name="plusCircle" size={14} /> {uploading ? `Uploading… ${uploadPct}%` : 'Upload Document'}
          </button>
        </div>
      </SectionCard>
    </div>
  );
};

export default OndiVault;
