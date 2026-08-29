"use client";

import { useEffect, useState } from "react";
import { Scale, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Sk } from "@/components/Skeleton";

interface RightsRequest {
  id: string;
  requestType: string;
  targetOrgName: string;
  description: string;
  status: string;
  deadlineAt: string;
  responseNotes: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#F59E0B",
  IN_PROGRESS: "#4253D1",
  FULFILLED: "#10B981",
  REJECTED: "#EF4444",
  EXPIRED: "#94A3B8",
};

export default function PrivacyRightsPage() {
  const [requests, setRequests] = useState<RightsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    apiFetch("/compliance/rights-requests")
      .then((r) => setRequests(r.requests ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch("/compliance/rights-requests", {
        method: "POST",
        body: JSON.stringify({
          requestType: f.get("requestType"),
          targetOrgName: f.get("targetOrgName"),
          description: f.get("description"),
        }),
      });
      setModalOpen(false);
      load();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 lg:p-12 max-w-4xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Know Your <span className="text-[#4253D1]">Rights</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Track requests you've made to any organization about your personal
            data — access, correction, deletion, or objection — under Tanzania's
            PDPA (or an equivalent data protection law).
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white rounded-lg text-xs font-bold hover:bg-[#1A3060] transition-all shrink-0"
        >
          <Plus size={14} /> New Request
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-100 rounded-lg shadow-sm divide-y divide-slate-50">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Sk className="h-3.5 w-52" />
                <Sk className="h-3 w-72" />
                <Sk className="h-2.5 w-24" />
              </div>
              <Sk className="h-5 w-20 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-lg p-12 shadow-sm text-center">
          <Scale size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            No requests logged yet. Start one when you want to ask an
            organization about the data they hold on you.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-lg shadow-sm divide-y divide-slate-50">
          {requests.map((r) => (
            <div
              key={r.id}
              className="p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#001633]">
                  {r.requestType} — {r.targetOrgName}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {r.description}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Due {formatDate(r.deadlineAt)}
                </p>
                {r.responseNotes && (
                  <p className="text-[11px] text-slate-600 mt-2 bg-slate-50 rounded-lg p-2">
                    {r.responseNotes}
                  </p>
                )}
              </div>
              <span
                className="text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0"
                style={{
                  color: STATUS_COLOR[r.status],
                  borderColor: `${STATUS_COLOR[r.status]}40`,
                  background: `${STATUS_COLOR[r.status]}10`,
                }}
              >
                {r.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-lg p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <h3 className="font-bold text-[#001633] text-lg mb-6">
              New Rights Request
            </h3>
            <form onSubmit={submit} className="space-y-3">
              <select
                name="requestType"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
              >
                <option value="ACCESS">Access — what data do they hold?</option>
                <option value="RECTIFICATION">
                  Rectification — fix incorrect data
                </option>
                <option value="ERASURE">Erasure — delete my data</option>
                <option value="RESTRICTION">
                  Restriction — limit how it's used
                </option>
                <option value="PORTABILITY">
                  Portability — get a copy to move elsewhere
                </option>
                <option value="OBJECTION">
                  Objection — stop a specific use
                </option>
              </select>
              <input
                name="targetOrgName"
                placeholder="Organization name"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
              />
              <textarea
                name="description"
                placeholder="What are you asking for?"
                required
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-[#4253D1] text-white text-sm font-bold rounded-full hover:bg-[#1A3060] transition-all disabled:opacity-50"
              >
                {busy ? "Saving..." : "Log Request"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
