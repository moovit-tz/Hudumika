import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatUser {
  id: string;
  name: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  role: string;
}

interface Reaction   { emoji: string; count: number; mine?: boolean; }
interface Attachment { name: string; size: string; type: 'pdf' | 'img' | 'doc' | 'other'; }

interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  ts: Date;
  reactions?: Reaction[];
  attachment?: Attachment;
}

interface Channel {
  id: string;
  type: 'channel' | 'dm' | 'group';
  name: string;
  desc?: string;
  userId?: string;
  members?: string[];
  unread: number;
  lastMsg?: string;
  lastTime?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ME = 'me';

const USERS: Record<string, ChatUser> = {
  me: { id:'me', name:'Viden M.',       status:'online',  role:'Admin' },
  u1: { id:'u1', name:'Amani Korir',    status:'online',  role:'Operations Manager' },
  u2: { id:'u2', name:'Farida Hassan',  status:'away',    role:'Finance Officer' },
  u3: { id:'u3', name:'James Omondi',   status:'online',  role:'Logistics Coordinator' },
  u4: { id:'u4', name:'Neema Salim',    status:'offline', role:'Customer Relations' },
  u5: { id:'u5', name:'Brian Mutua',    status:'busy',    role:'IT Administrator' },
  u6: { id:'u6', name:'Zawadi Mwangi',  status:'online',  role:'Clearance Officer' },
};

const INIT_CHANNELS: Channel[] = [
  { id:'general',       type:'channel', name:'general',       desc:'Company-wide discussion & announcements',  unread:3, lastMsg:'TZ-4821 cleared. Excellent!',      lastTime:'9:14 AM' },
  { id:'operations',    type:'channel', name:'operations',    desc:'Shipment & logistics updates',             unread:8, lastMsg:'Starting pre-arrival declaration', lastTime:'9:02 AM' },
  { id:'finance',       type:'channel', name:'finance',       desc:'Finance team discussions & approvals',     unread:0, lastMsg:'Invoice #1042 approved',           lastTime:'Yesterday' },
  { id:'customs',       type:'channel', name:'customs',       desc:'Customs declarations & clearance queries', unread:5, lastMsg:'HS code query for batch 7',        lastTime:'8:45 AM' },
  { id:'announcements', type:'channel', name:'announcements', desc:'Official company announcements only',      unread:1, lastMsg:'System maintenance Sunday 2am',    lastTime:'Mon' },
  { id:'random',        type:'channel', name:'random',        desc:'Off-topic banter',                         unread:0, lastMsg:'Anyone tried the new place?',      lastTime:'Mon' },
  { id:'dm-u1', type:'dm', name:'Amani Korir',   userId:'u1', unread:2, lastMsg:'Can you check the manifest?',     lastTime:'9:20 AM' },
  { id:'dm-u2', type:'dm', name:'Farida Hassan', userId:'u2', unread:0, lastMsg:'Approved ✓',                      lastTime:'Yesterday' },
  { id:'dm-u3', type:'dm', name:'James Omondi',  userId:'u3', unread:0, lastMsg:'On my way to port',              lastTime:'Mon' },
  { id:'dm-u4', type:'dm', name:'Neema Salim',   userId:'u4', unread:0, lastMsg:'Client confirmed delivery',       lastTime:'Fri' },
  { id:'dm-u6', type:'dm', name:'Zawadi Mwangi', userId:'u6', unread:1, lastMsg:'Documents ready for pickup',      lastTime:'8:55 AM' },
  { id:'grp-ops',  type:'group', name:'Ops Team',     members:['me','u1','u3','u6'], unread:4, lastMsg:'Meeting at 11am',       lastTime:'9:10 AM' },
  { id:'grp-mgmt', type:'group', name:'Management',   members:['me','u1','u2','u5'], unread:0, lastMsg:'Q2 targets shared',      lastTime:'Fri' },
  { id:'grp-fin',  type:'group', name:'Finance + Ops',members:['me','u1','u2','u3'], unread:2, lastMsg:'Review duty estimates',  lastTime:'8:30 AM' },
];

function seedMessages(cid: string): ChatMessage[] {
  const ago = (m: number) => new Date(Date.now() - m * 60000);
  const sets: Record<string, ChatMessage[]> = {
    general: [
      { id:'g1', userId:'u1', ts:ago(120), content:"Good morning everyone! Three vessel arrivals expected by Thursday — let's make sure we're ready on all fronts.", reactions:[{emoji:'👋',count:4},{emoji:'☀️',count:2}] },
      { id:'g2', userId:'u2', ts:ago(100), content:'Finance reports are ready for review. @Amani please check the Q2 projections when you get a chance.' },
      { id:'g3', userId:'u3', ts:ago(85),  content:"Port is running slow today — extra delays at TICTS berth. I'm adjusting ETAs across affected shipments.", reactions:[{emoji:'👀',count:3}] },
      { id:'g4', userId:ME,   ts:ago(70),  content:"Thanks James. Keep the team updated. I'll be on from 10am — route anything urgent to James in the meantime." },
      { id:'g5', userId:'u6', ts:ago(50),  content:'Shipment TZ-4821 cleared customs. Notifying consignee now.', attachment:{name:'TZ-4821-clearance.pdf',size:'892 KB',type:'pdf'} },
      { id:'g6', userId:'u1', ts:ago(40),  content:"Great work Zawadi! That one was almost at SLA breach. 🙌" },
      { id:'g7', userId:ME,   ts:ago(15),  content:"Excellent work team! Let's keep this momentum going.", reactions:[{emoji:'🎉',count:5,mine:true}] },
    ],
    operations: [
      { id:'o1', userId:'u6', ts:ago(180), content:'TZ-4830 arrived this morning. All manifests uploaded. Starting pre-arrival declaration.', attachment:{name:'TZ-4830-manifest.pdf',size:'1.4 MB',type:'pdf'} },
      { id:'o2', userId:'u1', ts:ago(170), content:'Good. Prioritise TZ-4830 — the consignee is waiting on medical supplies.' },
      { id:'o3', userId:'u3', ts:ago(155), content:'TZ-4799 still pending release order from KRA. Following up directly now.' },
      { id:'o4', userId:ME,   ts:ago(140), content:"Escalate if no response by noon. We're 2 days past SLA on that one." },
      { id:'o5', userId:'u6', ts:ago(90),  content:'KRA released TZ-4799. Collecting delivery order now.' },
      { id:'o6', userId:'u1', ts:ago(80),  content:'Great news! Arrange delivery immediately. Update the tracker.' },
      { id:'o7', userId:'u3', ts:ago(30),  content:'TZ-4821 cleared — last-mile arranged. Delivery by 3pm.', reactions:[{emoji:'✅',count:3}] },
    ],
    finance: [
      { id:'f1', userId:'u2', ts:ago(500), content:'Invoice #1042 for TICTS port charges approved and sent to the client.' },
      { id:'f2', userId:ME,   ts:ago(480), content:"Thanks Farida. What's the outstanding balance on the Dar account?" },
      { id:'f3', userId:'u2', ts:ago(460), content:'TSZ 4.2M outstanding across 3 invoices. Oldest is 45 days — sending a reminder today.', attachment:{name:'AR-Summary-June.xlsx',size:'345 KB',type:'doc'} },
      { id:'f4', userId:'u1', ts:ago(440), content:'Can we get the duty estimates for TZ-4830 before EOD?' },
      { id:'f5', userId:'u2', ts:ago(420), content:'Will have them ready by 4pm.' },
    ],
    customs: [
      { id:'c1', userId:'u6', ts:ago(240), content:"Quick query — what's the correct HS code for industrial water pumps? Client claims 8413.70." },
      { id:'c2', userId:ME,   ts:ago(220), content:'8413.70 is correct for centrifugal pumps. If submersible it would be 8413.81. What does the spec say?' },
      { id:'c3', userId:'u6', ts:ago(200), content:'Centrifugal. Going with 8413.70. Thanks!', reactions:[{emoji:'👍',count:1,mine:true}] },
      { id:'c4', userId:'u3', ts:ago(180), content:'Batch 7 declaration submitted. Awaiting CFS confirmation.' },
      { id:'c5', userId:'u1', ts:ago(160), content:'CFS confirmed — Batch 7 in exam queue. Should clear by tomorrow morning.' },
    ],
    'dm-u1': [
      { id:'d1', userId:'u1', ts:ago(60), content:'Hey, can you check the manifest for TZ-4831? Something looks off on the gross weight.' },
      { id:'d2', userId:ME,   ts:ago(55), content:'On it, give me a second.' },
      { id:'d3', userId:ME,   ts:ago(50), content:"Found it. HS codes look fine but gross weight is off by ~200kg. I've flagged it with the shipper." },
      { id:'d4', userId:'u1', ts:ago(20), content:"Thank you! Likely a shipper error. I'll follow up directly and get a corrected manifest." },
      { id:'d5', userId:'u1', ts:ago(5),  content:'Can you check the manifest?', reactions:[{emoji:'👀',count:1}] },
    ],
    'dm-u6': [
      { id:'dz1', userId:'u6', ts:ago(90), content:'Documents for TZ-4831 are ready for pickup at the port office.' },
      { id:'dz2', userId:ME,   ts:ago(80), content:"Perfect, I'll send James to collect them." },
      { id:'dz3', userId:'u6', ts:ago(70), content:'Sure. Tell him to ask for Grace at window 4 — she has the full package.' },
    ],
    'grp-ops': [
      { id:'go1', userId:'u1', ts:ago(80), content:"Team — quick sync today at 11am to go over the vessel schedule. Room 2 or Teams link if you're remote." },
      { id:'go2', userId:'u3', ts:ago(75), content:"I'll be there. Should I bring the port congestion report and demurrage tracker?" },
      { id:'go3', userId:'u6', ts:ago(70), content:'Yes please! And the CFS queue status for TICTS.' },
      { id:'go4', userId:ME,   ts:ago(65), content:"I'll join remotely. Share screen when you start — I want to see the vessel schedule." },
      { id:'go5', userId:'u1', ts:ago(30), content:'Will do. See everyone at 11! 👍', reactions:[{emoji:'👍',count:3,mine:true}] },
    ],
    'grp-fin': [
      { id:'gf1', userId:'u2', ts:ago(150), content:'Can everyone review the duty estimates for TZ-4830 before EOD? I need sign-off before we invoice.' },
      { id:'gf2', userId:'u1', ts:ago(140), content:"What's the total estimated duty?" },
      { id:'gf3', userId:'u2', ts:ago(130), content:'Approximately TSZ 8.6M on the medical equipment line items.', attachment:{name:'TZ-4830-duty-estimate.pdf',size:'512 KB',type:'pdf'} },
      { id:'gf4', userId:ME,   ts:ago(120), content:"I'll review now. Give me 20 minutes." },
    ],
  };
  return sets[cid] ?? [
    { id:'def1', userId:'u1', ts:new Date(Date.now()-7200000), content:'Welcome to this channel!' },
    { id:'def2', userId:ME,   ts:new Date(Date.now()-3600000), content:'Thanks! Ready to collaborate.' },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PALETTE = ['#e8461a','#0569e3','#1a7f37','#9a6700','#8250df','#cf222e','#0a7e6a'];
function abg(name: string) { let h=0; for(let i=0;i<name.length;i++) h=name.charCodeAt(i)+((h<<5)-h); return PALETTE[Math.abs(h)%PALETTE.length]; }
function ini(name: string) { return name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(); }
function ft(d: Date) { return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}); }
function fd(d: Date) {
  const n=new Date(), y=new Date(n); y.setDate(n.getDate()-1);
  if(d.toDateString()===n.toDateString()) return 'Today';
  if(d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
}
function sd(a: Date,b: Date) { return a.toDateString()===b.toDateString(); }
function grp(a: ChatMessage,b: ChatMessage) { return a.userId===b.userId && (b.ts.getTime()-a.ts.getTime())<5*60000; }
const DOT: Record<string,string> = { online:'var(--green)', away:'var(--gold)', busy:'var(--red)', offline:'var(--ink3)' };

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Av({ uid, size=32 }: { uid: string; size?: number }) {
  const u = USERS[uid]; if(!u) return null;
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:abg(u.name), flexShrink:0,
      display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size*.36),
      fontWeight:700, color:'#fff', position:'relative', userSelect:'none' }}>
      {ini(u.name)}
      <span style={{ position:'absolute', bottom:-1, right:-1, width:Math.max(7,size*.27), height:Math.max(7,size*.27),
        borderRadius:'50%', background:DOT[u.status], border:'2px solid var(--white)' }} />
    </div>
  );
}

