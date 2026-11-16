import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader.js';
import { SectionCard } from '../../../components/SectionCard.js';
import { Button } from '../../../components/ui/button.js';
import { Badge } from '../../../components/ui/badge.js';
import { Textarea } from '../../../components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { DataTable } from '../../../components/ui/DataTable.js';
import { Icon } from '../../../components/Icon.js';
import { apiFetch } from '../../../lib/api.js';
import { showAlert } from '../../../lib/alert.js';
import { usePageSEO } from '../../../hooks/usePageSEO.js';
import { errText } from './equipmentShared.js';

const TEMPLATE = 'code,name,resource_type,manufacturer,make_model,serial_number,registration_number,ownership,home_site,condition,capacity_value,capacity_unit,meter_unit,meter_reading,inspection_interval_days,next_inspection_due\r\n'
  + 'EX-001,Excavator 20t,heavy_machinery,CAT,320,CAT0320X1,,OWNED,Mikocheni yard,GOOD,20,t,HOURS,1200,90,2026-12-01\r\n';

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function EquipmentImportPage() {
  usePageSEO('Import equipment', 'Import assets into the equipment register from a CSV file.');
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update'>('skip');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const rows = parseCsv(text);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await apiFetch('/v1/project-equipment/assets/import', { method: 'POST', body: JSON.stringify({ rows, on_duplicate: onDuplicate, dry_run: dryRun }) });
      if (dryRun) setPreview(r);
      else { showAlert(`Imported: ${r.summary.create} added, ${r.summary.update} updated, ${r.summary.skip} skipped.`, { variant: 'success' }); navigate('/projects/equipment'); }
    } catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); }
  }

  const s = preview?.summary;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader variant="create" crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'Equipment', to: '/projects/equipment' }, 'Import']}
        titlePlain="Import" titleEm="equipment" backTo="/projects/equipment" backLabel="Back" />
      <SectionCard title="1. Choose a file" collapsible={false}
        action={<Button size="sm" variant="outline" onClick={() => {
          // A blob download needs a real click target in the document.
          const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
          const a = Object.assign(document.createElement('a'), { href: url, download: 'equipment-template.csv' }); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }}><Icon name="download" size={14} /> Template</Button>}>
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--ink3)' }}>Each row needs a code, a name and a type. Codes match existing assets, so importing the same file again updates rather than duplicates. Up to 1,000 rows.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setPreview(null); } }} />
            <Button variant="outline" onClick={() => input.current?.click()}><Icon name="upload" size={14} /> Choose CSV</Button>
            <span className="text-sm" style={{ color: 'var(--ink3)' }}>{rows.length ? `${rows.length} rows read` : 'or paste below'}</span>
          </div>
          <Textarea rows={6} value={text} onChange={e => { setText(e.target.value); setPreview(null); }} placeholder={TEMPLATE} aria-label="CSV contents" className="font-mono text-xs" />
          <label className="flex max-w-sm flex-col gap-1 text-sm"><span className="font-medium">When a code is already in the register</span>
            <Select value={onDuplicate} onValueChange={v => { setOnDuplicate(v as any); setPreview(null); }}>
              <SelectTrigger aria-label="Duplicate handling"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="skip">Skip that row</SelectItem><SelectItem value="update">Update the existing asset</SelectItem></SelectContent>
            </Select></label>
          <div><Button onClick={() => run(true)} loading={busy} disabled={!rows.length || rows.length > 1000}>Check rows</Button></div>
        </div>
      </SectionCard>
      {preview && (
        <SectionCard title="2. Review and import" padded={false} collapsible={false}
          action={<span className="flex flex-wrap gap-1"><Badge variant="success">{s.create} new</Badge><Badge variant="info">{s.update} update</Badge><Badge variant="gray">{s.skip} skip</Badge>{s.error > 0 && <Badge variant="error">{s.error} with errors</Badge>}</span>}>
          <DataTable rows={preview.results} idKey={'row' as any} pageSize={50} compact columns={[
            { key: 'row', header: 'Row', align: 'right', render: (r: any) => <span className="tabular-nums">{r.row}</span>, width: 64 },
            { key: 'code', header: 'Code', render: (r: any) => r.code ?? '—' },
            { key: 'status', header: 'Result', render: (r: any) => <Badge variant={r.status === 'error' ? 'error' : r.status === 'create' ? 'success' : r.status === 'update' ? 'info' : 'gray'}>{r.status === 'create' ? 'New' : r.status === 'update' ? 'Update' : r.status === 'skip' ? 'Skip: already registered' : 'Error'}</Badge> },
            { key: 'errors', header: 'Problems', render: (r: any) => r.errors.length ? <ul className="text-xs">{r.errors.map((e: string) => <li key={e}>{e}</li>)}</ul> : '' },
          ]} />
          <div className="flex flex-wrap items-center justify-end gap-2 p-3">
            {s.error > 0 && <span className="text-sm" style={{ color: 'var(--red)' }}>Fix or remove the rows with errors first.</span>}
            <Button onClick={() => run(false)} loading={busy} disabled={s.error > 0 || s.create + s.update === 0}>Import {s.create + s.update} rows</Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
