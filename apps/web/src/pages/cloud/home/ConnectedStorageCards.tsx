import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { STORAGE_PROVIDERS } from '../../../shells/ConnectedAppsModal.js';
import type { StorageConnection, StorageProvider } from '../../../shells/cloud-context.js';
import { fmtSize } from '../lib/format.js';

/** Public free-tier storage caps, used only to give the mocked usage bar a
 *  realistic scale — same explicitly-mocked constant the old ConnectedStorageRow used. */
const PROVIDER_QUOTA: Record<StorageProvider, number> = {
  box: 10 * 1_073_741_824,
  dropbox: 2 * 1_073_741_824,
  mega: 20 * 1_073_741_824,
  onedrive: 5 * 1_073_741_824,
};

export function ConnectedStorageCards({ connections, onOpen }: { connections: StorageConnection[]; onOpen: (provider: StorageProvider) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      {STORAGE_PROVIDERS.map(p => {
        const conn = connections.find(c => c.provider === p.id);
        const isConnected = conn?.status === 'connected';
        const quota = PROVIDER_QUOTA[p.id];
        const pct = isConnected ? Math.min(100, Math.round(((conn?.total_size ?? 0) / quota) * 100)) : 0;
        return (
          <Card key={p.id} onClick={() => onOpen(p.id)} className="hover:shadow-md transition-shadow cursor-pointer" style={{ padding: '16px 18px', borderRadius: 'var(--r-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--r)', background: `${p.color}1a`, flexShrink: 0 }}>
                <Icon name={p.icon} size={17} color={p.color} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{isConnected ? `${conn!.file_count} files` : 'Not connected'}</div>
              </div>
            </div>
            {isConnected ? (
              <>
                <div style={{ height: 5, borderRadius: 'var(--badge-radius)', background: 'var(--bg)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: p.color, borderRadius: 'var(--badge-radius)' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtSize(conn!.total_size)} / {fmtSize(quota)}</div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>Connect →</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
