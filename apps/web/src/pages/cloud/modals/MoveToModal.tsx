import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../../../components/ui/dialog.js';
import { Button } from '../../../components/ui/button.js';
import { ButtonSpinner } from '../../../components/ui/spinner.js';
import { useCloud, CloudFile } from '../../../shells/cloud-context.js';

type MoveResult = { moved: string[]; failed: { id: string; error: string }[] };

/**
 * Moves happen before the dialog closes. If some items fail, the dialog stays open and
 * says exactly which — never a silent partial move. Folders cannot be moved into themselves
 * (also enforced by the API against descendants).
 */
export function MoveToModal({ ids, allItems, onClose, onMove }: {
  ids: string[]; allItems: CloudFile[]; onClose: () => void; onMove: (parentId: string | null) => Promise<MoveResult | void>;
}) {
  const { currentDrive } = useCloud();
  const excluded = new Set(ids);
  const folders = allItems.filter(i => i.type === 'folder' && !excluded.has(i.id));
  const [dest, setDest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => allItems.find(i => i.id === id)?.name ?? 'item';

  async function move() {
    setBusy(true); setError(null);
    try {
      const res = await onMove(dest);
      if (res && res.failed.length) {
        setError(`${res.moved.length} moved, ${res.failed.length} could not be moved: ` + res.failed.map(f => `${nameOf(f.id)} (${f.error})`).join('; '));
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not move.');
    } finally { setBusy(false); }
  }

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)', cursor: busy ? 'default' : 'pointer',
    background: active ? 'var(--teal-l)' : 'transparent', color: active ? 'var(--teal)' : 'var(--ink)', fontSize: 13,
  });

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Move {ids.length > 1 ? `${ids.length} items` : 'item'}</DialogTitle></DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={rowStyle(dest === null)} onClick={() => !busy && setDest(null)}>
              <Icon name="home" size={15} color={dest === null ? 'var(--teal)' : 'var(--ink3)'} /> {currentDrive?.name ?? 'My Drive'}
            </div>
            {folders.map(f => (
              <div key={f.id} style={rowStyle(dest === f.id)} onClick={() => !busy && setDest(f.id)}>
                <Icon name="folder" size={15} color={dest === f.id ? 'var(--teal)' : (f.color ?? '#f59e0b')} /> {f.name}
              </div>
            ))}
          </div>
          {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={move} disabled={busy}>{busy ? <><ButtonSpinner /> Moving…</> : 'Move here'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
