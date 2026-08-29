"use client";

import { useEffect, useState } from "react";
import {
  Key,
  Shield,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  X,
  ClipboardCheck,
  UserX,
  UserCheck,
  Users,
  Repeat,
  Inbox,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Sk } from "@/components/Skeleton";
import { useGlobalSearch } from "@/lib/globalSearch";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface RoleSummary {
  id: string;
  name: string;
  permissions: string[];
  users: number;
  isSystem: boolean;
}
interface AccessRequest {
  id: string;
  user: string;
  role: string | null;
  resource: string;
  urgency: string;
  status: string;
  requested: string;
}
interface GrantLog {
  id: string;
  action: string;
  summary: string;
  actor: string;
  timestamp: string;
}
interface ReviewCampaign {
  id: string;
  name: string;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  itemCount: number;
  pendingCount: number;
  approvedCount: number;
  revokedCount: number;
}
interface ReviewItem {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  decision: "PENDING" | "APPROVED" | "REVOKED";
  decidedBy: string | null;
  decidedAt: string | null;
  notes: string | null;
}
interface ReviewCampaignDetail {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  items: ReviewItem[];
}
interface ReviewSchedule {
  id: string;
  name: string;
  intervalDays: number;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
}
interface OrgGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  roles: { id: string; name: string }[];
}
interface OrgMember {
  userId: string;
  ondi: string;
  name: string;
  roleName: string;
}

const ROLE_COLOR: Record<string, string> = {
  Owner: "#EF4444",
  Admin: "#F59E0B",
  Member: "#4253D1",
};

