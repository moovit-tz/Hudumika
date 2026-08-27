// Stirling-PDF (https://github.com/Stirling-Tools/Stirling-PDF) — a
// self-hosted, MIT-licensed PDF toolkit. Real endpoints below, not guessed:
// verified by reading the actual controller/request-DTO source on GitHub
// (app/core/src/main/java/stirling/software/SPDF/controller/api/**) rather
// than assuming a URL shape, per this codebase's own rule against fabricating
// endpoints. Every tool here is in app/core (MIT) — Stirling-PDF is
// "open-core": app/proprietary/ (accounts, teams, SSO, e-signature workflow)
// and frontend/editor/src/ (their own in-place rich editor UI) sit under a
// separate, paid license and are deliberately NOT what this file calls.
//
// Unlike Nutrient (lib/nutrient — a client-side WASM SDK with a domain-locked
// key that's fine to ship to the browser), Stirling-PDF is a server you run
// yourself (`docker run -p 8080:8080 docker.stirlingpdf.com/stirlingtools/
// stirling-pdf:latest`) — its base URL is a private, often internal-network
// address, not something to hand to the browser, so every call here is
// server-to-server: the frontend calls Hudumika's own /v1/sign/pdf-tools/*
// routes, which call this service, which calls the tenant's/platform's
// configured Stirling-PDF instance. Same "real seam, fails loudly without
// config" shape as bank-connector.ts and payment-gateway.ts.
import { dbPlatform } from '../db/client.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export async function getStirlingPdfBaseUrl(): Promise<string | null> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  if (!row) return null;
  const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
  const url = settings?.['stirling-pdf']?.baseUrl;
  return url ? String(url).replace(/\/+$/, '') : null;
}

async function callStirlingPdf(path: string, form: FormData): Promise<Buffer> {
  const baseUrl = await getStirlingPdfBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Stirling-PDF is not configured — a SuperAdmin needs to run a Stirling-PDF instance ' +
      '(docker run -p 8080:8080 docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest) and set its ' +
      'base URL at the platform level before these PDF tools can run.'
    );
  }
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', body: form as any });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Stirling-PDF rejected the request (${res.status})${text ? `: ${text.slice(0, 300)}` : '.'}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function fileForm(fileBuffer: Buffer, fileName: string, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('fileInput', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), fileName);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

/** POST /api/v1/general/rotate-pdf — fields: fileInput, angle (degrees, e.g. 90/180/270). */
export async function rotatePdf(fileBuffer: Buffer, fileName: string, angle: number): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/rotate-pdf', fileForm(fileBuffer, fileName, { angle: String(angle) }));
}

/** POST /api/v1/general/merge-pdfs — multiple fileInput parts, in the order supplied,
 *  plus sortType/removeCertSign (both required by the live schema, no server-side
 *  default applied when omitted — verified against the running instance's own
 *  /v1/api-docs, not assumed from source). */
export async function mergePdfs(files: { buffer: Buffer; fileName: string }[]): Promise<Buffer> {
  const form = new FormData();
  for (const f of files) form.append('fileInput', new Blob([new Uint8Array(f.buffer)], { type: 'application/pdf' }), f.fileName);
  form.append('sortType', 'orderProvided');
  form.append('removeCertSign', 'true');
  return callStirlingPdf('/api/v1/general/merge-pdfs', form);
}

/** POST /api/v1/security/add-watermark — fields: fileInput, watermarkType ('text'),
 *  watermarkText, fontSize, rotation, opacity (0-1), widthSpacer, heightSpacer. */
export async function addWatermark(
  fileBuffer: Buffer, fileName: string,
  opts: { text: string; fontSize?: number; rotation?: number; opacity?: number; widthSpacer?: number; heightSpacer?: number },
): Promise<Buffer> {
  return callStirlingPdf('/api/v1/security/add-watermark', fileForm(fileBuffer, fileName, {
    watermarkType: 'text',
    watermarkText: opts.text,
    fontSize: String(opts.fontSize ?? 30),
    rotation: String(opts.rotation ?? 45),
    opacity: String(opts.opacity ?? 0.5),
    widthSpacer: String(opts.widthSpacer ?? 50),
    heightSpacer: String(opts.heightSpacer ?? 50),
    convertPDFToImage: 'false',
    alphabet: 'roman',
    customColor: '#d3d3d3',
  }));
}

