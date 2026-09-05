import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { getMood } from '../lib/greeting.js';
import { resolveLandingStyle } from '../lib/landingStyle.js';
import { useEnabledApps } from '../hooks/useEnabledApps.js';
import { WorkspaceHome } from './WorkspaceHome.js';
import { STAGE_LABELS } from '@hudumika/types';
import './AgenticHome.css';

/** Mirrors apps/api/src/routes/search.routes.ts's SearchHit — not imported
 *  directly since apps/web doesn't depend on the API's source tree. */
interface SearchHit { id: string; label: string; sublabel: string | null; path: string }

interface CockpitTask { id: string; title: string; due: string | null; priority: string; status: string }
interface CockpitTicket { id: string; ref: string; subject: string; status: string; priority: string; sla_deadline: string | null }
interface CockpitShipment { id: string; ref_number: string; goods_desc: string; stage: string; eta: string | null }
interface CockpitLeaveReq { id: string; type: string; from_date: string; to_date: string; days: number; status: string }
interface CockpitBalance { code: string; name: string; remaining: number }
interface CockpitPettyReq { id: string; amount: number; category: string; purpose: string; requested_at: string; wallet_id?: string; requested_by?: string }
interface CockpitClock { active: boolean }

interface CockpitData {
  tasks: CockpitTask[];
  tickets: CockpitTicket[];
  shipments: CockpitShipment[] | null;
  leave: { balance: CockpitBalance[] | null; pendingRequests: CockpitLeaveReq[] | null } | null;
  clock: CockpitClock | null;
  pettyCash: { myRequests: CockpitPettyReq[] | null; pendingMyApproval: CockpitPettyReq[] | null } | null;
}

