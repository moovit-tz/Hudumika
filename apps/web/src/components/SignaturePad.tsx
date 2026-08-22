// ─── SignaturePad.tsx — shared draw/type/upload signature capture ─────────────
// Extracted from SignPublicPage.tsx's own SignatureCanvas (the signer-facing
// public page), which had no page-specific coupling — every dependency was
// either its own internal state or plain design tokens. Reused wherever this
// platform needs to capture a signature/stamp image: the public signing page
// itself, the tenant company-stamp setting (Settings.tsx EsignSection), and a
// person's own saved signature under their NexusHR profile.

import React, { useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';

type SignMode = 'draw' | 'type' | 'upload';

export function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<SignMode>('draw');
  const [typedName, setTypedName] = useState('');
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const client = 'touches' in e ? e.touches[0] : e;
    return {
      x: (client.clientX - rect.left) * (canvas.width / rect.width),
      y: (client.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (mode !== 'draw') return;
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || mode !== 'draw') return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    // Deliberately a fixed dark ink color, not a theme token — a captured
    // signature is baked onto a PDF page that's always white paper (see
    // sign-pdf.service.ts / .sign-page-canvas-wrap's own reasoning), so it
    // has to read as dark ink regardless of which theme the person is
    // capturing it in right now.
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawn(true);
  }

  function stopDraw() { setIsDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function renderTyped() {
    if (!typedName.trim()) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'italic 48px Georgia, serif';
    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
    setHasDrawn(true);
  }

  function drawImageFile(file: File) {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      setHasDrawn(true);
    };
    img.src = URL.createObjectURL(file);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) drawImageFile(file);
    e.target.value = '';
  }

  function capture() {
    const canvas = canvasRef.current!;
    onCapture(canvas.toDataURL('image/png'));
  }

  return (
    <div>
      {/* Mode tabs */}
      <div style={{ display: 'flex', marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {(['draw', 'type', 'upload'] as SignMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); clearCanvas(); }}
            style={{ flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: mode === m ? 'var(--teal)' : 'var(--bg)', color: mode === m ? 'hsl(var(--primary-foreground))' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Icon name={m === 'draw' ? 'edit' : m === 'type' ? 'fileText' : 'upload'} size={13} />
            {m === 'draw' ? 'Draw' : m === 'type' ? 'Type' : 'Upload'}
          </button>
        ))}
      </div>

      {mode === 'type' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={typedName} onChange={e => setTypedName(e.target.value)}
            placeholder="Type your full name…"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 14 }} />
          <Button variant="default" size="sm" onClick={renderTyped}>Preview</Button>
        </div>
      )}

      <div style={{ border: '2px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', position: 'relative', touchAction: 'none', height: 140 }}>
        <canvas ref={canvasRef} width={520} height={140}
          style={{ display: 'block', width: '100%', height: 140, touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
        {!hasDrawn && mode === 'draw' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--ink3)', pointerEvents: 'none', fontStyle: 'italic' }}>
            Sign here with your mouse or finger
          </div>
        )}
        {!hasDrawn && mode === 'upload' && (
          <div onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) drawImageFile(file); }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', cursor: 'pointer', gap: 6, border: '1.5px dashed var(--border)', borderRadius: 8 }}>
            <Icon name="upload" size={24} style={{ color: 'var(--teal)', opacity: 0.7 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>Upload signature image</span>
            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Click to browse or drag &amp; drop</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <Button variant="outline" size="sm" onClick={clearCanvas}>Clear</Button>
        {mode === 'upload' && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Choose Image…</Button>
          </>
        )}
        <Button variant="default" size="sm" onClick={capture} disabled={!hasDrawn}>
          Use This Signature <Icon name="arrowRight" size={13} />
        </Button>
      </div>
    </div>
  );
}
