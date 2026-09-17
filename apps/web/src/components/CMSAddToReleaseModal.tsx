import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { SectionLoading } from './ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import type { CmsRelease } from '@hudumika/types';

interface CMSAddToReleaseModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'page' | 'post' | 'entry';
  resourceId: string;
  resourceTitle: string;
  onAdded?: () => void;
}

export function CMSAddToReleaseModal({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  onAdded,
}: CMSAddToReleaseModalProps) {
  const [releases, setReleases] = useState<CmsRelease[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<string>('published');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newReleaseName, setNewReleaseName] = useState('');
  const [newReleaseDate, setNewReleaseDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLoadingReleases(true);
      apiFetch<CmsRelease[]>('/v1/cms/releases')
        .then(res => {
          const drafts = (res ?? []).filter((r: CmsRelease) => r.status === 'draft' || r.status === 'scheduled');
          setReleases(drafts);
          if (drafts.length > 0 && !selectedReleaseId) {
            setSelectedReleaseId(drafts[0].id);
          } else if (drafts.length === 0) {
            setIsCreatingNew(true);
          }
        })
        .catch(() => setReleases([]))
        .finally(() => setLoadingReleases(false));
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let releaseId = selectedReleaseId;

      if (isCreatingNew) {
        if (!newReleaseName.trim()) {
          setSubmitting(false);
          return showAlert('Please enter a name for the new release bundle.');
        }

        const createdRelease: CmsRelease = await apiFetch('/v1/cms/releases', {
          method: 'POST',
          body: JSON.stringify({
            name: newReleaseName.trim(),
            publish_at: newReleaseDate ? new Date(newReleaseDate).toISOString() : null,
          }),
        });
        releaseId = createdRelease.id;
      }

      if (!releaseId) {
        setSubmitting(false);
        return showAlert('Please select or create a release.');
      }

      await apiFetch(`/v1/cms/releases/${releaseId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          target_status: targetStatus || 'published',
        }),
      });

      showAlert('Content successfully bundled into release!');
      onAdded?.();
      onClose();
    } catch (err: any) {
      showAlert(`Failed to add to release: ${err.message}`);
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
              <Icon name="package" size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--navy)' }}>Add to Content Release</div>
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
          {loadingReleases ? (
            <SectionLoading />
          ) : (
            <>
              {releases.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: !isCreatingNew ? 600 : 400 }}>
                    <input
                      type="radio"
                      checked={!isCreatingNew}
                      onChange={() => setIsCreatingNew(false)}
                    />
                    Existing Release
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: isCreatingNew ? 600 : 400 }}>
                    <input
                      type="radio"
                      checked={isCreatingNew}
                      onChange={() => setIsCreatingNew(true)}
                    />
                    Create New Release
                  </label>
                </div>
              )}

              {!isCreatingNew && releases.length > 0 ? (
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Select Release Bundle
                  </label>
                  <Select value={selectedReleaseId} onValueChange={setSelectedReleaseId}>
                    <SelectTrigger className="input-field" style={{ fontSize: 13 }}>
                      <SelectValue placeholder="Choose release…" />
                    </SelectTrigger>
                    <SelectContent>
                      {releases.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.status}) {r.publish_at ? `· Scheduled ${new Date(r.publish_at).toLocaleDateString()}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                      New Release Name <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newReleaseName}
                      onChange={e => setNewReleaseName(e.target.value)}
                      placeholder="e.g. Q4 Marketing Launch, Product v2.0 Release"
                      className="input-field"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                      Target Launch Date (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={newReleaseDate}
                      onChange={e => setNewReleaseDate(e.target.value)}
                      className="input-field"
                      style={{ fontSize: 12.5 }}
                    />
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Target Publish Status
                </label>
                <Select value={targetStatus} onValueChange={setTargetStatus}>
                  <SelectTrigger className="input-field" style={{ fontSize: 13 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={onClose} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add to Release'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
