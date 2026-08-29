"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Edit3,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Policy {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  coverage: number;
  updatedAt: string;
}

const CATEGORIES = ["All", "Security", "Data", "Access", "Governance"];
const NEW_CATEGORIES = ["Security", "Data", "Access", "Governance"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PoliciesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("All");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [summary, setSummary] = useState({ enforced: 0, partial: 0, draft: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(NEW_CATEGORIES[0]);
  const [status, setStatus] = useState("DRAFT");
  const [coverage, setCoverage] = useState(0);
  const [busy, setBusy] = useState(false);

  function load(id: string, category?: string) {
    setLoading(true);
    apiFetch(
      `/organizations/${id}/policies${category && category !== "All" ? `?category=${encodeURIComponent(category)}` : ""}`,
    )
      .then((res) => {
        setPolicies(res.policies ?? []);
        setSummary(res.summary ?? { enforced: 0, partial: 0, draft: 0 });
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

  useEffect(() => {
    if (orgId) load(orgId, cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/policies`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
        }),
      });
      setShowAdd(false);
      setName("");
      setDescription("");
      load(orgId, cat);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  function openEdit(p: Policy) {
    setEditing(p);
    setStatus(p.status);
    setCoverage(p.coverage);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !editing) return;
    setBusy(true);
    try {
      await apiFetch(`/organizations/${orgId}/policies/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, coverage }),
      });
      setEditing(null);
      load(orgId, cat);
    } catch {
    } finally {
      setBusy(false);
    }
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
            Org <span className="text-[#4253D1]">Policies</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Define and self-attest organization-wide policies.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white rounded-lg text-xs font-bold hover:bg-[#1A3060] transition-all"
        >
          <Plus size={14} /> New Policy
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Enforced",
            value: summary.enforced,
            icon: CheckCircle2,
            color: "#10B981",
          },
          {
            label: "Partial",
            value: summary.partial,
            icon: AlertTriangle,
            color: "#F59E0B",
          },
          {
            label: "Draft",
            value: summary.draft,
            icon: Clock,
            color: "#94A3B8",
          },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              className="p-6 bg-white border border-slate-100 rounded-[10px] shadow-sm flex items-center gap-4"
            >
              <div
                className="w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0"
                style={{ background: `${s.color}15`, color: s.color }}
              >
                <Icon size={20} />
              </div>
              <div>
                <h3 className="text-3xl font-bold text-[#001633] tracking-tight">
                  {s.value}
                </h3>
                <p className="text-[10px] font-bold text-slate-400">
                  {s.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c, i) => (
          <button
            key={i}
            onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
              cat === c
                ? "bg-[#4253D1] text-white border-[#4253D1]"
                : "bg-white text-slate-400 border-slate-200 hover:border-[#4253D1] hover:text-[#4253D1]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Policy list */}
      <div className="space-y-3">
        {policies.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-xl p-6">
            <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
              <FileText size={28} className="text-slate-200" />
              <p className="text-xs font-bold">
                No policies in this category
              </p>
            </div>
          </div>
        ) : (
          policies.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-4 p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl border border-blue-100 bg-blue-50 flex items-center justify-center shrink-0">
                <Shield size={16} className="text-[#4253D1]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-xs font-bold text-[#001633] tracking-tight">
                    {p.name}
                  </p>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      p.status === "ENFORCED"
                        ? "bg-emerald-50 text-emerald-600"
                        : p.status === "PARTIAL"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.status}
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#4253D1]">
                    {p.category}
                  </span>
                </div>
                {p.description && (
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {p.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-1 bg-slate-200 rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${p.coverage}%`,
                        background:
                          p.coverage === 100
                            ? "#10B981"
                            : p.coverage > 60
                              ? "#F59E0B"
                              : "#EF4444",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {p.coverage}% coverage
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-400 hidden md:block">
                  Updated {formatDate(p.updatedAt)}
                </span>
                <button
                  onClick={() => openEdit(p)}
                  className="p-1.5 text-slate-400 hover:text-[#4253D1] hover:bg-[#4253D1]/10 rounded-lg transition-all"
                >
                  <Edit3 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

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
              <FileText size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              New Policy
            </h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Policy name"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
              >
                {NEW_CATEGORIES.map((c) => (
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
                {busy ? "..." : "Create"}
              </button>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-lg p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setEditing(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Shield size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              {editing.name}
            </h3>
            <form onSubmit={saveEdit} className="space-y-4">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm"
              >
                <option value="DRAFT">Draft</option>
                <option value="PARTIAL">Partial</option>
                <option value="ENFORCED">Enforced</option>
              </select>
              <div>
                <label className="text-xs font-bold text-slate-400">
                  Coverage: {coverage}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={coverage}
                  onChange={(e) => setCoverage(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-[#001633] text-white text-sm font-semibold rounded-md hover:bg-[#4253D1] transition-colors disabled:opacity-50"
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
