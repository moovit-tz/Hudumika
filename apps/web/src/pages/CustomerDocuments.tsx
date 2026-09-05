import React, { useState, useEffect, useRef } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

/* ── File type → icon/colour — same mapping as the staff-side Customers.tsx
   Documents tab, kept as its own small copy rather than a shared import
   since this page's data/actions are otherwise unrelated to that one. ── */
const FILE_TYPE_STYLE: Record<string, { icon: IconName; color: string; bg: string }> = {
  pdf:  { icon: 'file',     color: 'var(--red)',    bg: 'var(--red-l)'    },
  doc:  { icon: 'fileText', color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  docx: { icon: 'fileText', color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  xls:  { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  xlsx: { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  csv:  { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  zip:  { icon: 'briefcase',color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  png:  { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  jpg:  { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  jpeg: { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  webp: { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
};
function fileTypeStyle(type: string) {
  return FILE_TYPE_STYLE[(type || '').toLowerCase()] ?? { icon: 'file' as IconName, color: 'var(--ink3)', bg: 'var(--bg)' };
}

/**
 * A customer's own document list — every file a staff member has linked to
 * their account, plus anything they've uploaded themselves. Backed by the
 * same cloud_files store as the internal Drive app, but strictly scoped:
 * this used to mount the full internal FileManager with no customer/entity
 * filtering at all, so a customer login could browse the whole tenant's
 * Drive (every folder, every other customer's files) by guessing a
 * drive_id. GET/POST/DELETE /v1/files now force this scope server-side for
 * a CUSTOMER-role login regardless of what this page sends, but the page
 * itself stays deliberately narrow — no folders, no move/share/trash —
 * since none of that applies to a single flat list of "my documents".
 */
export const CustomerDocuments: React.FC = () => {
  usePageSEO('Documents', 'Files your clearing agent has shared with you, and anything you upload.');
  const [files, setFiles]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkedOrg, setLinkedOrg] = useState<{ id: string; name: string } | null>(null);
  const [shareFile, setShareFile] = useState<any | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);

  const load = () => {
    setLoading(true); setLoadError(false);
    apiFetch('/v1/files')
      .then((rows: any[]) => setFiles(Array.isArray(rows) ? rows : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    apiFetch('/v1/files/share-targets').then(res => setLinkedOrg(res?.organization ?? null)).catch(() => {});
  }, []);

  const isSharedWithOrg = (f: any) => linkedOrg && (f.shared ?? []).some((s: any) => s.principal_type === 'organization' && s.principal_id === linkedOrg.id);

  async function handleToggleOrgShare(enabled: boolean) {
    if (!shareFile || !linkedOrg || sharingBusy) return;
    setSharingBusy(true);
    try {
      const existing = ((shareFile.shared ?? []) as any[]).filter(s => !(s.principal_type === 'organization' && s.principal_id === linkedOrg.id));
      const next = enabled
        ? [...existing, { name: linkedOrg.name, role: 'Viewer', principal_type: 'organization', principal_id: linkedOrg.id }]
        : existing;
      await apiFetch(`/v1/files/${shareFile.id}/share`, { method: 'PUT', body: JSON.stringify({ shared: next }) });
      setFiles(prev => prev.map(f => f.id === shareFile.id ? { ...f, shared: next } : f));
      setShareFile((prev: any) => prev ? { ...prev, shared: next } : prev);
    } catch (err: any) {
      showAlert(err.message || 'Could not update sharing');
    } finally {
      setSharingBusy(false);
    }
  }

  async function handleUpload(fileList: File[]) {
    if (!fileList.length) return;
    setUploading(true);
    try {
      for (const f of fileList) {
        const fd = new FormData();
        fd.append('file', f);
        await apiFetch('/v1/files/upload', { method: 'POST', body: fd });
      }
      load();
    } catch (err: any) {
      showAlert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(f: any) {
    if (!(await showConfirm(`Remove "${f.name}"?`, { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/files/${f.id}`, { method: 'DELETE' });
      setFiles(prev => prev.filter(x => x.id !== f.id));
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove file');
    }
  }

  return (
    <div style={{ fontFamily: 'var(--font)', paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Documents</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink3)' }}>
              {loading ? 'Loading…' : `${files.length} file${files.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: 'none', background: uploading ? 'var(--ink3)' : 'hsl(var(--primary))', color: uploading ? '#fff' : 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            <Icon name="upload" size={14} strokeWidth={2} />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { const fl = Array.from(e.target.files || []); e.target.value = ''; handleUpload(fl); }} />
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, height: 64 }} />
          ))
        ) : loadError ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="alertCircle" size={36} color="var(--red)" />
            <p style={{ color: 'var(--ink2)', fontSize: 14, margin: '12px 0 4px', fontWeight: 600 }}>Couldn't load your documents</p>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px' }}>Check your connection and try again.</p>
            <button type="button" onClick={load} style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
              Retry
            </button>
          </div>
        ) : files.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="folder" size={36} color="var(--ink3)" />
            <p style={{ color: 'var(--ink3)', fontSize: 14, margin: '12px 0 4px' }}>No documents yet</p>
            <p style={{ color: 'var(--ink3)', fontSize: 12.5, margin: 0 }}>Files your agent shares with you will appear here</p>
          </div>
        ) : (
          files.map(f => {
            const ft = fileTypeStyle(f.type);
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={ft.icon} size={17} color={ft.color} strokeWidth={1.75} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
                    {f.size != null ? `${(f.size / 1024).toFixed(1)} KB · ` : ''}{new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                {f.entity_type === 'shipment' && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Shipment
                  </span>
                )}
                {linkedOrg && (
                  <button type="button" title="Share" aria-label="Share" onClick={() => setShareFile(f)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: isSharedWithOrg(f) ? 'var(--teal-l)' : 'var(--bg)', border: 'none', borderRadius: 8, color: isSharedWithOrg(f) ? 'var(--teal)' : 'var(--ink3)', cursor: 'pointer', flexShrink: 0 }}>
                    <Icon name="userPlus" size={15} />
                  </button>
                )}
                <button type="button" title="Download" aria-label="Download"
                  onClick={() => apiDownload(`/v1/files/${f.id}/download`, f.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'var(--bg)', border: 'none', borderRadius: 8, color: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }}>
                  <Icon name="download" size={15} />
                </button>
                <button type="button" title="Remove" aria-label="Remove" onClick={() => handleDelete(f)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'var(--bg)', border: 'none', borderRadius: 8, color: 'var(--ink3)', cursor: 'pointer', flexShrink: 0 }}>
                  <Icon name="x" size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {shareFile && linkedOrg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShareFile(null); }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Share</span>
              <button type="button" onClick={() => setShareFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={18} color="var(--ink3)" />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 0, marginBottom: 18, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shareFile.name}
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: sharingBusy ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={isSharedWithOrg(shareFile)} disabled={sharingBusy}
                onChange={e => handleToggleOrgShare(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Also visible to <strong>{linkedOrg.name}</strong></span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
