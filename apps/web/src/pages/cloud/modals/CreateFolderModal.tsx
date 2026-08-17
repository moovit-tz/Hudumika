import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';

const FOLDER_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#0891b2', '#ef4444', '#f97316', '#6366f1'];

export function CreateFolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, color: string) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);

  function confirm() {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>New Folder</span>
          <button onClick={onClose} className="dp-close"><Icon name="close" size={16} /></button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Folder Name *</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirm(); }}
            placeholder="Enter folder name…"
            className="input-field"
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {FOLDER_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 'var(--badge-radius)', background: c, border: color === c ? '3px solid var(--ink)' : '2px solid transparent', cursor: 'pointer', transition: 'border .1s', outline: 'none' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={confirm} className="btn btn-primary btn-sm" disabled={!name.trim()}>Create Folder</button>
        </div>
      </div>
    </div>
  );
}
