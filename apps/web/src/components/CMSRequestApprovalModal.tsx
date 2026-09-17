import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { SectionLoading } from './ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

interface Reviewer {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CMSRequestApprovalModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'page' | 'post' | 'entry';
  resourceId: string;
  resourceTitle: string;
  onRequested?: () => void;
}

export function CMSRequestApprovalModal({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  onRequested,
}: CMSRequestApprovalModalProps) {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loadingReviewers, setLoadingReviewers] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLoadingReviewers(true);
      apiFetch<Reviewer[]>('/v1/cms/reviewers')
        .then(res => {
          setReviewers(res ?? []);
          if (res && res.length > 0 && !assignedTo) {
            setAssignedTo(res[0].id);
          }
        })
        .catch(() => setReviewers([]))
        .finally(() => setLoadingReviewers(false));
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignedTo) {
      return showAlert('Please select a team reviewer.');
    }

    setSubmitting(true);
    try {
      await apiFetch('/v1/cms/approvals/request', {
        method: 'POST',
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          assigned_to: assignedTo,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          note: note.trim() || null,
        }),
      });

      showAlert('Approval request submitted. The reviewer has been notified.');
      onRequested?.();
      onClose();
    } catch (err: any) {
      showAlert(`Failed to submit approval request: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 'min(520px, 94vw)',
          padding: 0,
          overflow: 'hidden',
          background: 'var(--white)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--r-sm)',
                background: 'var(--teal-l)',
                color: 'var(--teal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="checkCircle" size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--navy)' }}>Request Content Approval</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                {resourceType.toUpperCase()}: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{resourceTitle}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loadingReviewers ? (
            <SectionLoading />
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Assign Reviewer <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                {reviewers.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No active team members found.</div>
                ) : (
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger className="input-field" style={{ fontSize: 13 }}>
                      <SelectValue placeholder="Choose reviewer…" />
                    </SelectTrigger>
                    <SelectContent>
                      {reviewers.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.role}) · {r.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Review Due Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="input-field"
                  style={{ fontSize: 12.5 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Note to Reviewer (Optional)
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Context for the reviewer, key changes to check, or compliance concerns…"
                  rows={3}
                  className="input-field"
                  style={{ fontSize: 12.5, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={onClose} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || !assignedTo}>
                  {submitting ? 'Submitting…' : 'Submit for Review'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
