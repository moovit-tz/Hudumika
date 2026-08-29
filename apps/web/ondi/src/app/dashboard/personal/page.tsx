"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, downloadFile } from "@/lib/api";
import { buildDocuments } from "@/lib/identity";
import { Sk } from "@/components/Skeleton";
import { useGlobalSearch } from "@/lib/globalSearch";
import {
  ShieldCheck,
  FileText,
  Grid,
  Clock,
  Filter,
  MoreHorizontal,
  ChevronRight,
  Briefcase,
  Smartphone,
  Plus,
  Share2,
  Download,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  QrCode,
  Key,
  UserCheck,
  Shield,
  RefreshCw,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7020/v1";

// ── Trust Score Ring ───────────────────────────────────────────────────────
function TrustScoreRing({
  score,
  maxScore = 1000,
}: {
  score: number;
  maxScore?: number;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(score / maxScore, 1);
  const dash = pct * circumference;

  const tier =
    score >= 800
      ? { label: "Excellent", color: "#10B981" }
      : score >= 650
        ? { label: "Good", color: "#4253D1" }
        : score >= 450
          ? { label: "Fair", color: "#F59E0B" }
          : { label: "Low", color: "#EF4444" };

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 140, height: 140 }}
    >
      <svg width={140} height={140} className="-rotate-90">
        <circle
          cx={70}
          cy={70}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={8}
        />
        <circle
          cx={70}
          cy={70}
          r={radius}
          fill="none"
          stroke={tier.color}
          strokeWidth={8}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-semibold text-[#001633] tracking-tight leading-none">
          {score}
        </span>
        <span
          className="text-[10px] font-bold mt-0.5"
          style={{ color: tier.color }}
        >
          {tier.label}
        </span>
      </div>
    </div>
  );
}

interface TrustBreakdownItem {
  label: string;
  score: number;
  max: number;
  description: string;
}
interface OrgMembership {
  id: string;
  name: string;
  role: string;
}

const QUICK_ACTIONS = [
  {
    label: "Share Identity",
    icon: QrCode,
    color: "text-[#4253D1] bg-[#4253D1]/10",
    href: "#",
  },
  {
    label: "Add Document",
    icon: Plus,
    color: "text-emerald-600 bg-emerald-50",
    href: "/dashboard/personal/wallet",
  },
  {
    label: "Security Check",
    icon: Shield,
    color: "text-amber-600 bg-amber-50",
    href: "/dashboard/personal/security",
  },
  {
    label: "Download Report",
    icon: Download,
    color: "text-slate-600 bg-slate-100",
    href: "#",
    action: "download-report" as const,
  },
];

