"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  Eye,
  CheckCircle2,
  Shield,
  Plus,
  Trash2,
  X,
  Globe,
  RefreshCw,
  Zap,
  Webhook,
  Download,
} from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api";
import { Sk } from "@/components/Skeleton";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface Metrics {
  mfaCoveragePct: number;
  mfaEnrolled: number;
  totalMembers: number;
  staleAccounts: number;
  openAlerts: number;
  avgResponseMins: number | null;
}
interface Alert {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  user: string;
  time: string;
}
interface SecurityPolicy {
  id: string;
  name: string;
  status: string;
  coverage: number;
}
interface OrgSecuritySettings {
  mfaRequired: boolean;
  sessionTimeoutMins: number;
  ipAllowlist: string[];
}
interface SamlSp {
  id: string;
  name: string;
  entityId: string;
  acsUrl: string;
  sloUrl: string | null;
  createdAt: string;
}
interface AccessPolicy {
  id: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  clientId: string | null;
  conditions: {
    minTrustTier?: string;
    requireTrustedDevice?: boolean;
    blockOnNewDevice?: boolean;
    matchRiskFactors?: string[];
  };
  action: "FLAG" | "BLOCK" | "STEP_UP";
}
interface SiemConfig {
  id: string;
  url: string;
  eventTypes: string[];
  isEnabled: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
  secretHint: string;
}
interface AuthentikMember {
  userId: string;
  name: string;
  status: "provisioned" | "deprovisioned" | "never_provisioned";
  lastEventAt: string | null;
}

