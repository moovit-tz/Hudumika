import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './ui/dialog.js';
import { PersonAvatar } from './PersonAvatar.js';
import { SectionLoading } from './ui/spinner.js';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import type { CmsRevision, CmsRevisionResourceType } from '@hudumika/types';

const RESOURCE_ROUTE: Record<CmsRevisionResourceType, string> = {
  page: '/v1/cms/pages', post: '/v1/cms/posts', entry: '/v1/cms/content-entries',
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A value as it'll actually be compared/shown — HTML content gets its tags
 *  stripped (a raw HTML diff is unreadable), an object (an entry's `data`)
 *  is pretty-printed, and everything else is a plain string. Long values are
 *  truncated — this is a real diff, not a full content viewer. */
function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  let s: string;
  if (typeof v === 'object') s = JSON.stringify(v, null, 2);
  else s = String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 300 ? s.slice(0, 300) + '…' : s;
}

function changedKeysOf(snapshot: Record<string, unknown>, current: Record<string, unknown>): string[] {
  return Object.keys(snapshot).filter(k => JSON.stringify(snapshot[k]) !== JSON.stringify(current[k]));
}

/**
 * §19 of the CMS master brief — real version history, shared by Pages,
 * Posts and Content Model entries (one backend table, cms_revisions, per
 * resourceType). "A diff view is just comparing two JSON snapshots field by
 * field" (this component's own scoping note in the CMS Implementation Map)
 * — deliberately not a rich HTML/character-level diff, which would be a
 * much larger, separate build.
 */
export function RevisionHistory({ open, onOpenChange, resourceType, resourceId, current, fieldLabels, onRestored }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resourceType: CmsRevisionResourceType;
  resourceId: string;
  /** The live resource's own snapshot-shaped fields (same keys cms-revisions.service.ts's *RevisionSnapshot() functions record), so a selected revision can be diffed against "now." */
  current: Record<string, unknown>;
  /** Pretty labels per snapshot key, e.g. {title:'Title', content:'Content'} — falls back to the raw key when omitted. */
  fieldLabels?: Record<string, string>;
  /** Called with the freshly-restored resource (the restore endpoint's own response — same shape update/create already return) so the parent can update the editor it has open without a second round-trip. */
  onRestored: (restored: any) => void;
}) {
  const [revisions, setRevisions] = useState<CmsRevision[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRevisions(null);
    setSelectedId(null);
    apiFetch(`${RESOURCE_ROUTE[resourceType]}/${resourceId}/revisions`).then(setRevisions).catch(() => setRevisions([]));
  }, [open, resourceType, resourceId]);

  const selected = revisions?.find(r => r.id === selectedId) ?? null;
  const label = (k: string) => fieldLabels?.[k] ?? k;

  async function handleRestore(rev: CmsRevision) {
    if (!(await showConfirm('Restore this version? This creates a new revision recording the restore — nothing is lost.', { confirmLabel: 'Restore this version' }))) return;
    setRestoring(true);
    try {
      const restored = await apiFetch(`${RESOURCE_ROUTE[resourceType]}/${resourceId}/revisions/${rev.id}/restore`, { method: 'POST' });
      onOpenChange(false);
      onRestored(restored);
    } catch (e: any) {
      showAlert(`Failed to restore: ${e.message}`);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{selected ? 'Compare to now' : 'Version history'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {revisions === null ? (
            <SectionLoading />
          ) : !selected ? (
            revisions.length === 0 ? (
              <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No saved versions yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {revisions.map((rev, i) => {
                  const prior = revisions[i + 1]?.snapshot ?? null;
                  const changed = prior ? changedKeysOf(rev.snapshot, prior) : [];
                  return (
                    <button key={rev.id} onClick={() => setSelectedId(rev.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', borderRadius: 'var(--r-sm)', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <PersonAvatar userId={rev.author_id} name={rev.author_name || 'Unknown'} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{rev.author_name || 'Unknown'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                          {fmtDateTime(rev.created_at)} · {i === revisions.length - 1 ? 'Initial version' : changed.length ? `${changed.map(label).join(', ')} changed` : 'No changes'}
                        </div>
                      </div>
                      <Icon name="chevronRight" size={14} color="var(--ink3)" />
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <button onClick={() => setSelectedId(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink3)', padding: 0, alignSelf: 'flex-start' }}>
                <Icon name="arrowLeft" size={13} /> All versions
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PersonAvatar userId={selected.author_id} name={selected.author_name || 'Unknown'} size={26} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{selected.author_name || 'Unknown'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{fmtDateTime(selected.created_at)}</div>
                </div>
              </div>
              {(() => {
                const changed = changedKeysOf(selected.snapshot, current);
                if (!changed.length) return <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Identical to the current version.</div>;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {changed.map(k => (
                      <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                        <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{label(k)}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                          <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--ink2)', background: 'var(--red-l, #fef2f2)', borderRight: '1px solid var(--border)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>THEN</div>{renderValue(selected.snapshot[k])}
                          </div>
                          <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--ink2)', background: 'var(--green-l, #e9f6ed)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', marginBottom: 4 }}>NOW</div>{renderValue(current[k])}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {selected ? (
            <button className="btn btn-primary btn-sm" disabled={restoring} onClick={() => handleRestore(selected)}>
              {restoring ? 'Restoring…' : 'Restore this version'}
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>Close</button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
