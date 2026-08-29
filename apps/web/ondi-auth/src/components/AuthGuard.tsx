"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    // Gating render on a token check requires setting state from the effect
    // itself — there's no external event to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [router]);

  // Rendering nothing here used to leave a plain, unstyled blank screen for
  // ~1-3s on every fresh load (reads as "is this broken?", especially in
  // dark mode where an empty <body> and the app's own dark background are
  // visually identical) — a branded loading state makes the wait legible.
  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <img src="/icon.svg" alt="" className="h-10 w-10 animate-pulse" />
      </div>
    );
  }
  return <>{children}</>;
}
