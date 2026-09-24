import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../../../components/ui/dialog.js';
import { Button } from '../../../components/ui/button.js';
import { ButtonSpinner } from '../../../components/ui/spinner.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fmtSize } from '../lib/format.js';
import { fileTypeStyle } from '../lib/fileTypeStyle.js';

/** The delete really happens before the dialog closes — a refusal (e.g. a retention lock) is shown here, not swallowed. */
export function DeleteConfirmModal({ item, isTrashView, onClose, onConfirm }: { item: CloudFile; isTrashView: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const cfg = fileTypeStyle(item.type);
  const folderColor = item.color ?? '#f59e0b';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(); }
    catch (err: any) { setError(err?.message || 'Could not delete.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{isTrashView ? 'Delete Forever' : `Move ${item.type === 'folder' ? 'Folder' : 'File'} to Trash`}</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 16 }}>
            {item.type === 'folder'
              ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--r)', background: `${folderColor}22` }}><Icon name="folder" size={18} color={folderColor} /></span>
              : <FeaturedIcon variant={cfg.variant} size="sm"><Icon name={cfg.icon} size={16} /></FeaturedIcon>}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>{item.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{fmtSize(item.size)}</div>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink2)', margin: 0, lineHeight: 1.5 }}>
            {isTrashView
              ? 'This will be permanently deleted and cannot be recovered.'
              : item.type === 'folder'
                ? `This folder and all ${item.file_count} files inside will be moved to Trash.`
                : 'This file will be moved to Trash. You can restore it later.'}
          </p>
          {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? <><ButtonSpinner /> Working…</> : isTrashView ? 'Delete Forever' : 'Move to Trash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
