"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Activity01Icon } from "@hugeicons/core-free-icons";
import { apiFetch } from "@/lib/api";

interface AuthEvent {
  id: string;
  success: boolean;
  riskLevel: string | null;
  location: string | null;
  deviceId: string | null;
  timestamp: string;
}

function groupByDay(events: AuthEvent[]) {
  const groups = new Map<string, AuthEvent[]>();
  for (const event of events) {
    const day = new Date(event.timestamp).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(event);
  }
  return Array.from(groups.entries());
}

export default function ActivityPage() {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ events: AuthEvent[] }>("/auth/logins?limit=50")
      .then((body) => setEvents(body.events))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load activity"))
      .finally(() => setLoading(false));
  }, []);

  const groups = groupByDay(events);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Activity</h1>
        <p className="mt-1 text-sm text-ondi-muted">Sign-in activity across your identity.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-ondi-muted">Loading…</p>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-ondi-border p-8 text-center">
          <HugeiconsIcon icon={Activity01Icon} size={28} strokeWidth={1.5} className="text-ondi-muted" />
          <p className="text-sm text-ondi-muted">No recorded activity yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ondi-muted">{day}</h2>
              <div className="divide-y divide-ondi-border rounded-3xl border border-ondi-border">
                {dayEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className={`text-sm font-medium ${event.success ? "text-foreground" : "text-red-600"}`}>
                        {event.success ? "Signed in" : "Sign-in failed"}
                      </p>
                      <p className="mt-0.5 text-xs text-ondi-muted">
                        {[event.riskLevel, event.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className="text-xs text-ondi-muted">
                      {new Date(event.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
