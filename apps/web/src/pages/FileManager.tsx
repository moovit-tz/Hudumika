import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useCloud, CloudFile, SharedPerson, StorageProvider, StorageConnection } from '../shells/cloud-context.js';
import { ProviderFilesPanel } from './ProviderFilesPanel.js';
import { STORAGE_PROVIDERS } from '../shells/ConnectedAppsModal.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../components/ui/context-menu.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import { BASE_URL } from '../lib/api.js';

const PROVIDER_VIEWS: StorageProvider[] = ['box', 'dropbox', 'mega', 'onedrive'];

/** Public free-tier storage caps, used only to give the mocked usage bar a realistic scale. */
const PROVIDER_QUOTA: Record<StorageProvider, number> = {
  box: 10 * 1_073_741_824,
  dropbox: 2 * 1_073_741_824,
  mega: 20 * 1_073_741_824,
  onedrive: 5 * 1_073_741_824,
};

/* Google Drive palette, scoped to this page only. */
const GD = {
  blue:   '#1a73e8',
  blueL:  '#e8f0fe',
  hover:  '#f1f3f4',
};

/* ── Helpers ── */
export function fmtSize(b?: number | null): string {
  if (!b) return '—';
  if (b >= 1_073_741_824) return `${(b/1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)     return `${(b/1_048_576).toFixed(1)} MB`;
  if (b >= 1024)          return `${(b/1024).toFixed(0)} KB`;
  return `${b} B`;
}
export function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtRelative(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'Opened just now';
  if (min < 60) return `Opened ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Opened ${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `Opened ${day}d ago`;
  return `Opened ${fmtDate(d)}`;
}

const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30','#0e7490'];
function avColor(n: string) { return AV_COLORS[n.charCodeAt(0) % AV_COLORS.length]; }
function initials(n: string) { return n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

/* ── Mini Avatar ── */
function MiniAv({ name, size=22 }: { name: string; size?: number }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, borderRadius:'50%', background:avColor(name), color:'#fff', fontSize:size*0.4, fontWeight:700, border:'2px solid var(--white)', flexShrink:0 }}>
      {initials(name)}
    </span>
  );
}

/* ── File Type Icon — a recognizable "page with folded corner + extension"
   badge (PDF/DOC/XLS/…), the same convention most OS file managers use for
   types that don't have a live thumbnail. ── */
const EXT_LABEL: Record<string, string> = {
  pdf:'PDF', doc:'DOC', docx:'DOC', xls:'XLS', xlsx:'XLS', csv:'CSV',
  ppt:'PPT', pptx:'PPT', zip:'ZIP', rar:'RAR', txt:'TXT', xml:'XML',
  png:'PNG', jpg:'JPG', jpeg:'JPG', gif:'GIF', webp:'IMG',
  mp4:'MP4', mov:'MOV', avi:'AVI', mp3:'MP3', wav:'WAV',
};
function FileIcon({ type, size=36 }: { type: string; size?: number }) {
  const cfg = tcfg(type);
  const label = EXT_LABEL[type.toLowerCase()];
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ flexShrink:0 }} aria-label={label ?? cfg.label}>
      <path d="M9 3h12l7 7v20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill={cfg.bg} stroke={cfg.color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M21 3v7h7" fill="none" stroke={cfg.color} strokeWidth="1.5" strokeLinejoin="round" />
      {label && (
        <text x="18" y="25.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={cfg.color} fontFamily="var(--font)">{label}</text>
      )}
    </svg>
  );
}

/* ── File actions menu — shared item list, rendered inside either a
   DropdownMenuContent (kebab-button trigger) or a ContextMenuContent
   (right-click trigger) depending on which wraps it. ── */
export interface FileMenuHandlers {
  onOpen: (item: CloudFile) => void;
  onRename: (item: CloudFile) => void;
  onStar: (item: CloudFile) => void;
  onDelete: (item: CloudFile) => void;
  onDownload: (item: CloudFile) => void;
  onShare: (item: CloudFile) => void;
  onMove: (item: CloudFile) => void;
  onRestore: (item: CloudFile) => void;
  onPermanentDelete: (item: CloudFile) => void;
}
function fileMenuEntries(item: CloudFile, isTrashed: boolean, h: FileMenuHandlers) {
  return isTrashed
    ? [
        { icon:'refresh' as IconName,  label:'Restore',       action:()=>h.onRestore(item) },
        null,
        { icon:'trash2' as IconName,   label:'Delete forever', action:()=>h.onPermanentDelete(item), danger:true },
      ]
    : [
        { icon:'eye' as IconName,         label:'Preview',     action:()=>h.onOpen(item) },
        { icon:'edit' as IconName,        label:'Rename',      action:()=>h.onRename(item) },
        ...(item.type !== 'folder' ? [{ icon:'download' as IconName, label:'Download', action:()=>h.onDownload(item) }] : []),
        { icon:'userPlus' as IconName,    label:'Share',       action:()=>h.onShare(item) },
        { icon:'folderOpen' as IconName,  label:'Move to',     action:()=>h.onMove(item) },
        { icon:'star' as IconName,        label: item.starred ? 'Unstar' : 'Star', action:()=>h.onStar(item) },
        null,
        { icon:'trash' as IconName,       label:'Move to trash', action:()=>h.onDelete(item), danger:true },
      ];
}
function FileMenuItems({ item, isTrashed, handlers, ItemComp, SeparatorComp }: {
  item: CloudFile;
  isTrashed: boolean;
  handlers: FileMenuHandlers;
  ItemComp: React.ComponentType<any>;
  SeparatorComp: React.ComponentType<any>;
}) {
  const entries = fileMenuEntries(item, isTrashed, handlers);
  return (
    <>
      {entries.map((it, idx) =>
        it === null
          ? <SeparatorComp key={idx} />
          : (
            <ItemComp
              key={idx}
              onSelect={it.action}
              className={`gap-2.5 cursor-pointer${it.danger ? ' text-red-600 focus:text-red-600 focus:bg-red-50' : ''}`}
            >
              <Icon name={it.icon} size={14} color={it.danger ? 'var(--red)' : 'var(--ink3)'} />
              <span>{it.label}</span>
              {it.label==='Star' && item.starred && <Icon name="star" size={12} color="#f59e0b" style={{ marginLeft:'auto' }} />}
            </ItemComp>
          )
      )}
    </>
  );
}

