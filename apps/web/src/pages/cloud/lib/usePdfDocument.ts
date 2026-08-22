import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Vite's `?url` suffix forces raw-URL asset handling instead of trying to
// bundle/execute the worker as an ES module import — pdf.js runs its actual
// parsing/decoding off the main thread in this worker, so without a real
// URL for it the library falls back to (much slower, UI-blocking) inline
// execution and logs a warning on every document load.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Loads a real PDF document (via pdf.js) from a blob URL and exposes its
 * actual page count — the previous Lightbox only ever handed a PDF to a
 * plain `<iframe>`, which has no page count, no per-page thumbnails, and no
 * way for the rest of the viewer to know which page is showing.
 */
export function usePdfDocument(url: string | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) { setDoc(null); setNumPages(0); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDoc(null);
    const task = pdfjsLib.getDocument(url);
    task.promise
      .then(pdf => {
        if (cancelled) { pdf.destroy(); return; }
        setDoc(pdf);
        setNumPages(pdf.numPages);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  return { doc, numPages, loading, error };
}
