import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useCloud, DriveRole } from './cloud-context.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionLoading } from '../components/ui/spinner.js';

const ROLE_OPTIONS: { value: DriveRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'content_manager', label: 'Content Manager' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'commenter', label: 'Commenter' },
  { value: 'viewer', label: 'Viewer' },
];

export function DriveMembersModal({ driveId, driveName, onClose }: { driveId: string; driveName: string; onClose: () => void }) {
  const { driveMembers, driveMembersLoading, loadDriveMembers, addDriveMember, updateDriveMemberRole, removeDriveMember } = useCloud();
  const [name, setName] = useState('');
  const [role, setRole] = useState<DriveRole>('viewer');
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadDriveMembers(driveId); }, [driveId, loadDriveMembers]);

  async function handleAdd() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try { await addDriveMember(driveId, n, role); setName(''); setRole('viewer'); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 460, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>Members of "{driveName}"</span>
          <button onClick={onClose} className="dp-close" aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink3)', margin: '0 0 16px' }}>
          Everyone with access to this shared drive and what they can do in it.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Add a person by name…"
            className="input-field"
            style={{ flex: 1 }}
          />
          <Select value={role} onValueChange={v => setRole(v as DriveRole)}>
            <SelectTrigger className="input-field" style={{ width: 150, fontSize: 'var(--text-sm)' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={handleAdd} className="btn btn-primary btn-sm" disabled={!name.trim() || busy}>Add</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
          {driveMembersLoading && driveMembers.length === 0 && (
            <SectionLoading />
          )}
          {!driveMembersLoading && driveMembers.length === 0 && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink3)', padding: '8px 0' }}>No members yet — add someone above.</div>
          )}
          {driveMembers.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
              <span style={{ flex: 1, fontSize: 'var(--text-base)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.person_name}</span>
              <Select value={m.role} onValueChange={v => updateDriveMemberRole(driveId, m.id, v as DriveRole)}>
                <SelectTrigger className="input-field" style={{ width: 150, fontSize: 'var(--text-xs)' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                onClick={() => removeDriveMember(driveId, m.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}
                aria-label={`Remove ${m.person_name}`}
              ><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
