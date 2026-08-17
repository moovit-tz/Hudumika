import React from 'react';
import { Icon } from '../../../components/Icon.js';
import type { IconName } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { FeaturedIcon, type FeaturedIconProps } from '../../../components/ui/featured-icon.js';

export function QuickCreateTiles({ onNewFolder, onUploadFiles, onUploadFolder }: {
  onNewFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}) {
  const tiles: { label: string; hint: string; icon: IconName; variant: FeaturedIconProps['variant']; onClick: () => void }[] = [
    { label: 'New folder', hint: 'Organize files into a folder', icon: 'folder', variant: 'brand', onClick: onNewFolder },
    { label: 'Upload files', hint: 'Add files to this drive', icon: 'upload', variant: 'info', onClick: onUploadFiles },
    { label: 'Upload folder', hint: 'Bring in a whole folder tree', icon: 'folderOpen', variant: 'success', onClick: onUploadFolder },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      {tiles.map(t => (
        <Card key={t.label} onClick={t.onClick} className="hover:shadow-md transition-shadow cursor-pointer" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, borderRadius: 'var(--r-lg)' }}>
          <FeaturedIcon variant={t.variant} size="lg"><Icon name={t.icon} size={20} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{t.hint}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
