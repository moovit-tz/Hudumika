import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCloud } from '../../shells/cloud-context.js';
import type { CloudFile } from '../../shells/cloud-context.js';
import { fmtSize, fmtDate } from './lib/format.js';
import { fileTypeStyle, previewKind } from './lib/fileTypeStyle.js';
import { usePreviewBlob } from './lib/usePreviewBlob.js';
import { PersonAvatar } from './components/PersonAvatar.js';

interface ActivityEvent {
  id: string | number;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  actor_name: string | null;
}

interface FileComment {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface FileVersion {
  id: string;
  storage_key: string;
  size: number | null;
  mime_type: string | null;
  uploaded_by_name: string;
  created_at: string;
}

/** domain_events rows this route can actually emit (files.routes.ts) — icon +
 *  human label per type. Anything not in this map (should not happen, but a
 *  future event type could land before this map is updated) falls back to a
 *  generic "activity" icon + the raw event_type so nothing silently vanishes. */
const EVENT_META: Record<string, { icon: IconName; label: (p: Record<string, any>) => string }> = {
  'file.uploaded':            { icon: 'upload',    label: () => 'Uploaded' },
  'file.renamed':             { icon: 'edit',      label: p => `Renamed to "${p.name}"` },
  'file.starred':             { icon: 'star',      label: p => p.starred ? 'Starred' : 'Removed from starred' },
  'file.moved':               { icon: 'folder',    label: () => 'Moved' },
  'file.trashed':             { icon: 'trash',     label: () => 'Moved to Trash' },
  'file.restored':            { icon: 'refresh',   label: () => 'Restored from Trash' },
  'file.shared':              { icon: 'userPlus',  label: p => (p.shared ?? []).length ? `Shared with ${p.shared.map((s: any) => s.name).join(', ')}` : 'Sharing updated' },
  'file.permanently_deleted': { icon: 'trash',     label: () => 'Permanently deleted' },
  'file.commented':           { icon: 'edit',      label: () => 'Commented' },
  'file.version_uploaded':    { icon: 'upload',    label: () => 'New version uploaded' },
  'file.version_restored':    { icon: 'refresh',   label: () => 'Restored a previous version' },
};

const CAN_MODERATE_COMMENTS = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN']);

export function PreviewPanel({ item, onClose, onStar, onDownload, onDelete, onShare, onExpand }: {
  item: CloudFile;
  onClose: () => void;
  onStar: (item: CloudFile) => void;
  onDownload: (item: CloudFile) => void;
  onDelete: (item: CloudFile) => void;
  onShare: (item: CloudFile) => void;
  onExpand: (item: CloudFile) => void;
}) {
  const { user } = useAuth();
  const { loadData, loadStorageQuota } = useCloud();
  const [tab, setTab] = useState<'details' | 'activity' | 'comments'>('details');
  const cfg = fileTypeStyle(item.type);
  const folderColor = item.color ?? '#f59e0b';
  const kind = previewKind(item.type);
  const { url: previewUrl, loading: previewLoading } = usePreviewBlob(kind ? item.id : null);

  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Real server-backed trail (domain_events, via GET /v1/activity/document/
  // :fileId) — replaces the old synthesized feed that just reflected
  // whatever fields the item already had (shared/updated_at/created_at),
  // which wasn't an actual history and forgot everything on reload.
  useEffect(() => {
    if (tab !== 'activity') return;
    let cancelled = false;
    setActivityLoading(true);
    apiFetch(`/v1/activity/document/${item.id}`)
      .then((rows: ActivityEvent[]) => { if (!cancelled) setActivity(rows); })
      .catch(() => { if (!cancelled) setActivity([]); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [tab, item.id]);

  const [comments, setComments] = useState<FileComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  function loadComments() {
    setCommentsLoading(true);
    apiFetch(`/v1/files/${item.id}/comments`)
      .then((res: { data: FileComment[] }) => setComments(res.data))
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }

  useEffect(() => {
    if (tab !== 'comments') return;
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, item.id]);

  async function postComment() {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    try {
      await apiFetch(`/v1/files/${item.id}/comments`, { method: 'POST', body: JSON.stringify({ content: newComment.trim() }) });
      setNewComment('');
      loadComments();
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(commentId: string) {
    if (!editingContent.trim()) return;
    await apiFetch(`/v1/files/${item.id}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ content: editingContent.trim() }) });
    setEditingId(null);
    loadComments();
  }

  async function deleteComment(commentId: string) {
    await apiFetch(`/v1/files/${item.id}/comments/${commentId}`, { method: 'DELETE' });
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);

  function loadVersions() {
    setVersionsLoading(true);
    apiFetch(`/v1/files/${item.id}/versions`)
      .then((res: { data: FileVersion[] }) => setVersions(res.data))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));
  }

  // Part of the "details" tab (per the plan), not its own tab — versions
  // only apply to files, and there's no point fetching for a folder.
  useEffect(() => {
    if (tab !== 'details' || item.type === 'folder') return;
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, item.id, item.type]);

  async function handleVersionFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingVersion(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch(`/v1/files/${item.id}/versions`, { method: 'POST', body: form });
      loadVersions();
      loadData(); // content/size changed under item.id — refresh the shared file list too
      loadStorageQuota();
    } finally {
      setUploadingVersion(false);
    }
  }

  async function restoreVersion(versionId: string) {
    setRestoringId(versionId);
    try {
      await apiFetch(`/v1/files/${item.id}/versions/${versionId}/restore`, { method: 'POST' });
      loadVersions();
      loadData();
      loadStorageQuota();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--white)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Details</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--r-sm)', color: 'var(--ink3)' }}><Icon name="close" size={16} /></button>
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
        {kind && previewUrl ? (
          <div
            onClick={() => onExpand(item)}
            title="Click to view full screen"
            style={{ width: '100%', height: 160, borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}
          >
            {kind === 'image' && <img src={previewUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            {kind === 'pdf' && <iframe src={previewUrl} title={item.name} style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} />}
            {kind === 'video' && <video src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />}
          </div>
        ) : kind && previewLoading ? (
          <div style={{ width: '100%', height: 160, borderRadius: 'var(--r)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Loading preview…</div>
        ) : item.type === 'folder' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 'var(--r)', background: `${folderColor}22` }}><Icon name="folder" size={32} color={folderColor} /></span>
        ) : (
          <FeaturedIcon variant={cfg.variant} size="xl"><Icon name={cfg.icon} size={28} /></FeaturedIcon>
        )}
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all', lineHeight: 1.4 }}>{item.name}</div>
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
        {item.type !== 'folder' && (
          <button onClick={() => onDownload(item)} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
            <Icon name="download" size={13} /> Download
          </button>
        )}
        <button onClick={() => onShare(item)} style={{ flex: item.type === 'folder' ? 1 : undefined, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--ds-btn-py-sm) 10px', cursor: 'pointer', color: 'var(--teal)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="userPlus" size={14} color="var(--teal)" />
        </button>
        <button onClick={() => onStar(item)} style={{ background: item.starred ? 'var(--gold-l)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--ds-btn-py-sm) 10px', cursor: 'pointer', color: item.starred ? 'var(--gold)' : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="star" size={14} color={item.starred ? 'var(--gold)' : 'var(--ink3)'} />
        </button>
        <button onClick={() => onDelete(item)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--ds-btn-py-sm) 10px', cursor: 'pointer', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="trash" size={14} color="var(--red)" />
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['details', 'activity', 'comments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: 'var(--ds-btn-py) 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize',
              color: tab === t ? 'var(--teal)' : 'var(--ink3)', borderBottom: tab === t ? '2px solid var(--teal)' : '2px solid transparent', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25,
            }}
          >{t}</button>
        ))}
      </div>

      {tab === 'details' ? (
        <>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Owner', value: item.owner_name },
              { label: 'Size', value: fmtSize(item.size) },
              { label: 'Type', value: cfg.label },
              { label: 'Created', value: fmtDate(item.created_at) },
              { label: 'Modified', value: fmtDate(item.updated_at) },
              ...(item.type === 'folder' ? [{ label: 'Files', value: `${item.file_count} files` }] : []),
              ...(item.description ? [{ label: 'Description', value: item.description }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>

          {item.type !== 'folder' && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Version history</span>
                <button
                  onClick={() => versionInputRef.current?.click()}
                  disabled={uploadingVersion}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--teal)', padding: 0 }}
                >
                  {uploadingVersion ? 'Uploading…' : '+ Upload new version'}
                </button>
                <input ref={versionInputRef} type="file" onChange={handleVersionFileChosen} style={{ display: 'none' }} />
              </div>
              {versionsLoading && (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading…</div>
              )}
              {!versionsLoading && versions.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No prior versions — this is the only one on record.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {versions.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FeaturedIcon variant="gray" size="sm" shape="circle"><Icon name="fileText" size={12} /></FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--ink)' }}>{fmtDate(v.created_at)} · {fmtSize(v.size)}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{v.uploaded_by_name}</div>
                    </div>
                    <button
                      onClick={() => apiDownload(`/v1/files/${item.id}/versions/${v.id}/download`, item.name)}
                      title="Download this version"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}
                    ><Icon name="download" size={13} /></button>
                    <button
                      onClick={() => restoreVersion(v.id)}
                      disabled={restoringId === v.id}
                      title="Restore this version"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--teal)', padding: '0 2px' }}
                    >{restoringId === v.id ? '…' : 'Restore'}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(item.shared ?? []).length > 0 && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 10 }}>Shared with</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(item.shared ?? []).map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PersonAvatar name={p.name} size={28} />
                    <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{p.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : tab === 'activity' ? (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activityLoading && (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>Loading…</div>
          )}
          {!activityLoading && activity.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>No activity recorded yet</div>
          )}
          {activity.map(a => {
            const meta = EVENT_META[a.event_type];
            return (
              <div key={a.id} style={{ display: 'flex', gap: 10 }}>
                <FeaturedIcon variant="brand" size="sm" shape="circle"><Icon name={meta?.icon ?? 'activity'} size={13} /></FeaturedIcon>
                <div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                    {meta ? meta.label(a.payload) : a.event_type}
                    {a.actor_name && <span style={{ color: 'var(--ink3)' }}> — {a.actor_name}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{fmtDate(a.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {commentsLoading && (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>Loading…</div>
            )}
            {!commentsLoading && comments.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>No comments yet</div>
            )}
            {comments.map(c => {
              const canModify = c.author_id === user?.id || CAN_MODERATE_COMMENTS.has(user?.role ?? '');
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                  <PersonAvatar name={c.author_name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{c.author_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtDate(c.created_at)}</span>
                    </div>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        <textarea
                          value={editingContent}
                          onChange={e => setEditingContent(e.target.value)}
                          autoFocus
                          style={{ fontSize: 12.5, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', resize: 'vertical', minHeight: 50, fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(c.id)} className="btn btn-primary btn-xs">Save</button>
                          <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink3)' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.content}</div>
                        {canModify && (
                          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            <button onClick={() => { setEditingId(c.id); setEditingContent(c.content); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink3)', padding: 0 }}>Edit</button>
                            <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', padding: 0 }}>Delete</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
            />
            <button onClick={postComment} disabled={!newComment.trim() || posting} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
              {posting ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