// ─── Channel row ─────────────────────────────────────────────────────────────

function CRow({ ch, active, onClick }: { ch:Channel; active:boolean; onClick:()=>void }) {
  const uid = ch.userId??'';
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:8, width:'100%', padding:'5px 10px',
      border:'none', borderRadius:6, cursor:'pointer', textAlign:'left',
      background:active?'rgba(232,70,26,0.10)':'transparent',
      color:active?'var(--teal)':ch.unread>0?'var(--ink)':'var(--ink2)',
      fontWeight:ch.unread>0?600:400, fontFamily:'var(--font)', fontSize:13,
      transition:'background 0.1s',
    }}>
      {ch.type==='dm' && uid ? (
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{ width:22,height:22,borderRadius:'50%',background:abg(USERS[uid]?.name??''),display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff' }}>{ini(USERS[uid]?.name??'?')}</div>
          <span style={{ position:'absolute',bottom:-1,right:-1,width:7,height:7,borderRadius:'50%',background:DOT[USERS[uid]?.status??'offline'],border:'1.5px solid var(--white)' }} />
        </div>
      ) : ch.type==='group' ? (
        <div style={{ width:22,height:22,borderRadius:6,background:'var(--teal-l)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
          <Icon name="users" size={11} color="var(--teal)" />
        </div>
      ) : (
        <span style={{ color:'var(--ink3)',fontSize:15,width:16,textAlign:'center',flexShrink:0,fontWeight:800,lineHeight:1 }}>#</span>
      )}
      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ch.name}</span>
      {ch.unread>0 && <span style={{ background:'var(--teal)',color:'#fff',borderRadius: 9,fontSize:10,fontWeight:700,padding:'1px 6px',flexShrink:0 }}>{ch.unread>99?'99+':ch.unread}</span>}
    </button>
  );
}

