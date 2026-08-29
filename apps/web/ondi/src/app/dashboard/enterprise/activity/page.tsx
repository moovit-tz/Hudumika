"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  Download,
  Key,
  UserPlus,
  Shield,
  Settings,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api";
import { useGlobalSearch } from "@/lib/globalSearch";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface LogEntry {
  id: string;
  action: string;
  type: string;
  status: "Success" | "Failed";
  actor: string;
  summary: string;
  ipAddress: string | null;
  timestamp: string;
}

const types = ["All", "Auth", "Access", "Config", "Lifecycle"];

const TYPE_ICON: Record<string, any> = {
  Auth: CheckCircle2,
  Access: Key,
  Config: Settings,
  Lifecycle: UserPlus,
};

function formatTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export default function ActivityPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // Filters against the topbar's search box (⌘K) — see useGlobalSearch().
  const search = useGlobalSearch();
  const [typeFilter, setTypeFilter] = useState("All");

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setOrgId(id);
    apiFetch(`/organizations/${id}/activity?limit=100`)
      .then((res) => setLogs(res.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleExport() {
    if (!orgId) return;
    try {
      await downloadFile(
        `/organizations/${orgId}/activity/export`,
        "ondi-org-activity.csv",
      );
    } catch {}
  }

  const filtered = logs.filter(
    (l) =>
      (typeFilter === "All" || l.type === typeFilter) &&
      (!search ||
        l.summary.toLowerCase().includes(search.toLowerCase()) ||
        l.actor.toLowerCase().includes(search.toLowerCase())),
  );

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
            Audit <span className="text-[#4253D1]">Trail</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Tamper-proof record of every action on your organization.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-2.5 border border-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters — search now lives only in the topbar (⌘K) */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {search && (
          <span className="text-[10px] font-bold text-slate-400 shrink-0">
            Filtered by topbar search: &ldquo;{search}&rdquo;
          </span>
        )}
        <div className="flex gap-2 flex-wrap">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                typeFilter === t
                  ? "bg-[#4253D1] text-white border-[#4253D1]"
                  : "bg-white text-slate-400 border-slate-100 hover:border-[#4253D1] hover:text-[#4253D1]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {[
                  "Action",
                  "Actor",
                  "Detail",
                  "IP Address",
                  "Timestamp",
                  "Type",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((log) => {
                const Icon =
                  log.status === "Failed"
                    ? AlertTriangle
                    : TYPE_ICON[log.type] || Shield;
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Icon
                          size={12}
                          className={
                            log.status === "Failed"
                              ? "text-red-500"
                              : "text-[#4253D1]"
                          }
                        />
                        <span className="font-bold text-[#001633] tracking-tight whitespace-nowrap">
                          {log.action.replace(/_/g, " ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                      {log.actor}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 max-w-[240px] truncate">
                      {log.summary}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-[10px] whitespace-nowrap">
                      {log.ipAddress || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {log.type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          log.status === "Success"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-500"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Clock size={28} className="text-slate-200" />
            <p className="text-xs font-bold">
              {logs.length === 0
                ? "No activity recorded yet."
                : "No logs match your filters."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
