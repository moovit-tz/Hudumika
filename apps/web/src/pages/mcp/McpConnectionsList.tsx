import React from 'react';
import { CompanyAvatar, PersonAvatar } from '../../components/PersonAvatar.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';

export interface McpConnection {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_avatar_url: string | null;
  actor_type: 'staff' | 'customer';
  client_id: string;
  client_name: string;
  client_verified: boolean;
  scopes: string[];
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** One row per connection. `showPerson` for the admin view of everyone's. */
export function McpConnectionsList({ rows, showPerson, onRevoke, busyId, empty }: {
  rows: McpConnection[];
  showPerson?: boolean;
  onRevoke?: (c: McpConnection) => void;
  busyId?: string | null;
  empty: React.ReactNode;
}) {
  if (rows.length === 0) return <div style={{ padding: 18, fontSize: 13, color: 'var(--ink3)' }}>{empty}</div>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map(c => (
        <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <CompanyAvatar name={c.client_name} size={34} shape="square" />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
              {c.client_name}
              {c.status === 'active' ? <Badge variant="success">Active</Badge> : <Badge variant="gray">Revoked</Badge>}
              {c.scopes.includes('mcp:write') && <Badge variant="warning">Can make changes</Badge>}
              {!c.client_verified && <Badge variant="gray">Self-registered</Badge>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
              Connected {fmtWhen(c.created_at)} · Last used {fmtWhen(c.last_used_at)}
              {c.status === 'revoked' && <> · {c.revoke_reason ?? 'Revoked'} {fmtWhen(c.revoked_at)}</>}
            </div>
          </div>
          {showPerson && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 1 200px', minWidth: 0 }}>
              <PersonAvatar userId={c.user_id} name={c.user_name ?? 'Unknown'} src={c.user_avatar_url} size={26} />
              <div style={{ minWidth: 0, fontSize: 12.5 }}>
                <div style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.user_name ?? 'Unknown'}</div>
                <div style={{ color: 'var(--ink3)' }}>{c.actor_type === 'customer' ? 'Customer' : 'Staff'}</div>
              </div>
            </div>
          )}
          {onRevoke && c.status === 'active' && (
            <Button type="button" variant="outline" size="sm" onClick={() => onRevoke(c)} disabled={busyId === c.id}>
              {busyId === c.id ? 'Revoking…' : 'Revoke'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
