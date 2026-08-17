import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { useCloud, CloudFile } from '../../../shells/cloud-context.js';

export function MoveToModal({ ids, allItems, onClose, onMove }: { ids: string[]; allItems: CloudFile[]; onClose: () => void; onMove: (parentId: string | null) => void }) {
  const { currentDrive } = useCloud();
  const excluded = new Set(ids);
  const folders = allItems.filter(i => i.type === 'folder' && !excluded.has(i.id));
  const [dest, setDest] = useState<string | null>(null);
  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
    background: active ? 'var(--teal-l)' : 'transparent', color: active ? 'var(--teal)' : 'var(--ink)', fontSize: 13,
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: 380, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Move {ids.length > 1 ? `${ids.length} items` : 'item'}</span>
          <button onClick={onClose} className="dp-close"><Icon name="close" size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto', marginBottom: 20 }}>
          <div style={rowStyle(dest === null)} onClick={() => setDest(null)}>
            <Icon name="home" size={15} color={dest === null ? 'var(--teal)' : 'var(--ink3)'} /> {currentDrive?.name ?? 'My Drive'}
          </div>
          {folders.map(f => (
            <div key={f.id} style={rowStyle(dest === f.id)} onClick={() => setDest(f.id)}>
              <Icon name="folder" size={15} color={dest === f.id ? 'var(--teal)' : (f.color ?? '#f59e0b')} /> {f.name}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={() => { onMove(dest); onClose(); }} className="btn btn-primary btn-sm">Move here</button>
        </div>
      </div>
    </div>
  );
}