export default function SecurityCenterPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [policies, setPolicies] = useState<SecurityPolicy[]>([]);

  // ── Org security settings (real, GET/PATCH /organizations/:id/security/settings) ──
  const [settings, setSettings] = useState<OrgSecuritySettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ipAllowlistText, setIpAllowlistText] = useState("");

  // ── SAML SP registry (real, org-owned — services/ondi-api/src/routes/saml.ts
  //    does its own per-org auth, so this is a direct apiFetch call like
  //    everything else on this page) ──
  const [samlSps, setSamlSps] = useState<SamlSp[] | null>(null);
  const [samlError, setSamlError] = useState("");
  const [showAddSp, setShowAddSp] = useState(false);
  const [spForm, setSpForm] = useState({
    name: "",
    entityId: "",
    acsUrl: "",
    sloUrl: "",
  });
  const [spSaving, setSpSaving] = useState(false);

  // ── Conditional / adaptive access policies (real, /security/access-policies CRUD) ──
  const [accessPolicies, setAccessPolicies] = useState<AccessPolicy[]>([]);
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    name: "",
    action: "STEP_UP" as "FLAG" | "BLOCK" | "STEP_UP",
    minTrustTier: "",
    requireTrustedDevice: false,
    blockOnNewDevice: false,
  });
  const [policySaving, setPolicySaving] = useState(false);

  // ── SIEM / webhook export (real, /security/siem CRUD) ──
  const [siemConfigs, setSiemConfigs] = useState<SiemConfig[]>([]);
  const [showAddSiem, setShowAddSiem] = useState(false);
  const [siemUrl, setSiemUrl] = useState("");
  const [siemSaving, setSiemSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // ── Authentik provisioning status (real, /security/authentik-status) ──
  const [authentikConnected, setAuthentikConnected] = useState(false);
  const [authentikMembers, setAuthentikMembers] = useState<AuthentikMember[]>(
    [],
  );
  const [reprovisioningId, setReprovisioningId] = useState<string | null>(
    null,
  );

  function loadAuthentikStatus(id: string) {
    apiFetch(`/organizations/${id}/security/authentik-status`)
      .then((res) => {
        setAuthentikConnected(!!res.connected);
        setAuthentikMembers(res.members ?? []);
      })
      .catch(() => {});
  }

  async function reprovision(memberId: string) {
    if (!orgId) return;
    setReprovisioningId(memberId);
    try {
      await apiFetch(
        `/organizations/${orgId}/security/authentik-status/${memberId}/reprovision`,
        { method: "POST" },
      );
      loadAuthentikStatus(orgId);
    } catch {
    } finally {
      setReprovisioningId(null);
    }
  }

  function loadAccessPolicies(id: string) {
    apiFetch(`/organizations/${id}/security/access-policies`)
      .then((res) => setAccessPolicies(res.policies ?? []))
      .catch(() => {});
  }

  function loadSiem(id: string) {
    apiFetch(`/organizations/${id}/security/siem`)
      .then((res) => setSiemConfigs(res.configs ?? []))
      .catch(() => {});
  }

  async function handleAddPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !policyForm.name.trim()) return;
    setPolicySaving(true);
    try {
      const conditions: Record<string, unknown> = {};
      if (policyForm.minTrustTier)
        conditions.minTrustTier = policyForm.minTrustTier;
      if (policyForm.requireTrustedDevice)
        conditions.requireTrustedDevice = true;
      if (policyForm.blockOnNewDevice) conditions.blockOnNewDevice = true;
      await apiFetch(`/organizations/${orgId}/security/access-policies`, {
        method: "POST",
        body: JSON.stringify({
          name: policyForm.name.trim(),
          action: policyForm.action,
          conditions,
        }),
      });
      setShowAddPolicy(false);
      setPolicyForm({
        name: "",
        action: "STEP_UP",
        minTrustTier: "",
        requireTrustedDevice: false,
        blockOnNewDevice: false,
      });
      loadAccessPolicies(orgId);
    } catch {
    } finally {
      setPolicySaving(false);
    }
  }

  async function togglePolicy(policyId: string, isEnabled: boolean) {
    if (!orgId) return;
    try {
      await apiFetch(
        `/organizations/${orgId}/security/access-policies/${policyId}`,
        { method: "PATCH", body: JSON.stringify({ isEnabled }) },
      );
      loadAccessPolicies(orgId);
    } catch {}
  }

  async function removePolicy(policyId: string) {
    if (!orgId) return;
    try {
      await apiFetch(
        `/organizations/${orgId}/security/access-policies/${policyId}`,
        { method: "DELETE" },
      );
      loadAccessPolicies(orgId);
    } catch {}
  }

  async function handleAddSiem(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !siemUrl.trim()) return;
    setSiemSaving(true);
    try {
      const res = await apiFetch(`/organizations/${orgId}/security/siem`, {
        method: "POST",
        body: JSON.stringify({ url: siemUrl.trim(), eventTypes: [] }),
      });
      setNewSecret(res.secret);
      setSiemUrl("");
      loadSiem(orgId);
    } catch {
    } finally {
      setSiemSaving(false);
    }
  }

  async function toggleSiem(configId: string, isEnabled: boolean) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/security/siem/${configId}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled }),
      });
      loadSiem(orgId);
    } catch {}
  }

  async function removeSiem(configId: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/organizations/${orgId}/security/siem/${configId}`, {
        method: "DELETE",
      });
      loadSiem(orgId);
    } catch {}
  }

  async function testSiem(configId: string) {
    if (!orgId) return;
    setTestingId(configId);
    try {
      await apiFetch(`/organizations/${orgId}/security/siem/${configId}/test`, {
        method: "POST",
      });
      setTimeout(() => loadSiem(orgId), 1500);
    } catch {
    } finally {
      setTestingId(null);
    }
  }

  function loadSettings(id: string) {
    apiFetch<OrgSecuritySettings>(`/organizations/${id}/security/settings`)
      .then((res) => {
        setSettings(res);
        setIpAllowlistText((res.ipAllowlist ?? []).join(", "));
      })
      .catch(() => {});
  }

  function loadSaml(id: string) {
    setSamlError("");
    apiFetch(`/saml/service-providers?organizationId=${id}`)
      .then((res) => setSamlSps(Array.isArray(res) ? res : []))
      .catch((err) =>
        setSamlError(
          err.message === "insufficient_permission"
            ? "Only Owners and Admins can manage SAML service providers."
            : "Could not load SAML service providers.",
        ),
      );
  }

  async function handleSaveSettings() {
    if (!orgId || !settings) return;
    setSettingsSaving(true);
    try {
      const ipAllowlist = ipAllowlistText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch(`/organizations/${orgId}/security/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          mfaRequired: settings.mfaRequired,
          sessionTimeoutMins: settings.sessionTimeoutMins,
          ipAllowlist,
        }),
      });
      loadSettings(orgId);
    } catch {
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleAddSp(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSpSaving(true);
    setSamlError("");
    try {
      await apiFetch("/saml/service-providers", {
        method: "POST",
        body: JSON.stringify({
          organizationId: orgId,
          ...spForm,
          sloUrl: spForm.sloUrl || undefined,
        }),
      });
      setShowAddSp(false);
      setSpForm({ name: "", entityId: "", acsUrl: "", sloUrl: "" });
      loadSaml(orgId);
    } catch (err: any) {
      setSamlError(
        err.message === "entity_id_already_registered"
          ? "That Entity ID is already registered."
          : "Could not register service provider.",
      );
    } finally {
      setSpSaving(false);
    }
  }

  async function handleDeleteSp(id: string) {
    if (!orgId) return;
    try {
      await apiFetch(`/saml/service-providers/${id}`, { method: "DELETE" });
      loadSaml(orgId);
    } catch {
      setSamlError("Could not remove service provider.");
    }
  }

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    setOrgId(id);
    apiFetch(`/organizations/${id}/security/overview`)
      .then((res) => {
        setMetrics(res.metrics);
        setAlerts(res.alerts ?? []);
        setPolicies(res.policies ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadSettings(id);
    loadSaml(id);
    loadAccessPolicies(id);
    loadSiem(id);
    loadAuthentikStatus(id);
  }, []);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <Sk className="h-6 w-40 rounded-full" />
            <Sk className="h-8 w-64" />
            <Sk className="h-3 w-80" />
          </div>
          <Sk className="h-9 w-40 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-[10px] shadow-sm">
              <div className="flex justify-between items-start">
                <Sk className="h-2 w-20" />
                <Sk className="h-3.5 w-3.5 rounded-full" />
              </div>
              <Sk className="h-7 w-16 mt-3" />
              <Sk className="h-2 w-24 mt-2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-100 rounded-xl p-6 space-y-3">
            <Sk className="h-3 w-24" />
            {[1, 2, 3].map((i) => (
              <Sk key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
          <div className="lg:col-span-5 bg-white border border-slate-100 rounded-xl p-6 space-y-4">
            <Sk className="h-3 w-32" />
            {[1, 2].map((i) => (
              <Sk key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!orgId || !metrics) {
    return (
      <div className="p-6 lg:p-10 max-w-[1400px]">
        <div className="bg-white border border-slate-100 rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#4253D1]/10 flex items-center justify-center text-[#4253D1]">
            <ShieldCheck size={20} />
          </div>
          <p className="text-xs font-bold text-[#001633]">
            No organization selected
          </p>
          <p className="text-[10px] text-slate-400 max-w-xs">
            Select an organization from the workspace switcher to view its
            security center.
          </p>
        </div>
      </div>
    );
  }

  const criticalCount = alerts.filter(
    (a) => a.severity === "CRITICAL" || a.severity === "HIGH",
  ).length;

  const metricCards = [
    {
      label: "MFA Coverage",
      value: `${metrics.mfaCoveragePct}%`,
      sub: `${metrics.mfaEnrolled} / ${metrics.totalMembers} members`,
      ok: metrics.mfaCoveragePct >= 80,
    },
    {
      label: "Stale Accounts",
      value: String(metrics.staleAccounts),
      sub: "Inactive 30+ days",
      ok: metrics.staleAccounts === 0,
    },
    {
      label: "Open Fraud Alerts",
      value: String(metrics.openAlerts),
      sub: "Currently unresolved",
      ok: metrics.openAlerts === 0,
    },
    {
      label: "Avg. Response Time",
      value:
        metrics.avgResponseMins !== null ? `${metrics.avgResponseMins}m` : "—",
      sub:
        metrics.avgResponseMins !== null
          ? "Resolved alerts, 90d"
          : "No resolved alerts yet",
      ok: true,
    },
  ];

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Threat <span className="text-[#4253D1]">Detection</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Real-time signals for your organization's members and devices.
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-bold ${
            criticalCount > 0
              ? "bg-red-50 border-red-100 text-red-600"
              : "bg-emerald-50 border-emerald-100 text-emerald-600"
          }`}
        >
          <ShieldCheck size={14} />{" "}
          {criticalCount > 0 ? `${criticalCount} Critical` : "Systems Normal"}
        </div>
      </div>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((m, i) => (
          <div
            key={i}
            className="bg-white border border-slate-100 rounded-[10px] p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold text-slate-400">{m.label}</p>
              {m.ok ? (
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              )}
            </div>
            <p
              className={`text-3xl font-bold tracking-tight mt-2 ${m.ok ? "text-[#001633]" : "text-amber-500"}`}
            >
              {m.value}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Alerts */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
            <Eye size={14} className="text-slate-400" /> Live Alerts
            {criticalCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-50 text-red-600 text-[9px] font-bold rounded-full">
                {criticalCount} Critical
              </span>
            )}
          </h3>
          {alerts.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
              <CheckCircle2 size={28} className="text-slate-200" />
              <p className="text-xs font-bold">No alerts</p>
              <p className="text-[10px] text-slate-400 max-w-xs text-center">
                Nothing flagged for your organization.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const isCritical =
                  alert.severity === "CRITICAL" || alert.severity === "HIGH";
                const bg = isCritical
                  ? "bg-red-50 border-red-100"
                  : alert.severity === "MEDIUM"
                    ? "bg-amber-50/50 border-amber-100"
                    : "bg-[#4253D1]/5 border-[#4253D1]/10";
                const Icon = isCritical ? AlertTriangle : Shield;
                return (
                  <div
                    key={alert.id}
                    className={`flex gap-4 p-4 rounded-xl border ${bg}`}
                  >
                    <Icon
                      size={16}
                      className={isCritical ? "text-red-500" : "text-amber-500"}
                      style={{ marginTop: 2 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#001633]">
                        {alert.title.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {alert.description} — {alert.user}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          isCritical
                            ? "bg-red-100 text-red-700"
                            : alert.severity === "MEDIUM"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {alert.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Policies */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2 mb-5">
            <Lock size={14} className="text-slate-400" /> Security Policies
          </h3>
          {policies.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
              <Lock size={28} className="text-slate-200" />
              <p className="text-xs font-bold">No policies</p>
              <p className="text-[10px] text-slate-400 max-w-xs text-center">
                No security policies defined yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {policies.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1">
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
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${p.coverage}%`,
                        background:
                          p.coverage === 100
                            ? "#10B981"
                            : p.coverage > 50
                              ? "#F59E0B"
                              : "#EF4444",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                    {p.coverage}% coverage
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ORGANIZATION SECURITY POLICY (real GET/PATCH /organizations/:id/security/settings) ── */}
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
            <ShieldCheck size={14} className="text-slate-400" /> Organization
            Security Policy
          </h3>
          <button
            onClick={handleSaveSettings}
            disabled={settingsSaving || !settings}
            className="px-4 py-2 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-300 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
          >
            {settingsSaving ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : null}
            {settingsSaving ? "Saving..." : "Save Policy"}
          </button>
        </div>

        {!settings ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Sk className="h-16 w-full rounded-xl" />
            <Sk className="h-16 w-full rounded-lg" />
            <Sk className="h-16 w-full rounded-lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#001633]">
                  Require MFA
                </p>
                <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                  Enforce a second factor for every member
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    mfaRequired: !settings.mfaRequired,
                  })
                }
                className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${settings.mfaRequired ? "bg-[#4253D1] flex justify-end" : "bg-slate-200 flex justify-start"}`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 block">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                min={5}
                value={settings.sessionTimeoutMins}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sessionTimeoutMins: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2.5 border border-slate-100 rounded-lg text-xs text-[#001633] font-semibold focus:outline-none focus:border-[#4253D1] bg-slate-50 focus:bg-white transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 block">
                IP Allowlist (comma-separated)
              </label>
              <input
                type="text"
                value={ipAllowlistText}
                onChange={(e) => setIpAllowlistText(e.target.value)}
                placeholder="Leave blank to allow any IP"
                className="w-full px-3 py-2.5 border border-slate-100 rounded-lg text-xs text-[#001633] font-semibold focus:outline-none focus:border-[#4253D1] bg-slate-50 focus:bg-white transition-all placeholder:text-slate-300 placeholder:font-normal"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── CONDITIONAL / ADAPTIVE ACCESS POLICIES (real, /security/access-policies CRUD) ── */}
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
              <Zap size={14} className="text-slate-400" /> Conditional Access
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 max-w-lg">
              Real-time login rules on top of trust score, device trust, and
              risk signals — the most restrictive matching rule wins.
            </p>
          </div>
          <button
            onClick={() => setShowAddPolicy((v) => !v)}
            className="px-4 py-2 bg-[#001633] hover:bg-[#4253D1] text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus size={12} /> New Policy
          </button>
        </div>

        {showAddPolicy && (
          <form
            onSubmit={handleAddPolicy}
            className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50/50 border border-slate-100 rounded-xl"
          >
            <input
              required
              value={policyForm.name}
              onChange={(e) =>
                setPolicyForm({ ...policyForm, name: e.target.value })
              }
              placeholder="Policy name"
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white focus:outline-none focus:border-[#4253D1] transition-all"
            />
            <select
              value={policyForm.action}
              onChange={(e) =>
                setPolicyForm({ ...policyForm, action: e.target.value as any })
              }
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white"
            >
              <option value="FLAG">Flag (log only)</option>
              <option value="STEP_UP">Require step-up</option>
              <option value="BLOCK">Block</option>
            </select>
            <select
              value={policyForm.minTrustTier}
              onChange={(e) =>
                setPolicyForm({ ...policyForm, minTrustTier: e.target.value })
              }
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white"
            >
              <option value="">No minimum trust tier</option>
              <option value="MEDIUM">Match if trust tier below MEDIUM</option>
              <option value="HIGH">Match if trust tier below HIGH</option>
            </select>
            <div className="flex items-center gap-4 px-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policyForm.blockOnNewDevice}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      blockOnNewDevice: e.target.checked,
                    })
                  }
                  className="accent-[#4253D1]"
                />{" "}
                New device
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policyForm.requireTrustedDevice}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      requireTrustedDevice: e.target.checked,
                    })
                  }
                  className="accent-[#4253D1]"
                />{" "}
                Untrusted device
              </label>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddPolicy(false)}
                className="px-4 py-2 border border-slate-100 text-slate-600 text-[10px] font-bold rounded-lg cursor-pointer flex items-center gap-1"
              >
                <X size={11} /> Cancel
              </button>
              <button
                type="submit"
                disabled={policySaving}
                className="px-4 py-2 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-300 text-white text-[10px] font-bold rounded-lg cursor-pointer"
              >
                {policySaving ? "Creating..." : "Create Policy"}
              </button>
            </div>
          </form>
        )}

        {accessPolicies.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Zap size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No conditional access policies</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              Logins are currently governed only by the static policy above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accessPolicies.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#001633] truncate">
                    {p.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {p.conditions.minTrustTier &&
                      `trust below ${p.conditions.minTrustTier} · `}
                    {p.conditions.blockOnNewDevice && "new device · "}
                    {p.conditions.requireTrustedDevice && "untrusted device · "}
                    → {p.action}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => togglePolicy(p.id, !p.isEnabled)}
                    className={`w-8 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${p.isEnabled ? "bg-[#4253D1] flex justify-end" : "bg-slate-200 flex justify-start"}`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                  </button>
                  <button
                    onClick={() => removePolicy(p.id)}
                    className="p-1.5 border border-rose-100 text-rose-500 bg-rose-50/20 hover:bg-rose-50 hover:border-rose-200 transition-all rounded-lg cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SIEM / WEBHOOK EXPORT (real, /security/siem CRUD + org-scoped audit export) ── */}
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
              <Webhook size={14} className="text-slate-400" /> SIEM Export
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 max-w-lg">
              HMAC-signed webhook push for every audit event in this
              organization, plus a full CSV/PDF export.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                orgId &&
                downloadFile(
                  `/organizations/${orgId}/audit/export?format=csv`,
                  "ondi-org-audit-report.csv",
                )
              }
              className="px-4 py-2 border border-slate-100 text-slate-600 hover:bg-slate-50 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download size={12} /> Export CSV
            </button>
            <button
              onClick={() => setShowAddSiem((v) => !v)}
              className="px-4 py-2 bg-[#001633] hover:bg-[#4253D1] text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={12} /> Add Webhook
            </button>
          </div>
        </div>

        {newSecret && (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-xs font-bold text-amber-700">
              Save this secret now — it won't be shown again
            </p>
            <code className="text-[11px] text-amber-900 break-all block mt-1">
              {newSecret}
            </code>
            <button
              onClick={() => setNewSecret(null)}
              className="text-[10px] font-bold text-amber-600 mt-2 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {showAddSiem && (
          <form
            onSubmit={handleAddSiem}
            className="flex gap-3 p-4 bg-slate-50/50 border border-slate-100 rounded-xl"
          >
            <input
              required
              type="url"
              value={siemUrl}
              onChange={(e) => setSiemUrl(e.target.value)}
              placeholder="https://your-siem.example.com/hook"
              className="flex-1 px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white focus:outline-none focus:border-[#4253D1] transition-all"
            />
            <button
              type="submit"
              disabled={siemSaving}
              className="px-4 py-2 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-300 text-white text-[10px] font-bold rounded-lg cursor-pointer shrink-0"
            >
              {siemSaving ? "Adding..." : "Add"}
            </button>
          </form>
        )}

        {siemConfigs.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Webhook size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No SIEM webhooks</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              No SIEM webhook destinations registered yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {siemConfigs.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#001633] truncate">
                    {c.url}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    secret {c.secretHint} ·{" "}
                    {c.lastDeliveryAt
                      ? `last delivery ${c.lastDeliveryStatus} at ${new Date(c.lastDeliveryAt).toLocaleString()}`
                      : "no deliveries yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => testSiem(c.id)}
                    disabled={testingId === c.id}
                    className="px-3 py-1.5 border border-slate-100 text-slate-600 hover:bg-slate-50 text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {testingId === c.id ? "Sending..." : "Send Test"}
                  </button>
                  <button
                    onClick={() => toggleSiem(c.id, !c.isEnabled)}
                    className={`w-8 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${c.isEnabled ? "bg-[#4253D1] flex justify-end" : "bg-slate-200 flex justify-start"}`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                  </button>
                  <button
                    onClick={() => removeSiem(c.id)}
                    className="p-1.5 border border-rose-100 text-rose-500 bg-rose-50/20 hover:bg-rose-50 hover:border-rose-200 transition-all rounded-lg cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AUTHENTIK PROVISIONING STATUS (real, /security/authentik-status) ── */}
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
              <RefreshCw size={14} className="text-slate-400" /> Authentik
              Provisioning
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 max-w-lg">
              Members are provisioned into Authentik (Ondi&apos;s outbound
              SSO/SCIM broker) automatically on invite-accept, and
              deprovisioned on offboarding — this reflects what actually
              happened, from the audit trail.
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${
              authentikConnected
                ? "bg-emerald-50 text-emerald-600"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {authentikConnected ? "Connected" : "Mock mode — not connected"}
          </span>
        </div>

        {!authentikConnected && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <p className="text-[10px] text-amber-700 leading-relaxed">
              AUTHENTIK_API_TOKEN / AUTHENTIK_SCIM_TOKEN aren&apos;t set on
              the API — every provisioning call below is simulated and
              doesn&apos;t reach a real Authentik instance.
            </p>
          </div>
        )}

        {authentikMembers.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <RefreshCw size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No members yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {authentikMembers.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#001633] truncate">
                    {m.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {m.status === "provisioned" && m.lastEventAt
                      ? `Provisioned ${new Date(m.lastEventAt).toLocaleString()}`
                      : m.status === "deprovisioned" && m.lastEventAt
                        ? `Deprovisioned ${new Date(m.lastEventAt).toLocaleString()}`
                        : "Never provisioned"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      m.status === "provisioned"
                        ? "bg-emerald-50 text-emerald-600"
                        : m.status === "deprovisioned"
                          ? "bg-slate-200 text-slate-500"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {m.status === "provisioned"
                      ? "Provisioned"
                      : m.status === "deprovisioned"
                        ? "Deprovisioned"
                        : "Never provisioned"}
                  </span>
                  <button
                    onClick={() => reprovision(m.userId)}
                    disabled={reprovisioningId === m.userId}
                    className="px-3 py-1.5 border border-slate-100 text-slate-600 hover:bg-slate-50 text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {reprovisioningId === m.userId
                      ? "Re-provisioning..."
                      : "Re-provision"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SAML SERVICE PROVIDER REGISTRY (real, proxied — see api/enterprise/saml/_shared.ts) ── */}
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#001633] flex items-center gap-2">
              <Globe size={14} className="text-slate-400" /> SAML Service
              Providers
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 max-w-lg">
              Apps that trust Ondi as their SAML identity provider for this
              organization.
            </p>
          </div>
          <button
            onClick={() => setShowAddSp((v) => !v)}
            className="px-4 py-2 bg-[#001633] hover:bg-[#4253D1] text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus size={12} /> Register SP
          </button>
        </div>

        {samlError && (
          <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg p-3">
            {samlError}
          </p>
        )}

        {showAddSp && (
          <form
            onSubmit={handleAddSp}
            className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50/50 border border-slate-100 rounded-xl"
          >
            <input
              required
              value={spForm.name}
              onChange={(e) => setSpForm({ ...spForm, name: e.target.value })}
              placeholder="Display name"
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white focus:outline-none focus:border-[#4253D1] transition-all"
            />
            <input
              required
              value={spForm.entityId}
              onChange={(e) =>
                setSpForm({ ...spForm, entityId: e.target.value })
              }
              placeholder="Entity ID"
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white focus:outline-none focus:border-[#4253D1] transition-all"
            />
            <input
              required
              value={spForm.acsUrl}
              onChange={(e) => setSpForm({ ...spForm, acsUrl: e.target.value })}
              placeholder="ACS URL"
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white focus:outline-none focus:border-[#4253D1] transition-all"
            />
            <input
              value={spForm.sloUrl}
              onChange={(e) => setSpForm({ ...spForm, sloUrl: e.target.value })}
              placeholder="SLO URL (optional)"
              className="px-3 py-2.5 border border-slate-100 rounded-lg text-xs bg-white focus:outline-none focus:border-[#4253D1] transition-all"
            />
            <div className="md:col-span-2 flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddSp(false)}
                className="px-4 py-2 border border-slate-100 text-slate-600 text-[10px] font-bold rounded-lg cursor-pointer flex items-center gap-1"
              >
                <X size={11} /> Cancel
              </button>
              <button
                type="submit"
                disabled={spSaving}
                className="px-4 py-2 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-300 text-white text-[10px] font-bold rounded-lg cursor-pointer"
              >
                {spSaving ? "Registering..." : "Register"}
              </button>
            </div>
          </form>
        )}

        {samlSps === null ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Sk key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : samlSps.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400 gap-2">
            <Globe size={28} className="text-slate-200" />
            <p className="text-xs font-bold">No service providers</p>
            <p className="text-[10px] text-slate-400 max-w-xs text-center">
              No SAML service providers registered yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {samlSps.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#001633] truncate">
                    {sp.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {sp.entityId} · {sp.acsUrl}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteSp(sp.id)}
                  className="p-1.5 border border-rose-100 text-rose-500 bg-rose-50/20 hover:bg-rose-50 hover:border-rose-200 transition-all rounded-lg cursor-pointer shrink-0 ml-3"
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
