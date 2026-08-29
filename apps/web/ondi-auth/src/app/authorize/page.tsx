"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, apiFetch, getAccessToken, getStoredUser } from "@/lib/api";

interface AuthorizeContext {
  clientId: string;
  clientName: string;
  clientLogoUrl: string | null;
  requestedScopes: string[];
  isFirstParty: boolean;
  state: string | null;
  redirectUri: string;
  codeChallenge: string | null;
}

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ctx, setCtx] = useState<AuthorizeContext | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const qs = searchParams.toString();

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/login?redirect=${encodeURIComponent(`/authorize?${qs}`)}`);
      return;
    }

    fetch(`${API_URL}/oauth/authorize?${qs}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "authorize_failed");
        return body.context as AuthorizeContext;
      })
      .then((context) => {
        setCtx(context);
        if (context.isFirstParty) void issueCode(context);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load application"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  async function issueCode(context: AuthorizeContext) {
    const user = getStoredUser();
    const token = getAccessToken();
    if (!user || !token) {
      setError("Not signed in");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // apiFetch (not a raw fetch) — it retries once via /auth/token/refresh
      // on a 401, which this flow needs: the access token is only good for
      // 15 minutes (see services/ondi-api/src/routes/auth.ts's signTokens),
      // and a first-party client auto-runs this the instant /authorize
      // loads, with no user action in between to have refreshed it. A raw
      // fetch here — the previous code — meant anyone landing on this page
      // with a >15-minute-old session got a bare 401 on /oauth/consent and
      // a stuck "Signing you in…" screen instead of a silent refresh.
      await apiFetch(`/oauth/consent`, {
        method: "POST",
        body: JSON.stringify({ clientId: context.clientId, scopes: context.requestedScopes }),
      });
      const codeBody = await apiFetch<{ code: string }>(`/oauth/code`, {
        method: "POST",
        body: JSON.stringify({
          clientId: context.clientId,
          scope: context.requestedScopes.join(" "),
          codeChallenge: context.codeChallenge,
        }),
      });

      const redirect = new URL(context.redirectUri);
      redirect.searchParams.set("code", codeBody.code);
      if (context.state) redirect.searchParams.set("state", context.state);
      window.location.href = redirect.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authorize");
      setBusy(false);
    }
  }

  function cancel() {
    if (!ctx) return;
    const redirect = new URL(ctx.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    if (ctx.state) redirect.searchParams.set("state", ctx.state);
    window.location.href = redirect.toString();
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  if (!ctx || ctx.isFirstParty) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-sm text-ondi-muted">Signing you in…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-3xl border border-ondi-border p-6 text-center">
        {ctx.clientLogoUrl ? (
          <img src={ctx.clientLogoUrl} alt="" className="mx-auto h-12 w-12 rounded-xl" />
        ) : (
          <img src="/icon.svg" alt="" className="mx-auto h-12 w-12" />
        )}
        <h1 className="mt-4 text-lg font-semibold text-foreground">{ctx.clientName} wants to access your Ondi account</h1>
        <ul className="mt-4 space-y-1 text-left text-sm text-ondi-muted">
          {ctx.requestedScopes.map((scope) => (
            <li key={scope}>• {scope}</li>
          ))}
        </ul>
        <div className="mt-6 flex gap-3">
          <button
            onClick={cancel}
            className="flex-1 rounded-full border border-ondi-border px-4 py-2.5 text-sm font-medium text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => issueCode(ctx)}
            disabled={busy}
            className="flex-1 rounded-full bg-ondi-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? "Allowing…" : "Allow access"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={null}>
      <AuthorizeContent />
    </Suspense>
  );
}