// ─── Attachment chip ─────────────────────────────────────────────────────────

function AttChip({ att }: { att: Attachment }) {
  const icons: Record<string,IconName> = { pdf:'fileText', img:'image', doc:'file', other:'paperclip' };
  const clrs = { pdf:'var(--red)', img:'var(--blue)', doc:'var(--teal)', other:'var(--ink3)' };
  const clr  = clrs[att.type];
  return (
    <div style={{ display:'inline-flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius: 9,border:'1px solid var(--border)',background:'var(--bg)',marginTop:6,cursor:'pointer',maxWidth:300 }}>
      <div style={{ width:34,height:34,borderRadius:7,background:clr+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
        <Icon name={icons[att.type]} size={17} color={clr} />
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:12.5,fontWeight:600,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180 }}>{att.name}</div>
        <div style={{ fontSize:11,color:'var(--ink3)' }}>{att.size}</div>
      </div>
      <Icon name="download" size={14} color="var(--ink3)" style={{ marginLeft:'auto', flexShrink:0 }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export const Chat: React.FC = () => {
  const [activeId,   setActiveId]   = useState('general');
  const [msgMap,     setMsgMap]     = useState<Record<string,ChatMessage[]>>({});
  const [channels,   setChannels]   = useState(INIT_CHANNELS);
  const [input,      setInput]      = useState('');
  const [search,     setSearch]     = useState('');
  const [typing,     setTyping]     = useState(false);
  const [showEmoji,  setShowEmoji]  = useState(false);
  const [openSecs,   setOpenSecs]   = useState({ ch:true, dm:true, grp:true });
  const [modalOpen,  setModalOpen]  = useState(false);
  const [newName,    setNewName]    = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const emojiRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgMap(p => p[activeId] ? p : { ...p, [activeId]: seedMessages(activeId) });
    setChannels(p => p.map(c => c.id===activeId ? {...c, unread:0} : c));
    const t1=setTimeout(()=>setTyping(true), 2200);
    const t2=setTimeout(()=>setTyping(false),5200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}); }, [msgMap, activeId, typing]);

  useEffect(() => {
    function h(e: MouseEvent) { if(emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const activeCh = channels.find(c=>c.id===activeId)!;
  const msgs     = msgMap[activeId] ?? [];

  function send() {
    const txt = input.trim(); if(!txt) return;
    const msg: ChatMessage = { id:`m${Date.now()}`, userId:ME, content:txt, ts:new Date() };
    setMsgMap(p => ({ ...p, [activeId]:[...(p[activeId]??[]), msg] }));
    setChannels(p => p.map(c => c.id===activeId ? {...c, lastMsg:txt, lastTime:'Now'} : c));
    setInput('');
    inputRef.current && (inputRef.current.style.height='auto');
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }

  function react(msgId: string, emoji: string) {
    setMsgMap(p => {
      const list = (p[activeId]??[]).map(m => {
        if(m.id!==msgId) return m;
        const rxns=[...(m.reactions??[])]; const ex=rxns.find(r=>r.emoji===emoji);
        if(ex){ ex.mine=!ex.mine; ex.count+=ex.mine?1:-1; return {...m,reactions:rxns.filter(r=>r.count>0)}; }
        return {...m, reactions:[...rxns,{emoji,count:1,mine:true}]};
      });
      return {...p,[activeId]:list};
    });
  }

  function createChannel() {
    const name=newName.trim().toLowerCase().replace(/\s+/g,'-'); if(!name) return;
    const nc: Channel={id:`ch-${name}`,type:'channel',name,desc:'',unread:0,lastMsg:'Channel created',lastTime:'Now'};
    setChannels(p=>[...p,nc]); setActiveId(nc.id); setModalOpen(false); setNewName('');
  }

  const q      = search.toLowerCase();
  const fil    = (arr: Channel[]) => q ? arr.filter(c=>c.name.toLowerCase().includes(q)) : arr;
  const chList = fil(channels.filter(c=>c.type==='channel'));
  const dmList = fil(channels.filter(c=>c.type==='dm'));
  const grpList= fil(channels.filter(c=>c.type==='group'));

  const EMOJIS = ['👍','❤️','😄','🎉','🚀','👀','✅','😂','🙌','💯','🔥','👋','🤝','📦','✈️','⚓'];
  const INTEGRATIONS: {name:string;icon:IconName;color:string;live:boolean}[] = [
    {name:'WhatsApp Business', icon:'phone',   color:'#25D366', live:true },
    {name:'Email (IMAP/SMTP)', icon:'mail',    color:'#0569e3', live:true },
    {name:'SMS Gateway',       icon:'message', color:'#9a6700', live:false},
    {name:'Slack Mirror',      icon:'hash',    color:'#611f69', live:false},
  ];

  function SecHdr({label,sk,count}:{label:string;sk:keyof typeof openSecs;count:number}) {
    return (
      <button onClick={()=>setOpenSecs(p=>({...p,[sk]:!p[sk]}))} style={{ display:'flex',alignItems:'center',gap:4,width:'100%',background:'none',border:'none',cursor:'pointer',padding:'10px 10px 3px',color:'var(--ink3)',fontFamily:'var(--mono)',fontSize:10,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase' }}>
        <Icon name={openSecs[sk]?'chevronDown':'chevronRight'} size={10} />
        {label}
        {count>0 && <span style={{ marginLeft:'auto',background:'var(--teal)',color:'#fff',borderRadius: 9,fontSize:9,fontWeight:700,padding:'1px 5px' }}>{count}</span>}
      </button>
    );
  }

  const memberCount = activeCh?.type==='group' ? (activeCh.members?.length??0) : activeCh?.type==='channel' ? Object.keys(USERS).length : 1;

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--white)', fontFamily:'var(--font)' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ width:244,flexShrink:0,display:'flex',flexDirection:'column',borderRight:'1px solid var(--border)',background:'var(--white)',overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'12px 14px 10px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:9 }}>
          <div style={{ width:30,height:30,borderRadius: 9,background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
            <Icon name="chatBubble" size={15} color="#fff" />
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:13,fontWeight:700,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>Moovit ClearOS</div>
            <div style={{ fontSize:10.5,color:'var(--green)',fontWeight:600,display:'flex',alignItems:'center',gap:4 }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'var(--green)',display:'inline-block' }} />
              All channels online
            </div>
          </div>
          <button onClick={()=>setModalOpen(true)} title="New channel" style={{ background:'none',border:'none',cursor:'pointer',padding:5,borderRadius:5,color:'var(--ink3)',display:'flex' }}>
            <Icon name="edit" size={14} />
          </button>
        </div>

        {/* Summary strip */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {(() => {
            const totalUnread  = channels.reduce((s,c) => s+c.unread, 0);
            const onlineCount  = Object.values(USERS).filter(u => u.status === 'online').length;
            const totalChannels= chList.length + grpList.length;
            const items = [
              { label:'Channels', value: totalChannels,  color:'var(--ink)'  },
              { label:'Unread',   value: totalUnread,    color: totalUnread > 0 ? 'var(--teal)' : 'var(--ink3)' },
              { label:'Online',   value: onlineCount,    color:'var(--green)' },
            ];
            return items.map((s, i) => (
              <div key={s.label} style={{ flex:1, padding:'7px 4px', textAlign:'center', borderRight: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize:16, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:9.5, color:'var(--ink3)', marginTop:2, letterSpacing:'0.03em' }}>{s.label}</div>
              </div>
            ));
          })()}
        </div>

        {/* Search */}
        <div style={{ padding:'10px 10px 6px' }}>
          <div style={{ display:'flex',alignItems:'center',gap:7,padding:'6px 10px',borderRadius:7,background:'var(--bg)',border:'1px solid var(--border)' }}>
            <Icon name="search" size={13} color="var(--ink3)" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
              style={{ border:'none',background:'none',outline:'none',flex:1,fontSize:12.5,color:'var(--ink)',fontFamily:'var(--font)' }} />
            {search && <button onClick={()=>setSearch('')} style={{ background:'none',border:'none',cursor:'pointer',padding:0,color:'var(--ink3)',display:'flex' }}><Icon name="close" size={12} /></button>}
          </div>
        </div>

        {/* Lists */}
        <div style={{ flex:1,overflowY:'auto',padding:'0 4px 8px' }}>

          <SecHdr label="Channels" sk="ch" count={chList.reduce((s,c)=>s+c.unread,0)} />
          {openSecs.ch && chList.map(ch=><CRow key={ch.id} ch={ch} active={activeId===ch.id} onClick={()=>setActiveId(ch.id)} />)}
          <button onClick={()=>setModalOpen(true)} style={{ display:'flex',alignItems:'center',gap:7,width:'100%',padding:'4px 10px',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',fontSize:12,fontFamily:'var(--font)',borderRadius:6 }}>
            <Icon name="plus" size={12} /> Add a channel
          </button>

          <SecHdr label="Direct Messages" sk="dm" count={dmList.reduce((s,c)=>s+c.unread,0)} />
          {openSecs.dm && dmList.map(ch=><CRow key={ch.id} ch={ch} active={activeId===ch.id} onClick={()=>setActiveId(ch.id)} />)}
          <button style={{ display:'flex',alignItems:'center',gap:7,width:'100%',padding:'4px 10px',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',fontSize:12,fontFamily:'var(--font)',borderRadius:6 }}>
            <Icon name="plus" size={12} /> New direct message
          </button>

          <SecHdr label="Groups" sk="grp" count={grpList.reduce((s,c)=>s+c.unread,0)} />
          {openSecs.grp && grpList.map(ch=><CRow key={ch.id} ch={ch} active={activeId===ch.id} onClick={()=>setActiveId(ch.id)} />)}
          <button style={{ display:'flex',alignItems:'center',gap:7,width:'100%',padding:'4px 10px',background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',fontSize:12,fontFamily:'var(--font)',borderRadius:6 }}>
            <Icon name="plus" size={12} /> Create a group
          </button>

          {/* Integrations */}
          <div style={{ padding:'12px 10px 4px',fontFamily:'var(--mono)',fontSize:10,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--ink3)' }}>Integrations</div>
          {INTEGRATIONS.map(ig=>(
            <button key={ig.name} style={{ display:'flex',alignItems:'center',gap:8,width:'100%',padding:'5px 10px',background:'none',border:'none',cursor:'pointer',borderRadius:6,textAlign:'left',fontFamily:'var(--font)',fontSize:12.5,color:'var(--ink2)',transition:'background 0.1s' }}>
              <div style={{ width:22,height:22,borderRadius:5,background:ig.color+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <Icon name={ig.icon} size={12} color={ig.color} />
              </div>
              <span style={{ flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ig.name}</span>
              <span style={{ fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,flexShrink:0,
                background:ig.live?'rgba(26,127,55,0.10)':'var(--bg)',
                color:ig.live?'var(--green)':'var(--ink3)',
                border:`1px solid ${ig.live?'rgba(26,127,55,0.25)':'var(--border)'}` }}>
                {ig.live?'LIVE':'OFF'}
              </span>
            </button>
          ))}
        </div>

        {/* My status */}
        <div style={{ padding:'10px 12px',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
          <Av uid={ME} size={28} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:12.5,fontWeight:600,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{USERS[ME].name}</div>
            <div style={{ fontSize:10.5,color:'var(--green)',fontWeight:500 }}>Active now</div>
          </div>
          <button style={{ background:'none',border:'none',cursor:'pointer',padding:4,color:'var(--ink3)',display:'flex' }}>
            <Icon name="settings" size={13} />
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0 }}>

        {/* Channel header */}
        <div style={{ padding:'0 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,height:54,flexShrink:0,background:'var(--white)' }}>
          {activeCh?.type==='dm'&&activeCh.userId ? <Av uid={activeCh.userId} size={30} />
           : activeCh?.type==='group' ? (
            <div style={{ width:30,height:30,borderRadius: 9,background:'var(--teal-l)',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Icon name="users" size={15} color="var(--teal)" />
            </div>
          ) : <span style={{ fontSize:22,fontWeight:800,color:'var(--ink3)',lineHeight:1 }}>#</span>}

          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:700,color:'var(--ink)',display:'flex',alignItems:'center',gap:10 }}>
              {activeCh?.name}
              {activeCh?.type==='channel' && (
                <span style={{ fontSize:11,color:'var(--ink3)',fontWeight:500,display:'flex',alignItems:'center',gap:4 }}>
                  <Icon name="users" size={11} />{memberCount} members
                </span>
              )}
              {activeCh?.type==='dm'&&activeCh.userId && (
                <span style={{ fontSize:11,color:DOT[USERS[activeCh.userId]?.status??'offline'],fontWeight:600 }}>
                  ● {USERS[activeCh.userId]?.status}
                </span>
              )}
            </div>
            {activeCh?.desc && <div style={{ fontSize:11.5,color:'var(--ink3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{activeCh.desc}</div>}
          </div>

          {(['search','bell','users','moreHorizontal'] as IconName[]).map(ic=>(
            <button key={ic} style={{ background:'none',border:'none',cursor:'pointer',padding:6,borderRadius:6,color:'var(--ink3)',display:'flex',transition:'background 0.1s' }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')}
              onMouseLeave={e=>(e.currentTarget.style.background='none')}>
              <Icon name={ic} size={16} />
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex:1,overflowY:'auto',padding:'8px 24px 4px',display:'flex',flexDirection:'column' }}>

          {/* Intro */}
          <div style={{ padding:'20px 0 16px',borderBottom:'1px solid var(--border)',marginBottom:8 }}>
            {activeCh?.type==='channel' ? (
              <>
                <div style={{ width:48,height:48,borderRadius: 9,background:'var(--teal-l)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10 }}>
                  <span style={{ fontSize:26,fontWeight:800,color:'var(--teal)' }}>#</span>
                </div>
                <div style={{ fontSize:18,fontWeight:800,color:'var(--ink)',marginBottom:4 }}>#{activeCh.name}</div>
                <div style={{ fontSize:13,color:'var(--ink3)' }}>{activeCh.desc||'This is the beginning of this channel.'}</div>
              </>
            ) : activeCh?.type==='dm'&&activeCh.userId ? (
              <div style={{ display:'flex',alignItems:'center',gap:14 }}>
                <Av uid={activeCh.userId} size={52} />
                <div>
                  <div style={{ fontSize:18,fontWeight:800,color:'var(--ink)' }}>{activeCh.name}</div>
                  <div style={{ fontSize:12.5,color:'var(--ink3)' }}>{USERS[activeCh.userId]?.role} · Direct message</div>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex',alignItems:'center',gap:14 }}>
                <div style={{ width:52,height:52,borderRadius: 9,background:'var(--teal-l)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <Icon name="users" size={24} color="var(--teal)" />
                </div>
                <div>
                  <div style={{ fontSize:18,fontWeight:800,color:'var(--ink)' }}>{activeCh.name}</div>
                  <div style={{ fontSize:12.5,color:'var(--ink3)' }}>{memberCount} members · Group</div>
                </div>
              </div>
            )}
          </div>

          {/* Message rows */}
          {msgs.map((msg, idx) => {
            const prev    = msgs[idx-1];
            const showDay = !prev || !sd(prev.ts, msg.ts);
            const isGrp   = !!prev && grp(prev,msg) && !showDay;
            const user    = USERS[msg.userId];
            const isMe    = msg.userId===ME;
            return (
              <React.Fragment key={msg.id}>
                {showDay && (
                  <div style={{ display:'flex',alignItems:'center',gap:12,margin:'12px 0 8px' }}>
                    <div style={{ flex:1,height:1,background:'var(--border)' }} />
                    <span style={{ fontSize:11,fontWeight:600,color:'var(--ink3)',whiteSpace:'nowrap' }}>{fd(msg.ts)}</span>
                    <div style={{ flex:1,height:1,background:'var(--border)' }} />
                  </div>
                )}
                <div className="chat-msg" style={{ display:'flex',gap:10,padding:isGrp?'1px 6px':'7px 6px 1px',alignItems:'flex-start',borderRadius: 9 }}>
                  <div style={{ width:36,flexShrink:0,paddingTop:isGrp?0:2 }}>
                    {!isGrp ? <Av uid={msg.userId} size={34} /> : (
                      <span style={{ fontSize:10,color:'var(--ink3)',display:'block',textAlign:'right',paddingTop:3,paddingRight:2 }}>
                        {ft(msg.ts).replace(/:\d\d /,' ')}
                      </span>
                    )}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    {!isGrp && (
                      <div style={{ display:'flex',alignItems:'baseline',gap:8,marginBottom:3 }}>
                        <span style={{ fontSize:13.5,fontWeight:700,color:isMe?'var(--teal)':'var(--ink)' }}>{user?.name??'Unknown'}</span>
                        <span style={{ fontSize:11,color:'var(--ink3)' }}>{ft(msg.ts)}</span>
                        {isMe && <span style={{ fontSize:10,color:'var(--teal)',background:'var(--teal-l)',borderRadius:4,padding:'1px 5px',fontWeight:600 }}>You</span>}
                      </div>
                    )}
                    <div style={{ fontSize:13.5,color:'var(--ink)',lineHeight:1.55,wordBreak:'break-word' }}>{msg.content}</div>
                    {msg.attachment && <AttChip att={msg.attachment} />}
                    {msg.reactions&&msg.reactions.length>0 && (
                      <div style={{ display:'flex',gap:4,marginTop:5,flexWrap:'wrap' }}>
                        {msg.reactions.map(r=>(
                          <button key={r.emoji} onClick={()=>react(msg.id,r.emoji)} style={{ display:'flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius: 9,border:`1px solid ${r.mine?'var(--teal-m)':'var(--border)'}`,background:r.mine?'var(--teal-l)':'var(--bg)',cursor:'pointer',fontSize:13,fontFamily:'var(--font)',transition:'all 0.1s' }}>
                            {r.emoji}<span style={{ fontSize:11,fontWeight:600,color:r.mine?'var(--teal)':'var(--ink2)' }}>{r.count}</span>
                          </button>
                        ))}
                        <button onClick={()=>react(msg.id,'👍')} style={{ padding:'2px 8px',borderRadius: 9,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',fontSize:12,color:'var(--ink3)',fontFamily:'var(--font)' }}>+</button>
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* Typing indicator */}
          {typing && (
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 6px' }}>
              <div style={{ width:36 }} />
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ display:'flex',gap:3,alignItems:'center' }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:6,height:6,borderRadius:'50%',background:'var(--ink3)',animation:`typingDot 1.2s ${i*0.2}s infinite ease-in-out` }} />
                  ))}
                </div>
                <span style={{ fontSize:12,color:'var(--ink3)' }}>
                  {activeCh?.type==='dm'&&activeCh.userId ? `${USERS[activeCh.userId]?.name} is typing…` : 'Someone is typing…'}
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div style={{ padding:'10px 20px 14px',borderTop:'1px solid var(--border)',background:'var(--white)',flexShrink:0 }}>
          <div style={{ border:'1.5px solid var(--border)',borderRadius: 9,overflow:'visible',background:'var(--white)',transition:'border-color 0.15s' }}
            onFocus={e=>(e.currentTarget.style.borderColor='var(--teal)')}
            onBlur={e=>(e.currentTarget.style.borderColor='var(--border)')}>
            <textarea
              ref={inputRef} value={input}
              onChange={e=>{ setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,180)+'px'; }}
              onKeyDown={onKey}
              placeholder={`Message ${activeCh?.type==='channel'?'#':''}${activeCh?.name??''}…`}
              rows={1}
              style={{ width:'100%',border:'none',outline:'none',resize:'none',padding:'12px 14px 8px',fontSize:13.5,color:'var(--ink)',background:'transparent',fontFamily:'var(--font)',lineHeight:1.55,minHeight:44,boxSizing:'border-box',display:'block' }}
            />
            <div style={{ display:'flex',alignItems:'center',padding:'5px 8px',gap:1,borderTop:'1px solid var(--border)' }}>
              {(['paperclip','image','link','atSign'] as IconName[]).map(ic=>(
                <button key={ic} title={ic} style={{ background:'none',border:'none',cursor:'pointer',padding:'5px 6px',borderRadius:6,color:'var(--ink3)',display:'flex',alignItems:'center',transition:'background 0.1s' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  <Icon name={ic} size={15} />
                </button>
              ))}

              <div ref={emojiRef} style={{ position:'relative' }}>
                <button onClick={()=>setShowEmoji(p=>!p)} style={{ background:'none',border:'none',cursor:'pointer',padding:'5px 6px',borderRadius:6,color:showEmoji?'var(--teal)':'var(--ink3)',display:'flex',alignItems:'center',transition:'background 0.1s' }}>
                  <Icon name="smile" size={15} />
                </button>
                {showEmoji && (
                  <div style={{ position:'absolute',bottom:'calc(100% + 8px)',left:0,background:'var(--white)',border:'1px solid var(--border)',borderRadius: 9,padding:8,display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:2,boxShadow:'0 4px 20px rgba(0,0,0,0.12)',zIndex:100 }}>
                    {EMOJIS.map(em=>(
                      <button key={em} onClick={()=>{ setInput(p=>p+em); setShowEmoji(false); inputRef.current?.focus(); }}
                        style={{ background:'none',border:'none',cursor:'pointer',fontSize:18,padding:'5px',borderRadius:6,lineHeight:1,transition:'background 0.1s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='var(--bg)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ flex:1 }} />

              {input.length>0 && (
                <span style={{ fontSize:11,color:'var(--ink3)',marginRight:8,display:'flex',alignItems:'center',gap:4 }}>
                  <kbd style={{ fontSize:10,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:3,padding:'1px 4px' }}>↵</kbd> send
                  <kbd style={{ fontSize:10,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:3,padding:'1px 4px',marginLeft:6 }}>⇧↵</kbd> newline
                </span>
              )}

              <button onClick={send} disabled={!input.trim()} style={{ background:input.trim()?'var(--teal)':'var(--border)',border:'none',borderRadius:7,padding:'6px 14px',cursor:input.trim()?'pointer':'not-allowed',display:'flex',alignItems:'center',gap:6,color:input.trim()?'#fff':'var(--ink3)',fontSize:13,fontWeight:600,fontFamily:'var(--font)',transition:'background 0.15s' }}>
                <Icon name="send" size={13} color={input.trim()?'#fff':'var(--ink3)'} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── NEW CHANNEL MODAL ── */}
      {modalOpen && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}
          onClick={e=>e.target===e.currentTarget&&setModalOpen(false)}>
          <div style={{ background:'var(--white)',borderRadius: 9,padding:28,width:400,boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
              <div style={{ fontSize:16,fontWeight:700,color:'var(--ink)' }}>Create a channel</div>
              <button onClick={()=>setModalOpen(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--ink3)',padding:4,display:'flex' }}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12,fontWeight:600,color:'var(--ink2)',display:'block',marginBottom:6 }}>Channel name</label>
              <div style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 12px',border:'1.5px solid var(--border)',borderRadius: 9 }}>
                <span style={{ color:'var(--ink3)',fontWeight:700,fontSize:15 }}>#</span>
                <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createChannel()} placeholder="e.g. project-alpha"
                  style={{ border:'none',outline:'none',flex:1,fontSize:13.5,color:'var(--ink)',fontFamily:'var(--font)',background:'transparent' }} />
              </div>
              <div style={{ fontSize:11.5,color:'var(--ink3)',marginTop:5 }}>Lowercase letters, numbers and hyphens only.</div>
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={()=>setModalOpen(false)} style={{ padding:'8px 16px',borderRadius: 9,border:'1px solid var(--border)',background:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:'var(--ink2)',fontFamily:'var(--font)' }}>Cancel</button>
              <button onClick={createChannel} disabled={!newName.trim()} style={{ padding:'8px 18px',borderRadius: 9,border:'none',background:newName.trim()?'var(--teal)':'var(--border)',color:newName.trim()?'#fff':'var(--ink3)',cursor:newName.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:600,fontFamily:'var(--font)',transition:'background 0.15s' }}>
                Create Channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
