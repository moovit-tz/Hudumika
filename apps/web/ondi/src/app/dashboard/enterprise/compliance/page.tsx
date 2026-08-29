"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  CheckCircle2,
  Clock,
  Download,
  Shield,
  Edit3,
  X,
  AlertTriangle,
  Users2,
  ClipboardList,
  Building2,
  Plus,
  Loader2,
} from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api";
import { Sk } from "@/components/Skeleton";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Framework {
  id: string;
  framework: string;
  status: string;
  score: number;
  expiresAt: string | null;
}
interface ComplianceEvent {
  id: string;
  action: string;
  severity: string;
  metadata: any;
  timestamp: string;
}

const STATUS_COLOR: Record<string, string> = {
  CERTIFIED: "#10B981",
  COMPLIANT: "#10B981",
  IN_PROGRESS: "#4253D1",
  NOT_STARTED: "#EF4444",
};
const STATUS_LABEL: Record<string, string> = {
  CERTIFIED: "Certified",
  COMPLIANT: "Compliant",
  IN_PROGRESS: "In Progress",
  NOT_STARTED: "Not Started",
};
const STATUS_BADGE_CLASS: Record<string, string> = {
  CERTIFIED: "bg-emerald-50 text-emerald-600",
  COMPLIANT: "bg-emerald-50 text-emerald-600",
  IN_PROGRESS: "bg-blue-50 text-[#4253D1]",
  NOT_STARTED: "bg-red-50 text-red-500",
};

