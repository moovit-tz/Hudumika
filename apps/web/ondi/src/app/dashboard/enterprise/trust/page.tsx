"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface OrgTrust {
  score: number;
  label: string;
  max: number;
}
interface RoleBreakdown {
  name: string;
  members: number;
  score: number;
  trend: "up" | "down";
  delta: number;
}
interface Factor {
  name: string;
  score: number;
  weight: string;
  status: string;
}
interface RiskAlert {
  group: string;
  issue: string;
  severity: string;
}

export default function TrustIntelligencePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgTrust, setOrgTrust] = useState<OrgTrust>({
    score: 0,
    label: "No Data",
    max: 1000,
  });
  const [byRole, setByRole] = useState<RoleBreakdown[]>([]);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setOrgId(id);
    apiFetch(`/organizations/${id}/trust`)
      .then((res) => {
        setOrgTrust(res.orgTrust ?? { score: 0, label: "No Data", max: 1000 });
        setByRole(res.byRole ?? []);
        setFactors(res.factors ?? []);
        setAlerts(res.alerts ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const pct = orgTrust.max ? orgTrust.score / orgTrust.max : 0;
  const dash = pct * circumference;

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
          Org Trust <span className="text-[#4253D1]">Score</span>
        </h1>
        <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
          Computed from your organization's real members, devices, and audit
          trail.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Score Hero */}
        <div className="lg:col-span-4 bg-[#001633] text-white rounded-lg p-8 shadow-sm flex flex-col items-center gap-6">
          <div className="relative">
            <svg width={180} height={180} className="-rotate-90">
              <circle
                cx={90}
                cy={90}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={10}
              />
              <circle
                cx={90}
                cy={90}
                r={radius}
                fill="none"
                stroke="#4253D1"
                strokeWidth={10}
                strokeDasharray={`${dash} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1.2s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-semibold text-white">
                {orgTrust.score}
              </span>
              <span className="text-[10px] font-bold text-[#4253D1]">
                {orgTrust.label}
              </span>
            </div>
          </div>
          <div className="w-full space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span className="">Org Score</span>
              <span className="text-white font-bold">
                {orgTrust.score} / {orgTrust.max}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span className="">Members Scored</span>
              <span className="text-white font-bold">
                {byRole.reduce((sum, r) => sum + r.members, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Role Breakdown */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-xl p-6">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
            <Users size={14} className="text-slate-400" /> By Role
          </h3>
          {byRole.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-slate-400 gap-2">
              <Users size={28} className="text-slate-200" />
              <p className="text-xs font-bold">
                No members with trust data yet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {byRole.map((d, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-28 shrink-0">
                    <p className="text-xs font-bold text-[#001633]">{d.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {d.members} member{d.members === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(d.score / 1000) * 100}%`,
                        background:
                          d.score >= 800
                            ? "#10B981"
                            : d.score >= 700
                              ? "#4253D1"
                              : "#F59E0B",
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[#001633] w-12 text-right shrink-0">
                    {d.score}
                  </span>
                  <div
                    className={`flex items-center gap-0.5 text-[10px] font-bold w-14 shrink-0 ${d.trend === "up" ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {d.trend === "up" ? (
                      <ArrowUpRight size={11} />
                    ) : (
                      <ArrowDownRight size={11} />
                    )}
                    {d.delta >= 0 ? "+" : ""}
                    {d.delta}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trust Factors */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-xl p-6">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
            <TrendingUp size={14} className="text-slate-400" /> Score Factors
          </h3>
          {factors.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-slate-400 gap-2">
              <TrendingUp size={28} className="text-slate-200" />
              <p className="text-xs font-bold">No factor data yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {factors.map((f, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-[#001633] truncate">
                        {f.name}
                      </p>
                      <span className="text-[10px] text-slate-400 ml-2 shrink-0">
                        weight {f.weight}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${f.score}%`,
                          background:
                            f.score >= 90
                              ? "#10B981"
                              : f.score >= 75
                                ? "#4253D1"
                                : "#F59E0B",
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-20">
                    <p className="text-xs font-bold text-[#001633]">
                      {f.score}%
                    </p>
                    <p
                      className={`text-[9px] font-bold ${f.status === "Excellent" ? "text-emerald-500" : f.status === "Good" ? "text-[#4253D1]" : "text-amber-500"}`}
                    >
                      {f.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-xl p-6">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
            <AlertTriangle size={14} className="text-amber-500" /> Risk Alerts
          </h3>
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl"
              >
                <p className="text-xs font-bold text-[#001633]">{a.group}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {a.issue}
                </p>
                <span className="mt-2 inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {a.severity} Risk
                </span>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="py-6 flex flex-col items-center text-slate-400 gap-2">
                <CheckCircle2 size={28} className="text-slate-200" />
                <p className="text-xs font-bold">No risk alerts</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
