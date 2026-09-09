// ─── Server-side PDF page rasterization ────────────────────────────────────
// A small, deliberately isolated helper: pdfjs-dist's Node ("legacy") build
// auto-detects @napi-rs/canvas for its NodeCanvasFactory, so no native
// build toolchain is needed (no Cairo/GTK, unlike the older `canvas`
// package — @napi-rs/canvas ships prebuilt binaries, which is why it was
// chosen over that alternative).
//
// standardFontDataUrl/cMapUrl MUST be a plain OS filesystem path (Windows
// backslashes included), not a `file://` URL string and not a posix-joined
// path built from a Windows absolute path. pdfjs-dist's Node reader
// (NodeStandardFontDataFactory → node_utils_fetchData) calls Node's
// `fs.promises.readFile(url)` directly on whatever string it's given — a
// `file://` string is not itself a valid fs path (readFile only auto-
// converts an actual `URL` *object*, not a URL-shaped string), and joining
// with `node:path/posix` against a `D:\...` path produces garbage on
// Windows (this is the exact bug found live in the `pdf-to-img` npm
// package, which is why this platform doesn't depend on it). Get this
// wrong and pdfjs silently falls back to default glyph widths — the PDF
// still "renders" with no thrown error, just visibly wrong letter-spacing,
// which would poison every downstream visual comparison with a spurious,
// systematic difference. Verified once via a real rendered screenshot,
// not just because the warnings went away.
import path from 'node:path';
import { createRequire } from 'node:module';

const require2 = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require2.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = path.join(pdfjsDir, 'standard_fonts') + path.sep;
const CMAP_URL = path.join(pdfjsDir, 'cmaps') + path.sep;

export interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  png: Buffer;
}

/** Rasterizes up to `maxPages` pages of a PDF to PNG buffers at the given
 *  scale (2 ≈ 144dpi off a standard 72dpi PDF unit — enough detail for a
 *  visual diff without generating huge images). */
export async function renderPdfPages(bytes: Buffer, opts: { maxPages?: number; scale?: number } = {}): Promise<RenderedPage[]> {
  const { maxPages = 5, scale = 2 } = opts;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const pages: RenderedPage[] = [];
  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      // `any` here, not the DOM `CanvasRenderingContext2D` type — this repo's
      // tsconfig targets `lib: ["ES2022"]` with no DOM lib (a Node API, not a
      // browser one), and @napi-rs/canvas's context shape is close enough to
      // satisfy pdfjs-dist at runtime (its own NodeCanvasFactory is built on
      // the same package) without a matching TS type to import.
      const ctx: any = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({ pageNumber: i, width: canvas.width, height: canvas.height, png: canvas.toBuffer('image/png') });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
