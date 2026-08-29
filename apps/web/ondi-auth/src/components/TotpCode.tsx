"use client";

import { useEffect, useState } from "react";
import { generateTotp, totpSecondsRemaining } from "@/lib/totp";

const CLIPBOARD_CLEAR_MS = 30_000;

export function TotpCode({ secret }: { secret: string }) {
  const [code, setCode] = useState("······");
  const [remaining, setRemaining] = useState(totpSecondsRemaining());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const value = await generateTotp(secret);
      if (!cancelled) setCode(value);
    }

    tick();
    const interval = setInterval(() => {
      setRemaining(totpSecondsRemaining());
      tick();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [secret]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // A stale 2FA code sitting in clipboard history is a real (if minor)
      // exposure — clear it automatically rather than leaving it there
      // indefinitely. Unconditional clear: reading the clipboard back to
      // check "is it still ours" would need its own permission prompt.
      setTimeout(() => {
        navigator.clipboard.writeText("").catch(() => {});
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      // Clipboard API unavailable/denied — the code is still visible on
      // screen, so this isn't a dead end, just not a one-tap copy.
    }
  }

  return (
    <button
      type="button"
      onClick={copyCode}
      className="flex items-center gap-3 rounded-xl px-1 py-0.5 text-left transition hover:bg-ondi-mist active:bg-ondi-mist"
      aria-label="Tap to copy code"
    >
      <span className="font-mono text-xl tracking-[0.2em] text-foreground">
        {code.slice(0, 3)} {code.slice(3)}
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ondi-border text-[10px] text-ondi-muted">
        {remaining}
      </span>
      {copied && <span className="text-xs font-medium text-ondi-primary">Copied</span>}
    </button>
  );
}
