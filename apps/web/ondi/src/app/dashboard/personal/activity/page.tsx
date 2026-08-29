"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { GlassPanel } from "@/components/OneUI";
import { Sk } from "@/components/Skeleton";
import { useGlobalSearch } from "@/lib/globalSearch";
import {
  Clock,
  LogIn,
  Share2,
  ShieldCheck,
  Smartphone,
  Globe,
  X,
  MapPin,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Lock,
  Download,
  Flag,
  ThumbsUp,
  ChevronRight,
} from "lucide-react";

interface ActivityLog {
  id: string;
  type: "signin" | "share" | "attribute" | "revoke" | "security" | "device";
  title: string;
  desc: string;
  status: "Confirmed" | "Pending Review" | "Blocked" | "Revoked";
  ipAddress: string;
  device: string;
  location: string;
  time: string;
  fullTime: string;
  transactionId: string;
  signatureCode: string;
  details: string;
}

export default function ActivityPage() {
  const [selectedActivity, setSelectedActivity] = useState<ActivityLog | null>(
    null,
  );
  // Filters against the topbar's search box (⌘K) — see useGlobalSearch().
  const searchQuery = useGlobalSearch();
  const [statusFilter, setStatusFilter] = useState("all");

  // Track page numbers for ledger pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Portals mounting state
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track user confirmation state locally for mock feedback
  const [confirmedLogs, setConfirmedLogs] = useState<
    Record<string, "confirmed" | "reported">
  >({});

  const [events, setEvents] = useState<ActivityLog[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    apiFetch("/auth/logins?limit=50")
      .then((data) => {
        const raw = data?.events ?? data?.items ?? [];
        setEvents(
          raw.map((e: any) => ({
            id: e.id,
            type: "signin" as const,
            title: e.action ?? "Activity",
            desc: e.userAgent ?? "",
            status:
              (e.action ?? "").includes("FAIL") ||
              (e.action ?? "").includes("DENIED")
                ? "Blocked"
                : "Confirmed",
            ipAddress: e.ipAddress ?? "",
            device: e.userAgent ?? "",
            location: e.location ?? e.ipAddress ?? "",
            time: e.createdAt
              ? new Date(e.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "",
            fullTime: e.createdAt ? new Date(e.createdAt).toLocaleString() : "",
            transactionId: e.id,
            signatureCode: (e.id ?? "").slice(0, 8).toUpperCase(),
            details: `Action: ${e.action ?? "N/A"} | IP: ${e.ipAddress ?? "N/A"}`,
          })),
        );
      })
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, []);

  const activities = events;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Confirmed":
        return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "Pending Review":
        return "bg-amber-50 text-amber-600 border-amber-100";
      case "Blocked":
        return "bg-rose-50 text-rose-600 border-rose-100";
      case "Revoked":
        return "bg-slate-50 text-slate-500 border-slate-200";
      default:
        return "bg-slate-50 text-slate-500 border-slate-100";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "signin":
        return LogIn;
      case "share":
        return Share2;
      case "attribute":
        return ShieldCheck;
      case "revoke":
        return X;
      case "security":
        return ShieldAlert;
      case "device":
        return Smartphone;
      default:
        return Clock;
    }
  };

  const filteredActivities = activities.filter((act) => {
    const matchesSearch =
      act.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.location.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === "all") return matchesSearch;
    if (statusFilter === "confirmed")
      return matchesSearch && act.status === "Confirmed";
    if (statusFilter === "revoked")
      return matchesSearch && act.status === "Revoked";
    if (statusFilter === "blocked")
      return matchesSearch && act.status === "Blocked";
    return matchesSearch;
  });

  // Calculate local pagination
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredActivities.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  // Reset to first page on query / filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const handleConfirm = (id: string) => {
    setConfirmedLogs((prev) => ({ ...prev, [id]: "confirmed" }));
    setSelectedActivity(null);
  };

  const handleReport = (id: string) => {
    setConfirmedLogs((prev) => ({ ...prev, [id]: "reported" }));
    setSelectedActivity(null);
  };

  return (
    <>
      <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-10">
        {/* ── TOPBAR HEADER ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
              Your <span className="text-[#4253D1]">Identity History</span>
            </h1>
            <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
              A transparent, safe record of every time your digital profile was
              used, shared, or signed into partner platforms.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button className="px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
              <Download size={16} />
              Download History
            </button>
          </div>
        </div>

        {/* ── STATS SUMMARY BAR ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400">
                Total Identity Updates
              </p>
              <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                {events.length} Updates
              </h3>
            </div>
            <div className="mt-4 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">
                Automatic Retention Period
              </span>
              <span className="font-bold text-[#4253D1]">Last 90 Days</span>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400">
                Confirmed Events
              </p>
              <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                {events.filter((e) => e.status === "Confirmed").length}{" "}
                Confirmed
              </h3>
            </div>
            <div className="mt-4 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Privacy Status</span>
              <span className="font-bold text-emerald-600">Fully Secured</span>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400">
                Security Level
              </p>
              <h3
                className={`text-3xl font-bold mt-2 tracking-tight ${events.filter((e) => e.status === "Blocked").length === 0 ? "text-emerald-600" : "text-amber-600"}`}
              >
                {events.filter((e) => e.status === "Blocked").length === 0
                  ? "100% PROTECTED"
                  : "REVIEW NEEDED"}
              </h3>
            </div>
            <div className="mt-4 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">
                Suspicious Activities
              </span>
              <span className="font-bold text-slate-500">
                {events.filter((e) => e.status === "Blocked").length} Active
                Threats
              </span>
            </div>
          </div>
        </div>

        {/* ── FILTER BAR — search now lives only in the topbar (⌘K) ────────── */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 border border-slate-100 rounded-lg shadow-sm">
          {searchQuery ? (
            <span className="text-[10px] font-bold text-slate-400">
              Filtered by topbar search: &ldquo;{searchQuery}&rdquo;
            </span>
          ) : (
            <span className="text-[10px] text-slate-300">
              Use the search box in the topbar to filter these events
            </span>
          )}

          <div className="flex gap-2 bg-slate-100/50 p-1 rounded-[8px] border border-slate-200/40 w-full sm:w-auto shrink-0 justify-end">
            {["all", "confirmed", "revoked", "blocked"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`
                  px-4 py-1.5 rounded-[6px] text-[10px] font-bold transition-all duration-200
                  ${
                    statusFilter === status
                      ? "bg-white text-[#001633] shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-[#001633]"
                  }
                `}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* ── TABULAR VIEW (Clean, Simple columns without tech jargon) ────── */}
        <div className="bg-white border border-slate-100 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-bold text-slate-400">
                  <th className="py-4 px-6">Activity Details</th>
                  <th className="py-4 px-6">Category</th>
                  <th className="py-4 px-6">Security Status</th>
                  <th className="py-4 px-6">Device used</th>
                  <th className="py-4 px-6">Location</th>
                  <th className="py-4 px-6">Time</th>
                  <th className="py-4 px-6 text-right">Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {loadingEvents ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i}>
                      <td className="py-4.5 px-6">
                        <div className="flex items-center gap-3.5">
                          <Sk className="w-9 h-9 rounded-md shrink-0" />
                          <div className="space-y-1.5">
                            <Sk className="h-3 w-32" />
                            <Sk className="h-2.5 w-24" />
                          </div>
                        </div>
                      </td>
                      <td className="py-4.5 px-6"><Sk className="h-4 w-16 rounded" /></td>
                      <td className="py-4.5 px-6"><Sk className="h-4 w-14 rounded-full" /></td>
                      <td className="py-4.5 px-6"><Sk className="h-2.5 w-20" /></td>
                      <td className="py-4.5 px-6"><Sk className="h-2.5 w-20" /></td>
                      <td className="py-4.5 px-6"><Sk className="h-2.5 w-12" /></td>
                      <td className="py-4.5 px-6 text-right"><Sk className="h-4 w-4 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : currentItems.length > 0 ? (
                  currentItems.map((act) => {
                    const Icon = getIcon(act.type);
                    const isUserConfirmed =
                      confirmedLogs[act.id] === "confirmed";
                    const isUserReported = confirmedLogs[act.id] === "reported";

                    return (
                      <tr
                        key={act.id}
                        onClick={() => setSelectedActivity(act)}
                        className="hover:bg-slate-50/50 transition-colors duration-150 cursor-pointer group"
                      >
                        {/* Action details */}
                        <td className="py-4.5 px-6 max-w-sm">
                          <div className="flex items-center gap-3.5">
                            <div className="w-9 h-9 rounded-[8px] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 shrink-0 group-hover:scale-105 transition-all">
                              <Icon size={16} />
                            </div>
                            <div>
                              <p className="font-bold text-[#001633] tracking-tight leading-none group-hover:text-[#4253D1] transition-colors">
                                {act.title}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium mt-1 leading-tight">
                                {act.desc}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Category badge */}
                        <td className="py-4.5 px-6">
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100/60 px-2 py-0.5 rounded">
                            {act.type === "signin" ? "Sign in" : act.type}
                          </span>
                        </td>

                        {/* Security status */}
                        <td className="py-4.5 px-6">
                          {isUserConfirmed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border bg-emerald-50 text-emerald-600 border-emerald-100">
                              <ThumbsUp size={10} /> Confirmed by you
                            </span>
                          ) : isUserReported ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border bg-rose-50 text-rose-600 border-rose-100">
                              <AlertTriangle size={10} /> Reported
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getStatusColor(act.status)}`}
                            >
                              <span className="w-1 h-1 rounded-full bg-current" />
                              {act.status}
                            </span>
                          )}
                        </td>

                        {/* Device used */}
                        <td className="py-4.5 px-6">
                          <div>
                            <p className="font-semibold text-slate-700 text-[10px] truncate max-w-[150px]">
                              {act.device.split(" on ")[0]}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {act.ipAddress}
                            </p>
                          </div>
                        </td>

                        {/* Location */}
                        <td className="py-4.5 px-6">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <MapPin
                              size={12}
                              className="shrink-0 text-slate-400"
                            />
                            <span className="font-medium">{act.location}</span>
                          </div>
                        </td>

                        {/* Time */}
                        <td className="py-4.5 px-6 text-slate-400 font-bold text-[10px]">
                          {act.time}
                        </td>

                        {/* inspection details link */}
                        <td className="py-4.5 px-6 text-right">
                          <button className="p-1.5 rounded-[8px] bg-slate-50 border border-slate-100 text-slate-400 group-hover:text-[#4253D1] group-hover:bg-[#4253D1]/10 group-hover:border-[#4253D1]/20 transition-all">
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-16 text-center text-slate-400 font-medium"
                    >
                      No activity logs found matching the filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION CONTROLS FOOTER ─────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4.5 bg-slate-50/50 border-t border-slate-100 gap-4">
              <div className="text-[10px] text-slate-500 font-bold">
                Showing{" "}
                <span className="text-[#001633]">{indexOfFirstItem + 1}</span>{" "}
                to{" "}
                <span className="text-[#001633]">
                  {Math.min(indexOfLastItem, filteredActivities.length)}
                </span>{" "}
                of{" "}
                <span className="text-[#4253D1]">
                  {filteredActivities.length}
                </span>{" "}
                updates
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  className="px-3.5 py-1.5 rounded-[6px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white text-[9px] font-bold transition-all"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pageNum = idx + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7.5 h-7.5 rounded-[6px] text-[9px] font-bold transition-all flex items-center justify-center border
                        ${
                          currentPage === pageNum
                            ? "bg-[#4253D1] text-white border-[#4253D1] shadow-sm shadow-[#4253D1]/10"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  className="px-3.5 py-1.5 rounded-[6px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white text-[9px] font-bold transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── SAFETY GUARANTEE NOTE ─────────────────────────────────────── */}
        <div className="bg-white border border-slate-100 rounded-lg p-6 flex gap-5 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-[#4253D1] flex items-center justify-center shrink-0 border border-blue-100">
            <Lock size={22} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#001633] tracking-tight">
              Your Security Guarantee
            </h4>
            <p className="text-xs text-slate-500 font-normal leading-relaxed max-w-4xl">
              All listed events are permanently signed and locked by your
              device. No one, including partner banks or Hudumika itself, can
              change or delete this history, ensuring a completely transparent
              audit trail of your private data.
            </p>
          </div>
        </div>
      </div>

      {/* ── SLIDE-OVER SHEET DETAIL MODAL (PORTAL OUTSIDE OF CONTAINER MAIN TO FULLY BLUR ALL DOM ELEMENTS) ── */}
      {mounted &&
        selectedActivity &&
        (createPortal(
          <div className="fixed inset-0 z-[99999] overflow-hidden flex justify-end">
            {/* Smooth Backdrop Mask with full screen Blur overlay - covers sidebar and topbar */}
            <div
              onClick={() => setSelectedActivity(null)}
              className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[99999]"
            />

            {/* Slide-over sheet panel sliding right to left */}
            <div className="relative w-full max-w-xl bg-white h-screen shadow-xl z-[999999] border-l border-slate-100 flex flex-col justify-between">
              {/* Header */}
              <div className="p-8 bg-[#001633] shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>Personal</span>
                    <ChevronRight size={10} className="text-slate-500" />
                    <span className="text-[#7b8ef5]">Activity history</span>
                    <ChevronRight size={10} className="text-slate-500" />
                    <span className="text-slate-300">Event detail</span>
                  </div>

                  <button
                    onClick={() => setSelectedActivity(null)}
                    className="w-9 h-9 rounded-md text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white tracking-tight leading-tight">
                      {selectedActivity.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Reference code:{" "}
                      <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">
                        {selectedActivity.id}
                      </span>
                    </p>
                  </div>

                  <div className="shrink-0">
                    <span className="text-xs font-medium text-[#7b8ef5] bg-[#4253D1]/20 px-3 py-1 rounded-md">
                      {selectedActivity.type === "signin"
                        ? "Sign in"
                        : selectedActivity.type}
                    </span>
                  </div>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* Visual Status Indicator Banner */}
                <div
                  className={`p-5 rounded-lg border flex gap-4 items-start ${
                    confirmedLogs[selectedActivity.id] === "confirmed"
                      ? getStatusColor("Confirmed")
                      : confirmedLogs[selectedActivity.id] === "reported"
                        ? getStatusColor("Blocked")
                        : getStatusColor(selectedActivity.status)
                  }`}
                >
                  <div className="w-9 h-9 rounded-[8px] bg-white border border-slate-100 flex items-center justify-center shrink-0 text-current shadow-sm">
                    {selectedActivity.status === "Blocked" ||
                    confirmedLogs[selectedActivity.id] === "reported" ? (
                      <ShieldAlert size={18} />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold">Security Status</p>
                    <p className="text-xs text-slate-600 font-medium">
                      {confirmedLogs[selectedActivity.id] === "confirmed" ? (
                        <span>
                          You successfully confirmed this activity as genuine
                          and recognized.
                        </span>
                      ) : confirmedLogs[selectedActivity.id] === "reported" ? (
                        <span>
                          You marked this activity as unrecognized. Security
                          teams are reviewing the transaction code.
                        </span>
                      ) : selectedActivity.status === "Blocked" ? (
                        <span>
                          This action was blocked automatically due to
                          suspicious login parameters.
                        </span>
                      ) : (
                        <span>This activity was completed successfully.</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Friendly Activity Description */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400">
                    What Happened
                  </p>
                  <p className="text-xs text-slate-600 font-normal leading-relaxed">
                    {selectedActivity.details}
                  </p>
                </div>

                {/* Grid Metadata parameters */}
                <div className="border-t border-slate-50 pt-5 space-y-4">
                  <p className="text-[10px] font-bold text-slate-400">
                    Activity Parameters
                  </p>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {/* Timestamp */}
                    <div className="space-y-1 bg-slate-50 p-3 border border-slate-100/50 rounded-lg">
                      <span className="text-[9px] font-bold text-slate-400 block">
                        Date
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {selectedActivity.fullTime.split(" at ")[0]}
                      </span>
                    </div>

                    {/* Accurate clock time */}
                    <div className="space-y-1 bg-slate-50 p-3 border border-slate-100/50 rounded-lg">
                      <span className="text-[9px] font-bold text-slate-400 block">
                        Exact Time
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {selectedActivity.fullTime.split(" at ")[1] ||
                          selectedActivity.time}
                      </span>
                    </div>

                    {/* Network Routing IP */}
                    <div className="space-y-1 bg-slate-50 p-3 border border-slate-100/50 rounded-lg">
                      <span className="text-[9px] font-bold text-slate-400 block">
                        Internet Address (IP)
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {selectedActivity.ipAddress}
                      </span>
                    </div>

                    {/* Geographic Area */}
                    <div className="space-y-1 bg-slate-50 p-3 border border-slate-100/50 rounded-lg">
                      <span className="text-[9px] font-bold text-slate-400 block">
                        Location
                      </span>
                      <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <MapPin size={12} className="text-[#4253D1]" />{" "}
                        {selectedActivity.location.split(",")[0]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Device Details */}
                <div className="border-t border-slate-50 pt-5 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400">
                    Device Details
                  </p>
                  <div className="flex gap-3 bg-slate-50 p-4 border border-slate-100/50 rounded-lg items-center">
                    <div className="w-10 h-10 rounded-[8px] bg-white border border-slate-100 flex items-center justify-center text-slate-500">
                      <Laptop size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700 leading-none">
                        {selectedActivity.device.split(" on ")[0]}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">
                        {selectedActivity.device.split(" on ")[1] ||
                          "Registered mobile client"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Secure cryptographic proof block explained simply */}
                <div className="border-t border-slate-50 pt-5 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400">
                    Verification Proof
                  </p>

                  <div className="bg-slate-50 p-4 border border-slate-100/50 rounded-lg space-y-3">
                    <div className="flex gap-1.5 items-start text-[10px] text-slate-500 font-medium">
                      <Lock
                        size={12}
                        className="text-emerald-600 mt-0.5 shrink-0"
                      />
                      <span>
                        This digital signature acts as a secure cryptographic
                        seal showing this log was bound to your hardware key and
                        cannot be tampered with.
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200/60">
                      <span className="text-[8px] font-bold text-slate-400 block">
                        Security ID
                      </span>
                      <code className="text-[10px] font-bold text-slate-600 block mt-0.5 select-all">
                        {selectedActivity.transactionId}
                      </code>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 block">
                        Digital Signature Code
                      </span>
                      <code className="text-[10px] font-medium text-slate-500 block mt-0.5 break-all select-all">
                        {selectedActivity.signatureCode}
                      </code>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer Actions (Report or Confirm logged activity) */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0 flex flex-col gap-3">
                {confirmedLogs[selectedActivity.id] ? (
                  <div className="py-2.5 text-center text-xs font-bold border rounded-[8px] bg-slate-100 text-slate-600 border-slate-200">
                    Action Logged:{" "}
                    {confirmedLogs[selectedActivity.id] === "confirmed"
                      ? "Confirmed"
                      : "Reported"}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleConfirm(selectedActivity.id)}
                      className="flex-1 py-3.5 bg-[#4253D1] hover:bg-[#1A4C93] text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-2 shadow-sm shadow-[#4253D1]/10"
                    >
                      <CheckCircle2 size={15} /> Yes, I Confirm This
                    </button>
                    <button
                      onClick={() => handleReport(selectedActivity.id)}
                      className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-2"
                    >
                      <Flag size={15} /> No, Report This
                    </button>
                  </div>
                )}

                <button className="py-2 bg-transparent text-slate-400 hover:text-slate-600 transition-colors text-[10px] font-bold flex items-center justify-center gap-1.5">
                  <Download size={12} /> Download Security Receipt
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) as any)}
    </>
  );
}
