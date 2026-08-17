import React from 'react';
import { Icon } from '../../../components/Icon.js';
import { FeaturedIcon } from '../../../components/ui/featured-icon.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { fmtSize } from '../lib/format.js';
import { fileTypeStyle } from '../lib/fileTypeStyle.js';

export function DeleteConfirmModal({ item, isTrashView, onClose, onConfirm }: { item: CloudFile; isTrashView: boolean; onClose: () => void; onConfirm: () => void }) {
  const cfg = fileTypeStyle(item.type);
  const folderColor = item.color ?? '#f59e0b';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 380, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{isTrashView ? 'Delete Forever' : `Move ${item.type === 'folder' ? 'Folder' : 'File'} to Trash`}</span>
          <button onClick={onClose} className="dp-close"><Icon name="close" size={16} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 16 }}>
          {item.type === 'folder'
            ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--r)', background: `${folderColor}22` }}><Icon name="folder" size={18} color={folderColor} /></span>
            : <FeaturedIcon variant={cfg.variant} size="sm"><Icon name={cfg.icon} size={16} /></FeaturedIcon>
          }
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>{item.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{fmtSize(item.size)}</div>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ink2)', margin: '0 0 20px', lineHeight: 1.5 }}>
          {isTrashView
            ? 'This will be permanently deleted and cannot be recovered.'
            : item.type === 'folder'
              ? `This folder and all ${item.file_count} files inside will be moved to Trash.`
              : 'This file will be moved to Trash. You can restore it later.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger btn-sm">{isTrashView ? 'Delete Forever' : 'Move to Trash'}</button>
        </div>
      </div>
    </div>
  );
}
