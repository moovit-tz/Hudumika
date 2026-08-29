"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { apiFetch, clearSession } from "@/lib/api";

interface Session {
  id: string;
  device: { deviceName: string | null; userAgent: string | null } | null;
  riskScore: number | null;
  decision: string | null;
  lastActivityAt: string;
  expiresAt: string;
  createdAt: string;
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function refresh() {
    apiFetch<{ sessions: Session[] }>("/sessions")
      .then((body) => setSessions(body.sessions))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function revoke(sessionId: string) {
    try {
      await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    }
  }

  async function revokeAll() {
    try {
      // Revokes every session including this browser's own — so the local
      // token is now dead too. Clear it and bounce to /login immediately
      // instead of leaving the UI showing a page the (now invalid) session
      // can't actually reach.
      await apiFetch("/sessions", { method: "DELETE" });
      clearSession();
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke sessions");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
          <p className="mt-1 text-sm text-ondi-muted">Every active session tied to your account.</p>
        </div>
        {sessions.length > 0 && (
          <button onClick={revokeAll} className="text-sm font-medium text-red-600 hover:text-red-700">
            Sign out everywhere
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="divide-y divide-ondi-border rounded-3xl border border-ondi-border">
        {loading ? (
          <p className="p-5 text-sm text-ondi-muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="p-5 text-sm text-ondi-muted">No active sessions.</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between p-5">
              <div>
                <p className="font-medium text-foreground">{session.device?.deviceName ?? "Unknown device"}</p>
                <p className="mt-0.5 text-xs text-ondi-muted">
                  Last active {new Date(session.lastActivityAt).toLocaleString()} · expires{" "}
                  {new Date(session.expiresAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => revoke(session.id)}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
