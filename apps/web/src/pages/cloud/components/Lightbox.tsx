import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Dialog, DialogContent } from '../../../components/ui/dialog.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { previewKind } from '../lib/fileTypeStyle.js';
import { usePreviewBlob } from '../lib/usePreviewBlob.js';

/**
 * Full-screen viewer for images/PDF/video — no lightbox component existed
 * anywhere in the app to reuse, built on ui/dialog.tsx (already a
 * dependency) rather than a new one. Reachable by double-click on a
 * previewable file, or the "Open full screen" action in PreviewPanel.
 */
export function Lightbox({ item, onClose, onDownload }: { item: CloudFile; onClose: () => void; onDownload: (item: CloudFile) => void }) {
  const kind = previewKind(item.type);
  const { url, loading, error } = usePreviewBlob(item.id);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent hideClose className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 flex flex-col overflow-hidden bg-black border-none sm:rounded-2xl">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'rgba(0,0,0,0.6)', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onDownload(item)} title="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: '#fff', display: 'flex' }}>
              <Icon name="download" size={18} color="#fff" />
            </button>
            <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: '#fff', display: 'flex' }}>
              <Icon name="close" size={18} color="#fff" />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
          {loading && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13.5 }}>Loading…</span>}
          {error && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13.5 }}>Couldn't load this file.</span>}
          {!loading && !error && url && kind === 'image' && (
            <img src={url} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}
          {!loading && !error && url && kind === 'pdf' && (
            <iframe src={url} title={item.name} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
          )}
          {!loading && !error && url && kind === 'video' && (
            <video src={url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