function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      {/* Hero */}
      <div className="overflow-hidden rounded-lg bg-white border border-slate-200/80 shadow-sm p-8">
        <div className="flex flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex-1 min-w-0 space-y-5">
            <div className="flex items-center gap-3">
              <Sk className="w-12 h-12 rounded-xl" />
              <div className="space-y-2">
                <Sk className="h-2.5 w-20" />
                <Sk className="h-4 w-32" />
              </div>
              <Sk className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-2 max-w-xs">
              <Sk className="h-2 w-48" />
              <Sk className="h-1.5 w-full rounded-full" />
            </div>
            <div className="flex items-center gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Sk className="w-3.5 h-3.5 rounded" />
                  <div className="space-y-1.5">
                    <Sk className="h-3.5 w-5" />
                    <Sk className="h-2 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Sk className="w-[140px] h-[140px] rounded-full shrink-0" />
        </div>
        <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Sk key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`p-6 rounded-[10px] shadow-sm ${i === 0 ? "bg-slate-200" : "bg-white border border-slate-100"}`}
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Sk className="h-2 w-24" />
                <Sk className="h-7 w-28" />
              </div>
              <Sk className="w-10 h-10 rounded-[8px]" />
            </div>
            <div className="mt-8 flex justify-between items-end">
              <Sk className="h-2.5 w-20" />
              <Sk className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
      {/* Workspaces + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-100 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div className="space-y-1.5">
              <Sk className="h-3 w-32" />
              <Sk className="h-2 w-20" />
            </div>
            <Sk className="w-7 h-7 rounded-lg" />
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <Sk className="w-9 h-9 rounded-xl" />
                <div className="space-y-1.5">
                  <Sk className="h-3 w-20" />
                  <Sk className="h-2 w-12" />
                </div>
              </div>
              <Sk className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div className="space-y-1.5">
              <Sk className="h-3 w-28" />
              <Sk className="h-2 w-40" />
            </div>
            <Sk className="h-8 w-48 rounded-lg" />
          </div>
          <div className="flex items-end gap-3 h-44">
            {[40, 48, 62, 58, 75, 72, 92].map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="w-full rounded-t-lg bg-slate-100 animate-pulse"
                  style={{ height: `${v}%`, minHeight: 4 }}
                />
                <Sk className="h-2 w-4" />
              </div>
            ))}
          </div>
          <div className="pt-5 border-t border-slate-100 grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Sk className="h-2 w-20" />
                <Sk className="h-5 w-10" />
                <Sk className="h-2 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Security posture */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-3"
          >
            <Sk className="w-9 h-9 rounded-xl shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Sk className="h-2 w-20" />
              <Sk className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
      {/* Activity */}
      <div className="bg-white border border-slate-100 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="space-y-1.5">
            <Sk className="h-3 w-40" />
            <Sk className="h-2 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Sk className="h-8 w-52 rounded-lg" />
            <Sk className="h-8 w-8 rounded-lg" />
            <Sk className="h-8 w-8 rounded-lg" />
          </div>
        </div>
        <div className="space-y-0">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-start gap-4 py-3 border-b border-slate-50 last:border-0"
            >
              <Sk className="w-8 h-8 rounded-xl shrink-0 mt-0.5" />
              <div className="flex-1 flex items-center justify-between">
                <div className="space-y-1.5">
                  <Sk className="h-3 w-40" />
                  <Sk className="h-2 w-28" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="space-y-1.5 hidden sm:block">
                    <Sk className="h-2 w-20" />
                    <Sk className="h-2 w-14" />
                  </div>
                  <Sk className="h-5 w-16 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PersonalDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{
    phoneNumber?: string;
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null>(null);
  const [trustScore, setTrustScore] = useState(0);
  const [trustTier, setTrustTier] = useState("LOW");
  const [trustBreakdown, setTrustBreakdown] = useState<TrustBreakdownItem[]>(
    [],
  );
  const [verifiedDocs, setVerifiedDocs] = useState(0);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [connectedApps, setConnectedApps] = useState(0);
  const [organizations, setOrganizations] = useState<OrgMembership[]>([]);
  const [identityCompletion, setIdentityCompletion] = useState(0);
  const [activeSessionsCount, setActiveSessionsCount] = useState(0);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  // Activity filters against the one search box in the topbar (⌘K) now,
  // not a second local search input — see useGlobalSearch().
  const activitySearch = useGlobalSearch();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    const t = setTimeout(() => setIsLoaded(true), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [scoreData, logsData, meData, consentsData, sessionsData] =
          await Promise.allSettled([
            apiFetch("/trust/score"),
            apiFetch("/auth/logins?limit=5"),
            apiFetch("/auth/me"),
            apiFetch("/oauth/consents"),
            apiFetch("/sessions"),
          ]);
        if (scoreData.status === "fulfilled") {
          setTrustScore(
            scoreData.value?.score ?? scoreData.value?.trustScore ?? 0,
          );
          setTrustTier(scoreData.value?.trustTier ?? "LOW");
          setTrustBreakdown(scoreData.value?.breakdown ?? []);
        }
        if (logsData.status === "fulfilled") {
          const events = logsData.value?.events ?? logsData.value?.items ?? [];
          setActivities(events);
        }
        if (meData.status === "fulfilled") {
          setUser((prev) => ({
            ...prev,
            id: meData.value?.id ?? prev?.id,
            phoneNumber: meData.value?.phoneNumber ?? prev?.phoneNumber,
            firstName: meData.value?.firstName,
            lastName: meData.value?.lastName,
            email: meData.value?.email,
          }));
          setOrganizations(meData.value?.organizations ?? []);
          setVerifiedDocs(
            buildDocuments(meData.value).filter((d) => d.status === "verified")
              .length,
          );
          const levelProgress: Record<string, number> = {
            L0_UNVERIFIED: 25,
            L1_BASIC_KYC: 50,
            L2_GOV_VERIFIED: 75,
            L3_FINANCIAL_VERIFIED: 100,
          };
          setIdentityCompletion(
            levelProgress[meData.value?.verificationLevel] ?? 25,
          );
          setMfaEnabled(
            (meData.value?.credentials ?? []).some(
              (c: any) => c.type === "OTP" && c.verified,
            ),
          );
        }
        if (consentsData.status === "fulfilled") {
          setConnectedApps(consentsData.value?.consents?.length ?? 0);
        }
        if (sessionsData.status === "fulfilled") {
          setActiveSessionsCount(sessionsData.value?.sessions?.length ?? 0);
        }
      } catch {
        /* silent */
      } finally {
        setLoadingData(false);
      }
    }
    loadDashboard();
  }, []);

  const realName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayPhone =
    user?.phoneNumber && !user.phoneNumber.startsWith("federated_")
      ? `+${user.phoneNumber.replace(/^255/, "255 ").replace(/(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}`
      : "";
  const displayName = realName || displayPhone || "Your Identity";
  const avatarChar = (
    realName
      ? realName.charAt(0)
      : displayPhone
        ? displayPhone.charAt(displayPhone.length - 3)
        : "O"
  ).toUpperCase();

  const isFlaggedAction = (action: string) =>
    action.includes("FAIL") ||
    action.includes("DENIED") ||
    action.includes("BLOCK");

  const mappedActivities = activities.map((e: any) => ({
    id: e.id,
    type: "signin" as const,
    title: e.action ?? "Activity",
    desc: e.userAgent ?? "",
    status: (isFlaggedAction(e.action ?? "") ? "Blocked" : "Completed") as
      | "Blocked"
      | "Completed",
    date: e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "",
    time: e.createdAt
      ? new Date(e.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
    location: e.location ?? e.ipAddress ?? "",
    icon: Key,
    action: e.action ?? "Activity",
    service: e.location ?? e.ipAddress ?? "",
  }));

  const hasSuspiciousActivity = activities.some((e: any) =>
    isFlaggedAction(e.action ?? ""),
  );
  const mostRecentLogin = activities[0]?.createdAt
    ? new Date(activities[0].createdAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "No recent activity";
  const filteredActivities = mappedActivities.filter(
    (a) =>
      a.action.toLowerCase().includes(activitySearch.toLowerCase()) ||
      a.service.toLowerCase().includes(activitySearch.toLowerCase()),
  );


  return (
    <>
      {!isLoaded ? (
        <DashboardSkeleton />
      ) : (
        <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
          {/* ── ALERT BANNER (identity completion) ────────────────────────────── */}
          {identityCompletion < 100 && (
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-amber-50 border border-amber-200/80 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <p className="text-xs font-bold text-amber-800">
                  Your identity is {identityCompletion}% complete — Add your
                  National ID to unlock all services
                </p>
              </div>
              <button
                onClick={() => router.push("/register/personal/kyc")}
                className="shrink-0 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition-colors"
              >
                Complete Now
              </button>
            </div>
          )}

          {/* ── HERO IDENTITY CARD ────────────────────────────────────────────── */}
          <div className="relative overflow-hidden rounded-lg bg-white border border-slate-200/80 shadow-sm p-8">
            <div className="relative z-10 flex flex-row items-start sm:items-center justify-between gap-6">
              {/* Left: greeting */}
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 border border-[#4253D1]/20 flex items-center justify-center text-[#4253D1] font-semibold text-lg">
                    {avatarChar}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#4253D1]">
                      Verified Identity
                    </p>
                    <h1 className="text-xl font-semibold text-[#001633] tracking-tight">
                      {displayName}
                    </h1>
                  </div>
                  <span className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold">
                    <CheckCircle2 size={10} /> Active
                  </span>
                </div>

                {/* Identity completeness */}
                <div className="space-y-1.5 max-w-xs">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>Identity Completeness</span>
                    <span className="text-slate-700">
                      {identityCompletion}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${identityCompletion}%` }}
                      className="h-full bg-[#4253D1] rounded-full"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Add NIN + biometric to reach 100%
                  </p>
                </div>

                {/* Quick stats */}
                <div className="flex items-center gap-6 pt-1">
                  {[
                    {
                      label: "Docs Verified",
                      value: verifiedDocs,
                      icon: FileText,
                    },
                    { label: "App Launcher", value: connectedApps, icon: Grid },
                    {
                      label: "Workspaces",
                      value: organizations.length,
                      icon: Briefcase,
                    },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-2">
                      <Icon
                        size={14}
                        className="text-slate-450 text-slate-400"
                      />
                      <div>
                        <p className="text-base font-semibold text-[#001633] leading-none">
                          {value}
                        </p>
                        <p className="text-[9px] text-slate-400">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Trust Score Ring — pinned to right, never wraps */}
              <div className="flex flex-col items-center gap-2 shrink-0 self-center">
                <TrustScoreRing score={trustScore} />
                <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                  Trust Score / 1000
                </p>
              </div>
            </div>

            {/* Quick Actions strip */}
            <div className="relative z-10 mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK_ACTIONS.map(
                ({ label, icon: Icon, color, href, action }) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (action === "download-report") {
                        downloadFile(
                          "/audit/export?format=csv",
                          "ondi-security-report.csv",
                        ).catch(() => {});
                      } else {
                        router.push(href);
                      }
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 bg-slate-50/50 hover:bg-slate-100 border border-slate-200/50 rounded-xl transition-all text-left group"
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}
                    >
                      <Icon size={14} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-650 text-slate-600 group-hover:text-[#001633] transition-colors">
                      {label}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* ── METRIC CARDS ──────────────────────────────────────────────────── */}
          {/* ── METRIC CARDS ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Card 1: Identity Trust Score (Gradient Card style from Wallet Summary) */}
            <div
              onClick={() => router.push("/dashboard/personal/trust")}
              className="p-6 bg-[#001633] rounded-lg text-white relative overflow-hidden cursor-pointer flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-200"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-slate-300">
                    Identity Trust Score
                  </p>
                  {loadingData ? (
                    <div className="h-8 w-20 bg-white/20 rounded-lg animate-pulse mt-2" />
                  ) : (
                    <h3 className="text-3xl font-semibold mt-2 tracking-tight">
                      {trustScore}
                    </h3>
                  )}
                </div>
                <div className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center text-[#4253D1] shrink-0">
                  <ShieldCheck size={20} />
                </div>
              </div>
              <div className="mt-8 flex justify-between items-end">
                <div>
                  <p className="text-xs text-slate-300 font-medium">
                    Verified Status
                  </p>
                  <p className="text-base font-semibold mt-0.5 text-white">
                    Excellent
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-[#0F9755] text-white rounded-full">
                  +1.5%
                </span>
              </div>
            </div>

            {/* Card 2: Verified Documents */}
            <div
              onClick={() => router.push("/dashboard/personal/wallet")}
              className="p-6 bg-white border border-slate-100 rounded-[10px] flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold text-slate-400">
                    Verified Documents
                  </p>
                  {loadingData ? (
                    <div className="h-8 w-20 bg-slate-200 rounded-lg animate-pulse mt-2" />
                  ) : (
                    <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                      {verifiedDocs} Documents
                    </h3>
                  )}
                </div>
                <div className="w-10 h-10 rounded-[8px] bg-blue-50 text-[#4253D1] flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
              </div>
              <div className="mt-8 flex justify-between items-end">
                <span className="text-xs text-slate-400 font-bold">
                  Active Shares
                </span>
                <span className="text-xs font-bold text-[#4253D1] flex items-center gap-1">
                  5 Partners <ArrowUpRight size={14} />
                </span>
              </div>
            </div>

            {/* Card 3: App Launcher */}
            <div
              onClick={() => router.push("/dashboard/personal/apps")}
              className="p-6 bg-white border border-slate-100 rounded-[10px] flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold text-slate-400">
                    App Launcher
                  </p>
                  <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                    {connectedApps} Apps
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-[8px] bg-purple-50 text-purple-605 text-purple-600 flex items-center justify-center shrink-0">
                  <Grid size={20} />
                </div>
              </div>
              <div className="mt-8 flex justify-between items-end">
                <span className="text-xs text-slate-400 font-bold">
                  Authorizations
                </span>
                <span className="text-xs font-bold text-[#4253D1]">Active</span>
              </div>
            </div>
          </div>

          {/* ── WORKSPACES + TRUST EVOLUTION ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Workspaces */}
            <div className="lg:col-span-4 bg-white border border-slate-100 rounded-xl p-6">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-xs font-bold text-[#001633]">
                    Active Workspaces
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {organizations.length} workspace
                    {organizations.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={() => router.push('/register/enterprise/kyb')}
                  className="w-7 h-7 bg-[#4253D1]/10 hover:bg-[#4253D1]/20 text-[#4253D1] rounded-lg flex items-center justify-center transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {organizations.length === 0 ? (
                <button
                  onClick={() => router.push('/register/enterprise/kyb')}
                  className="w-full text-[10px] text-slate-400 hover:text-[#4253D1] py-6 text-center transition-colors"
                >
                  No workspaces yet — verify a business to create one
                </button>
              ) : (
                <div className="space-y-3">
                  {organizations.map((ws) => (
                    <div
                      key={ws.id}
                      className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl border flex items-center justify-center bg-blue-50 text-blue-600 border-blue-100">
                          <Briefcase size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#001633]">
                            {ws.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {ws.role}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={12}
                        className="text-slate-300 group-hover:text-[#4253D1] transition-colors"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button className="mt-4 w-full py-2.5 text-[10px] font-bold text-slate-400 hover:text-[#4253D1] transition-colors flex items-center justify-center gap-1">
                <Zap size={11} /> Discover More
              </button>
            </div>

            {/* Trust Score Breakdown — real signal data from GET /trust/score,
              no historical-series endpoint exists yet so this shows the
              real contributing signals rather than a fabricated trend line. */}
            <div className="lg:col-span-8 bg-white border border-slate-100 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xs font-bold text-[#001633]">
                    Trust Score Breakdown
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Real signals contributing to your current score
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#4253D1]/10 text-[#4253D1]">
                  {trustTier} Tier
                </span>
              </div>

              {loadingData ? (
                <div className="space-y-4 pt-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-6 bg-slate-100 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : trustBreakdown.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
                  <ShieldCheck size={28} className="text-slate-200" />
                  <p className="text-xs font-bold">
                    No trust signals recorded yet
                  </p>
                  <p className="text-[10px] text-slate-400 max-w-xs text-center">
                    Complete identity verification and connect more services to
                    build your trust signal history.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {trustBreakdown.map((signal, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-bold text-[#001633]">
                          {signal.label.replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {signal.score}/{signal.max}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#4253D1] transition-all"
                          style={{
                            width: `${Math.min(100, (signal.score / (signal.max || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-400">
                        {signal.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats row — derived from real breakdown data, not fabricated. */}
              <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-3 gap-4">
                {[
                  {
                    label: "Current Score",
                    value: String(trustScore),
                    sub: `${trustTier} tier`,
                  },
                  {
                    label: "Active Signals",
                    value: String(trustBreakdown.length),
                    sub: "Contributing sources",
                  },
                  {
                    label: "Top Signal",
                    value: trustBreakdown.length
                      ? `${Math.max(...trustBreakdown.map((s) => s.score))}`
                      : "—",
                    sub: trustBreakdown.length
                      ? trustBreakdown
                          .reduce((a, b) => (b.score > a.score ? b : a))
                          .label.replace(/_/g, " ")
                      : "None yet",
                  },
                ].map(({ label, value, sub }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-slate-400">
                      {label}
                    </p>
                    <p className="text-base font-semibold text-[#001633] mt-0.5">
                      {value}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── SECURITY POSTURE STRIP ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "MFA Status",
                value: mfaEnabled ? "Enabled" : "Not Enabled",
                icon: ShieldCheck,
                ok: mfaEnabled,
              },
              {
                label: "Active Sessions",
                value: `${activeSessionsCount} device${activeSessionsCount === 1 ? "" : "s"}`,
                icon: Smartphone,
                ok: true,
              },
              {
                label: "Last Login",
                value: mostRecentLogin,
                icon: Clock,
                ok: true,
              },
              {
                label: "Suspicious Activity",
                value: hasSuspiciousActivity
                  ? "Review needed"
                  : "None detected",
                icon: AlertTriangle,
                ok: !hasSuspiciousActivity,
              },
            ].map(({ label, value, icon: Icon, ok }) => (
              <div
                key={label}
                className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-3"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ok ? "bg-emerald-50" : "bg-red-50"}`}
                >
                  <Icon
                    size={16}
                    className={ok ? "text-emerald-600" : "text-red-500"}
                    strokeWidth={2}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400">
                    {label}
                  </p>
                  <p className="text-xs font-bold text-[#001633] mt-0.5">
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── RECENT ACTIVITY ───────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-100 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xs font-bold text-[#001633]">
                  Recent Identity Activity
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {filteredActivities.length} events found
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activitySearch && (
                  <span className="text-[10px] font-bold text-slate-400">
                    Filtered by topbar search: &ldquo;{activitySearch}&rdquo;
                  </span>
                )}
                <button className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-[#001633] hover:bg-slate-50 transition-all">
                  <Filter size={14} />
                </button>
                <button className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-[#001633] hover:bg-slate-50 transition-all">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Activity timeline */}
            <div className="space-y-0">
              {filteredActivities.map((act, i) => {
                const Icon = act.icon;
                return (
                  <div key={i} className="flex items-start gap-4 group">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center shrink-0 mt-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center ${act.status === "Completed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
                      >
                        <Icon size={14} />
                      </div>
                      {i < filteredActivities.length - 1 && (
                        <div className="w-px flex-1 bg-slate-100 mt-1 mb-1 min-h-[20px]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex items-center justify-between py-3 border-b border-slate-50 group-last:border-0">
                      <div>
                        <p className="text-xs font-bold text-[#001633]">
                          {act.action}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {act.service} · {act.id}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-slate-500">
                            {act.date}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {act.time}
                          </p>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${act.status === "Completed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
                        >
                          {act.status}
                        </span>
                        <button className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredActivities.length === 0 &&
                !loadingData &&
                activities.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No recent activity
                  </div>
                )}
              {filteredActivities.length === 0 &&
                (activitySearch || activities.length > 0) && (
                  <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
                    <Clock size={28} className="text-slate-200" />
                    <p className="text-xs font-bold">No matching activity</p>
                  </div>
                )}
            </div>

            <button className="mt-4 w-full py-2.5 border border-slate-100 hover:border-[#4253D1]/30 hover:bg-[#4253D1]/5 rounded-xl text-[10px] font-bold text-slate-400 hover:text-[#4253D1] transition-all flex items-center justify-center gap-1.5">
              View All Activity <ArrowUpRight size={11} />
            </button>
          </div>

        </div>
      )}
    </>
  );
}
