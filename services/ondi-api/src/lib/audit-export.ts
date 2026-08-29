import PDFDocument from 'pdfkit';

type AuditLogRow = {
  timestamp: Date;
  action: string;
  category: string;
  severity: string;
  entityType: string;
  isRegulatory: boolean;
  metadata: unknown;
};

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Shared CSV rendering — used by both the personal (routes/audit.ts) and org-scoped (routes/org-security.ts) export endpoints. */
export function buildAuditCsv(logs: AuditLogRow[]): string {
  const header = ['timestamp', 'action', 'category', 'severity', 'entityType', 'isRegulatory', 'metadata'];
  const rows = logs.map(l => [
    l.timestamp.toISOString(), l.action, l.category, l.severity, l.entityType,
    l.isRegulatory ? 'yes' : 'no', JSON.stringify(l.metadata ?? {}),
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
}

/** Shared PDF rendering — buffers the whole document before returning, avoiding stream/reply lifecycle races. */
export async function buildAuditPdf(logs: AuditLogRow[], title: string): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).text(title, { align: 'left' });
  doc.fontSize(10).fillColor('#666').text(`Generated ${new Date().toISOString()} — ${logs.length} events`);
  doc.moveDown(1.5);

  for (const l of logs) {
    doc.fontSize(11).fillColor('#001633').text(`${l.action}`, { continued: true })
      .fillColor('#666').text(`  ·  ${l.category}  ·  ${l.severity}`);
    doc.fontSize(9).fillColor('#888').text(l.timestamp.toISOString());
    if (l.metadata && Object.keys(l.metadata as object).length > 0) {
      doc.fontSize(8).fillColor('#999').text(JSON.stringify(l.metadata));
    }
    doc.moveDown(0.8);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
