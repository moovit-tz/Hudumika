import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { SAMPLE_LEADS, STAGE_CFG, PRIORITY_CFG, fmtValue, LeadAv, StageBadge } from './Leads.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

/* -- Types -- */
interface Activity {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'stage';
  text: string;
  user: string;
  date: string;
}
interface Note {
  id: string;
  text: string;
  user: string;
  created_at: string;
}
interface FileItem {
  id: string;
  name: string;
  size: string;
  date: string;
  icon: IconName;
}

/* -- Stage pipeline (no LOST slot — appended if lost) -- */
const PIPELINE_STEPS = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'];

/* -- Sample activities keyed by lead id -- */
const BASE_ACTIVITIES: Record<string, Activity[]> = {
  '1': [
    { id:'a5', type:'stage',   text:'Stage advanced: Contacted ? Qualified', user:'Amina Hassan', date:'2025-01-28' },
    { id:'a4', type:'meeting', text:'Discovery meeting at Summit Traders office, Dar es Salaam', user:'Amina Hassan', date:'2025-01-27' },
    { id:'a3', type:'stage',   text:'Stage advanced: New ? Contacted', user:'Amina Hassan', date:'2025-01-20' },
    { id:'a2', type:'email',   text:'Sent company profile and rate card to Ali Hassan', user:'Amina Hassan', date:'2025-01-22' },
    { id:'a1', type:'call',    text:'Initial call to discuss FCL sea freight requirements from China', user:'Amina Hassan', date:'2025-01-20' },
  ],
  '2': [
    { id:'b4', type:'stage',   text:'Stage advanced: Qualified ? Proposal', user:'John Mwangi', date:'2025-02-10' },
    { id:'b3', type:'email',   text:'Proposal document sent for review to procurement team', user:'John Mwangi', date:'2025-02-10' },
    { id:'b2', type:'meeting', text:'Zoom requirements call — volume and frequency confirmed', user:'John Mwangi', date:'2025-02-05' },
    { id:'b1', type:'call',    text:'Follow-up call regarding Q1 volume estimates', user:'John Mwangi', date:'2025-01-25' },
  ],
  '6': [
    { id:'c3', type:'meeting', text:'Price negotiation meeting — third round', user:'Grace Osei', date:'2025-02-18' },
    { id:'c2', type:'stage',   text:'Stage advanced: Proposal ? Negotiation', user:'Grace Osei', date:'2025-02-12' },
    { id:'c1', type:'email',   text:'Proposal submitted with three pricing tiers', user:'Grace Osei', date:'2025-02-08' },
  ],
};

const BASE_FILES: Record<string, FileItem[]> = {
  '1': [
    { id:'f1', name:'Summit_Traders_Proposal_v2.pdf', size:'1.2 MB', date:'2025-01-28', icon:'file' },
    { id:'f2', name:'Rate_Card_Q1_2025.xlsx',         size:'340 KB', date:'2025-01-22', icon:'fileText' },
  ],
  '2': [
    { id:'f3', name:'Serengeti_Foods_Proposal.pdf',   size:'2.1 MB', date:'2025-02-10', icon:'file' },
  ],
};

/* -- Helpers -- */
const AVATAR_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30','#0e7490'];
function initials(n: string) { return n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function avatarColor(n: string) { return AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length]; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }

/* -- Activity icon map -- */
const ACT_CFG: Record<string, { icon: IconName; color: string; bg: string; label: string }> = {
  call:    { icon:'headphones', color:'var(--blue)',   bg:'var(--blue-l)',   label:'Call'    },
  email:   { icon:'mail',       color:'var(--purple)', bg:'var(--purple-l)', label:'Email'   },
  meeting: { icon:'users',      color:'var(--teal)',   bg:'var(--teal-l)',   label:'Meeting' },
  note:    { icon:'edit',       color:'var(--gold)',   bg:'var(--gold-l)',   label:'Note'    },
  stage:   { icon:'activity',   color:'var(--green)',  bg:'var(--green-l)',  label:'Stage'   },
};

