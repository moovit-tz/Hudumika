"use client";

import { useState, useEffect } from "react";
import { GlassPanel, OneColors, HolographicRing } from "@/components/OneUI";
import {
  ShieldCheck,
  TrendingUp,
  Clock,
  Eye,
  Lock,
  ArrowUpRight,
  Check,
  Plus,
  Activity,
  Award,
  Globe,
  CheckCircle2,
  LockKeyhole,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Sk } from "@/components/Skeleton";

interface AccessLog {
  company: string;
  purpose: string;
  date: string;
  status: string;
}

export default function TrustCenterPage() {
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [trustTier, setTrustTier] = useState("LOW");
  const [loading, setLoading] = useState(true);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    apiFetch("/trust/score")
      .then((data) => {
        setTotalScore(data.score ?? data.trustScore ?? 0);
        setTrustTier(data.trustTier ?? "LOW");
        const bd = data.breakdown ?? data.signals ?? [];
        if (Array.isArray(bd)) {
          setBreakdown(
            bd.map((item: any) => ({
              label: item.label ?? item.name ?? "Factor",
              score: item.score ?? item.value ?? 0,
              max: item.max ?? 100,
              color: "#4253D1",
              desc: item.description ?? item.desc ?? "",
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    apiFetch("/oauth/consents")
      .then((data) => {
        const consents = data.consents ?? [];
        setAccessLogs(
          consents.map((c: any) => ({
            company: c.clientName ?? "App",
            purpose: (c.scopes ?? []).join(", ") || "Identity access",
            date: c.consentedAt
              ? new Date(c.consentedAt).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "",
            status: "Approved",
          })),
        );
      })
      .catch(() => {})
      .finally(() => setAccessLoading(false));
  }, []);

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-10">
      {/* ── TOPBAR HEADER ─────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3">
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Trust <span className="text-[#4253D1]">Center</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Transparent explainable digital reputation. Monitor your instant
            global trust score, view validation signals, and manage authorized
            data access logs.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button className="px-5 py-3 bg-[#4253D1] hover:bg-[#1A4C93] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-[#4253D1]/10">
            <Activity size={16} strokeWidth={2.5} />
            Re-Evaluate Score
          </button>
        </div>
      </div>

      {/* ── METRICS GRID ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT PANEL: Circular Holographic Index & Signal sliders */}
        <div className="lg:col-span-5 space-y-6">
          {/* OripioFin white glass style panel with deep dark blue glow accent */}
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg shadow-sm flex flex-col items-center relative overflow-hidden">
            <div className="flex items-center justify-between w-full mb-6 pb-4 border-b border-slate-50">
              <p className="text-[10px] font-bold text-slate-400">
                Real-time Trust Index
              </p>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-[#4253D1]/10 text-[#4253D1] border border-[#4253D1]/20 rounded-full">
                Verified
              </span>
            </div>

            {loading ? (
              <Sk className="w-[140px] h-[140px] rounded-full" />
            ) : (
              <HolographicRing
                score={totalScore}
                max={1000}
                label="Trust Index"
                color="#4253D1"
              />
            )}

            <div className="w-full text-center mt-6 space-y-2">
              <p className="text-xs text-slate-500 font-bold">
                {trustTier} Trust Tier
              </p>
            </div>
          </GlassPanel>

          {/* Trust Breakdown Slider Cards */}
          <GlassPanel className="p-6 bg-white border-slate-100 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-50">
              <h3 className="text-xs font-bold text-[#001633]">
                Reputation Signals
              </h3>
              <span className="text-[10px] font-bold text-[#4253D1] flex items-center gap-1">
                {breakdown.length} Recorded
              </span>
            </div>
            <div className="space-y-5">
              {loading && breakdown.length === 0 && (
                <div className="space-y-5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-end">
                        <div className="space-y-1.5">
                          <Sk className="h-3.5 w-32" />
                          <Sk className="h-2.5 w-40" />
                        </div>
                        <Sk className="h-3.5 w-8" />
                      </div>
                      <Sk className="h-2 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              )}
              {!loading && breakdown.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  No reputation signals recorded yet.
                </p>
              )}
              {breakdown.map((item, i) => {
                const pct = (item.score / item.max) * 100;
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-xs font-bold text-[#001633] tracking-tight">
                          {item.label}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[#4253D1]">
                        {item.score}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-50 border border-slate-100/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#4253D1]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </div>

        {/* RIGHT PANEL: Authorized Access logs */}
        <div className="lg:col-span-7 space-y-6">
          {/* Shared Trust Access & Logs */}
          <GlassPanel className="p-6 bg-white border-slate-100 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-50">
              <h3 className="text-xs font-bold text-[#001633]">
                Active Partner Access
              </h3>
            </div>
            {accessLoading ? (
              <div className="divide-y divide-slate-50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="space-y-1.5">
                      <Sk className="h-3.5 w-28" />
                      <Sk className="h-2.5 w-40" />
                    </div>
                    <Sk className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : accessLogs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No partner apps have been granted access yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {accessLogs.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#001633] tracking-tight">
                        {log.company}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {log.purpose} ·{" "}
                        <span className="font-semibold">{log.date}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100">
                      <CheckCircle2 size={12} className="text-[#4253D1]" />
                      {log.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
