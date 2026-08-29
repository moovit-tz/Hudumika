"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/OneUI";
import { apiFetch } from "@/lib/api";
import { useGlobalSearch } from "@/lib/globalSearch";
import {
  Users,
  UserPlus,
  X,
  Check,
  Trash2,
  ShieldCheck,
  Building2,
  ChevronRight,
  Key,
  Clock,
  Loader2,
  ArrowUpRight,
} from "lucide-react";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Member {
  userId: string;
  ondi: string;
  name: string;
  roleName: string;
}
interface Director {
  id: string;
  name: string;
  ondi: string | null;
  verified: boolean;
}
interface OrgRole {
  id: string;
  name: string;
  permissions: string[];
  users: number;
  isSystem: boolean;
}
interface ActivityLog {
  id: string;
  action: string;
  type: string;
  summary: string;
  status: "Success" | "Failed";
  timestamp: string;
}

const PERMISSION_LABELS: Record<string, string> = {
  "org:*": "Full administrative access",
  "org:view": "View organization data",
  "org:manage_team": "Manage team members",
  "org:manage_kyb": "Manage KYB verification",
  "org:manage_directors": "Manage directors",
  "org:manage_security": "Manage security settings",
  "org:manage_compliance": "Manage compliance",
  "org:manage_visitors": "Manage visitor logbook",
  "org:manage_access_reviews": "Manage access reviews",
  "org:manage_access": "Manage access & role assignments",
  "org:manage_integrations": "Manage integrations",
  "org:manage_policies": "Manage policies",
  "org:manage_automation": "Manage automation flows",
  "org:manage_roles": "Manage custom roles",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function WorkforceDirectoryPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  // Roster filters against the topbar's search box (⌘K) now — see
  // useGlobalSearch() — instead of a second local one.
  const search = useGlobalSearch();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteOndi, setInviteOndi] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  // Set once the invite is created — swaps the form for a shareable join
  // link (${origin}/invites/:inviteId). If they're already signed into
  // Ondi it drops them straight on the accept screen; if not, the normal
  // /login?redirect= guard on that page routes them there afterward.
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const [showAddDirector, setShowAddDirector] = useState(false);
  const [directorName, setDirectorName] = useState("");
  const [directorOndi, setDirectorOndi] = useState("");
  const [directorBusy, setDirectorBusy] = useState(false);
  const [directorError, setDirectorError] = useState("");

  // The member currently open in the side panel — fetching their own access
  // & activity trail (GET /organizations/:id/activity?actor=userId) is
  // deferred until a row is actually clicked, not preloaded for everyone.
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberActivity, setMemberActivity] = useState<ActivityLog[]>([]);
  const [memberActivityLoading, setMemberActivityLoading] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setOrgId(id);
    load(id);
  }, []);

  function load(id: string) {
    setLoading(true);
    Promise.all([
      apiFetch("/organizations/mine")
        .then((res) => {
          const org = (res.organizations ?? []).find((o: any) => o.id === id);
          if (org) setOrgName(org.businessName);
        })
        .catch(() => {}),
      apiFetch(`/organizations/${id}/members`)
        .then((res) => setMembers(res.members ?? []))
        .catch(() => setMembers([])),
      apiFetch(`/organizations/${id}/directors`)
        .then((res) => setDirectors(res.directors ?? []))
        .catch(() => setDirectors([])),
      apiFetch(`/organizations/${id}/access/roles`)
        .then((res) => setRoles(res.roles ?? []))
        .catch(() => setRoles([])),
    ]).finally(() => setLoading(false));
  }

  // Selecting a member opens the access panel and fetches their real audit
  // trail scoped to this org — access requests/grants, role changes,
  // sign-ins — instead of a fabricated "last seen" line.
  function openMember(member: Member) {
    setSelectedMember(member);
    if (!orgId) return;
    setMemberActivityLoading(true);
    apiFetch(
      `/organizations/${orgId}/activity?actor=${encodeURIComponent(member.userId)}&limit=8`,
    )
      .then((res) => setMemberActivity(res.logs ?? []))
      .catch(() => setMemberActivity([]))
      .finally(() => setMemberActivityLoading(false));
  }

  function closeMember() {
    setSelectedMember(null);
    setMemberActivity([]);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setInviteBusy(true);
    setInviteError("");
    try {
      const res = await apiFetch(`/organizations/${orgId}/invite`, {
        method: "POST",
        body: JSON.stringify({ ondi: inviteOndi.trim(), roleName: inviteRole }),
      });
      setInviteLink(`${window.location.origin}/invites/${res.inviteId}`);
    } catch (err: any) {
      setInviteError(
        err?.message === "user_not_found"
          ? "No Ondi user found with that ID."
          : err?.message === "already_a_member"
            ? "That user is already a member."
            : err?.message === "invite_already_pending"
              ? "An invite is already pending for that user."
              : err?.message === "cannot_invite_self"
                ? "You can't invite yourself."
                : "Could not send invite. Try again.",
      );
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRoleChange(memberId: string, roleName: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ roleName }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.userId === memberId ? { ...m, roleName } : m)),
      );
      setSelectedMember((prev) =>
        prev && prev.userId === memberId ? { ...prev, roleName } : prev,
      );
    } catch (err: any) {
      if (err?.message === "cannot_remove_last_owner") {
        alert(
          "You can't change the organization's last Owner to another role. Promote someone else to Owner first.",
        );
      }
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/members/${memberId}`, {
        method: "DELETE",
      });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
      setSelectedMember((prev) => (prev?.userId === memberId ? null : prev));
    } catch (err: any) {
      if (err?.message === "cannot_remove_last_owner") {
        alert("You can't remove the organization's last Owner.");
      }
    }
  }

  async function handleAddDirector(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setDirectorBusy(true);
    setDirectorError("");
    try {
      const res = await apiFetch(`/organizations/${orgId}/directors`, {
        method: "POST",
        body: JSON.stringify({
          name: directorName.trim(),
          ondi: directorOndi.trim() || undefined,
        }),
      });
      setDirectors((prev) => [
        ...prev,
        {
          id: res.id,
          name: directorName.trim(),
          ondi: directorOndi.trim() || null,
          verified: false,
        },
      ]);
      setShowAddDirector(false);
      setDirectorName("");
      setDirectorOndi("");
    } catch (err: any) {
      setDirectorError(
        err?.message === "user_not_found"
          ? "No Ondi user found with that ID."
          : "Could not add director. Try again.",
      );
    } finally {
      setDirectorBusy(false);
    }
  }

  async function handleRemoveDirector(directorId: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/directors/${directorId}`, {
        method: "DELETE",
      });
      setDirectors((prev) => prev.filter((d) => d.id !== directorId));
    } catch {}
  }

  const filteredMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          !search ||
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.ondi.toLowerCase().includes(search.toLowerCase()),
      ),
    [members, search],
  );

  const rolesInUse = new Set(members.map((m) => m.roleName)).size;
  const verifiedDirectors = directors.filter((d) => d.verified).length;
  const selectedRole = selectedMember
    ? roles.find((r) => r.name === selectedMember.roleName)
    : null;

  const kpis = [
    { label: "Total Members", value: members.length, icon: Users, color: "text-[#4253D1] bg-[#4253D1]/10" },
    { label: "Roles In Use", value: rolesInUse, icon: Key, color: "text-purple-600 bg-purple-50" },
    { label: "Directors On File", value: directors.length, icon: Building2, color: "text-amber-600 bg-amber-50" },
    { label: "Verified Directors", value: verifiedDirectors, icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  ];

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#4253D1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px]">
        <div className="bg-white border border-slate-100 rounded-xl p-6">
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Building2 size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No organization selected</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              Create or select an organization from the workspace switcher to
              manage your team.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Workforce <span className="text-[#4253D1]">Directory</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            {orgName || "Your organization"} — manage the team and see what
            they've accessed in the system.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white rounded-lg text-xs font-bold hover:bg-[#1A3060] transition-all shrink-0"
        >
          <UserPlus size={14} /> Invite Member
        </button>
      </div>

      {/* ── KPI TILES ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="p-5 bg-white border border-slate-100 rounded-[10px] shadow-sm flex items-start justify-between"
          >
            <div>
              <p className="text-[10px] font-bold text-slate-400">{label}</p>
              <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                {value}
              </h3>
            </div>
            <div
              className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${color}`}
            >
              <Icon size={18} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── TEAM MEMBERS ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-xs font-bold text-[#001633]">
                Team Members
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {filteredMembers.length} of {members.length} member
                {members.length === 1 ? "" : "s"}
                {search && ` · filtered by "${search}"`}
              </p>
            </div>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
              <Users size={28} className="text-slate-200" />
              <p className="text-xs font-bold">
                {members.length === 0 ? "No members yet" : "No matching members"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMembers.map((m) => (
                <div
                  key={m.userId}
                  onClick={() => openMember(m)}
                  className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 border rounded-xl transition-colors cursor-pointer group ${
                    selectedMember?.userId === m.userId
                      ? "bg-[#4253D1]/5 border-[#4253D1]/30"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl border flex items-center justify-center bg-blue-50 text-blue-600 border-blue-100 font-bold text-xs shrink-0">
                      {(m.name || m.ondi).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#001633] truncate">
                        {m.name || "Unnamed member"}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {m.ondi}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      value={m.roleName}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                      className="text-[10px] font-bold text-[#4253D1] bg-blue-50 border border-blue-100 rounded-full px-3 py-1 focus:outline-none focus:border-[#4253D1]"
                    >
                      {roles.length > 0 ? (
                        roles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Owner">Owner</option>
                          <option value="Admin">Admin</option>
                          <option value="Member">Member</option>
                        </>
                      )}
                    </select>
                    <button
                      onClick={() => handleRemoveMember(m.userId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight
                      size={12}
                      className="text-slate-300 group-hover:text-[#4253D1] transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ACCESS & ACTIVITY PANEL ──────────────────────────────────────── */}
        <div className="lg:col-span-4">
          {!selectedMember ? (
            <div className="bg-white border border-slate-100 rounded-xl p-6 h-full flex flex-col items-center justify-center text-center gap-2 min-h-[280px]">
              <div className="w-10 h-10 rounded-xl bg-[#4253D1]/10 flex items-center justify-center text-[#4253D1]">
                <Key size={18} />
              </div>
              <p className="text-xs font-bold text-[#001633]">
                Select a team member
              </p>
              <p className="text-[10px] text-slate-400 max-w-[220px]">
                Click any row to see their role, permissions, and what
                they've accessed in the system.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-5 sticky top-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl border flex items-center justify-center bg-blue-50 text-blue-600 border-blue-100 font-bold text-sm shrink-0">
                    {(selectedMember.name || selectedMember.ondi)
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#001633] truncate">
                      {selectedMember.name || "Unnamed member"}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {selectedMember.ondi}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeMember}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Role & permissions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                    <Key size={11} /> Role & Permissions
                  </p>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#4253D1]">
                    {selectedMember.roleName}
                  </span>
                </div>
                {selectedRole ? (
                  <div className="space-y-1.5">
                    {selectedRole.permissions.map((p) => (
                      <div
                        key={p}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg"
                      >
                        <Check size={11} className="text-emerald-500 shrink-0" />
                        <span className="text-[10px] font-bold text-[#001633]">
                          {PERMISSION_LABELS[p] || p}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 px-1">
                    No permission details found for this role.
                  </p>
                )}
              </div>

              {/* Recent access & activity — real org audit trail, filtered
                  to this member (see GET /organizations/:id/activity?actor=). */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Clock size={11} /> Recent Access &amp; Activity
                </p>
                {memberActivityLoading ? (
                  <div className="py-8 flex items-center justify-center">
                    <Loader2
                      size={16}
                      className="animate-spin text-[#4253D1]"
                    />
                  </div>
                ) : memberActivity.length === 0 ? (
                  <p className="text-[10px] text-slate-400 py-4 text-center">
                    No recorded activity for this member yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {memberActivity.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start gap-2.5 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            a.status === "Failed"
                              ? "bg-red-500"
                              : "bg-[#4253D1]"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold text-[#001633] leading-snug">
                            {a.summary}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {a.type} · {timeAgo(a.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Link
                  href="/dashboard/enterprise/activity"
                  className="mt-2 w-full py-2 border border-slate-100 hover:border-[#4253D1]/30 hover:bg-[#4253D1]/5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-[#4253D1] transition-all flex items-center justify-center gap-1.5"
                >
                  View Full Audit Log <ArrowUpRight size={11} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── DIRECTORS ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-xl p-6">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-xs font-bold text-[#001633]">Directors</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {directors.length} on file
            </p>
          </div>
          <button
            onClick={() => setShowAddDirector(true)}
            className="text-[10px] font-bold text-[#4253D1] hover:text-[#001633] transition-colors flex items-center gap-1"
          >
            <UserPlus size={12} /> Add Director
          </button>
        </div>
        {directors.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <ShieldCheck size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No directors on file</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {directors.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#001633] truncate">
                    {d.name}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {d.ondi ? `Linked · ${d.ondi}` : "No linked Ondi account"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      d.verified
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {d.verified ? <Check size={10} /> : null}{" "}
                    {d.verified ? "Verified" : "Unverified"}
                  </span>
                  <button
                    onClick={() => handleRemoveDirector(d.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg w-full max-w-md relative">
            <button
              onClick={() => {
                setShowInvite(false);
                setInviteOndi("");
                setInviteError("");
                setInviteLink(null);
                setInviteLinkCopied(false);
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>

            {inviteLink ? (
              <>
                <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center mb-6">
                  <Check size={22} className="text-emerald-600" />
                </div>
                <h3 className="font-bold text-[#001633] text-lg mb-2">
                  Invite created
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  Share this link with them to join. Opening it takes them
                  straight to the accept screen on Ondi — signing in first if
                  they aren't already.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      setInviteLinkCopied(true);
                      setTimeout(() => setInviteLinkCopied(false), 2000);
                    }}
                    className="px-4 bg-[#001633] hover:bg-[#4253D1] text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                  >
                    {inviteLinkCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowInvite(false);
                    setInviteOndi("");
                    setInviteLink(null);
                    setInviteLinkCopied(false);
                  }}
                  className="w-full mt-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-md transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
                  <UserPlus size={22} className="text-[#4253D1]" />
                </div>
                <h3 className="font-bold text-[#001633] text-lg mb-2">
                  Invite Team Member
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  Enter their Ondi ID — you'll get a join link to send them
                  that takes them straight to the accept screen.
                </p>
                <form onSubmit={handleInvite} className="space-y-4">
                  <input
                    type="text"
                    value={inviteOndi}
                    onChange={(e) => setInviteOndi(e.target.value)}
                    placeholder="Recipient's Ondi ID"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
                  >
                    {roles.length > 0 ? (
                      roles
                        .filter((r) => r.name !== "Owner")
                        .map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))
                    ) : (
                      <>
                        <option value="Member">Member</option>
                        <option value="Admin">Admin</option>
                      </>
                    )}
                  </select>
                  {inviteError && (
                    <p className="text-xs text-red-500 font-medium">
                      {inviteError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={inviteBusy || !inviteOndi.trim()}
                    className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-md hover:bg-[#4253D1] transition-colors disabled:opacity-50"
                  >
                    {inviteBusy ? "..." : "Create Invite Link"}
                  </button>
                </form>
              </>
            )}
          </GlassPanel>
        </div>
      )}

      {showAddDirector && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg w-full max-w-md relative">
            <button
              onClick={() => setShowAddDirector(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <ShieldCheck size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              Add Director
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Their Ondi ID is optional — leave it blank for a record-only
              director with no linked account.
            </p>
            <form onSubmit={handleAddDirector} className="space-y-4">
              <input
                type="text"
                value={directorName}
                onChange={(e) => setDirectorName(e.target.value)}
                placeholder="Full name"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              />
              <input
                type="text"
                value={directorOndi}
                onChange={(e) => setDirectorOndi(e.target.value)}
                placeholder="Ondi ID (optional)"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              />
              {directorError && (
                <p className="text-xs text-red-500 font-medium">
                  {directorError}
                </p>
              )}
              <button
                type="submit"
                disabled={directorBusy || !directorName.trim()}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-md hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {directorBusy ? "..." : "Add Director"}
              </button>
            </form>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