/* -- Sub-components -- */
function Av({ name, size=32 }: { name:string; size?:number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:avatarColor(name), color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.33, fontWeight:700, flexShrink:0, fontFamily:'var(--font)' }}>
      {initials(name)}
    </div>
  );
}

function InfoRow({ label, value }: { label:string; value?:string|null }) {
  return (
    <div style={{ display:'flex', gap:12, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ width:130, flexShrink:0, fontSize:11.5, fontWeight:600, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.04em', fontFamily:'var(--mono)', paddingTop:1 }}>
        {label}
      </span>
      <span style={{ flex:1, fontSize:13, color: value ? 'var(--ink)' : 'var(--ink3)', lineHeight:1.5 }}>
        {value || '—'}
      </span>
    </div>
  );
}

function StagePipeline({ stage }: { stage:string }) {
  const isLost = stage === 'LOST';
  const idx    = PIPELINE_STEPS.indexOf(stage);

  return (
    <div style={{ display:'flex', alignItems:'center', gap:3, flexWrap:'wrap' }}>
      {PIPELINE_STEPS.map((s, i) => {
        const passed = !isLost && i < idx;
        const active = !isLost && i === idx;
        const future = isLost || i > idx;
        const cfg = STAGE_CFG[s];
        return (
          <React.Fragment key={s}>
            <div style={{
              padding:'4px 11px', borderRadius:20, fontSize:10.5, fontWeight:700, whiteSpace:'nowrap',
              background: active ? cfg.bg : passed ? 'var(--teal-l)' : 'var(--bg)',
              color:      active ? cfg.color : passed ? 'var(--teal)' : 'var(--ink3)',
              border:     `1.5px solid ${active ? cfg.color : passed ? 'var(--teal-m)' : 'transparent'}`,
              opacity:    future && !active ? 0.65 : 1,
              transition: 'all 0.15s',
            }}>
              {cfg.label}
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{ width:14, height:1.5, background: passed ? 'var(--teal)' : 'var(--border)', flexShrink:0, transition:'background 0.15s' }} />
            )}
          </React.Fragment>
        );
      })}
      {isLost && (
        <>
          <div style={{ width:14, height:1.5, background:'var(--border)', flexShrink:0 }} />
          <div style={{ padding:'4px 11px', borderRadius:20, fontSize:10.5, fontWeight:700, background:'var(--red-l)', color:'var(--red)', border:'1.5px solid var(--red)', whiteSpace:'nowrap' }}>
            Lost
          </div>
        </>
      )}
    </div>
  );
}