const EMPTY: CockpitData = { tasks: [], tickets: [], shipments: null, leave: null, clock: null, pettyCash: null };

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function money(n: number): string { return `TZS ${Number(n).toLocaleString()}`; }
function roleLabel(role?: string): string {
  if (!role) return '';
  return role.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

/** Every entry links to a real page — no simulated "AI drafted this for you"
 *  action. See the plan/user decision: only suggestions genuinely computed
 *  from fetched data, nothing decorative or invented (no Level Up/course
 *  card, no fabricated digest percentages — this codebase has a hard rule
 *  against fabricated data, enforced repeatedly elsewhere in the app). */
interface Suggestion { text: string; linkTo?: string; linkLabel?: string }
function buildSuggestions(data: CockpitData): Suggestion[] {
  const out: Suggestion[] = [];
  const dueToday = data.tasks.filter(t => isToday(t.due));
  if (dueToday.length) out.push({ text: `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today.`, linkTo: '/tasks', linkLabel: 'Open Tasks' });
  const slaRisk = data.tickets.filter(t => t.sla_deadline && new Date(t.sla_deadline).getTime() - Date.now() < 2 * 3600 * 1000 && new Date(t.sla_deadline).getTime() > Date.now());
  if (slaRisk.length) out.push({ text: `${slaRisk.length} ticket${slaRisk.length === 1 ? '' : 's'} close to breaching SLA.`, linkTo: '/bliss', linkLabel: 'Open Bliss' });
  const pendingApproval = data.pettyCash?.pendingMyApproval?.length ?? 0;
  if (pendingApproval) out.push({ text: `${pendingApproval} petty-cash request${pendingApproval === 1 ? '' : 's'} waiting on your approval.`, linkTo: '/petti', linkLabel: 'Review in Petti' });
  const pendingLeave = data.leave?.pendingRequests?.length ?? 0;
  if (pendingLeave) out.push({ text: `${pendingLeave} leave request${pendingLeave === 1 ? '' : 's'} still pending.`, linkTo: '/nexushr', linkLabel: 'Open NexusHR' });
  const actionShipments = data.shipments?.filter(s => /action|incomplete|pending/i.test(s.stage)) ?? [];
  if (actionShipments.length) out.push({ text: `${actionShipments.length} shipment${actionShipments.length === 1 ? '' : 's'} need${actionShipments.length === 1 ? 's' : ''} your attention.`, linkTo: '/clearos', linkLabel: 'Open ClearOS' });
  if (out.length === 0) out.push({ text: "You're all caught up — nothing urgent right now." });
  return out;
}

function agentReply(data: CockpitData, msgRaw: string): string {
  const msg = msgRaw.toLowerCase();
  if (/overdue|late|behind/.test(msg)) {
    const overdue = data.tasks.filter(t => t.due && new Date(t.due).getTime() < new Date(new Date().toDateString()).getTime());
    return overdue.length ? `${overdue.length} overdue: ${overdue.map(t => t.title).join('; ')}.` : "Nothing's overdue right now.";
  }
  if (/task/.test(msg)) return data.tasks.length ? `You have ${data.tasks.length} open task${data.tasks.length === 1 ? '' : 's'}, soonest: "${data.tasks[0]?.title}".` : 'No open tasks.';
  if (/ticket/.test(msg)) return data.tickets.length ? `${data.tickets.length} open ticket${data.tickets.length === 1 ? '' : 's'} assigned to you.` : 'No tickets assigned to you.';
  if (/shipment/.test(msg)) return data.shipments?.length ? `${data.shipments.length} shipment${data.shipments.length === 1 ? '' : 's'} on your plate.` : 'No shipments assigned to you.';
  if (/leave/.test(msg)) return data.leave?.pendingRequests?.length ? `${data.leave.pendingRequests.length} leave request${data.leave.pendingRequests.length === 1 ? '' : 's'} pending.` : 'No pending leave requests.';
  if (/petty|cash|wallet/.test(msg)) return data.pettyCash ? `${data.pettyCash.myRequests?.length ?? 0} of your own requests pending, ${data.pettyCash.pendingMyApproval?.length ?? 0} waiting on your approval.` : "Petty cash isn't part of your workspace.";
  if (/help|what can you do/.test(msg)) return 'Ask me about your tasks, tickets, shipments, leave, or petty cash — I answer from what\'s actually on your plate right now.';
  if (/pending|waiting|plate|today|going on|status/.test(msg)) {
    const parts: string[] = [];
    if (data.tasks.length) parts.push(`${data.tasks.length} task${data.tasks.length === 1 ? '' : 's'}`);
    if (data.tickets.length) parts.push(`${data.tickets.length} ticket${data.tickets.length === 1 ? '' : 's'}`);
    if (data.shipments?.length) parts.push(`${data.shipments.length} shipment${data.shipments.length === 1 ? '' : 's'}`);
    const approvals = (data.pettyCash?.pendingMyApproval?.length ?? 0) + (data.leave?.pendingRequests?.length ?? 0);
    if (approvals) parts.push(`${approvals} item${approvals === 1 ? '' : 's'} waiting on your approval`);
    return parts.length ? `Right now: ${parts.join(', ')}.` : "You're all caught up — nothing pending right now.";
  }
  return "I can tell you about your tasks, tickets, shipments, leave, or petty cash — try asking about one of those.";
}

type Tab = 'feed' | 'operations' | 'reports' | 'profile';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'feed', label: 'Feed', icon: 'activity' },
  { key: 'operations', label: 'Operations', icon: 'grid' },
  { key: 'reports', label: 'Reports', icon: 'barChart' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

export const AgenticHome: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const enabledApps = useEnabledApps();
  const [data, setData] = useState<CockpitData | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ role: 'agent' | 'user'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [momentum, setMomentum] = useState(0);
  const [switching, setSwitching] = useState(false);

  // ── Search (real /v1/search, debounced) ──
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<{ data: Record<string, SearchHit[]>; order: string[] } | null>(null);
  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      apiFetch(`/v1/search?q=${encodeURIComponent(q)}`).then(setSearchResults).catch(() => setSearchResults(null));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  // ── Notifications (real, same endpoint AppHeader uses) ──
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifs, setNotifs] = useState<any[]>([]);
  const loadNotifs = useCallback(() => {
    apiFetch('/v1/notifications').then(res => {
      const list = Array.isArray(res) ? res : (res?.notifications ?? []);
      setNotifs(list);
      setUnreadCount(typeof res?.unread_count === 'number' ? res.unread_count : list.filter((n: any) => !n.read).length);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadNotifs(); const t = setInterval(loadNotifs, 45000); return () => clearInterval(t); }, [loadNotifs]);

  useEffect(() => {
    apiFetch('/v1/workspace/cockpit').then(setData).catch(() => setData(EMPTY));
  }, []);

  const mood = useMemo(() => getMood(), []);
  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const d = data ?? EMPTY;

  async function toggleTaskDone(id: string) {
    setData(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== id) } : prev);
    setMomentum(m => m + 1);
    try {
      await apiFetch(`/v1/tasks/items/${id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
    } catch {
      // Real state wins on the next load if this failed — this is a
      // dashboard summary, not the Tasks app's own source of truth.
    }
  }

  async function switchToAdvanced() {
    if (switching) return;
    setSwitching(true);
    try {
      const res = await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ profile: { landing_style: 'advanced' } }) });
      if (res?.user) updateUser(res.user);
    } catch {} finally { setSwitching(false); }
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatMsgs(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatBusy(true);
    setTimeout(() => {
      setChatMsgs(prev => [...prev, { role: 'agent', text: agentReply(d, text) }]);
      setChatBusy(false);
    }, 350);
  }

  const suggestions = useMemo(() => buildSuggestions(d), [d]);
  const openTaskCount = d.tasks.length;
  const openTicketCount = d.tickets.length;
  const shipmentCount = d.shipments?.length ?? 0;
  const approvalCount = (d.pettyCash?.pendingMyApproval?.length ?? 0) + (d.leave?.pendingRequests?.length ?? 0);
  const totalOnPlate = openTaskCount + openTicketCount + shipmentCount + approvalCount;

  const searchFlat = useMemo(() => {
    if (!searchResults) return [];
    const out: SearchHit[] = [];
    for (const cat of searchResults.order) {
      for (const hit of searchResults.data[cat] ?? []) { out.push(hit); if (out.length >= 8) return out; }
    }
    return out;
  }, [searchResults]);

  return (
    <div className="app-shell">
      <div className="app-main">
        <div className="ah-header">
          <button type="button" className="ah-header-mark" onClick={switchToAdvanced} disabled={switching} title="Switch to Advanced landing">
            <Icon name="layoutDashboard" size={14} color="#fff" />
          </button>
          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} variant="segmented">
            <TabsList>
              {TABS.map(t => (
                <TabsTrigger key={t.key} value={t.key}>
                  <Icon name={t.icon} size={13} strokeWidth={tab === t.key ? 2.3 : 1.8} />{t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="ah-header-search">
            <Icon name="search" size={13} color="var(--ink4)" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…" />
            {searchFlat.length > 0 && (
              <div className="ah-search-dropdown">
                {searchFlat.map(hit => (
                  <button key={hit.id} type="button" className="ah-search-row" onClick={() => { navigate(hit.path); setSearchQ(''); setSearchResults(null); }}>
                    <div className="ah-search-primary">{hit.label}</div>
                    {hit.sublabel && <div className="ah-search-secondary">{hit.sublabel}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ah-header-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ah-header-icon-btn" title="Notifications">
                  <Icon name="bell" size={17} color="var(--ink)" />
                  {unreadCount > 0 && <span className="ah-header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="ah-notif-menu">
                {notifs.length === 0 && <div className="ah-empty-row">No notifications.</div>}
                {notifs.slice(0, 6).map(n => (
                  <DropdownMenuItem key={n.id} onSelect={() => n.link && navigate(n.link)}>
                    <div>
                      <div style={{ fontWeight: n.read ? 400 : 700 }}>{n.title}</div>
                      {n.message && <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{n.message}</div>}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ah-header-avatar-btn">
                  <PersonAvatar userId={user?.id} name={user?.name || ''} size={30} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><Link to="/profile">My Profile</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="ah-scroll">
          {tab === 'feed' && (
            <div className="agentic-home-root">
              <div className="hub2-welcome-band">
                <p className="hub2-welcome-title">
                  {mood.greeting}, <em className="hub2-welcome-em">{firstName}</em>.
                  {momentum > 0 && <span className="ah-momentum-pill"><Icon name="activity" size={10} />{momentum} done since you opened this</span>}
                </p>
                {(user?.role || (user?.profile as any)?.department) && (
                  <div className="ah-role-line">
                    {user?.role && <span className="ah-role-badge">{roleLabel(user.role)}</span>}
                    {(user?.profile as any)?.department && <span className="ah-dept">{(user?.profile as any).department}</span>}
                  </div>
                )}
              </div>

              <div className="ah-headline" style={{ background: mood.accentSoft }}>
                <div className="ah-headline-icon" style={{ background: mood.accent }}>
                  <Icon name={mood.mood === 'evening' ? 'moon' : 'sun'} size={17} color="#fff" />
                </div>
                <div className="ah-headline-text">
                  {totalOnPlate === 0 ? "You're all caught up — nothing on your plate right now." : <><b>{totalOnPlate}</b> thing{totalOnPlate === 1 ? '' : 's'} on your plate right now.</>}
                </div>
              </div>

              <div className="ah-stat-row">
                <div className="ah-stat-tile"><div className="ah-stat-n">{openTaskCount}</div><div className="ah-stat-l">Open tasks</div></div>
                <div className="ah-stat-tile"><div className="ah-stat-n">{openTicketCount}</div><div className="ah-stat-l">My tickets</div></div>
                {d.shipments !== null && <div className="ah-stat-tile"><div className="ah-stat-n">{shipmentCount}</div><div className="ah-stat-l">My shipments</div></div>}
                {(d.pettyCash || d.leave) && <div className="ah-stat-tile ah-stat-tile--warn"><div className="ah-stat-n">{approvalCount}</div><div className="ah-stat-l">Waiting on you</div></div>}
              </div>

              <div className="ah-body">
                <div className="ah-col-main">
                  <SectionCard title="Your Agent">
                    <div className="ah-agent-list">
                      {suggestions.map((s, i) => (
                        <div key={i} className="ah-agent-row">
                          <Icon name="sparkle" size={14} color="var(--teal)" />
                          <span className="ah-agent-text">{s.text}</span>
                          {s.linkTo && <Link to={s.linkTo} className="ah-agent-link">{s.linkLabel} →</Link>}
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title={`My Tasks (${openTaskCount})`} padded={false}>
                    {openTaskCount === 0 && <div className="ah-empty-row">Nothing open — enjoy the quiet.</div>}
                    {d.tasks.map(t => (
                      <div key={t.id} className="ah-task-row">
                        <button type="button" className="ah-task-check" onClick={() => toggleTaskDone(t.id)} title="Mark done" />
                        <span className="ah-task-title">{t.title}</span>
                        {t.due && <Badge variant={isToday(t.due) ? 'error' : 'gray'}>{fmtDate(t.due)}</Badge>}
                      </div>
                    ))}
                  </SectionCard>

                  {d.shipments !== null && (
                    <SectionCard title={`My Shipments (${shipmentCount})`} padded={false}>
                      {shipmentCount === 0 && <div className="ah-empty-row">No shipments assigned to you.</div>}
                      {d.shipments!.map(s => (
                        <div key={s.id} className="ah-queue-row">
                          <div className="ah-queue-main">
                            <div className="ah-queue-primary">{s.ref_number}</div>
                            <div className="ah-queue-secondary">{s.goods_desc}</div>
                          </div>
                          <Badge variant="info">{(STAGE_LABELS as Record<string, string>)[s.stage] || s.stage}</Badge>
                        </div>
                      ))}
                    </SectionCard>
                  )}

                  {openTicketCount > 0 && (
                    <SectionCard title={`My Tickets (${openTicketCount})`} padded={false}>
                      {d.tickets.map(tk => (
                        <div key={tk.id} className="ah-queue-row">
                          <div className="ah-queue-main">
                            <div className="ah-queue-primary">{tk.subject}</div>
                            <div className="ah-queue-secondary">{tk.ref}</div>
                          </div>
                          <Badge variant={tk.priority === 'urgent' || tk.priority === 'high' ? 'error' : 'gray'}>{tk.status}</Badge>
                        </div>
                      ))}
                    </SectionCard>
                  )}
                </div>

                <div className="ah-col-side">
                  {d.pettyCash && ((d.pettyCash.pendingMyApproval?.length ?? 0) > 0 || (d.pettyCash.myRequests?.length ?? 0) > 0) && (
                    <SectionCard title="Petty Cash" padded={false}>
                      {(d.pettyCash.pendingMyApproval ?? []).map(p => (
                        <div key={`a-${p.id}`} className="ah-queue-row">
                          <div className="ah-queue-main"><div className="ah-queue-primary">{money(p.amount)}</div><div className="ah-queue-secondary">{p.category} · needs your approval</div></div>
                          <Badge variant="warning">Review</Badge>
                        </div>
                      ))}
                      {(d.pettyCash.myRequests ?? []).map(p => (
                        <div key={`m-${p.id}`} className="ah-queue-row">
                          <div className="ah-queue-main"><div className="ah-queue-primary">{money(p.amount)}</div><div className="ah-queue-secondary">{p.category} · your request</div></div>
                          <Badge variant="gray">Pending</Badge>
                        </div>
                      ))}
                    </SectionCard>
                  )}

                  {d.leave && (d.leave.pendingRequests?.length ?? 0) > 0 && (
                    <SectionCard title="Leave Requests" padded={false}>
                      {d.leave.pendingRequests!.map(l => (
                        <div key={l.id} className="ah-queue-row">
                          <div className="ah-queue-main"><div className="ah-queue-primary">{l.type} · {l.days} day{l.days === 1 ? '' : 's'}</div><div className="ah-queue-secondary">{fmtDate(l.from_date)} – {fmtDate(l.to_date)}</div></div>
                          <Badge variant="gray">Pending</Badge>
                        </div>
                      ))}
                    </SectionCard>
                  )}

                  <SectionCard title="Quick Actions">
                    <div className="ah-action-grid">
                      <Link to="/tasks" className="ah-action-btn"><Icon name="check" size={15} color="var(--teal)" />Open Tasks</Link>
                      {d.shipments !== null && <Link to="/clearos" className="ah-action-btn"><Icon name="package" size={15} color="var(--teal)" />Open ClearOS</Link>}
                      {d.pettyCash && <Link to="/petti" className="ah-action-btn"><Icon name="wallet" size={15} color="var(--teal)" />Open Petty Cash</Link>}
                      {d.leave && <Link to="/nexushr" className="ah-action-btn"><Icon name="users" size={15} color="var(--teal)" />Open NexusHR</Link>}
                      {openTicketCount > 0 && <Link to="/bliss" className="ah-action-btn"><Icon name="inbox" size={15} color="var(--teal)" />Open Bliss</Link>}
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          )}

          {tab === 'operations' && <div className="ah-operations-embed"><WorkspaceHome externalSearch="" /></div>}

          {tab === 'reports' && (
            <div className="agentic-home-root">
              <div className="hub2-welcome-band">
                <p className="hub2-welcome-title">The <em className="hub2-welcome-em">numbers</em>.</p>
                <p className="hub2-welcome-sub">What's actually on your plate right now — no projections, just today's counts.</p>
              </div>
              <div className="ah-body" style={{ gridTemplateColumns: '1fr' }}>
                <SectionCard title="Right Now">
                  {[
                    { l: 'Open tasks', n: openTaskCount },
                    { l: 'My tickets', n: openTicketCount },
                    ...(d.shipments !== null ? [{ l: 'My shipments', n: shipmentCount }] : []),
                    ...(d.pettyCash || d.leave ? [{ l: 'Waiting on you', n: approvalCount }] : []),
                  ].map(row => {
                    const max = Math.max(openTaskCount, openTicketCount, shipmentCount, approvalCount, 1);
                    return (
                      <div key={row.l} className="ah-bar-row">
                        <span className="ah-bar-label">{row.l}</span>
                        <div className="ah-bar-track"><div className="ah-bar-fill" style={{ width: `${Math.round(row.n / max * 100)}%` }} /></div>
                        <span className="ah-bar-val">{row.n}</span>
                      </div>
                    );
                  })}
                </SectionCard>
              </div>
            </div>
          )}

          {tab === 'profile' && (
            <div className="agentic-home-root">
              <div className="hub2-welcome-band">
                <p className="hub2-welcome-title"><em className="hub2-welcome-em">{user?.name}</em></p>
                <p className="hub2-welcome-sub">{roleLabel(user?.role)}{(user?.profile as any)?.department ? ` · ${(user?.profile as any).department}` : ''}</p>
              </div>
              <div className="ah-body" style={{ gridTemplateColumns: '1fr' }}>
                <SectionCard title="Snapshot">
                  <div className="ah-profile-meta">
                    <div><b>{enabledApps ? Object.values(enabledApps).filter(Boolean).length : '—'}</b><span>apps in workspace</span></div>
                    <div><b>{openTaskCount}</b><span>open tasks</span></div>
                    <div><b>Hudumika Workspace</b><span>signed in via Ondi</span></div>
                  </div>
                </SectionCard>
                <div className="ah-action-grid" style={{ marginTop: 16 }}>
                  <Link to="/profile" className="ah-action-btn"><Icon name="user" size={15} color="var(--teal)" />Edit your profile</Link>
                </div>
              </div>
            </div>
          )}
        </div>

        <button type="button" className="ah-chat-fab" onClick={() => setChatOpen(o => !o)} title="Ask your workspace agent">
          <Icon name={chatOpen ? 'x' : 'sparkle'} size={19} color="#fff" />
        </button>
        {chatOpen && (
          <div className="ah-chat-panel">
            <div className="ah-chat-head">
              <Icon name="sparkle" size={14} color="var(--teal)" />
              <span>Workspace Agent</span>
            </div>
            <div className="ah-chat-msgs">
              {chatMsgs.length === 0 && <div className="ah-chat-msg ah-chat-msg--agent">Ask me about your tasks, tickets, shipments, leave, or petty cash.</div>}
              {chatMsgs.map((m, i) => <div key={i} className={`ah-chat-msg ah-chat-msg--${m.role}`}>{m.text}</div>)}
            </div>
            <div className="ah-chat-input-row">
              <input
                className="ah-chat-input" value={chatInput} placeholder="Ask about today…"
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
              />
              <button type="button" className="ah-chat-send" onClick={sendChat} aria-label="Send"><Icon name="send" size={14} color="#fff" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgenticHome;
