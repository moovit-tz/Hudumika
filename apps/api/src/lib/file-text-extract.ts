/**
 * Best-effort text extraction from an uploaded file, for full-text search
 * (cloud_files.search_text → the search_tsv generated column, migration 455).
 *
 * Plain-text families are decoded directly; PDFs go through pdfjs-dist's
 * text layer (same dependency + import path sign-pdf-render.service.ts
 * already uses). Everything else returns null — the file is still findable
 * by name, just not by content. Output is capped so a huge document can't
 * bloat the row or the tsvector.
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const require2 = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require2.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = path.join(pdfjsDir, 'standard_fonts') + path.sep;
const CMAP_URL = path.join(pdfjsDir, 'cmaps') + path.sep;

const MAX_CHARS = 200_000;      // ~200KB of text is plenty for search relevance
const PDF_MAX_PAGES = 40;

const TEXT_EXT = new Set([
  'txt', 'text', 'log', 'csv', 'tsv', 'md', 'markdown', 'json', 'jsonl',
  'xml', 'yaml', 'yml', 'ini', 'conf', 'html', 'htm', 'rtf', 'srt', 'vtt',
]);

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

async function extractPdfText(buf: Buffer): Promise<string | null> {
  try {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      isEvalSupported: false,
    }).promise;
    try {
      const pages = Math.min(doc.numPages, PDF_MAX_PAGES);
      const parts: string[] = [];
      let total = 0;
      for (let i = 1; i <= pages && total < MAX_CHARS; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = (content.items as any[]).map((it) => it.str ?? '').join(' ');
        parts.push(text);
        total += text.length;
        page.cleanup();
      }
      return collapse(parts.join(' ')) || null;
    } finally {
      await doc.destroy();
    }
  } catch (err: any) {
    console.warn('[file-text-extract] PDF text extraction failed:', err?.message);
    return null;
  }
}

/**
 * @param ext  lowercase file extension (no dot)
 */
export async function extractText(buf: Buffer, ext: string, mimeType?: string | null): Promise<string | null> {
  const e = (ext || '').toLowerCase();
  if (e === 'pdf' || mimeType === 'application/pdf') return extractPdfText(buf);
  if (TEXT_EXT.has(e) || (mimeType?.startsWith('text/') ?? false)) {
    // Bail if it's clearly binary (a NUL in the first 4KB).
    const head = buf.subarray(0, 4096);
    if (head.includes(0)) return null;
    return collapse(buf.toString('utf8')) || null;
  }
  return null;
}
