"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { API_URL, formatOtpRateLimitError, formatPhone, getDeviceFingerprint, getDeviceLabel, setSession } from "@/lib/api";
import { renderGoogleButton } from "@/lib/googleAuth";
import { OtpInput } from "@/components/OtpInput";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";

type Step = "welcome" | "phone" | "otp";

function LegalFooter() {
  return (
    <p className="px-8 pb-2 text-center text-[11px] leading-relaxed text-white/45">
      By continuing, you agree to Ondi&apos;s{" "}
      <Link href="/terms" className="underline hover:text-white/70">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline hover:text-white/70">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyboardOpen = useKeyboardOpen();
  // Onboarding is self-gating (skips instantly for anyone already fully set
  // up), so every login routes through it, carrying along wherever the
  // caller actually wanted to land — e.g. back to /authorize for a
  // relying-party sign-in initiated from a third-party app.
  const redirectTo = searchParams.get("redirect") || "/";
  const onboardingUrl = `/onboarding?redirect=${encodeURIComponent(redirectTo)}`;
  const [step, setStep] = useState<Step>("welcome");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  async function handleGoogleCredential(idToken: string) {
    setGoogleLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/federated/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          deviceFingerprint: getDeviceFingerprint(),
          deviceName: getDeviceLabel(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Google sign-in failed");
      setSession(data.access_token, data.refresh_token, data.user);
      router.push(onboardingUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  }

  useEffect(() => {
    if (step !== "welcome" || !googleBtnRef.current) return;
    renderGoogleButton(googleBtnRef.current, handleGoogleCredential, { pill: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formatPhone(phone),
          deviceFingerprint: getDeviceFingerprint(),
          deviceName: getDeviceLabel(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatOtpRateLimitError(data.error, data.retryAfter) ?? data.error ?? "Failed to send code");
      }
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formatPhone(phone),
          otp: code,
          deviceFingerprint: getDeviceFingerprint(),
          deviceName: getDeviceLabel(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error === "otp_expired" ? "Code expired. Request a new one." : "Incorrect code.");
      }
      setSession(data.access_token, data.refresh_token, data.user);
      router.push(onboardingUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    // min-h-dvh (not a fixed h-dvh/overflow-hidden) so that when the mobile
    // on-screen keyboard opens, the page can scroll to keep the focused
    // field visible instead of the keyboard clipping it out of view.
    <main
      className="auth-gradient flex min-h-dvh flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {step !== "welcome" && (
        <button
          onClick={() => {
            setError("");
            setStep(step === "otp" ? "phone" : "welcome");
          }}
          aria-label="Back"
          className="relative z-10 mt-2 ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/10"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={22} strokeWidth={1.75} />
        </button>
      )}

      <div
        className={`relative z-10 flex flex-1 flex-col px-6 ${keyboardOpen ? "justify-start pt-6" : "justify-center"}`}
      >
        {step === "welcome" && (
          <div className="mx-auto flex w-full max-w-sm flex-col items-center">
            <img
              src="/icon.svg"
              alt=""
              className="h-14 w-14 drop-shadow-[0_8px_20px_rgba(80,90,220,.55)]"
            />
            <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-white">Welcome to Ondi</h1>
            <p className="mx-6 mt-1.5 text-center text-[13px] leading-relaxed text-white/70">
              Your identity. Your access. Your control.
            </p>

            {error && <p className="mt-6 text-center text-sm text-red-300">{error}</p>}

            <div className="mt-10 flex w-full flex-col gap-2.5">
              <div ref={googleBtnRef} className="relative w-full">
                {googleLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-sm text-white">
                    Signing in…
                  </div>
                )}
              </div>
              <button
                onClick={() => setStep("phone")}
                className="w-full rounded-full border border-white/28 bg-white/12 py-3.5 text-[13.5px] font-bold text-white backdrop-blur-sm active:bg-white/18"
              >
                Continue with phone number
              </button>
            </div>
          </div>
        )}

        {step === "phone" && (
          <form onSubmit={requestOtp} className="mx-auto flex w-full max-w-sm flex-col items-center">
            <h1 className="mt-6 text-center text-2xl font-extrabold tracking-tight text-white">
              What&apos;s your phone number?
            </h1>
            <p className="mx-4 mt-1.5 text-center text-[13px] leading-relaxed text-white/70">
              We&apos;ll use your number to create or find your Ondi identity.
            </p>

            <div className="relative mt-6 w-full">
              <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 border-r border-white/30 pr-3 text-sm font-bold text-white">
                +255
              </span>
              <input
                type="tel"
                inputMode="tel"
                required
                autoFocus
                placeholder="700 000 000"
                value={phone}
                // The +255 prefix is fixed in the UI, so a leading 0 typed
                // here (the local dialing convention) would otherwise
                // double up with it once formatPhone prepends 255 — strip
                // it live rather than only at submit time.
                onChange={(e) => setPhone(e.target.value.replace(/^0+/, ""))}
                className="w-full rounded-2xl border border-white/22 bg-white/8 py-3.5 pl-[4.75rem] pr-4 text-base text-white placeholder-white/40 backdrop-blur-sm outline-none focus:border-white/50"
              />
            </div>
            {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full rounded-full bg-gradient-to-br from-[#5b6bf0] to-[#4253d1] py-3.5 text-[13.5px] font-bold text-white shadow-[0_8px_20px_rgba(80,90,220,.4)] transition disabled:opacity-60"
            >
              {loading ? "Sending…" : "Continue"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="mx-auto flex w-full max-w-sm flex-col items-center">
            <h1 className="mt-6 text-center text-2xl font-extrabold tracking-tight text-white">Verify your number</h1>
            <p className="mx-4 mt-1.5 text-center text-[13px] leading-relaxed text-white/70">
              We sent a 6-digit code to +{formatPhone(phone)}.
            </p>

            <div className="mt-8">
              <OtpInput value={code} onChange={setCode} autoFocus error={!!error} variant="dark" />
            </div>
            {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full rounded-full bg-gradient-to-br from-[#5b6bf0] to-[#4253d1] py-3.5 text-[13.5px] font-bold text-white shadow-[0_8px_20px_rgba(80,90,220,.4)] transition disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}
      </div>

      <div className="relative z-10">
        <LegalFooter />
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