/** POST /api/v1/security/auto-redact — fields: fileInput, listOfText (comma-separated
 *  search terms), useRegex, wholeWordSearch, redactColor (hex), customPadding. */
export async function autoRedact(
  fileBuffer: Buffer, fileName: string,
  opts: { searchTerms: string[]; useRegex?: boolean; wholeWordSearch?: boolean; redactColor?: string },
): Promise<Buffer> {
  return callStirlingPdf('/api/v1/security/auto-redact', fileForm(fileBuffer, fileName, {
    listOfText: opts.searchTerms.join(','),
    useRegex: String(opts.useRegex ?? false),
    wholeWordSearch: String(opts.wholeWordSearch ?? false),
    redactColor: opts.redactColor ?? '#000000',
    customPadding: '2',
    convertPDFToImage: 'false',
  }));
}

/** POST /api/v1/misc/ocr-pdf — fields: fileInput, languages (repeated), ocrType. */
export async function ocrPdf(fileBuffer: Buffer, fileName: string, languages: string[] = ['eng']): Promise<Buffer> {
  const form = fileForm(fileBuffer, fileName, { ocrType: 'force', ocrRenderType: 'hocr' });
  for (const lang of languages) form.append('languages', lang);
  return callStirlingPdf('/api/v1/misc/ocr-pdf', form);
}

/** POST /api/v1/misc/compress-pdf — fields: fileInput, optimizeLevel (1-9), plus
 *  expectedOutputSize/grayscale/linearize/normalize (all required by the live schema).
 *  expectedOutputSize is set to the *source* file's own size, not Stirling's documented
 *  "25KB" default — that default is a real ceiling the compressor will target, and would
 *  devastate quality on anything bigger than a postage stamp; sizing it to (at most) the
 *  original keeps optimizeLevel as the only thing actually driving compression. */
export async function compressPdf(fileBuffer: Buffer, fileName: string, optimizeLevel = 5): Promise<Buffer> {
  const expectedOutputSize = `${Math.max(1, Math.ceil(fileBuffer.length / 1024))}KB`;
  return callStirlingPdf('/api/v1/misc/compress-pdf', fileForm(fileBuffer, fileName, {
    optimizeLevel: String(optimizeLevel),
    expectedOutputSize,
    grayscale: 'false',
    linearize: 'false',
    normalize: 'false',
  }));
}

// ── The rest of this file — added when Stirling-PDF's tool count was
// expanded from 6 to 26. Every endpoint below was verified the same way as
// the six above (reading Stirling-PDF's real controller source on GitHub,
// main branch, not guessed) — each function's doc comment names the exact
// controller class it corresponds to. A handful of tools from the original
// request (Bates Numbering, Delete Annotations, Alternate & Mix, Deskew,
// Flip, Header & Footer, Grayscale, Split-by-text) are deliberately NOT
// here: no matching controller/DTO could be confirmed from source, and
// this codebase's own rule is to not fabricate an endpoint that might
// silently 404 or take the wrong field names. HTML/JPG/Word→PDF are also
// not here for a different reason — they convert a *different* file type
// into a PDF, so they belong on the editor's document-upload step, not
// this panel (which always operates on the PDF already loaded).

/** POST /api/v1/general/crop — fields: fileInput, x, y, width, height. */
export async function cropPdf(fileBuffer: Buffer, fileName: string, box: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/crop', fileForm(fileBuffer, fileName, {
    x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height),
  }));
}

/** POST /api/v1/general/edit-table-of-contents (EditTableOfContentsController) —
 *  fields: fileInput, bookmarkData (JSON string of [{title, pageNumber, children:[]}]). */
export async function editBookmarks(fileBuffer: Buffer, fileName: string, bookmarks: { title: string; pageNumber: number }[]): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/edit-table-of-contents', fileForm(fileBuffer, fileName, {
    bookmarkData: JSON.stringify(bookmarks.map(b => ({ title: b.title, pageNumber: b.pageNumber, children: [] }))),
  }));
}

/** POST /api/v1/general/remove-pages (RearrangePagesPDFController) —
 *  fields: fileInput, pageNumbers (comma-separated pages/ranges to delete). */
export async function deletePages(fileBuffer: Buffer, fileName: string, pageNumbers: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/remove-pages', fileForm(fileBuffer, fileName, { pageNumbers }));
}

