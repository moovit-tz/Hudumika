/** Quote CSV fields and neutralise formulas in untrusted spreadsheet text. */
export function csvCell(value: unknown): string {
  let text=String(value ?? '');
  if(typeof value !== 'number' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}
export function csvText(rows: unknown[][]) { return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'); }
