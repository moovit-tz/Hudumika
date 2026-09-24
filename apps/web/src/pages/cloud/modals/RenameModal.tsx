import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../../../components/ui/dialog.js';
import { Button } from '../../../components/ui/button.js';
import { ButtonSpinner } from '../../../components/ui/spinner.js';
import type { CloudFile } from '../../../shells/cloud-context.js';

/** Closes only after the rename really succeeded; a failure stays visible in the dialog. */
export function RenameModal({ item, onClose, onRename }: { item: CloudFile; onClose: () => void; onRename: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true); setError(null);
    try { await onRename(name); onClose(); }
    catch (err: any) { setError(err?.message || 'Could not rename.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Rename {item.type === 'folder' ? 'folder' : 'file'}</DialogTitle></DialogHeader>
        <DialogBody>
          <input
            autoFocus value={value} onChange={e => setValue(e.target.value)} disabled={busy}
            onKeyDown={e => { if (e.key === 'Enter') void confirm(); }}
            className="input-field" style={{ width: '100%' }} aria-label="Name"
          />
          {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={!value.trim() || busy}>{busy ? <><ButtonSpinner /> Saving…</> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