/** POST /api/v1/general/rearrange-pages (RearrangePagesPDFController) —
 *  fields: fileInput, pageNumbers (new page order, comma-separated), customMode
 *  (REVERSE_ORDER/DUPLICATE/BOOKLET_SORT/... — omit when pageNumbers gives an
 *  explicit order, which is what a drag-to-reorder UI produces). */
export async function rearrangePages(fileBuffer: Buffer, fileName: string, pageNumbers: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/rearrange-pages', fileForm(fileBuffer, fileName, { pageNumbers, customMode: 'CUSTOM' }));
}

/** POST /api/v1/general/multi-page-layout (MultiPageLayoutController) — "N-up":
 *  fields: fileInput, pagesPerSheet, mode ('DEFAULT' — the grid Stirling picks
 *  for the given pagesPerSheet — vs 'CUSTOM', which additionally needs rows/cols). */
export async function nUpPdf(fileBuffer: Buffer, fileName: string, pagesPerSheet: number): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/multi-page-layout', fileForm(fileBuffer, fileName, {
    mode: 'DEFAULT', pagesPerSheet: String(pagesPerSheet),
  }));
}

/** POST /api/v1/general/scale-pages (ScalePagesController) — "Resize":
 *  fields: fileInput, pageSize (A4/LETTER/.../'KEEP'), scaleFactor. */
export async function resizePdf(fileBuffer: Buffer, fileName: string, pageSize: string, scaleFactor = 1): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/scale-pages', fileForm(fileBuffer, fileName, {
    pageSize, scaleFactor: String(scaleFactor),
  }));
}

/** POST /api/v1/general/split-pages (SplitPDFController) — fields: fileInput,
 *  pageNumbers (the pages to split *after*, comma-separated). Returns a ZIP
 *  of the resulting PDFs, not a single PDF — the caller downloads it. */
export async function splitPages(fileBuffer: Buffer, fileName: string, pageNumbers: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/split-pages', fileForm(fileBuffer, fileName, { pageNumbers }));
}

/** POST /api/v1/general/split-pdf-by-chapters (SplitPdfByChaptersController) —
 *  fields: fileInput, bookmarkLevel (which ToC depth to split on), allowDuplicates.
 *  Returns a ZIP. */
export async function splitByChapters(fileBuffer: Buffer, fileName: string, bookmarkLevel = 1): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/split-pdf-by-chapters', fileForm(fileBuffer, fileName, {
    bookmarkLevel: String(bookmarkLevel), allowDuplicates: 'false', includeMetadata: 'false',
  }));
}

/** POST /api/v1/general/split-by-size-or-count (SplitPdfBySizeController) —
 *  fields: fileInput, splitType (0=by file size, 1=by page count, 2=by doc
 *  count), splitValue (e.g. "10MB" or a number). Returns a ZIP. */
export async function splitBySize(fileBuffer: Buffer, fileName: string, splitValue: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/general/split-by-size-or-count', fileForm(fileBuffer, fileName, {
    splitType: '0', splitValue,
  }));
}

/** POST /api/v1/misc/add-page-numbers (PageNumbersController) — fields:
 *  fileInput, startingNumber, position (1-9 grid), customText (supports
 *  {n}/{total}/{filename} placeholders), fontSize. */
export async function addPageNumbers(fileBuffer: Buffer, fileName: string, opts: { startingNumber?: number; position?: number; customText?: string; fontSize?: number } = {}): Promise<Buffer> {
  return callStirlingPdf('/api/v1/misc/add-page-numbers', fileForm(fileBuffer, fileName, {
    startingNumber: String(opts.startingNumber ?? 1),
    position: String(opts.position ?? 8),
    customText: opts.customText ?? '{n}',
    fontSize: String(opts.fontSize ?? 12),
    pageNumbers: 'all',
    fontType: 'helvetica',
  }));
}

/** POST /api/v1/misc/update-metadata (MetadataController) — fields: fileInput,
 *  deleteAll, title, author, subject, keywords, creator, producer. */
export async function updatePdfMetadata(fileBuffer: Buffer, fileName: string, meta: { title?: string; author?: string; subject?: string; keywords?: string }): Promise<Buffer> {
  return callStirlingPdf('/api/v1/misc/update-metadata', fileForm(fileBuffer, fileName, {
    deleteAll: 'false',
    title: meta.title ?? '', author: meta.author ?? '', subject: meta.subject ?? '', keywords: meta.keywords ?? '',
  }));
}

