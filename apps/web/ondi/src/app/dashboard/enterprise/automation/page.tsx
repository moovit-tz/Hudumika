"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  UserPlus,
  UserMinus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Flow {
  id: string;
  name: string;
  trigger: "ONBOARDING" | "OFFBOARDING" | "ROLE_CHANGE";
  steps: string[];
  status: "ACTIVE" | "PAUSED";
  runs: number;
  lastRunAt: string | null;
}
interface Run {
  id: string;
  flow: string;
  subject: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  startedAt: string;
}
interface Member {
  userId: string;
  ondi: string;
  name: string;
  roleName: string;
}

const TRIGGER_ICON: Record<string, any> = {
  ONBOARDING: UserPlus,
  OFFBOARDING: UserMinus,
  ROLE_CHANGE: Zap,
};
const TRIGGER_COLOR: Record<string, string> = {
  ONBOARDING: "#10B981",
  OFFBOARDING: "#EF4444",
  ROLE_CHANGE: "#F59E0B",
};
const TRIGGER_LABEL: Record<string, string> = {
  ONBOARDING: "New hire invited",
  OFFBOARDING: "Member offboarded",
  ROLE_CHANGE: "Role updated",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const secs = Math.round(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function AutomationPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [stats, setStats] = useState({
    activeFlows: 0,
    pausedFlows: 0,
    runsThisMonth: 0,
    avgDurationMs: 0,
  });
  const [runs, setRuns] = useState<Run[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runModal, setRunModal] = useState<Flow | null>(null);
  const [runOndi, setRunOndi] = useState("");
  const [runMemberId, setRunMemberId] = useState("");
  const [runRole, setRunRole] = useState("Member");
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState("");

  function load(id: string) {
    setLoading(true);
    Promise.all([
      apiFetch(`/organizations/${id}/automation/flows`)
        .then((res) => {
          setFlows(res.flows ?? []);
          setStats(
            res.stats ?? {
              activeFlows: 0,
              pausedFlows: 0,
              runsThisMonth: 0,
              avgDurationMs: 0,
            },
          );
        })
        .catch(() => {}),
      apiFetch(`/organizations/${id}/automation/runs`)
        .then((res) => setRuns(res.runs ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${id}/members`)
        .then((res) => setMembers(res.members ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
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

  async function toggleFlow(flow: Flow) {
    if (!orgId) return;
    const status = flow.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await apiFetch(`/organizations/${orgId}/automation/flows/${flow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setFlows((prev) =>
        prev.map((f) => (f.id === flow.id ? { ...f, status } : f)),
      );
    } catch {}
  }

  function openRun(flow: Flow) {
    setRunModal(flow);
    setRunOndi("");
    setRunMemberId("");
    setRunRole("Member");
    setRunError("");
  }

  async function submitRun(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !runModal) return;
    setRunBusy(true);
    setRunError("");
    try {
      const body =
        runModal.trigger === "ONBOARDING"
          ? { ondi: runOndi.trim(), roleName: runRole }
          : runModal.trigger === "OFFBOARDING"
            ? { memberId: runMemberId }
            : { memberId: runMemberId, roleName: runRole };

      await apiFetch(
        `/organizations/${orgId}/automation/flows/${runModal.id}/run`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setRunModal(null);
      load(orgId);
    } catch (err: any) {
      setRunError(err?.message?.replace(/_/g, " ") || "Run failed.");
    } finally {
      setRunBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#4253D1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px] text-center text-sm text-slate-500">
        No organization selected.
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Automated <span className="text-[#4253D1]">Workflows</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Run real onboarding, offboarding, and role-change actions.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Active Flows",
            value: String(stats.activeFlows),
            sub: `${stats.pausedFlows} paused`,
          },
          {
            label: "Runs This Month",
            value: String(stats.runsThisMonth),
            sub: "Across all flows",
          },
          {
            label: "Avg Duration",
            value: formatDuration(stats.avgDurationMs || null),
            sub: "Per completed run",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="p-6 bg-white border border-slate-100 rounded-[10px] shadow-sm"
          >
            <p className="text-[10px] font-bold text-slate-400">
              {stat.label}
            </p>
            <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
              {stat.value}
            </h3>
            <p className="text-[10px] text-slate-400 mt-2">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Flows */}
      <div className="space-y-3">
        {flows.map((flow) => {
          const Icon = TRIGGER_ICON[flow.trigger];
          const color = TRIGGER_COLOR[flow.trigger];
          const isExpanded = expanded === flow.id;
          return (
            <div
              key={flow.id}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors overflow-hidden"
            >
              <div className="w-full flex items-center gap-4 p-4 text-left">
                <button
                  onClick={() => setExpanded(isExpanded ? null : flow.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}15`, color }}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-[#001633]">
                        {flow.name}
                      </p>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          flow.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {flow.status === "ACTIVE" ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Trigger: {TRIGGER_LABEL[flow.trigger]}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-[#001633]">
                      {flow.runs} run{flow.runs === 1 ? "" : "s"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Last: {timeAgo(flow.lastRunAt)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => openRun(flow)}
                    disabled={flow.status !== "ACTIVE"}
                    className="px-3 py-1.5 bg-[#4253D1] text-white rounded-lg text-[10px] font-bold hover:bg-[#1A3060] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Run
                  </button>
                  <button
                    onClick={() => toggleFlow(flow)}
                    className="p-1.5 text-slate-400 hover:text-[#001633] rounded-lg transition-colors"
                    title={
                      flow.status === "ACTIVE" ? "Pause flow" : "Activate flow"
                    }
                  >
                    {flow.status === "ACTIVE" ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : flow.id)}
                    className="p-1.5"
                  >
                    <ArrowRight
                      size={14}
                      className={`text-slate-300 group-hover:text-[#4253D1] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 my-4">
                    Steps
                  </p>
                  <div className="flex flex-col gap-2">
                    {flow.steps.map((step, j) => (
                      <div key={j} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#4253D1]/10 text-[#4253D1] text-[9px] font-bold flex items-center justify-center shrink-0">
                          {j + 1}
                        </div>
                        <p className="text-xs text-slate-600">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Runs */}
      <div className="bg-white border border-slate-100 rounded-xl p-6">
        <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
          <Clock size={14} className="text-slate-400" /> Recent Runs
        </h3>
        {runs.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Clock size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No flows have been run yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                {run.status === "COMPLETED" ? (
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#001633]">{run.flow}</p>
                  <p className="text-[10px] text-slate-400">
                    {run.subject} · {formatDuration(run.durationMs)}
                    {run.error ? ` · ${run.error.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    run.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-red-50 text-red-500"
                  }`}
                >
                  {run.status}
                </span>
                <p className="text-[10px] text-slate-400 shrink-0">
                  {timeAgo(run.startedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {runModal && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-lg p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setRunModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Zap size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              Run {runModal.name}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              This performs a real action — it is not a simulation.
            </p>
            <form onSubmit={submitRun} className="space-y-4">
              {runModal.trigger === "ONBOARDING" && (
                <>
                  <input
                    type="text"
                    value={runOndi}
                    onChange={(e) => setRunOndi(e.target.value)}
                    placeholder="New member's Ondi ID"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
                  />
                  <select
                    value={runRole}
                    onChange={(e) => setRunRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
                  >
                    <option value="Member">Member</option>
                    <option value="Admin">Admin</option>
                  </select>
                </>
              )}
              {(runModal.trigger === "OFFBOARDING" ||
                runModal.trigger === "ROLE_CHANGE") && (
                <select
                  value={runMemberId}
                  onChange={(e) => setRunMemberId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="">Select a member...</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name || m.ondi} ({m.roleName})
                    </option>
                  ))}
                </select>
              )}
              {runModal.trigger === "ROLE_CHANGE" && (
                <select
                  value={runRole}
                  onChange={(e) => setRunRole(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="Member">Member</option>
                  <option value="Admin">Admin</option>
                  <option value="Owner">Owner</option>
                </select>
              )}
              {runError && (
                <p className="text-xs text-red-500 font-medium">{runError}</p>
              )}
              <button
                type="submit"
                disabled={runBusy}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-md hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {runBusy ? "Running..." : "Run Now"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
