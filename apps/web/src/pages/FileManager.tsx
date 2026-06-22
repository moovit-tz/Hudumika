import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.jsx';

// SAMPLE and FSItem moved to fileManagerStore.ts

const STORAGE_TOTAL = 100 * 1_073_741_824;
const STORAGE_USED  = 47.8 * 1_073_741_824;

/* ── Helpers ── */
function fmtSize(b?: number): string {
  if (!b) return '—';
  if (b >= 1_073_741_824) return `${(b/1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)     return `${(b/1_048_576).toFixed(1)} MB`;
  if (b >= 1024)          return `${(b/1024).toFixed(0)} KB`;
  return `${b} B`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function extOf(name: string) { return name.split('.').pop()?.toLowerCase() ?? 'txt'; }

const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#1a7f37','#9a6700','#cf222e','#d05c30','#0e7490'];
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

/* ── File Type Icon ── */
function FileIcon({ type, size=36 }: { type: string; size?: number }) {
  const cfg = tcfg(type);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, borderRadius: 9, background:cfg.bg, flexShrink:0 }}>
      <Icon name={cfg.icon} size={size*0.5} color={cfg.color} />
    </span>
  );
}

/* ── Context Menu ── */
interface CtxMenuProps {
  item: FSItem;
  x: number;
  y: number;
  onClose: () => void;
  onStar: (id: string) => void;
  onDelete: (item: FSItem) => void;
  onDownload: (item: FSItem) => void;
  isStarred: boolean;
}
function ContextMenu({ item, x, y, onClose, onStar, onDelete, onDownload, isStarred }: CtxMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position:'fixed', left:x, top:y, zIndex:9999,
    background:'var(--white)', border:'1px solid var(--border)', borderRadius: 9,
    boxShadow:'0 8px 24px rgba(0,0,0,.12)', padding:'4px 0', minWidth:180,
  };
  const rowStyle = (danger=false): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:10, padding:'8px 14px', cursor:'pointer',
    color: danger ? 'var(--red)' : 'var(--ink)', fontSize:13, transition:'background .1s',
  });

  const items = [
    { icon:'eye' as IconName,         label:'Preview',     action:()=>{ onClose(); } },
    { icon:'download' as IconName,    label:'Download',    action:()=>{ onDownload(item); onClose(); } },
    { icon:'copy' as IconName,        label:'Duplicate',   action:()=>{ onClose(); } },
    { icon:'send' as IconName,        label:'Share Link',  action:()=>{ onClose(); } },
    { icon:(isStarred ? 'star' : 'star') as IconName, label: isStarred ? 'Unstar' : 'Star', action:()=>{ onStar(item.id); onClose(); } },
    { icon:'edit' as IconName,        label:'Rename',      action:()=>{ onClose(); } },
    null,
    { icon:'trash' as IconName,       label:'Delete',      action:()=>{ onDelete(item); onClose(); }, danger:true },
  ];

  return (
    <div ref={ref} style={menuStyle}>
      {items.map((it, idx) =>
        it === null
          ? <div key={idx} style={{ height:1, background:'var(--border)', margin:'4px 0' }} />
          : (
            <div
              key={idx}
              style={rowStyle(it.danger)}
              onMouseEnter={e => (e.currentTarget.style.background='var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background='transparent')}
              onClick={it.action}
            >
              <Icon name={it.icon} size={14} color={it.danger ? 'var(--red)' : 'var(--ink3)'} />
              <span>{it.label}</span>
              {it.label==='Star' && isStarred && <Icon name="star" size={12} color="#f59e0b" style={{ marginLeft:'auto' }} />}
            </div>
          )
      )}
    </div>
  );
}

/* ── Folder Card ── */
function FolderCard({ item, starred, onClick, onCtx }: { item: FSItem; starred: boolean; onClick: ()=>void; onCtx: (e: React.MouseEvent)=>void }) {
  const [hov, setHov] = useState(false);
  const color = item.color ?? '#f59e0b';
  return (
    <div
      onClick={onClick}
      onContextMenu={e=>{ e.preventDefault(); onCtx(e); }}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{ background:'var(--white)', border:`1px solid ${hov ? color : 'var(--border)'}`, borderRadius: 9, padding:'14px 16px', cursor:'pointer', transition:'box-shadow .15s, border-color .15s', boxShadow: hov ? '0 4px 16px rgba(0,0,0,.08)' : '0 1px 3px rgba(0,0,0,.04)', position:'relative' }}
    >
      {starred && <Icon name="star" size={12} color="#f59e0b" style={{ position:'absolute', top:10, right:10 }} />}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
        <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius: 9, background:`${color}22` }}>
          <Icon name="folder" size={20} color={color} />
        </span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
          <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>{item.fileCount} files</div>
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--ink3)' }}>{fmtSize(item.size)}</span>
        <span style={{ fontSize:11, color:'var(--ink3)' }}>{fmtDate(item.modified)}</span>
      </div>
    </div>
  );
}

/* ── File Grid Card ── */
function FileCard({ item, starred, onClick, onCtx }: { item: FSItem; starred: boolean; onClick: ()=>void; onCtx: (e: React.MouseEvent)=>void }) {
  const [hov, setHov] = useState(false);
  const cfg = tcfg(item.type);
  return (
    <div
      onClick={onClick}
      onContextMenu={e=>{ e.preventDefault(); onCtx(e); }}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{ background:'var(--white)', border:`1px solid ${hov ? cfg.color : 'var(--border)'}`, borderRadius: 9, padding:'14px 16px', cursor:'pointer', transition:'box-shadow .15s, border-color .15s', boxShadow: hov ? '0 4px 16px rgba(0,0,0,.08)' : '0 1px 3px rgba(0,0,0,.04)', position:'relative' }}
    >
      {starred && <Icon name="star" size={12} color="#f59e0b" style={{ position:'absolute', top:10, right:10 }} />}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
        <FileIcon type={item.type} size={40} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)', wordBreak:'break-all', lineHeight:1.3 }}>{item.name}</div>
          <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>{cfg.label}</div>
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--ink3)' }}>{fmtSize(item.size)}</span>
        <div style={{ display:'flex', gap:-4 }}>
          {(item.shared ?? []).slice(0,3).map((n,i) =>
            <span key={i} style={{ marginLeft: i>0 ? -6 : 0 }}><MiniAv name={n} size={18} /></span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── File List Row ── */
function FileRow({ item, starred, onClick, onCtx, onStar, onDelete, onDownload }: { item: FSItem; starred: boolean; onClick: ()=>void; onCtx: (e: React.MouseEvent)=>void; onStar:(id:string)=>void; onDelete:(item:FSItem)=>void; onDownload:(item:FSItem)=>void }) {
  const [hov, setHov] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cfg = item.type === 'folder' ? TYPE_CFG.folder : tcfg(item.type);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ x:0, y:0 });

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: r.left, y: r.bottom + 4 });
    setMenuOpen(true);
  }

  return (
    <>
      <tr
        onMouseEnter={()=>setHov(true)}
        onMouseLeave={()=>setHov(false)}
        onContextMenu={e=>{ e.preventDefault(); onCtx(e); }}
        style={{ background: hov ? 'var(--bg)' : 'transparent', transition:'background .1s', cursor:'pointer' }}
        onClick={onClick}
      >
        <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {item.type === 'folder'
              ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius: 9, background:`${item.color ?? '#f59e0b'}22` }}><Icon name="folder" size={16} color={item.color ?? '#f59e0b'} /></span>
              : <FileIcon type={item.type} size={32} />
            }
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{item.name}</div>
              {item.type==='folder' && <div style={{ fontSize:11, color:'var(--ink3)' }}>{item.fileCount} files</div>}
            </div>
            {starred && <Icon name="star" size={12} color="#f59e0b" style={{ marginLeft:4 }} />}
          </div>
        </td>
        <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--ink3)', whiteSpace:'nowrap' }}>{fmtSize(item.size)}</td>
        <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize:11, fontWeight:600, color:cfg.color, background:cfg.bg, padding:'2px 8px', borderRadius:20 }}>{cfg.label}</span>
        </td>
        <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--ink3)', whiteSpace:'nowrap' }}>{fmtDate(item.modified)}</td>
        <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', gap:-4 }}>
            {(item.shared ?? []).slice(0,3).map((n,i)=><span key={i} style={{ marginLeft:i>0?-6:0 }}><MiniAv name={n} size={20} /></span>)}
          </div>
        </td>
        <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }} onClick={e=>e.stopPropagation()}>
          <button ref={btnRef} onClick={openMenu} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:6, color:'var(--ink3)', display: hov ? 'flex' : 'flex', alignItems:'center' }}>
            <Icon name="moreHorizontal" size={16} />
          </button>
          {menuOpen && <ContextMenu item={item} x={menuPos.x} y={menuPos.y} onClose={()=>setMenuOpen(false)} onStar={onStar} onDelete={onDelete} onDownload={onDownload} isStarred={starred} />}
        </td>
      </tr>
    </>
  );
}

/* ── Preview Panel ── */
function PreviewPanel({ item, starred, onClose, onStar, onDownload, onDelete }: { item: FSItem; starred: boolean; onClose: ()=>void; onStar:(id:string)=>void; onDownload:(item:FSItem)=>void; onDelete:(item:FSItem)=>void }) {
  const cfg = item.type === 'folder' ? TYPE_CFG.folder : tcfg(item.type);
  return (
    <div style={{ width:300, flexShrink:0, borderLeft:'1px solid var(--border)', background:'var(--white)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Details</span>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:6, color:'var(--ink3)' }}><Icon name="close" size={16} /></button>
      </div>

      {/* Icon + name */}
      <div style={{ padding:24, display:'flex', flexDirection:'column', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)', textAlign:'center' }}>
        {item.type === 'folder'
          ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:64, height:64, borderRadius: 9, background:`${item.color ?? '#f59e0b'}22` }}><Icon name="folder" size={32} color={item.color ?? '#f59e0b'} /></span>
          : <FileIcon type={item.type} size={64} />
        }
        <div style={{ fontSize:14, fontWeight:600, color:'var(--ink)', wordBreak:'break-all', lineHeight:1.4 }}>{item.name}</div>
        <span style={{ fontSize:11, fontWeight:600, color:cfg.color, background:cfg.bg, padding:'3px 10px', borderRadius:20 }}>{cfg.label}</span>
      </div>

      {/* Action buttons */}
      <div style={{ padding:'12px 16px', display:'flex', gap:8, borderBottom:'1px solid var(--border)' }}>
        <button onClick={()=>onDownload(item)} className="btn btn-primary btn-sm" style={{ flex:1 }}>
          <Icon name="download" size={13} /> Download
        </button>
        <button onClick={()=>onStar(item.id)} style={{ background: starred ? '#fef3c7' : 'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', cursor:'pointer', color: starred ? '#f59e0b' : 'var(--ink3)' }}>
          <Icon name="star" size={14} color={starred ? '#f59e0b' : 'var(--ink3)'} />
        </button>
        <button onClick={()=>onDelete(item)} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', cursor:'pointer', color:'var(--red)' }}>
          <Icon name="trash" size={14} color="var(--red)" />
        </button>
      </div>

      {/* Info */}
      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
        {[
          { label:'Size',     value: fmtSize(item.size) },
          { label:'Type',     value: cfg.label },
          { label:'Created',  value: fmtDate(item.created) },
          { label:'Modified', value: fmtDate(item.modified) },
          ...(item.fileCount !== undefined ? [{ label:'Files', value: `${item.fileCount} files` }] : []),
          ...(item.description ? [{ label:'Description', value: item.description }] : []),
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:13, color:'var(--ink)', fontWeight:500 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Shared with */}
      {(item.shared ?? []).length > 0 && (
        <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:10 }}>Shared with</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(item.shared ?? []).map(name => (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <MiniAv name={name} size={28} />
                <span style={{ fontSize:13, color:'var(--ink)' }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Storage Bar ── */
function StorageBar() {
  const pct = Math.round((STORAGE_USED/STORAGE_TOTAL)*100);
  const cats = [
    { label:'Documents', pct:42, color:'var(--teal)' },
    { label:'Images',    pct:18, color:'#a855f7' },
    { label:'Media',     pct:12, color:'#f97316' },
    { label:'Other',     pct:28, color:'var(--ink3)' },
  ];
  return (
    <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', marginTop:'auto' }}>
      <div style={{ fontSize:12, fontWeight:600, color:'var(--ink)', marginBottom:10 }}>Storage Used</div>
      <div style={{ height:6, borderRadius:99, background:'var(--border)', overflow:'hidden', marginBottom:8 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:'var(--teal)', borderRadius:99, transition:'width .3s' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ink3)', marginBottom:12 }}>
        <span>{fmtSize(STORAGE_USED)} used</span>
        <span>{fmtSize(STORAGE_TOTAL)} total</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {cats.map(c => (
          <div key={c.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:99, background:c.color, flexShrink:0 }} />
            <span style={{ fontSize:11, color:'var(--ink3)', flex:1 }}>{c.label}</span>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--ink)' }}>{c.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useFiles, addFile, addFolder, deleteFile as rmFile, FSItem } from '../data/fileManagerStore.js';

/* ── Config ── */
const TYPE_CFG: Record<string, { icon: IconName; color: string; bg: string; label: string }> = {
  folder: { icon:'folder',     color:'#f59e0b',      bg:'#fef3c7',        label:'Folder'  },
  pdf:    { icon:'file',       color:'#ef4444',      bg:'#fef2f2',        label:'PDF'     },
  docx:   { icon:'fileText',   color:'#3b82f6',      bg:'#eff6ff',        label:'Word'    },
  doc:    { icon:'fileText',   color:'#3b82f6',      bg:'#eff6ff',        label:'Word'    },
  xlsx:   { icon:'barChart',   color:'#22c55e',      bg:'#f0fdf4',        label:'Excel'   },
  xls:    { icon:'barChart',   color:'#22c55e',      bg:'#f0fdf4',        label:'Excel'   },
  csv:    { icon:'barChart',   color:'#16a34a',      bg:'#dcfce7',        label:'CSV'     },
  png:    { icon:'camera',     color:'#a855f7',      bg:'#faf5ff',        label:'Image'   },
  jpg:    { icon:'camera',     color:'#a855f7',      bg:'#faf5ff',        label:'Image'   },
  jpeg:   { icon:'camera',     color:'#a855f7',      bg:'#faf5ff',        label:'Image'   },
  gif:    { icon:'camera',     color:'#a855f7',      bg:'#faf5ff',        label:'GIF'     },
  pptx:   { icon:'layers',     color:'#f97316',      bg:'#fff7ed',        label:'Slides'  },
  zip:    { icon:'briefcase',  color:'#ca8a04',      bg:'#fefce8',        label:'Archive' },
  rar:    { icon:'briefcase',  color:'#ca8a04',      bg:'#fefce8',        label:'Archive' },
  txt:    { icon:'fileText',   color:'#6b7280',      bg:'#f9fafb',        label:'Text'    },
  xml:    { icon:'fileText',   color:'#0891b2',      bg:'#ecfeff',        label:'XML'     },
  mp4:    { icon:'monitor',    color:'#7c3aed',      bg:'#ede9fe',        label:'Video'   },
  mp3:    { icon:'headphones', color:'#0891b2',      bg:'#cffafe',        label:'Audio'   },
};
function tcfg(t: string) { return TYPE_CFG[t.toLowerCase()] ?? TYPE_CFG.txt; }

const FOLDER_COLORS = ['#f59e0b','#3b82f6','#22c55e','#a855f7','#0891b2','#ef4444','#f97316','#6366f1'];

/* ── Main Component ── */
type NavView = 'all' | 'recent' | 'starred' | 'shared' | 'trash' | 'documents' | 'images' | 'media';

export const FileManager: React.FC = () => {
  const allItems = useFiles();
  const [currentFolderId, setCurrentFolderId] = useState<string|null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{id:string|null; name:string}[]>([{id:null, name:'My Files'}]);
  const [navView, setNavView] = useState<NavView>('all');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'size'|'modified'>('modified');
  const [previewItem, setPreviewItem] = useState<FSItem|null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [deleteTarget, setDeleteTarget] = useState<FSItem|null>(null);
  const [ctxMenu, setCtxMenu] = useState<{item:FSItem;x:number;y:number}|null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set(allItems.filter(i=>i.starred).map(i=>i.id)));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems: { view: NavView; icon: IconName; label: string }[] = [
    { view:'all',       icon:'folder',     label:'My Files'       },
    { view:'recent',    icon:'clock',       label:'Recent'         },
    { view:'starred',   icon:'star',        label:'Starred'        },
    { view:'shared',    icon:'users',       label:'Shared with Me' },
    { view:'trash',     icon:'trash',       label:'Trash'          },
  ];
  const catItems: { view: NavView; icon: IconName; label: string; ext: string[] }[] = [
    { view:'documents', icon:'fileText',    label:'Documents',  ext:['pdf','docx','doc','xlsx','xls','csv','pptx','txt','xml'] },
    { view:'images',    icon:'camera',      label:'Images',     ext:['png','jpg','jpeg','gif','webp'] },
    { view:'media',     icon:'monitor',     label:'Media',      ext:['mp4','mp3','mov','avi','wav'] },
  ];

  // Derive displayed items
  const displayItems = (() => {
    let items = allItems;
    if (navView === 'all')       items = items.filter(i => i.parentId === currentFolderId && !i.id.startsWith('__trash_'));
    else if (navView === 'recent')    items = [...items].sort((a,b)=>b.modified.localeCompare(a.modified)).slice(0,20);
    else if (navView === 'starred')   items = items.filter(i => starredIds.has(i.id));
    else if (navView === 'shared')    items = items.filter(i => (i.shared ?? []).length > 0);
    else if (navView === 'trash')     items = [];
    else if (navView === 'documents') items = items.filter(i => ['pdf','docx','doc','xlsx','xls','csv','pptx','txt','xml'].includes(i.type) && !catItems.find(c=>c.view!=='documents'));
    else if (navView === 'images')    items = items.filter(i => ['png','jpg','jpeg','gif','webp'].includes(i.type));
    else if (navView === 'media')     items = items.filter(i => ['mp4','mp3','mov','avi','wav'].includes(i.type));

    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    items = [...items].sort((a, b) => {
      if (a.type==='folder' && b.type!=='folder') return -1;
      if (a.type!=='folder' && b.type==='folder') return 1;
      if (sortBy==='name')     return a.name.localeCompare(b.name);
      if (sortBy==='size')     return (b.size??0) - (a.size??0);
      return b.modified.localeCompare(a.modified);
    });
    return items;
  })();

  const folders = displayItems.filter(i => i.type==='folder');
  const files   = displayItems.filter(i => i.type!=='folder');

  function openFolder(item: FSItem) {
    setCurrentFolderId(item.id);
    setBreadcrumb(prev => [...prev, { id:item.id, name:item.name }]);
    setNavView('all');
    setPreviewItem(null);
  }

  function navToBreadcrumb(idx: number) {
    const crumb = breadcrumb[idx];
    setBreadcrumb(prev => prev.slice(0, idx+1));
    setCurrentFolderId(crumb.id);
    setPreviewItem(null);
  }

  function handleStar(id: string) {
    setStarredIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function handleDelete(item: FSItem) { setDeleteTarget(item); }

  function confirmDelete() {
    if (!deleteTarget) return;
    rmFile(deleteTarget.id);
    if (previewItem?.id === deleteTarget.id) setPreviewItem(null);
    setDeleteTarget(null);
  }

  function handleDownload(item: FSItem) {
    // simulate download notification
    const a = document.createElement('a');
    a.href = '#';
    a.download = item.name;
    a.click();
  }

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    addFolder(newFolderName.trim(), currentFolderId, newFolderColor);
    setNewFolderName('');
    setNewFolderColor(FOLDER_COLORS[0]);
    setShowCreateFolder(false);
  }

  function handleCtx(item: FSItem, e: React.MouseEvent) {
    setCtxMenu({ item, x:e.clientX, y:e.clientY });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(f => {
      addFile({
        name: f.name,
        type: extOf(f.name),
        size: f.size,
        modified: new Date().toISOString().split('T')[0],
        created: new Date().toISOString().split('T')[0],
        parentId: currentFolderId,
      });
    });
  }

  // Close ctx on outside click handled inside ContextMenu; also close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCtxMenu(null); setPreviewItem(null); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius: 9, cursor:'pointer',
    color: active ? 'var(--teal)' : 'var(--ink2)', fontWeight: active ? 600 : 400,
    background: active ? 'var(--teal-l)' : 'transparent', fontSize:13, transition:'background .1s, color .1s',
    userSelect:'none',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <PageHeader
        crumbs={['Tools', 'Documents']}
        titlePlain="File"
        titleEm="storage"
        subtitle="Manage your documents, uploads and shared files."
      />
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
      {/* ── Left Sidebar ── */}
      <div style={{ width:240, flexShrink:0, background:'var(--white)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'18px 16px 8px' }}>

          {/* Upload button */}
          <button onClick={()=>fileInputRef.current?.click()} className="btn btn-primary btn-sm" style={{ width:'100%', justifyContent:'center', gap:6, marginBottom:8 }}>
            <Icon name="upload" size={13} /> Upload File
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display:'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              files.forEach(f => {
                addFile({
                  name: f.name,
                  type: extOf(f.name),
                  size: f.size,
                  modified: new Date().toISOString().split('T')[0],
                  created: new Date().toISOString().split('T')[0],
                  parentId: currentFolderId,
                });
              });
              e.target.value='';
            }}
          />
        </div>

        {/* Main nav */}
        <div style={{ padding:'0 8px' }}>
          {navItems.map(n => (
            <div key={n.view}
              style={sidebarItemStyle(navView===n.view)}
              onClick={()=>{ setNavView(n.view); if (n.view==='all') { setCurrentFolderId(null); setBreadcrumb([{id:null,name:'My Files'}]); } }}
              onMouseEnter={e=>{ if(navView!==n.view) e.currentTarget.style.background='var(--bg)'; }}
              onMouseLeave={e=>{ if(navView!==n.view) e.currentTarget.style.background='transparent'; }}
            >
              <Icon name={n.icon} size={15} color={navView===n.view ? 'var(--teal)' : 'var(--ink3)'} />
              <span>{n.label}</span>
            </div>
          ))}
        </div>

        {/* Categories */}
        <div style={{ padding:'16px 8px 0' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', letterSpacing:'0.08em', textTransform:'uppercase', padding:'0 4px', marginBottom:6 }}>Categories</div>
          {catItems.map(c => (
            <div key={c.view}
              style={sidebarItemStyle(navView===c.view)}
              onClick={()=>setNavView(c.view)}
              onMouseEnter={e=>{ if(navView!==c.view) e.currentTarget.style.background='var(--bg)'; }}
              onMouseLeave={e=>{ if(navView!==c.view) e.currentTarget.style.background='transparent'; }}
            >
              <Icon name={c.icon} size={15} color={navView===c.view ? 'var(--teal)' : 'var(--ink3)'} />
              <span>{c.label}</span>
              <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink3)' }}>
                {allItems.filter(i=>c.ext.includes(i.type)).length}
              </span>
            </div>
          ))}
        </div>

        {/* Quick access */}
        <div style={{ padding:'16px 8px 0' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)', letterSpacing:'0.08em', textTransform:'uppercase', padding:'0 4px', marginBottom:6 }}>Quick Access</div>
          {[...allItems].filter(i=>starredIds.has(i.id)).slice(0,4).map(item => (
            <div key={item.id}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', transition:'background .1s' }}
              onClick={()=>{ if(item.type==='folder') openFolder(item); else setPreviewItem(item); }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              {item.type==='folder'
                ? <Icon name="folder" size={14} color={item.color ?? '#f59e0b'} />
                : <FileIcon type={item.type} size={20} />
              }
              <span style={{ fontSize:12, color:'var(--ink2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{item.name}</span>
            </div>
          ))}
        </div>

        <StorageBar />
      </div>

      {/* ── Main Area ── */}
      <div
        style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}
        onDragOver={e=>{ e.preventDefault(); setDragOver(true); }}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 20px', background:'var(--white)', borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap' }}>
          {/* Breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:4, flex:1, minWidth:0 }}>
            {breadcrumb.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <Icon name="chevronRight" size={12} color="var(--ink3)" />}
                <button
                  onClick={()=>navToBreadcrumb(idx)}
                  style={{ background:'none', border:'none', padding:'2px 4px', borderRadius:4, cursor: idx<breadcrumb.length-1 ? 'pointer' : 'default', color: idx===breadcrumb.length-1 ? 'var(--ink)' : 'var(--ink3)', fontWeight: idx===breadcrumb.length-1 ? 600 : 400, fontSize:14 }}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Search */}
          <div style={{ position:'relative' }}>
            <Icon name="search" size={14} color="var(--ink3)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} />
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Search files…"
              className="input-field"
              style={{ paddingLeft:32, width:200, fontSize:13, height:34 }}
            />
          </div>

          {/* Sort */}
          <select value={sortBy} onChange={e=>setSortBy(e.target.value as 'name'|'size'|'modified')} className="input-field" style={{ fontSize:12, height:34, paddingRight:8 }}>
            <option value="modified">Last Modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>

          {/* View toggle */}
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
            {(['grid','list'] as const).map(m => (
              <button key={m} onClick={()=>setViewMode(m)} style={{ padding:'6px 10px', background: viewMode===m ? 'var(--teal)' : 'var(--white)', border:'none', cursor:'pointer', color: viewMode===m ? '#fff' : 'var(--ink3)' }}>
                <Icon name={m==='grid' ? 'grid' : 'list'} size={14} color={viewMode===m ? '#fff' : 'var(--ink3)'} />
              </button>
            ))}
          </div>

          {/* Create folder */}
          <button onClick={()=>setShowCreateFolder(true)} className="btn btn-primary btn-sm" style={{ gap:6, whiteSpace:'nowrap' }}>
            <Icon name="plus" size={13} /> New Folder
          </button>
        </div>

        {/* Content */}
        <div className="scroll-body" style={{ flex:1, padding:20, overflowY:'auto', position:'relative' }}>
          {/* Drag overlay */}
          {dragOver && (
            <div style={{ position:'absolute', inset:0, zIndex:100, background:'rgba(var(--teal-rgb,13,122,107),.06)', border:'2px dashed var(--teal)', borderRadius: 9, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, pointerEvents:'none' }}>
              <Icon name="upload" size={40} color="var(--teal)" />
              <span style={{ fontSize:16, fontWeight:600, color:'var(--teal)' }}>Drop files here to upload</span>
            </div>
          )}

          {displayItems.length === 0 && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12, color:'var(--ink3)' }}>
              <Icon name="folder" size={48} color="var(--border)" />
              <span style={{ fontSize:14 }}>{navView==='trash' ? 'Trash is empty' : 'No files found'}</span>
            </div>
          )}

          {/* Folders section */}
          {folders.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
                Folders <span style={{ fontWeight:400 }}>({folders.length})</span>
              </div>
              {viewMode==='grid' ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
                  {folders.map(item => (
                    <FolderCard key={item.id} item={item} starred={starredIds.has(item.id)}
                      onClick={()=>{ setPreviewItem(item); openFolder(item); }}
                      onCtx={e=>handleCtx(item, e)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rtbl-wrap" style={{ border:'1px solid var(--border)' }}>
                <table className="rtbl" style={{ borderCollapse:'collapse', background:'var(--white)' }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Name','Size','Type','Modified','Shared',''].map(h=>(
                        <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map(item => (
                      <FileRow key={item.id} item={item} starred={starredIds.has(item.id)}
                        onClick={()=>openFolder(item)}
                        onCtx={e=>handleCtx(item, e)}
                        onStar={handleStar} onDelete={handleDelete} onDownload={handleDownload}
                      />
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}

          {/* Files section */}
          {files.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
                Files <span style={{ fontWeight:400 }}>({files.length})</span>
              </div>
              {viewMode==='grid' ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
                  {files.map(item => (
                    <FileCard key={item.id} item={item} starred={starredIds.has(item.id)}
                      onClick={()=>setPreviewItem(item)}
                      onCtx={e=>handleCtx(item, e)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rtbl-wrap" style={{ border:'1px solid var(--border)' }}>
                <table className="rtbl" style={{ borderCollapse:'collapse', background:'var(--white)' }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['Name','Size','Type','Modified','Shared',''].map(h=>(
                        <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {files.map(item => (
                      <FileRow key={item.id} item={item} starred={starredIds.has(item.id)}
                        onClick={()=>setPreviewItem(item)}
                        onCtx={e=>handleCtx(item, e)}
                        onStar={handleStar} onDelete={handleDelete} onDownload={handleDownload}
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
          starred={starredIds.has(previewItem.id)}
          onClose={()=>setPreviewItem(null)}
          onStar={handleStar}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      )}

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <ContextMenu
          item={ctxMenu.item}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={()=>setCtxMenu(null)}
          onStar={handleStar}
          onDelete={handleDelete}
          onDownload={handleDownload}
          isStarred={starredIds.has(ctxMenu.item.id)}
        />
      )}

      {/* ── Create Folder Modal ── */}
      {showCreateFolder && (
        <div className="modal-overlay" onClick={()=>setShowCreateFolder(false)}>
          <div className="card" style={{ width:400, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>New Folder</span>
              <button onClick={()=>setShowCreateFolder(false)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:6 }}>Folder Name *</label>
              <input
                autoFocus
                value={newFolderName}
                onChange={e=>setNewFolderName(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') handleCreateFolder(); }}
                placeholder="Enter folder name…"
                className="input-field"
                style={{ width:'100%' }}
              />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--ink2)', display:'block', marginBottom:8 }}>Color</label>
              <div style={{ display:'flex', gap:8 }}>
                {FOLDER_COLORS.map(c => (
                  <button key={c} onClick={()=>setNewFolderColor(c)} style={{ width:26, height:26, borderRadius:99, background:c, border: newFolderColor===c ? '3px solid var(--ink)' : '2px solid transparent', cursor:'pointer', transition:'border .1s', outline:'none' }} />
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setShowCreateFolder(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleCreateFolder} className="btn btn-primary btn-sm" disabled={!newFolderName.trim()}>Create Folder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={()=>setDeleteTarget(null)}>
          <div className="card" style={{ width:380, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>Delete {deleteTarget.type==='folder' ? 'Folder' : 'File'}</span>
              <button onClick={()=>setDeleteTarget(null)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px', background:'var(--bg)', borderRadius: 9, marginBottom:16 }}>
              {deleteTarget.type==='folder'
                ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius: 9, background:`${deleteTarget.color ?? '#f59e0b'}22` }}><Icon name="folder" size={18} color={deleteTarget.color ?? '#f59e0b'} /></span>
                : <FileIcon type={deleteTarget.type} size={36} />
              }
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', wordBreak:'break-all' }}>{deleteTarget.name}</div>
                <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>{fmtSize(deleteTarget.size)}</div>
              </div>
            </div>
            <p style={{ fontSize:13, color:'var(--ink2)', margin:'0 0 20px', lineHeight:1.5 }}>
              {deleteTarget.type==='folder'
                ? `This folder and all ${deleteTarget.fileCount ?? 0} files inside will be permanently deleted.`
                : 'This file will be permanently deleted and cannot be recovered.'}
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setDeleteTarget(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={confirmDelete} className="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