/* ── Drag payload mimetype for internal move ── */
const DND_TYPE = 'application/x-fileitem';

interface CardCommonProps {
  item: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenuOpen?: () => void;
  onMoveHere?: (draggedId: string) => void;
  isTrashed: boolean;
  menuHandlers: FileMenuHandlers;
}

/* ── Folder Card ── */
function FolderCard({ item, selected, onClick, onDoubleClick, onContextMenuOpen, onMoveHere, isTrashed, menuHandlers }: CardCommonProps) {
  const [hov, setHov] = useState(false);
  const [dropHov, setDropHov] = useState(false);
  const color = item.color ?? '#f59e0b';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`gd-folder ${selected ? 'gd-folder--selected' : ''}`}
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={e => { if (e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setDropHov(true); } }}
          onDragLeave={() => setDropHov(false)}
          onDrop={e => {
            if (!e.dataTransfer.types.includes(DND_TYPE)) return;
            e.preventDefault(); e.stopPropagation(); setDropHov(false);
            const id = e.dataTransfer.getData(DND_TYPE);
            if (id && id !== item.id) onMoveHere?.(id);
          }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenuOpen}
          onMouseEnter={()=>setHov(true)}
          onMouseLeave={()=>setHov(false)}
          style={{
            boxShadow: dropHov ? `0 0 0 2px var(--blue)` : undefined,
            border: dropHov ? `1px solid var(--blue)` : undefined,
            position:'relative',
          }}
        >
          <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:'var(--r)', background:`${color}22`, flexShrink:0 }}>
            <Icon name="folder" size={20} color={color} />
          </span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'var(--text-base)', fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
            <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)' }}>{item.file_count} files</div>
          </div>
          {item.starred && <Icon name="star" size={13} color="#f59e0b" style={{ flexShrink:0 }} />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-[190px]">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── File Grid Card ── */
function FileCard({ item, selected, onClick, onDoubleClick, onContextMenuOpen, isTrashed, menuHandlers }: CardCommonProps) {
  const [hov, setHov] = useState(false);
  const cfg = tcfg(item.type);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`gd-file ${selected ? 'gd-file--selected' : ''}`}
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenuOpen}
          onMouseEnter={()=>setHov(true)}
          onMouseLeave={()=>setHov(false)}
          style={{ position:'relative' }}
        >
          {item.starred && <Icon name="star" size={12} color="#f59e0b" style={{ position:'absolute', top:10, right:10 }} />}

          <div className="gd-file-preview">
            <FileIcon type={item.type} size={48} />
          </div>

          <div className="gd-file-info">
            <FileIcon type={item.type} size={20} />
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:2 }}>
              <div style={{ fontSize:'var(--text-sm)', fontWeight:600, color:'var(--ink)', wordBreak:'break-all', lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)' }}>{cfg.label}</div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-[190px]">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── File List Row ── */
interface RowProps {
  item: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenuOpen?: () => void;
  onMoveHere?: (draggedId: string) => void;
  isTrashed: boolean;
  menuHandlers: FileMenuHandlers;
}
function FileRow({ item, selected, onClick, onDoubleClick, onContextMenuOpen, onMoveHere, isTrashed, menuHandlers }: RowProps) {
  const [hov, setHov] = useState(false);
  const [dropHov, setDropHov] = useState(false);
  const cfg = item.type === 'folder' ? TYPE_CFG.folder : tcfg(item.type);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr
          draggable
          onDragStart={e => { e.dataTransfer.setData(DND_TYPE, item.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={e => { if (item.type==='folder' && e.dataTransfer.types.includes(DND_TYPE)) { e.preventDefault(); setDropHov(true); } }}
          onDragLeave={() => setDropHov(false)}
          onDrop={e => {
            if (item.type!=='folder' || !e.dataTransfer.types.includes(DND_TYPE)) return;
            e.preventDefault(); e.stopPropagation(); setDropHov(false);
            const id = e.dataTransfer.getData(DND_TYPE);
            if (id && id !== item.id) onMoveHere?.(id);
          }}
          onContextMenu={onContextMenuOpen}
          onMouseEnter={()=>setHov(true)}
          onMouseLeave={()=>setHov(false)}
          style={{ background: dropHov ? GD.blueL : selected ? GD.blueL : hov ? 'var(--bg)' : 'transparent', outline: dropHov ? `2px solid ${GD.blue}` : 'none', outlineOffset:-2, transition:'background .1s', cursor:'pointer' }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        >
          <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {item.type === 'folder'
                ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'var(--r)', background:`${item.color ?? '#f59e0b'}22` }}><Icon name="folder" size={16} color={item.color ?? '#f59e0b'} /></span>
                : <FileIcon type={item.type} size={32} />
              }
              <div>
                <div style={{ fontSize:'var(--text-base)', fontWeight:500, color:'var(--ink)' }}>{item.name}</div>
                {item.type==='folder' && <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)' }}>{item.file_count} files</div>}
              </div>
              {item.starred && <Icon name="star" size={12} color="#f59e0b" style={{ marginLeft:4 }} />}
            </div>
          </td>
          <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontSize:'var(--text-base)', color:'var(--ink3)', whiteSpace:'nowrap' }}>{item.owner_name}</td>
          <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontSize:'var(--text-base)', color:'var(--ink3)', whiteSpace:'nowrap' }}>{isTrashed ? fmtDate(item.trashed_at) : fmtDate(item.updated_at)}</td>
          <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontSize:'var(--text-base)', color:'var(--ink3)', whiteSpace:'nowrap' }}>{fmtSize(item.size)}</td>
          <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', gap:-4 }}>
              {(item.shared ?? []).slice(0,3).map((p,i)=><span key={i} style={{ marginLeft:i>0?-6:0 }}><MiniAv name={p.name} size={20} /></span>)}
            </div>
          </td>
          <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }} onClick={e=>e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:'var(--r-sm)', color:'var(--ink3)', display:'flex', alignItems:'center' }}>
                  <Icon name="moreHorizontal" size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[190px]">
                <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-[190px]">
        <FileMenuItems item={item} isTrashed={isTrashed} handlers={menuHandlers} ItemComp={ContextMenuItem} SeparatorComp={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── Share Modal ── */
function ShareModal({ item, onClose, onSave }: { item: CloudFile; onClose: ()=>void; onSave: (shared: SharedPerson[])=>void }) {
  const { shareItem } = useCloud();
  const [people, setPeople] = useState<SharedPerson[]>(item.shared ?? []);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Viewer'|'Editor'>('Viewer');
  const [copied, setCopied] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(item.share_token);

  function addPerson() {
    const n = name.trim();
    if (!n) return;
    if (people.some(p => p.name.toLowerCase() === n.toLowerCase())) { setName(''); return; }
    setPeople(prev => [...prev, { name: n, role }]);
    setName('');
  }

  // The link only ever resolves while the file genuinely has at least one
  // share (see PUT /:id/share) — so "Copy link" saves the current people
  // list first (if it hasn't been saved yet) to actually get a real token,
  // rather than copying a URL that would 404.
  async function copyLink() {
    if (item.type === 'folder') { showAlert("Folders can't be shared via a public link yet."); return; }
    if (people.length === 0) { showAlert('Add at least one person first — a link only works while this item is actually shared.'); return; }
    setLinkBusy(true);
    try {
      const token = shareToken ?? (await shareItem(item.id, people)).share_token;
      if (!token) { showAlert('Could not generate a link.'); return; }
      setShareToken(token);
      await navigator.clipboard?.writeText(`${BASE_URL}/v1/files-public/${token}/download`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err: any) {
      showAlert(err.message || 'Failed to generate link.');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width:440, padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--ink)' }}>Share "{item.name}"</span>
          <button onClick={onClose} className="dp-close"><Icon name="close" size={16} /></button>
        </div>
        <p style={{ fontSize:'var(--text-sm)', color:'var(--ink3)', margin:'0 0 16px' }}>Add people and choose what they can do.</p>

        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <input
            autoFocus
            value={name}
            onChange={e=>setName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') addPerson(); }}
            placeholder="Add people by name…"
            className="input-field"
            style={{ flex:1 }}
          />
          <Select value={role} onValueChange={v=>setRole(v as 'Viewer'|'Editor')}>
            <SelectTrigger className="input-field" style={{ width:100, fontSize:'var(--text-sm)' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Viewer">Viewer</SelectItem>
              <SelectItem value="Editor">Editor</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={addPerson} className="btn btn-primary btn-sm" disabled={!name.trim()}>Add</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:220, overflowY:'auto', marginBottom:16 }}>
          {people.length === 0 && <div style={{ fontSize:'var(--text-sm)', color:'var(--ink3)', padding:'8px 0' }}>Not shared with anyone yet.</div>}
          {people.map((p, idx) => (
            <div key={p.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 4px' }}>
              <MiniAv name={p.name} size={28} />
              <span style={{ fontSize:'var(--text-base)', color:'var(--ink)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
              <Select
                value={p.role}
                onValueChange={v => setPeople(prev => prev.map((x,i) => i===idx ? { ...x, role: v as 'Viewer'|'Editor' } : x))}
              >
                <SelectTrigger className="input-field" style={{ width:92, fontSize:'var(--text-sm)' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Viewer">Viewer</SelectItem>
                  <SelectItem value="Editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => setPeople(prev => prev.filter((_,i)=>i!==idx))}
                style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'var(--ink3)' }}
                aria-label={`Remove ${p.name}`}
              ><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:14, borderTop:'1px solid var(--border)' }}>
          <button
            onClick={copyLink}
            disabled={linkBusy}
            style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor: linkBusy ? 'wait' : 'pointer', color: GD.blue, fontSize:'var(--text-base)', fontWeight:600, padding:0, opacity: linkBusy ? 0.6 : 1 }}
          >
            <Icon name="link" size={14} color={GD.blue} /> {linkBusy ? 'Generating…' : copied ? 'Link copied' : 'Copy link'}
          </button>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
            <button onClick={()=>{ onSave(people); onClose(); }} className="btn btn-primary btn-sm">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Move-to Folder Picker ── */
function MoveToModal({ ids, allItems, onClose, onMove }: { ids: string[]; allItems: CloudFile[]; onClose: ()=>void; onMove: (parentId: string|null)=>void }) {
  const { currentDrive } = useCloud();
  const excluded = new Set(ids);
  const folders = allItems.filter(i => i.type==='folder' && !excluded.has(i.id));
  const [dest, setDest] = useState<string|null>(null);
  const rowStyle = (active: boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:'var(--r-sm)', cursor:'pointer',
    background: active ? GD.blueL : 'transparent', color: active ? GD.blue : 'var(--ink)', fontSize:'var(--text-base)',
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width:380, padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--ink)' }}>Move {ids.length>1 ? `${ids.length} items` : 'item'}</span>
          <button onClick={onClose} className="dp-close"><Icon name="close" size={16} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:280, overflowY:'auto', marginBottom:20 }}>
          <div style={rowStyle(dest===null)} onClick={()=>setDest(null)}>
            <Icon name="home" size={15} color={dest===null ? GD.blue : 'var(--ink3)'} /> {currentDrive?.name ?? 'My Drive'}
          </div>
          {folders.map(f => (
            <div key={f.id} style={rowStyle(dest===f.id)} onClick={()=>setDest(f.id)}>
              <Icon name="folder" size={15} color={dest===f.id ? GD.blue : (f.color ?? '#f59e0b')} /> {f.name}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={()=>{ onMove(dest); onClose(); }} className="btn btn-primary btn-sm">Move here</button>
        </div>
      </div>
    </div>
  );
}

/* ── Preview Panel ── */
function PreviewPanel({ item, onClose, onStar, onDownload, onDelete, onShare }: { item: CloudFile; onClose: ()=>void; onStar:(item:CloudFile)=>void; onDownload:(item:CloudFile)=>void; onDelete:(item:CloudFile)=>void; onShare:(item:CloudFile)=>void }) {
  const [tab, setTab] = useState<'details'|'activity'>('details');
  const cfg = item.type === 'folder' ? TYPE_CFG.folder : tcfg(item.type);

  const activity = [
    ...(item.shared ?? []).map(p => ({ icon:'userPlus' as IconName, text:`Shared with ${p.name} — ${p.role}`, date: item.updated_at })),
    { icon:'edit' as IconName, text:'Last modified', date: item.updated_at },
    { icon:'plusCircle' as IconName, text:`Created by ${item.owner_name}`, date: item.created_at },
  ].sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div style={{ width:300, flexShrink:0, borderLeft:'1px solid var(--border)', background:'var(--white)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontSize:'var(--text-base)', fontWeight:600, color:'var(--ink)' }}>Details</span>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:'var(--r-sm)', color:'var(--ink3)' }}><Icon name="close" size={16} /></button>
      </div>

      {/* Icon + name */}
      <div style={{ padding:24, display:'flex', flexDirection:'column', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)', textAlign:'center' }}>
        {item.type === 'folder'
          ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:64, height:64, borderRadius:'var(--r)', background:`${item.color ?? '#f59e0b'}22` }}><Icon name="folder" size={32} color={item.color ?? '#f59e0b'} /></span>
          : <FileIcon type={item.type} size={64} />
        }
        <div style={{ fontSize:'var(--text-md)', fontWeight:600, color:'var(--ink)', wordBreak:'break-all', lineHeight:1.4 }}>{item.name}</div>
        <span style={{ fontSize:'var(--text-xs)', fontWeight:600, color:cfg.color, background:cfg.bg, padding:'3px 10px', borderRadius:'var(--badge-radius)' }}>{cfg.label}</span>
      </div>

      {/* Action buttons */}
      <div style={{ padding:'12px 16px', display:'flex', gap:8, borderBottom:'1px solid var(--border)' }}>
        {item.type !== 'folder' && (
          <button onClick={()=>onDownload(item)} className="btn btn-primary btn-sm" style={{ flex:1 }}>
            <Icon name="download" size={13} /> Download
          </button>
        )}
        <button onClick={()=>onShare(item)} style={{ flex: item.type==='folder' ? 1 : undefined, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'6px 10px', cursor:'pointer', color:GD.blue }}>
          <Icon name="userPlus" size={14} color={GD.blue} />
        </button>
        <button onClick={()=>onStar(item)} style={{ background: item.starred ? 'var(--gold-l)' : 'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'6px 10px', cursor:'pointer', color: item.starred ? '#f59e0b' : 'var(--ink3)' }}>
          <Icon name="star" size={14} color={item.starred ? '#f59e0b' : 'var(--ink3)'} />
        </button>
        <button onClick={()=>onDelete(item)} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'6px 10px', cursor:'pointer', color:'var(--red)' }}>
          <Icon name="trash" size={14} color="var(--red)" />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
        {(['details','activity'] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)}
            style={{ flex:1, padding:'10px 0', background:'none', border:'none', cursor:'pointer', fontSize:'var(--text-sm)', fontWeight:600, textTransform:'capitalize',
              color: tab===t ? GD.blue : 'var(--ink3)', borderBottom: tab===t ? `2px solid ${GD.blue}` : '2px solid transparent' }}
          >{t}</button>
        ))}
      </div>

      {tab === 'details' ? (
        <>
          <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            {[
              { label:'Owner',    value: item.owner_name },
              { label:'Size',     value: fmtSize(item.size) },
              { label:'Type',     value: cfg.label },
              { label:'Created',  value: fmtDate(item.created_at) },
              { label:'Modified', value: fmtDate(item.updated_at) },
              ...(item.type==='folder' ? [{ label:'Files', value: `${item.file_count} files` }] : []),
              ...(item.description ? [{ label:'Description', value: item.description }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:'var(--text-base)', color:'var(--ink)', fontWeight:500 }}>{value}</div>
              </div>
            ))}
          </div>

          {(item.shared ?? []).length > 0 && (
            <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)', marginBottom:10 }}>Shared with</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(item.shared ?? []).map(p => (
                  <div key={p.name} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <MiniAv name={p.name} size={28} />
                    <span style={{ fontSize:'var(--text-base)', color:'var(--ink)', flex:1 }}>{p.name}</span>
                    <span style={{ fontSize:'var(--text-xs)', color:'var(--ink3)' }}>{p.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:16 }}>
          {activity.map((a, idx) => (
            <div key={idx} style={{ display:'flex', gap:10 }}>
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:'50%', background:GD.blueL, flexShrink:0 }}>
                <Icon name={a.icon} size={13} color={GD.blue} />
              </span>
              <div>
                <div style={{ fontSize:'var(--text-sm)', color:'var(--ink)' }}>{a.text}</div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)', marginTop:2 }}>{fmtDate(a.date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Config ── */
export const TYPE_CFG: Record<string, { icon: IconName; color: string; bg: string; label: string }> = {
  folder: { icon:'folder',     color:'var(--gold)',   bg:'var(--gold-l)',   label:'Folder'  },
  pdf:    { icon:'file',       color:'var(--red)',    bg:'var(--red-l)',    label:'PDF'     },
  docx:   { icon:'fileText',   color:'var(--blue)',   bg:'var(--blue-l)',   label:'Word'    },
  doc:    { icon:'fileText',   color:'var(--blue)',   bg:'var(--blue-l)',   label:'Word'    },
  xlsx:   { icon:'barChart',   color:'var(--green)',  bg:'var(--green-l)',  label:'Excel'   },
  xls:    { icon:'barChart',   color:'var(--green)',  bg:'var(--green-l)',  label:'Excel'   },
  csv:    { icon:'barChart',   color:'var(--green)',  bg:'var(--green-l)',  label:'CSV'     },
  png:    { icon:'camera',     color:'var(--purple)', bg:'var(--purple-l)', label:'Image'   },
  jpg:    { icon:'camera',     color:'var(--purple)', bg:'var(--purple-l)', label:'Image'   },
  jpeg:   { icon:'camera',     color:'var(--purple)', bg:'var(--purple-l)', label:'Image'   },
  gif:    { icon:'camera',     color:'var(--purple)', bg:'var(--purple-l)', label:'GIF'     },
  pptx:   { icon:'layers',     color:'var(--gold)',   bg:'var(--gold-l)',   label:'Slides'  },
  zip:    { icon:'briefcase',  color:'var(--gold)',   bg:'var(--gold-l)',   label:'Archive' },
  rar:    { icon:'briefcase',  color:'var(--gold)',   bg:'var(--gold-l)',   label:'Archive' },
  txt:    { icon:'fileText',   color:'var(--ink3)',   bg:'var(--bg)',       label:'Text'    },
  xml:    { icon:'fileText',   color:'var(--blue)',   bg:'var(--blue-l)',   label:'XML'     },
  mp4:    { icon:'monitor',    color:'var(--purple)', bg:'var(--purple-l)', label:'Video'   },
  mp3:    { icon:'headphones', color:'var(--blue)',   bg:'var(--blue-l)',   label:'Audio'   },
};
export function tcfg(t: string) { return TYPE_CFG[t.toLowerCase()] ?? TYPE_CFG.txt; }

/* ── Connected Storage row — quick-glance cards for Box/Dropbox/Mega/OneDrive ── */
function ConnectedStorageRow({ connections, onOpen }: { connections: StorageConnection[]; onOpen: (provider: StorageProvider) => void }) {
  return (
    <div style={{ padding:'16px 20px 4px', background:'var(--white)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
      <div style={{ fontSize:'var(--text-sm)', fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Connected Storage</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, paddingBottom:16 }}>
        {STORAGE_PROVIDERS.map(p => {
          const conn = connections.find(c => c.provider === p.id);
          const isConnected = conn?.status === 'connected';
          const quota = PROVIDER_QUOTA[p.id];
          const pct = isConnected ? Math.min(100, Math.round(((conn?.total_size ?? 0) / quota) * 100)) : 0;
          return (
            <div
              key={p.id}
              onClick={()=>onOpen(p.id)}
              style={{ border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'14px 16px', cursor:'pointer', transition:'box-shadow .15s, border-color .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor=p.color; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--border)'; }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'var(--r-sm)', background:`${p.color}1a`, flexShrink:0 }}>
                  <Icon name={p.icon} size={16} color={p.color} />
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'var(--text-base)', fontWeight:600, color:'var(--ink)' }}>{p.name}</div>
                  <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)' }}>{isConnected ? `${conn!.file_count} files` : 'Not connected'}</div>
                </div>
              </div>
              {isConnected ? (
                <>
                  <div style={{ height:5, borderRadius:'var(--badge-radius)', background:'var(--bg)', overflow:'hidden', marginBottom:6 }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:p.color, borderRadius:'var(--badge-radius)' }} />
                  </div>
                  <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)' }}>{fmtSize(conn!.total_size)} / {fmtSize(quota)}</div>
                </>
              ) : (
                <div style={{ fontSize:'var(--text-xs)', color:GD.blue, fontWeight:600 }}>Connect →</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Recent row (Drive-home-style horizontal strip) ── */
function RecentRow({ items, onOpen }: { items: CloudFile[]; onOpen: (item: CloudFile) => void }) {
  if (items.length === 0) return null;
  return (
    <div style={{ padding:'16px 20px 4px', background:'var(--white)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
      <div style={{ fontSize:'var(--text-sm)', fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Recent</div>
      <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:16 }}>
        {items.map(item => {
          const cfg = item.type === 'folder' ? TYPE_CFG.folder : tcfg(item.type);
          return (
            <div
              key={item.id}
              onClick={()=>onOpen(item)}
              style={{ flex:'0 0 auto', width:168, border:'1px solid var(--border)', borderRadius:'var(--r)', cursor:'pointer', overflow:'hidden', background:'var(--white)', transition:'box-shadow .15s, border-color .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor=GD.blue; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--border)'; }}
            >
              <div style={{ height:64, display:'flex', alignItems:'center', justifyContent:'center', background:cfg.bg }}>
                {item.type === 'folder'
                  ? <Icon name="folder" size={28} color={item.color ?? '#f59e0b'} />
                  : <FileIcon type={item.type} size={32} />
                }
              </div>
              <div style={{ padding:'8px 10px' }}>
                <div style={{ fontSize:'var(--text-sm)', fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--ink3)', marginTop:2 }}>{fmtRelative(item.updated_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export const FileManager: React.FC = () => {
  const {
    files, loading, error, dismissError,
    currentView, currentFolderId, breadcrumb, openFolder, navToBreadcrumb, goToView,
    previewItemId, setPreviewItemId, search,
    uploadFiles, starItem, moveItem, renameItem,
    trashItem, restoreItem, permanentlyDelete, emptyTrash, shareItem, downloadItem,
    connections, loadConnections,
  } = useCloud();

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const allItems    = files.filter(i => !i.is_trash);
  const trashedItems = files.filter(i => i.is_trash);
  const previewItem = files.find(f => f.id === previewItemId) ?? null;
  const currentFolderItem = currentFolderId ? files.find(f => f.id === currentFolderId) ?? null : null;

  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [sortBy, setSortBy] = useState<'name'|'size'|'modified'>('modified');
  const [deleteTarget, setDeleteTarget] = useState<CloudFile|null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastAnchorId, setLastAnchorId] = useState<string|null>(null);
  const [shareTarget, setShareTarget] = useState<CloudFile|null>(null);
  const [moveTarget, setMoveTarget] = useState<string[]|null>(null);
  const [renameTarget, setRenameTarget] = useState<CloudFile|null>(null);
  const [renameValue, setRenameValue] = useState('');

  const catExt: Record<string, string[]> = {
    documents: ['pdf','docx','doc','xlsx','xls','csv','pptx','txt','xml'],
    images:    ['png','jpg','jpeg','gif','webp'],
    media:     ['mp4','mp3','mov','avi','wav'],
  };

  function clearSelection() { setSelectedIds(new Set()); setLastAnchorId(null); }

  const showRecentRow = currentView === 'all' && currentFolderId === null && !search && selectedIds.size === 0;
  const recentItems = showRecentRow
    ? [...allItems].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8)
    : [];

  // Derive displayed items
  const displayItems = (() => {
    let items = currentView === 'trash' ? trashedItems : allItems;
    if (currentView === 'all')       items = items.filter(i => i.parent_id === currentFolderId);
    else if (currentView === 'recent')    items = [...items].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,20);
    else if (currentView === 'starred')   items = items.filter(i => i.starred);
    else if (currentView === 'shared')    items = items.filter(i => (i.shared ?? []).length > 0);
    else if (catExt[currentView])         items = items.filter(i => catExt[currentView].includes(i.type));

    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    items = [...items].sort((a, b) => {
      if (a.type==='folder' && b.type!=='folder') return -1;
      if (a.type!=='folder' && b.type==='folder') return 1;
      if (sortBy==='name')     return a.name.localeCompare(b.name);
      if (sortBy==='size')     return (b.size??0) - (a.size??0);
      return b.updated_at.localeCompare(a.updated_at);
    });
    return items;
  })();

  const folders = displayItems.filter(i => i.type==='folder');
  const filesOnly = displayItems.filter(i => i.type!=='folder');
  const ordered = [...folders, ...filesOnly];
  const isTrashView = currentView === 'trash';

  function selectItem(item: CloudFile, e: React.MouseEvent) {
    if (e.shiftKey && lastAnchorId) {
      const ai = ordered.findIndex(i => i.id === lastAnchorId);
      const bi = ordered.findIndex(i => i.id === item.id);
      if (ai !== -1 && bi !== -1) {
        const [lo, hi] = ai < bi ? [ai, bi] : [bi, ai];
        setSelectedIds(new Set(ordered.slice(lo, hi+1).map(i => i.id)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const n = new Set(prev);
        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
        return n;
      });
      setLastAnchorId(item.id);
      return;
    }
    setSelectedIds(new Set([item.id]));
    setLastAnchorId(item.id);
    setPreviewItemId(item.id);
  }

  function openItem(item: CloudFile) {
    if (item.type === 'folder' && !isTrashView) { openFolder(item); clearSelection(); }
    else setPreviewItemId(item.id);
  }

  function handleStar(item: CloudFile) { starItem(item.id, !item.starred); }
  function handleDelete(item: CloudFile) { setDeleteTarget(item); }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (isTrashView) permanentlyDelete(deleteTarget.id);
    else trashItem(deleteTarget.id);
    if (previewItemId === deleteTarget.id) setPreviewItemId(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
    setDeleteTarget(null);
  }

  function handleRestore(item: CloudFile) { restoreItem(item.id); if (previewItemId === item.id) setPreviewItemId(null); }
  function handlePermanentDelete(item: CloudFile) { setDeleteTarget(item); }
  function handleDownload(item: CloudFile) { if (item.type !== 'folder') downloadItem(item); }

  function handleMoveHere(draggedId: string, targetFolderId: string) { moveItem(draggedId, targetFolderId); }

  function bulkAction(action: (item: CloudFile) => void) {
    const targets = files.filter(i => selectedIds.has(i.id));
    targets.forEach(action);
    clearSelection();
  }

  function selectForContextMenu(item: CloudFile) {
    setSelectedIds(prev => prev.has(item.id) ? prev : new Set([item.id]));
  }

  function openRename(item: CloudFile) { setRenameTarget(item); setRenameValue(item.name); }
  function confirmRename() {
    if (!renameTarget || !renameValue.trim()) return;
    renameItem(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
  }

  const menuHandlers: FileMenuHandlers = {
    onOpen: openItem, onRename: openRename,
    onStar: handleStar, onDelete: handleDelete, onDownload: handleDownload,
    onShare: setShareTarget, onMove: i => setMoveTarget([i.id]),
    onRestore: handleRestore, onPermanentDelete: handlePermanentDelete,
  };

  function handleDrop(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(DND_TYPE)) return; // internal move, handled by the target row/card
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length) uploadFiles(droppedFiles, currentFolderId);
  }

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPreviewItemId(null); clearSelection(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);


  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      {error && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 20px', background:'var(--red-l)', borderBottom:'1px solid var(--red)', color:'var(--red)', fontSize:'var(--text-base)' }}>
          <span>{error}</span>
          <button onClick={dismissError} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:4 }}><Icon name="close" size={14} color="var(--red)" /></button>
        </div>
      )}

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
      {PROVIDER_VIEWS.includes(currentView as StorageProvider) ? (
        <ProviderFilesPanel provider={currentView as StorageProvider} />
      ) : (
      <>
      {/* ── Main Area ── */}
      <div
        className="gd-main"
        style={{ position:'relative' }}
        onDragOver={e=>{ if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Toolbar */}
        {selectedIds.size === 0 ? (
          <div className="gd-header">
            {/* Breadcrumb */}
            <div className="gd-header-title" style={{ flex:'0 0 60%', maxWidth:'60%', minWidth:0 }}>
              {isTrashView ? (
                <span style={{ fontWeight:600 }}>Trash</span>
              ) : currentView !== 'all' ? (
                <span style={{ fontWeight:600, textTransform:'capitalize' }}>{currentView === 'shared' ? 'Shared with Me' : currentView}</span>
              ) : (
                <div className="gd-breadcrumb">
                  {breadcrumb.map((crumb, idx) => {
                    const isLast = idx === breadcrumb.length - 1;
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && <Icon name="chevronRight" size={16} color="var(--ink3)" className="gd-breadcrumb-sep" />}
                        <button
                          onClick={()=>!isLast && navToBreadcrumb(idx)}
                          className={`gd-breadcrumb-item${isLast ? ' gd-breadcrumb-item--current' : ''}`}
                          title={crumb.name}
                        >
                          {crumb.name}
                        </button>
                        {isLast && currentFolderItem && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="gd-breadcrumb-chevron" title="Folder options">
                                <Icon name="chevronDown" size={16} color="var(--ink3)" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[190px]">
                              <FileMenuItems item={currentFolderItem} isTrashed={false} handlers={menuHandlers} ItemComp={DropdownMenuItem} SeparatorComp={DropdownMenuSeparator} />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {currentFolderItem && (
                    <button className="gd-breadcrumb-people" title="Share this folder" onClick={()=>setShareTarget(currentFolderItem)}>
                      <Icon name="users" size={15} color="var(--ink3)" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10, flex:'1 1 40%', minWidth:0, justifyContent:'flex-end' }}>
              {isTrashView && trashedItems.length > 0 && (
                <button onClick={async ()=>{ if((await showConfirm('Empty trash? This permanently deletes all items in Trash.', { confirmLabel: 'Empty Trash' }))) emptyTrash(); }} className="btn btn-secondary btn-sm" style={{ gap:6, whiteSpace:'nowrap', flexShrink:0 }}>
                  <Icon name="trash2" size={13} /> Empty trash
                </button>
              )}

              {/* Sort */}
              <Select value={sortBy} onValueChange={v=>setSortBy(v as 'name'|'size'|'modified')}>
                <SelectTrigger className="input-field" aria-label="Sort by" style={{ width:150, flexShrink:0, fontSize:'var(--text-sm)' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="modified">Last Modified</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="size">Size</SelectItem>
                </SelectContent>
              </Select>

              {/* View toggle */}
              <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', overflow:'hidden', flexShrink:0 }}>
                {(['grid','list'] as const).map(m => (
                  <button key={m} onClick={()=>setViewMode(m)} title={m==='grid' ? 'Grid view' : 'List view'} style={{ padding:'11px 12px', display:'flex', alignItems:'center', background: viewMode===m ? GD.blue : 'var(--white)', border:'none', cursor:'pointer', color: viewMode===m ? '#fff' : 'var(--ink3)' }}>
                    <Icon name={m==='grid' ? 'grid' : 'list'} size={14} color={viewMode===m ? '#fff' : 'var(--ink3)'} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Bulk selection toolbar ── */
          <div style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 20px', background:GD.blueL, borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <button onClick={clearSelection} style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:GD.blue, display:'flex' }}><Icon name="x" size={18} color={GD.blue} /></button>
            <span style={{ fontSize:'var(--text-base)', fontWeight:600, color:GD.blue }}>{selectedIds.size} selected</span>
            <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
              {isTrashView ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={()=>bulkAction(i=>restoreItem(i.id))}><Icon name="refresh" size={14} /> Restore</button>
                  <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={async ()=>{ if((await showConfirm(`Permanently delete ${selectedIds.size} item(s)?`, { confirmLabel: 'Delete Forever' }))) bulkAction(i=>permanentlyDelete(i.id)); }}><Icon name="trash2" size={14} color="var(--red)" /> Delete forever</button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={()=>bulkAction(i=>{ if (i.type!=='folder') downloadItem(i); })}><Icon name="download" size={14} /> Download</button>
                  {selectedIds.size === 1 && <button className="btn btn-ghost btn-sm" onClick={()=>setShareTarget(files.find(i=>selectedIds.has(i.id))!)}><Icon name="userPlus" size={14} /> Share</button>}
                  <button className="btn btn-ghost btn-sm" onClick={()=>setMoveTarget([...selectedIds])}><Icon name="folderOpen" size={14} /> Move to</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>bulkAction(i=>starItem(i.id, true))}><Icon name="star" size={14} /> Star</button>
                  <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={()=>bulkAction(i=>trashItem(i.id))}><Icon name="trash" size={14} color="var(--red)" /> Move to trash</button>
                </>
              )}
            </div>
          </div>
        )}

        {showRecentRow && <ConnectedStorageRow connections={connections} onOpen={goToView} />}
        {showRecentRow && <RecentRow items={recentItems} onOpen={openItem} />}

        {/* Content */}
        <div className="gd-content" onClick={e=>{ if (e.target === e.currentTarget) clearSelection(); }}>
          {/* Drag overlay */}
          {dragOver && (
            <div style={{ position:'absolute', inset:0, zIndex:100, background:'rgba(26,115,232,.06)', border:`2px dashed ${GD.blue}`, borderRadius:'var(--r)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, pointerEvents:'none' }}>
              <Icon name="upload" size={40} color={GD.blue} />
              <span style={{ fontSize:'var(--text-lg)', fontWeight:600, color:GD.blue }}>Drop files here to upload</span>
            </div>
          )}

          {loading && files.length === 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--ink3)', fontSize:'var(--text-md)' }}>Loading your Drive…</div>
          )}

          {!loading && displayItems.length === 0 && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12, color:'var(--ink3)' }}>
              <Icon name={isTrashView ? 'trash' : 'folder'} size={48} color="var(--border)" />
              <span style={{ fontSize:'var(--text-md)' }}>{isTrashView ? 'Trash is empty' : 'No files found'}</span>
            </div>
          )}

          {/* Folders section */}
          {folders.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div className="gd-section-title">
                Folders <span style={{ fontWeight:400 }}>({folders.length})</span>
              </div>
              {viewMode==='grid' ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
                  {folders.map(item => (
                    <FolderCard key={item.id} item={item} selected={selectedIds.has(item.id)} isTrashed={isTrashView} menuHandlers={menuHandlers}
                      onClick={e=>selectItem(item, e)}
                      onDoubleClick={()=>openItem(item)}
                      onContextMenuOpen={()=>selectForContextMenu(item)}
                      onMoveHere={draggedId=>handleMoveHere(draggedId, item.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rtbl-wrap" style={{ border:'1px solid var(--border)' }}>
                <table className="rtbl" style={{ borderCollapse:'collapse', background:'var(--white)' }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Name','Owner',isTrashView ? 'Deleted' : 'Last modified','File size','Shared',''].map(h=>(
                        <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:'var(--text-xs)', fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map(item => (
                      <FileRow key={item.id} item={item} selected={selectedIds.has(item.id)} isTrashed={isTrashView} menuHandlers={menuHandlers}
                        onClick={e=>selectItem(item, e)}
                        onDoubleClick={()=>openItem(item)}
                        onContextMenuOpen={()=>selectForContextMenu(item)}
                        onMoveHere={draggedId=>handleMoveHere(draggedId, item.id)}
                      />
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}

          {/* Files section */}
          {filesOnly.length > 0 && (
            <div>
              <div className="gd-section-title">
                Files <span style={{ fontWeight:400 }}>({filesOnly.length})</span>
              </div>
              {viewMode==='grid' ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
                  {filesOnly.map(item => (
                    <FileCard key={item.id} item={item} selected={selectedIds.has(item.id)} isTrashed={isTrashView} menuHandlers={menuHandlers}
                      onClick={e=>selectItem(item, e)}
                      onDoubleClick={()=>openItem(item)}
                      onContextMenuOpen={()=>selectForContextMenu(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rtbl-wrap" style={{ border:'1px solid var(--border)' }}>
                <table className="rtbl" style={{ borderCollapse:'collapse', background:'var(--white)' }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Name','Owner',isTrashView ? 'Deleted' : 'Last modified','File size','Shared',''].map(h=>(
                        <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:'var(--text-xs)', fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filesOnly.map(item => (
                      <FileRow key={item.id} item={item} selected={selectedIds.has(item.id)} isTrashed={isTrashView} menuHandlers={menuHandlers}
                        onClick={e=>selectItem(item, e)}
                        onDoubleClick={()=>openItem(item)}
                        onContextMenuOpen={()=>selectForContextMenu(item)}
                      />
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Preview Panel ── */}
      {previewItem && (
        <PreviewPanel
          item={previewItem}
          onClose={()=>setPreviewItemId(null)}
          onStar={handleStar}
          onDownload={handleDownload}
          onDelete={handleDelete}
          onShare={setShareTarget}
        />
      )}

      {/* ── Share Modal ── */}
      {shareTarget && (
        <ShareModal
          item={shareTarget}
          onClose={()=>setShareTarget(null)}
          onSave={shared => shareItem(shareTarget.id, shared)}
        />
      )}

      {/* ── Rename Modal ── */}
      {renameTarget && (
        <div className="modal-overlay" onClick={()=>setRenameTarget(null)}>
          <div className="card" style={{ width:380, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <span style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--ink)' }}>Rename {renameTarget.type==='folder' ? 'folder' : 'file'}</span>
              <button onClick={()=>setRenameTarget(null)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <input
              autoFocus
              value={renameValue}
              onChange={e=>setRenameValue(e.target.value)}
              onKeyDown={e=>{ if (e.key==='Enter') confirmRename(); }}
              className="input-field"
              style={{ width:'100%', marginBottom:20 }}
            />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setRenameTarget(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={confirmRename} className="btn btn-primary btn-sm" disabled={!renameValue.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Move-to Modal ── */}
      {moveTarget && (
        <MoveToModal
          ids={moveTarget}
          allItems={allItems}
          onClose={()=>setMoveTarget(null)}
          onMove={dest => { moveTarget.forEach(id => moveItem(id, dest)); clearSelection(); }}
        />
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={()=>setDeleteTarget(null)}>
          <div className="card" style={{ width:380, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--ink)' }}>{isTrashView ? 'Delete Forever' : `Move ${deleteTarget.type==='folder' ? 'Folder' : 'File'} to Trash`}</span>
              <button onClick={()=>setDeleteTarget(null)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px', background:'var(--bg)', borderRadius:'var(--r)', marginBottom:16 }}>
              {deleteTarget.type==='folder'
                ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:'var(--r)', background:`${deleteTarget.color ?? '#f59e0b'}22` }}><Icon name="folder" size={18} color={deleteTarget.color ?? '#f59e0b'} /></span>
                : <FileIcon type={deleteTarget.type} size={36} />
              }
              <div>
                <div style={{ fontSize:'var(--text-base)', fontWeight:600, color:'var(--ink)', wordBreak:'break-all' }}>{deleteTarget.name}</div>
                <div style={{ fontSize:'var(--text-sm)', color:'var(--ink3)', marginTop:2 }}>{fmtSize(deleteTarget.size)}</div>
              </div>
            </div>
            <p style={{ fontSize:'var(--text-base)', color:'var(--ink2)', margin:'0 0 20px', lineHeight:1.5 }}>
              {isTrashView
                ? 'This will be permanently deleted and cannot be recovered.'
                : deleteTarget.type==='folder'
                  ? `This folder and all ${deleteTarget.file_count} files inside will be moved to Trash.`
                  : 'This file will be moved to Trash. You can restore it later.'}
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setDeleteTarget(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={confirmDelete} className="btn btn-danger btn-sm">{isTrashView ? 'Delete Forever' : 'Move to Trash'}</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
    </div>
  );
};
