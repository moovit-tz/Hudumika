"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Activity01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ComputerIcon,
  Delete02Icon,
  LaptopIcon,
  Logout01Icon,
  ShieldKeyIcon,
  SmartPhone01Icon,
  SquareLock01Icon,
  SquareUnlock01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { apiFetch, clearSession, getDeviceFingerprint } from "@/lib/api";

interface Device {
  id: string;
  deviceId: string;
  deviceName: string | null;
  userAgent: string | null;
  isTrusted: boolean;
  isLocked: boolean;
  lastUsedAt: string;
}

interface Session {
  id: string;
  device: { deviceId: string } | null;
  expiresAt: string;
}

interface AuthEvent {
  id: string;
  success: boolean;
  riskLevel: string | null;
  location: string | null;
  timestamp: string;
}

function deviceIcon(device: Device): IconSvgElement {
  const label = `${device.deviceName ?? ""} ${device.userAgent ?? ""}`;
  if (/iPad|Tablet/i.test(label)) return Tablet01Icon;
  if (/iPhone|Android|Mobile/i.test(label)) return SmartPhone01Icon;
  if (/Mac|Windows|Linux/i.test(label)) return LaptopIcon;
  return ComputerIcon;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function refresh() {
    Promise.all([apiFetch<{ devices: Device[] }>("/devices"), apiFetch<{ sessions: Session[] }>("/sessions")])
      .then(([d, s]) => {
        setDevices(d.devices);
        setSessions(s.sessions);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load devices"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  return { devices, sessions, loading, error, setError, refresh };
}

export default function DevicesPage() {
  const router = useRouter();
  const { devices, sessions, loading, error, setError, refresh } = useDevices();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, AuthEvent[]>>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);
  const currentFingerprint = getDeviceFingerprint();

  async function toggleTrust(id: string, trusted: boolean) {
    try {
      await apiFetch(`/devices/${id}/trust`, { method: "PATCH", body: JSON.stringify({ trusted }) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update device");
    }
  }

  async function toggleLock(id: string, locked: boolean) {
    try {
      await apiFetch(`/devices/${id}/${locked ? "unlock" : "lock"}`, { method: "POST" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update device");
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/devices/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove device");
    }
  }

  async function signOutDevice(sessionId: string, isCurrent: boolean) {
    try {
      await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" });
      if (isCurrent) {
        clearSession();
        router.push("/login");
        return;
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out device");
    }
  }

  async function signOutEverywhere() {
    try {
      await apiFetch("/sessions", { method: "DELETE" });
      clearSession();
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out everywhere");
    }
  }

  async function toggleActivity(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (activity[id]) return;
    setActivityLoading(id);
    try {
      const body = await apiFetch<{ events: AuthEvent[] }>(`/auth/logins?deviceId=${id}&limit=10`);
      setActivity((prev) => ({ ...prev, [id]: body.events }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setActivityLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Devices</h1>
          <p className="mt-1 text-sm text-ondi-muted">Devices and active sessions tied to your account.</p>
        </div>
        {devices.length > 0 && (
          <button
            onClick={signOutEverywhere}
            className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.5} />
            Sign out everywhere
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="rounded-3xl border border-ondi-border p-5 text-sm text-ondi-muted">Loading…</div>
        ) : devices.length === 0 ? (
          <div className="rounded-3xl border border-ondi-border p-5 text-sm text-ondi-muted">No devices yet.</div>
        ) : (
          devices.map((device) => {
            const name = device.deviceName ?? device.userAgent ?? `Device ${device.deviceId.slice(0, 8)}`;
            const isOpen = expanded === device.id;
            const isCurrent = device.deviceId === currentFingerprint;
            const session = sessions.find((s) => s.device?.deviceId === device.deviceId);
            return (
              <div
                key={device.id}
                className="overflow-hidden rounded-3xl border border-ondi-border bg-ondi-card"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
                      <HugeiconsIcon icon={deviceIcon(device)} size={20} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {name}
                        {isCurrent && <span className="ml-1.5 text-xs font-normal text-ondi-muted">· This device</span>}
                      </p>
                      <p className="mt-1 text-xs text-ondi-muted">
                        {session
                          ? `Session active · expires in ${daysUntil(session.expiresAt)}d`
                          : `Last used ${new Date(device.lastUsedAt).toLocaleString()}`}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            device.isTrusted
                              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                              : "bg-ondi-mist text-ondi-muted"
                          }`}
                        >
                          {device.isTrusted ? "Trusted" : "Not trusted"}
                        </span>
                        {device.isLocked && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                    <button
                      onClick={() => toggleActivity(device.id)}
                      aria-label="View activity and details"
                      title="Activity & details"
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ondi-muted hover:bg-ondi-mist hover:text-foreground"
                    >
                      <HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.5} />
                      <span className="hidden md:inline">Activity</span>
                      <HugeiconsIcon icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon} size={12} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => toggleTrust(device.id, !device.isTrusted)}
                      aria-label={device.isTrusted ? "Untrust device" : "Trust device"}
                      title={
                        device.isTrusted
                          ? "Untrust: stop treating this device as pre-approved (it stays in the list)"
                          : "Trust: pre-approve this device for sign-in"
                      }
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ondi-primary hover:bg-ondi-mist"
                    >
                      <HugeiconsIcon icon={ShieldKeyIcon} size={16} strokeWidth={1.5} />
                      <span className="hidden md:inline">{device.isTrusted ? "Untrust" : "Trust"}</span>
                    </button>
                    <button
                      onClick={() => toggleLock(device.id, device.isLocked)}
                      aria-label={device.isLocked ? "Unlock device" : "Lock device"}
                      title={
                        device.isLocked
                          ? "Unlock: allow this device to sign in again"
                          : "Lock: temporarily block all sign-ins from this device without removing it"
                      }
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ondi-muted hover:bg-ondi-mist hover:text-foreground"
                    >
                      <HugeiconsIcon
                        icon={device.isLocked ? SquareUnlock01Icon : SquareLock01Icon}
                        size={16}
                        strokeWidth={1.5}
                      />
                      <span className="hidden md:inline">{device.isLocked ? "Unlock" : "Lock"}</span>
                    </button>
                    {session && (
                      <button
                        onClick={() => signOutDevice(session.id, isCurrent)}
                        aria-label="Sign out this device"
                        title="Sign out: end this device's active session (it can sign back in)"
                        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ondi-muted hover:bg-ondi-mist hover:text-foreground"
                      >
                        <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.5} />
                        <span className="hidden md:inline">Sign out</span>
                      </button>
                    )}
                    <button
                      onClick={() => remove(device.id)}
                      aria-label="Remove device"
                      title="Remove: permanently delete this device from your account and sign it out"
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                      <span className="hidden md:inline">Remove</span>
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-ondi-border bg-ondi-mist/40 px-5 py-4">
                    {device.userAgent && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ondi-muted">Technical details</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-ondi-muted">{device.userAgent}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ondi-muted">Recent activity</p>
                      {activityLoading === device.id ? (
                        <p className="mt-1 text-sm text-ondi-muted">Loading activity…</p>
                      ) : !activity[device.id]?.length ? (
                        <p className="mt-1 text-sm text-ondi-muted">No recorded activity for this device yet.</p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-2">
                          {activity[device.id].map((event) => (
                            <li
                              key={event.id}
                              className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                            >
                              <span className={event.success ? "text-foreground" : "text-red-600"}>
                                {event.success ? "Login" : "Failed login"}
                                {event.riskLevel ? ` · ${event.riskLevel}` : ""}
                                {event.location ? ` · ${event.location}` : ""}
                              </span>
                              <span className="shrink-0 text-ondi-muted">
                                {new Date(event.timestamp).toLocaleString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
