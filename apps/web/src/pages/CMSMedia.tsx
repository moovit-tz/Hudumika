import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';
import type { CmsMedia } from '@hudumika/types';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const UNFILED = '__unfiled__';

/**
 * A real, standalone Media library — every upload lives here, independent
 * of any one page/post editor. Real upload/list/delete, plus §21-22's own
 * three closures: a folder per item (one flat label, not a real tree — a
 * tenant's library is small enough that this is the real, useful scope), a
 * comma-separated tags field (matching CmsPost.tags' own established
 * convention rather than inventing a new array type), and a real WebP
 * thumbnail generated on upload — the grid renders `thumbnail_url` where
 * one exists rather than the full original, a real load-time win once a
 * library has more than a handful of images.
 */
export function CMSMedia() {
  const [items, setItems] = useState<CmsMedia[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>(''); // '' = all
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load(folder = activeFolder) {
    const q = folder === UNFILED ? '?folder=' : folder ? `?folder=${encodeURIComponent(folder)}` : '';
    apiFetch(`/v1/cms/media${q}`).then(setItems).catch(() => setItems([]));
  }
  function loadFolders() {
    apiFetch('/v1/cms/media/folders').then(setFolders).catch(() => setFolders([]));
  }
  useEffect(() => { load(); loadFolders(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(activeFolder); }, [activeFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const media: CmsMedia = await apiFetch('/v1/cms/media', { method: 'POST', body: form });
        setItems(prev => (prev ?? []).find(m => m.id === media.id) ? prev : [media, ...(prev ?? [])]);
      }
    } catch (e: any) {
      showAlert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(m: CmsMedia) {
    if (!(await showConfirm(`Delete "${m.filename}"? Any page, post or entry already using it will show a broken image.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/cms/media/${m.id}`, { method: 'DELETE' });
      setItems(prev => (prev ?? []).filter(x => x.id !== m.id));
    } catch (e: any) {
      showAlert(`Failed to delete: ${e.message}`);
    }
  }

  async function handleCopyUrl(m: CmsMedia) {
    const absolute = new URL(m.url, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(absolute);
      showAlert('Image URL copied.');
    } catch {
      showAlert(absolute);
    }
  }

  async function handleEditFolder(m: CmsMedia) {
    const value = await showPrompt('Move to folder — leave blank to unfile it.', { title: 'Folder', defaultValue: m.folder || '', placeholder: 'e.g. Products' });
    if (value === null) return;
    try {
      const updated: CmsMedia = await apiFetch(`/v1/cms/media/${m.id}`, { method: 'PATCH', body: JSON.stringify({ folder: value || null }) });
      setItems(prev => (prev ?? []).map(x => x.id === m.id ? updated : x).filter(x => !activeFolder || (activeFolder === UNFILED ? !x.folder : x.folder === activeFolder)));
      loadFolders();
    } catch (e: any) {
      showAlert(`Failed to update folder: ${e.message}`);
    }
  }

  async function handleEditTags(m: CmsMedia) {
    const value = await showPrompt('Tags, comma-separated — leave blank to remove them all.', { title: 'Tags', defaultValue: m.tags || '', placeholder: 'e.g. hero, summer-2026' });
    if (value === null) return;
    try {
      const updated: CmsMedia = await apiFetch(`/v1/cms/media/${m.id}`, { method: 'PATCH', body: JSON.stringify({ tags: value || null }) });
      setItems(prev => (prev ?? []).map(x => x.id === m.id ? updated : x));
    } catch (e: any) {
      showAlert(`Failed to update tags: ${e.message}`);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Media']}
        titlePlain="Your"
        titleEm="media"
        subtitle="Every image uploaded through this CMS — browse, organize into folders, copy a link, or upload something new. Insert one into a page or post from its own editor."
        actions={
          <>
            <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
          </>
        }
      />

      {folders.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 24px 0' }}>
          {[{ label: 'All', value: '' }, { label: 'Unfiled', value: UNFILED }, ...folders.map(f => ({ label: f, value: f }))].map(opt => (
            <button key={opt.value} onClick={() => setActiveFolder(opt.value)}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${activeFolder === opt.value ? 'var(--teal)' : 'var(--border)'}`,
                background: activeFolder === opt.value ? 'var(--teal-l, var(--bg))' : 'var(--white)',
                color: activeFolder === opt.value ? 'var(--teal)' : 'var(--ink2)', fontWeight: activeFolder === opt.value ? 700 : 500,
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
        {items === null ? <SectionLoading /> : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            {activeFolder ? 'Nothing in this folder yet.' : 'No images yet — upload one above, or insert one from inside a page or post editor.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {items.map(m => (
              <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', aspectRatio: '1', background: 'var(--bg)', overflow: 'hidden' }}>
                  <img src={m.thumbnail_url || m.url} alt={m.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </a>
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.filename}>{m.filename}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtSize(m.size)} · {fmtDate(m.created_at)}</div>
                  <button onClick={() => handleEditFolder(m)} title="Move to folder"
                    style={{ fontSize: 10.5, color: m.folder ? 'var(--teal)' : 'var(--ink3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, textAlign: 'left' }}>
                    <Icon name="folder" size={10} /> {m.folder || 'Unfiled'}
                  </button>
                  <button onClick={() => handleEditTags(m)} title="Edit tags"
                    style={{ fontSize: 10.5, color: m.tags ? 'var(--ink2)' : 'var(--ink3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Icon name="tag" size={10} /> {m.tags || 'Add tags'}
                  </button>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button onClick={() => handleCopyUrl(m)} title="Copy URL" style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 0', cursor: 'pointer', color: 'var(--ink2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="link" size={12} />
                    </button>
                    <button onClick={() => handleDelete(m)} title="Delete" style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 0', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash2" size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
