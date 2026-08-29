"use client";

import { useEffect, useState } from "react";
import {
  Grid,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Integration {
  id: string;
  name: string;
  category: string;
  status: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

const CATEGORIES = [
  "SSO / Directory",
  "Dev Tools",
  "Communication",
  "Cloud",
  "Project Mgmt",
  "CRM",
  "Other",
];

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

export default function IntegrationsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [summary, setSummary] = useState({
    connected: 0,
    warning: 0,
    disconnected: 0,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [busy, setBusy] = useState(false);

  function load(id: string) {
    setLoading(true);
    apiFetch(`/organizations/${id}/integrations`)
      .then((res) => {
        setIntegrations(res.integrations ?? []);
        setSummary(
          res.summary ?? { connected: 0, warning: 0, disconnected: 0 },
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/integrations`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), category }),
      });
      setShowAdd(false);
      setName("");
      load(orgId);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(integ: Integration) {
    if (!orgId) return;
    const status = integ.status === "CONNECTED" ? "DISCONNECTED" : "CONNECTED";
    try {
      await apiFetch(`/organizations/${orgId}/integrations/${integ.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      load(orgId);
    } catch {}
  }

  async function remove(integ: Integration) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/integrations/${integ.id}`, {
        method: "DELETE",
      });
      setIntegrations((prev) => prev.filter((i) => i.id !== integ.id));
    } catch {}
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
            Connected <span className="text-[#4253D1]">Tools</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            A registry of tools connected to your organization.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white rounded-lg text-xs font-bold hover:bg-[#1A3060] transition-all"
        >
          <Plus size={14} /> Add Integration
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Connected",
            value: summary.connected,
            icon: CheckCircle2,
            color: "text-emerald-600 bg-emerald-50",
          },
          {
            label: "Warnings",
            value: summary.warning,
            icon: AlertTriangle,
            color: "text-amber-600 bg-amber-50",
          },
          {
            label: "Disconnected",
            value: summary.disconnected,
            icon: X,
            color: "text-red-500 bg-red-50",
          },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              className="p-6 bg-white border border-slate-100 rounded-[10px] shadow-sm"
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
                  <Icon size={20} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Integration cards */}
      {integrations.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl p-6">
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Grid size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No integrations added yet</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              Add a tool to start tracking its connection status.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((integ) => (
            <div
              key={integ.id}
              className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-[8px] flex items-center justify-center bg-[#4253D1] text-white text-sm font-semibold">
                  {integ.name.charAt(0)}
                </div>
                <div className="flex items-center gap-2">
                  {integ.status === "CONNECTED" ? (
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  ) : integ.status === "WARNING" ? (
                    <AlertTriangle size={14} className="text-amber-500" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-300" />
                  )}
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      integ.status === "CONNECTED"
                        ? "bg-emerald-50 text-emerald-600"
                        : integ.status === "WARNING"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {integ.status === "CONNECTED"
                      ? "Connected"
                      : integ.status === "WARNING"
                        ? "Warning"
                        : "Disconnected"}
                  </span>
                </div>
              </div>
              <p className="text-xs font-bold text-[#001633] tracking-tight">
                {integ.name}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {integ.category}
              </p>
              <div className="mt-4 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <RefreshCw size={9} /> {timeAgo(integ.lastSyncAt)}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => toggleStatus(integ)}
                  className="flex-1 py-2 border border-slate-100 text-[10px] font-bold text-slate-400 hover:text-[#001633] hover:border-slate-200 rounded-lg transition-all"
                >
                  {integ.status === "CONNECTED" ? "Disconnect" : "Connect"}
                </button>
                <button
                  onClick={() => remove(integ)}
                  className="p-2 border border-slate-100 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-lg p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setShowAdd(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Grid size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              Add Integration
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Records a connection to track. There's no live OAuth handshake —
              mark it connected once you've set it up on your end.
            </p>
            <form onSubmit={handleAdd} className="space-y-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tool name (e.g. Slack)"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-md hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {busy ? "..." : "Add"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
