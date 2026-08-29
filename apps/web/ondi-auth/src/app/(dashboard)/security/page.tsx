"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkBadge01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ContactBookIcon,
  FingerPrintIcon,
  LockIcon,
  Login01Icon,
  Shield01Icon,
  ShieldKeyIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { apiFetch, hasDeliverablePhone } from "@/lib/api";

interface Me {
  phoneNumber: string;
  email: string | null;
  verificationLevel: string;
}

interface SecurityEvent {
  id: string;
  label: string;
  timestamp: string;
}

export default function SecurityHubPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [recoveryCount, setRecoveryCount] = useState<number | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Me>("/auth/me").catch(() => null),
      apiFetch<{ contacts: unknown[] }>("/auth/recovery-contacts")
        .then((body) => body.contacts.length)
        .catch(() => 0),
      apiFetch<{ credentials: unknown[] }>("/webauthn/credentials")
        .then((body) => body.credentials.length)
        .catch(() => 0),
      apiFetch<{ events: SecurityEvent[] }>("/auth/security-events?limit=6")
        .then((body) => body.events)
        .catch(() => []),
    ]).then(([userData, recCount, pkCount, evList]) => {
      setMe(userData);
      setRecoveryCount(recCount);
      setPasskeyCount(pkCount);
      setEvents(evList);
      setLoading(false);
    });
  }, []);

  const hasPhone = hasDeliverablePhone(me?.phoneNumber);
  const hasPasskey = (passkeyCount ?? 0) > 0;
  const hasRecovery = (recoveryCount ?? 0) > 0;
  const noWayBackIn = me !== null && recoveryCount !== null && !hasPhone && recoveryCount === 0;

  const securityScore = [hasPhone, hasPasskey, hasRecovery].filter(Boolean).length;
  const maxScore = 3;

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="flex h-6 items-center gap-1 rounded-full bg-ondi-primary/10 px-2.5 text-[11px] font-semibold text-ondi-primary dark:bg-ondi-primary/20">
            <HugeiconsIcon icon={Shield01Icon} size={13} strokeWidth={2} />
            Identity Protection
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Security Hub</h1>
        <p className="text-sm text-ondi-muted">
          Manage how your Ondi account is guarded, authenticated, and recovered.
        </p>
      </div>

      {/* Critical Alert if no recovery & no phone */}
      {noWayBackIn && (
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 backdrop-blur-md dark:border-amber-400/20 dark:bg-amber-950/40">
          <div className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                Action Required: Account at Risk
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                You have no verified phone number and no trusted recovery contacts. If you lose access to this device,
                there is currently no path to recover your account.
              </p>
              <Link
                href="/security/recovery"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 dark:bg-amber-500 dark:text-amber-950"
              >
                Add a recovery contact
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Security Health Scorecard */}
      <div className="relative overflow-hidden rounded-3xl border border-ondi-border/80 bg-linear-to-br from-ondi-card via-ondi-card to-ondi-mist/40 p-6 shadow-xs dark:border-ondi-border/50 dark:from-ondi-card dark:to-ondi-mist/10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ondi-primary/10 text-ondi-primary dark:bg-ondi-primary/20">
              <HugeiconsIcon icon={ShieldKeyIcon} size={28} strokeWidth={1.8} />
              {securityScore === maxScore && (
                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                  <HugeiconsIcon icon={CheckmarkBadge01Icon} size={12} strokeWidth={2.5} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  {securityScore === maxScore
                    ? "Optimal Protection"
                    : securityScore >= 2
                    ? "Good Protection"
                    : "Security Recommended"}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    securityScore === maxScore
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-ondi-primary/10 text-ondi-primary dark:bg-ondi-primary/20"
                  }`}
                >
                  {securityScore}/{maxScore} Active
                </span>
              </div>
              <p className="mt-1 text-xs text-ondi-muted">
                {securityScore === maxScore
                  ? "All primary authentication, passkey biometrics, and recovery mesh safeguards are enabled."
                  : "Complete all recommended steps to safeguard your identity against lockouts."}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex min-w-40 flex-col gap-1.5 sm:items-end">
            <div className="h-2 w-full overflow-hidden rounded-full bg-ondi-mist dark:bg-ondi-mist/50 sm:w-40">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  securityScore === maxScore
                    ? "bg-emerald-500"
                    : securityScore >= 2
                    ? "bg-ondi-primary"
                    : "bg-amber-500"
                }`}
                style={{ width: `${(securityScore / maxScore) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-ondi-muted">
              {Math.round((securityScore / maxScore) * 100)}% Protected
            </span>
          </div>
        </div>

        {/* 3 Steps Overview */}
        <div className="mt-6 grid grid-cols-1 gap-3 border-t border-ondi-border/60 pt-5 sm:grid-cols-3 dark:border-ondi-border/40">
          <div className="flex items-center gap-2.5">
            <HugeiconsIcon
              icon={hasPhone ? CheckmarkCircle02Icon : Alert02Icon}
              size={18}
              strokeWidth={2}
              className={hasPhone ? "text-emerald-500" : "text-amber-500"}
            />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Phone Verification</p>
              <p className="text-ondi-muted">{hasPhone ? "Verified active" : "Not configured"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <HugeiconsIcon
              icon={hasPasskey ? CheckmarkCircle02Icon : Alert02Icon}
              size={18}
              strokeWidth={2}
              className={hasPasskey ? "text-emerald-500" : "text-amber-500"}
            />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Passkey Biometrics</p>
              <p className="text-ondi-muted">
                {hasPasskey ? `${passkeyCount} registered` : "None registered"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <HugeiconsIcon
              icon={hasRecovery ? CheckmarkCircle02Icon : Alert02Icon}
              size={18}
              strokeWidth={2}
              className={hasRecovery ? "text-emerald-500" : "text-amber-500"}
            />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Trusted Contacts</p>
              <p className="text-ondi-muted">
                {hasRecovery ? `${recoveryCount} contacts` : "None set up"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Security Navigation Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Passkeys Card */}
        <Link
          href="/security/passkeys"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-ondi-border/80 bg-ondi-card p-5.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ondi-primary hover:shadow-md dark:border-ondi-border/50"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ondi-primary/10 text-ondi-primary transition-transform duration-200 group-hover:scale-105 dark:bg-ondi-primary/20">
              <HugeiconsIcon icon={FingerPrintIcon} size={22} strokeWidth={1.8} />
            </div>
            <span className="flex items-center gap-1 rounded-full bg-ondi-mist px-2.5 py-1 text-[11px] font-semibold text-ondi-primary dark:bg-ondi-mist/80">
              {loading ? "..." : passkeyCount ? `${passkeyCount} Active` : "Setup"}
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-base font-bold text-foreground transition-colors group-hover:text-ondi-primary">
              Passkeys & Biometrics
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ondi-muted">
              Fast, phishing-resistant sign-in using Face ID, Touch ID, Windows Hello, or hardware security keys.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-ondi-primary">
            <span>Manage passkeys</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 group-hover:translate-x-1"
            />
          </div>
        </Link>

        {/* Recovery Contacts Card */}
        <Link
          href="/security/recovery"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-ondi-border/80 bg-ondi-card p-5.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ondi-primary hover:shadow-md dark:border-ondi-border/50"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 transition-transform duration-200 group-hover:scale-105 dark:bg-purple-500/20 dark:text-purple-400">
              <HugeiconsIcon icon={ContactBookIcon} size={22} strokeWidth={1.8} />
            </div>
            <span className="flex items-center gap-1 rounded-full bg-ondi-mist px-2.5 py-1 text-[11px] font-semibold text-foreground dark:bg-ondi-mist/80">
              {loading ? "..." : recoveryCount ? `${recoveryCount} Contacts` : "Configure"}
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-base font-bold text-foreground transition-colors group-hover:text-ondi-primary">
              Account Recovery Mesh
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ondi-muted">
              Appoint trusted individuals who can vouch for your identity if you ever lose your phone or keys.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-ondi-primary">
            <span>Manage recovery</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 group-hover:translate-x-1"
            />
          </div>
        </Link>

        {/* Authenticator / MFA */}
        <Link
          href="/authenticator"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-ondi-border/80 bg-ondi-card p-5.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ondi-primary hover:shadow-md dark:border-ondi-border/50"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 transition-transform duration-200 group-hover:scale-105 dark:bg-teal-500/20 dark:text-teal-400">
              <HugeiconsIcon icon={LockIcon} size={22} strokeWidth={1.8} />
            </div>
            <span className="flex items-center gap-1 rounded-full bg-ondi-mist px-2.5 py-1 text-[11px] font-semibold text-foreground dark:bg-ondi-mist/80">
              2FA Engine
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-base font-bold text-foreground transition-colors group-hover:text-ondi-primary">
              Authenticator & Push 2FA
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ondi-muted">
              Generate secure TOTP verification codes for your integrated apps and respond to instant push prompts.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-ondi-primary">
            <span>Open Authenticator</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 group-hover:translate-x-1"
            />
          </div>
        </Link>

        {/* Sessions & Devices */}
        <Link
          href="/devices"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-ondi-border/80 bg-ondi-card p-5.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ondi-primary hover:shadow-md dark:border-ondi-border/50"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 transition-transform duration-200 group-hover:scale-105 dark:bg-blue-500/20 dark:text-blue-400">
              <HugeiconsIcon icon={SmartPhone01Icon} size={22} strokeWidth={1.8} />
            </div>
            <span className="flex items-center gap-1 rounded-full bg-ondi-mist px-2.5 py-1 text-[11px] font-semibold text-foreground dark:bg-ondi-mist/80">
              Active Hardware
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-base font-bold text-foreground transition-colors group-hover:text-ondi-primary">
              Trusted Devices & Sessions
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ondi-muted">
              Inspect active browser logins, registered mobile devices, and remotely revoke unfamiliar hardware.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-ondi-primary">
            <span>View devices</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 group-hover:translate-x-1"
            />
          </div>
        </Link>
      </div>

      {/* Authentication Methods Overview */}
      <div className="rounded-3xl border border-ondi-border/80 bg-ondi-card p-6 dark:border-ondi-border/50">
        <div className="flex items-center justify-between border-b border-ondi-border/60 pb-4 dark:border-ondi-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ondi-primary/10 text-ondi-primary dark:bg-ondi-primary/20">
              <HugeiconsIcon icon={Login01Icon} size={18} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Authentication Methods</h2>
              <p className="text-xs text-ondi-muted">How you sign in to services powered by Ondi</p>
            </div>
          </div>
          <span className="rounded-full bg-ondi-mist px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ondi-primary dark:bg-ondi-mist/80">
            {me?.verificationLevel ?? "Verified"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-ondi-border/40 bg-ondi-mist/30 p-3.5 dark:bg-ondi-mist/10">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-foreground shadow-2xs">
              <HugeiconsIcon icon={SmartPhone01Icon} size={15} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Phone Number One-Time Code</p>
              <p className="mt-0.5 text-xs text-ondi-muted">
                {hasPhone ? `Configured with ${me?.phoneNumber}` : "No verified mobile phone"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-ondi-border/40 bg-ondi-mist/30 p-3.5 dark:bg-ondi-mist/10">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-foreground shadow-2xs">
              <HugeiconsIcon icon={FingerPrintIcon} size={15} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">FIDO2 WebAuthn Passkeys</p>
              <p className="mt-0.5 text-xs text-ondi-muted">
                {hasPasskey ? `${passkeyCount} hardware passkey(s) enrolled` : "Passwordless passkey not set up"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Security Activity Timeline */}
      {events.length > 0 && (
        <div className="rounded-3xl border border-ondi-border/80 bg-ondi-card p-6 dark:border-ondi-border/50">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={2} className="text-ondi-primary" />
              <h2 className="text-sm font-bold text-foreground">Recent Security Activity</h2>
            </div>
            <span className="text-xs text-ondi-muted">Audit Log</span>
          </div>

          <div className="divide-y divide-ondi-border/50 overflow-hidden rounded-2xl border border-ondi-border/50 dark:divide-ondi-border/30 dark:border-ondi-border/30">
            {events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 bg-background/50 p-3.5 text-xs transition hover:bg-ondi-mist/20">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary dark:bg-ondi-mist/80">
                    <HugeiconsIcon icon={Shield01Icon} size={12} strokeWidth={2} />
                  </div>
                  <span className="font-medium text-foreground">{event.label}</span>
                </div>
                <span className="shrink-0 text-[11px] text-ondi-muted">
                  {new Date(event.timestamp).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