/** POST /api/v1/misc/extract-images (ExtractImagesController) — fields:
 *  fileInput, format ('png'/'jpeg'/'gif' — 'jpg' is NOT a valid value here, unlike
 *  /convert/pdf/img below; normalized so a shared frontend format picker works for
 *  both). Returns a ZIP of the extracted images. */
export async function extractImages(fileBuffer: Buffer, fileName: string, format = 'png'): Promise<Buffer> {
  const normalized = format === 'jpg' ? 'jpeg' : format;
  return callStirlingPdf('/api/v1/misc/extract-images', fileForm(fileBuffer, fileName, { format: normalized }));
}

/** POST /api/v1/misc/flatten (FlattenController) — fields: fileInput,
 *  flattenOnlyForms (true = just lock form fields, false = also rasterize
 *  every page, removing all remaining interactivity/annotations). */
export async function flattenPdf(fileBuffer: Buffer, fileName: string, flattenOnlyForms = false): Promise<Buffer> {
  return callStirlingPdf('/api/v1/misc/flatten', fileForm(fileBuffer, fileName, { flattenOnlyForms: String(flattenOnlyForms) }));
}

/** POST /api/v1/misc/repair (RepairController) — fields: fileInput. */
export async function repairPdf(fileBuffer: Buffer, fileName: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/misc/repair', fileForm(fileBuffer, fileName));
}

/** POST /api/v1/security/add-password (PasswordController) — fields: fileInput,
 *  password (opens the file), ownerPassword (changes permissions), keyLength. */
export async function addPassword(fileBuffer: Buffer, fileName: string, password: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/security/add-password', fileForm(fileBuffer, fileName, {
    password, ownerPassword: password, keyLength: '256',
  }));
}

/** POST /api/v1/security/remove-password (PasswordController) — fields:
 *  fileInput, password (the current password to remove). */
export async function removePassword(fileBuffer: Buffer, fileName: string, password: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/security/remove-password', fileForm(fileBuffer, fileName, { password }));
}

/** POST /api/v1/convert/pdf/img (ConvertImgPDFController) — fields: fileInput,
 *  imageFormat ('png'/'jpg'), singleOrMultiple ('single'/'multiple'), colorType,
 *  dpi. Returns one image or a ZIP of images — the caller downloads it. */
export async function pdfToImages(fileBuffer: Buffer, fileName: string, imageFormat = 'png'): Promise<Buffer> {
  return callStirlingPdf('/api/v1/convert/pdf/img', fileForm(fileBuffer, fileName, {
    imageFormat, singleOrMultiple: 'multiple', colorType: 'color', dpi: '300', pageNumbers: 'all',
  }));
}

/** POST /api/v1/convert/pdf/xlsx (ConvertPDFToExcelController). Returns an
 *  .xlsx — the caller downloads it, it doesn't replace the working PDF. */
export async function pdfToExcel(fileBuffer: Buffer, fileName: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/convert/pdf/xlsx', fileForm(fileBuffer, fileName, { pageNumbers: 'all' }));
}

/** POST /api/v1/convert/pdf/word (ConvertPDFToOffice) — fields: fileInput,
 *  outputFormat ('docx'). Returns a .docx to download. */
export async function pdfToWord(fileBuffer: Buffer, fileName: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/convert/pdf/word', fileForm(fileBuffer, fileName, { outputFormat: 'docx' }));
}

/** POST /api/v1/convert/pdf/presentation (ConvertPDFToOffice) — fields:
 *  fileInput, outputFormat ('pptx'). Returns a .pptx to download. */
export async function pdfToPowerPoint(fileBuffer: Buffer, fileName: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/convert/pdf/presentation', fileForm(fileBuffer, fileName, { outputFormat: 'pptx' }));
}

/** POST /api/v1/convert/pdf/text (ConvertPDFToOffice) — fields: fileInput,
 *  outputFormat ('txt'). Returns a .txt to download. */
export async function pdfToText(fileBuffer: Buffer, fileName: string): Promise<Buffer> {
  return callStirlingPdf('/api/v1/convert/pdf/text', fileForm(fileBuffer, fileName, { outputFormat: 'txt' }));
}
