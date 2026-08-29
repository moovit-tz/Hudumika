"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Key,
  Zap,
  ShieldCheck,
  FileText,
  Grid,
  ArrowRight,
  ChevronRight,
  Building2,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Sk } from "@/components/Skeleton";
import { useGlobalSearch } from "@/lib/globalSearch";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Member {
  userId: string;
  ondi: string;
  name: string;
  roleName: string;
}
interface BrelaRecord {
  legal_name: string;
  cert_number: string;
  reg_status: string;
  reg_status_name: string;
  incorporation_date: string | null;
  reg_date: string | null;
  address: string | null;
}

function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <Sk className="h-6 w-40" />
          <Sk className="h-3 w-56" />
        </div>
        <Sk className="h-9 w-64 rounded-lg hidden md:block" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-6 bg-white border border-slate-100 rounded-[10px] shadow-sm">
                <div className="flex justify-between items-start">
                  <Sk className="w-10 h-10 rounded-[8px]" />
                  <Sk className="h-2 w-16" />
                </div>
                <div className="mt-8 space-y-2">
                  <Sk className="h-2 w-20" />
                  <Sk className="h-7 w-16" />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <Sk className="h-3 w-32" />
              <Sk className="h-2 w-14" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Sk className="w-8 h-8 rounded-full" />
                  <div className="space-y-1.5">
                    <Sk className="h-3 w-28" />
                    <Sk className="h-2 w-20" />
                  </div>
                </div>
                <Sk className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-xl p-6 space-y-4">
          <Sk className="h-3 w-24" />
          <Sk className="h-20 w-full rounded-xl" />
          <Sk className="h-16 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function EnterpriseDashboard() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [trustScore, setTrustScore] = useState<{
    score: number;
    label: string;
  } | null>(null);
  const [activeFlows, setActiveFlows] = useState(0);
  const [pausedFlows, setPausedFlows] = useState(0);
  const [complianceRate, setComplianceRate] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  // Team-member list filters against the topbar's search box (⌘K), not a
  // second local one — see useGlobalSearch().
  const search = useGlobalSearch();
  const [brela, setBrela] = useState<BrelaRecord | null>(null);
  const [brelaLoading, setBrelaLoading] = useState(false);
  const [brelaFailed, setBrelaFailed] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setOrgId(id);

    Promise.all([
      apiFetch("/organizations/mine")
        .then((res) => {
          const org = (res.organizations ?? []).find((o: any) => o.id === id);
          if (org) setOrgName(org.businessName);
        })
        .catch(() => {}),
      apiFetch(`/organizations/${id}/members`)
        .then((res) => setMembers(res.members ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${id}/trust`)
        .then((res) => setTrustScore(res.orgTrust))
        .catch(() => {}),
      apiFetch(`/organizations/${id}/automation/flows`)
        .then((res) => {
          setActiveFlows(res.stats?.activeFlows ?? 0);
          setPausedFlows(res.stats?.pausedFlows ?? 0);
        })
        .catch(() => {}),
      apiFetch(`/organizations/${id}/compliance/frameworks`)
        .then((res) => setComplianceRate(res.complianceRate ?? 0))
        .catch(() => {}),
      apiFetch(`/organizations/${id}/access/requests?status=PENDING`)
        .then((res) => setPendingRequests((res.requests ?? []).length))
        .catch(() => {}),
    ]).finally(() => setLoading(false));

    // BRELA is a live government-registry lookup (can take a few seconds and
    // occasionally 502s) — kept out of the Promise.all above so it never
    // holds up the rest of the dashboard; it fills in the header on its own
    // once it resolves.
    setBrelaLoading(true);
    apiFetch(`/organizations/${id}/brela`)
      .then((res) => setBrela(res.record ?? null))
      .catch(() => setBrelaFailed(true))
      .finally(() => setBrelaLoading(false));
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!orgId) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px]">
        <div className="bg-white border border-slate-100 rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center text-[#4253D1]">
            <Building2 size={20} />
          </div>
          <p className="text-xs font-bold text-[#001633]">
            No organization selected
          </p>
          <p className="text-[10px] text-slate-400 max-w-xs">
            Create or select one from the workspace switcher to see your
            enterprise dashboard.
          </p>
        </div>
      </div>
    );
  }

  const filteredMembers = members.filter(
    (m) =>
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.ondi.toLowerCase().includes(search.toLowerCase()),
  );

  const kpis = [
    {
      label: "Total Workforce",
      value: String(members.length),
      sub: `${members.length} member${members.length === 1 ? "" : "s"}`,
      icon: Users,
      color: "text-[#4253D1] bg-[#4253D1]/10",
    },
    {
      label: "Active Automations",
      value: String(activeFlows),
      sub: `${pausedFlows} paused`,
      icon: Grid,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Org Trust Score",
      value: trustScore ? String(trustScore.score) : "—",
      sub: trustScore?.label ?? "No data",
      icon: ShieldCheck,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Compliance Rate",
      value: `${complianceRate}%`,
      sub: `${pendingRequests} pending`,
      icon: FileText,
      color: "text-purple-600 bg-purple-50",
    },
  ];

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
          Organization <span className="text-[#4253D1]">Overview</span>
        </h1>
        <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
          {brela?.legal_name || orgName || "Your organization"} — a real-time
          snapshot of your workforce, automation, trust, and compliance.
        </p>
      </div>

      {/* ── MAIN CONTENT GRID — stats + workforce on the left, the company's
          verified BRELA profile on the right ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* KPI Tiles */}
          <div className="grid grid-cols-2 gap-6">
            {kpis.map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={i}
                  className="p-6 bg-white border border-slate-100 rounded-[10px] flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">
                        {kpi.label}
                      </p>
                      <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                        {kpi.value}
                      </h3>
                    </div>
                    <div
                      className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${kpi.color}`}
                    >
                      <Icon size={20} />
                    </div>
                  </div>
                  <div className="mt-8 flex justify-between items-end">
                    <span className="text-xs text-slate-400 font-bold">
                      {kpi.sub}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Team Members */}
          <div className="bg-white border border-slate-100 rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
                  <Users size={14} className="text-slate-400" />
                  Team Members
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {members.length} total
                </p>
              </div>
              <Link
                href="/dashboard/enterprise/directory"
                className="text-[10px] font-bold text-[#4253D1] hover:text-[#001633] transition-colors"
              >
                View All
              </Link>
            </div>

            {filteredMembers.length === 0 ? (
              <p className="text-[10px] text-slate-400 py-6 text-center">
                No members yet.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredMembers.slice(0, 5).map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl border flex items-center justify-center bg-blue-50 text-blue-600 border-blue-100 font-bold text-xs">
                        {(member.name || member.ondi).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#001633]">
                          {member.name || "Unnamed member"}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {member.ondi}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#4253D1]">
                        {member.roleName}
                      </span>
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

          {/* Secondary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/dashboard/enterprise/automation"
              className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-[8px] bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <Zap size={18} />
              </div>
              <h3 className="text-xs font-bold text-[#001633] mb-1">
                Automation
              </h3>
              <p className="text-[10px] text-slate-400">
                Manage onboarding and offboarding flows.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-[#4253D1]">
                <span>
                  {activeFlows} Active Flow{activeFlows === 1 ? "" : "s"}
                </span>
                <ArrowRight size={12} />
              </div>
            </Link>
            <Link
              href="/dashboard/enterprise/access"
              className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-[8px] bg-blue-50 text-[#4253D1] flex items-center justify-center mb-4">
                <Key size={18} />
              </div>
              <h3 className="text-xs font-bold text-[#001633] mb-1">
                Access Control
              </h3>
              <p className="text-[10px] text-slate-400">
                Manage permissions and roles.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-[#4253D1]">
                <span>
                  {pendingRequests} Pending Request
                  {pendingRequests === 1 ? "" : "s"}
                </span>
                <ArrowRight size={12} />
              </div>
            </Link>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Company Profile — real BRELA registry data, not the free-text
              businessName typed in at KYB time. Fetched independently (see
              the effect above) so a slow/flaky government API never blocks
              the rest of the dashboard. */}
          <div className="bg-white border border-slate-100 rounded-xl p-6">
            <h3 className="text-xs font-bold text-[#001633] mb-4 flex items-center gap-2">
              <Building2 size={14} className="text-slate-400" />
              Company Profile
            </h3>

            {brelaLoading ? (
              <div className="py-8 flex flex-col items-center gap-2 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
                <p className="text-[10px] font-bold">Checking BRELA…</p>
              </div>
            ) : brela ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center h-20 px-4 rounded-xl border border-slate-100 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/brela.svg"
                    alt="BRELA"
                    className="h-14 w-auto"
                  />
                </div>

                <div>
                  <p className="text-xs font-bold text-[#001633] leading-snug">
                    {brela.legal_name}
                  </p>
                  <span
                    className={`inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                      /active|registered/i.test(brela.reg_status_name)
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {brela.reg_status_name}
                  </span>
                </div>

                <div className="pt-4 border-t border-slate-50 space-y-2.5">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400">
                      Certificate No.
                    </p>
                    <p className="text-[11px] font-bold text-[#001633] mt-0.5">
                      {brela.cert_number}
                    </p>
                  </div>
                  {brela.incorporation_date && (
                    <div>
                      <p className="text-[9px] font-bold text-slate-400">
                        Incorporated
                      </p>
                      <p className="text-[11px] font-bold text-[#001633] mt-0.5">
                        {new Date(
                          brela.incorporation_date,
                        ).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                  {brela.address && (
                    <div>
                      <p className="text-[9px] font-bold text-slate-400">
                        Registered Address
                      </p>
                      <p
                        className="text-[11px] font-bold text-[#001633] mt-0.5 leading-relaxed"
                        title={brela.address}
                      >
                        {brela.address}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 flex flex-col items-center gap-2 text-slate-400 text-center">
                <Building2 size={24} className="text-slate-200" />
                <p className="text-[10px] font-bold">
                  Couldn't reach BRELA right now
                </p>
                <p className="text-[9px] text-slate-400 max-w-[200px]">
                  Showing {orgName || "the name on file"} until the registry
                  is reachable again.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
