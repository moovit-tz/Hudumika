"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, FingerPrintIcon, SmartPhone01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import {
  apiFetch,
  formatOtpRateLimitError,
  formatPhone,
  getAccessToken,
  getDeviceFingerprint,
  getStoredUser,
  hasDeliverablePhone,
  setSession,
} from "@/lib/api";
import { AuthGuard } from "@/components/AuthGuard";
import { OtpInput } from "@/components/OtpInput";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";

type Step = "loading" | "name" | "phone" | "phone-otp" | "secure" | "trusting" | "done";

interface Me {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string;
  credentials: { type: string }[];
}

function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const keyboardOpen = useKeyboardOpen();
  const [step, setStep] = useState<Step>("loading");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");

  async function trustDevice() {
    setStep("trusting");
    try {
      const fingerprint = getDeviceFingerprint();
      const body = await apiFetch<{ devices: { id: string; deviceId: string }[] }>("/devices");
      const device = body.devices.find((d) => d.deviceId === fingerprint);
      if (device) {
        await apiFetch(`/devices/${device.id}/trust`, { method: "PATCH", body: JSON.stringify({ trusted: true }) });
      }
    } catch {
      // Non-fatal — device trust can always be set later from Devices.
    }
    setStep("done");
    setTimeout(() => router.push(redirectTo), 1400);
  }

  useEffect(() => {
    // Onboarding is self-gating: a returning user who already has a name,
    // a passkey or PIN, and a trusted current device skips straight through
    // to the dashboard — only what's actually missing gets shown.
    Promise.all([
      apiFetch<Me>("/auth/me"),
      apiFetch<{ credentials: unknown[] }>("/webauthn/credentials").catch(() => ({ credentials: [] })),
      apiFetch<{ devices: { deviceId: string; isTrusted: boolean }[] }>("/devices").catch(() => ({ devices: [] })),
    ])
      .then(([me, passkeys, devices]) => {
        const fingerprint = getDeviceFingerprint();
        const currentDevice = devices.devices.find((d) => d.deviceId === fingerprint);

        if (!me.firstName) {
          setStep("name");
          return;
        }
        if (!hasDeliverablePhone(me.phoneNumber)) {
          setStep("phone");
          return;
        }
        const hasPin = me.credentials.some((c) => c.type === "PASSWORD");
        const hasPasskey = passkeys.credentials.length > 0;
        if (!hasPin && !hasPasskey) {
          setStep("secure");
          return;
        }
        if (!(currentDevice?.isTrusted ?? false)) {
          trustDevice();
          return;
        }
        router.replace(redirectTo);
      })
      .catch(() => router.replace(redirectTo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || undefined }),
      });
      setStep("secure");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your name");
    } finally {
      setBusy(false);
    }
  }

  async function requestPhoneOtp(e: FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/phone/link/initiate", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: formatPhone(phone) }),
      });
      setStep("phone-otp");
    } catch (err) {
      const rateLimited =
        err instanceof Error ? formatOtpRateLimitError(err.message, (err as Error & { retryAfter?: number }).retryAfter) : null;
      setError(
        rateLimited ??
          (err instanceof Error && err.message === "phone_already_in_use"
            ? "That number is already linked to another Ondi account."
            : err instanceof Error
              ? err.message
              : "Failed to send code")
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhoneOtp(e: FormEvent) {
    e.preventDefault();
    if (phoneCode.length < 6) return;
    setBusy(true);
    setError("");
    try {
      const body = await apiFetch<{ phoneNumber: string }>("/auth/phone/link/verify", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: formatPhone(phone), code: phoneCode }),
      });
      const user = getStoredUser();
      setSession(getAccessToken() ?? "", undefined, { ...user, phoneNumber: body.phoneNumber });
      setPhoneCode("");
      setStep("secure");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setBusy(false);
    }
  }

  async function setupPasskey() {
    setBusy(true);
    setError("");
    try {
      const options = await apiFetch("/webauthn/register/options", { method: "POST" });
      const response = await startRegistration({ optionsJSON: options as never });
      await apiFetch("/webauthn/register/verify", {
        method: "POST",
        body: JSON.stringify({ response, deviceName: guessDeviceName() }),
      });
      trustDevice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set up a passkey on this device");
      setBusy(false);
    }
  }

  async function setPinCode(e: FormEvent) {
    e.preventDefault();
    if (pin.length < 6) return;
    setBusy(true);
    setError("");
    try {
      const user = getStoredUser();
      await apiFetch("/auth/security-code/set", { method: "POST", body: JSON.stringify({ userId: user?.id, code: pin }) });
      trustDevice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set your PIN");
      setBusy(false);
    }
  }

  return (
    <main
      className={`flex min-h-dvh flex-col items-center bg-background px-6 py-10 ${
        keyboardOpen ? "justify-start" : "justify-center"
      }`}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-sm">
        {step === "loading" && <p className="text-center text-sm text-ondi-muted">Setting things up…</p>}

        {step === "name" && (
          <form onSubmit={saveName} className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={UserAdd01Icon} size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">What should we call you?</h1>
              <p className="mt-1 text-sm text-ondi-muted">This is how you&apos;ll appear across apps you sign in to with Ondi.</p>
            </div>
            <div className="flex w-full flex-col gap-3">
              <input
                required
                autoFocus
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-full border border-ondi-border px-4 py-2.5 text-base text-foreground outline-none focus:border-ondi-primary"
              />
              <input
                placeholder="Last name (optional)"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-full border border-ondi-border px-4 py-2.5 text-base text-foreground outline-none focus:border-ondi-primary"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ondi-primary px-4 py-2.5 font-bold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={requestPhoneOtp} className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={SmartPhone01Icon} size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Add your phone number</h1>
              <p className="mt-1 text-sm text-ondi-muted">
                So you can approve sign-ins and recover your account if you ever lose access.
              </p>
            </div>
            <label className="flex w-full flex-col gap-1.5 text-left text-sm font-medium text-foreground">
              Phone number
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 border-r border-ondi-border pr-3 text-sm font-medium text-ondi-muted">
                  +255
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  autoFocus
                  placeholder="700 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/^0+/, ""))}
                  className="w-full rounded-full border border-ondi-border py-2.5 pl-[4.5rem] pr-4 text-base text-foreground outline-none focus:border-ondi-primary"
                />
              </div>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ondi-primary px-4 py-2.5 font-bold text-white disabled:opacity-60"
            >
              {busy ? "Sending…" : "Continue"}
            </button>
          </form>
        )}

        {step === "phone-otp" && (
          <form onSubmit={verifyPhoneOtp} className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={SmartPhone01Icon} size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Verify your number</h1>
              <p className="mt-1 text-sm text-ondi-muted">We sent a 6-digit code to +{formatPhone(phone)}.</p>
            </div>
            <OtpInput value={phoneCode} onChange={setPhoneCode} autoFocus error={!!error} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ondi-primary px-4 py-2.5 font-bold text-white disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setPhoneCode("");
                setError("");
              }}
              className="text-sm text-ondi-muted hover:text-foreground"
            >
              Use a different number
            </button>
          </form>
        )}

        {step === "secure" && !pinMode && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={FingerPrintIcon} size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Secure your identity</h1>
              <p className="mt-1 text-sm text-ondi-muted">
                Set up a passkey to sign in with your device&apos;s biometrics or PIN — faster and safer than a code.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={setupPasskey}
              disabled={busy}
              className="w-full rounded-full bg-ondi-primary px-4 py-2.5 font-bold text-white disabled:opacity-60"
            >
              {busy ? "Setting up…" : "Set up a passkey"}
            </button>
            <button onClick={() => setPinMode(true)} className="text-sm text-ondi-muted hover:text-foreground">
              Use a PIN instead
            </button>
          </div>
        )}

        {step === "secure" && pinMode && (
          <form onSubmit={setPinCode} className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={FingerPrintIcon} size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Set a security PIN</h1>
              <p className="mt-1 text-sm text-ondi-muted">Choose a 6-digit PIN to secure your Ondi identity.</p>
            </div>
            <OtpInput value={pin} onChange={setPin} autoFocus />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ondi-primary px-4 py-2.5 font-bold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Continue"}
            </button>
            <button type="button" onClick={() => setPinMode(false)} className="text-sm text-ondi-muted hover:text-foreground">
              Back
            </button>
          </form>
        )}

        {step === "trusting" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ondi-mist text-ondi-primary">
              <HugeiconsIcon icon={SmartPhone01Icon} size={22} strokeWidth={1.5} />
            </div>
            <p className="text-sm text-ondi-muted">Trusting this device…</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/40">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-semibold text-foreground">This device is now trusted</h1>
            <p className="text-sm text-ondi-muted">Taking you to Ondi Auth…</p>
          </div>
        )}
      </div>
    </main>
  );
}

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Passkey";
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <OnboardingFlow />
      </Suspense>
    </AuthGuard>
  );
}