function describeEvent(e: ComplianceEvent): string {
  const m = e.metadata || {};
  switch (e.action) {
    case "KYB_SUBMITTED":
      return "KYB verification submitted";
    case "KYB_VERIFIED":
      return "KYB verification approved";
    case "KYB_REJECTED":
      return "KYB verification rejected";
    case "DIRECTOR_ADDED":
      return `Director added${m.name ? `: ${m.name}` : ""}`;
    case "DIRECTOR_VERIFIED":
      return "Director identity verified";
    case "ADMIN_UPDATE":
      return m.framework
        ? `${m.framework} status updated`
        : "Compliance record updated";
    default:
      return e.action.replace(/_/g, " ").toLowerCase();
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CompliancePage() {
  const [tab, setTab] = useState<"frameworks" | "pdpa">("frameworks");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [complianceRate, setComplianceRate] = useState(0);
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [editing, setEditing] = useState<Framework | null>(null);
  const [editStatus, setEditStatus] = useState("NOT_STARTED");
  const [editScore, setEditScore] = useState(0);
  const [busy, setBusy] = useState(false);

  function load(id: string) {
    setLoading(true);
    Promise.all([
      apiFetch(`/organizations/${id}/compliance/frameworks`)
        .then((res) => {
          setFrameworks(res.frameworks ?? []);
          setComplianceRate(res.complianceRate ?? 0);
        })
        .catch(() => {}),
      apiFetch(`/organizations/${id}/compliance/events`)
        .then((res) => setEvents(res.events ?? []))
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

  async function handleExport() {
    if (!orgId) return;
    try {
      await downloadFile(
        `/organizations/${orgId}/activity/export`,
        "ondi-compliance-report.csv",
      );
    } catch {}
  }

  function openEdit(f: Framework) {
    setEditing(f);
    setEditStatus(f.status);
    setEditScore(f.score);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !editing) return;
    setBusy(true);
    try {
      await apiFetch(
        `/organizations/${orgId}/compliance/frameworks/${editing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: editStatus, score: editScore }),
        },
      );
      setEditing(null);
      load(orgId);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px] flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[#4253D1]" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px]">
        <div className="bg-white border border-slate-100 rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center text-[#4253D1]">
            <Building2 size={20} />
          </div>
          <p className="text-xs font-bold text-[#001633]">
            No organization selected
          </p>
          <p className="text-[10px] text-slate-400 max-w-xs">
            Select an organization from the workspace switcher to view
            compliance data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Compliance <span className="text-[#4253D1]">Dashboard</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            {tab === "frameworks"
              ? `Self-attested framework status — ${complianceRate}% average across ${frameworks.length} framework${frameworks.length === 1 ? "" : "s"}.`
              : "Your organization's real PDPA compliance program — processing register, rights requests, incidents, deadlines, and vendor risk."}
          </p>
        </div>
        {tab === "frameworks" && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white rounded-lg text-xs font-bold hover:bg-[#1A3060] transition-all"
          >
            <Download size={14} /> Export Report
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-slate-50 border border-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("frameworks")}
          className={`px-4 py-2 rounded-[8px] text-xs font-bold transition-all ${tab === "frameworks" ? "bg-white text-[#4253D1] shadow-sm" : "text-slate-500"}`}
        >
          Frameworks
        </button>
        <button
          onClick={() => setTab("pdpa")}
          className={`px-4 py-2 rounded-[8px] text-xs font-bold transition-all ${tab === "pdpa" ? "bg-white text-[#4253D1] shadow-sm" : "text-slate-500"}`}
        >
          PDPA Program
        </button>
      </div>

      {tab === "frameworks" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {frameworks.map((f) => (
              <button
                key={f.id}
                onClick={() => openEdit(f)}
                className="text-left bg-white border border-slate-100 rounded-[10px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-4">
                  <Shield size={18} style={{ color: STATUS_COLOR[f.status] }} />
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[f.status] ?? "bg-slate-100 text-slate-500"}`}
                  >
                    {STATUS_LABEL[f.status]}
                  </span>
                </div>
                <p className="text-xs font-bold text-[#001633]">
                  {f.framework}
                </p>
                {f.expiresAt && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Expires: {formatDate(f.expiresAt)}
                  </p>
                )}
                <div className="mt-3 h-1.5 bg-slate-100 rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${f.score}%`,
                      background: STATUS_COLOR[f.status],
                    }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  {f.score}% score <Edit3 size={9} className="ml-auto" />
                </p>
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-6">
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
              <Clock size={14} className="text-slate-400" /> Recent Compliance
              Events
            </h3>
            {events.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
                <Clock size={28} className="text-slate-200" />
                <p className="text-xs font-bold">
                  No regulatory events recorded yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl"
                  >
                    <CheckCircle2
                      size={14}
                      className="text-emerald-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#001633]">
                        {describeEvent(e)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {formatDate(e.timestamp)}
                      </p>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {e.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <PdpaProgram orgId={orgId} />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-xl p-8 w-full max-w-md relative shadow-xl">
            <button
              onClick={() => setEditing(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <Shield size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg mb-2">
              {editing.framework}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Self-attest this framework's current status.
            </p>
            <form onSubmit={saveEdit} className="space-y-4">
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
              >
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLIANT">Compliant</option>
                <option value="CERTIFIED">Certified</option>
              </select>
              <div>
                <label className="text-[10px] font-bold text-slate-400">
                  Score: {editScore}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={editScore}
                  onChange={(e) => setEditScore(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-[#001633] text-white text-xs font-bold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
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

// ─── PDPA Program tab ──────────────────────────────────────────────────────────

interface Overview {
  activeActivities: number;
  openRightsRequests: number;
  overdueRightsRequests: number;
  openIncidents: number;
  upcomingAlerts: number;
  highRiskVendors: number;
  maturity: {
    level: string;
    score: number;
    maxScore: number;
    completedAt: string;
  } | null;
}
interface ProcessingActivity {
  id: string;
  name: string;
  legalBasis: string;
  dataCategories: string[];
  purposes: string[];
  retentionMonths: number | null;
  isActive: boolean;
}
interface RightsRequest {
  id: string;
  requestType: string;
  subjectName: string;
  subjectEmail: string;
  status: string;
  deadlineAt: string;
}
interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  detectedAt: string;
  affectedCount: number | null;
}
interface Vendor {
  id: string;
  name: string;
  riskLevel: string;
  status: string;
  hasDpa: boolean;
}

const RISK_BADGE_CLASS: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-600",
  MEDIUM: "bg-amber-50 text-amber-600",
  HIGH: "bg-red-50 text-red-500",
  CRITICAL: "bg-red-100 text-red-700",
};

function PdpaProgram({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activities, setActivities] = useState<ProcessingActivity[]>([]);
  const [rightsRequests, setRightsRequests] = useState<RightsRequest[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [modal, setModal] = useState<
    "activity" | "rights" | "incident" | "vendor" | null
  >(null);
  const [busy, setBusy] = useState(false);

  function loadAll() {
    setLoading(true);
    Promise.all([
      apiFetch(`/organizations/${orgId}/compliance/pdpa/overview`)
        .then(setOverview)
        .catch(() => {}),
      apiFetch(`/organizations/${orgId}/compliance/pdpa/processing-activities`)
        .then((r) => setActivities(r.activities ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${orgId}/compliance/pdpa/rights-requests`)
        .then((r) => setRightsRequests(r.requests ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${orgId}/compliance/pdpa/incidents`)
        .then((r) => setIncidents(r.incidents ?? []))
        .catch(() => {}),
      apiFetch(`/organizations/${orgId}/compliance/pdpa/vendors`)
        .then((r) => setVendors(r.vendors ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
  }, [orgId]);

  async function submitActivity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(
        `/organizations/${orgId}/compliance/pdpa/processing-activities`,
        {
          method: "POST",
          body: JSON.stringify({
            name: f.get("name"),
            legalBasis: f.get("legalBasis"),
            dataCategories: String(f.get("dataCategories") || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            purposes: String(f.get("purposes") || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            dataSubjects: String(f.get("dataSubjects") || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            retentionMonths: Number(f.get("retentionMonths")) || undefined,
          }),
        },
      );
      setModal(null);
      loadAll();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function submitRights(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(
        `/organizations/${orgId}/compliance/pdpa/rights-requests`,
        {
          method: "POST",
          body: JSON.stringify({
            requestType: f.get("requestType"),
            subjectName: f.get("subjectName"),
            subjectEmail: f.get("subjectEmail"),
            description: f.get("description"),
          }),
        },
      );
      setModal(null);
      loadAll();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function submitIncident(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(`/organizations/${orgId}/compliance/pdpa/incidents`, {
        method: "POST",
        body: JSON.stringify({
          title: f.get("title"),
          description: f.get("description"),
          severity: f.get("severity"),
          affectedDataTypes: String(f.get("affectedDataTypes") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          affectedCount: Number(f.get("affectedCount")) || undefined,
        }),
      });
      setModal(null);
      loadAll();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function submitVendor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(`/organizations/${orgId}/compliance/pdpa/vendors`, {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          riskLevel: f.get("riskLevel"),
          services: String(f.get("services") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          dataShared: String(f.get("dataShared") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setModal(null);
      loadAll();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-100 rounded-[10px] p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <Sk className="h-2 w-16" />
                <Sk className="w-9 h-9 rounded-[8px]" />
              </div>
              <Sk className="h-7 w-10" />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white border border-slate-100 rounded-xl p-6 space-y-4"
          >
            <div className="flex justify-between items-center">
              <Sk className="h-3 w-40" />
              <Sk className="h-6 w-16 rounded-full" />
            </div>
            {[1, 2].map((j) => (
              <div
                key={j}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
              >
                <div className="space-y-1.5">
                  <Sk className="h-3 w-36" />
                  <Sk className="h-2 w-24" />
                </div>
                <Sk className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );

  const stat = (
    label: string,
    value: number,
    icon: React.ReactNode,
    warn?: boolean,
  ) => (
    <div className="bg-white border border-slate-100 rounded-[10px] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold text-slate-400">{label}</p>
        <div
          className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${warn && value > 0 ? "bg-red-50 text-red-500" : "bg-blue-50 text-[#4253D1]"}`}
        >
          {icon}
        </div>
      </div>
      <h3 className="text-3xl font-bold text-[#001633] mt-3 tracking-tight">
        {value}
      </h3>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat(
          "Active Processing Activities",
          overview?.activeActivities ?? 0,
          <ClipboardList size={16} />,
        )}
        {stat(
          "Open Rights Requests",
          overview?.openRightsRequests ?? 0,
          <Users2 size={16} />,
        )}
        {stat(
          "Overdue Requests",
          overview?.overdueRightsRequests ?? 0,
          <AlertTriangle size={16} />,
          true,
        )}
        {stat(
          "Open Incidents",
          overview?.openIncidents ?? 0,
          <AlertTriangle size={16} />,
          true,
        )}
        {stat(
          "Upcoming Deadlines",
          overview?.upcomingAlerts ?? 0,
          <Clock size={16} />,
        )}
        {stat(
          "High-Risk Vendors",
          overview?.highRiskVendors ?? 0,
          <Building2 size={16} />,
          true,
        )}
      </div>

      {overview?.maturity && (
        <div className="bg-white border border-slate-100 rounded-xl p-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-bold">
              PDPA Maturity
            </p>
            <p className="text-xl font-bold text-[#001633] mt-1 tracking-tight">
              {overview.maturity.level}
            </p>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            {overview.maturity.score}/{overview.maturity.maxScore} points —{" "}
            {formatDate(overview.maturity.completedAt)}
          </p>
        </div>
      )}

      <Section
        title="Processing Activity Register"
        onAdd={() => setModal("activity")}
      >
        {activities.length === 0 ? (
          <Empty text="No processing activities logged yet." />
        ) : (
          <div className="space-y-2">
            {activities.map((a) => (
              <div
                key={a.id}
                className="p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <p className="text-xs font-bold text-[#001633]">{a.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {a.legalBasis} · {a.dataCategories.join(", ")} ·{" "}
                  {a.retentionMonths
                    ? `${a.retentionMonths}mo retention`
                    : "no retention set"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Data Subject Rights Requests"
        onAdd={() => setModal("rights")}
      >
        {rightsRequests.length === 0 ? (
          <Empty text="No rights requests logged yet." />
        ) : (
          <div className="space-y-2">
            {rightsRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <div>
                  <p className="text-xs font-bold text-[#001633]">
                    {r.requestType} — {r.subjectName}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {r.subjectEmail} · due {formatDate(r.deadlineAt)}
                  </p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Incidents" onAdd={() => setModal("incident")}>
        {incidents.length === 0 ? (
          <Empty text="No incidents logged." />
        ) : (
          <div className="space-y-2">
            {incidents.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <div>
                  <p className="text-xs font-bold text-[#001633]">{i.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Detected {formatDate(i.detectedAt)}
                    {i.affectedCount ? ` · ${i.affectedCount} affected` : ""}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${RISK_BADGE_CLASS[i.severity] ?? "bg-slate-100 text-slate-500"}`}
                >
                  {i.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Vendors & Third Parties" onAdd={() => setModal("vendor")}>
        {vendors.length === 0 ? (
          <Empty text="No vendors logged yet." />
        ) : (
          <div className="space-y-2">
            {vendors.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <div>
                  <p className="text-xs font-bold text-[#001633]">{v.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {v.hasDpa ? "DPA on file" : "No DPA on file"}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${RISK_BADGE_CLASS[v.riskLevel] ?? "bg-slate-100 text-slate-500"}`}
                >
                  {v.riskLevel}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {modal === "activity" && (
        <Modal title="Log Processing Activity" onClose={() => setModal(null)}>
          <form onSubmit={submitActivity} className="space-y-3">
            <Input
              name="name"
              placeholder="Activity name (e.g. Customer Onboarding KYC)"
              required
            />
            <Input
              name="legalBasis"
              placeholder="Legal basis (e.g. Consent, Legal obligation)"
              required
            />
            <Input
              name="dataCategories"
              placeholder="Data categories, comma-separated"
              required
            />
            <Input
              name="purposes"
              placeholder="Purposes, comma-separated"
              required
            />
            <Input
              name="dataSubjects"
              placeholder="Data subjects, comma-separated (e.g. customers)"
              required
            />
            <Input
              name="retentionMonths"
              type="number"
              placeholder="Retention (months)"
            />
            <SubmitButton busy={busy} />
          </form>
        </Modal>
      )}
      {modal === "rights" && (
        <Modal title="Log Rights Request" onClose={() => setModal(null)}>
          <form onSubmit={submitRights} className="space-y-3">
            <select
              name="requestType"
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
            >
              <option value="ACCESS">Access</option>
              <option value="RECTIFICATION">Rectification</option>
              <option value="ERASURE">Erasure</option>
              <option value="RESTRICTION">Restriction</option>
              <option value="PORTABILITY">Portability</option>
              <option value="OBJECTION">Objection</option>
            </select>
            <Input name="subjectName" placeholder="Subject name" required />
            <Input
              name="subjectEmail"
              type="email"
              placeholder="Subject email"
              required
            />
            <Input name="description" placeholder="Description" required />
            <SubmitButton busy={busy} />
          </form>
        </Modal>
      )}
      {modal === "incident" && (
        <Modal title="Log Incident" onClose={() => setModal(null)}>
          <form onSubmit={submitIncident} className="space-y-3">
            <Input name="title" placeholder="Incident title" required />
            <Input name="description" placeholder="Description" required />
            <select
              name="severity"
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <Input
              name="affectedDataTypes"
              placeholder="Affected data types, comma-separated"
              required
            />
            <Input
              name="affectedCount"
              type="number"
              placeholder="Number of people affected"
            />
            <SubmitButton busy={busy} />
          </form>
        </Modal>
      )}
      {modal === "vendor" && (
        <Modal title="Add Vendor" onClose={() => setModal(null)}>
          <form onSubmit={submitVendor} className="space-y-3">
            <Input name="name" placeholder="Vendor name" required />
            <Input name="services" placeholder="Services, comma-separated" />
            <Input
              name="dataShared"
              placeholder="Data shared, comma-separated"
            />
            <select
              name="riskLevel"
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <SubmitButton busy={busy} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Section({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-[#001633]">{title}</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4253D1]/10 text-[#4253D1] rounded-full text-[10px] font-bold hover:bg-[#4253D1]/20 transition-all"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="py-10 flex flex-col items-center text-slate-400 gap-2">
      <p className="text-xs font-bold">{text}</p>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-100 rounded-xl p-8 w-full max-w-md relative shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50"
        >
          <X size={16} />
        </button>
        <h3 className="font-bold text-[#001633] text-lg mb-6">{title}</h3>
        {children}
      </div>
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#4253D1] transition-all"
    />
  );
}
function SubmitButton({ busy }: { busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full py-2.5 bg-[#001633] text-white text-xs font-bold rounded-lg hover:bg-[#4253D1] transition-colors disabled:opacity-50"
    >
      {busy ? "Saving..." : "Save"}
    </button>
  );
}
