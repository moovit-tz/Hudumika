import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import type { CloudFile } from '../../../shells/cloud-context.js';

export function RenameModal({ item, onClose, onRename }: { item: CloudFile; onClose: () => void; onRename: (name: string) => void }) {
  const [value, setValue] = useState(item.name);
  function confirm() {
    if (!value.trim()) return;
    onRename(value.trim());
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 380, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Rename {item.type === 'folder' ? 'folder' : 'file'}</span>
          <button onClick={onClose} className="dp-close"><Icon name="close" size={16} /></button>
        </div>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(); }}
          className="input-field"
          style={{ width: '100%', marginBottom: 20 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={confirm} className="btn btn-primary btn-sm" disabled={!value.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}
