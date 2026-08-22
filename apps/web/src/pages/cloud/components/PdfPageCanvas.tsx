import React, { useEffect, useRef } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * Renders one real PDF page to a canvas at the given pdf.js `scale`, sized
 * for `devicePixelRatio` so text stays sharp on high-DPI screens instead of
 * looking like a blown-up raster (canvas.width/height are the real pixel
 * buffer, canvas.style.width/height are the CSS-visible size — the two are
 * deliberately different).
 */
export function PdfPageCanvas({
  doc, pageNumber, scale, className, style, onSize,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  className?: string;
  style?: React.CSSProperties;
  onSize?: (size: { width: number; height: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    // pdf.js throws if a second render() starts on the same canvas before
    // the first finishes — cancel whatever this component was already
    // rendering (a prior page, or the same page at a prior zoom) first.
    renderTaskRef.current?.cancel();

    doc.getPage(pageNumber).then(page => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      onSize?.({ width: viewport.width, height: viewport.height });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      renderTaskRef.current = task;
      task.promise.catch(() => { /* cancelled render, not a real error */ });
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, scale]);

  return <canvas ref={canvasRef} className={className} style={style} />;
}
