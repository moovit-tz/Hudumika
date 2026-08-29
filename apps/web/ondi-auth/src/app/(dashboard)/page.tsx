"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  FingerPrintIcon,
  InformationCircleIcon,
  QrCode01Icon,
} from "@hugeicons/core-free-icons";
import { apiFetch, getStoredUser, hasDeliverablePhone, type StoredUser } from "@/lib/api";

interface Me {
  ondi: string;
  firstName: string | null;
  email: string | null;
  phoneNumber: string;
  verificationLevel: string;
  trustScore: number;
  trustTier: string;
  profileImage: string | null;
}

interface AuthEvent {
  id: string;
  success: boolean;
  riskLevel: string | null;
  location: string | null;
  deviceName: string | null;
  timestamp: string;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function OverviewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [storedUser] = useState<StoredUser | null>(() => getStoredUser());
  const [counts, setCounts] = useState<{ devices: number; sessions: number; passkeys: number; authenticator: number }>({
    devices: 0,
    sessions: 0,
    passkeys: 0,
    authenticator: 0,
  });
  const [recent, setRecent] = useState<AuthEvent[]>([]);

  useEffect(() => {
    apiFetch<Me>("/auth/me").then((data) => {
      setMe(data);
      Promise.all([
        apiFetch<{ apps: unknown[] }>(`/mfa/apps?phoneNumber=${encodeURIComponent(data.phoneNumber)}`).catch(() => ({
          apps: [],
        })),
      ]).then(([mfa]) => setCounts((prev) => ({ ...prev, authenticator: mfa.apps.length })));
    });
    apiFetch<{ devices: unknown[] }>("/devices").then((d) => setCounts((prev) => ({ ...prev, devices: d.devices.length })));
    apiFetch<{ sessions: unknown[] }>("/sessions").then((s) =>
      setCounts((prev) => ({ ...prev, sessions: s.sessions.length }))
    );
    apiFetch<{ credentials: unknown[] }>("/webauthn/credentials").then((c) =>
      setCounts((prev) => ({ ...prev, passkeys: c.credentials.length }))
    );
    apiFetch<{ events: AuthEvent[] }>("/auth/logins?limit=2")
      .then((body) => setRecent(body.events))
      .catch(() => {});
  }, []);

  const displayName = me?.firstName || storedUser?.firstName;

  const phoneVerified = hasDeliverablePhone(me?.phoneNumber);
  const checks = [
    { label: "Phone verified", done: phoneVerified },
    { label: "Passkey enabled", done: counts.passkeys > 0 },
    { label: "Ondi Authenticator enabled", done: counts.authenticator > 0 },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const allDone = doneCount === checks.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Welcome{displayName ? `, ${displayName}` : ""}</h1>
        <p className="mt-1 text-sm text-ondi-muted">{me ? me.email || `+${me.phoneNumber}` : "Loading your account…"}</p>
      </div>

      <div className="shrink-0 rounded-3xl border border-ondi-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Your Ondi security</h2>
          {/* A raw "Trust tier LOW (300)" score reads like a credit judgment
              on a brand-new, perfectly normal account — constructive
              progress framing instead; the numeric score stays an internal
              risk-engine signal, not something shown here. */}
          {me && <span className="text-xs font-medium text-ondi-muted">{doneCount} of {checks.length} steps complete</span>}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center gap-2 text-sm">
              <HugeiconsIcon
                icon={check.done ? CheckmarkCircle02Icon : InformationCircleIcon}
                size={16}
                strokeWidth={1.5}
                className={check.done ? "text-green-600" : "text-ondi-muted"}
              />
              <span className={check.done ? "text-foreground" : "text-ondi-muted"}>
                {check.label}
                {!check.done && <span className="text-ondi-muted"> — not set up</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ondi-border pt-3 sm:grid-cols-4">
          <Link href="/devices" className="text-center">
            <p className="text-xl font-semibold text-foreground">{counts.devices}</p>
            <p className="text-xs text-ondi-muted">Devices</p>
          </Link>
          <Link href="/devices" className="text-center">
            <p className="text-xl font-semibold text-foreground">{counts.sessions}</p>
            <p className="text-xs text-ondi-muted">Sessions</p>
          </Link>
          <Link href="/security/passkeys" className="text-center">
            <p className="text-xl font-semibold text-foreground">{counts.passkeys}</p>
            <p className="text-xs text-ondi-muted">Passkeys</p>
          </Link>
          <Link href="/authenticator" className="text-center">
            <p className="text-xl font-semibold text-foreground">{counts.authenticator}</p>
            <p className="text-xs text-ondi-muted">Accounts</p>
          </Link>
        </div>

        {/* Quick actions for a mostly-empty account — skipped entirely once
            everything's set up, so a secured account isn't nagged. */}
        {me && !allDone && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-ondi-border pt-3 text-sm font-medium">
            {counts.authenticator === 0 && (
              <Link href="/authenticator" className="flex items-center gap-1.5 text-ondi-primary hover:underline">
                <HugeiconsIcon icon={QrCode01Icon} size={15} strokeWidth={1.75} />+ Add authenticator
              </Link>
            )}
            {counts.passkeys === 0 && (
              <Link href="/security/passkeys" className="flex items-center gap-1.5 text-ondi-primary hover:underline">
                <HugeiconsIcon icon={FingerPrintIcon} size={15} strokeWidth={1.75} />+ Create passkey
              </Link>
            )}
            <Link href="/devices" className="text-ondi-muted hover:text-foreground hover:underline">
              Review sessions
            </Link>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="min-h-0 shrink overflow-hidden">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <Link href="/activity" className="text-xs font-medium text-ondi-primary hover:underline">
              See all
            </Link>
          </div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ondi-muted">
            {dayLabel(recent[0].timestamp)}
          </p>
          <div className="divide-y divide-ondi-border overflow-hidden rounded-3xl border border-ondi-border">
            {recent.map((event) => (
              <div key={event.id} className="flex items-center justify-between p-3">
                <p className={`text-sm font-medium ${event.success ? "text-foreground" : "text-red-600"}`}>
                  {event.deviceName ? `${event.deviceName} · ` : ""}
                  {event.success ? "Signed in" : "Sign-in failed"}
                </p>
                <span className="text-xs text-ondi-muted">
                  {new Date(event.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
