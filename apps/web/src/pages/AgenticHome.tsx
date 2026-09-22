import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { getMood } from '../lib/greeting.js';
import { resolveLandingStyle } from '../lib/landingStyle.js';
import { useEnabledApps } from '../hooks/useEnabledApps.js';
import { WorkspaceHome } from './WorkspaceHome.js';
import { STAGE_LABELS } from '@hudumika/types';
import { AgenticExecutionStage, PRESET_WORKFLOWS, AgentWorkflow } from '../components/agentic/AgenticExecutionStage.js';
import { LauncherAppSvg } from '../components/LauncherApps.js';
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

/** What GET/POST /v1/agent/* returns for a pending approval — see
 *  apps/api/src/routes/agent.routes.ts's LoopResultSummary. */
interface PendingApproval {
  id: string;
  toolId: string;
  toolLabel: string;
  requestedEffect: string;
  approverRole: string;
  requiredApprovals: number;
}

/** Client-side mirror of agent.routes.ts's canDecideApproval() — for UI
 *  gating only (whether to show Approve/Reject at all); the server enforces
 *  the real check independently on every decision it receives. */
function canDecideApproval(userRole: string | undefined, approverRole: string): boolean {
  if (!userRole) return false;
  return approverRole === 'MANAGER'
    ? ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(userRole)
    : userRole === approverRole;
}

type Tab = 'agent' | 'feed' | 'operations' | 'reports';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'agent', label: 'Agent Flow', icon: 'sparkle' },
  { key: 'feed', label: 'Feed', icon: 'activity' },
  { key: 'operations', label: 'Operations', icon: 'grid' },
  { key: 'reports', label: 'Reports', icon: 'barChart' },
];

