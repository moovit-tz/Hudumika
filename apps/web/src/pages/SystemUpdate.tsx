import React, { useState } from 'react';
import { Icon } from '../components/Icon.js';

/* -- Types -- */
interface UpdateEntry {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch' | 'security';
  notes: string[];
  status: 'installed' | 'available' | 'failed';
}

/* -- Static data -- */
const CURRENT_VERSION: string = '2.4.1';
const LATEST_VERSION: string  = '2.5.0';
const HAS_UPDATE = CURRENT_VERSION !== LATEST_VERSION;

const UPDATE_HISTORY: UpdateEntry[] = [
  {
    version: '2.5.0', date: '2026-06-10', type: 'minor', status: 'available',
    notes: [
      'New AI-powered shipment risk scoring',
      'File Manager drag-and-drop upload improvements',
      'Super Admin: Finance module with MRR/ARR analytics',
      'Dark mode refinements across all pages',
      'Performance improvements — 40% faster page loads',
    ],
  },
  {
    version: '2.4.1', date: '2026-05-22', type: 'patch', status: 'installed',
    notes: [
      'Fixed demurrage calculation rounding error',
      'Corrected customs declaration export format for TANCIS',
      'UI: resolved sidebar collapse animation flicker',
    ],
  },
  {
    version: '2.4.0', date: '2026-05-01', type: 'minor', status: 'installed',
    notes: [
      'File Manager with folder hierarchy and preview panel',
      'Lead management with timeline and activity log',
      'Quotation module with PDF generation',
      'Improved mobile responsiveness',
    ],
  },
  {
    version: '2.3.2', date: '2026-04-14', type: 'security', status: 'installed',
    notes: [
      'Security: patched JWT refresh-token vulnerability',
      'Security: added rate limiting to authentication endpoints',
      'Updated all third-party dependencies',
    ],
  },
  {
    version: '2.3.0', date: '2026-03-20', type: 'minor', status: 'installed',
    notes: [
      'Super Admin dashboard with company analytics',
      'Multi-tenant package and subscription management',
      'Domain management with SSL status tracking',
    ],
  },
  {
    version: '2.2.0', date: '2026-02-10', type: 'minor', status: 'installed',
    notes: [
      'CRM module: Customers, Leads, Sales pipeline',
      'Support ticket system',
      'Contract management with e-signature placeholders',
    ],
  },
];

const SYS_REQS = [
  { label: 'Node.js',       required: '= 18.0',  current: '20.11.0', ok: true  },
  { label: 'NPM',           required: '= 9.0',   current: '10.2.4',  ok: true  },
  { label: 'Disk space',    required: '= 500 MB', current: '12.4 GB free', ok: true  },
  { label: 'RAM',           required: '= 512 MB', current: '3.8 GB free', ok: true  },
  { label: 'API server',    required: 'reachable', current: 'Online ?', ok: true  },
  { label: 'Database',      required: 'reachable', current: 'Online ?', ok: true  },
];

/* -- Badge helpers -- */
type BadgeType = 'major' | 'minor' | 'patch' | 'security';
const TYPE_COLORS: Record<BadgeType, { bg: string; color: string }> = {
  major:    { bg: '#fee2e2', color: '#dc2626' },
  minor:    { bg: '#dbeafe', color: '#2563eb' },
  patch:    { bg: '#ecfdf5', color: '#059669' },
  security: { bg: '#fef3c7', color: '#d97706' },
};

function TypeBadge({ type }: { type: BadgeType }) {
  const c = TYPE_COLORS[type];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', background: c.bg, color: c.color,
    }}>
      {type}
    </span>
  );
}

