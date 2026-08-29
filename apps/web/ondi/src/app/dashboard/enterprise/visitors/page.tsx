"use client";

import { useEffect, useState } from "react";
import {
  Users,
  LogOut,
  QrCode,
  Trash2,
  Settings,
  X,
  Copy,
  Check,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Visit {
  id: string;
  visitorName: string;
  visitorPhone: string;
  hostName: string | null;
  company: string | null;
  purpose: string;
  status: string;
  checkedInAt: string;
  checkedOutAt: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VisitorLogbookPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [currentlyIn, setCurrentlyIn] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function load(id: string) {
    setLoading(true);
    Promise.all([
      apiFetch(`/organizations/${id}/visitors`)
        .then((r) => {
          setVisits(r.visits ?? []);
          setCurrentlyIn(r.currentlyIn ?? 0);
        })
        .catch(() => {}),
      apiFetch(`/organizations/${id}/visitors/settings`)
        .then((r) => setRetentionDays(r.retentionDays ?? 90))
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

  async function checkOut(visitId: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/visitors/${visitId}/check-out`, {
        method: "POST",
      });
      load(orgId);
    } catch {}
  }

  async function purgeExpired() {
    if (!orgId) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/organizations/${orgId}/visitors/purge`, {
        method: "POST",
      });
      load(orgId);
      alert(`Purged ${res.purged} record(s) past the retention window.`);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function saveRetention(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/visitors/settings`, {
        method: "PATCH",
        body: JSON.stringify({ retentionDays }),
      });
      setSettingsOpen(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  const kioskUrl = orgId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/visit/${orgId}`
    : "";

  function copyKioskUrl() {
    if (!kioskUrl) return;
    navigator.clipboard.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading)
    return (
      <div className="p-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#4253D1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!orgId)
    return (
      <div className="p-6 lg:p-10 max-w-[1400px] text-center text-sm text-slate-500">
        No organization selected.
      </div>
    );

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Reception <span className="text-[#4253D1]">Register</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            PDPA-secured digital check-in — records auto-purge after{" "}
            {retentionDays} days.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all"
          >
            <Settings size={14} /> Retention
          </button>
          <button
            onClick={purgeExpired}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all disabled:opacity-50"
          >
            <Trash2 size={14} /> Purge Expired
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-[10px] p-5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400">
            Currently On-Site
          </p>
          <p className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
            {currentlyIn}
          </p>
        </div>
        <div className="bg-white border border-slate-100 rounded-[10px] p-5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400">
            Recent Visits Logged
          </p>
          <p className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
            {visits.length}
          </p>
        </div>
        <div className="bg-[#001633] rounded-lg p-5 shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-white/50 font-bold flex items-center gap-1.5">
              <QrCode size={12} /> Kiosk Check-In Link
            </p>
            <p className="text-xs text-white truncate mt-1">{kioskUrl}</p>
          </div>
          <button
            onClick={copyKioskUrl}
            className="shrink-0 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
          >
            {copied ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Copy size={14} className="text-white" />
            )}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl p-6">
        <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
          <Users size={14} className="text-slate-400" />
          Visit Log
        </h3>
        {visits.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Users size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No visits logged yet</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              Share the kiosk link above at your front desk to start logging
              visitors.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#001633]">
                    {v.visitorName}
                    {v.company ? ` — ${v.company}` : ""}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {v.purpose}
                    {v.hostName ? ` · Visiting ${v.hostName}` : ""} ·{" "}
                    {v.visitorPhone}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    In: {formatTime(v.checkedInAt)}
                    {v.checkedOutAt
                      ? ` · Out: ${formatTime(v.checkedOutAt)}`
                      : ""}
                  </p>
                </div>
                {v.status === "CHECKED_IN" ? (
                  <button
                    onClick={() => checkOut(v.id)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#4253D1]/10 text-[#4253D1] rounded-full text-[10px] font-bold hover:bg-[#4253D1]/20 transition-all"
                  >
                    <LogOut size={12} /> Check Out
                  </button>
                ) : (
                  <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    Checked Out
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-lg p-8 w-full max-w-sm relative shadow-xl">
            <button
              onClick={() => setSettingsOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <h3 className="font-bold text-[#001633] text-lg mb-6">
              Retention Window
            </h3>
            <form onSubmit={saveRetention} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400">
                  Auto-purge after: {retentionDays} days
                </label>
                <input
                  type="range"
                  min={1}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
