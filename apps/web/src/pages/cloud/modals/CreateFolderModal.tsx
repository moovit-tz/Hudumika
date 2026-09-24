import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../../../components/ui/dialog.js';
import { Button } from '../../../components/ui/button.js';
import { ButtonSpinner } from '../../../components/ui/spinner.js';

const FOLDER_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#0891b2', '#ef4444', '#f97316', '#6366f1'];

/** Closes only once the folder is actually created; a failure (e.g. a name clash) stays visible here. */
export function CreateFolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, color: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try { await onCreate(name.trim(), color); onClose(); }
    catch (err: any) { setError(err?.message || 'Could not create the folder.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Folder Name *</label>
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)} disabled={busy}
              onKeyDown={e => { if (e.key === 'Enter') void confirm(); }}
              placeholder="Enter folder name…" className="input-field" style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {FOLDER_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} disabled={busy}
                  style={{ width: 26, height: 26, borderRadius: 'var(--badge-radius)', background: c, border: color === c ? '3px solid var(--ink)' : '2px solid transparent', cursor: busy ? 'default' : 'pointer', transition: 'border .1s', outline: 'none' }} />
              ))}
            </div>
          </div>
          {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 14 }}>{error}</div>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={!name.trim() || busy}>{busy ? <><ButtonSpinner /> Creating…</> : 'Create Folder'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
