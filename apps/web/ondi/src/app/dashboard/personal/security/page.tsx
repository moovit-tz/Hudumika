"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel } from "@/components/OneUI";
import { apiFetch, downloadFile } from "@/lib/api";
import { Sk } from "@/components/Skeleton";
import { logoutAllDevices } from "@/lib/session";
import { renderGoogleButton } from "@/lib/googleAuth";
import { ProviderIcon } from "@/components/ProviderIcon";
import PhoneLinkModal from "@/components/PhoneLinkModal";
import QRCode from "react-qr-code";
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Monitor,
  Globe,
  Mail,
  User,
  ArrowRight,
  Check,
  X,
  Lock,
  Plus,
  KeyRound,
  Trash2,
  RefreshCw,
  Clock,
  LogOut,
  Link2,
  Sliders,
  Download,
  FileText,
  AlertTriangle,
  ShieldQuestion,
  UserPlus,
  HeartHandshake,
  QrCode,
  Copy,
} from "lucide-react";

// ─── Authenticator Apps Section ────────────────────────────────────────────────
function AuthenticatorApps() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const phone =
      typeof window !== "undefined"
        ? (localStorage.getItem("user_phone") ??
          localStorage.getItem("ondi_phone") ??
          (() => {
            try {
              return (
                JSON.parse(localStorage.getItem("user") ?? "{}")?.phone ?? ""
              );
            } catch {
              return "";
            }
          })())
        : "";

    const endpoint = phone
      ? `/mfa/apps?phoneNumber=${encodeURIComponent(phone)}`
      : "/mfa/apps";

    apiFetch(endpoint)
      .then((data) => {
        setApps(data.apps ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (enrollmentId: string) => {
    setRevoking(enrollmentId);
    try {
      await apiFetch(`/mfa/apps/${enrollmentId}`, { method: "DELETE" });
      setApps((prev) => prev.filter((a) => a.id !== enrollmentId));
    } catch {}
    setRevoking(null);
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return s;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
          <KeyRound size={14} className="text-[#4253D1]" />
          <span className="text-sm font-bold text-[#4253D1]">
            Authenticator Apps
          </span>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-[#4253D1] transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
      <p className="text-slate-500 text-sm">
        Apps and services you have enrolled to use Ondi as their MFA provider.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 bg-white border border-slate-100 rounded-lg flex items-center gap-4">
              <Sk className="w-11 h-11 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Sk className="h-3.5 w-40" />
                <Sk className="h-2.5 w-56" />
              </div>
              <Sk className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg text-center">
          <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <KeyRound size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 text-sm font-medium mb-1">
            No apps enrolled
          </p>
          <p className="text-slate-400 text-xs mb-5">
            Once an app enrolls Ondi as its MFA provider, it will appear here.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4253D1] text-white text-sm font-bold rounded-full hover:bg-[#1A3060] transition-all"
          >
            Set Up MFA <Plus size={14} />
          </a>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {apps.map((app: any) => (
            <GlassPanel
              key={app.id}
              className="p-5 bg-white border-slate-100 rounded-lg"
            >
              <div className="flex items-center gap-4">
                {/* App initial avatar */}
                <div className="w-11 h-11 rounded-lg bg-[#4253D1]/10 flex items-center justify-center shrink-0">
                  <span className="text-[#4253D1] text-lg font-semibold">
                    {(app.appName ?? "A")[0].toUpperCase()}
                  </span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#001633] text-sm tracking-tight truncate">
                    {app.appName}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enrolled {app.enrolledAt ? formatDate(app.enrolledAt) : "—"}
                    {app.lastUsed && ` · Last used ${formatDate(app.lastUsed)}`}
                  </p>
                </div>
                {/* Method badge */}
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                    app.method === "push"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-blue-50 text-[#4253D1]"
                  }`}
                >
                  {app.method ?? "totp"}
                </span>
                {/* Revoke */}
                <button
                  onClick={() => revoke(app.id)}
                  disabled={revoking === app.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  {revoking === app.id ? (
                    <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  Revoke
                </button>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {apps.length > 0 && (
        <a
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#4253D1] hover:text-[#001633] transition-colors"
        >
          Add New App <Plus size={14} />
        </a>
      )}
    </div>
  );
}

// ─── Active Sessions Section ───────────────────────────────────────────────────
interface Session {
  id: string;
  device?: {
    deviceId?: string;
    deviceName?: string;
    userAgent?: string;
    location?: string;
  } | null;
  lastActivityAt?: string;
  expiresAt: string;
  createdAt: string;
}

// ─── Link a Device (QR pairing) ─────────────────────────────────────────────────
function LinkDevice({ onPaired }: { onPaired?: () => void }) {
  const [pairing, setPairing] = useState<{
    pairingId: string;
    pairingCode: string;
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "approved" | "expired"
  >("idle");
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!pairing || status !== "pending") return;
    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start > 5 * 60 * 1000) {
        setStatus("expired");
        clearInterval(interval);
        return;
      }
      try {
        const res = await apiFetch(
          `/devices/pairing/${pairing.pairingId}/status`,
        );
        if (res.status === "approved") {
          setStatus("approved");
          clearInterval(interval);
          onPaired?.();
        }
      } catch {
        // transient poll failure — keep trying until the 5-minute window above gives up
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [pairing, status]);

  async function handleStart() {
    setStarting(true);
    try {
      const res = await apiFetch("/devices/pairing/initiate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPairing({ pairingId: res.pairingId, pairingCode: res.pairingCode });
      setStatus("pending");
    } catch {
      setStatus("expired");
    } finally {
      setStarting(false);
    }
  }

  function handleCopy() {
    if (!pairing) return;
    navigator.clipboard.writeText(pairing.pairingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function reset() {
    setPairing(null);
    setStatus("idle");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
        <QrCode size={14} className="text-[#4253D1]" />
        <span className="text-sm font-bold text-[#4253D1]">Link a Device</span>
      </div>
      <p className="text-slate-500 text-sm">
        Scan a code from the Ondi mobile app to connect it to this account.
      </p>

      <GlassPanel className="p-6 bg-white border-slate-100 rounded-lg">
        {status === "idle" && (
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <QrCode size={20} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#001633] text-sm tracking-tight">
                Generate pairing code
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Valid for 5 minutes once generated.
              </p>
            </div>
            <button
              onClick={handleStart}
              disabled={starting}
              className="shrink-0 px-4 py-2 rounded-full bg-[#4253D1] text-white text-xs font-bold hover:bg-[#1A3060] transition-all disabled:opacity-50"
            >
              {starting ? "..." : "Generate"}
            </button>
          </div>
        )}

        {status === "pending" && pairing && (
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="p-3 bg-white border border-slate-200 rounded-[8px]">
              <QRCode
                value={pairing.pairingCode}
                size={140}
                bgColor="#ffffff"
                fgColor="#001633"
                level="M"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className=" text-lg font-bold text-[#001633] tracking-[0.3em]">
                {pairing.pairingCode}
              </span>
              <button
                onClick={handleCopy}
                className="text-slate-400 hover:text-[#4253D1] transition-colors"
                title="Copy code"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border border-slate-300 border-t-[#4253D1] rounded-full animate-spin" />
              Waiting for approval on your mobile device...
            </div>
            <button
              onClick={reset}
              className="text-xs font-bold text-slate-400 hover:text-[#001633]"
            >
              Cancel
            </button>
          </div>
        )}

        {status === "approved" && (
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Check size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#001633] text-sm tracking-tight">
                Device linked
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Your mobile device now has access to this Ondi identity.
              </p>
            </div>
            <button
              onClick={reset}
              className="shrink-0 px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-[#001633] hover:border-[#4253D1] hover:text-[#4253D1] transition-all"
            >
              Link Another
            </button>
          </div>
        )}

        {status === "expired" && (
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-800 text-sm tracking-tight">
                Code expired
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate a new one to try again.
              </p>
            </div>
            <button
              onClick={reset}
              className="shrink-0 px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-[#001633] hover:border-[#4253D1] hover:text-[#4253D1] transition-all"
            >
              Try Again
            </button>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function ActiveSessions() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch("/sessions")
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const revokeSession = async (id: string) => {
    setActingId(id);
    try {
      await apiFetch(`/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {}
    setActingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
          <Clock size={14} className="text-[#4253D1]" />
          <span className="text-sm font-bold text-[#4253D1]">
            Active Sessions
          </span>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={async () => {
              setLoggingOutAll(true);
              await logoutAllDevices(router);
            }}
            disabled={loggingOutAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
          >
            {loggingOutAll ? (
              <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogOut size={12} />
            )}
            Log out of all devices
          </button>
        )}
      </div>
      <p className="text-slate-500 text-sm">
        Devices and browsers currently signed in to your Ondi identity.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 bg-white border border-slate-100 rounded-lg flex items-center gap-4">
              <Sk className="w-11 h-11 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Sk className="h-3.5 w-40" />
                <Sk className="h-2.5 w-56" />
              </div>
              <Sk className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg text-center">
          <p className="text-slate-400 text-sm">No active sessions</p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const platform = (s.device?.userAgent ?? "").toLowerCase();
            const Icon =
              platform.includes("iphone") || platform.includes("android")
                ? Smartphone
                : Monitor;
            return (
              <GlassPanel
                key={s.id}
                className="p-5 bg-white border-slate-100 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#001633] text-sm tracking-tight truncate">
                      {s.device?.deviceName || "Unknown device"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {s.device?.location || "Unknown location"}
                      {s.lastActivityAt &&
                        ` · Active ${new Date(s.lastActivityAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeSession(s.id)}
                    disabled={actingId === s.id}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    {actingId === s.id ? (
                      <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <X size={12} />
                    )}
                    Revoke
                  </button>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Connected Accounts (federated identities) Section ─────────────────────────
interface FederatedIdentity {
  id: string;
  provider: string;
  email?: string;
  name?: string;
  createdAt: string;
}

function ConnectedAccounts() {
  const [identities, setIdentities] = useState<FederatedIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingProvider, setActingProvider] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    apiFetch("/auth/federated/identities")
      .then((d) => setIdentities(d.identities ?? []))
      .catch(() => setIdentities([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const unlink = async (provider: string) => {
    setActingProvider(provider);
    try {
      await apiFetch(`/auth/federated/${provider.toLowerCase()}`, {
        method: "DELETE",
      });
      setIdentities((prev) => prev.filter((i) => i.provider !== provider));
    } catch {
      setError("Failed to unlink account. Try again.");
    }
    setActingProvider(null);
  };

  const linkGoogle = async (idToken: string) => {
    setLinking(true);
    setError("");
    try {
      await apiFetch("/auth/federated/link", {
        method: "POST",
        body: JSON.stringify({ provider: "google", idToken }),
      });
      load();
    } catch {
      setError(
        "Failed to link Google account. It may already be linked to another Ondi identity.",
      );
    }
    setLinking(false);
  };

  const googleBtnCallbackRef = (el: HTMLDivElement | null) => {
    if (el) renderGoogleButton(el, linkGoogle).catch(() => {});
  };

  const alreadyLinked = new Set(identities.map((i) => i.provider));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
        <Link2 size={14} className="text-[#4253D1]" />
        <span className="text-sm font-bold text-[#4253D1]">
          Connected Accounts
        </span>
      </div>
      <p className="text-slate-500 text-sm">
        Social and enterprise identities linked to sign in to this Ondi account.
      </p>

      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 bg-white border border-slate-100 rounded-lg flex items-center gap-4">
              <Sk className="w-11 h-11 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Sk className="h-3.5 w-40" />
                <Sk className="h-2.5 w-56" />
              </div>
              <Sk className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      ) : identities.length === 0 ? (
        <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg text-center">
          <p className="text-slate-400 text-sm">No linked accounts</p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {identities.map((identity) => (
            <GlassPanel
              key={identity.id}
              className="p-5 bg-white border-slate-100 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                  <ProviderIcon provider={identity.provider} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#001633] text-sm tracking-tight truncate capitalize">
                    {identity.provider.toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {identity.email || identity.name || "—"}
                  </p>
                </div>
                <button
                  onClick={() => unlink(identity.provider)}
                  disabled={actingProvider === identity.provider}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  {actingProvider === identity.provider ? (
                    <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  Unlink
                </button>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {!alreadyLinked.has("GOOGLE") && (
        <div className="pt-1">
          {linking ? (
            <div className="w-full max-w-xs py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-[#4253D1] border-t-transparent rounded-full animate-spin" />
              Linking Google account...
            </div>
          ) : (
            <div ref={googleBtnCallbackRef} className="max-w-xs" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Verified Credentials — derived from real KYC/credential data ──────────────
interface KycRecord {
  documentType: string;
  status: string;
  verificationSource: string;
  createdAt: string;
}
interface CredentialRow {
  type: string;
  verified: boolean;
  lastUsedAt?: string;
}

function buildVerifications(me: any) {
  const kycRecords: KycRecord[] = me?.kycRecords ?? [];
  const credentials: CredentialRow[] = me?.credentials ?? [];

  const kycFor = (docType: string) =>
    kycRecords.find((k) => k.documentType === docType);
  const biometric = credentials.find((c) => c.type === "BIOMETRIC");

  const phoneVerified =
    !!me?.phoneNumber && !me.phoneNumber.startsWith("federated_");
  const nida = kycFor("NIN");
  const passport = kycFor("PASSPORT");
  const license = kycFor("DRIVER_LICENSE");

  return [
    {
      title: "NIDA / National ID",
      desc: "Verified via government registry",
      status: nida?.status === "VERIFIED" ? "verified" : "pending",
      icon: ShieldCheck,
      details: nida ? `Source: ${nida.verificationSource}` : "Not yet provided",
    },
    {
      title: "Biometric Liveness",
      desc: "Face mesh scan complete",
      status: biometric?.verified ? "verified" : "pending",
      icon: User,
      details: biometric?.lastUsedAt
        ? `Last used ${new Date(biometric.lastUsedAt).toLocaleDateString()}`
        : "Not yet enrolled",
    },
    {
      title: "Phone Number",
      desc: "Verified via SMS OTP",
      status: phoneVerified ? "verified" : "pending",
      icon: Smartphone,
      details: phoneVerified ? me.phoneNumber : "Not yet provided",
    },
    {
      title: "Email Address",
      desc: "On file for this account",
      status: me?.email ? "verified" : "pending",
      icon: Mail,
      details: me?.email || "Not yet provided",
    },
    {
      title: "Passport",
      desc: "Unlock international trust",
      status: passport?.status === "VERIFIED" ? "verified" : "pending",
      icon: ShieldAlert,
      details: passport
        ? `Source: ${passport.verificationSource}`
        : "Not yet provided",
    },
    {
      title: "Driving Licence",
      desc: "Add secondary government ID",
      status: license?.status === "VERIFIED" ? "verified" : "pending",
      icon: ShieldAlert,
      details: license
        ? `Source: ${license.verificationSource}`
        : "Not yet provided",
    },
  ];
}

// ─── Adaptive Security Preferences ─────────────────────────────────────────────
function ToggleSwitch({
  active,
  onClick,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer disabled:opacity-50 ${active ? "bg-[#4253D1] flex justify-end" : "bg-slate-200 flex justify-start"}`}
    >
      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
    </button>
  );
}

function AdaptivePolicyPreferences() {
  const [loading, setLoading] = useState(true);
  const [requireStepUpNewDevice, setRequireStepUpNewDevice] = useState(true);
  const [requireAuthenticatorHighRisk, setRequireAuthenticatorHighRisk] =
    useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/auth/policy/preferences")
      .then((data) => {
        setRequireStepUpNewDevice(!!data.requireStepUpNewDevice);
        setRequireAuthenticatorHighRisk(!!data.requireAuthenticatorHighRisk);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(
    field: "requireStepUpNewDevice" | "requireAuthenticatorHighRisk",
  ) {
    const current =
      field === "requireStepUpNewDevice"
        ? requireStepUpNewDevice
        : requireAuthenticatorHighRisk;
    const setLocal =
      field === "requireStepUpNewDevice"
        ? setRequireStepUpNewDevice
        : setRequireAuthenticatorHighRisk;
    const next = !current;

    setLocal(next);
    setSavingField(field);
    try {
      await apiFetch("/auth/policy/preferences", {
        method: "PATCH",
        body: JSON.stringify({ [field]: next }),
      });
    } catch {
      setLocal(current); // revert on failure
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
        <Sliders size={14} className="text-[#4253D1]" />
        <span className="text-sm font-bold text-[#4253D1]">
          Adaptive Security
        </span>
      </div>
      <p className="text-slate-500 text-sm">
        Control how Ondi responds to risk signals during sign-in.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 bg-white border border-slate-100 rounded-lg flex items-center gap-4">
              <Sk className="w-11 h-11 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Sk className="h-3.5 w-40" />
                <Sk className="h-2.5 w-56" />
              </div>
              <Sk className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <GlassPanel className="p-5 bg-white border-slate-100 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                <Smartphone size={20} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#001633] text-sm tracking-tight">
                  Require step-up from a new device
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  An unrecognized browser must confirm a text message code
                  before your usual sign-in method.
                </p>
              </div>
              <ToggleSwitch
                active={requireStepUpNewDevice}
                disabled={savingField === "requireStepUpNewDevice"}
                onClick={() => toggle("requireStepUpNewDevice")}
              />
            </div>
          </GlassPanel>

          <GlassPanel className="p-5 bg-white border-slate-100 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                <KeyRound size={20} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#001633] text-sm tracking-tight">
                  Require Ondi Authenticator for high-risk actions
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sensitive actions, like resetting your Vault, must use the
                  Authenticator app rather than an SMS code.
                </p>
              </div>
              <ToggleSwitch
                active={requireAuthenticatorHighRisk}
                disabled={savingField === "requireAuthenticatorHighRisk"}
                onClick={() => toggle("requireAuthenticatorHighRisk")}
              />
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

// ─── Security Report Export ─────────────────────────────────────────────────────
function SecurityReportCard() {
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  async function handleDownload(format: "csv" | "pdf") {
    setDownloading(format);
    try {
      await downloadFile(
        `/audit/export?format=${format}`,
        `ondi-security-report.${format}`,
      );
    } catch {
      // silent — the button's own disabled state is the only feedback needed here
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
        <FileText size={14} className="text-[#4253D1]" />
        <span className="text-sm font-bold text-[#4253D1]">
          Security Report
        </span>
      </div>
      <p className="text-slate-500 text-sm">
        Download your full security and audit history.
      </p>

      <GlassPanel className="p-5 bg-white border-slate-100 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <Download size={20} className="text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#001633] text-sm tracking-tight">
              Export Report
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Every logged security event on your account, in the format you
              need.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleDownload("csv")}
              disabled={downloading !== null}
              className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-[#001633] hover:border-[#4253D1] hover:text-[#4253D1] transition-all disabled:opacity-50"
            >
              {downloading === "csv" ? "..." : "CSV"}
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={downloading !== null}
              className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-[#001633] hover:border-[#4253D1] hover:text-[#4253D1] transition-all disabled:opacity-50"
            >
              {downloading === "pdf" ? "..." : "PDF"}
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

// ─── Breach Monitoring ──────────────────────────────────────────────────────────
function BreachMonitoring() {
  const [status, setStatus] = useState<{
    configured: boolean;
    checkedAt: string | null;
    detected: boolean;
    count: number | null;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const load = () => {
    apiFetch("/auth/breach-status")
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
  }, []);

  async function handleCheckNow() {
    setChecking(true);
    try {
      const res = await apiFetch("/auth/breach-check", { method: "POST" });
      setStatus((prev) => ({
        ...(prev ?? {
          configured: true,
          checkedAt: null,
          detected: false,
          count: null,
        }),
        ...res,
      }));
    } catch {
      // leave prior state visible on failure
    } finally {
      setChecking(false);
    }
  }

  if (!status) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
        <ShieldQuestion size={14} className="text-[#4253D1]" />
        <span className="text-sm font-bold text-[#4253D1]">
          Breach Monitoring
        </span>
      </div>

      {!status.configured ? (
        <GlassPanel className="p-5 bg-white border-slate-100 rounded-lg">
          <p className="text-sm text-slate-400">
            Breach monitoring isn't configured for this environment yet.
          </p>
        </GlassPanel>
      ) : status.detected ? (
        <GlassPanel className="p-5 bg-amber-50 border-amber-100 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-800 text-sm tracking-tight">
                Found in {status.count} known{" "}
                {status.count === 1 ? "breach" : "breaches"}
              </p>
              <p className="text-xs text-amber-700/80 mt-0.5">
                One of your linked emails appeared in a known data breach.
                Consider changing your password on affected sites.
              </p>
            </div>
            <button
              onClick={handleCheckNow}
              disabled={checking}
              className="shrink-0 px-4 py-2 rounded-full border border-amber-200 text-xs font-bold text-amber-700 hover:border-amber-400 transition-all disabled:opacity-50"
            >
              {checking ? "..." : "Check Now"}
            </button>
          </div>
        </GlassPanel>
      ) : (
        <GlassPanel className="p-5 bg-white border-slate-100 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#001633] text-sm tracking-tight">
                No known breaches
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {status.checkedAt
                  ? `Last checked ${new Date(status.checkedAt).toLocaleDateString()}`
                  : "Not yet checked"}
              </p>
            </div>
            <button
              onClick={handleCheckNow}
              disabled={checking}
              className="shrink-0 px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-[#001633] hover:border-[#4253D1] hover:text-[#4253D1] transition-all disabled:opacity-50"
            >
              {checking ? "..." : "Check Now"}
            </button>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

// ─── Recovery Contacts ──────────────────────────────────────────────────────────
interface RecoveryContactRow {
  id: string;
  status: "pending" | "active";
  contactName: string | null;
  contactPhone: string;
  addedAt: string;
}
interface PendingInvitation {
  id: string;
  ownerName: string | null;
  ownerPhone: string;
  requestedAt: string;
}

function RecoveryContacts() {
  const [contacts, setContacts] = useState<RecoveryContactRow[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch("/auth/recovery-contacts")
        .then((d) => setContacts(d.contacts ?? []))
        .catch(() => setContacts([])),
      apiFetch("/auth/recovery-contacts/pending")
        .then((d) => setInvitations(d.invitations ?? []))
        .catch(() => setInvitations([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAdding(true);
    try {
      await apiFetch("/auth/recovery-contacts", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: phoneInput }),
      });
      setPhoneInput("");
      load();
    } catch (err: any) {
      setError(
        err?.message === "user_not_found"
          ? "No Ondi account found with that phone number."
          : err?.message === "already_added"
            ? "Already added as a recovery contact."
            : err?.message === "cannot_add_self"
              ? "You can't add yourself."
              : "Failed to add contact. Try again.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/auth/recovery-contacts/${id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
    } finally {
      setBusyId(null);
    }
  }

  async function handleAccept(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/auth/recovery-contacts/${id}/accept`, {
        method: "POST",
      });
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      load();
    } catch {
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 w-fit">
        <HeartHandshake size={14} className="text-[#4253D1]" />
        <span className="text-sm font-bold text-[#4253D1]">
          Recovery Contacts
        </span>
      </div>
      <p className="text-slate-500 text-sm">
        Trusted contacts who can help you regain access if you're ever locked
        out — both sides must agree before a contact becomes active.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 bg-white border border-slate-100 rounded-lg flex items-center gap-4">
              <Sk className="w-11 h-11 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Sk className="h-3.5 w-40" />
                <Sk className="h-2.5 w-56" />
              </div>
              <Sk className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-amber-600">
                Invitations for you
              </p>
              {invitations.map((inv) => (
                <GlassPanel
                  key={inv.id}
                  className="p-4 bg-amber-50 border-amber-100 rounded-lg"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-amber-800">
                      <span className="font-bold">
                        {inv.ownerName || inv.ownerPhone}
                      </span>{" "}
                      wants to add you as their recovery contact.
                    </p>
                    <button
                      onClick={() => handleAccept(inv.id)}
                      disabled={busyId === inv.id}
                      className="shrink-0 px-3 py-1.5 rounded-full bg-[#4253D1] text-white text-xs font-bold disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </div>
                </GlassPanel>
              ))}
            </div>
          )}

          {contacts.length === 0 ? (
            <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg text-center">
              <p className="text-slate-400 text-sm">No recovery contacts yet</p>
            </GlassPanel>
          ) : (
            contacts.map((c) => (
              <GlassPanel
                key={c.id}
                className="p-5 bg-white border-slate-100 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <HeartHandshake size={20} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#001633] text-sm tracking-tight truncate">
                      {c.contactName || c.contactPhone}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.status === "active"
                        ? "Active"
                        : "Waiting for them to accept"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${c.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"}`}
                  >
                    {c.status}
                  </span>
                  <button
                    onClick={() => handleRemove(c.id)}
                    disabled={busyId === c.id}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </GlassPanel>
            ))
          )}

          <form onSubmit={handleAdd} className="flex items-center gap-2 pt-2">
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Their phone number"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              required
            />
            <button
              type="submit"
              disabled={adding}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#4253D1] text-white text-xs font-bold rounded-full hover:bg-[#1A3060] transition-all disabled:opacity-50"
            >
              <UserPlus size={14} /> Add
            </button>
          </form>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>
      )}
    </div>
  );
}

const SECURITY_TABS = [
  { id: "overview", label: "Overview" },
  { id: "authentication", label: "Authentication" },
  { id: "sessions", label: "Sessions & devices" },
  { id: "accounts", label: "Connected accounts" },
  { id: "preferences", label: "Preferences" },
] as const;
type SecurityTab = (typeof SECURITY_TABS)[number]["id"];

export default function SecurityPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SecurityTab>("overview");
  const [verifications, setVerifications] = useState<
    ReturnType<typeof buildVerifications>
  >([]);
  const [showPhoneLink, setShowPhoneLink] = useState(false);

  const loadVerifications = () => {
    apiFetch("/auth/me")
      .then((me) => setVerifications(buildVerifications(me)))
      .catch(() => setVerifications(buildVerifications(null)));
  };

  useEffect(() => {
    loadVerifications();
  }, []);

  function handleVerifyClick(title: string) {
    if (title === "Phone Number") {
      setShowPhoneLink(true);
    } else if (
      title === "NIDA / National ID" ||
      title === "Passport" ||
      title === "Driving Licence"
    ) {
      router.push("/dashboard/personal/wallet");
    }
  }

  return (
    <>
      <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Verification <span className="text-[#4253D1]">Status</span>
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Manage your verified credentials and trust signals. Higher
            verification levels unlock more services and higher limits.
          </p>
        </div>

        {/* Tab Bar */}
        <div className="relative border-b border-slate-100 flex items-center gap-8 overflow-x-auto">
          {SECURITY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative shrink-0 pb-4 text-xs font-bold tracking-wide transition-colors ${
                  isActive
                    ? "text-[#4253D1]"
                    : "text-slate-400 hover:text-[#001633]"
                }`}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4253D1]" />
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-12">
            {/* Verification Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {verifications.map((v, i) => {
                const isVerified = v.status === "verified";
                const Icon = v.icon;

                return (
                  <GlassPanel
                    key={i}
                    className="p-6 bg-white border-slate-100 rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center ${isVerified ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"}`}
                      >
                        <Icon size={24} />
                      </div>
                      <div
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          isVerified
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-50 text-slate-400"
                        }`}
                      >
                        {isVerified ? <Check size={12} /> : <X size={12} />}
                        {isVerified ? "Verified" : "Pending"}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-bold text-[#001633] tracking-tight">
                        {v.title}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">
                        {v.desc}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {v.details}
                      </span>
                      {!isVerified && (
                        <button
                          onClick={() => handleVerifyClick(v.title)}
                          className="text-xs font-bold text-[#4253D1] hover:text-[#001633] transition-colors flex items-center gap-1"
                        >
                          Verify <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </GlassPanel>
                );
              })}
            </div>

            <SecurityReportCard />
          </div>
        )}

        {activeTab === "authentication" && (
          <div className="space-y-12">
            <AuthenticatorApps />
            <LinkDevice />
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="space-y-12">
            <ActiveSessions />
          </div>
        )}

        {activeTab === "accounts" && (
          <div className="space-y-12">
            <ConnectedAccounts />
          </div>
        )}

        {activeTab === "preferences" && (
          <div className="space-y-12">
            <AdaptivePolicyPreferences />
            <BreachMonitoring />
            <RecoveryContacts />
          </div>
        )}

        {/* Security Banner */}
        <div className="p-10 lg:p-14 rounded-lg bg-[#001633] text-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12">
            <div className="space-y-4 max-w-xl">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight">
                Need higher trust limits?
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Add your business TIN or connect your bank accounts to upgrade
                to Level 3 verification and unlock higher spending and
                transaction limits.
              </p>
            </div>
            <button className="shrink-0 px-8 py-4 bg-white text-[#001633] font-semibold text-sm rounded-md hover:bg-slate-100 transition-colors flex items-center gap-2">
              Upgrade account <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <PhoneLinkModal
        open={showPhoneLink}
        onClose={() => setShowPhoneLink(false)}
        onLinked={() => {
          setShowPhoneLink(false);
          loadVerifications();
        }}
      />
    </>
  );
}
