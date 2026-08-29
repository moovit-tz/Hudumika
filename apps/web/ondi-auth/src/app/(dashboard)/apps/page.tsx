"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Grid2X2Icon } from "@hugeicons/core-free-icons";
import { apiFetch } from "@/lib/api";

interface ConnectedApp {
  clientId: string;
  name: string;
  logoUrl: string | null;
  isFirstParty: boolean;
  scopes: string[];
  connectedAt: string;
}

const HIGH_ACCESS_SCOPES = new Set(["credit", "kyc", "transactions"]);

export default function AppsPage() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function refresh() {
    apiFetch<{ apps: ConnectedApp[] }>("/oauth/apps")
      .then((body) => setApps(body.apps))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load apps"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function disconnect(clientId: string) {
    if (!confirm("Disconnect this app? You'll be signed out of it, and any active session may end.")) return;
    try {
      await apiFetch(`/oauth/consents/${clientId}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect app");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Apps</h1>
        <p className="mt-1 text-sm text-ondi-muted">Applications that use Ondi to sign you in.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="divide-y divide-ondi-border rounded-3xl border border-ondi-border">
        {loading ? (
          <p className="p-5 text-sm text-ondi-muted">Loading…</p>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <HugeiconsIcon icon={Grid2X2Icon} size={28} strokeWidth={1.5} className="text-ondi-muted" />
            <p className="text-sm text-ondi-muted">No connected apps yet.</p>
          </div>
        ) : (
          apps.map((app) => {
            const highAccess = app.scopes.some((s) => HIGH_ACCESS_SCOPES.has(s));
            return (
              <div key={app.clientId} className="flex items-start justify-between gap-4 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  {app.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- app-supplied logo, not a local asset
                    <img src={app.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ondi-mist text-ondi-primary">
                      <HugeiconsIcon icon={Grid2X2Icon} size={16} strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{app.name}</p>
                    <p className="mt-0.5 text-xs text-ondi-muted">
                      Connected {new Date(app.connectedAt).toLocaleDateString()}
                      {app.isFirstParty ? " · Ondi" : ""}
                    </p>
                    {app.scopes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {app.scopes.map((scope) => (
                          <span
                            key={scope}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              HIGH_ACCESS_SCOPES.has(scope)
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                                : "bg-ondi-mist text-ondi-primary"
                            }`}
                          >
                            {scope}
                          </span>
                        ))}
                        {highAccess && (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            High access
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {!app.isFirstParty && (
                  <button
                    onClick={() => disconnect(app.clientId)}
                    className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                    Disconnect
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Developer flow (register an OAuth client) — a different persona
          entirely from "apps I've signed into," and there's no room for it
          in a mobile-native IA; kept desktop-only. */}
      <p className="hidden text-center text-xs text-ondi-muted sm:block">
        Building something that uses Ondi to sign users in?{" "}
        <Link href="/applications" className="text-ondi-primary hover:underline">
          Register a new application
        </Link>
        .
      </p>
    </div>
  );
}
