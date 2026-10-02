import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─── HSV ↔ Hex conversions ───────────────────────────────────────────────────

interface HSV { h: number; s: number; v: number }

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100;
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, q, p, p, t, v],
    [t, v, v, q, p, p],
    [p, p, t, v, v, q],
  ].map(ch => ch[i]);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(...hsvToRgb(h, s, v));
}

function hexToHsv(hex: string): HSV {
  const c = hex.replace('#', '');
  if (c.length !== 6) return { h: 0, s: 100, v: 100 };
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: max === 0 ? 0 : Math.round((d / max) * 100), v: Math.round(max * 100) };
}

function isValidHex(s: string) { return /^#[0-9a-fA-F]{6}$/.test(s); }

// ─── Drag hook ────────────────────────────────────────────────────────────────

function useDrag(
  ref: React.RefObject<HTMLElement | null>,
  onMove: (x: number, y: number) => void,
) {
  const dragging = useRef(false);

  const getPos = useCallback((e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onMove(x, y);
  }, [ref, onMove]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const down = (e: PointerEvent) => { dragging.current = true; el.setPointerCapture(e.pointerId); getPos(e); };
    const move = (e: PointerEvent) => { if (dragging.current) getPos(e); };
    const up = () => { dragging.current = false; };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
  }, [ref, getPos]);
}

// ─── ColorPicker ─────────────────────────────────────────────────────────────

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value || '#1257c6'));
  const [hexInput, setHexInput] = useState(value || '#1257c6');
  const canvasRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Sync inbound value changes
  useEffect(() => {
    if (isValidHex(value) && value.toLowerCase() !== hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase()) {
      const next = hexToHsv(value);
      setHsv(next);
      setHexInput(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(next: HSV) {
    const hex = hsvToHex(next.h, next.s, next.v);
    setHexInput(hex);
    onChange(hex);
  }

  // SB canvas drag
  useDrag(canvasRef, useCallback((x: number, y: number) => {
    const next = { h: hsv.h, s: Math.round(x * 100), v: Math.round((1 - y) * 100) };
    setHsv(next);
    emit(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsv.h]));

  // Hue slider drag
  useDrag(hueRef, useCallback((x: number) => {
    const next = { ...hsv, h: Math.round(x * 360) };
    setHsv(next);
    emit(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsv.s, hsv.v]));

  function onHexInput(raw: string) {
    setHexInput(raw);
    const clean = raw.startsWith('#') ? raw : `#${raw}`;
    if (isValidHex(clean)) {
      const next = hexToHsv(clean);
      setHsv(next);
      onChange(clean);
    }
  }

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  async function copyHex() {
    try { await navigator.clipboard.writeText(hex); } catch { /* clipboard blocked in sandbox */ }
  }

  async function pickFromScreen() {
    try {
      // EyeDropper API — Chromium 95+. Gracefully absent in Firefox/Safari.
      const eyeDropper = new (window as any).EyeDropper();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        const next = hexToHsv(result.sRGBHex);
        setHsv(next);
        setHexInput(result.sRGBHex);
        onChange(result.sRGBHex);
      }
    } catch {
      // User cancelled or API not supported — do nothing.
    }
  }

  const eyeDropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <div style={{ width: 240, userSelect: 'none' }}>
      {/* SB gradient canvas */}
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 160,
          borderRadius: 8,
          cursor: 'crosshair',
          background: [
            `linear-gradient(to bottom, transparent, black)`,
            `linear-gradient(to right, white, hsl(${hsv.h}, 100%, 50%))`,
          ].join(', '),
          marginBottom: 10,
          touchAction: 'none',
        }}
      >
        {/* Handle */}
        <div
          style={{
            position: 'absolute',
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            transform: 'translate(-50%, -50%)',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,.3), 0 1px 4px rgba(0,0,0,.4)',
            pointerEvents: 'none',
            background: hex,
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 14,
          borderRadius: 7,
          cursor: 'ew-resize',
          background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          marginBottom: 12,
          touchAction: 'none',
        }}
      >
        {/* Hue thumb */}
        <div
          style={{
            position: 'absolute',
            left: `${(hsv.h / 360) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,.3)',
            background: `hsl(${hsv.h}, 100%, 50%)`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Hex + preview + eyedropper + copy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: hex,
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={e => onHexInput(e.target.value)}
          style={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: 13,
            background: 'var(--input, var(--muted))',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 8px',
            color: 'var(--foreground)',
            outline: 'none',
            minWidth: 0,
          }}
          maxLength={7}
          spellCheck={false}
        />
        {eyeDropperSupported && (
          <button
            type="button"
            onClick={pickFromScreen}
            title="Pick color from screen"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--muted)',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              flexShrink: 0,
            }}
          >
            {/* Eyedropper SVG */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 22 1-1h3l9-9"/>
              <path d="M3 21v-3l9-9"/>
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8Z"/>
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={copyHex}
          title="Copy hex"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--muted)',
            cursor: 'pointer',
            color: 'var(--muted-foreground)',
            flexShrink: 0,
            fontSize: 14,
          }}
        >
          ⧉
        </button>
      </div>
    </div>
  );
}
