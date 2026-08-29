"use client";

import { useEffect, useRef } from "react";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  /** "dark" is a fixed glass-on-gradient look for the sign-in screens,
   * independent of the app's light/dark theme toggle (those screens always
   * render on a dark brand gradient regardless of the visitor's OS theme). */
  variant?: "light" | "dark";
}

/**
 * Six-box code entry used for OTP/PIN screens. A single boxed <input>
 * clipped to maxLength doesn't render as separate digit boxes and fights
 * iOS/Android SMS autofill (which drops the whole code into whichever field
 * is focused) — this splits/redistributes digits across boxes on every
 * change so both manual typing and autofill land correctly.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  error,
  variant = "light",
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (value.length === length) onComplete?.(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function setDigitAt(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    // Autofill (or a paste) can drop more than one digit into a single box —
    // spread it starting at this position instead of truncating to one char.
    const merged = (value.slice(0, index) + clean + value.slice(index + clean.length)).slice(0, length);
    onChange(merged);
    const nextIndex = Math.min(index + clean.length, length - 1);
    refs.current[nextIndex]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1) + value.slice(index));
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={length}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => setDigitAt(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`h-12 w-10 rounded-[10px] border text-center text-lg font-semibold outline-none transition sm:h-13 sm:w-12 ${
            variant === "dark"
              ? `border-white/25 bg-white/10 text-white backdrop-blur-sm placeholder:text-white/40 ${
                  error ? "border-red-400 focus:border-red-400" : "focus:border-white/60"
                }`
              : `bg-background text-foreground ${
                  error ? "border-red-500 focus:border-red-500" : "border-ondi-border focus:border-ondi-primary"
                }`
          }`}
        />
      ))}
    </div>
  );
}
