import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../components/ui/select.js';
import { showAlert } from '../../../lib/alert.js';
import { BASE_URL } from '../../../lib/api.js';
import { useCloud, CloudFile, SharedPerson } from '../../../shells/cloud-context.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

export function ShareModal({ item, onClose, onSave }: { item: CloudFile; onClose: () => void; onSave: (shared: SharedPerson[]) => void }) {
  const { shareItem } = useCloud();
  const [people, setPeople] = useState<SharedPerson[]>(item.shared ?? []);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Viewer' | 'Editor'>('Viewer');
  const [copied, setCopied] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(item.share_token);

  function addPerson() {
    const n = name.trim();
    if (!n) return;
    if (people.some(p => p.name.toLowerCase() === n.toLowerCase())) { setName(''); return; }
    setPeople(prev => [...prev, { name: n, role }]);
    setName('');
  }

  // The link only ever resolves while the file genuinely has at least one
  // share (see PUT /:id/share) — so "Copy link" saves the current people
  // list first (if it hasn't been saved yet) to actually get a real token,
  // rather than copying a URL that would 404.
  async function copyLink() {
    if (item.type === 'folder') { showAlert("Folders can't be shared via a public link yet."); return; }
    if (people.length === 0) { showAlert('Add at least one person first — a link only works while this item is actually shared.'); return; }
    setLinkBusy(true);
    try {
      const token = shareToken ?? (await shareItem(item.id, people)).share_token;
      if (!token) { showAlert('Could not generate a link.'); return; }
      setShareToken(token);
      await navigator.clipboard?.writeText(`${BASE_URL}/v1/files-public/${token}/download`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err: any) {
      showAlert(err.message || 'Failed to generate link.');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 440, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Share "{item.name}"</span>
          <button onClick={onClose} className="dp-close" aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 16px' }}>Add people and choose what they can do.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPerson(); }}
            placeholder="Add people by name…"
            className="input-field"
            style={{ flex: 1 }}
          />
          <Select value={role} onValueChange={v => setRole(v as 'Viewer' | 'Editor')}>
            <SelectTrigger className="input-field" style={{ width: 100, fontSize: 13 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Viewer">Viewer</SelectItem>
              <SelectItem value="Editor">Editor</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={addPerson} className="btn btn-primary btn-sm" disabled={!name.trim()}>Add</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
          {people.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 0' }}>Not shared with anyone yet.</div>}
          {people.map((p, idx) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
              <PersonAvatar name={p.name} size={28} />
              <span style={{ fontSize: 13.5, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <Select
                value={p.role}
                onValueChange={v => setPeople(prev => prev.map((x, i) => i === idx ? { ...x, role: v as 'Viewer' | 'Editor' } : x))}
              >
                <SelectTrigger className="input-field" style={{ width: 92, fontSize: 13 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Viewer">Viewer</SelectItem>
                  <SelectItem value="Editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => setPeople(prev => prev.filter((_, i) => i !== idx))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}
                aria-label={`Remove ${p.name}`}
              ><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={copyLink}
            disabled={linkBusy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: linkBusy ? 'wait' : 'pointer', color: 'var(--teal)', fontSize: 13, fontWeight: 600, padding: 0, opacity: linkBusy ? 0.6 : 1 }}
          >
            <Icon name="link" size={14} color="var(--teal)" /> {linkBusy ? 'Generating…' : copied ? 'Link copied' : 'Copy link'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
            <button onClick={() => { onSave(people); onClose(); }} className="btn btn-primary btn-sm">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
