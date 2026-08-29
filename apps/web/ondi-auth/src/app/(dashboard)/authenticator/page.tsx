"use client";

import { useEffect, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  BellRingIcon,
  Delete02Icon,
  PlusSignIcon,
  QrCode01Icon,
} from "@hugeicons/core-free-icons";
import { apiFetch } from "@/lib/api";
import { TotpCode } from "@/components/TotpCode";
import { QrScanner } from "@/components/QrScanner";
import { parseOtpAuthUri } from "@/lib/totp";

interface MfaApp {
  id: string;
  appId: string;
  appName: string;
  issuer: string;
  method: string;
  secret: string | null;
  enrolledAt: string;
}

interface PushSession {
  id: string;
  device: string;
  location: string;
}

type AddStep = "closed" | "choose" | "scan" | "manual";

const PUSH_POLL_MS = 4000;

export default function AuthenticatorPage() {
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [apps, setApps] = useState<MfaApp[]>([]);
  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [manualName, setManualName] = useState("");
  const [manualIssuer, setManualIssuer] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PushSession[]>([]);
  const [pushDetail, setPushDetail] = useState<PushSession | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MfaApp | null>(null);

  useEffect(() => {
    apiFetch<{ phoneNumber: string }>("/auth/me").then((me) => setPhoneNumber(me.phoneNumber));
  }, []);

  function refreshApps(phone: string) {
    apiFetch<{ apps: MfaApp[] }>(`/mfa/apps?phoneNumber=${encodeURIComponent(phone)}`)
      .then((body) => setApps(body.apps))
      .catch(() => {});
  }

  useEffect(() => {
    if (phoneNumber) refreshApps(phoneNumber);
  }, [phoneNumber]);

  // Push-request banner — "who's asking to sign in right now": polls for
  // any pending push-approval session tied to this phone number rather
  // than making the person remember to come check.
  useEffect(() => {
    if (!phoneNumber) return;
    let cancelled = false;

    async function poll() {
      try {
        const body = await apiFetch<{ sessions: PushSession[] }>(
          `/auth/push/pending/${encodeURIComponent(phoneNumber!)}`
        );
        if (!cancelled) setPending(body.sessions);
      } catch {
        // Non-fatal — just try again next tick.
      }
    }

    poll();
    const interval = setInterval(poll, PUSH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phoneNumber]);

  async function respondToPush(sessionId: string, approved: boolean) {
    setRespondingTo(sessionId);
    try {
      await apiFetch("/auth/push/approve", {
        method: "POST",
        body: JSON.stringify({ sessionId, approved }),
      });
      setPending((prev) => prev.filter((s) => s.id !== sessionId));
      setPushDetail(null);
    } catch {
      // Non-fatal — the request expires on its own (90s TTL) if this fails.
    } finally {
      setRespondingTo(null);
    }
  }

  function closeAdd() {
    setAddStep("closed");
    setManualName("");
    setManualIssuer("");
    setManualSecret("");
    setError("");
  }

  async function submitEnrollment(appName: string, issuer: string, secret: string) {
    if (!phoneNumber) return;
    setAdding(true);
    setError("");
    try {
      await apiFetch("/mfa/enroll", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber,
          appId: `${issuer}-${appName}`.toLowerCase().replace(/\s+/g, "-"),
          appName,
          issuer,
          secret,
          method: "totp",
        }),
      });
      closeAdd();
      refreshApps(phoneNumber);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "already_enrolled"
          ? `You already have ${issuer} set up.`
          : err instanceof Error && err.message === "invalid_secret_format"
            ? "That setup key doesn't look right — double check it and try again."
            : err instanceof Error
              ? err.message
              : "Failed to add account"
      );
      setAdding(false);
    }
  }

  function handleScan(rawValue: string) {
    const parsed = parseOtpAuthUri(rawValue);
    if (!parsed?.secret) {
      setError("This code has expired or isn't a valid authenticator QR code — try entering the setup key manually.");
      setAddStep("choose");
      return;
    }
    const issuer = parsed.issuer || parsed.account || "Account";
    const appName = parsed.account || issuer;
    submitEnrollment(appName, issuer, parsed.secret);
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    if (!manualName || !manualSecret) return;
    submitEnrollment(manualName, manualIssuer || manualName, manualSecret);
  }

  async function confirmRemove() {
    if (!removeTarget || !phoneNumber) return;
    try {
      await apiFetch(`/mfa/apps/${removeTarget.id}`, { method: "DELETE" });
      setRemoveTarget(null);
      refreshApps(phoneNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Authenticator</h1>
          <p className="mt-1 text-sm text-ondi-muted">
            Accounts whose one-time codes Ondi generates for you — like Google Authenticator, built in.
          </p>
        </div>
        <button
          onClick={() => (addStep === "closed" ? setAddStep("choose") : closeAdd())}
          className="flex items-center gap-1.5 rounded-full bg-ondi-primary px-4 py-2 text-sm font-bold text-white"
        >
          {addStep === "closed" && <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />}
          {addStep === "closed" ? "Add account" : "Cancel"}
        </button>
      </div>

      {/* Pending sign-in approvals — surfaced at the very top, not
          something the person has to remember to check for. */}
      {pending.map((session) => (
        <button
          key={session.id}
          onClick={() => setPushDetail(session)}
          className="flex items-center gap-4 rounded-3xl border border-ondi-primary bg-ondi-mist p-5 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ondi-primary text-white">
            <HugeiconsIcon icon={BellRingIcon} size={18} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Sign-in requested</p>
            <p className="mt-0.5 truncate text-xs text-ondi-muted">
              {session.device} · {session.location}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                respondToPush(session.id, false);
              }}
              disabled={respondingTo === session.id}
              className="rounded-full border border-ondi-border px-3.5 py-1.5 text-xs font-bold text-foreground disabled:opacity-50"
            >
              Deny
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                respondToPush(session.id, true);
              }}
              disabled={respondingTo === session.id}
              className="rounded-full bg-ondi-primary px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Approve
            </button>
          </div>
        </button>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {addStep === "choose" && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-ondi-border p-6">
          <button
            onClick={() => setAddStep("scan")}
            className="flex w-full max-w-[220px] items-center justify-center gap-2 rounded-full bg-ondi-primary px-5 py-3 text-sm font-bold text-white"
          >
            <HugeiconsIcon icon={QrCode01Icon} size={17} strokeWidth={1.75} />
            Scan QR code
          </button>
          <div className="flex items-center gap-3 self-stretch text-xs text-ondi-muted">
            <div className="h-px flex-1 bg-ondi-border" />
            or
            <div className="h-px flex-1 bg-ondi-border" />
          </div>
          <button
            onClick={() => setAddStep("manual")}
            className="text-sm font-bold text-ondi-primary hover:underline"
          >
            Enter setup key manually
          </button>
        </div>
      )}

      {addStep === "scan" && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-ondi-border p-6">
          <button
            onClick={() => setAddStep("choose")}
            className="flex items-center gap-1 self-start text-sm font-medium text-ondi-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.75} />
            Back
          </button>
          <QrScanner
            onScan={handleScan}
            onUnsupported={(message) => {
              setError(message);
              setAddStep("manual");
            }}
          />
          <p className="text-center text-sm text-ondi-muted">
            Point your camera at the QR code shown on the service&apos;s two-factor setup screen.
          </p>
          {adding && <p className="text-sm text-ondi-muted">Adding…</p>}
        </div>
      )}

      {addStep === "manual" && (
        <form onSubmit={submitManual} className="flex flex-col gap-4 rounded-3xl border border-ondi-border p-5">
          <button
            type="button"
            onClick={() => setAddStep("choose")}
            className="flex items-center gap-1 self-start text-sm font-medium text-ondi-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.75} />
            Back
          </button>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Account name
            <input
              required
              placeholder="ibrahim@github"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="rounded-full border border-ondi-border px-3.5 py-2 text-sm outline-none focus:border-ondi-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Issuer
            <input
              placeholder="GitHub"
              value={manualIssuer}
              onChange={(e) => setManualIssuer(e.target.value)}
              className="rounded-full border border-ondi-border px-3.5 py-2 text-sm outline-none focus:border-ondi-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Setup key
            <input
              required
              placeholder="JBSWY3DPEHPK3PXP"
              value={manualSecret}
              onChange={(e) => setManualSecret(e.target.value)}
              className="rounded-full border border-ondi-border px-3.5 py-2 font-mono text-sm tracking-wider outline-none focus:border-ondi-primary"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="self-start rounded-full bg-ondi-primary px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add account"}
          </button>
        </form>
      )}

      <div className="divide-y divide-ondi-border rounded-3xl border border-ondi-border">
        {apps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <HugeiconsIcon icon={QrCode01Icon} size={28} strokeWidth={1.5} className="text-ondi-muted" />
            <p className="text-sm text-ondi-muted">No accounts yet — add one to generate codes right here.</p>
          </div>
        ) : (
          apps.map((app) => (
            <div key={app.id} className="flex items-center justify-between p-5">
              <div>
                <p className="font-medium text-foreground">{app.appName}</p>
                <p className="mt-0.5 text-xs text-ondi-muted">
                  {app.method.toUpperCase()} · added {new Date(app.enrolledAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {app.method === "totp" && app.secret ? (
                  <TotpCode secret={app.secret} />
                ) : (
                  <span className="rounded-full bg-ondi-mist px-2.5 py-1 text-xs text-ondi-primary">Push enabled</span>
                )}
                <button
                  onClick={() => setRemoveTarget(app)}
                  className="text-ondi-muted hover:text-red-600"
                  aria-label="Remove"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Push approval detail — enough context to actually judge whether to
          approve, since approving the wrong one is a real takeover vector. */}
      {pushDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-ondi-border bg-ondi-card p-6 shadow-xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={BellRingIcon} size={20} strokeWidth={1.5} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Sign-in request</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ondi-muted">Device</dt>
                <dd className="text-right font-medium text-foreground">{pushDetail.device}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ondi-muted">Location</dt>
                <dd className="text-right font-medium text-foreground">{pushDetail.location}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ondi-muted">Requested</dt>
                <dd className="text-right font-medium text-foreground">Just now</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-ondi-muted">Not you? Deny and we&apos;ll flag this device.</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => respondToPush(pushDetail.id, false)}
                disabled={respondingTo === pushDetail.id}
                className="flex-1 rounded-full border border-ondi-border px-4 py-2.5 text-sm font-bold text-foreground disabled:opacity-50"
              >
                Deny
              </button>
              <button
                onClick={() => respondToPush(pushDetail.id, true)}
                disabled={respondingTo === pushDetail.id}
                className="flex-1 rounded-full bg-ondi-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Approve
              </button>
            </div>
            <button
              onClick={() => setPushDetail(null)}
              className="mt-3 w-full text-center text-sm font-medium text-ondi-muted hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Remove confirmation — a silent delete would just produce a locked-out
          person the next time that service asks them for a code. */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-ondi-border bg-ondi-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Remove {removeTarget.appName}?</h2>
            <p className="mt-2 text-sm text-ondi-muted">
              You won&apos;t be able to generate codes for {removeTarget.issuer || removeTarget.appName} anymore
              unless you re-add it.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 rounded-full border border-ondi-border px-4 py-2.5 text-sm font-bold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