/* -- Main Component -- */
export const SystemUpdate: React.FC = () => {
  const [updating, setUpdating] = useState(false);
  const [updateDone, setUpdateDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  function startUpdate() {
    setShowConfirm(false);
    setUpdating(true);
    setProgress(0);

    const steps = [
      { pct: 10, label: 'Downloading update package…'    },
      { pct: 30, label: 'Verifying integrity checksums…'  },
      { pct: 50, label: 'Backing up current installation…' },
      { pct: 70, label: 'Applying database migrations…'   },
      { pct: 85, label: 'Replacing application files…'    },
      { pct: 95, label: 'Clearing cache and reloading…'   },
      { pct: 100, label: 'Update complete!'               },
    ];

    let i = 0;
    const tick = () => {
      if (i < steps.length) {
        setProgress(steps[i].pct);
        setProgressLabel(steps[i].label);
        i++;
        setTimeout(tick, 900);
      } else {
        setUpdating(false);
        setUpdateDone(true);
      }
    };
    setTimeout(tick, 400);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ background:'var(--white)', borderBottom:'1px solid var(--border)', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--ink)' }}>System Update</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>Manage software updates and version history</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button
            onClick={() => window.location.reload()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border:'1px solid var(--border)', background:'var(--white)', color:'var(--ink2)', fontSize:12, fontWeight:600, cursor:'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}
          >
            <Icon name="refresh" size={13} /> Check for Updates
          </button>
          {HAS_UPDATE && !updateDone && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={updating}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border:'none', background: updating ? 'var(--ink3)' : 'var(--teal)', color:'#fff', fontSize:12, fontWeight:700, cursor: updating ? 'not-allowed' : 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}
            >
              <Icon name="upload" size={13} />
              {updating ? 'Updating…' : `Update to v${LATEST_VERSION}`}
            </button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Update progress bar */}
          {updating && (
            <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', padding:'20px 24px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ width:32, height:32, borderRadius: 9, background:'var(--teal-l)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="upload" size={16} color="var(--teal)" />
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)' }}>Updating Hudumika…</div>
                  <div style={{ fontSize:12, color:'var(--ink3)' }}>Do not close this window</div>
                </div>
              </div>
              <div style={{ height:8, borderRadius:99, background:'var(--border)', overflow:'hidden', marginBottom:10 }}>
                <div style={{ width:`${progress}%`, height:'100%', background:'var(--teal)', borderRadius:99, transition:'width 0.5s ease' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--ink3)' }}>
                <span>{progressLabel}</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}

          {/* Success banner */}
          {updateDone && (
            <div style={{ background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius: 9, padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
              <Icon name="checkCircle" size={20} color="#059669" />
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#047857' }}>Successfully updated to v{LATEST_VERSION}</div>
                <div style={{ fontSize:12, color:'#065f46', marginTop:2 }}>All modules are running the latest version. A page reload may be required.</div>
              </div>
            </div>
          )}

          {/* Version cards row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Current version */}
            <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', padding:'20px 22px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Current Version</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:30, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.04em' }}>v{updateDone ? LATEST_VERSION : CURRENT_VERSION}</span>
                <span style={{ padding:'2px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', fontSize:11, fontWeight:700 }}>Installed</span>
              </div>
              <div style={{ fontSize:12, color:'var(--ink3)' }}>Released {UPDATE_HISTORY.find(u => u.version === CURRENT_VERSION)?.date}</div>
            </div>

            {/* Latest version */}
            <div style={{ borderRadius: 9, border: HAS_UPDATE && !updateDone ? '1px solid #bfdbfe' : '1px solid var(--border)', padding:'20px 22px', background: HAS_UPDATE && !updateDone ? '#eff6ff' : 'var(--white)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Latest Version</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:30, fontWeight:800, color: HAS_UPDATE && !updateDone ? '#2563eb' : 'var(--ink)', letterSpacing:'-0.04em' }}>v{LATEST_VERSION}</span>
                {HAS_UPDATE && !updateDone
                  ? <span style={{ padding:'2px 8px', borderRadius:20, background:'#dbeafe', color:'#1d4ed8', fontSize:11, fontWeight:700 }}>Update Available</span>
                  : <span style={{ padding:'2px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', fontSize:11, fontWeight:700 }}>Up to Date</span>
                }
              </div>
              <div style={{ fontSize:12, color:'var(--ink3)' }}>Released {UPDATE_HISTORY.find(u => u.version === LATEST_VERSION)?.date}</div>
            </div>
          </div>

          {/* What's new */}
          {HAS_UPDATE && !updateDone && (
            <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:7, background:'var(--teal-l)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="star" size={14} color="var(--teal)" />
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)' }}>What's New in v{LATEST_VERSION}</div>
                  <div style={{ fontSize:12, color:'var(--ink3)' }}>Minor release · {UPDATE_HISTORY[0].date}</div>
                </div>
                <TypeBadge type={UPDATE_HISTORY[0].type} />
              </div>
              <div style={{ padding:'16px 20px' }}>
                <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:8 }}>
                  {UPDATE_HISTORY[0].notes.map((note, i) => (
                    <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:13, color:'var(--ink)' }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--teal)', flexShrink:0, marginTop:5 }} />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* System requirements */}
          <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:'var(--blue-l)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="monitor" size={14} color="var(--blue)" />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)' }}>System Requirements</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)' }}>
              {SYS_REQS.map((req, i) => (
                <div key={req.label} style={{
                  padding:'14px 20px',
                  borderRight: (i + 1) % 3 === 0 ? 'none' : '1px solid var(--border)',
                  borderBottom: i < SYS_REQS.length - 3 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'var(--ink2)' }}>{req.label}</span>
                    <span style={{ width:16, height:16, borderRadius:'50%', background: req.ok ? '#ecfdf5' : '#fef2f2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Icon name={req.ok ? 'check' : 'x'} size={10} color={req.ok ? '#059669' : '#dc2626'} />
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--ink3)', marginBottom:2 }}>Required: {req.required}</div>
                  <div style={{ fontSize:12, fontWeight:600, color: req.ok ? '#059669' : '#dc2626' }}>{req.current}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Update history */}
          <div style={{ background:'var(--white)', borderRadius: 9, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:'var(--purple-l)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="clock" size={14} color="var(--purple)" />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)' }}>Update History</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column' }}>
              {UPDATE_HISTORY.filter(u => u.status !== 'available').map((u, i, arr) => (
                <div key={u.version} style={{
                  padding:'16px 20px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  display:'flex', alignItems:'flex-start', gap:16,
                }}>
                  {/* Timeline dot */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:0, flexShrink:0, paddingTop:3 }}>
                    <div style={{
                      width:10, height:10, borderRadius:'50%', flexShrink:0,
                      background: i === 0 ? 'var(--teal)' : 'var(--border2)',
                      border: i === 0 ? '2px solid var(--teal-m)' : '2px solid var(--border)',
                    }} />
                  </div>

                  {/* Content */}
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>v{u.version}</span>
                      <TypeBadge type={u.type} />
                      <span style={{ fontSize:11, color:'var(--ink3)', marginLeft:'auto' }}>{u.date}</span>
                    </div>
                    <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:4 }}>
                      {u.notes.map((note, j) => (
                        <li key={j} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'var(--ink2)' }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--ink3)', flexShrink:0, marginTop:5 }} />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--white)', borderRadius: 9, padding:'28px 32px', width:420, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:40, height:40, borderRadius: 9, background:'#fef3c7', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name="alertTriangle" size={20} color="#d97706" />
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)' }}>Confirm System Update</div>
                <div style={{ fontSize:12, color:'var(--ink3)' }}>v{CURRENT_VERSION} ? v{LATEST_VERSION}</div>
              </div>
            </div>
            <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.6, marginBottom:20 }}>
              This will update Hudumika to <strong>v{LATEST_VERSION}</strong>. The system will be briefly unavailable during the update. A backup will be created automatically before any changes are applied.
            </p>
            <div style={{ background:'var(--bg)', borderRadius: 9, padding:'12px 14px', marginBottom:20, fontSize:12, color:'var(--ink2)' }}>
              <div style={{ fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Before you proceed:</div>
              <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:4 }}>
                {['Notify active users of brief downtime', 'Ensure all database transactions are complete', 'A snapshot backup will be created automatically'].map(t => (
                  <li key={t} style={{ display:'flex', gap:8 }}>
                    <Icon name="check" size={12} color="var(--green)" style={{ marginTop:1 }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ padding:'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border:'1px solid var(--border)', background:'var(--white)', color:'var(--ink2)', fontSize:13, fontWeight:600, cursor:'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}
              >
                Cancel
              </button>
              <button
                onClick={startUpdate}
                style={{ padding:'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border:'none', background:'var(--teal)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}
              >
                Update Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
