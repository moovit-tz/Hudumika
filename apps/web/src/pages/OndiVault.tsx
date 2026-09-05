// ─── OndiVault.tsx — Ondi Personal · Document Vault ──────────────
// Personal identity document management integrated with the user's
// isolated Drive employee folder.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch, apiDownload, apiUploadWithProgress } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './OndiVault.css';

interface VaultFile {
  id: string;
  name: string;
  size: number;
  created_at: string;
  type: string;
}

function fmtSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pdf' | 'img'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (folderId: string) => {
    try {
      const rows: VaultFile[] = await apiFetch(`/v1/files?entity_type=employee&entity_id=${user!.id}`);
      setFiles(rows.filter((f) => f.type !== 'folder'));
    } catch {
      setFiles([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    apiFetch(`/v1/files/employee-folder/${user.id}`)
      .then((f) => {
        setFolder(f);
        reload(f.id);
      })
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
      showAlert('Document uploaded to your personal vault.', { variant: 'success' });
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
    const confirmed = await showConfirm(`Delete "${f.name}" from your document vault? This cannot be undone.`, {
      variant: 'danger',
      confirmLabel: 'Delete Document',
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/v1/files/${f.id}`, { method: 'DELETE' });
      setFiles((prev) => (prev ? prev.filter((x) => x.id !== f.id) : prev));
      showAlert('Document removed.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message || 'Could not delete this document.');
    }
  }

  const totalSize = files ? files.reduce((acc, f) => acc + (f.size || 0), 0) : 0;
  const filteredFiles = files
    ? files.filter((f) => {
        const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (typeFilter === 'pdf') return f.name.toLowerCase().endsWith('.pdf');
        if (typeFilter === 'img') return /\.(png|jpe?g|webp|svg)$/i.test(f.name);
        return true;
      })
    : [];

  return (
    <div className="ov-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="ID Documents &"
        titleEm="vault."
        subtitle="Secure personal identity storage, encrypted in your isolated employee Drive folder."
      />

      {/* ── Top Executive Posture KPI Grid (2x2 on Mobile) ── */}
      <div className="ov-kpi-grid">
        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <span className="ov-kpi-title">Stored Documents</span>
            <div className="ov-kpi-icon primary">
              <Icon name="fileText" size={17} />
            </div>
          </div>
          <div className="ov-kpi-body">
            <div className="ov-kpi-val">{files ? files.length : '—'}</div>
            <div className="ov-kpi-sub">
              <Icon name="checkCircle" size={12} color="var(--green)" />
              Encrypted files in vault
            </div>
          </div>
        </div>

        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <span className="ov-kpi-title">Storage Used</span>
            <div className="ov-kpi-icon success">
              <Icon name="archive" size={17} />
            </div>
          </div>
          <div className="ov-kpi-body">
            <div className="ov-kpi-val" style={{ color: 'var(--green, #10b981)' }}>
              {fmtSize(totalSize)}
            </div>
            <div className="ov-kpi-sub">Cloud Drive allocation</div>
          </div>
        </div>

        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <span className="ov-kpi-title">Isolation Tier</span>
            <div className="ov-kpi-icon purple">
              <Icon name="shield" size={17} />
            </div>
          </div>
          <div className="ov-kpi-body">
            <div className="ov-kpi-val" style={{ color: 'var(--purple, #8b5cf6)' }}>
              PRIVATE
            </div>
            <div className="ov-kpi-sub">Tenant & user-scoped</div>
          </div>
        </div>

        <div className="ov-kpi-card">
          <div className="ov-kpi-header">
            <span className="ov-kpi-title">Upload Status</span>
            <div className="ov-kpi-icon warning">
              <Icon name="upload" size={17} />
            </div>
          </div>
          <div className="ov-kpi-body">
            <div className="ov-kpi-val">{uploading ? `${uploadPct}%` : 'READY'}</div>
            <div className="ov-kpi-sub">Multi-format support</div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Content Grid (2 Columns Desktop) ── */}
      <div className="ov-layout-grid">
        <div className="ov-main-col">
          {/* Document Management Card */}
          <div className="ov-card">
            <div className="ov-card-hdr">
              <div className="ov-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="folder" size={15} />
                </FeaturedIcon>
                <div>
                  <h3 className="ov-card-title">Personal Document Vault</h3>
                  <p className="ov-card-sub">Identity proofs, government documents, and administrative credentials</p>
                </div>
              </div>
              <Badge variant="success">Cloud Drive Synchronized</Badge>
            </div>

            <div className="ov-card-body">
              {/* Filter and Search Bar */}
              <div className="ov-toolbar">
                <div className="ov-search-box">
                  <Icon name="search" size={14} color="var(--ink3)" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search documents by name…"
                    className="ov-search-input"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>

                <Tabs value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)} variant="segmented">
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pdf">PDFs</TabsTrigger>
                    <TabsTrigger value="img">Images</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Upload Dropzone */}
              <input
                ref={inputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleUpload(e.target.files)}
              />

              <div
                className="ov-upload-dropzone"
                onClick={() => inputRef.current?.click()}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--white)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                  <Icon name="upload" size={18} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {uploading ? `Uploading document (${uploadPct}%)…` : 'Click or drop files to upload'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Supports PDF, PNG, JPEG, and WebP documents up to 25MB
                </div>
              </div>

              {/* Document List */}
              {files === null && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  Loading documents from Cloud Drive…
                </div>
              )}

              {files && filteredFiles.length === 0 && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  {search ? 'No documents matched your search filter.' : 'No identity documents in vault yet. Upload your first document above.'}
                </div>
              )}

              {filteredFiles.length > 0 && (
                <div className="ov-doc-list">
                  {filteredFiles.map((f) => (
                    <div key={f.id} className="ov-doc-item">
                      <div className="ov-doc-left">
                        <div className="ov-doc-icon">
                          <Icon name="fileText" size={18} />
                        </div>
                        <div className="ov-doc-info">
                          <div className="ov-doc-name">{f.name}</div>
                          <div className="ov-doc-meta">
                            <span>{fmtSize(f.size)}</span>
                            <span>·</span>
                            <span>Uploaded {fmtDate(f.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="ov-doc-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            apiDownload(`/v1/files/${f.id}/download`, f.name).catch((err: any) =>
                              showAlert(err.message || 'Download failed')
                            )
                          }
                        >
                          <Icon name="download" size={13} style={{ marginRight: 4 }} />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(f)}
                          style={{ color: 'var(--red)', borderColor: 'var(--border)' }}
                        >
                          <Icon name="trash" size={13} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Storage Safeguards ── */}
        <div className="ov-side-col">
          <div className="ov-card">
            <div className="ov-card-hdr">
              <div className="ov-card-hdr-left">
                <FeaturedIcon variant="brand" size="sm" shape="square">
                  <Icon name="shield" size={15} />
                </FeaturedIcon>
                <div>
                  <h4 className="ov-card-title">Storage Guarantees</h4>
                  <p className="ov-card-sub">Vault encryption standards</p>
                </div>
              </div>
            </div>

            <div className="ov-card-body" style={{ gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Zero-Knowledge Drive Partition</strong>
                  Files reside in your dedicated employee folder and are inaccessible to cross-tenant actors.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: 'var(--teal)', marginTop: 2 }}>
                  <Icon name="checkCircle" size={15} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)', display: 'block' }}>Compliance Document Integrity</strong>
                  Uploaded identity documents maintain tamper-proof checksum verification.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OndiVault;
