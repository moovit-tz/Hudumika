"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { scopeInfo } from "@/lib/scopes";
import { clientLogoFor } from "@/lib/clientLogos";
import { APP_CATALOG, categoryFor, type AppCategory } from "@/lib/appCatalog";
import { recordAppLaunch, getRecentAppIds } from "@/lib/recentApps";
import {
  Globe,
  X,
  Zap,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Info,
  KeyRound,
  Loader2,
  ShieldCheck,
  MoreVertical,
  Trash2,
  Plus,
  Clock,
  ExternalLink,
  Check,
} from "lucide-react";
import { Sk } from "@/components/Skeleton";

interface ConnectedApp {
  id: string;
  name: string;
  username: string;
  category: AppCategory;
  date: string;
  scopes: string[];
  isFirstParty: boolean;
  connected: boolean;
}

const CATEGORY_ORDER: AppCategory[] = ["Work", "Social", "Other"];

export default function ConnectedAppsPage() {
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApps = () => {
    setLoading(true);
    apiFetch("/oauth/apps")
      .then((data) => {
        const list = data.apps ?? [];
        setApps(
          list.map((a: any) => ({
            id: a.clientId,
            name: a.name ?? "App",
            username: "",
            category: categoryFor(a.name ?? ""),
            date: a.connectedAt
              ? `Connected ${new Date(a.connectedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
              : "Not yet connected",
            scopes: a.scopes ?? [],
            isFirstParty: !!a.isFirstParty,
            connected: !!a.connectedAt,
          })),
        );
      })
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadApps();
  }, []);

  const [selectedAppScope, setSelectedAppScope] = useState<ConnectedApp | null>(
    null,
  );
  const [editedScopes, setEditedScopes] = useState<string[]>([]);
  const [savingScopes, setSavingScopes] = useState(false);
  const [scopeError, setScopeError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const openScopeEditor = (app: ConnectedApp) => {
    setSelectedAppScope(app);
    setEditedScopes(app.scopes);
    setScopeError("");
  };

  const toggleScope = (scope: string) => {
    if (scope === "openid") return; // openid is always required, never removable
    setEditedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleSaveScopes = async () => {
    if (!selectedAppScope) return;
    setSavingScopes(true);
    setScopeError("");
    try {
      await apiFetch(`/oauth/consents/${selectedAppScope.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scopes: editedScopes }),
      });
      setApps((prev) =>
        prev.map((app) =>
          app.id === selectedAppScope.id
            ? { ...app, scopes: editedScopes }
            : app,
        ),
      );
      showToast(`Permissions updated for ${selectedAppScope.name}.`, "success");
      setSelectedAppScope(null);
    } catch (err: any) {
      const msg =
        err?.message === "use_revoke_instead"
          ? "At least one permission is required — use Revoke to remove access entirely."
          : err?.message === "openid_required"
            ? "Basic Identity cannot be removed."
            : "Failed to update permissions. Try again.";
      setScopeError(msg);
    } finally {
      setSavingScopes(false);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    showToast("Client ID copied to clipboard!", "success");
  };

  const handleLaunch = async (id: string, name: string) => {
    setLaunchingId(id);
    try {
      const data = await apiFetch("/oauth/launch", {
        method: "POST",
        body: JSON.stringify({ clientId: id }),
      });
      recordAppLaunch(id);
      window.location.href = data.redirectUrl;
    } catch {
      showToast(`Couldn't launch ${name}. Try again.`, "error");
      setLaunchingId(null);
    }
  };

  const [addAppsOpen, setAddAppsOpen] = useState(false);
  const connectedNames = new Set(apps.map((a) => a.name.toLowerCase()));

  const recentIds = getRecentAppIds();
  const recentApps = recentIds
    .map((rid) => apps.find((a) => a.id === rid))
    .filter((a): a is ConnectedApp => !!a)
    .slice(0, 6);

  const categorized = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    apps: apps.filter((a) => a.category === cat),
  })).filter((group) => group.apps.length > 0);

  const handleRevokeApp = async (id: string, name: string) => {
    setRevokingId(id);
    try {
      await apiFetch(`/oauth/consents/${id}`, { method: "DELETE" });
      setApps((prev) => prev.filter((app) => app.id !== id));
      setSelectedAppScope((prev) => (prev?.id === id ? null : prev));
      showToast(`Access revoked for ${name}.`, "info");
    } catch {
      showToast(`Failed to revoke access for ${name}. Try again.`, "error");
    } finally {
      setRevokingId(null);
    }
  };

  const renderTile = (app: ConnectedApp) => {
    const logo = clientLogoFor(app.name);
    const isLaunching = launchingId === app.id;
    const isMenuOpen = menuOpenId === app.id;
    return (
      <div key={app.id} className="relative group">
        <button
          onClick={() => handleLaunch(app.id, app.name)}
          disabled={isLaunching}
          title={app.date}
          className="w-full aspect-square bg-white border border-slate-100 rounded-lg flex flex-col items-center justify-center gap-3 p-4 hover:shadow-md hover:border-slate-200 transition-all cursor-pointer disabled:opacity-60"
        >
          <div className="w-12 h-12 rounded-lg bg-[#4253D1]/5 border border-[#4253D1]/10 text-[#4253D1] flex items-center justify-center shrink-0 overflow-hidden">
            {isLaunching ? (
              <Loader2 size={20} className="animate-spin" />
            ) : logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={app.name} className="w-7 h-7 object-contain" />
            ) : (
              <Globe size={20} />
            )}
          </div>
          <div className="flex items-center gap-1 max-w-full">
            <span className="text-xs font-bold text-[#001633] tracking-tight truncate">
              {app.name}
            </span>
            {app.isFirstParty && (
              <ShieldCheck size={11} className="text-emerald-500 shrink-0" />
            )}
          </div>
        </button>

        {/* Tile overflow menu — details, edit scopes, revoke */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId(isMenuOpen ? null : app.id);
          }}
          className={`absolute top-1.5 right-1.5 p-1 rounded-md text-slate-400 hover:text-[#001633] hover:bg-slate-100 transition-all ${isMenuOpen ? "opacity-100 bg-slate-100" : "opacity-0 group-hover:opacity-100"}`}
          title="App options"
        >
          <MoreVertical size={14} />
        </button>

        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpenId(null)}
            />
            <div className="absolute right-1.5 top-9 z-50 w-44 bg-white border border-slate-200 rounded-md shadow-lg py-1">
              <button
                onClick={() => {
                  setMenuOpenId(null);
                  openScopeEditor(app);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                View details
              </button>
              <button
                onClick={() => {
                  setMenuOpenId(null);
                  handleRevokeApp(app.id, app.name);
                }}
                disabled={revokingId === app.id}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {revokingId === app.id ? (
                  <div className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                Revoke access
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-10 relative">
        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="space-y-1.5">
            <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
              App <span className="text-[#4253D1]">Launcher</span>
            </h1>
            <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
              Launch into your apps with one click, and manage what each one
              can access.
            </p>
          </div>
          <button
            onClick={() => setAddAppsOpen(true)}
            className="shrink-0 px-5 py-2.5 bg-[#001633] hover:bg-[#4253D1] text-white rounded-md text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add apps
          </button>
        </div>

        {/* ── APP LAUNCHER GRID (Okta MyApps-style tiles, grouped) ─────────── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="aspect-square bg-white border border-slate-100 rounded-lg flex flex-col items-center justify-center gap-3 p-4"
              >
                <Sk className="w-12 h-12 rounded-lg" />
                <Sk className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-lg p-12 text-center">
            <Globe size={32} className="mx-auto text-slate-300 mb-4" />
            <p className="text-sm text-slate-400">
              No connected apps yet — sign in with Ondi from an app, or add
              one below, to see it here.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {recentApps.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 tracking-wide">
                  <Clock size={13} />
                  Recently opened
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {recentApps.map(renderTile)}
                </div>
              </div>
            )}

            {categorized.map(({ category, apps: catApps }) => (
              <div key={category} className="space-y-3">
                <div className="text-xs font-bold text-slate-400 tracking-wide">
                  {category}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {catApps.map(renderTile)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SECURITY SYSTEM BOX ─────────────────────────────────────────── */}
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-6 flex gap-4">
          <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-[#4253D1] shrink-0">
            <Zap size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#001633]">
              OAuth consent management
            </h4>
            <p className="text-xs text-slate-500 font-normal leading-relaxed">
              Every connected app requests specific data scopes when you sign in
              with Ondi. Revoking access here immediately invalidates that app's
              consent and active sessions.
            </p>
          </div>
        </div>

        {/* ── FLOATING TOAST NOTIFICATION ─────────────────────────── */}
        {toast && (
          <div className="fixed bottom-8 right-8 z-[999999] p-4 rounded-lg bg-[#001633] border border-white/10 flex items-center gap-3.5 shadow-xl max-w-sm">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
              ${
                toast.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : toast.type === "error"
                    ? "bg-rose-500/10 text-rose-400"
                    : "bg-blue-500/10 text-blue-400"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 size={16} />
              ) : toast.type === "error" ? (
                <AlertTriangle size={16} />
              ) : (
                <Info size={16} />
              )}
            </div>
            <p className="text-xs font-bold text-white tracking-tight leading-normal shrink-0">
              {toast.message}
            </p>
          </div>
        )}
      </div>

      {/* ── SCOPE VIEWER PORTAL ─────────────────────── */}
      {mounted &&
        selectedAppScope &&
        createPortal(
          <div className="fixed inset-0 z-[99999] overflow-hidden flex items-center justify-center p-4">
            <div
              onClick={() => setSelectedAppScope(null)}
              className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[99999]"
            />

            <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl z-[999999] border border-slate-200 overflow-hidden">
              <div className="p-6 bg-[#001633] flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <KeyRound size={18} className="text-[#7b8ef5]" />
                  <span className="text-sm font-semibold">Authorized scopes</span>
                </div>
                <button
                  onClick={() => setSelectedAppScope(null)}
                  className="w-7 h-7 rounded-md hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-[#001633]">
                    {selectedAppScope.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">
                    {selectedAppScope.date}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 block">
                      Client ID
                    </span>
                    <span className="text-xs text-slate-600 truncate block mt-1">
                      {selectedAppScope.id}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyId(selectedAppScope.id)}
                    className="p-1 text-slate-400 hover:text-[#4253D1] transition-colors cursor-pointer shrink-0"
                    title="Copy client ID"
                  >
                    <Copy size={13} />
                  </button>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400">
                    Permissions
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Choose what this app can access. Unchecking a permission
                    takes effect immediately.
                  </p>
                </div>

                <div className="space-y-3">
                  {selectedAppScope.scopes.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No scopes recorded for this consent.
                    </p>
                  ) : (
                    selectedAppScope.scopes.map((s) => {
                      const info = scopeInfo(s);
                      const checked = editedScopes.includes(s);
                      const locked = s === "openid";
                      return (
                        <label
                          key={s}
                          className={`p-3 border border-slate-100 rounded-lg bg-slate-50 flex items-start gap-2.5 ${locked ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => toggleScope(s)}
                            className="mt-0.5 w-3.5 h-3.5 accent-[#4253D1] shrink-0 disabled:opacity-60"
                          />
                          <div>
                            <p className="text-[10px] font-bold text-[#001633]">
                              {info.label}
                              {locked && (
                                <span className="text-slate-400 normal-case font-medium">
                                  {" "}
                                  · required
                                </span>
                              )}
                            </p>
                            <p className="text-[9px] text-slate-500 mt-0.5">
                              {info.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>

                {scopeError && (
                  <p className="text-[10px] text-rose-500 font-medium">
                    {scopeError}
                  </p>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <button
                  onClick={() =>
                    handleRevokeApp(selectedAppScope.id, selectedAppScope.name)
                  }
                  disabled={revokingId === selectedAppScope.id}
                  className="px-3 py-2.5 text-rose-500 hover:bg-rose-50 text-xs font-bold rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {revokingId === selectedAppScope.id ? (
                    <div className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  Revoke access
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedAppScope(null)}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-500 text-xs font-bold rounded-md transition-colors cursor-pointer hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleSaveScopes}
                    disabled={savingScopes}
                    className="px-5 py-2.5 bg-[#4253D1] hover:bg-[#001633] text-white text-xs font-bold rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingScopes && (
                      <div className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin" />
                    )}
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── ADD APPS PORTAL — catalog of first-party apps you can sign into ── */}
      {mounted &&
        addAppsOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] overflow-hidden flex items-center justify-center p-4">
            <div
              onClick={() => setAddAppsOpen(false)}
              className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[99999]"
            />
            <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl z-[999999] border border-slate-200 overflow-hidden">
              <div className="p-6 bg-[#001633] flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Plus size={18} className="text-[#7b8ef5]" />
                  <span className="text-sm font-semibold">Add apps</span>
                </div>
                <button
                  onClick={() => setAddAppsOpen(false)}
                  className="w-7 h-7 rounded-md hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-3">
                <p className="text-[10px] text-slate-400 font-medium">
                  Sign in to any Hudumika app with Ondi to connect it — it'll
                  then show up in your launcher.
                </p>
                {APP_CATALOG.map((catalogApp) => {
                  const logo = clientLogoFor(catalogApp.name);
                  const isConnected = connectedNames.has(
                    catalogApp.name.toLowerCase(),
                  );
                  return (
                    <div
                      key={catalogApp.name}
                      className="p-3 border border-slate-100 rounded-lg bg-slate-50 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logo}
                            alt={catalogApp.name}
                            className="w-6 h-6 object-contain"
                          />
                        ) : (
                          <Globe size={16} className="text-[#4253D1]" />
                        )}
                      </div>
                      <span className="flex-1 text-xs font-bold text-[#001633] truncate">
                        {catalogApp.name}
                      </span>
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <Check size={12} /> Connected
                        </span>
                      ) : (
                        <a
                          href={catalogApp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#4253D1] hover:bg-[#001633] text-white text-[10px] font-bold rounded-md transition-colors"
                        >
                          Connect <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                <button
                  onClick={() => setAddAppsOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-500 text-xs font-bold rounded-md transition-colors cursor-pointer hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
