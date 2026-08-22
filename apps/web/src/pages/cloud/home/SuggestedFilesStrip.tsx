import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { Card } from '../../../components/ui/card.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/dropdown-menu.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fmtRelative } from '../lib/format.js';
import { previewKind, fileTypeStyle } from '../lib/fileTypeStyle.js';
import { usePreviewBlob } from '../lib/usePreviewBlob.js';
import { DocThumbnail } from '../components/DocThumbnail.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FileMenuItems, type FileMenuHandlers } from '../components/FileMenu.js';

export function SuggestedFilesStrip({ items, onOpen, menuHandlers }: { items: CloudFile[]; onOpen: (item: CloudFile) => void; menuHandlers: FileMenuHandlers }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
      {items.map(item => <SuggestedFileCard key={item.id} item={item} onOpen={onOpen} menuHandlers={menuHandlers} />)}
    </div>
  );
}

function SuggestedFileCard({ item, onOpen, menuHandlers }: { item: CloudFile; onOpen: (item: CloudFile) => void; menuHandlers: FileMenuHandlers }) {
  const isPdf = item.type === 'pdf' || item.name.endsWith('.pdf');
  const isSheet = ['xlsx', 'xls', 'csv'].includes(item.type) || item.name.endsWith('.xlsx');
  const isDoc = ['doc', 'docx'].includes(item.type) || item.name.endsWith('.docx');
  const badgeColor = isPdf ? '#ef4444' : isSheet ? '#10b981' : isDoc ? '#2563eb' : 'var(--teal)';
  const badgeLabel = isPdf ? 'PDF' : isSheet ? 'SHEET' : isDoc ? 'DOC' : item.type.toUpperCase();

  // This card used to always render DocThumbnail's generic mockup letterhead
  // even for real images — it never fetched a preview at all, unlike
  // FileCard.tsx's own grid, which does. An actual photo showed the same
  // fake "CONFIDENTIAL" document mockup as an .html or .txt file.
  const isImage = previewKind(item.type) === 'image';
  const { url: thumbUrl } = usePreviewBlob(isImage ? item.id : null);

  return (
    <Card
      onClick={() => onOpen(item)}
      className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--card-bg)',
        padding: 0,
      }}
    >
      {/* Card Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: badgeColor, color: '#fff', flexShrink: 0 }}>
            <Icon name={fileTypeStyle(item.type).icon} size={13} />
          </span>
          <span title={item.name} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </span>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)', borderRadius: '50%', display: 'flex' }}>
                <Icon name="moreVertical" size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-47.5">
              <FileMenuItems item={item} isTrashed={false} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Document Thumbnail Body Frame */}
      <div style={{ height: 120, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden', background: '#f8fafc' }}>
        <DocThumbnail type={item.type} name={item.name} url={thumbUrl} />
      </div>

      {/* Card Footer — "Updated", not a specific claimed action like
          "opened": updated_at is real, but which action last touched
          the file isn't tracked here (the real per-action log lives in
          PreviewPanel's Activity tab). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 11.5, color: 'var(--ink3)' }}>
        <PersonAvatar name={item.owner_name} userId={item.owner_id} size={18} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Updated {fmtRelative(item.updated_at)}
        </span>
      </div>
    </Card>
  );
}
