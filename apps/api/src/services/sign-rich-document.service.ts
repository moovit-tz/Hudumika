import PDFDocument from 'pdfkit';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { documentFonts, applyDocumentFonts } from './document-branding.service.js';

const tags = ['h1','h2','h3','h4','p','div','span','br','strong','em','u','b','i','s','strike','del','ul','ol','li','a','blockquote','img','pre','code','table','tbody','thead','tr','th','td'];
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: tags,
    allowedAttributes: { a: ['href'], img: ['src','alt','width','height','style'], '*': ['style'] },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] }, img: { width: [/^\d+(?:px|%)$/], height: [/^(?:auto|\d+px)$/], 'max-width': [/^100%$/] } },
    allowedSchemes: ['https','http','mailto'],
    allowedSchemesByTag: { img: ['data'] },
    exclusiveFilter: frame => frame.tag === 'img' && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(frame.attribs.src || ''),
  });
}
const decode = (s: string) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
export function documentHtmlText(html: string): string {
  return decode(sanitizeHtml(html.replace(/<\/(td|th)>/gi,'\t').replace(/<\/(p|div|h[1-4]|li|pre|tr)>|<br\s*\/?\s*>/gi,'\n'), { allowedTags: [], allowedAttributes: {} })).trim();
}

export async function buildRichDocumentPdf(title: string, source: string): Promise<Buffer> {
  if (source.length > 5000000) throw new Error('Document content exceeds the export limit.');
  const html = sanitizeDocumentHtml(source);
  if (documentHtmlText(html).length > 100000) throw new Error('Document text exceeds the export limit.');
  type Run = { text: string; bold: boolean; underline: boolean; italic?: boolean; strike?: boolean; link?: string };
  type Block = { runs: Run[]; size: number; image?: string; width?: number; table?: string[][]; align?: 'left' | 'right' | 'center' | 'justify' };
  const blocks: Block[] = [];
  let current: Block = { runs: [], size: 11 };
  let bold = 0, underline = 0, italic = 0, strike = 0, link: string | undefined;
  const lists: (number | null)[] = [];
  let table: string[][] | undefined, row: string[] = [], cell = '';
  const flush = () => { if (current.runs.length) blocks.push(current); current = { runs: [], size: 11 }; };
  sanitizeHtml(html, {
    allowedTags: tags,
    onOpenTag(name, attrs) {
      if (name === 'table') {
        if (table) throw new Error('Nested tables are not supported in PDF exports.');
        flush(); table = []; row = []; cell = ''; return;
      }
      if (table) {
        if (name === 'tr') row = [];
        if (name === 'td' || name === 'th') cell = '';
        if (name === 'br') cell += '\n';
        if (name === 'img') throw new Error('Move images outside tables before exporting.');
        return;
      }
      if (['p','div','h1','h2','h3','h4','li','pre','blockquote','tr'].includes(name)) { flush(); current.size = name === 'h1' ? 20 : name === 'h2' ? 16 : name === 'h3' ? 13 : 11; current.align = /text-align:\s*(left|right|center|justify)/.exec(attrs.style || '')?.[1] as Block['align']; }
      if (name === 'ol' || name === 'ul') lists.push(name === 'ol' ? 0 : null);
      if (name === 'li') {
        const depth = lists.length - 1;
        const ordered = depth >= 0 && lists[depth] !== null;
        const marker = ordered ? `${(lists[depth] as number) + 1}. ` : '• ';
        if (ordered) lists[depth] = (lists[depth] as number) + 1;
        current.runs.push({ text: marker, bold: false, underline: false });
      }
      if (['strong','b','h1','h2','h3','h4','th'].includes(name)) bold++;
      if (['i','em'].includes(name)) italic++;
      if (['s','strike','del'].includes(name)) strike++;
      if (name === 'u') underline++;
      if (name === 'a') link = attrs.href;
      if (name === 'br') flush();
      if (name === 'img' && attrs.src) { flush(); blocks.push({ runs: [], size: 11, image: attrs.src, width: Number(attrs.width) || (/width:\s*(\d+)px/.exec(attrs.style || '') ? Number(/width:\s*(\d+)px/.exec(attrs.style || '')![1]) : 400) }); }
    },
    onCloseTag(name) {
      if (table) {
        if (name === 'td' || name === 'th') {
          if (row.length >= 20) throw new Error('Table has too many columns.');
          row.push(cell.trim());
        }
        if (name === 'p' || name === 'div') cell += '\n';
        if (name === 'tr' && row.length) table.push(row);
        if (name === 'table') { blocks.push({ runs: [], size: 11, table }); table = undefined; }
        return;
      }
      if (['strong','b','h1','h2','h3','h4','th'].includes(name)) bold = Math.max(0,bold-1);
      if (['i','em'].includes(name)) italic = Math.max(0,italic-1);
      if (['s','strike','del'].includes(name)) strike = Math.max(0,strike-1);
      if (name === 'u') underline = Math.max(0,underline-1);
      if (name === 'a') link = undefined;
      if (name === 'ol' || name === 'ul') lists.pop();
      if (['p','div','h1','h2','h3','h4','li','pre','blockquote','tr'].includes(name)) flush();
    },
    textFilter(text) { if (table) cell += decode(text); else current.runs.push({ text: decode(text), bold: bold > 0, underline: underline > 0, italic: italic > 0, strike: strike > 0, link }); return text; },
  });
  flush();
  const fonts = /[\u3400-\u9fff]/.test(title + documentHtmlText(html)) ? await readFile(new URL('../assets/fonts/NotoSansCJKsc-Regular.otf', import.meta.url)).then(font => ({regular:font,bold:font})) : await documentFonts('atlassian-sans');
  const images = new Map<string, Buffer>();
  const imageBlocks = blocks.filter(block => block.image);
  if (imageBlocks.length > 20) throw new Error('Use at most 20 embedded images.');
  let totalPixels = 0;
  for (const block of imageBlocks) {
    if (images.has(block.image!)) continue;
    const bytes = Buffer.from(block.image!.split(',')[1], 'base64');
    const image = sharp(bytes, { limitInputPixels: 4_000_000 });
    const metadata = await image.metadata();
    totalPixels += (metadata.width || 0) * (metadata.height || 0);
    if (totalPixels > 8_000_000) throw new Error('Embedded images exceed the total export resolution limit.');
    images.set(block.image!, await image.rotate().png().toBuffer());
  }
  return new Promise((resolve,reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 54, info: { Title: title } });
    const chunks: Buffer[] = [];
    pdf.on('data', c => chunks.push(c)); pdf.on('error', reject); pdf.on('end', () => resolve(Buffer.concat(chunks)));
    applyDocumentFonts(pdf, { layout: 'classic', accent: '#000000', logo: null, fonts });
    for (const block of blocks) {
      if (block.table) {
        pdf.font('Document-Regular').fontSize(10);
        pdf.table({ data: block.table, maxWidth: 487, defaultStyle: { padding: 6, border: 0.5, borderColor: '#cbd5e1' } });
        pdf.moveDown(); continue;
      }
      if (block.image) { if (pdf.y > 560) pdf.addPage(); pdf.image(images.get(block.image)!, { fit: [Math.min(block.width!,487),220] }); pdf.moveDown(); continue; }
      block.runs.forEach((run,i) => pdf.font(run.bold ? 'Document-Bold' : 'Document-Regular').fontSize(block.size).text(run.text, { continued: i < block.runs.length-1, underline: run.underline, oblique: run.italic, strike: run.strike, align: block.align, ...(run.link ? { link: run.link } : {}) }));
      pdf.moveDown(0.5);
    }
    pdf.end();
  });
}
