import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { SectionLoading } from './ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import type { CmsContentComment, CreateCmsContentCommentInput } from '@hudumika/types';

interface CMSCollaborationDrawerProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'page' | 'post' | 'entry';
  resourceId: string;
  resourceTitle?: string;
  activeBlockId?: string | null;
}

export function CMSCollaborationDrawer({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  activeBlockId,
}: CMSCollaborationDrawerProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CmsContentComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterResolved, setFilterResolved] = useState<'all' | 'open' | 'resolved'>('open');

  function load() {
    if (!resourceId) return;
    setLoading(true);
    apiFetch<CmsContentComment[]>(`/v1/cms/comments/editorial?resource_type=${resourceType}&resource_id=${resourceId}`)
      .then(res => setComments(res ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open && resourceId) {
      load();
    }
  }, [open, resourceId, resourceType]);

  async function handlePostComment(parentId?: string) {
    const text = parentId ? replyText : newComment;
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      const payload: CreateCmsContentCommentInput = {
        resource_type: resourceType,
        resource_id: resourceId,
        parent_id: parentId || null,
        block_id: parentId ? null : (activeBlockId || null),
        content: text.trim(),
      };

      await apiFetch('/v1/cms/comments/editorial', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (parentId) {
        setReplyText('');
        setReplyingTo(null);
      } else {
        setNewComment('');
      }
      load();
    } catch (err: any) {
      showAlert(`Failed to post comment: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleResolved(comment: CmsContentComment) {
    try {
      await apiFetch(`/v1/cms/comments/editorial/${comment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_resolved: !comment.resolved }),
      });
      load();
    } catch (err: any) {
      showAlert(`Failed to update comment: ${err.message}`);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await apiFetch(`/v1/cms/comments/editorial/${commentId}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(`Failed to delete comment: ${err.message}`);
    }
  }

  if (!open) return null;

  const displayedComments = comments.filter(c => {
    if (filterResolved === 'open') return !c.resolved;
    if (filterResolved === 'resolved') return c.resolved;
    return true;
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 500,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="messageSquare" size={16} style={{ color: 'var(--teal)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Editorial Comments
            </h3>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Internal review on {resourceTitle || resourceType}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ padding: '8px 16px', background: 'var(--bg-muted)', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'open', label: 'Open' },
          { id: 'resolved', label: 'Resolved' },
          { id: 'all', label: 'All' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterResolved(tab.id as any)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              background: filterResolved === tab.id ? 'var(--surface)' : 'transparent',
              color: filterResolved === tab.id ? 'var(--teal)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Comments List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <SectionLoading />
        ) : displayedComments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
            <Icon name="message" size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <p style={{ fontSize: 13, margin: 0 }}>No {filterResolved === 'open' ? 'open' : ''} comments.</p>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Leave feedback or tag teammates below.</span>
          </div>
        ) : (
          displayedComments.map(c => (
            <div
              key={c.id}
              style={{
                background: c.resolved ? 'var(--bg-muted)' : 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
                opacity: c.resolved ? 0.75 : 1,
              }}
            >
              {/* Comment Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'var(--teal-l)',
                      color: 'var(--teal)',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {(c.author_name || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    {c.author_name || 'Team Member'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <button
                  onClick={() => handleToggleResolved(c)}
                  title={c.resolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: c.resolved ? '#059669' : 'var(--text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name={c.resolved ? 'checkCircle' : 'circle'} size={14} />
                  {c.resolved ? 'Resolved' : 'Resolve'}
                </button>
              </div>

              {/* Block tag if anchored */}
              {c.block_id && (
                <div style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="tag" size={10} />
                  Anchored to section: <code>{c.block_id}</code>
                </div>
              )}

              {/* Content */}
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, margin: '6px 0' }}>
                {c.content}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                  style={{ fontSize: 11, color: 'var(--teal)', background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {replyingTo === c.id ? 'Cancel Reply' : 'Reply'}
                </button>

                {c.author_id === user?.id && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                    title="Delete"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>

              {/* Replies */}
              {c.replies && c.replies.length > 0 && (
                <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--teal-l)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {c.replies.map(rep => (
                    <div key={rep.id} style={{ fontSize: 12, background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <strong style={{ color: 'var(--text)' }}>{rep.author_name || 'Author'}</strong>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {new Date(rep.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>{rep.content}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline Reply Input */}
              {replyingTo === c.id && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                    onKeyDown={e => { if (e.key === 'Enter') handlePostComment(c.id); }}
                  />
                  <button
                    onClick={() => handlePostComment(c.id)}
                    disabled={submitting || !replyText.trim()}
                    style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        {activeBlockId && (
          <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="paperclip" size={12} />
            Commenting on selected block: <strong>{activeBlockId}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add an internal comment or review note..."
            rows={2}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 13,
              resize: 'none',
              boxSizing: 'border-box',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handlePostComment();
              }
            }}
          />
          <button
            onClick={() => handlePostComment()}
            disabled={submitting || !newComment.trim()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--teal)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              opacity: !newComment.trim() ? 0.6 : 1,
            }}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
