"use client";

import { useEffect, useRef, useState } from "react";

interface QrScannerProps {
  onScan: (rawValue: string) => void;
  onUnsupported: (message: string) => void;
}

/**
 * Camera-based QR reader using the native BarcodeDetector API — no new
 * dependency, but only available in Chromium-based browsers today. Callers
 * must handle onUnsupported by falling back to manual entry (see the
 * Authenticator add-account flow), never leave the person on a dead camera
 * view with no way forward.
 */
export function QrScanner({ onScan, onUnsupported }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      onUnsupported("Camera scanning isn't supported in this browser — enter the setup key manually instead.");
      return;
    }

    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }

        // BarcodeDetector isn't in the TS DOM lib yet.
        const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
        } }).BarcodeDetector;
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes.find((c) => c.rawValue?.startsWith("otpauth://"));
            if (hit) {
              onScan(hit.rawValue);
              return;
            }
          } catch {
            // Keep trying — a mid-frame detection failure isn't fatal.
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        onUnsupported("Camera access was denied — enter the setup key manually instead.");
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      {!ready && <p className="absolute text-xs text-white/70">Starting camera…</p>}
    </div>
  );
}
