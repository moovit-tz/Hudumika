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
  // Only surface providers that are real integrations (supported by the API) or
  // that the user has already connected. Box, Dropbox and MEGA are not yet live
  // and showing them as "Coming soon" wastes space on the home dashboard.
  const visibleProviders = STORAGE_PROVIDERS.filter(p => {
    const conn = connections.find(c => c.provider === p.id);
    return conn?.supported === true || conn?.status === 'connected';
  });

  if (visibleProviders.length === 0) {
    return (
      <Card style={{ padding: '16px 14px', borderRadius: 'var(--r-lg)', color: 'var(--ink3)', fontSize: 13 }}>
        No external storage connected yet.{' '}
        <button
          type="button"
          style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'inherit', padding: 0 }}
          onClick={() => onOpen('onedrive')}
         data-ui-native-button="">
          Connect OneDrive →
        </button>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 8, borderRadius: 'var(--r-lg)' }}>
      {visibleProviders.map((p, i) => {
        const conn = connections.find(c => c.provider === p.id);
        const isConnected = conn?.status === 'connected';
        const isReal = conn?.supported === true;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="hover:bg-(--bg)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', borderRadius: i === 0 ? 'var(--r)' : 0,
            }}
           data-ui-native-button="">
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--r)', background: `${p.color}1a`, flexShrink: 0 }}>
              <Icon name={p.icon} size={15} color={p.color} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: isConnected ? 'var(--ink3)' : 'var(--teal)', fontWeight: isConnected ? 400 : 600, flexShrink: 0 }}>
                  {isConnected ? `${conn!.file_count} files` : 'Connect →'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                {isConnected ? `${fmtSize(conn!.total_size)} synced` : isReal ? 'Not connected' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </Card>
  );
}
