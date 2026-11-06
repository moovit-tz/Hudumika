import PDFDocument from 'pdfkit';
import { strToU8, zipSync } from 'fflate';
import { csvText } from '@hudumika/types';
import type { estimateConsignment } from './demurrage-estimate.service.js';

type Lines = Awaited<ReturnType<typeof estimateConsignment>>;
const workbookType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xmlNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xml(value: unknown) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function workbook(rows: unknown[][]) {
  const sheet = rows.map(row => '<row>' + row.map(cell => typeof cell === 'number'
    ? `<c><v>${cell}</v></c>`
    : `<c t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join('') + '</row>').join('');
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipType}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<workbook xmlns="${xmlNamespace}" xmlns:r="${relationshipType}"><sheets><sheet name="Charge estimate" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipType}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="${xmlNamespace}"><sheetData>${sheet}</sheetData></worksheet>`),
  }));
}

export async function exportDemurrageEstimate(format: 'csv' | 'xlsx' | 'pdf', bill: string, asOf: string, lines: Lines) {
  const title = 'Storage and demurrage estimate';
  const note = 'Estimate only. Calendar-day difference excludes the start date. Unpriced items are excluded from amounts.';
  const rows = [
    [title], ['Bill of lading', bill], ['As of (EAT)', asOf], [note], [],
    ['Container', 'Size', 'Charge', 'Start', 'Through', 'Elapsed days', 'Free days', 'Chargeable days', 'Amount', 'Currency', 'Schedule', 'Tariff effective from', 'Note', 'Date source'],
    ...lines.map(line => [line.container, line.size, line.kind, line.start, line.end, line.days, line.freeDays,
      line.chargeableDays, line.amount, line.currency, line.schedule, line.effectiveDate, line.note, line.source]),
  ];
  if (format === 'csv') return { type: 'text/csv; charset=utf-8', body: Buffer.from(csvText(rows)) };
  if (format === 'xlsx') return { type: workbookType, body: workbook(rows) };
  const body = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(19).text(title).moveDown(0.5);
    doc.fontSize(11).text(`B/L ${bill}  |  As of ${asOf} (EAT)`).moveDown(0.5).text(note).moveDown();
    for (const line of lines) {
      if (doc.y > 710) doc.addPage();
      doc.font('Helvetica-Bold').text(`${line.container}  |  ${line.kind}`);
      doc.font('Helvetica').text(`${line.start || 'Unknown'} to ${line.end || 'Unknown'}  |  ${line.chargeableDays ?? 'Unknown'} chargeable days  |  ${line.amount === null ? 'Unpriced' : line.currency + ' ' + line.amount.toFixed(2)}`);
      doc.text([line.note, line.schedule, line.effectiveDate].filter(Boolean).join('  |  ')).moveDown(0.75);
      if (line.source) doc.fontSize(9).text(line.source).fontSize(11).moveDown(0.5);
    }
    doc.end();
  });
  return { type: 'application/pdf', body };
}