export const AgenticHome: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const enabledApps = useEnabledApps();
  const [data, setData] = useState<CockpitData | null>(null);
  const [tab, setTab] = useState<Tab>('agent');
  const [activeWorkflow, setActiveWorkflow] = useState<AgentWorkflow>(PRESET_WORKFLOWS[0]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ role: 'agent' | 'user'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  // Real /v1/agent/runs state — a run persists across the whole chat session
  // once started; a follow-up message continues the same run via
  // POST /runs/:id/messages rather than starting a new one each time.
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
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

  // ── Agent approvals waiting on this user (real GET /v1/agent/approvals,
  // milestone 3) — the only place a run's approval gate is visible to
  // anyone other than whoever happened to be chatting when it opened, e.g.
  // a manager approving something an employee's agent run asked for. ──
  const [agentApprovals, setAgentApprovals] = useState<any[]>([]);
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null);
  const loadAgentApprovals = useCallback(() => {
    apiFetch('/v1/agent/approvals').then(res => setAgentApprovals(Array.isArray(res) ? res : [])).catch(() => {});
  }, []);
  useEffect(() => { loadAgentApprovals(); const t = setInterval(loadAgentApprovals, 45000); return () => clearInterval(t); }, [loadAgentApprovals]);

  async function decideSidebarApproval(approvalId: string, decision: 'approved' | 'rejected') {
    if (decidingApprovalId) return;
    setDecidingApprovalId(approvalId);
    try {
      await apiFetch(`/v1/agent/approvals/${approvalId}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
    } catch {
      // Real state wins on the next reload if this failed — same
      // "trust the reload" convention toggleTaskDone above already uses.
    } finally {
      loadAgentApprovals();
      setDecidingApprovalId(null);
    }
  }

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

  /** Renders the outcome of one round of the real agent loop (a fresh run,
   *  a follow-up message, or a just-resumed approved run) — whichever of
   *  finalText/errorMessage/pendingApproval the backend sent back. Never
   *  invents a reply: if the backend returns nothing usable, that itself is
   *  shown as a plain status line rather than a fabricated response. */
  function applyRunSummary(status: string, summary: { finalText?: string; errorMessage?: string; pendingApproval?: PendingApproval }) {
    if (summary.pendingApproval) {
      setPendingApproval(summary.pendingApproval);
      return;
    }
    setPendingApproval(null);
    if (status === 'completed') {
      setChatMsgs(prev => [...prev, { role: 'agent', text: summary.finalText || 'Done.' }]);
    } else if (status === 'failed') {
      setChatMsgs(prev => [...prev, { role: 'agent', text: `Something went wrong: ${summary.errorMessage || 'Unknown error'}` }]);
    } else if (status === 'cancelled' || status === 'rejected') {
      setChatMsgs(prev => [...prev, { role: 'agent', text: 'This step was not carried out.' }]);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy || pendingApproval) return;
    setChatMsgs(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatBusy(true);
    try {
      const res = runId
        ? await apiFetch(`/v1/agent/runs/${runId}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
        : await apiFetch('/v1/agent/runs', { method: 'POST', body: JSON.stringify({ goal: text }) });
      setRunId(res.id);
      applyRunSummary(res.status, res);
    } catch (err: any) {
      setChatMsgs(prev => [...prev, { role: 'agent', text: err?.message || "I couldn't reach the workspace agent — try again in a moment." }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function decideApproval(decision: 'approved' | 'rejected') {
    if (!pendingApproval || decisionBusy) return;
    setDecisionBusy(true);
    try {
      const res = await apiFetch(`/v1/agent/approvals/${pendingApproval.id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      if (res.status === 'pending') {
        // Quorum not yet met — this approver's decision is recorded, but a
        // dual-control tool (agent-registry.ts's critical/always tier)
        // still needs another, distinct approver before anything runs.
        setPendingApproval(null);
        const more = res.approvalsRequired - res.approvalsReceived;
        setChatMsgs(prev => [...prev, { role: 'agent', text: `Recorded. Waiting on ${more} more approver${more === 1 ? '' : 's'} before this continues.` }]);
      } else if (res.status === 'rejected') {
        setPendingApproval(null);
        applyRunSummary('cancelled', {});
      } else {
        applyRunSummary(res.runStatus, res);
      }
    } catch (err: any) {
      setChatMsgs(prev => [...prev, { role: 'agent', text: err?.message || "Couldn't record that decision — try again." }]);
    } finally {
      setDecisionBusy(false);
    }
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

  // ── Active app brand details based on current tab and active workflow ──
  const activeAppBrand = useMemo(() => {
    if (tab === 'agent') {
      if (activeWorkflow.id === 'route6-trip') {
        return {
          appId: 'route6',
          name: 'Route6',
          color: '#f59e0b',
          assignee: activeWorkflow.assigneeName,
          contextRef: activeWorkflow.contextRef,
          sub: 'Fleet Ops',
        };
      }
      if (activeWorkflow.id === 'clearos-customs') {
        return {
          appId: 'clearos',
          name: 'ClearOS',
          color: '#ea580c',
          assignee: activeWorkflow.assigneeName,
          contextRef: activeWorkflow.contextRef,
          sub: 'Customs Clearance',
        };
      }
      if (activeWorkflow.id === 'finops-petti') {
        return {
          appId: 'petti',
          name: 'FinOps',
          color: '#16a34a',
          assignee: activeWorkflow.assigneeName,
          contextRef: activeWorkflow.contextRef,
          sub: 'Petty Cash',
        };
      }
      return {
        appId: 'ai',
        name: activeWorkflow.brandName || 'Hudumika AI',
        color: '#6d28d9',
        assignee: activeWorkflow.assigneeName || 'Autonomous Agent',
        contextRef: activeWorkflow.contextRef || 'AGENT-RUN',
        sub: 'AI Workflow',
      };
    }

    if (tab === 'feed') {
      return {
        appId: 'workspace',
        name: 'Hudumika',
        color: 'var(--teal)',
        assignee: 'Live Feed',
        contextRef: null,
        sub: 'Cockpit',
      };
    }

    if (tab === 'operations') {
      return {
        appId: 'workspace',
        name: 'Operations',
        color: '#0f766e',
        assignee: 'Workspace Hub',
        contextRef: null,
        sub: 'Applications',
      };
    }

    if (tab === 'reports') {
      return {
        appId: 'hudubi',
        name: 'Reports',
        color: '#18181b',
        assignee: 'Daily Metrics',
        contextRef: null,
        sub: 'Analytics',
      };
    }

    return {
      appId: 'workspace',
      name: 'Hudumika',
      color: 'var(--teal)',
      assignee: '',
      contextRef: null,
      sub: '',
    };
  }, [tab, activeWorkflow]);

  return (
    <div className="app-shell">
      <div className="app-main">
        <div className="ah-header">
          <div className="ah-header-left">
            <button
              type="button"
              className="ah-header-mark"
              onClick={switchToAdvanced}
              disabled={switching}
              title="Switch to Advanced landing"
            >
              <Icon name="layoutDashboard" size={15} color="#fff" />
            </button>

            {/* Dynamic App Brand Switching */}
            <div className="ah-header-brand-lockup" title={`${activeAppBrand.name} · ${activeAppBrand.sub}`}>
              <div className="ah-app-icon-wrapper">
                <LauncherAppSvg
                  id={activeAppBrand.appId}
                  color={activeAppBrand.color}
                  size={28}
                />
              </div>
              <div className="ah-brand-meta">
                <span className="ah-brand-title">{activeAppBrand.name}</span>
                {activeAppBrand.assignee && (
                  <>
                    <span className="ah-brand-divider">/</span>
                    <span className="ah-assignee-label">{activeAppBrand.assignee}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="ah-header-center">
            <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} variant="segmented" className="ah-header-tabs">
              <TabsList className="ah-tabs-list">
                {TABS.map(t => {
                  // Real count of agent approvals waiting on this user (the
                  // same GET /v1/agent/approvals the sidebar card reads) —
                  // shown on the Agent Flow tab so it's visible from any tab.
                  const count = t.key === 'agent' ? agentApprovals.length : 0;
                  return (
                    <TabsTrigger
                      key={t.key} value={t.key} className="ah-tab-trigger"
                      title={count > 0 ? `${t.label} — ${count} waiting on you` : t.label}
                      aria-label={count > 0 ? `${t.label}, ${count} waiting on you` : t.label}
                    >
                      <Icon name={t.icon} size={14} strokeWidth={tab === t.key ? 2.3 : 1.8} />
                      <span className="ah-tab-label">{t.label}</span>
                      {count > 0 && <span className="ah-tab-count">{count > 9 ? '9+' : count}</span>}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            <div className="ah-header-search">
              <Icon name="search" size={14} color="var(--ink3)" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search workspace, tasks, shipments…" />
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
          </div>

          <div className="ah-header-right">
            {/* Context Ref Pill */}
            {activeAppBrand.contextRef && (
              <div className="ah-header-context-ref">
                <span className="ah-context-ref-pill">{activeAppBrand.contextRef}</span>
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ah-header-icon-btn" title="Notifications">
                  <Icon name="bell" size={18} color="var(--ink)" />
                  {unreadCount > 0 && <span className="ah-header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="ah-notif-menu">
                <div className="ah-notif-head">
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <span className="ah-notif-count-pill">{unreadCount} new</span>
                  )}
                </div>
                <DropdownMenuSeparator />
                {notifs.length === 0 && <div className="ah-empty-row">No notifications.</div>}
                {notifs.slice(0, 6).map(n => (
                  <DropdownMenuItem key={n.id} onSelect={() => n.link && navigate(n.link)}>
                    <div>
                      <div style={{ fontWeight: n.read ? 400 : 700, color: 'var(--ink)' }}>{n.title}</div>
                      {n.message && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{n.message}</div>}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ah-header-avatar-btn" title={user?.name || 'Account menu'}>
                  <PersonAvatar userId={user?.id} name={user?.name || ''} size={32} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="ah-profile-dropdown-menu">
                <div className="ah-profile-dropdown-user">
                  <PersonAvatar userId={user?.id} name={user?.name || ''} size={36} />
                  <div className="ah-profile-dropdown-meta">
                    <div className="ah-profile-dropdown-name">{user?.name || 'User'}</div>
                    <div className="ah-profile-dropdown-role">{roleLabel(user?.role)}</div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="ah-profile-menu-link">
                    <Icon name="user" size={14} color="var(--ink2)" />
                    <span>My Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/tasks" className="ah-profile-menu-link">
                    <Icon name="check" size={14} color="var(--ink2)" />
                    <span>My Tasks ({openTaskCount})</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()} className="ah-profile-menu-logout">
                  <Icon name="logOut" size={14} color="var(--red)" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="ah-scroll">
          {tab === 'agent' && (
            <div className="ah-agent-flow-view">
              <AgenticExecutionStage
                hideHeader={true}
                onWorkflowChange={setActiveWorkflow}
              />
            </div>
          )}

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

              <div className="ah-agent-feature-banner" onClick={() => setTab('agent')}>
                <div className="ah-agent-feature-left">
                  <div className="r6-logo-badge" style={{ fontSize: 13, padding: '3px 7px' }}>R6</div>
                  <div>
                    <div className="ah-agent-feature-title">Route6 Autonomous Agent Flow</div>
                    <div className="ah-agent-feature-sub">TRP-1042 · Live stepped execution for trip closing, inspection, invoice generation & customer dispatch</div>
                  </div>
                </div>
                <div className="r6-action-btn primary" style={{ pointerEvents: 'none' }}>
                  <span>Open Live Stage</span>
                  <Icon name="arrowRight" size={13} />
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
                  {agentApprovals.length > 0 && (
                    <SectionCard title={`Agent Approvals (${agentApprovals.length})`} padded={false}>
                      {agentApprovals.map(a => (
                        <div key={a.id} className="ah-queue-row ah-queue-row--approval">
                          <div className="ah-queue-main">
                            <div className="ah-queue-primary">{a.requested_effect}</div>
                            <div className="ah-queue-secondary">
                              from “{a.run_goal}”{a.initiator_name ? ` · ${a.initiator_name}` : ''}
                              {a.required_approvals > 1 ? ` · ${a.decisionsSoFar}/${a.required_approvals} approved` : ''}
                            </div>
                          </div>
                          <div className="ah-approval-row-actions">
                            <Button size="xs" variant="outline" disabled={decidingApprovalId === a.id} onClick={() => decideSidebarApproval(a.id, 'rejected')}>Reject</Button>
                            <Button size="xs" disabled={decidingApprovalId === a.id} onClick={() => decideSidebarApproval(a.id, 'approved')}>Approve</Button>
                          </div>
                        </div>
                      ))}
                    </SectionCard>
                  )}

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
              {chatMsgs.length === 0 && <div className="ah-chat-msg ah-chat-msg--agent">Ask me to look something up or do something — I can act across your workspace, not just answer questions.</div>}
              {chatMsgs.map((m, i) => <div key={i} className={`ah-chat-msg ah-chat-msg--${m.role}`}>{m.text}</div>)}
              {chatBusy && <div className="ah-chat-msg ah-chat-msg--agent ah-chat-msg--pending">Working on it…</div>}
              {pendingApproval && (
                <div className="ah-approval-card">
                  <div className="ah-approval-head">
                    <Icon name="shield" size={13} color="var(--gold)" />
                    <span>Needs approval</span>
                  </div>
                  <div className="ah-approval-effect">{pendingApproval.requestedEffect}</div>
                  {pendingApproval.requiredApprovals > 1 && (
                    <div className="ah-approval-hint">Needs {pendingApproval.requiredApprovals} distinct approvers.</div>
                  )}
                  {canDecideApproval(user?.role, pendingApproval.approverRole) ? (
                    <div className="ah-approval-actions">
                      <Button size="xs" variant="outline" disabled={decisionBusy} onClick={() => decideApproval('rejected')}>Reject</Button>
                      <Button size="xs" disabled={decisionBusy} onClick={() => decideApproval('approved')}>Approve</Button>
                    </div>
                  ) : (
                    <div className="ah-approval-hint">Waiting for a {roleLabel(pendingApproval.approverRole)} to decide.</div>
                  )}
                </div>
              )}
            </div>
            <div className="ah-chat-input-row">
              <input
                className="ah-chat-input" value={chatInput}
                placeholder={pendingApproval ? 'Waiting on an approval decision…' : 'Ask or ask me to do something…'}
                disabled={!!pendingApproval || chatBusy}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
              />
              <button type="button" className="ah-chat-send" onClick={sendChat} disabled={!!pendingApproval || chatBusy} aria-label="Send"><Icon name="send" size={14} color="#fff" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgenticHome;