function ActivityItem({ act }: { act:Activity }) {
  const cfg = ACT_CFG[act.type] || ACT_CFG.note;
  return (
    <div style={{ display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ width:34, height:34, borderRadius:'50%', background:cfg.bg, color:cfg.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
        <Icon name={cfg.icon} size={14} strokeWidth={2} />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
          <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:4, background:cfg.bg, color:cfg.color, fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
            {cfg.label}
          </span>
        </div>
        <div style={{ fontSize:13, color:'var(--ink)', lineHeight:1.5 }}>{act.text}</div>
        <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center' }}>
          <span style={{ fontSize:11.5, color:'var(--ink3)' }}>{act.user}</span>
          <span style={{ width:3, height:3, borderRadius:'50%', background:'var(--border2)', flexShrink:0 }} />
          <span style={{ fontSize:11.5, color:'var(--ink3)', fontFamily:'var(--mono)' }}>{fmtDate(act.date)}</span>
        </div>
      </div>
    </div>
  );
}

/* -- Tabs -- */
const TABS: { key:string; label:string; icon:IconName }[] = [
  { key:'overview',    label:'Overview',    icon:'grid'     },
  { key:'activities',  label:'Activities',  icon:'activity' },
  { key:'notes',       label:'Notes',       icon:'edit'     },
  { key:'files',       label:'Files',       icon:'folder'   },
];

/* ------------------------------------------
   Main component
------------------------------------------ */
export const LeadDetail: React.FC = () => {
  const { id }    = useParams<{ id:string }>();
  const isMobile  = useIsMobile();
  const lead      = SAMPLE_LEADS.find(l => l.id === id);

  const [tab,        setTab]        = useState('overview');
  const [leadStage,  setLeadStage]  = useState(lead?.stage ?? 'NEW');
  const [activities, setActivities] = useState<Activity[]>(id ? (BASE_ACTIVITIES[id] ?? []) : []);
  const [notes,      setNotes]      = useState<Note[]>([
    { id:'n1', text:'Strong relationship with referral partner. Mark as priority account.', user:'Amina Hassan', created_at:'2025-01-28' },
  ]);
  const [noteText,   setNoteText]   = useState('');
  const [files,      setFiles]      = useState<FileItem[]>(id ? (BASE_FILES[id] ?? []) : []);
  const [logType,    setLogType]    = useState<Activity['type']>('call');
  const [logText,    setLogText]    = useState('');

  /* -- Not found -- */
  if (!lead) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14, color:'var(--ink3)', fontFamily:'var(--font)' }}>
        <Icon name="target" size={44} strokeWidth={1.2} style={{ opacity:0.3 } as React.CSSProperties} />
        <div style={{ fontSize:16, fontWeight:600, color:'var(--ink)' }}>Lead not found</div>
        <p style={{ fontSize:13, margin:0, color:'var(--ink3)' }}>This lead may have been deleted or the URL is incorrect.</p>
        <Link to="/leads" className="btn btn-secondary btn-md">
          ? Back to Leads
        </Link>
      </div>
    );
  }

  const stageCfg = STAGE_CFG[leadStage] || STAGE_CFG.NEW;
  const priCfg   = PRIORITY_CFG[lead.priority] || PRIORITY_CFG.MEDIUM;
  const stepIdx  = PIPELINE_STEPS.indexOf(leadStage);
  const progress = leadStage === 'LOST' ? 100 : Math.round((stepIdx + 1) / PIPELINE_STEPS.length * 100);

  function advanceStage() {
    if (leadStage === 'WON' || leadStage === 'LOST') return;
    const nextIdx = stepIdx + 1;
    if (nextIdx >= PIPELINE_STEPS.length) return;
    const next = PIPELINE_STEPS[nextIdx];
    setActivities(p => [{
      id: Date.now().toString(), type:'stage',
      text: `Stage advanced: ${STAGE_CFG[leadStage].label} ? ${STAGE_CFG[next].label}`,
      user:'You', date: new Date().toISOString().split('T')[0],
    }, ...p]);
    setLeadStage(next);
  }

  function markLost() {
    if (leadStage === 'LOST') return;
    setActivities(p => [{
      id: Date.now().toString(), type:'stage',
      text: `Lead marked as Lost from ${STAGE_CFG[leadStage].label}`,
      user:'You', date: new Date().toISOString().split('T')[0],
    }, ...p]);
    setLeadStage('LOST');
  }

  function addNote() {
    if (!noteText.trim()) return;
    setNotes(p => [{ id:Date.now().toString(), text:noteText.trim(), user:'You', created_at:new Date().toISOString().split('T')[0] }, ...p]);
    setNoteText('');
  }

  function logActivity() {
    if (!logText.trim()) return;
    setActivities(p => [{ id:Date.now().toString(), type:logType, text:logText.trim(), user:'You', date:new Date().toISOString().split('T')[0] }, ...p]);
    setLogText('');
  }

  /* -- Card wrapper -- */
  function Card({ children, style }: { children:React.ReactNode; style?: React.CSSProperties }) {
    return (
      <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', padding:'18px 20px', boxShadow:'var(--shadow-sm)', ...style }}>
        {children}
      </div>
    );
  }

  function CardHdr({ icon, title, action }: { icon:IconName; title:string; action?: React.ReactNode }) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Icon name={icon} size={15} strokeWidth={2} style={{ color:'var(--teal)' } as React.CSSProperties} />
          <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{title}</span>
        </div>
        {action}
      </div>
    );
  }

  return (
    <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', fontFamily:'var(--font)' }}>

      {/* -- Header -- */}
      <div style={{ background:'var(--white)', borderBottom:'1px solid var(--border)', padding:'16px 28px' }}>

        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <Link to="/leads"
            style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', fontSize:13, fontFamily:'var(--font)', padding:0, textDecoration:'none' }}
            onMouseEnter={e=>(e.currentTarget.style.color='var(--ink)')}
            onMouseLeave={e=>(e.currentTarget.style.color='var(--ink3)')}>
            <Icon name="arrowLeft" size={14} strokeWidth={2} /> Leads
          </Link>
          <Icon name="chevronRight" size={12} strokeWidth={2} style={{ color:'var(--border2)' } as React.CSSProperties} />
          <span style={{ fontSize:13, color:'var(--ink2)' }}>{lead.company}</span>
        </div>

        {/* Lead identity */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
            <div style={{ width:54, height:54, borderRadius: 9, background:avatarColor(lead.company), color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, fontWeight:800, flexShrink:0, fontFamily:'var(--font)' }}>
              {initials(lead.company)}
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap', marginBottom:5 }}>
                <h1 style={{ fontSize:20, fontWeight:800, color:'var(--navy)', margin:0, letterSpacing:'-0.3px' }}>{lead.company}</h1>
                <StageBadge stage={leadStage} />
                <span style={{ padding:'3px 9px', borderRadius:5, fontSize:11, fontWeight:600, background:priCfg.bg, color:priCfg.color }}>
                  {priCfg.label} Priority
                </span>
              </div>
              <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
                <span style={{ fontSize:13, color:'var(--ink3)', display:'flex', alignItems:'center', gap:5 }}>
                  <Icon name="contact" size={12} strokeWidth={2} style={{ flexShrink:0 } as React.CSSProperties} />
                  {lead.contact_name}
                </span>
                {lead.contact_email && (
                  <span style={{ fontSize:13, color:'var(--ink3)', display:'flex', alignItems:'center', gap:5 }}>
                    <Icon name="mail" size={12} strokeWidth={2} style={{ flexShrink:0 } as React.CSSProperties} />
                    {lead.contact_email}
                  </span>
                )}
                {lead.contact_phone && (
                  <span style={{ fontSize:13, color:'var(--ink3)' }}>{lead.contact_phone}</span>
                )}
                {lead.location && (
                  <span style={{ fontSize:13, color:'var(--ink3)', display:'flex', alignItems:'center', gap:4 }}>
                    <Icon name="mapPin" size={12} strokeWidth={2} style={{ flexShrink:0 } as React.CSSProperties} />
                    {lead.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:7, flexShrink:0, flexWrap:'wrap' }}>
            {leadStage !== 'WON' && leadStage !== 'LOST' && (
              <>
                <button type="button" className="btn btn-primary btn-sm"
                  style={{ display:'flex', alignItems:'center', gap:6 }}
                  onClick={advanceStage}
                  disabled={stepIdx >= PIPELINE_STEPS.length - 1}>
                  <Icon name="arrowUpRight" size={13} strokeWidth={2.5} /> Advance Stage
                </button>
                <button type="button" className="btn btn-secondary btn-sm"
                  style={{ display:'flex', alignItems:'center', gap:6, color:'var(--red)', borderColor:'var(--red-l)' }}
                  onClick={markLost}>
                  Mark as Lost
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary btn-sm"
              style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Icon name="edit" size={13} strokeWidth={2} /> Edit
            </button>
            <button type="button" className="btn btn-secondary btn-sm">
              <Icon name="moreHorizontal" size={14} />
            </button>
          </div>
        </div>

        {/* Stage pipeline */}
        <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)', overflowX:'auto' }}>
          <StagePipeline stage={leadStage} />
        </div>
      </div>

      {/* -- Tabs -- */}
      <div style={{ background:'var(--white)', borderBottom:'1px solid var(--border)', padding:'0 28px', display:'flex', gap:2 }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={()=>setTab(t.key)}
            style={{
              display:'flex', alignItems:'center', gap:7,
              padding:'12px 14px', border:'none', background:'none', cursor:'pointer',
              fontSize:13.5, fontWeight:tab===t.key?700:500,
              color:tab===t.key?'var(--teal)':'var(--ink3)',
              borderBottom:tab===t.key?'2px solid var(--teal)':'2px solid transparent',
              marginBottom:-1, fontFamily:'var(--font)', transition:'color 0.1s', whiteSpace:'nowrap',
            }}>
            <Icon name={t.icon} size={14} strokeWidth={tab===t.key?2.2:1.75} />
            {t.label}
            {t.key==='activities' && activities.length > 0 && (
              <span style={{ fontSize:10.5, fontWeight:700, padding:'1px 5px', borderRadius: 9, background:'var(--teal-l)', color:'var(--teal)', fontFamily:'var(--mono)' }}>
                {activities.length}
              </span>
            )}
            {t.key==='notes' && notes.length > 0 && (
              <span style={{ fontSize:10.5, fontWeight:700, padding:'1px 5px', borderRadius: 9, background:'var(--gold-l)', color:'var(--gold)', fontFamily:'var(--mono)' }}>
                {notes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* -- Tab body -- */}
      <div style={{ padding:'24px 28px' }}>

        {/* -- OVERVIEW -- */}
        {tab === 'overview' && (
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap:18, alignItems:'start' }}>

            {/* Left column */}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* Contact info */}
              <Card>
                <CardHdr icon="contact" title="Contact Information" />
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0 14px', borderBottom:'1px solid var(--border)', marginBottom:4 }}>
                  <Av name={lead.contact_name} size={42} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)' }}>{lead.contact_name}</div>
                    <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>Primary Contact · {lead.company}</div>
                  </div>
                </div>
                <InfoRow label="Email"    value={lead.contact_email}  />
                <InfoRow label="Phone"    value={lead.contact_phone}  />
                <InfoRow label="Industry" value={lead.industry}       />
                <InfoRow label="Location" value={lead.location}       />
                {lead.website && <InfoRow label="Website" value={lead.website} />}
              </Card>

              {/* Lead details */}
              <Card>
                <CardHdr icon="target" title="Lead Details" />
                <InfoRow label="Source"    value={lead.source}                              />
                <InfoRow label="Stage"     value={STAGE_CFG[leadStage]?.label}             />
                <InfoRow label="Priority"  value={PRIORITY_CFG[lead.priority]?.label}      />
                <InfoRow label="Est. Value" value={fmtValue(lead.value)}                   />
                <InfoRow label="Assigned"  value={lead.assigned_to}                        />
                <InfoRow label="Expected Close" value={lead.expected_close ? fmtDate(lead.expected_close) : undefined} />
                <InfoRow label="Created"   value={fmtDate(lead.created_at)}                />
              </Card>

              {/* Notes preview */}
              {lead.notes && (
                <Card>
                  <CardHdr icon="edit" title="Notes"
                    action={<button type="button" onClick={()=>setTab('notes')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--teal)', fontFamily:'var(--font)', padding:0 }}>View all</button>}
                  />
                  <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.65, margin:0 }}>{lead.notes}</p>
                </Card>
              )}
            </div>

            {/* Right sidebar */}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* Pipeline value */}
              <Card>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:'var(--mono)', marginBottom:8 }}>
                  Pipeline Value
                </div>
                <div style={{ fontSize:27, fontWeight:800, color:'var(--navy)', letterSpacing:'-0.5px', marginBottom:3 }}>
                  {fmtValue(lead.value)}
                </div>
                <div style={{ fontSize:12, color:'var(--ink3)', marginBottom:16 }}>Estimated deal value</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <span style={{ fontSize:12, color:'var(--ink3)' }}>Stage progress</span>
                  <span style={{ fontSize:12, fontWeight:700, color: leadStage==='LOST'?'var(--red)':'var(--teal)' }}>
                    {leadStage==='WON' ? 'Closed Won' : leadStage==='LOST' ? 'Closed Lost' : `${progress}%`}
                  </span>
                </div>
                <div style={{ height:7, borderRadius:4, background:'var(--bg)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:4,
                    background: leadStage==='LOST' ? 'var(--red)' : leadStage==='WON' ? 'var(--green)' : 'var(--teal)',
                    width:`${progress}%`, transition:'width 0.3s ease',
                  }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:14 }}>
                  {[
                    { label:'Source',  value: lead.source },
                    { label:'Priority', value: PRIORITY_CFG[lead.priority]?.label },
                  ].map(item => (
                    <div key={item.label} style={{ background:'var(--bg)', borderRadius: 9, padding:'10px 12px' }}>
                      <div style={{ fontSize:10.5, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:'var(--mono)', marginBottom:3 }}>{item.label}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Assigned */}
              {lead.assigned_to && (
                <Card>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:'var(--mono)', marginBottom:12 }}>
                    Assigned To
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    <Av name={lead.assigned_to} size={38} />
                    <div>
                      <div style={{ fontWeight:700, fontSize:13.5, color:'var(--ink)' }}>{lead.assigned_to}</div>
                      <div style={{ fontSize:12, color:'var(--ink3)', marginTop:1 }}>Sales Officer</div>
                    </div>
                  </div>
                  {lead.expected_close && (
                    <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'var(--ink3)', display:'flex', alignItems:'center', gap:5 }}>
                        <Icon name="calendar" size={13} strokeWidth={1.75} /> Expected close
                      </span>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)', fontFamily:'var(--mono)' }}>{fmtDate(lead.expected_close)}</span>
                    </div>
                  )}
                </Card>
              )}

              {/* Recent activity */}
              <Card>
                <CardHdr icon="activity" title="Recent Activity"
                  action={<button type="button" onClick={()=>setTab('activities')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--teal)', fontFamily:'var(--font)', padding:0 }}>View all</button>}
                />
                {activities.length === 0 ? (
                  <div style={{ fontSize:13, color:'var(--ink3)', textAlign:'center', padding:'10px 0' }}>No activities yet</div>
                ) : activities.slice(0,3).map(act => {
                  const cfg = ACT_CFG[act.type] || ACT_CFG.note;
                  return (
                    <div key={act.id} style={{ display:'flex', gap:9, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:26, height:26, borderRadius:'50%', background:cfg.bg, color:cfg.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon name={cfg.icon} size={11} strokeWidth={2} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{act.text}</div>
                        <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2, fontFamily:'var(--mono)' }}>{fmtDate(act.date)}</div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          </div>
        )}

        {/* -- ACTIVITIES -- */}
        {tab === 'activities' && (
          <div style={{ maxWidth:680 }}>

            {/* Log activity */}
            <Card style={{ marginBottom:16 }}>
              <CardHdr icon="activity" title="Log Activity" />
              {/* Type selector */}
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                {(Object.keys(ACT_CFG) as Activity['type'][]).filter(t=>t!=='stage').map(t => {
                  const c = ACT_CFG[t];
                  const sel = logType === t;
                  return (
                    <button key={t} type="button" onClick={()=>setLogType(t)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius: 9, border:`1.5px solid ${sel?c.color:'var(--border)'}`, background:sel?c.bg:'var(--bg)', cursor:'pointer', fontSize:12.5, fontWeight:600, color:sel?c.color:'var(--ink3)', fontFamily:'var(--font)', transition:'all 0.12s' }}>
                      <Icon name={c.icon} size={12} strokeWidth={2} style={{ color:sel?c.color:'var(--ink3)' } as React.CSSProperties} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <textarea className="input-field" rows={3} placeholder={`Describe the ${ACT_CFG[logType]?.label.toLowerCase()}…`}
                value={logText} onChange={e=>setLogText(e.target.value)}
                style={{ resize:'vertical', minHeight:80, marginBottom:10 }} />
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={logActivity} disabled={!logText.trim()}>
                  Log {ACT_CFG[logType]?.label}
                </button>
              </div>
            </Card>

            {/* Timeline */}
            <Card>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Activity Timeline</span>
                <span style={{ fontSize:12.5, color:'var(--ink3)' }}>{activities.length} recorded</span>
              </div>
              <div style={{ marginTop:10 }}>
                {activities.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', color:'var(--ink3)' }}>
                    <Icon name="activity" size={28} strokeWidth={1.3} style={{ display:'block', margin:'0 auto 8px', opacity:0.3 } as React.CSSProperties} />
                    No activities yet — log one above
                  </div>
                ) : activities.map(act => <ActivityItem key={act.id} act={act} />)}
              </div>
            </Card>
          </div>
        )}

        {/* -- NOTES -- */}
        {tab === 'notes' && (
          <div style={{ maxWidth:680 }}>
            <Card style={{ marginBottom:16 }}>
              <CardHdr icon="edit" title="Add Note" />
              <textarea className="input-field" placeholder="Write a note about this lead…" rows={4}
                value={noteText} onChange={e=>setNoteText(e.target.value)}
                style={{ resize:'vertical', minHeight:100, marginBottom:10 }} />
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={addNote} disabled={!noteText.trim()}>
                  Save Note
                </button>
              </div>
            </Card>

            {notes.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--ink3)' }}>
                <Icon name="edit" size={28} strokeWidth={1.3} style={{ display:'block', margin:'0 auto 8px', opacity:0.3 } as React.CSSProperties} />
                No notes yet
              </div>
            ) : notes.map(note => (
              <div key={note.id} style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', padding:'16px 20px', boxShadow:'var(--shadow-sm)', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <Av name={note.user} size={28} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{note.user}</div>
                      <div style={{ fontSize:11.5, color:'var(--ink3)', fontFamily:'var(--mono)', marginTop:1 }}>{fmtDate(note.created_at)}</div>
                    </div>
                  </div>
                  <button type="button" onClick={()=>setNotes(p=>p.filter(n=>n.id!==note.id))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:'4px', borderRadius:4 }}
                    onMouseEnter={e=>(e.currentTarget.style.color='var(--red)')}
                    onMouseLeave={e=>(e.currentTarget.style.color='var(--ink3)')}>
                    <Icon name="trash" size={13} strokeWidth={1.75} />
                  </button>
                </div>
                <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.65, margin:0 }}>{note.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* -- FILES -- */}
        {tab === 'files' && (
          <div style={{ maxWidth:680 }}>
            {/* Drop zone */}
            <div style={{ background:'var(--white)', borderRadius: 9, border:'2px dashed var(--border2)', padding:'36px 24px', textAlign:'center', marginBottom:16, cursor:'pointer', transition:'border-color 0.12s' }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--teal)')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border2)')}>
              <Icon name="upload" size={28} strokeWidth={1.5} style={{ color:'var(--ink3)', display:'block', margin:'0 auto 10px' } as React.CSSProperties} />
              <div style={{ fontSize:14, fontWeight:600, color:'var(--ink2)', marginBottom:4 }}>Drop files here or click to upload</div>
              <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Supports PDF, Excel, Word, Images · Max 20 MB</div>
            </div>

            {/* File list */}
            <Card>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>Attached Files</span>
                <span style={{ fontSize:12.5, color:'var(--ink3)' }}>{files.length} files</span>
              </div>
              {files.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--ink3)' }}>
                  <Icon name="folder" size={26} strokeWidth={1.3} style={{ display:'block', margin:'0 auto 8px', opacity:0.3 } as React.CSSProperties} />
                  No files attached yet
                </div>
              ) : files.map(f => (
                <div key={f.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:38, height:38, borderRadius:9, background:'var(--teal-l)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon name={f.icon} size={17} strokeWidth={1.75} style={{ color:'var(--teal)' } as React.CSSProperties} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:1 }}>{f.size} · {fmtDate(f.date)}</div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button type="button" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:'5px 7px', borderRadius:6 }}
                      onMouseEnter={e=>(e.currentTarget.style.color='var(--teal)')}
                      onMouseLeave={e=>(e.currentTarget.style.color='var(--ink3)')}>
                      <Icon name="download" size={14} strokeWidth={2} />
                    </button>
                    <button type="button" onClick={()=>setFiles(p=>p.filter(fi=>fi.id!==f.id))}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:'5px 7px', borderRadius:6 }}
                      onMouseEnter={e=>(e.currentTarget.style.color='var(--red)')}
                      onMouseLeave={e=>(e.currentTarget.style.color='var(--ink3)')}>
                      <Icon name="trash" size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
