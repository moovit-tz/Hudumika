/**
 * Minimal .xlsx reader — worksheet cells out as a plain string grid.
 *
 * Deliberately dependency-free rather than pulling in SheetJS: the npm-published
 * `xlsx` package is pinned at 0.18.5 and carries the unpatched prototype-pollution
 * advisory CVE-2023-30533 (fixed only on SheetJS' own CDN, not on npm), and it adds
 * close to a megabyte to a bundle that is already oversized. A commercial invoice is
 * a flat grid of text and numbers, so the parts of OOXML that justify a whole library
 * — formulas, styles, pivot caches, charts, ODS/BIFF variants — never come into play.
 *
 * .xlsx/.xlsm only. Legacy binary .xls is an entirely different container and is
 * rejected with an explicit message rather than silently yielding nothing.
 */

export interface XlsxSheet {
  name: string;
  /** Row-major, positionally faithful: a gap in the file stays a gap here, so a
   *  header-row scan sees the same shape the user sees on screen in Excel. */
  rows: string[][];
}

interface ZipEntry { method: number; start: number; compSize: number }

const OOXML_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// `DecompressionStream` landed in lib.dom later than this repo's TS baseline, so it
// is reached through globalThis rather than assumed to be declared.
type DecompressionStreamCtor = new (format: string) => ReadableWritablePair<Uint8Array, Uint8Array>;
const DecompressionStreamImpl = (globalThis as unknown as {
  DecompressionStream?: DecompressionStreamCtor;
}).DecompressionStream;

function u16(v: DataView, o: number): number { return v.getUint16(o, true); }
function u32(v: DataView, o: number): number { return v.getUint32(o, true); }

function readZipDirectory(buf: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder();

  // End-of-central-directory, scanning back over the maximum 65535-byte trailing
  // comment a zip is allowed to carry.
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That file is not a readable Excel workbook (no zip directory found).');

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOff = u32(view, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // Where the bytes actually start is only knowable from the local header: its
    // extra field is routinely a different length from the central directory's.
    const localNameLen = u16(view, localOff + 26);
    const localExtraLen = u16(view, localOff + 28);
    entries.set(name, { method, start: localOff + 30 + localNameLen + localExtraLen, compSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntryText(bytes: Uint8Array<ArrayBuffer>, entry: ZipEntry): Promise<string> {
  const raw = bytes.subarray(entry.start, entry.start + entry.compSize);
  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) throw new Error(`This workbook uses an unsupported compression method (${entry.method}). Re-save it from Excel, or export as CSV.`);
  if (!DecompressionStreamImpl) throw new Error('This browser cannot open .xlsx files. Save the invoice as CSV and upload that instead.');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStreamImpl('deflate-raw'));
  return await new Response(stream).text();
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('That workbook could not be read — its internal XML is malformed.');
  return doc;
}

/** Namespace-agnostic lookup: some producers write `x:`-prefixed OOXML tags. */
function tags(scope: Document | Element, local: string): Element[] {
  return Array.from(scope.getElementsByTagNameNS('*', local));
}

function readSharedStrings(doc: Document): string[] {
  return tags(doc, 'si').map(si => {
    // <rPh> carries furigana for the same characters; including it duplicates
    // the visible text.
    tags(si, 'rPh').forEach(n => n.remove());
    return tags(si, 't').map(t => t.textContent ?? '').join('');
  });
}

/** "AB12" -> 27. Returns -1 when the reference carries no column letters. */
function colIndex(ref: string): number {
  let n = 0, seen = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
    seen++;
  }
  return seen === 0 ? -1 : n - 1;
}

function readSheetRows(doc: Document, shared: string[]): string[][] {
  const out: string[][] = [];
  for (const rowEl of tags(doc, 'row')) {
    const cells: string[] = [];
    for (const c of tags(rowEl, 'c')) {
      const type = c.getAttribute('t') ?? 'n';
      let val: string;
      if (type === 's') {
        val = shared[Number(tags(c, 'v')[0]?.textContent ?? '')] ?? '';
      } else if (type === 'inlineStr') {
        val = tags(c, 't').map(n => n.textContent ?? '').join('');
      } else if (type === 'e') {
        val = '';                       // #REF!/#DIV/0! is not a value — treat as blank
      } else {
        // Covers t="str" (cached formula result) and t="n"/absent. Excel always
        // writes the last computed value, so uploads work with no formula engine.
        val = tags(c, 'v')[0]?.textContent ?? '';
      }
      const idx = colIndex(c.getAttribute('r') ?? '');
      if (idx >= 0) { while (cells.length < idx) cells.push(''); cells[idx] = val.trim(); }
      else cells.push(val.trim());
    }
    const r = Number(rowEl.getAttribute('r'));
    if (Number.isFinite(r) && r > 0) { while (out.length < r - 1) out.push([]); out[r - 1] = cells; }
    else out.push(cells);
  }
  return out;
}

/** Resolves a workbook relationship Target against the `xl/` part it lives in. */
function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  let path = `xl/${target}`;
  while (path.includes('/../')) path = path.replace(/[^/]+\/\.\.\//, '');
  return path;
}

/**
 * Every worksheet in the workbook, in the tab order shown in Excel — not zip
 * order, which does not necessarily match (a tab added second can be sheet1.xml).
 */
export async function readXlsxSheets(file: File): Promise<XlsxSheet[]> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error('That is a legacy .xls file. Open it in Excel and use File → Save As → Excel Workbook (.xlsx), or export it as CSV.');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('That does not look like an Excel workbook. Upload a .xlsx file or a CSV.');
  }

  const entries = readZipDirectory(buf);
  const read = async (name: string): Promise<string | null> => {
    const e = entries.get(name);
    return e ? await readEntryText(bytes, e) : null;
  };

  const workbookXml = await read('xl/workbook.xml');
  if (!workbookXml) throw new Error('That workbook is missing its main part (xl/workbook.xml) and cannot be read.');

  const relsXml = await read('xl/_rels/workbook.xml.rels');
  const relTargets = new Map<string, string>();
  if (relsXml) {
    for (const rel of tags(parseXml(relsXml), 'Relationship')) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) relTargets.set(id, resolveTarget(target));
    }
  }

  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? readSharedStrings(parseXml(sharedXml)) : [];

  const sheets: XlsxSheet[] = [];
  const sheetEls = tags(parseXml(workbookXml), 'sheet');
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i];
    const relId = el.getAttributeNS(OOXML_REL_NS, 'id') ?? el.getAttribute('r:id');
    const path = (relId && relTargets.get(relId)) || `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await read(path);
    if (!xml) continue;
    sheets.push({ name: el.getAttribute('name') || `Sheet${i + 1}`, rows: readSheetRows(parseXml(xml), shared) });
  }

  if (sheets.length === 0) throw new Error('That workbook has no readable worksheets.');
  return sheets;
}
