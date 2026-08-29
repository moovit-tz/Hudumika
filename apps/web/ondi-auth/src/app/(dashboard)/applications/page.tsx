"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { getAccessToken } from "@/lib/api";

interface Client {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  isFirstParty: boolean;
}

interface CreatedClient {
  clientId: string;
  clientSecret: string;
}

const SCOPE_OPTIONS = ["openid", "profile", "trust", "credit", "kyc", "transactions"];

async function localFetch(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "request_failed");
  return body;
}

export default function ApplicationsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedClient | null>(null);

  const [name, setName] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [scopes, setScopes] = useState<string[]>(["openid", "profile"]);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    localFetch("/api/clients")
      .then((body) => setClients(body))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function createApp(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const body = await localFetch("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name,
          redirectUris: redirectUris.split(",").map((u) => u.trim()).filter(Boolean),
          scopes,
          grantTypes: ["authorization_code"],
        }),
      });
      setCreated(body);
      setName("");
      setRedirectUris("");
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create application");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDeleteApp() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await localFetch(`/api/clients/${deleteTarget.clientId}`, { method: "DELETE" });
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete application");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/apps" className="flex items-center gap-1.5 text-sm font-medium text-ondi-muted hover:text-foreground">
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.5} />
        Apps
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Applications</h1>
          <p className="mt-1 text-sm text-ondi-muted">OAuth 2.0 / OIDC clients that can use &ldquo;Continue with Ondi&rdquo;.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-ondi-primary px-4 py-2 text-sm font-bold text-white"
        >
          {!showForm && <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />}
          {showForm ? "Cancel" : "Register app"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {created && (
        <div className="rounded-3xl border border-ondi-primary bg-ondi-mist p-5">
          <p className="text-sm font-medium text-foreground">
            App created. Copy the client secret now — it won&apos;t be shown again.
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 text-ondi-muted">Client ID</dt>
              <dd className="font-mono text-foreground">{created.clientId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-ondi-muted">Client secret</dt>
              <dd className="font-mono text-foreground">{created.clientSecret}</dd>
            </div>
          </dl>
          <button onClick={() => setCreated(null)} className="mt-3 text-sm font-medium text-ondi-primary">
            Done
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={createApp} className="flex flex-col gap-4 rounded-3xl border border-ondi-border p-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Application name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-full border border-ondi-border px-3 py-2 text-sm outline-none focus:border-ondi-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Redirect URIs (comma-separated)
            <input
              required
              placeholder="https://example.com/callback"
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              className="rounded-full border border-ondi-border px-3 py-2 text-sm outline-none focus:border-ondi-primary"
            />
          </label>
          <div>
            <span className="text-sm font-medium text-foreground">Scopes</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-1.5 rounded-full border border-ondi-border px-3 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={(e) =>
                      setScopes((prev) => (e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)))
                    }
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-full bg-ondi-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create application"}
          </button>
        </form>
      )}

      <div className="divide-y divide-ondi-border rounded-3xl border border-ondi-border">
        {loading ? (
          <p className="p-5 text-sm text-ondi-muted">Loading…</p>
        ) : clients.length === 0 ? (
          <p className="p-5 text-sm text-ondi-muted">No applications registered yet.</p>
        ) : (
          clients.map((client) => (
            <div key={client.id} className="flex items-center justify-between p-5">
              <div>
                <p className="font-medium text-foreground">{client.name}</p>
                <p className="mt-0.5 font-mono text-xs text-ondi-muted">{client.clientId}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {client.scopes.map((scope) => (
                    <span key={scope} className="rounded-full bg-ondi-mist px-2 py-0.5 text-xs text-ondi-primary">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setDeleteTarget(client)}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-ondi-border bg-ondi-card p-6 shadow-xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <HugeiconsIcon icon={Delete02Icon} size={20} strokeWidth={1.5} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Delete &ldquo;{deleteTarget.name}&rdquo;?</h2>
            <p className="mt-1.5 text-sm text-ondi-muted">
              This permanently deletes the client secret and breaks &ldquo;Continue with Ondi&rdquo; for every
              integration using it. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full border border-ondi-border px-4 py-2.5 text-sm font-medium text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteApp}
                disabled={deleting}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
