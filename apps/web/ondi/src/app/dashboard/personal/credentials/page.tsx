"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { GlassPanel } from "@/components/OneUI";
import { buildDocuments } from "@/lib/identity";
import { useGlobalSearch, useClearGlobalSearch } from "@/lib/globalSearch";
import {
  Award,
  ShieldCheck,
  Eye,
  Lock,
  CheckCircle2,
  Clock,
  QrCode,
} from "lucide-react";
import { Sk } from "@/components/Skeleton";

interface RealCredential {
  id: string;
  name: string;
  type: string;
  status: "Active" | "Pending";
  issuer: string;
  dateIssued?: string;
  grade: string;
  accentColor: string;
}

export default function CredentialsPage() {
  // Filters against the topbar's search box (⌘K) — see useGlobalSearch().
  const searchQuery = useGlobalSearch();
  const clearSearch = useClearGlobalSearch();
  const [filterType, setFilterType] = useState("all");
  const [credentials, setCredentials] = useState<RealCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      apiFetch("/auth/me"),
      apiFetch("/auth/federated/identities"),
    ])
      .then(([meResult, identitiesResult]) => {
        const entries: RealCredential[] = [];

        if (meResult.status === "fulfilled") {
          const me = meResult.value;

          for (const doc of buildDocuments(me)) {
            if (doc.status === "missing") continue;
            entries.push({
              id: doc.documentType,
              name: doc.name,
              type: "Government ID",
              status: doc.status === "verified" ? "Active" : "Pending",
              issuer: doc.source ?? "Government Registry",
              dateIssued: doc.date,
              grade: doc.status === "verified" ? "Verified" : "Under Review",
              accentColor: doc.status === "verified" ? "#0F9755" : "#D97706",
            });
          }

          for (const cred of me?.credentials ?? []) {
            if (cred.type === "BIOMETRIC" && cred.verified) {
              entries.push({
                id: "biometric",
                name: "Biometric Liveness Credential",
                type: "Security Credential",
                status: "Active",
                issuer: "Ondi",
                dateIssued: cred.lastUsedAt,
                grade: "Verified",
                accentColor: "#0F9755",
              });
            }
            if (cred.type === "MFA_APP" && cred.verified) {
              entries.push({
                id: "mfa_app",
                name: "Authenticator App Credential",
                type: "Security Credential",
                status: "Active",
                issuer: "Ondi",
                dateIssued: cred.lastUsedAt,
                grade: "Verified",
                accentColor: "#4253D1",
              });
            }
          }
        }

        if (identitiesResult.status === "fulfilled") {
          const ids = identitiesResult.value?.identities ?? [];
          for (const idn of ids) {
            entries.push({
              id: `social-${idn.provider}`,
              name: `${idn.provider.charAt(0).toUpperCase()}${idn.provider.slice(1).toLowerCase()} Account`,
              type: "Linked Identity",
              status: "Active",
              issuer: idn.email ?? idn.provider,
              dateIssued: idn.createdAt,
              grade: "Linked",
              accentColor: "#4253D1",
            });
          }
        }

        setCredentials(entries);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredCreds = credentials.filter((cred) => {
    const matchesSearch =
      cred.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.issuer.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterType === "all") return matchesSearch;
    if (filterType === "active")
      return matchesSearch && cred.status === "Active";
    if (filterType === "pending")
      return matchesSearch && cred.status === "Pending";
    return matchesSearch;
  });

  const activeCount = credentials.filter((c) => c.status === "Active").length;
  const pendingCount = credentials.filter((c) => c.status === "Pending").length;

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-10">
      {/* ── TOPBAR INTRO ──────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3">
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            My <span className="text-[#4253D1]">Credentials</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Government IDs, security credentials, and linked identities verified
            on your Ondi account.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button className="px-5 py-3 bg-[#4253D1] hover:bg-[#1A4C93] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-[#4253D1]/10">
            <QrCode size={16} strokeWidth={2.5} />
            Scan QR Code
          </button>
        </div>
      </div>

      {/* ── OVERVIEW ANALYTICS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-[#001633] rounded-lg text-white relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-blue-300">
                Total Credentials
              </p>
              <h3 className="text-3xl font-bold mt-2 tracking-tight">
                {credentials.length}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-white/10 flex items-center justify-center text-blue-200">
              <ShieldCheck size={20} />
            </div>
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400">Active</p>
              <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                {activeCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-blue-50 text-[#4253D1] flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400">
                Pending Verification
              </p>
              <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                {pendingCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* ── FILTER TABS BAR ──────────────────────────────────── */}
      <div className="flex gap-2 bg-slate-100/50 p-1.5 rounded-lg border border-slate-200/40 w-fit">
        {[
          { id: "all", label: "All Credentials", count: credentials.length },
          { id: "active", label: "Active", count: activeCount },
          { id: "pending", label: "Pending", count: pendingCount },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-5 py-2.5 rounded-[8px] text-xs font-bold transition-all duration-200 ${
              filterType === tab.id
                ? "bg-white text-[#001633] shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-[#001633] hover:bg-white/40"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {searchQuery && (
        <p className="text-[10px] font-bold text-slate-400">
          Filtered by topbar search: &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {/* ── CREDENTIALS LIST GRID ────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-lg">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  <Sk className="w-12 h-12 rounded-lg" />
                  <div className="space-y-2">
                    <Sk className="h-3.5 w-24" />
                    <Sk className="h-2.5 w-16" />
                  </div>
                </div>
                <Sk className="h-5 w-16 rounded-full" />
              </div>
              <div className="py-4 border-y border-slate-50 space-y-2.5">
                <div className="flex justify-between items-center">
                  <Sk className="h-2.5 w-14" />
                  <Sk className="h-2.5 w-20" />
                </div>
                <div className="flex justify-between items-center">
                  <Sk className="h-2.5 w-24" />
                  <Sk className="h-2.5 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCreds.length > 0 ? (
            filteredCreds.map((cred) => {
              const isActive = cred.status === "Active";
              return (
                <GlassPanel
                  key={cred.id}
                  className="p-6 bg-white border-slate-100 rounded-lg hover:shadow-md hover:border-slate-200/60 transition-all duration-300 flex flex-col justify-between relative overflow-hidden"
                >
                  <div
                    className="absolute top-0 left-0 w-full h-[3px]"
                    style={{ backgroundColor: cred.accentColor }}
                  />

                  <div>
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center"
                          style={{
                            backgroundColor: `${cred.accentColor}10`,
                            color: cred.accentColor,
                          }}
                        >
                          <Award size={22} strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-[#001633] tracking-tight leading-tight">
                            {cred.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">
                            {cred.type}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${
                          isActive
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                            : "bg-amber-50 text-amber-600 border-amber-100"
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${isActive ? "bg-[#0F9755]" : "bg-amber-600"} mr-1`}
                        />
                        {cred.status}
                      </div>
                    </div>

                    <div className="py-4 border-y border-slate-50 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">
                          Issuer:
                        </span>
                        <span className="font-bold text-[#001633] text-[10px]">
                          {cred.issuer}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">
                          Verification Status:
                        </span>
                        <span className="font-bold text-[#0F9755] text-[10px]">
                          {cred.grade}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-2">
                    <span className="text-[9px] text-slate-400 font-bold">
                      {cred.dateIssued
                        ? new Date(cred.dateIssued).toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                    <button
                      className="p-2 rounded-[8px] bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-500 hover:text-[#001633] transition-all"
                      title="View details"
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </GlassPanel>
              );
            })
          ) : (
            <div className="col-span-full py-16 text-center bg-white border border-slate-100 rounded-lg space-y-4">
              <p className="text-slate-400 text-sm font-medium">
                {credentials.length === 0
                  ? "No verified credentials yet"
                  : `No credentials found matching "${searchQuery}"`}
              </p>
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="text-xs font-bold text-[#4253D1] hover:underline"
                >
                  Clear Search Query
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SECURITY NOTE ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-100 rounded-lg p-6 flex gap-5 shadow-sm">
        <div className="w-12 h-12 rounded-lg bg-blue-50 text-[#4253D1] flex items-center justify-center shrink-0 border border-blue-100">
          <Lock size={22} />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-[#001633] tracking-tight">
            Verified Credential Security
          </h4>
          <p className="text-xs text-slate-500 font-normal leading-relaxed max-w-4xl">
            These credentials reflect your real, verified identity signals on
            Ondi — government ID checks, security enrollments, and linked
            accounts. Nothing here is simulated.
          </p>
        </div>
      </div>
    </div>
  );
}
