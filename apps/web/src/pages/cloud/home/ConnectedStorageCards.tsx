import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { STORAGE_PROVIDERS } from '../../../shells/ConnectedAppsModal.js';
import type { StorageConnection, StorageProvider } from '../../../shells/cloud-context.js';
import { fmtSize } from '../lib/format.js';

/** Same one-card-many-rows shape as StorageOverviewCards now uses, rather
 *  than four separate bordered boxes in a 2x2 grid — the two panels sit
 *  side by side on the Cloud home page and used to read as two different
 *  design languages next to each other. */
export function ConnectedStorageCards({ connections, onOpen }: { connections: StorageConnection[]; onOpen: (provider: StorageProvider) => void }) {
  return (
    <Card style={{ padding: 8, borderRadius: 'var(--r-lg)' }}>
      {STORAGE_PROVIDERS.map((p, i) => {
        const conn = connections.find(c => c.provider === p.id);
        const isConnected = conn?.status === 'connected';
        // Only OneDrive is a real integration. Other providers are shown as "Coming soon" — and no
        // usage bar is drawn for any provider: the provider's real quota is not known to us, so a
        // bar against an assumed free-tier cap would be invented data.
        const isReal = conn?.supported === true;
        return (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="hover:bg-(--bg)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', borderRadius: i === 0 ? 'var(--r)' : 0,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--r)', background: `${p.color}1a`, flexShrink: 0 }}>
              <Icon name={p.icon} size={15} color={p.color} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: isConnected ? 'var(--ink3)' : isReal ? 'var(--teal)' : 'var(--ink3)', fontWeight: isConnected || !isReal ? 400 : 600, flexShrink: 0 }}>
                  {isConnected ? `${conn!.file_count} files` : isReal ? 'Connect →' : 'Coming soon'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                {isConnected ? `${fmtSize(conn!.total_size)} synced` : isReal ? 'Not connected' : 'Integration not available yet'}
              </div>
            </div>
          </button>
        );
      })}
    </Card>
  );
}
