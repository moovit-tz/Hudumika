import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { RichTextEditor } from './RichTextEditor.js';

export interface EmailSignature {
  id: string;
  name: string;
  body_html: string;
  is_default_new: boolean;
  is_default_reply: boolean;
}

/**
 * Multiple named, rich-content signatures with collapsible cards and image resizing.
 * Lives in the Settings "General" tab; `onChange` reports the latest list back up so
 * EmailApp.tsx's signedBody() always resolves against fresh data.
 */
export function SignatureManager({ onChange }: { onChange?: (sigs: EmailSignature[]) => void }) {
  const [signatures, setSignatures] = useState<EmailSignature[] | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftDefaultNew, setDraftDefaultNew] = useState(false);
  const [draftDefaultReply, setDraftDefaultReply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    apiFetch('/v1/email/signatures').then(res => {
      const rows = Array.isArray(res) ? res : [];
      setSignatures(rows);
      onChange?.(rows);
      // Auto-expand first signature if not already configured
      setExpandedIds(prev => {
        if (Object.keys(prev).length === 0 && rows.length > 0) {
          return { [rows[0].id]: true };
        }
        return prev;
      });
    }).catch(() => setSignatures([]));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(id: string) {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function startNew() {
    setEditingId('new');
    setDraftName(`Signature ${(signatures?.length ?? 0) + 1}`);
    setDraftHtml('');
    setDraftDefaultNew((signatures?.length ?? 0) === 0);
    setDraftDefaultReply((signatures?.length ?? 0) === 0);
  }

  function startEdit(sig: EmailSignature) {
    setEditingId(sig.id);
    setDraftName(sig.name);
    setDraftHtml(sig.body_html);
    setDraftDefaultNew(sig.is_default_new);
    setDraftDefaultReply(sig.is_default_reply);
  }

  async function saveDraft() {
    if (!draftName.trim()) return showAlert('Give this signature a name.');
    setSaving(true);
    try {
      let savedSig: any = null;
      if (editingId === 'new') {
        savedSig = await apiFetch('/v1/email/signatures', {
          method: 'POST',
          body: JSON.stringify({ name: draftName.trim(), bodyHtml: draftHtml }),
        });
      } else if (editingId) {
        savedSig = await apiFetch(`/v1/email/signatures/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: draftName.trim(), bodyHtml: draftHtml }),
        });
      }

      const sigId = savedSig?.id || editingId;
      if (sigId && sigId !== 'new') {
        if (draftDefaultNew) await apiFetch(`/v1/email/signatures/${sigId}/set-default`, { method: 'POST', body: JSON.stringify({ context: 'new' }) }).catch(() => {});
        if (draftDefaultReply) await apiFetch(`/v1/email/signatures/${sigId}/set-default`, { method: 'POST', body: JSON.stringify({ context: 'reply' }) }).catch(() => {});
      }

      setEditingId(null);
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to save signature.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSig(id: string) {
    try {
      await apiFetch(`/v1/email/signatures/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to delete signature.');
    }
  }

  async function setDefault(id: string, context: 'new' | 'reply') {
    try {
      await apiFetch(`/v1/email/signatures/${id}/set-default`, { method: 'POST', body: JSON.stringify({ context }) });
      load();
    } catch (e: any) {
      showAlert(e.message || 'Failed to set default.');
    }
  }

  async function uploadImage(file: File): Promise<string | null> {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/v1/email/signatures/images', { method: 'POST', body: form });
      return res.url as string;
    } catch (e: any) {
      showAlert(e.message || 'Image upload failed.');
      return null;
    }
  }

  if (signatures === null) return <p className="em-settings-hint">Loading signatures…</p>;

  return (
    <div className="em-sig-manager">
      {/* Signature List (Collapsible Cards) */}
      <div className="em-sig-list">
        {signatures.map(sig => {
          const isExpanded = Boolean(expandedIds[sig.id]);
          return (
            <div key={sig.id} className={`em-sig-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
              <div className="em-sig-card-header" onClick={() => toggleExpand(sig.id)}>
                <button
                  type="button"
                  className="em-sig-toggle-btn"
                  onClick={e => { e.stopPropagation(); toggleExpand(sig.id); }}
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Collapse signature' : 'Expand signature'}
                >
                  <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={15} />
                </button>

                <div className="em-sig-header-info">
                  <span className="em-sig-name">{sig.name}</span>
                  <div className="em-sig-badges">
                    {sig.is_default_new && <Badge variant="brand">New emails</Badge>}
                    {sig.is_default_reply && <Badge variant="info">Replies</Badge>}
                  </div>
                </div>

                <div className="em-sig-header-actions" onClick={e => e.stopPropagation()}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(sig)}>
                    Edit
                  </button>
                  <button type="button" className="em-icon-btn em-icon-btn--ghost em-btn-danger" onClick={() => deleteSig(sig.id)} title="Delete signature">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>

              {/* Collapsible Body */}
              {isExpanded && (
                <div className="em-sig-card-body">
                  <div className="em-sig-preview-wrapper">
                    <div
                      className="em-signature-preview em-sig-rendered-box"
                      dangerouslySetInnerHTML={{ __html: sig.body_html || '<em style="color:var(--ink3)">Empty signature</em>' }}
                    />
                  </div>
                  <div className="em-sig-footer-actions">
                    <button
                      type="button"
                      className={`btn btn-sm ${sig.is_default_new ? 'btn-outline disabled' : 'btn-secondary'}`}
                      onClick={() => !sig.is_default_new && setDefault(sig.id, 'new')}
                      disabled={sig.is_default_new}
                    >
                      {sig.is_default_new ? '✓ Default for new emails' : 'Set as default for new emails'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${sig.is_default_reply ? 'btn-outline disabled' : 'btn-secondary'}`}
                      onClick={() => !sig.is_default_reply && setDefault(sig.id, 'reply')}
                      disabled={sig.is_default_reply}
                    >
                      {sig.is_default_reply ? '✓ Default for replies' : 'Set as default for replies'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {signatures.length === 0 && editingId === null && (
          <div className="em-sig-empty">
            <p className="em-settings-hint">No email signatures created yet.</p>
          </div>
        )}
      </div>

      {/* Signature Editor (Collapsible Drawer / Box) */}
      {editingId !== null ? (
        <div className="em-sig-editor-card">
          <div className="em-sig-editor-header">
            <span className="em-sig-editor-title">
              {editingId === 'new' ? 'Create New Signature' : `Edit Signature: ${draftName || 'Untitled'}`}
            </span>
            <button type="button" className="em-icon-btn em-icon-btn--ghost" onClick={() => setEditingId(null)} title="Close editor">
              <Icon name="x" size={14} />
            </button>
          </div>

          <div className="em-sig-editor-fields">
            <div className="em-settings-field">
              <label className="em-field-label">Signature Name</label>
              <input
                className="em-settings-input"
                value={draftName}
                placeholder="e.g. Work Signature, Sales Banner"
                onChange={e => setDraftName(e.target.value)}
              />
            </div>

            <div className="em-settings-field">
              <label className="em-field-label">Signature Content &amp; Logo</label>
              <RichTextEditor
                value={draftHtml}
                onChange={setDraftHtml}
                placeholder="Type your signature here. Click inserted images to resize to Small, Medium, Large, or Fit Width…"
                onInsertImage={() => new Promise<string | null>(resolve => {
                  const input = fileRef.current;
                  if (!input) return resolve(null);
                  input.onchange = async () => {
                    const file = input.files?.[0];
                    input.value = '';
                    resolve(file ? await uploadImage(file) : null);
                  };
                  input.click();
                })}
              />
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} />
            </div>

            <div className="em-sig-default-toggles">
              <label className="em-checkbox-label">
                <input
                  type="checkbox"
                  checked={draftDefaultNew}
                  onChange={e => setDraftDefaultNew(e.target.checked)}
                />
                <span>Set as default for new emails</span>
              </label>
              <label className="em-checkbox-label">
                <input
                  type="checkbox"
                  checked={draftDefaultReply}
                  onChange={e => setDraftDefaultReply(e.target.checked)}
                />
                <span>Set as default for replies and forwards</span>
              </label>
            </div>

            <div className="em-form-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveDraft} disabled={saving}>
                {saving ? 'Saving…' : 'Save Signature'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="em-sig-add-bar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={startNew}>
            <Icon name="plus" size={14} />
            <span>Create New Signature</span>
          </button>
        </div>
      )}
    </div>
  );
}
