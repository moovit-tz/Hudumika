import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useCloud, DriveRole, DriveMemberCandidate } from './cloud-context.js';
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
  const {
    driveMembers, driveMembersLoading, loadDriveMembers, searchDriveMemberCandidates, addDriveMember, updateDriveMemberRole, removeDriveMember,
  } = useCloud();
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<DriveMemberCandidate[]>([]);
  const [picked, setPicked] = useState<DriveMemberCandidate | null>(null);
  const [role, setRole] = useState<DriveRole>('viewer');
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadDriveMembers(driveId); }, [driveId, loadDriveMembers]);

  // Real tenant staff only — replaces the old free-text "type a name" field,
  // which never identified a real workspace account (drives.routes.ts used
  // to store whatever string was typed as person_name, with no principal_id
  // to actually gate access on).
  useEffect(() => {
    if (picked) return; // a candidate is already selected; don't keep searching under it
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setCandidates([]); return; }
    searchTimer.current = setTimeout(async () => {
      const already = new Set(driveMembers.map(m => m.principal_id).filter(Boolean));
      const results = await searchDriveMemberCandidates(driveId, query.trim());
      setCandidates(results.filter(c => !already.has(c.id)));
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, picked, driveId, driveMembers, searchDriveMemberCandidates]);

  async function handleAdd() {
    if (!picked) return;
    setBusy(true);
    try {
      await addDriveMember(driveId, picked.id, role);
      setPicked(null); setQuery(''); setCandidates([]); setRole('viewer');
    } finally {
      setBusy(false);
    }
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

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              {picked ? (
                <div className="input-field" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.name || picked.email}</span>
                  <button onClick={() => { setPicked(null); setQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ) : (
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search staff by name or email…"
                  className="input-field"
                  style={{ width: '100%' }}
                />
              )}
              {!picked && candidates.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
                  background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                  boxShadow: 'var(--elev)', maxHeight: 180, overflowY: 'auto',
                }}>
                  {candidates.map(c => (
                    <div
                      key={c.id}
                      onClick={() => { setPicked(c); setCandidates([]); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--ink)' }}
                      onMouseDown={e => e.preventDefault()}
                    >
                      <div style={{ fontWeight: 600 }}>{c.name || 'Unnamed'}</div>
                      {c.email && <div style={{ color: 'var(--ink3)', fontSize: 'var(--text-xs)' }}>{c.email}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Select value={role} onValueChange={v => setRole(v as DriveRole)}>
              <SelectTrigger className="input-field" style={{ width: 150, fontSize: 'var(--text-sm)' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={handleAdd} className="btn btn-primary btn-sm" disabled={!picked || busy}>Add</button>
          </div>
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
              <span style={{ flex: 1, fontSize: 'var(--text-base)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.person_name}
                {!m.principal_id && <span style={{ color: 'var(--ink3)', fontSize: 'var(--text-xs)' }}> (unresolved — added before real accounts were required)</span>}
              </span>
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
