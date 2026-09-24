import { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { Spinner } from './ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription } from './ui/dialog.js';
import { apiFetch } from '../lib/api.js';

export interface DriveFile { id: string; name: string; size: number | null; type: string; drive_id: string }

const fmtSize = (n: number | null) => n == null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * Search-and-pick a file from the user's Drive (only drives they can read —
 * the API's own access rules decide what /v1/files?q= returns). Used by Email
 * to attach a Drive file to a message; generic enough for any "pick a file"
 * flow. Folders are filtered out.
 */
export function DriveFilePicker({ open, onOpenChange, onPick, busy }: {
  open: boolean; onOpenChange: (open: boolean) => void; onPick: (file: DriveFile) => void; busy?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/files?q=${encodeURIComponent(q.trim())}`)
        .then((res: any) => setResults((Array.isArray(res) ? res : []).filter((f: any) => f.type !== 'folder').slice(0, 50)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Attach from Drive</DialogTitle>
          <DialogDescription>Choose a file from your Drive to attach. It is copied into the message.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search your files…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mb-3"
          />
          {loading ? <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>
            : results.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>{q ? 'No matching files.' : 'No files in your Drive yet.'}</div>
            : results.map(f => (
              <button
                key={f.id} type="button" disabled={busy} onClick={() => onPick(f)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 8px', border: 'none', background: 'none', textAlign: 'left', borderBottom: '1px solid var(--border)', cursor: busy ? 'default' : 'pointer' }}
              >
                <Icon name="fileText" size={16} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--ink)' }}>{f.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtSize(f.size)}</span>
              </button>
            ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
