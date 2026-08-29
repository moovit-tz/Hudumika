"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { startRegistration } from "@simplewebauthn/browser";
import { Sk } from "@/components/Skeleton";
import QRCode from "react-qr-code";
import {
  User,
  Lock,
  Globe,
  Bell,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  Key,
  X,
  ShieldCheck,
  Info,
  RefreshCw,
  QrCode,
  Smartphone,
  AlertTriangle,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "profile" | "security" | "preferences" | "notifications" | "danger"
  >("profile");
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    apiFetch("/auth/me")
      .then((data) => {
        const nidaRecord = (data.kycRecords ?? []).find(
          (k: any) => k.documentType === "NIN",
        );
        const realPhone =
          data.phoneNumber && !data.phoneNumber.startsWith("federated_")
            ? data.phoneNumber
            : "";
        setUserId(data.id ?? "");
        setProfile((prev) => ({
          ...prev,
          fullName:
            (data.name ??
              `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()) ||
            "",
          email: data.email ?? "",
          phone: realPhone,
          nationalId: nidaRecord?.documentNumber ?? "",
          dob: data.dateOfBirth
            ? new Date(data.dateOfBirth).toISOString().slice(0, 10)
            : "",
          gender: "",
        }));
        setEmailVerified(!!data.email);
        setPhoneVerified(!!realPhone);
        setConnections({ tra: false, brela: false, complyos: false });
        setTwoFactorEnabled(
          (data.credentials ?? []).some(
            (c: any) => c.type === "OTP" && c.verified,
          ),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadPasskeys();
  }, []);

  // ── PASSKEYS (real WebAuthn, services/ondi-api/src/routes/webauthn.ts) ────
  function loadPasskeys() {
    apiFetch<{ credentials: any[] }>("/webauthn/credentials")
      .then((res) =>
        setPasskeys(
          (res.credentials ?? []).map((c) => ({
            id: c.id,
            name: c.deviceName || "Passkey",
            registered: new Date(c.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
              year: "numeric",
            }),
          })),
        ),
      )
      .catch(() => {});
  }

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── PROFILE STATE ────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    fullName: "",
    nationalId: "",
    dob: "",
    gender: "",
    email: "",
    phone: "",
  });

  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [connections, setConnections] = useState({
    tra: false,
    brela: false,
    complyos: false,
  });

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: profile.fullName.split(" ")[0],
          lastName: profile.fullName.split(" ").slice(1).join(" "),
          email: profile.email,
        }),
      });
      showToast("Profile updated successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update profile", "error");
    }
  };

  // ── SECURITY STATE ───────────────────────────────────────────────────────
  const [securityForm, setSecurityForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [userId, setUserId] = useState("");
  const [passkeys, setPasskeys] = useState<
    { id: string; name: string; registered: string }[]
  >([]);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaOtpUri, setMfaOtpUri] = useState("");
  const [mfaSetupLoading, setMfaSetupLoading] = useState(false);
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaVerifyError, setMfaVerifyError] = useState("");

  const openTwoFactorSetup = async () => {
    if (!profile.phone) {
      showToast(
        "Add and verify a phone number before enabling Ondi Authenticator.",
        "error",
      );
      return;
    }
    setShowTwoFactorModal(true);
    setMfaSetupLoading(true);
    setMfaVerifyError("");
    setTwoFactorCode("");
    try {
      const data = await apiFetch<{ secret: string; otpAuthUri: string }>(
        "/auth/totp/setup",
        {
          method: "POST",
          body: JSON.stringify({ phoneNumber: profile.phone }),
        },
      );
      setMfaSecret(data.secret);
      setMfaOtpUri(data.otpAuthUri);
    } catch {
      showToast("Failed to start Ondi Authenticator setup.", "error");
      setShowTwoFactorModal(false);
    } finally {
      setMfaSetupLoading(false);
    }
  };

  const [passwordUpdating, setPasswordUpdating] = useState(false);

  // Real backend only exposes a 6-digit security-code (app-lock PIN), not an
  // arbitrary password (services/ondi-api/src/routes/auth.ts security-code/set
  // + /verify). "Current" is checked via /security-code/verify before the new
  // code is set — the set endpoint itself has no old-code check.
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !/^\d{6}$/.test(securityForm.newPassword) ||
      !/^\d{6}$/.test(securityForm.confirmPassword)
    ) {
      showToast("Your new security code must be exactly 6 digits.", "error");
      return;
    }
    if (securityForm.newPassword !== securityForm.confirmPassword) {
      showToast("New codes do not match.", "error");
      return;
    }
    if (!userId) {
      showToast(
        "Could not verify your account. Reload and try again.",
        "error",
      );
      return;
    }
    setPasswordUpdating(true);
    try {
      if (securityForm.currentPassword) {
        // A code was already set previously — verify it before replacing it.
        await apiFetch("/auth/security-code/verify", {
          method: "POST",
          body: JSON.stringify({ userId, code: securityForm.currentPassword }),
        });
      }
      await apiFetch("/auth/security-code/set", {
        method: "POST",
        body: JSON.stringify({ userId, code: securityForm.newPassword }),
      });
      showToast("Security code updated successfully!", "success");
      setSecurityForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err: any) {
      showToast(
        err.message === "security_code_not_set"
          ? "No current code on file — leave that field blank."
          : "Incorrect current code or update failed.",
        "error",
      );
    } finally {
      setPasswordUpdating(false);
    }
  };

  // Real WebAuthn ceremony end-to-end: server issues real registration
  // options -> browser's native platform authenticator (Touch ID / Face ID /
  // security key) signs them -> server verifies and stores the credential.
  const handleAddPasskey = async () => {
    setAddingPasskey(true);
    try {
      const optionsJSON = await apiFetch("/webauthn/register/options", {
        method: "POST",
      });
      const response = await startRegistration({ optionsJSON });
      await apiFetch("/webauthn/register/verify", {
        method: "POST",
        body: JSON.stringify({ response, deviceName: "Passkey" }),
      });
      loadPasskeys();
      showToast(
        "New Passkey registered successfully via biometric verification!",
        "success",
      );
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        showToast("Passkey registration was cancelled.", "info");
      } else {
        showToast(
          err?.message || "Could not register passkey on this device.",
          "error",
        );
      }
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleRemovePasskey = async (id: string) => {
    try {
      await apiFetch(`/webauthn/credentials/${id}`, { method: "DELETE" });
      setPasskeys((prev) => prev.filter((pk) => pk.id !== id));
      showToast("Passkey removed successfully.", "info");
    } catch (err: any) {
      showToast(err.message || "Could not remove passkey.", "error");
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (twoFactorCode.length !== 6) {
      setMfaVerifyError("Enter the 6-digit code from your Ondi Authenticator.");
      return;
    }
    setMfaVerifying(true);
    setMfaVerifyError("");
    try {
      await apiFetch("/auth/totp/verify", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: profile.phone,
          code: twoFactorCode,
        }),
      });
      setTwoFactorEnabled(true);
      setShowTwoFactorModal(false);
      setTwoFactorCode("");
      showToast("Ondi Authenticator is now active.", "success");
    } catch (err: any) {
      setMfaVerifyError(
        err.message === "invalid_totp_code"
          ? "Incorrect code. Try again."
          : "Verification failed. Try again.",
      );
    } finally {
      setMfaVerifying(false);
    }
  };

  // ── PREFERENCES STATE ────────────────────────────────────────────────────
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState("system");
  const [timezone, setTimezone] = useState("EAT");

  const handlePreferenceSave = () => {
    showToast("Preferences saved successfully!", "success");
  };

  // ── NOTIFICATIONS STATE ──────────────────────────────────────────────────
  const [notifications, setNotifications] = useState({
    emailNewSignins: true,
    emailExpiry: true,
    pushImmediate: true,
    pushLockouts: true,
    smsHighSeverity: false,
  });

  const handleToggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      showToast(`Alert preference updated!`, "info");
      return updated;
    });
  };

  // ── DANGER ZONE STATE ────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    if (deleteConfirmText !== "DELETE MY ONDI") {
      showToast("Verification code does not match.", "error");
      return;
    }
    setDeleting(true);
    setTimeout(() => {
      setDeleting(false);
      setShowDeleteModal(false);
      showToast("Account deleted. Redirecting to onboarding...", "info");
      window.location.href = "/";
    }, 2500);
  };

  return (
    <>
      <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-8 relative">
        {/* ── DRIBBBLE STYLE HEADER ────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
            Settings
          </h1>
          <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
            Manage your account settings and preferences.
          </p>
        </div>

        {/* ── DRIBBBLE STYLE TOP NAVIGATION TABS ───────────────────────────── */}
        <div className="w-full border-b border-slate-100 flex gap-6 overflow-x-auto pb-px scrollbar-none">
          {[
            { id: "profile", label: "My details" },
            { id: "security", label: "Security & Keys" },
            { id: "preferences", label: "Preferences" },
            { id: "notifications", label: "Notifications" },
            { id: "danger", label: "Danger Zone" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-4 text-xs font-bold transition-all relative whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "text-[#4253D1]"
                    : tab.id === "danger"
                      ? "text-rose-500/70 hover:text-rose-600"
                      : "text-slate-400 hover:text-slate-600"
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

        {/* ── SETTINGS ACTIVE PANE CONTENT AREA ───────────────────────────── */}
        <div className="w-full">
          {loading ? (
            <div className="divide-y divide-slate-100">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 first:pt-2">
                  <div className="space-y-1.5">
                    <Sk className="h-3.5 w-32" />
                    <Sk className="h-2.5 w-48" />
                  </div>
                  <div className="md:col-span-2 space-y-3">
                    <Sk className="h-10 w-full rounded-lg" />
                    <Sk className="h-10 w-2/3 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-0">
            {/* ── PROFILE & DETAILS PANE ─────────────────────────────────── */}
            {activeTab === "profile" && (
              <div className="divide-y divide-slate-100">
                {/* Row 1: Personal Attributes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 first:pt-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Personal Details
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Your official identity details verified from central civil
                      databases.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <form
                      onSubmit={handleProfileSave}
                      className="space-y-6 max-w-3xl"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 block">
                            Full Legal Name
                          </label>
                          <input
                            type="text"
                            value={profile.fullName}
                            onChange={(e) =>
                              setProfile({
                                ...profile,
                                fullName: e.target.value,
                              })
                            }
                            className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] font-semibold focus:outline-none focus:border-[#4253D1]/50 transition-all bg-white"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 block">
                            National ID (NIDA)
                          </label>
                          <input
                            type="text"
                            disabled
                            value={profile.nationalId}
                            className="w-full px-4 py-3 border border-slate-100 bg-slate-50/50 text-slate-400 rounded-[8px] text-xs font-semibold cursor-not-allowed"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 block">
                            Date of Birth
                          </label>
                          <input
                            type="date"
                            disabled
                            value={profile.dob}
                            className="w-full px-4 py-3 border border-slate-100 bg-slate-50/50 text-slate-400 rounded-[8px] text-xs font-semibold cursor-not-allowed"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 block">
                            Gender
                          </label>
                          <input
                            type="text"
                            disabled
                            value={profile.gender}
                            className="w-full px-4 py-3 border border-slate-100 bg-slate-50/50 text-slate-400 rounded-[8px] text-xs font-semibold cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="px-5 py-3 bg-[#4253D1] hover:bg-[#1A4C93] text-white text-xs font-bold rounded-[8px] transition-all shadow-sm cursor-pointer"
                        >
                          Save Details
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Row 2: Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Contact Email & Phone
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Verified contact methods used for security receipts and
                      notifications.
                    </p>
                  </div>

                  <div className="md:col-span-2 space-y-5 max-w-3xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 block">
                          Email Address
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={profile.email}
                            onChange={(e) =>
                              setProfile({ ...profile, email: e.target.value })
                            }
                            className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] font-semibold focus:outline-none focus:border-[#4253D1]/50 transition-all bg-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              showToast(
                                "Verification link sent to your email!",
                                "info",
                              )
                            }
                            className={`px-3 border rounded-[8px] text-[10px] font-bold transition-all shrink-0 cursor-pointer
                                \${emailVerified 
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                          >
                            {emailVerified ? "Verified" : "Verify"}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 block">
                          Phone Number
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={profile.phone}
                            onChange={(e) =>
                              setProfile({ ...profile, phone: e.target.value })
                            }
                            className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] font-semibold focus:outline-none focus:border-[#4253D1]/50 transition-all bg-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              showToast(
                                "SMS verification OTP dispatched!",
                                "info",
                              )
                            }
                            className={`px-3 border rounded-[8px] text-[10px] font-bold transition-all shrink-0 cursor-pointer
                                \${phoneVerified 
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                          >
                            {phoneVerified ? "Verified" : "Verify"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 3: Connected Ecosystems */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 last:pb-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Ecosystem Connections
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Securely link your identity to regulatory agencies to
                      auto-populate compliance filings.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 border border-slate-100 rounded-[8px] bg-white flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-[10px] font-bold text-[#001633]">
                            TRA Tax Portal
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                            Automatic Tax KYC
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConnections((prev) => ({
                              ...prev,
                              tra: !prev.tra,
                            }));
                            showToast(
                              `TRA tax connection ${!connections.tra ? "enabled" : "disabled"}!`,
                              "info",
                            );
                          }}
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${connections.tra ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      <div className="p-4 border border-slate-100 rounded-[8px] bg-white flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-[10px] font-bold text-[#001633]">
                            BRELA Registry
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                            Registry Autocomplete
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConnections((prev) => ({
                              ...prev,
                              brela: !prev.brela,
                            }));
                            showToast(
                              `BRELA agency link ${!connections.brela ? "enabled" : "disabled"}!`,
                              "info",
                            );
                          }}
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${connections.brela ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      <div className="p-4 border border-slate-100 rounded-[8px] bg-white flex items-center justify-between shadow-sm">
                        <div>
                          <p className="text-[10px] font-bold text-[#001633]">
                            ComplyOS Vault
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                            Compliance Sync
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConnections((prev) => ({
                              ...prev,
                              complyos: !prev.complyos,
                            }));
                            showToast(
                              `ComplyOS link ${!connections.complyos ? "enabled" : "disabled"}!`,
                              "info",
                            );
                          }}
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${connections.complyos ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECURITY & KEYS PANE ──────────────────────────────────── */}
            {activeTab === "security" && (
              <div className="divide-y divide-slate-100">
                {/* Row 1: Security PIN (real security-code, services/ondi-api routes/auth.ts) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 first:pt-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Security PIN
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Set the 6-digit code used to lock and unlock your Ondi
                      app.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl">
                    <form onSubmit={handlePasswordUpdate} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 block">
                            Current Code (if set)
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={securityForm.currentPassword}
                            onChange={(e) =>
                              setSecurityForm({
                                ...securityForm,
                                currentPassword: e.target.value.replace(
                                  /\D/g,
                                  "",
                                ),
                              })
                            }
                            placeholder="••••••"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs text-[#001633] placeholder-slate-300 focus:outline-none focus:border-[#4253D1]/50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 block">
                            New Code
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={securityForm.newPassword}
                            onChange={(e) =>
                              setSecurityForm({
                                ...securityForm,
                                newPassword: e.target.value.replace(/\D/g, ""),
                              })
                            }
                            placeholder="••••••"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs text-[#001633] placeholder-slate-300 focus:outline-none focus:border-[#4253D1]/50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 block">
                            Confirm Code
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={securityForm.confirmPassword}
                            onChange={(e) =>
                              setSecurityForm({
                                ...securityForm,
                                confirmPassword: e.target.value.replace(
                                  /\D/g,
                                  "",
                                ),
                              })
                            }
                            placeholder="••••••"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs text-[#001633] placeholder-slate-300 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={passwordUpdating}
                          className="px-4 py-2 border border-[#4253D1]/30 bg-[#4253D1]/5 text-[#4253D1] hover:bg-[#4253D1]/10 disabled:opacity-50 text-[10px] font-bold rounded-[6px] transition-all cursor-pointer"
                        >
                          {passwordUpdating
                            ? "Updating..."
                            : "Update Security Code"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Row 2: Biometric Passkeys */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between md:block">
                      <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                        Biometric Passkeys (FIDO2)
                      </h3>
                      <button
                        onClick={handleAddPasskey}
                        disabled={addingPasskey}
                        className="md:hidden px-3 py-1.5 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-100 disabled:text-slate-400 text-white text-[9px] font-bold rounded-[6px] transition-all cursor-pointer"
                      >
                        Add Key
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium mt-1">
                      Use passwordless secure logins mapped to physical hardware
                      signatures.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl space-y-4">
                    <div className="hidden md:flex justify-end">
                      <button
                        onClick={handleAddPasskey}
                        disabled={addingPasskey}
                        className="px-4 py-2 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-100 disabled:text-slate-400 text-white text-[10px] font-bold rounded-[6px] transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        {addingPasskey ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />{" "}
                            Enrolling...
                          </>
                        ) : (
                          "Add Passkey Device"
                        )}
                      </button>
                    </div>

                    <div className="divide-y divide-slate-50 border border-slate-100 rounded-lg overflow-hidden bg-white shadow-sm">
                      {passkeys.map((pk) => (
                        <div
                          key={pk.id}
                          className="p-4 flex items-center justify-between hover:bg-slate-50/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-[6px] bg-[#4253D1]/5 text-[#4253D1] flex items-center justify-center border border-[#4253D1]/10">
                              <Key size={14} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#001633] leading-none">
                                {pk.name}
                              </p>
                              <p className="text-[9px] text-slate-400 mt-1 font-medium">
                                Registered {pk.registered}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRemovePasskey(pk.id)}
                            className="p-1.5 border border-rose-100 text-rose-500 bg-rose-50/20 hover:bg-rose-50 hover:border-rose-200 transition-all text-[10px] font-bold px-2.5 rounded-[6px] cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 3: Ondi Authenticator */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 last:pb-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Ondi Authenticator
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Ondi's own authenticator is the required second factor at
                      sign-in — no third-party authenticator apps.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl">
                    <div className="flex items-center justify-between bg-slate-50/50 p-5 border border-slate-100 rounded-lg">
                      <div className="space-y-1.5 max-w-md">
                        <p className="text-xs font-bold text-[#001633] flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-emerald-600" />{" "}
                          Ondi Authenticator
                        </p>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-normal">
                          A 6-digit rolling code from the Ondi App, required at
                          sign-in.
                        </p>
                      </div>

                      {twoFactorEnabled ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[9px] font-bold">
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={openTwoFactorSetup}
                          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-[#001633] text-[10px] font-bold rounded-[6px] transition-all shadow-sm cursor-pointer"
                        >
                          Set Up Ondi Authenticator
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PREFERENCES PANE ───────────────────────────────────────── */}
            {activeTab === "preferences" && (
              <div className="divide-y divide-slate-100">
                {/* Row 1: Localization & Display */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 first:pt-2 last:pb-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Display & Regional
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Customize system localization, language dials, and visual
                      theme displays.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 block">
                          Language
                        </label>
                        <select
                          value={language}
                          onChange={(e) => {
                            setLanguage(e.target.value);
                            showToast(
                              `Language set to ${e.target.value === "en" ? "English" : "Swahili"}!`,
                              "info",
                            );
                          }}
                          className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] font-bold focus:outline-none focus:border-[#4253D1]/50 bg-white"
                        >
                          <option value="en">English (UK)</option>
                          <option value="sw">Kiswahili (TZ)</option>
                          <option value="fr">Français (FR)</option>
                          <option value="de">Deutsch (DE)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 block">
                          Visual Theme
                        </label>
                        <select
                          value={theme}
                          onChange={(e) => {
                            setTheme(e.target.value);
                            showToast(
                              `Theme mode set to ${e.target.value}!`,
                              "info",
                            );
                          }}
                          className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] font-bold focus:outline-none focus:border-[#4253D1]/50 bg-white"
                        >
                          <option value="light">Light Mode</option>
                          <option value="dark">Dark Slate Mode</option>
                          <option value="system">System Default</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 block">
                          Timezone Format
                        </label>
                        <select
                          value={timezone}
                          onChange={(e) => {
                            setTimezone(e.target.value);
                            showToast(`Timezone format locked!`, "info");
                          }}
                          className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] font-bold focus:outline-none focus:border-[#4253D1]/50 bg-white"
                        >
                          <option value="EAT">East Africa Time (EAT)</option>
                          <option value="GMT">Greenwich Mean (GMT)</option>
                          <option value="EST">Eastern Standard (EST)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={handlePreferenceSave}
                        className="px-5 py-3 bg-[#4253D1] hover:bg-[#1A4C93] text-white text-xs font-bold rounded-[8px] transition-all shadow-sm cursor-pointer"
                      >
                        Lock Preferences
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS & ALERTS PANE ────────────────────────────── */}
            {activeTab === "notifications" && (
              <div className="divide-y divide-slate-100">
                {/* Row 1: Email Warnings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 first:pt-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Email Alerts
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Alert guidelines sent directly to your verified system
                      mailbox.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl">
                    <div className="divide-y divide-slate-50 border border-slate-100 rounded-lg overflow-hidden bg-white shadow-sm">
                      <div className="p-4 flex items-center justify-between hover:bg-slate-50/20 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-[#001633] leading-none">
                            New browser sign-ins
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1.5 font-medium">
                            Notify me immediately whenever a new IP session
                            initializes.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleToggleNotification("emailNewSignins")
                          }
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${notifications.emailNewSignins ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      <div className="p-4 flex items-center justify-between hover:bg-slate-50/20 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-[#001633] leading-none">
                            Expiry notifications
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1.5 font-medium">
                            Notify me before passport, license, or identity
                            items expire.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleToggleNotification("emailExpiry")
                          }
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${notifications.emailExpiry ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: Mobile Push Warnings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 last:pb-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-[#001633] tracking-tight">
                      Mobile Push
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Instant system push verification requests sent directly to
                      linked devices.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl">
                    <div className="divide-y divide-slate-50 border border-slate-100 rounded-lg overflow-hidden bg-white shadow-sm">
                      <div className="p-4 flex items-center justify-between hover:bg-slate-50/20 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-[#001633] leading-none">
                            Security Handshake Triage
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1.5 font-medium">
                            Push validation prompt when partner apps request
                            digital ID credentials.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleToggleNotification("pushImmediate")
                          }
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${notifications.pushImmediate ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      <div className="p-4 flex items-center justify-between hover:bg-slate-50/20 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-[#001633] leading-none">
                            Failed Verification Warnings
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1.5 font-medium">
                            Alert active devices if pin or facial validation
                            fails repeatedly.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleToggleNotification("pushLockouts")
                          }
                          className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-200 cursor-pointer \${notifications.pushLockouts ? 'bg-[#4253D1] flex justify-end' : 'bg-slate-200 flex justify-start'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DANGER ZONE PANE ───────────────────────────────────────── */}
            {activeTab === "danger" && (
              <div className="divide-y divide-slate-100">
                {/* Row 1: Purge Wallet */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 first:pt-2 last:pb-2">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-rose-600 tracking-tight">
                      Purge Identity Vault
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs font-medium">
                      Permanently destroy your private encryption keys and
                      revoke link integrations.
                    </p>
                  </div>

                  <div className="md:col-span-2 max-w-3xl">
                    <div className="bg-rose-50/10 border border-rose-100 rounded-lg p-6 space-y-4 shadow-sm">
                      <div className="flex gap-3 text-rose-700">
                        <AlertTriangle
                          size={18}
                          className="shrink-0 mt-0.5 text-rose-500"
                        />
                        <p className="text-xs font-semibold leading-relaxed">
                          Deleting your secure vault destroys FIDO2 passkey
                          handshakes, revokes Tra/Brela connections, and purges
                          all digital credentials permanently. **This is
                          mathematically absolute and cannot be undone.**
                        </p>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => setShowDeleteModal(true)}
                          className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-[8px] transition-all shadow-sm cursor-pointer"
                        >
                          Delete Account
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

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

      {mounted &&
        showTwoFactorModal &&
        (createPortal(
          <div className="fixed inset-0 z-[99999] overflow-hidden flex items-center justify-center p-4">
            <div
              onClick={() => setShowTwoFactorModal(false)}
              className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[99999]"
            />

            <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl z-[999999] border border-slate-200 overflow-hidden">
              <div className="p-6 bg-[#001633] flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#7b8ef5]" />
                  <span className="text-sm font-semibold">
                    Set up Ondi Authenticator
                  </span>
                </div>
                <button
                  onClick={() => setShowTwoFactorModal(false)}
                  className="w-7 h-7 rounded-md hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Open the Ondi App, scan this QR code to enable Ondi
                  Authenticator, then enter the 6-digit code to confirm.
                </p>

                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-lg border border-slate-100 gap-3">
                  {mfaSetupLoading ? (
                    <div className="w-36 h-36 flex items-center justify-center">
                      <RefreshCw
                        size={24}
                        className="text-slate-300 animate-spin"
                      />
                    </div>
                  ) : mfaOtpUri ? (
                    <div className="p-2 bg-white border border-slate-200 rounded-[8px]">
                      <QRCode
                        value={mfaOtpUri}
                        size={140}
                        bgColor="#ffffff"
                        fgColor="#001633"
                        level="M"
                      />
                    </div>
                  ) : (
                    <div className="w-36 h-36 bg-white border border-slate-200 p-2 rounded-[8px] flex items-center justify-center">
                      <QrCode size={120} className="text-slate-300" />
                    </div>
                  )}
                  {mfaSecret && (
                    <div className="text-center">
                      <span className="text-[8px] font-bold text-slate-400 block">
                        Or enter this key manually
                      </span>
                      <code className="text-xs font-bold text-slate-600 block mt-0.5 break-all px-2">
                        {mfaSecret}
                      </code>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 block">
                    Enter 6-digit code from Ondi Authenticator
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000 000"
                    value={twoFactorCode}
                    onChange={(e) => {
                      setTwoFactorCode(e.target.value.replace(/\D/g, ""));
                      setMfaVerifyError("");
                    }}
                    className={`w-full px-4 py-3 border rounded-[8px] text-center font-bold text-lg text-[#001633] placeholder-slate-300 focus:outline-none ${mfaVerifyError ? "border-red-300" : "border-slate-200"}`}
                  />
                  {mfaVerifyError && (
                    <p className="text-xs text-red-600 font-medium">
                      {mfaVerifyError}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  onClick={() => setShowTwoFactorModal(false)}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-[8px] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyTwoFactor}
                  disabled={
                    mfaVerifying ||
                    mfaSetupLoading ||
                    twoFactorCode.length !== 6
                  }
                  className="flex-1 py-3 bg-[#4253D1] hover:bg-[#1A4C93] disabled:opacity-50 text-white text-xs font-bold rounded-[8px] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {mfaVerifying ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : null}
                  Verify & Activate
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) as any)}

      {mounted &&
        showDeleteModal &&
        (createPortal(
          <div className="fixed inset-0 z-[99999] overflow-hidden flex items-center justify-center p-4">
            <div
              onClick={() => setShowDeleteModal(false)}
              className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[99999]"
            />

            <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl z-[999999] border border-slate-200 overflow-hidden">
              <div className="p-6 bg-rose-600 flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} />
                  <span className="text-sm font-semibold">
                    Confirm account deletion
                  </span>
                </div>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="w-7 h-7 rounded-[6px] border border-white/10 hover:bg-white/10 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex gap-3 bg-rose-50 border border-rose-100 p-4 rounded-[8px] text-rose-700">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed">
                    This will permanently invalidate your identity keys and
                    purge all associated cryptographic credentials. **This is
                    completely irreversible.**
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 block">
                    Type{" "}
                    <code className="font-bold text-rose-600 select-all">
                      DELETE MY ONDI
                    </code>{" "}
                    to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type the confirmation phrase here"
                    className="w-full px-4 py-3 border border-slate-200 rounded-[8px] text-xs text-[#001633] placeholder-slate-300 focus:outline-none focus:border-rose-300 font-bold"
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-[8px] transition-all disabled:opacity-55 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== "DELETE MY ONDI"}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 disabled:shadow-none cursor-pointer"
                >
                  {deleting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />{" "}
                      Purging...
                    </>
                  ) : (
                    "Confirm Deletion"
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) as any)}
    </>
  );
}
