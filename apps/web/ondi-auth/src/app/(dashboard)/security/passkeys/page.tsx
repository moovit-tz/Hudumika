"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkBadge01Icon,
  Delete02Icon,
  FingerPrintIcon,
  PlusSignIcon,
  Shield01Icon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { apiFetch } from "@/lib/api";

interface Passkey {
  id: string;
  deviceName: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function PasskeysPage() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    apiFetch<{ credentials: Passkey[] }>("/webauthn/credentials")
      .then((body) => setPasskeys(body.credentials))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load passkeys"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function addPasskey() {
    setAdding(true);
    setError("");
    try {
      const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>("/webauthn/register/options", {
        method: "POST",
      });
      const response = await startRegistration({ optionsJSON: options });
      await apiFetch("/webauthn/register/verify", {
        method: "POST",
        body: JSON.stringify({ response, deviceName: guessDeviceName() }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add passkey");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/webauthn/credentials/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove passkey");
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/security"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ondi-muted transition hover:text-ondi-primary"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
          Back to Security Hub
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Passkeys & Biometrics</h1>
          <p className="mt-1 text-sm text-ondi-muted">
            Sign in securely using Touch ID, Face ID, Windows Hello, or hardware security keys.
          </p>
        </div>
        <button
          onClick={addPasskey}
          disabled={adding}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-ondi-primary px-5 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-ondi-secondary active:scale-95 disabled:opacity-60"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2.5} />
          {adding ? "Registering…" : "Add New Passkey"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-600 dark:text-red-400">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {/* Passkeys List */}
      <div className="rounded-3xl border border-ondi-border/80 bg-ondi-card p-6 dark:border-ondi-border/50">
        <div className="mb-4 flex items-center justify-between border-b border-ondi-border/60 pb-3 dark:border-ondi-border/40">
          <h2 className="text-sm font-bold text-foreground">Registered Passkeys</h2>
          <span className="text-xs text-ondi-muted">{passkeys.length} Registered</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-ondi-muted">
            Loading passkey credentials…
          </div>
        ) : passkeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ondi-mist text-ondi-primary dark:bg-ondi-mist/80">
              <HugeiconsIcon icon={FingerPrintIcon} size={28} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">No passkeys enrolled yet</p>
              <p className="mt-1 text-xs text-ondi-muted">
                Add your device&apos;s fingerprint or facial recognition to log in in one tap.
              </p>
            </div>
            <button
              onClick={addPasskey}
              disabled={adding}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ondi-primary/10 px-4 py-2 text-xs font-bold text-ondi-primary transition hover:bg-ondi-primary/20"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2.5} />
              Set up first passkey
            </button>
          </div>
        ) : (
          <div className="divide-y divide-ondi-border/50 dark:divide-ondi-border/30">
            {passkeys.map((pk) => (
              <div key={pk.id} className="flex items-center justify-between py-4 transition hover:bg-ondi-mist/10">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ondi-primary/10 text-ondi-primary dark:bg-ondi-primary/20">
                    <HugeiconsIcon icon={SmartPhone01Icon} size={20} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{pk.deviceName ?? "Passkey"}</p>
                      {pk.backedUp && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                          <HugeiconsIcon icon={CheckmarkBadge01Icon} size={11} strokeWidth={2} />
                          Synced
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ondi-muted">
                      Created {new Date(pk.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      {pk.lastUsedAt
                        ? ` · Last active ${new Date(pk.lastUsedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                        : " · Never used"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => remove(pk.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ondi-muted transition hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20"
                  aria-label="Remove passkey"
                  title="Remove passkey"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={17} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Explanatory Info Card */}
      <div className="flex items-start gap-3.5 rounded-3xl border border-ondi-border/80 bg-ondi-mist/30 p-5 dark:border-ondi-border/40 dark:bg-ondi-mist/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ondi-primary/10 text-ondi-primary dark:bg-ondi-primary/20">
          <HugeiconsIcon icon={Shield01Icon} size={18} strokeWidth={2} />
        </div>
        <div className="text-xs leading-relaxed text-ondi-muted">
          <p className="font-semibold text-foreground">Why passkeys are superior</p>
          <p className="mt-1">
            Passkeys use FIDO2 public-key cryptography stored securely in your device&apos;s Secure Enclave.
            Unlike passwords or SMS codes, passkeys cannot be stolen, phished, or intercepted.
          </p>
        </div>
      </div>
    </div>
  );
}

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone Touch/Face ID";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac OS X/.test(ua)) return "Mac Touch ID / Apple Passkey";
  if (/Android/.test(ua)) return "Android Biometrics";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "Security Key";
}