const ALL_PERMISSIONS = [
  "org:view",
  "org:manage_team",
  "org:manage_kyb",
  "org:manage_directors",
  "org:manage_security",
  "org:manage_compliance",
  "org:manage_visitors",
  "org:manage_access_reviews",
  "org:manage_access",
  "org:manage_integrations",
  "org:manage_policies",
  "org:manage_automation",
  "org:manage_roles",
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AccessManagementPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Filters against the topbar's search box (⌘K) — see useGlobalSearch().
  const search = useGlobalSearch();
  // Roles / Groups / Access Reviews / Requests each used to be stacked
  // vertically on one page (roles grid, groups list, campaigns +
  // recurring-schedule panel, pending requests, recent grants — 5 full
  // sections plus 4 modals). Tabs keep each concern on its own screen.
  const [activeTab, setActiveTab] = useState<
    "roles" | "groups" | "reviews" | "requests"
  >("roles");
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [pending, setPending] = useState<AccessRequest[]>([]);
  const [grants, setGrants] = useState<GrantLog[]>([]);
  const [showRequest, setShowRequest] = useState(false);
  const [resource, setResource] = useState("");
  const [urgency, setUrgency] = useState("LOW");
  const [busy, setBusy] = useState(false);

  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] =
    useState<ReviewCampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decidingItem, setDecidingItem] = useState<string | null>(null);

  // ── Recurring access-review schedule (real, GET/POST /access-reviews/schedule) ──
  const [schedules, setSchedules] = useState<ReviewSchedule[]>([]);
  const [scheduleInterval, setScheduleInterval] = useState(90);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  // ── Custom roles (real, POST/PATCH/DELETE /access/roles) ──
  const [showNewRole, setShowNewRole] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState("");

  // ── Groups (real, /access/groups CRUD) ──
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  function load(id: string) {
    setLoading(true);
    Promise.all([
      apiFetch(`/organizations/${id}/access/roles`)
        .then((res) => setRoles(res.roles ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${id}/access/requests?status=PENDING`)
        .then((res) => setPending(res.requests ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${id}/activity?limit=50`)
        .then((res) => {
          const grantLogs = (res.logs ?? []).filter(
            (l: any) =>
              l.action === "ACCESS_GRANTED" || l.action === "ACCESS_DENIED",
          );
          setGrants(grantLogs.slice(0, 6));
        })
        .catch(() => {}),
      loadCampaigns(id),
      loadSchedules(id),
      loadGroups(id),
      apiFetch(`/organizations/${id}/members`)
        .then((res) => setMembers(res.members ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  function loadCampaigns(id: string) {
    return apiFetch(`/organizations/${id}/access-reviews`)
      .then((res) => setCampaigns(res.campaigns ?? []))
      .catch(() => {});
  }

  function loadSchedules(id: string) {
    return apiFetch(`/organizations/${id}/access-reviews/schedule`)
      .then((res) => setSchedules(res.schedules ?? []))
      .catch(() => {});
  }

  function loadGroups(id: string) {
    return apiFetch(`/organizations/${id}/access/groups`)
      .then((res) => setGroups(res.groups ?? []))
      .catch(() => {});
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setScheduleBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/access-reviews/schedule`, {
        method: "POST",
        body: JSON.stringify({ intervalDays: scheduleInterval }),
      });
      loadSchedules(orgId);
    } catch {
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleSchedule(scheduleId: string, isEnabled: boolean) {
    if (!orgId) return;
    try {
      await apiFetch(
        `/organizations/${orgId}/access-reviews/schedule/${scheduleId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isEnabled }),
        },
      );
      loadSchedules(orgId);
    } catch {}
  }

  async function removeSchedule(scheduleId: string) {
    if (!orgId) return;
    try {
      await apiFetch(
        `/organizations/${orgId}/access-reviews/schedule/${scheduleId}`,
        { method: "DELETE" },
      );
      loadSchedules(orgId);
    } catch {}
  }

  function togglePerm(p: string) {
    setRolePerms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !roleName.trim() || rolePerms.length === 0) return;
    setRoleBusy(true);
    setRoleError("");
    try {
      await apiFetch(`/organizations/${orgId}/access/roles`, {
        method: "POST",
        body: JSON.stringify({ name: roleName.trim(), permissions: rolePerms }),
      });
      setShowNewRole(false);
      setRoleName("");
      setRolePerms([]);
      load(orgId);
    } catch (err: any) {
      setRoleError(
        err.message === "role_name_already_used"
          ? "A role with that name already exists."
          : "Could not create role.",
      );
    } finally {
      setRoleBusy(false);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !groupName.trim()) return;
    setGroupBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/access/groups`, {
        method: "POST",
        body: JSON.stringify({ name: groupName.trim() }),
      });
      setShowNewGroup(false);
      setGroupName("");
      loadGroups(orgId);
    } catch {
    } finally {
      setGroupBusy(false);
    }
  }

  async function attachGroupRole(groupId: string, roleId: string) {
    if (!orgId || !roleId) return;
    try {
      await apiFetch(
        `/organizations/${orgId}/access/groups/${groupId}/roles/${roleId}`,
        { method: "POST" },
      );
      loadGroups(orgId);
    } catch {}
  }

  async function addGroupMember(groupId: string, memberId: string) {
    if (!orgId || !memberId) return;
    try {
      await apiFetch(
        `/organizations/${orgId}/access/groups/${groupId}/members/${memberId}`,
        { method: "POST" },
      );
      loadGroups(orgId);
    } catch {}
  }

  async function removeGroup(groupId: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/access/groups/${groupId}`, {
        method: "DELETE",
      });
      loadGroups(orgId);
    } catch {}
  }

  async function handleStartCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCampaignBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/access-reviews`, {
        method: "POST",
        body: JSON.stringify({ name: campaignName.trim() || undefined }),
      });
      setShowNewCampaign(false);
      setCampaignName("");
      loadCampaigns(orgId);
    } catch {
    } finally {
      setCampaignBusy(false);
    }
  }

  async function openCampaign(id: string) {
    if (expandedCampaign === id) {
      setExpandedCampaign(null);
      setCampaignDetail(null);
      return;
    }
    if (!orgId) return;
    setExpandedCampaign(id);
    setDetailLoading(true);
    try {
      const res = await apiFetch(
        `/organizations/${orgId}/access-reviews/${id}`,
      );
      setCampaignDetail(res);
    } catch {
      setCampaignDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function decide(itemId: string, decision: "APPROVED" | "REVOKED") {
    if (!orgId || !expandedCampaign) return;
    setDecidingItem(itemId);
    try {
      await apiFetch(
        `/organizations/${orgId}/access-reviews/${expandedCampaign}/items/${itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ decision }),
        },
      );
      const res = await apiFetch(
        `/organizations/${orgId}/access-reviews/${expandedCampaign}`,
      );
      setCampaignDetail(res);
      loadCampaigns(orgId);
    } catch {
    } finally {
      setDecidingItem(null);
    }
  }

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setOrgId(id);
    load(id);
  }, []);

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !resource.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/access/requests`, {
        method: "POST",
        body: JSON.stringify({ resource: resource.trim(), urgency }),
      });
      setShowRequest(false);
      setResource("");
      load(orgId);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function resolve(requestId: string, status: "APPROVED" | "DENIED") {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/access/requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setPending((prev) => prev.filter((r) => r.id !== requestId));
      load(orgId);
    } catch {}
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <Sk className="h-7 w-44 rounded-full" />
            <Sk className="h-8 w-72" />
            <Sk className="h-3 w-56" />
          </div>
          <Sk className="h-10 w-40 rounded-lg" />
        </div>
        <div className="space-y-4">
          <Sk className="h-4 w-20" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-lg p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <Sk className="w-9 h-9 rounded-[8px]" />
                  <Sk className="h-3 w-12 rounded" />
                </div>
                <Sk className="h-5 w-8" />
                <Sk className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-3">
          <Sk className="h-4 w-32" />
          {[1, 2, 3].map((i) => (
            <Sk key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px]">
        <div className="bg-white border border-slate-100 rounded-xl p-12 flex flex-col items-center text-center gap-2 text-slate-400">
          <Inbox size={28} className="text-slate-200" />
          <p className="text-xs font-bold text-[#001633]">
            No organization selected
          </p>
          <p className="text-[10px] text-slate-400 max-w-xs">
            Select an organization from the workspace switcher to manage
            roles and permissions.
          </p>
        </div>
      </div>
    );
  }

  const filteredPending = pending.filter(
    (r) => !search || r.user.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Roles & <span className="text-[#4253D1]">Permissions</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Manage who has access to what across your organization.
          </p>
        </div>
        <button
          onClick={() => setShowRequest(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white rounded-lg text-xs font-bold hover:bg-[#1A3060] transition-all"
        >
          <Plus size={14} /> Request Access
        </button>
      </div>

      {/* ── TABS ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 bg-slate-100/50 p-1.5 rounded-lg border border-slate-200/40 w-fit">
        {(
          [
            { id: "roles", label: "Roles", icon: Shield, count: roles.length },
            { id: "groups", label: "Groups", icon: Users, count: groups.length },
            {
              id: "reviews",
              label: "Access Reviews",
              icon: ClipboardCheck,
              count: campaigns.length,
            },
            {
              id: "requests",
              label: "Requests & Activity",
              icon: AlertTriangle,
              count: pending.length,
            },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-[8px] text-xs font-bold transition-all duration-200 ${
                isActive
                  ? "bg-white text-[#001633] shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-[#001633] hover:bg-white/40"
              }`}
            >
              <Icon
                size={14}
                className={isActive ? "text-[#4253D1]" : "text-slate-500"}
              />
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-[#4253D1]/10 text-[#4253D1]"
                      : "bg-slate-200/70 text-slate-500"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── ROLES TAB ──────────────────────────────────────────────────────── */}
      {activeTab === "roles" && (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
            <Shield size={16} className="text-[#4253D1]" /> Roles
          </h3>
          <button
            onClick={() => setShowNewRole(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#001633] text-white rounded-lg text-[11px] font-bold hover:bg-[#4253D1] transition-all"
          >
            <Plus size={13} /> Create Custom Role
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.length === 0 ? (
            <div className="col-span-full py-12 flex flex-col items-center text-slate-400 gap-2">
              <Shield size={28} className="text-slate-200" />
              <p className="text-xs font-bold text-[#001633]">
                No roles assigned yet
              </p>
            </div>
          ) : (
            roles.map((role) => (
              <div
                key={role.id}
                className="p-6 bg-white border border-slate-100 rounded-[10px] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-[8px] flex items-center justify-center"
                    style={{
                      background: `${ROLE_COLOR[role.name] || "#4253D1"}15`,
                      color: ROLE_COLOR[role.name] || "#4253D1",
                    }}
                  >
                    <Shield size={18} />
                  </div>
                  {role.isSystem ? (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      System
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#4253D1]">
                      Custom
                    </span>
                  )}
                </div>
                <p className="text-3xl font-bold text-[#001633] tracking-tight">
                  {role.users}
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  {role.name}
                  {role.users === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 2).map((p, j) => (
                    <span
                      key={j}
                      className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-slate-400"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      )}

      {/* ── GROUPS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "groups" && (
      <div className="bg-white border border-slate-100 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
              <Users size={16} className="text-slate-400" /> Groups
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Members of a group inherit every role attached to it.
            </p>
          </div>
          <button
            onClick={() => setShowNewGroup(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#4253D1] text-white rounded-lg text-[11px] font-bold hover:bg-[#1A3060] transition-all"
          >
            <Plus size={13} /> New Group
          </button>
        </div>
        {groups.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Users size={28} className="text-slate-200" />
            <p className="text-xs font-bold text-[#001633]">No groups yet</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              Create one to assign roles to multiple members at once.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-[#4253D1]/10 text-[#4253D1] flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#001633]">
                    {g.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {g.memberCount} member{g.memberCount === 1 ? "" : "s"} ·{" "}
                    {g.roles.length === 0
                      ? "no roles attached"
                      : g.roles.map((r) => r.name).join(", ")}
                  </p>
                </div>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    addGroupMember(g.id, e.target.value);
                    e.target.value = "";
                  }}
                  className="text-[10px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg bg-white shrink-0"
                >
                  <option value="" disabled>
                    + Add member
                  </option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    attachGroupRole(g.id, e.target.value);
                    e.target.value = "";
                  }}
                  className="text-[10px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg bg-white shrink-0"
                >
                  <option value="" disabled>
                    + Attach role
                  </option>
                  {roles
                    .filter((r) => !g.roles.some((gr) => gr.id === r.id))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => removeGroup(g.id)}
                  className="p-1.5 border border-rose-100 text-rose-500 bg-rose-50/20 hover:bg-rose-50 hover:border-rose-200 transition-all rounded-lg cursor-pointer shrink-0"
                  title="Delete group"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ── ACCESS REVIEWS TAB ─────────────────────────────────────────────── */}
      {activeTab === "reviews" && (
      <div className="bg-white border border-slate-100 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
            <ClipboardCheck size={16} className="text-slate-400" /> Access
            Review Campaigns
          </h3>
          <button
            onClick={() => setShowNewCampaign(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#4253D1] text-white rounded-lg text-[11px] font-bold hover:bg-[#1A3060] transition-all"
          >
            <Plus size={13} /> Start Review
          </button>
        </div>

        {/* Recurring schedule — auto-starts a new campaign every intervalDays */}
        <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <h4 className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 mb-3">
            <Repeat size={12} /> Recurring Schedule
          </h4>
          {schedules.length === 0 ? (
            <form
              onSubmit={handleCreateSchedule}
              className="flex items-center gap-2"
            >
              <select
                value={scheduleInterval}
                onChange={(e) => setScheduleInterval(Number(e.target.value))}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value={30}>Every 30 days</option>
                <option value={60}>Every 60 days</option>
                <option value={90}>Every 90 days</option>
                <option value={180}>Every 180 days</option>
              </select>
              <button
                type="submit"
                disabled={scheduleBusy}
                className="px-4 py-2 bg-[#001633] text-white rounded-lg text-[10px] font-bold hover:bg-[#4253D1] transition-all disabled:opacity-50"
              >
                {scheduleBusy ? "..." : "Enable Auto-Review"}
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3"
                >
                  <p className="text-xs font-bold text-[#001633]">
                    {s.name} — next run{" "}
                    {new Date(s.nextRunAt).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleSchedule(s.id, !s.isEnabled)}
                      className={`w-8 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${s.isEnabled ? "bg-[#4253D1] flex justify-end" : "bg-slate-200 flex justify-start"}`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </button>
                    <button
                      onClick={() => removeSchedule(s.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {campaigns.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <ClipboardCheck size={28} className="text-slate-200" />
            <p className="text-xs font-bold text-[#001633]">
              No access review campaigns yet
            </p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              Start one to snapshot and re-certify every current role grant.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="border border-slate-100 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => openCampaign(c.id)}
                  className="w-full flex items-center gap-4 p-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left cursor-pointer group"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.status === "COMPLETED" ? "bg-emerald-50 text-emerald-500" : "bg-amber-50 text-amber-500"}`}
                  >
                    <ClipboardCheck size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#001633]">
                      {c.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.itemCount} grant{c.itemCount === 1 ? "" : "s"} ·
                      started {timeAgo(c.startedAt)}
                      {c.completedAt
                        ? ` · completed ${timeAgo(c.completedAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.pendingCount > 0 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                        {c.pendingCount} pending
                      </span>
                    )}
                    {c.approvedCount > 0 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                        {c.approvedCount} approved
                      </span>
                    )}
                    {c.revokedCount > 0 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                        {c.revokedCount} revoked
                      </span>
                    )}
                  </div>
                  <ChevronRight
                    size={12}
                    className={`text-slate-300 group-hover:text-[#4253D1] shrink-0 transition-transform ${expandedCampaign === c.id ? "rotate-90" : ""}`}
                  />
                </button>
                {expandedCampaign === c.id && (
                  <div className="p-4 border-t border-slate-100">
                    {detailLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <Sk key={i} className="h-12 w-full rounded-xl" />
                        ))}
                      </div>
                    ) : !campaignDetail ? (
                      <p className="text-[10px] text-slate-400 text-center py-4">
                        Failed to load campaign.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {campaignDetail.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl"
                          >
                            <div className="w-8 h-8 rounded-xl bg-[#4253D1]/10 text-[#4253D1] font-bold text-[10px] flex items-center justify-center shrink-0">
                              {item.userName
                                .split(/[\s-]/)
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[#001633] truncate">
                                {item.userName}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {item.roleName}
                                {item.decidedAt
                                  ? ` · decided ${timeAgo(item.decidedAt)}`
                                  : ""}
                              </p>
                            </div>
                            {item.decision === "PENDING" ? (
                              <div className="flex gap-2 shrink-0">
                                <button
                                  disabled={decidingItem === item.id}
                                  onClick={() => decide(item.id, "APPROVED")}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                                >
                                  <UserCheck size={12} /> Approve
                                </button>
                                <button
                                  disabled={decidingItem === item.id}
                                  onClick={() => decide(item.id, "REVOKED")}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                                >
                                  <UserX size={12} /> Revoke
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.decision === "APPROVED" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}
                              >
                                {item.decision}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ── REQUESTS & ACTIVITY TAB ────────────────────────────────────────── */}
      {activeTab === "requests" && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pending Requests */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Pending
              Requests
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                {pending.length}
              </span>
            </h3>
            {search && (
              <span className="text-[10px] font-bold text-slate-400">
                Filtered: &ldquo;{search}&rdquo;
              </span>
            )}
          </div>
          <div className="space-y-3">
            {filteredPending.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
                <AlertTriangle size={28} className="text-slate-200" />
                <p className="text-xs font-bold text-[#001633]">
                  No pending requests
                </p>
              </div>
            ) : (
              filteredPending.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#4253D1]/10 text-[#4253D1] font-bold text-xs flex items-center justify-center shrink-0">
                    {req.user
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#001633]">
                      {req.user}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {req.resource}
                      {req.role ? ` · ${req.role}` : ""} · {req.requested}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      req.urgency === "HIGH"
                        ? "bg-red-50 text-red-500"
                        : req.urgency === "MEDIUM"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {req.urgency}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolve(req.id, "APPROVED")}
                      className="px-3 py-1.5 bg-[#4253D1] text-white rounded-lg text-[10px] font-bold hover:bg-[#1A3060] transition-all"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => resolve(req.id, "DENIED")}
                      className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-all"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-xl p-6">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
            <Clock size={16} className="text-slate-400" /> Recent Grants
          </h3>
          <div className="space-y-4">
            {grants.length === 0 ? (
              <p className="text-[10px] text-slate-400 py-6 text-center">
                No access changes yet.
              </p>
            ) : (
              grants.map((g) => {
                const Icon =
                  g.action === "ACCESS_GRANTED" ? CheckCircle2 : XCircle;
                const color =
                  g.action === "ACCESS_GRANTED"
                    ? "text-emerald-500"
                    : "text-red-500";
                return (
                  <div key={g.id} className="flex gap-3">
                    <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-xs font-bold text-[#001633]">
                        {g.actor}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {g.summary}
                      </p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        {timeAgo(g.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      )}

      {showRequest && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-xl p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setShowRequest(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Key size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              Request Access
            </h3>
            <p className="text-[10px] text-slate-400 mb-6">
              An Owner or Admin will need to approve this before it takes
              effect.
            </p>
            <form onSubmit={handleRequestAccess} className="space-y-4">
              <input
                type="text"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                placeholder="Resource (e.g. AWS Production)"
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-slate-100 bg-slate-50 text-sm focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
              />
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-100 bg-slate-50 text-sm"
              >
                <option value="LOW">Low urgency</option>
                <option value="MEDIUM">Medium urgency</option>
                <option value="HIGH">High urgency</option>
              </select>
              <button
                type="submit"
                disabled={busy || !resource.trim()}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {busy ? "..." : "Submit Request"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showNewCampaign && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-xl p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setShowNewCampaign(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <ClipboardCheck size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              Start Access Review
            </h3>
            <p className="text-[10px] text-slate-400 mb-6">
              Snapshots every current role grant in the organization for
              re-certification. Revoking a grant immediately removes their
              membership and deprovisions them from connected apps.
            </p>
            <form onSubmit={handleStartCampaign} className="space-y-4">
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Campaign name (optional)"
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-slate-100 bg-slate-50 text-sm focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
              />
              <button
                type="submit"
                disabled={campaignBusy}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {campaignBusy ? "..." : "Start Review"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showNewRole && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-xl p-8 w-full max-w-lg relative shadow-xl">
            <button
              onClick={() => setShowNewRole(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Shield size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              Create Custom Role
            </h3>
            <p className="text-[10px] text-slate-400 mb-6">
              Only for this organization — pick exactly the permissions this
              role should grant.
            </p>
            {roleError && (
              <p className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
                {roleError}
              </p>
            )}
            <form onSubmit={handleCreateRole} className="space-y-4">
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Role name (e.g. Auditor)"
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-slate-100 bg-slate-50 text-sm focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
              />
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                {ALL_PERMISSIONS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 text-xs px-3 py-2 border border-slate-100 rounded-lg cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={rolePerms.includes(p)}
                      onChange={() => togglePerm(p)}
                      className="accent-[#4253D1]"
                    />
                    {p.replace("org:", "").replace(/_/g, " ")}
                  </label>
                ))}
              </div>
              <button
                type="submit"
                disabled={
                  roleBusy || !roleName.trim() || rolePerms.length === 0
                }
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {roleBusy ? "..." : "Create Role"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showNewGroup && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-xl p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setShowNewGroup(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Users size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">New Group</h3>
            <p className="text-[10px] text-slate-400 mb-6">
              Add members and attach roles after creating it.
            </p>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name (e.g. Compliance Team)"
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-slate-100 bg-slate-50 text-sm focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
              />
              <button
                type="submit"
                disabled={groupBusy || !groupName.trim()}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {groupBusy ? "..." : "Create Group"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
