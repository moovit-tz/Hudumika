"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  CustomerService01Icon,
  Delete02Icon,
  DeviceAccessIcon,
  Download04Icon,
  Grid2X2Icon,
  Logout01Icon,
  Mail01Icon,
  QrCode01Icon,
  ShieldKeyIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import {
  API_URL,
  apiFetch,
  clearSession,
  getAccessToken,
  getStoredUser,
  setSession,
  type StoredUser,
} from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { OtpInput } from "@/components/OtpInput";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";

const SUPPORT_EMAIL = "support@hudumika.tz";

export default function ProfilePage() {
  const router = useRouter();
  const keyboardOpen = useKeyboardOpen();
  const user: StoredUser | null = getStoredUser();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [savedName, setSavedName] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState("");

  const [downloading, setDownloading] = useState(false);

  const [deleteStep, setDeleteStep] = useState<"closed" | "warn" | "otp" | "done">("closed");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [deleteChannel, setDeleteChannel] = useState<"sms" | "email">("sms");
  const [deleteDestination, setDeleteDestination] = useState("");
  const [code, setCode] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  function closeDelete() {
    setDeleteStep("closed");
    setDeleteConfirmText("");
    setDeleteError("");
    setCode("");
  }

  const nameChanged = firstName.trim() !== (user?.firstName ?? "") || lastName.trim() !== (user?.lastName ?? "");

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return;
    setNameBusy(true);
    setNameError("");
    setSavedName(false);
    try {
      await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || undefined }),
      });
      setSession(getAccessToken() ?? "", undefined, {
        ...user,
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
      });
      setSavedName(true);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save your name");
    } finally {
      setNameBusy(false);
    }
  }

  async function downloadData() {
    setDownloading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/audit/export?format=csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to export data");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ondi-security-report.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Non-fatal — the user can retry from this same screen.
    } finally {
      setDownloading(false);
    }
  }

  function signOut() {
    clearSession();
    router.push("/login");
  }

  async function requestDelete() {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const body = await apiFetch<{ challengeId: string; channel: "sms" | "email"; destination: string }>(
        "/auth/account/delete/request",
        { method: "POST" }
      );
      setChallengeId(body.challengeId);
      setDeleteChannel(body.channel);
      setDeleteDestination(body.destination);
      setDeleteStep("otp");
    } catch (err) {
      setDeleteError(
        err instanceof Error && err.message === "no_delivery_method"
          ? "We couldn't find a phone or email on file to send a confirmation code to. Contact support to delete your account."
          : err instanceof Error
            ? err.message
            : "Failed to start account deletion"
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDelete(e: FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apiFetch("/auth/account/delete/confirm", { method: "POST", body: JSON.stringify({ challengeId, code }) });
      setDeleteStep("done");
      clearSession();
      setTimeout(() => router.push("/login"), 1600);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-ondi-muted">Your Ondi identity and account settings.</p>
      </div>

      <div className="flex items-center gap-4 rounded-3xl border border-ondi-border p-5">
        <Avatar user={user} size={56} />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Your account"}
          </p>
          {user?.email && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ondi-muted">
              <HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={1.5} />
              {user.email}
            </p>
          )}
          {user?.phoneNumber && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ondi-muted">
              <HugeiconsIcon icon={SmartPhone01Icon} size={13} strokeWidth={1.5} />+{user.phoneNumber}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={saveName} className="flex flex-col gap-4 rounded-3xl border border-ondi-border p-5">
        <h2 className="text-sm font-semibold text-foreground">Name</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            First name
            <input
              required
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setSavedName(false);
              }}
              className="w-full rounded-full border border-ondi-border px-3 py-2 text-sm text-foreground outline-none focus:border-ondi-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Last name
            <input
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setSavedName(false);
              }}
              className="w-full rounded-full border border-ondi-border px-3 py-2 text-sm text-foreground outline-none focus:border-ondi-primary"
            />
          </label>
        </div>
        {nameError && <p className="text-sm text-red-600">{nameError}</p>}
        {savedName && !nameError && <p className="text-sm text-green-600">Saved.</p>}
        <button
          type="submit"
          disabled={nameBusy || !nameChanged}
          className="self-start rounded-full bg-ondi-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {nameBusy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="flex flex-col divide-y divide-ondi-border overflow-hidden rounded-3xl border border-ondi-border">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-center gap-2.5 px-5 py-3.5 text-sm text-foreground hover:bg-ondi-mist/60"
        >
          <HugeiconsIcon icon={CustomerService01Icon} size={17} strokeWidth={1.5} />
          Contact support
        </a>
        <button
          onClick={downloadData}
          disabled={downloading}
          className="flex items-center gap-2.5 px-5 py-3.5 text-left text-sm text-foreground hover:bg-ondi-mist/60 disabled:opacity-60"
        >
          <HugeiconsIcon icon={Download04Icon} size={17} strokeWidth={1.5} />
          {downloading ? "Preparing…" : "Download my data"}
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-5 py-3.5 text-left text-sm text-foreground hover:bg-ondi-mist/60"
        >
          <HugeiconsIcon icon={Logout01Icon} size={17} strokeWidth={1.5} />
          Sign out
        </button>
        <button
          onClick={() => setDeleteStep("warn")}
          className="flex items-center gap-2.5 px-5 py-3.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <HugeiconsIcon icon={Delete02Icon} size={17} strokeWidth={1.5} />
          Delete account
        </button>
      </div>

      {deleteStep !== "closed" && (
        <div
          className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 px-6 backdrop-blur-sm ${
            keyboardOpen ? "items-start pt-10" : "items-center"
          }`}
        >
          <div className="w-full max-w-sm rounded-3xl border border-ondi-border bg-ondi-card p-6 shadow-xl">
            {deleteStep === "warn" && (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  <HugeiconsIcon icon={Delete02Icon} size={20} strokeWidth={1.5} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">Delete your Ondi identity?</h2>
                <p className="mt-1.5 text-sm text-ondi-muted">This can&apos;t be undone. It permanently removes:</p>

                <ul className="mt-4 flex flex-col gap-2.5">
                  {[
                    { icon: ShieldKeyIcon, label: "Passkeys and your PIN" },
                    { icon: QrCode01Icon, label: "Authenticator accounts and codes" },
                    { icon: DeviceAccessIcon, label: "Trusted devices and active sessions" },
                    { icon: Grid2X2Icon, label: "Access for every connected app" },
                  ].map(({ icon, label }) => (
                    <li key={label} className="flex items-center gap-2.5 text-sm text-foreground">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ondi-mist text-ondi-muted">
                        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.5} />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>

                <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Type DELETE to confirm
                  <input
                    autoFocus
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full rounded-full border border-ondi-border px-3 py-2 text-sm uppercase tracking-wide text-foreground outline-none focus:border-red-500"
                  />
                </label>

                {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={closeDelete}
                    className="flex-1 rounded-full border border-ondi-border px-4 py-2.5 text-sm font-medium text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={requestDelete}
                    disabled={deleteBusy || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                    className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {deleteBusy ? "Sending…" : "Continue"}
                  </button>
                </div>
              </>
            )}

            {deleteStep === "otp" && (
              <form onSubmit={confirmDelete}>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  <HugeiconsIcon icon={deleteChannel === "email" ? Mail01Icon : SmartPhone01Icon} size={20} strokeWidth={1.5} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">Enter confirmation code</h2>
                <p className="mt-1.5 text-sm text-ondi-muted">
                  {deleteChannel === "email"
                    ? `We emailed a 6-digit code to ${deleteDestination}.`
                    : `We texted a 6-digit code to +${deleteDestination}.`}
                </p>
                <div className="mt-5">
                  <OtpInput value={code} onChange={setCode} autoFocus error={!!deleteError} />
                </div>
                {deleteError && <p className="mt-3 text-center text-sm text-red-600">{deleteError}</p>}
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={closeDelete}
                    className="flex-1 rounded-full border border-ondi-border px-4 py-2.5 text-sm font-medium text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteBusy || code.length < 6}
                    className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {deleteBusy ? "Deleting…" : "Delete account"}
                  </button>
                </div>
              </form>
            )}

            {deleteStep === "done" && (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/40">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Account deleted</h2>
                <p className="text-sm text-ondi-muted">Your Ondi identity has been permanently removed.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
