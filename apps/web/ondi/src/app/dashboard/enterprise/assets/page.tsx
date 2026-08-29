"use client";

import { useEffect, useState } from "react";
import {
  Smartphone,
  Monitor,
  Shield,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useGlobalSearch } from "@/lib/globalSearch";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Asset {
  id: string;
  name: string;
  type: string;
  user: string;
  os: string;
  location: string | null;
  lastSeen: string;
  risk: "Low" | "Medium" | "High";
  status: "Trusted" | "Review" | "Blocked";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AssetsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    trusted: 0,
    review: 0,
    blocked: 0,
  });
  // Filters against the topbar's search box (⌘K) — see useGlobalSearch().
  const search = useGlobalSearch();

  function load(id: string) {
    setLoading(true);
    apiFetch(`/organizations/${id}/assets`)
      .then((res) => {
        setAssets(res.assets ?? []);
        setSummary(
          res.summary ?? { total: 0, trusted: 0, review: 0, blocked: 0 },
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const filtered = assets.filter(
    (a) =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.user.toLowerCase().includes(search.toLowerCase()),
  );

  const summaryCards = [
    {
      label: "Total Devices",
      value: String(summary.total),
      icon: Smartphone,
      color: "text-[#4253D1] bg-[#4253D1]/10",
    },
    {
      label: "Trusted",
      value: String(summary.trusted),
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Under Review",
      value: String(summary.review),
      icon: AlertTriangle,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Blocked",
      value: String(summary.blocked),
      icon: Shield,
      color: "text-red-500 bg-red-50",
    },
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
            Device <span className="text-[#4253D1]">Inventory</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Every device enrolled by a member of your organization.
          </p>
        </div>
        <button
          onClick={() => orgId && load(orgId)}
          className="p-2 text-slate-400 hover:text-[#001633] border border-slate-100 rounded-lg hover:bg-slate-50 transition-all"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              className="p-6 bg-white border border-slate-100 rounded-[10px] flex flex-col justify-between shadow-sm"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold text-slate-400">
                    {s.label}
                  </p>
                  <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                    {s.value}
                  </h3>
                </div>
                <div
                  className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${s.color}`}
                >
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Device table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-50">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
            <Monitor size={14} className="text-slate-400" /> All Devices
          </h3>
          {search && (
            <span className="text-[10px] font-bold text-slate-400">
              Filtered by topbar search: &ldquo;{search}&rdquo;
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {[
                  "Name",
                  "Type",
                  "User",
                  "User Agent",
                  "Last Seen",
                  "Risk",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((device) => (
                <tr
                  key={device.id}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-3.5 font-bold text-[#001633] tracking-tight">
                    {device.name}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">{device.type}</td>
                  <td className="px-4 py-3.5 text-slate-600">{device.user}</td>
                  <td className="px-4 py-3.5 text-slate-500 max-w-[200px] truncate">
                    {device.os}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                    {timeAgo(device.lastSeen)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        device.risk === "Low"
                          ? "bg-emerald-50 text-emerald-600"
                          : device.risk === "Medium"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-red-50 text-red-500"
                      }`}
                    >
                      {device.risk}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        device.status === "Trusted"
                          ? "bg-emerald-50 text-emerald-600"
                          : device.status === "Review"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-red-50 text-red-500"
                      }`}
                    >
                      {device.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Smartphone size={28} className="text-slate-200" />
            <p className="text-xs font-bold">
              {assets.length === 0
                ? "No devices enrolled yet."
                : "No devices match your search."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
