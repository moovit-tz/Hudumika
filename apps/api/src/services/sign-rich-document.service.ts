import PDFDocument from 'pdfkit';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { documentFonts, applyDocumentFonts } from './document-branding.service.js';

const tags = ['h1','h2','h3','p','div','br','strong','em','u','b','i','ul','ol','li','a','blockquote','img','pre','code','table','tbody','thead','tr','th','td'];
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: tags,
    allowedAttributes: { a: ['href'], img: ['src','alt','width','height','style'] },
    allowedStyles: { img: { width: [/^\d+(?:px|%)$/], height: [/^(?:auto|\d+px)$/], 'max-width': [/^100%$/] } },
    allowedSchemes: ['https','http','mailto'],
    allowedSchemesByTag: { img: ['data'] },
    exclusiveFilter: frame => frame.tag === 'img' && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(frame.attribs.src || ''),
  });
}
const decode = (s: string) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
export function documentHtmlText(html: string): string {
  return decode(sanitizeHtml(html.replace(/<\/(p|div|h[1-3]|li|pre|tr)>|<br\s*\/?\s*>/gi,'\n'), { allowedTags: [], allowedAttributes: {} })).trim();
}

export async function buildRichDocumentPdf(title: string, source: string): Promise<Buffer> {
  const html = sanitizeDocumentHtml(source);
  type Run = { text: string; bold: boolean; underline: boolean; link?: string };
  type Block = { runs: Run[]; size: number; image?: string; width?: number };
  const blocks: Block[] = [];
  let current: Block = { runs: [], size: 11 };
  let bold = 0, underline = 0, link: string | undefined;
  const flush = () => { if (current.runs.length) blocks.push(current); current = { runs: [], size: 11 }; };
  sanitizeHtml(html, {
    allowedTags: tags,
    onOpenTag(name, attrs) {
      if (['p','div','h1','h2','h3','li','pre','blockquote','tr'].includes(name)) { flush(); current.size = name === 'h1' ? 20 : name === 'h2' ? 16 : name === 'h3' ? 13 : 11; }
      if (name === 'li') current.runs.push({ text: '• ', bold: false, underline: false });
      if (['strong','b','h1','h2','h3','th'].includes(name)) bold++;
      if (name === 'u') underline++;
      if (name === 'a') link = attrs.href;
      if (name === 'br') flush();
      if (name === 'img' && attrs.src) { flush(); blocks.push({ runs: [], size: 11, image: attrs.src, width: Number(attrs.width) || (/width:\s*(\d+)px/.exec(attrs.style || '') ? Number(/width:\s*(\d+)px/.exec(attrs.style || '')![1]) : 400) }); }
    },
    onCloseTag(name) {
      if (['strong','b','h1','h2','h3','th'].includes(name)) bold = Math.max(0,bold-1);
      if (name === 'u') underline = Math.max(0,underline-1);
      if (name === 'a') link = undefined;
      if (['p','div','h1','h2','h3','li','pre','blockquote','tr'].includes(name)) flush();
    },
    textFilter(text) { current.runs.push({ text: decode(text), bold: bold > 0, underline: underline > 0, link }); return text; },
  });
  flush();
  const fonts = /[\u3400-\u9fff]/.test(title + documentHtmlText(html)) ? await readFile(new URL('../assets/fonts/NotoSansCJKsc-Regular.otf', import.meta.url)).then(font => ({regular:font,bold:font})) : await documentFonts('atlassian-sans');
  const images = new Map<string, Buffer>();
  for (const block of blocks.filter(b => b.image)) {
    const bytes = Buffer.from(block.image!.split(',')[1], 'base64');
    images.set(block.image!, await sharp(bytes, { limitInputPixels: 4_000_000 }).rotate().png().toBuffer());
  }
  return new Promise((resolve,reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 54, info: { Title: title } });
    const chunks: Buffer[] = [];
    pdf.on('data', c => chunks.push(c)); pdf.on('error', reject); pdf.on('end', () => resolve(Buffer.concat(chunks)));
    applyDocumentFonts(pdf, { layout: 'classic', accent: '#000000', logo: null, fonts });
    for (const block of blocks) {
      if (block.image) { if (pdf.y > 560) pdf.addPage(); pdf.image(images.get(block.image)!, { fit: [Math.min(block.width!,487),220] }); pdf.moveDown(); continue; }
      block.runs.forEach((run,i) => pdf.font(run.bold ? 'Document-Bold' : 'Document-Regular').fontSize(block.size).text(run.text, { continued: i < block.runs.length-1, underline: run.underline, ...(run.link ? { link: run.link } : {}) }));
      pdf.moveDown(0.5);
    }
    pdf.end();
  });
}
