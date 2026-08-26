import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import type { ShipmentType } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { AiExtractedCard } from '../components/AiExtractedCard.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { PageHeader } from '../components/PageHeader.js';
import { showAlert } from '../lib/alert.js';
import { readXlsxSheets } from '../lib/xlsx-read.js';
import './CreateShipmentPage.css';

/**
 * Dangerous goods aren't a separate creation process — same clearing flow as
 * any other shipment, with one extra tag ("Nature of Goods") that reveals
 * the extra layer of legally-required fields a DG shipment needs (UN
 * number, packaging, shipper/consignee for the declaration itself). The
 * linked draft declaration this creates is then viewed/issued/printed
 * inline on the shipment's own page (see DangerousGoodsPanel.tsx) — there
 * is no separate declarations screen anymore.
 */
interface DgReferenceEntry {
  un_number: string;
  proper_shipping_name: string;
  class_or_division: string;
  subsidiary_risk: string | null;
  packing_group: string | null;
  air_transport_restriction: string | null;
}

function OfficerMentionInput({
  officers,
  value,
  onChange,
}: {
  officers: any[];
  value: { id: string; name: string };
  onChange: (id: string, name: string) => void;
}) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  const q = query.replace(/^@/, '').toLowerCase();
  const filtered = officers.filter(o =>
    !q || o.name.toLowerCase().includes(q) || (o.role || '').toLowerCase().includes(q)
  );

  const avatarColor = (name: string) => {
    const colors = ['#0b7264','#7c3aed','#0891b2','#ea580c','#059669','#dc2626','#d97706'];
    let h = 0;
    for (let i = 0; i < (name ?? '').length; i++) h = ((h << 5) - h) + (name ?? '').charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  };

  const select = (o: any) => {
    onChange(o.user_id || o.id, o.name);
    setQuery('');
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const inits = (name: string) =>
    name.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          onClick={() => { setOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
            border: `1px solid ${open ? 'var(--teal)' : 'var(--border)'}`,
            borderRadius: 7, background: 'var(--white)', cursor: 'text',
            boxShadow: open ? '0 0 0 2px var(--teal-l)' : 'none', transition: 'border-color .15s, box-shadow .15s',
            minHeight: 36,
          }}
        >
          {value.id ? (
            <>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(value.name), color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {inits(value.name)}
              </div>
              <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, fontWeight: 600 }}>{value.name}</span>
              <button type="button" onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </>
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder="Type @ to search staff…"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              style={{ border: 'none', outline: 'none', fontSize: 13, color: 'var(--ink)', background: 'transparent', flex: 1, fontFamily: 'var(--font)', padding: 0 }}
            />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1.5 max-h-[220px] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>No staff found</div>
        ) : filtered.slice(0, 8).map(o => (
          <button
            key={o.user_id || o.id}
            type="button"
            onClick={() => select(o)}
            className="rounded-lg hover:bg-accent hover:text-accent-foreground"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
          >
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(o.name), color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {inits(o.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{o.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                {(o.role || '').replace(/_/g, ' ')}{o.department ? ` · ${o.department}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 700, background: 'var(--teal-l)', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>
              @{o.name.split(' ')[0].toLowerCase()}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function CreateShipmentPage() {
  usePageSEO('New Shipment', 'Create a new shipment case via OCR or manual entry.');
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [currentStep, setCurrentStep] = useState(1);
  
  const [customers, setCustomers] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  
  const [dragOver, setDragOver] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [ocrSimulated, setOcrSimulated] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrDeclarationData, setOcrDeclarationData] = useState<any | null>(null);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  /** What the uploaded sheet actually yielded — never a claim of success on
   *  its own. Null until a file has been read. */
  const [excelReport, setExcelReport] = useState<{ ok: boolean; text: string; filled: string[] } | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  /** The fields marked `*` on step 3, and the single source for both the
   *  Create button's disabled state and the message next to it. */
  const REQUIRED: { key: 'customer_id' | 'goods_desc' | 'vessel' | 'origin_port' | 'dest_port'; label: string }[] = [
    { key: 'customer_id', label: 'Customer' },
    { key: 'goods_desc',  label: 'Goods description' },
    { key: 'vessel',      label: 'Vessel / flight' },
    { key: 'origin_port', label: 'Origin port' },
    { key: 'dest_port',   label: 'Destination port' },
  ];

  const [createForm, setCreateForm] = useState({
    customer_id: '',
    type: 'SEA_FCL' as ShipmentType,
    goods_desc: '',
    bl_number: '',
    vessel: '',
    // Blank, not a plausible route — the same reason container_number is
    // blank below. These defaulted to 'Port of Shanghai' → 'Port of Dar es
    // Salaam', so a shipment saved without the fields being touched claimed a
    // journey it never made. That is not cosmetic: co2.service.ts computes
    // emissions from the great-circle distance between exactly these two
    // values, so an untouched default silently books a 9,663 km leg against
    // the tenant's carbon portfolio. Both labels already say required; the
    // Create button now enforces it.
    origin_port: '',
    dest_port: '',
    eta: '',
    free_time_end: '',
    assigned_to: '',
    assigned_to_name: '',
    // Which workflow governs the case. '' = let the system choose (default);
    // a workflow id pins that workflow; 'legacy' pins the standard stage system.
    workflow_id: '',
    // Blank, not a generated number. This used to default to
    // 'MSKU' + a random 7 digits, so a shipment saved without the field being
    // touched carried an invented container number — onto the declaration and
    // into demurrage tracking, where it identifies a box that does not exist.
    container_number: '',
    container_size: '40HC' as const,
    // Was never a field at all: the submit handler generated 'SL-' + random.
    // A seal number is what proves the box was not opened in transit; it is
    // read off the seal, never made up.
    seal_number: '',
  });
  
  const [createLoading, setCreateLoading] = useState(false);

  // Nature of Goods — the tag the user asked for. Dangerous goods are not a
  // separate creation process; picking it here just reveals the extra layer
  // of legally-required fields (mirrors DangerousGoodsPage.tsx's own form,
  // trimmed to what's essential inline) and, on submit, creates a draft
  // dg_declarations row linked to the new shipment.
  const [natureOfGoods, setNatureOfGoods] = useState<'general' | 'dangerous'>('general');
  const [dgForm, setDgForm] = useState({
    transportMode: 'SEA' as 'AIR' | 'SEA' | 'ROAD',
    packagingType: '', numberOfPackages: '', netQuantity: '', quantityUnit: 'kg',
    shipperName: '', shipperAddress: '', emergencyContact: '',
  });
  const [selectedDg, setSelectedDg] = useState<PickerItem | null>(null);
  const [selectedDgEntry, setSelectedDgEntry] = useState<DgReferenceEntry | null>(null);

  const searchDg = async (q: string): Promise<PickerItem[]> => {
    if (!q.trim()) return [];
    const res: DgReferenceEntry[] = await apiFetch(`/v1/dangerous-goods/reference?q=${encodeURIComponent(q)}`);
    return res.map(e => ({ id: e.un_number, label: `${e.un_number} — ${e.proper_shipping_name}`, sublabel: `Class ${e.class_or_division}${e.packing_group ? ` · PG ${e.packing_group}` : ''}` }));
  };

  const onPickDg = async (item: PickerItem | null) => {
    setSelectedDg(item);
    if (!item) { setSelectedDgEntry(null); return; }
    const res: DgReferenceEntry[] = await apiFetch(`/v1/dangerous-goods/reference?q=${encodeURIComponent(item.id)}`);
    setSelectedDgEntry(res.find(e => e.un_number === item.id) ?? null);
  };

  const missingRequired = [
    ...REQUIRED
      .filter(f => !String((createForm as any)[f.key] ?? '').trim())
      .map(f => f.label),
    ...(natureOfGoods === 'dangerous' && !selectedDgEntry ? ['UN number (Dangerous Goods)'] : []),
    ...(natureOfGoods === 'dangerous' && !dgForm.shipperName.trim() ? ['Shipper name (Dangerous Goods)'] : []),
  ];

  /**
   * Feedback on the container number as it is typed.
   *
   * ISO 6346 numbers carry a check digit, so a transposed pair is detectable
   * — which is the whole point of the standard. This *warns* rather than
   * blocks: the check digit catches typing mistakes, but refusing to save a
   * shipment because a number the operator read off the box does not
   * checksum would be the app overruling reality. Never auto-corrects.
   */
  const containerHint = useMemo(() => {
    const raw = createForm.container_number.trim().toUpperCase();
    if (!raw) return null;
    const m = /^([A-Z]{4})(\d{6})(\d)$/.exec(raw);
    if (!m) return { ok: false, text: 'A container number is 4 letters then 7 digits, e.g. MSKU1234565. Check what is stencilled on the box.' };
    // Letters run 10..38 but skip every multiple of 11 (11, 22, 33) — the
    // ISO 6346 equivalence table.
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letterValue = (ch: string) => {
      let v = 10;
      for (const letter of LETTERS) {
        while (v % 11 === 0) v++;
        if (letter === ch) return v;
        v++;
      }
      return 0;
    };
    const body = m[1] + m[2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const ch = body[i];
      const v = i < 4 ? letterValue(ch) : Number(ch);
      sum += v * (1 << i);                        // weights 1,2,4,…,512
    }
    const expected = (sum % 11) % 10;
    return Number(m[3]) === expected
      ? { ok: true, text: 'Check digit valid (ISO 6346).' }
      : { ok: false, text: `Check digit does not match — ISO 6346 expects ${expected} for ${body}. Re-read the number; it will still save if you are sure.` };
  }, [createForm.container_number]);

  useEffect(() => {
    apiFetch('/v1/customers').then(res => {
      const list = res.data || [];
      setCustomers(list);
      if (list.length > 0) setCreateForm(p => ({ ...p, customer_id: list[0].id }));
    });
    apiFetch('/v1/hr/staff').then(res => {
      const list = (res.data || res || []) as any[];
      setOfficers(list);
    }).catch(() => {
      apiFetch('/v1/analytics/officers').then(res => setOfficers(res.data || []));
    });
    // Active workflows the case can be put on — names only; the full config
    // lives in the Workflows app.
    apiFetch('/v1/workflows').then(res => {
      const list = (res.data || res || []) as any[];
      setWorkflows(list.filter((w: any) => w.isActive !== false));
    }).catch(() => setWorkflows([]));
  }, []);

  const handleOcrFile = async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    setOcrFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setOcrPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
    setOcrScanning(true);
    setOcrSimulated(false);
    setOcrError(null);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image_base64 = dataUrl.split(',')[1];
      const res = await apiFetch('/v1/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64, media_type: file.type }),
      });
      setOcrResult(res.result);
      setOcrSimulated(!!res.simulated);
    } catch (err: any) {
      setOcrError(err?.message || 'Document scan failed. You can still fill the details in manually.');
      setOcrFile(null);
      setOcrPreview(null);
    } finally {
      setOcrScanning(false);
    }
  };

  const applyOcrToForm = () => {
    if (!ocrResult) return;
    const ov = ocrResult.overview || {};
    const pt = ocrResult.parties || {};
    const fi = ocrResult.financial || {};
    const hs = ocrResult.hs_lines || [];
    setCreateForm(p => ({
      ...p,
      goods_desc:       ov.goods_desc || p.goods_desc,
      bl_number:        ov.bl_number || p.bl_number,
      vessel:           ov.vessel || p.vessel,
      origin_port:      ov.origin_port || p.origin_port,
      dest_port:        ov.dest_port || p.dest_port,
      eta:              ov.eta || p.eta,
      container_number: ov.container_number || p.container_number,
      container_size:   (ov.container_size as any) || p.container_size,
    }));
    setOcrDeclarationData({
      doc_type: ocrResult.doc_type,
      parties:  pt,
      financial: fi,
      hs_lines: hs,
      overview: ov,
    });
    setCurrentStep(3); // skip excel and go to form
  };

  /**
   * The columns the template ships with and the importer understands. One
   * list drives both, so the file you download is by construction the file
   * this reads — they cannot drift apart.
   */
  const TEMPLATE_COLUMNS: { header: string; field: keyof typeof createForm | null; example: string }[] = [
    { header: 'BL / Doc Number',  field: 'bl_number',        example: 'MEDU90123456' },
    { header: 'Vessel / Flight',  field: 'vessel',           example: 'MSC Savannah' },
    { header: 'Goods Description',field: 'goods_desc',       example: 'Crusher spare parts' },
    { header: 'Origin Port',      field: 'origin_port',      example: 'Port of Shanghai' },
    { header: 'Destination Port', field: 'dest_port',        example: 'Port of Dar es Salaam' },
    { header: 'ETA (YYYY-MM-DD)', field: 'eta',              example: '2026-09-14' },
    { header: 'Free Time End (YYYY-MM-DD)', field: 'free_time_end', example: '2026-09-28' },
    { header: 'Container Number', field: 'container_number', example: 'MSKU1234565' },
    { header: 'Container Size',   field: 'container_size',   example: '40HC' },
    { header: 'Seal Number',      field: 'seal_number',      example: 'SL7788213' },
  ];

  /** Downloads the template as CSV — a real file, not an alert. CSV rather
   *  than .xlsx so it needs no writer library and opens in Excel either way. */
  const downloadTemplate = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [
      TEMPLATE_COLUMNS.map(c => esc(c.header)).join(','),
      TEMPLATE_COLUMNS.map(c => esc(c.example)).join(','),
    ].join('\r\n') + '\r\n';
    // BOM so Excel opens it as UTF-8 rather than the system codepage.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hudumika-shipment-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Reads an uploaded sheet and fills what it recognises.
   *
   * This used to store the File, wait a second, advance the step and announce
   * "parsed successfully" — the file was never opened and nothing was filled.
   * Now it reports exactly which fields came from the sheet, and says so
   * plainly when it recognised nothing.
   */
  const importSheet = async (file: File) => {
    setExcelBusy(true);
    setExcelReport(null);
    try {
      let rows: string[][];
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => {
          // quote-aware split, so a description containing a comma survives
          const out: string[] = []; let cur = ''; let q = false;
          for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (q && ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') q = !q;
            else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          out.push(cur.trim());
          return out;
        });
      } else {
        const sheets = await readXlsxSheets(file);
        const sheet = sheets.find(s => s.rows.some(r => r.some(c => c.trim()))) ?? sheets[0];
        if (!sheet) throw new Error('That workbook has no readable sheet.');
        rows = sheet.rows;
      }

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const headerIdx = rows.findIndex(r => r.some(c => TEMPLATE_COLUMNS.some(t => norm(t.header) === norm(c))));
      if (headerIdx < 0) {
        setExcelFile(file);
        setExcelReport({
          ok: false, filled: [],
          text: `No column in "${file.name}" matched the template. Expected headers like ${TEMPLATE_COLUMNS.slice(0, 3).map(c => `"${c.header}"`).join(', ')}. Download the template above, or fill the form by hand below.`,
        });
        return;
      }

      const header = rows[headerIdx];
      const dataRow = rows.slice(headerIdx + 1).find(r => r.some(c => c.trim()));
      if (!dataRow) {
        setExcelFile(file);
        setExcelReport({ ok: false, filled: [], text: `"${file.name}" has the template's headers but no filled-in row beneath them.` });
        return;
      }

      const patch: Record<string, string> = {};
      const filled: string[] = [];
      header.forEach((h, i) => {
        const col = TEMPLATE_COLUMNS.find(t => norm(t.header) === norm(h));
        const val = (dataRow[i] ?? '').trim();
        if (!col?.field || !val) return;
        patch[col.field] = col.field === 'container_number' || col.field === 'seal_number' ? val.toUpperCase() : val;
        filled.push(col.header);
      });

      setExcelFile(file);
      if (filled.length === 0) {
        setExcelReport({ ok: false, filled: [], text: `"${file.name}" matched the template but every recognised column was empty.` });
        return;
      }
      setCreateForm(p => ({ ...p, ...patch }));
      setExcelReport({
        ok: true, filled,
        text: `Read ${filled.length} field${filled.length === 1 ? '' : 's'} from "${file.name}": ${filled.join(', ')}. Check them on the form before creating the shipment.`,
      });
    } catch (e: any) {
      setExcelFile(null);
      setExcelReport({ ok: false, filled: [], text: e?.message || 'That file could not be read.' });
    } finally {
      setExcelBusy(false);
    }
  };

  const handleCreateCase = async () => {
    setCreateLoading(true);
    try {
      const res = await apiFetch('/v1/shipments', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: createForm.customer_id,
          type: createForm.type,
          goods_desc: createForm.goods_desc,
          bl_number: createForm.bl_number || undefined,
          vessel: createForm.vessel,
          origin_port: createForm.origin_port,
          dest_port: createForm.dest_port,
          eta: createForm.eta ? new Date(createForm.eta).toISOString() : undefined,
          free_time_end: createForm.free_time_end ? new Date(createForm.free_time_end).toISOString() : undefined,
          assigned_to: createForm.assigned_to || undefined,
          workflow_id: createForm.workflow_id || undefined,
          // Only sent when a real container number was entered. An empty
          // container row is worse than none: it looks like a declared box
          // with a missing number rather than a shipment not yet stuffed.
          containers: createForm.container_number.trim()
            ? [{
                number: createForm.container_number.trim().toUpperCase(),
                size: createForm.container_size,
                ...(createForm.seal_number.trim() ? { seal_number: createForm.seal_number.trim() } : {}),
              }]
            : undefined,
        }),
      });

      const shipmentId  = res?.data?.id  || res?.id;
      const refNumber   = res?.data?.ref_number || res?.ref_number || 'New Shipment';

      if (ocrDeclarationData && shipmentId) {
        localStorage.setItem(`ocrDecl_${shipmentId}`, JSON.stringify(ocrDeclarationData));
      }

      if (createForm.assigned_to && shipmentId) {
        apiFetch('/v1/notifications', {
          method: 'POST',
          body: JSON.stringify({
            user_id: createForm.assigned_to,
            type:    'assignment',
            title:   `You've been assigned ${refNumber}`,
            message: `You have been assigned to handle: ${createForm.goods_desc}. From ${createForm.origin_port} → ${createForm.dest_port}.`,
            link:    `/clearos/clearance/${shipmentId}`,
            metadata: { shipment_id: shipmentId, assigned_by: user?.name || 'Operations' },
          }),
        }).catch(() => {});
      }

      if (natureOfGoods === 'dangerous' && selectedDgEntry && shipmentId) {
        const customer = customers.find(c => c.id === createForm.customer_id);
        try {
          await apiFetch('/v1/dangerous-goods/declarations', {
            method: 'POST',
            body: JSON.stringify({
              subjectType: 'shipment',
              subjectId: shipmentId,
              transportMode: dgForm.transportMode,
              unNumber: selectedDgEntry.un_number,
              packagingType: dgForm.packagingType.trim() || undefined,
              numberOfPackages: dgForm.numberOfPackages ? parseInt(dgForm.numberOfPackages, 10) : undefined,
              netQuantity: dgForm.netQuantity ? parseFloat(dgForm.netQuantity) : undefined,
              quantityUnit: dgForm.quantityUnit.trim() || undefined,
              shipperName: dgForm.shipperName.trim(),
              shipperAddress: dgForm.shipperAddress.trim() || undefined,
              consigneeName: customer?.name || '',
              consigneeAddress: customer?.address || undefined,
              emergencyContact: dgForm.emergencyContact.trim() || undefined,
            }),
          });
        } catch (err: any) {
          // The shipment itself was created successfully — don't undo that or
          // block navigation over this second call failing. Stay honest about
          // it rather than silently dropping the declaration.
          showAlert(
            `Shipment ${refNumber} was created, but its dangerous goods declaration could not be saved (${err.message || 'unknown error'}). Add it from the shipment's own page once it opens.`,
            { variant: 'error' },
          );
        }
      }

      navigate(`/clearos/clearance/${shipmentId}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create case');
    } finally {
      setCreateLoading(false);
    }
  };

  const steps = [
    { id: 1, title: 'Scan Document', desc: 'Auto-extract data from BL or Invoice via AI.' },
    { id: 2, title: 'Excel Bulk Upload', desc: 'Share or upload a completed Excel template.' },
    { id: 3, title: 'Shipment Details', desc: 'Verify and manually correct missing fields.' },
    { id: 4, title: 'Confirm', desc: 'Review the details before creating.' },
  ];

  const fld = (lbl: string, val: string, set: (v: string) => void, props: any = {}) => (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>{lbl}</label>
      <input type="text" className="input-field" value={val} onChange={e => set(e.target.value)} {...props} style={{ width: '100%' }} />
    </div>
  );

  return (
    <div className="create-shipment-page">
      {/* Sidebar */}
      <div className="create-shipment-sidebar">
        <Link to="/clearos/ops" className="create-shipment-brand">
          <Icon name="package" size={24} color="var(--teal)" />
          ClearOS
        </Link>
        <div className="create-shipment-steps">
          {steps.map((s, idx) => {
            const status = currentStep === s.id ? 'active' : currentStep > s.id ? 'completed' : 'pending';
            return (
              <div key={s.id} className={`create-shipment-step ${status}`}>
                <div className="create-shipment-step-indicator">
                  {status === 'completed' ? <Icon name="check" size={14} /> : s.id}
                </div>
                <div className="create-shipment-step-content">
                  <div className="create-shipment-step-title">{s.title}</div>
                  <div className="create-shipment-step-desc">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="create-shipment-main">
        <div className="create-shipment-header">
          <Link to="/clearos/ops" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink2)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', width: 'fit-content' }}>
            <Icon name="chevronLeft" size={14} /> Back to Operations
          </Link>
        </div>

        <div className="create-shipment-content">
          <PageHeader
            crumbs={['ClearOS', 'New shipment']}
            titlePlain={
              currentStep === 1 ? 'Scan' :
              currentStep === 2 ? 'Excel bulk' :
              currentStep === 3 ? 'Shipment' :
              'Confirm &'
            }
            titleEm={
              currentStep === 1 ? 'document' :
              currentStep === 2 ? 'upload' :
              currentStep === 3 ? 'details' :
              'create'
            }
            subtitle={
              <>
                {currentStep === 1 && 'Drop a Bill of Lading, Commercial Invoice, or Packing List to automatically extract shipment data using AI.'}
                {currentStep === 2 && 'Alternatively, download the standard Hudumika Excel template, fill it out with bulk container/items data, and upload it here.'}
                {currentStep === 3 && 'Verify the extracted information. Fill in any missing required fields before proceeding.'}
                {currentStep === 4 && 'Please review the final details below before creating the shipment record in the system.'}
              </>
            }
          />

          <div className="create-shipment-card">
            {/* Step 1: OCR */}
            {currentStep === 1 && (
              <div>
                {ocrError && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--red-l)', border: '1px solid #fecaca', borderRadius: 9, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--red)' }}>{ocrError}</div>
                    <button type="button" title="Dismiss" onClick={() => setOcrError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>×</button>
                  </div>
                )}
                {!ocrFile && !ocrScanning && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleOcrFile(f); }}
                    style={{ border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 9, padding: '60px 24px', textAlign: 'center', background: dragOver ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,.pdf'; inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) handleOcrFile(f); }; inp.click(); }}
                  >
                    <div style={{ marginBottom: 16 }}><Icon name="fileText" size={48} color="var(--ink3)" /></div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>Drop or click to upload a document</div>
                    <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Bill of Lading · Commercial Invoice · Packing List · Air Waybill</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>PNG, JPG, WEBP, PDF supported</div>
                  </div>
                )}
                {ocrScanning && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <div style={{ width: 56, height: 56, border: '4px solid var(--teal-l)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Scanning document…</div>
                    <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 8 }}>Our AI is extracting shipment data and line items.</div>
                  </div>
                )}
                {ocrResult && !ocrScanning && (
                  <AiExtractedCard
                    ocrResult={ocrResult}
                    previewUrl={ocrPreview}
                    simulated={ocrSimulated}
                    onRescan={() => { setOcrFile(null); setOcrPreview(null); setOcrResult(null); }}
                  />
                )}
              </div>
            )}

            {/* Step 2: Excel */}
            {currentStep === 2 && (
              <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                <Icon name="fileText" size={48} color="var(--ink3)" />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginTop: 24, marginBottom: 8 }}>Bulk Upload via Excel</h3>
                <p style={{ fontSize: 14, color: 'var(--ink3)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                  Download our standard shipment template. You can share this with your clients to fill in container and commercial details before uploading it back here.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 40 }}>
                  <button className="btn btn-secondary" onClick={downloadTemplate}>
                    <Icon name="download" size={16} /> Download Template
                  </button>
                  <button className="btn btn-primary" disabled={excelBusy} onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.csv'; inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) void importSheet(f); }; inp.click(); }}>
                    <Icon name="upload" size={16} /> {excelBusy ? 'Reading…' : 'Upload Filled Excel'}
                  </button>
                </div>
                {/* The result of actually reading the file — which fields it
                    yielded, or why it yielded none. Advancing is the user's
                    call, so a sheet that read nothing does not silently move
                    them on as though it had worked. */}
                {excelReport && (
                  <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '12px 16px', borderRadius: 'var(--r)', background: excelReport.ok ? 'var(--green-l)' : 'var(--gold-l)', border: `1px solid ${excelReport.ok ? 'var(--green)' : 'var(--gold)'}` }}>
                    <Icon name={excelReport.ok ? 'checkCircle' : 'alertCircle'} size={16} color={excelReport.ok ? 'var(--green)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
                      {excelReport.text}
                      <div style={{ marginTop: 10 }}>
                        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setCurrentStep(3)}>
                          {excelReport.ok ? 'Review the form' : 'Fill the form by hand'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Form */}
            {currentStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Names what was pre-filled and from where. The old copy said
                    "Data applied — additional details will be pre-filled"
                    whenever a file had merely been selected, including when
                    nothing had been read from it at all. */}
                {(ocrResult || excelReport?.ok) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px', background: 'var(--teal-l)', borderRadius: 9, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
                    <Icon name="check" size={16} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      {excelReport?.ok
                        ? <>Pre-filled from <strong>{excelFile?.name}</strong>: {excelReport.filled.join(', ')}. </>
                        : <>Pre-filled from the scanned document. </>}
                      Check every field before creating the shipment — nothing here has been verified against the carrier.
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Customer *</label>
                    <Combobox
                      options={customers.map(c => ({ value: c.id, label: c.name }))}
                      value={createForm.customer_id}
                      onChange={v => setCreateForm(p => ({ ...p, customer_id: v }))}
                      placeholder="Choose customer…"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Type *</label>
                    <Select value={createForm.type} onValueChange={v => setCreateForm(p => ({ ...p, type: v as ShipmentType }))}>
                      <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SEA_FCL">Sea — FCL</SelectItem>
                        <SelectItem value="SEA_LCL">Sea — LCL</SelectItem>
                        <SelectItem value="AIR">Air Cargo</SelectItem>
                        <SelectItem value="ROAD">Road Freight</SelectItem>
                        <SelectItem value="RAIL">Rail</SelectItem>
                        <SelectItem value="BULK">Bulk Vessel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Goods Description *</label>
                  <input type="text" className="input-field" placeholder="e.g. 500 MT of Medical Supplies" value={createForm.goods_desc} onChange={e => setCreateForm(p => ({ ...p, goods_desc: e.target.value }))} style={{ width: '100%' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Nature of Goods</label>
                  <Select value={natureOfGoods} onValueChange={v => setNatureOfGoods(v as any)}>
                    <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General cargo</SelectItem>
                      <SelectItem value="dangerous">Dangerous goods</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dangerous goods follow the same clearing flow as any other
                    shipment — this just tags it and collects the extra layer
                    of legally-required fields, right here, instead of a
                    separate creation process. A linked draft declaration is
                    created together with the shipment on submit. */}
                {natureOfGoods === 'dangerous' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 18, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="alertTriangle" size={16} color="var(--gold)" />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Dangerous goods — extra requirements</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8 }}>
                      Creates a linked draft declaration alongside this shipment. Issue and print it from the shipment's own page once confirmed.
                    </div>

                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Transport mode</label>
                        <Select value={dgForm.transportMode} onValueChange={v => setDgForm(p => ({ ...p, transportMode: v as any }))}>
                          <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SEA">Sea</SelectItem>
                            <SelectItem value="AIR">Air</SelectItem>
                            <SelectItem value="ROAD">Road</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>UN number / goods *</label>
                        <EntityPicker value={selectedDg} onChange={onPickDg} search={searchDg} placeholder="Search UN number or name…" />
                      </div>
                    </div>

                    {selectedDgEntry && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: 9, background: 'var(--white)', fontSize: 12.5 }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedDgEntry.un_number}</span>
                        <span style={{ color: 'var(--ink)' }}>{selectedDgEntry.proper_shipping_name}</span>
                        <span style={{ color: 'var(--ink3)' }}>
                          Class {selectedDgEntry.class_or_division}
                          {selectedDgEntry.subsidiary_risk ? ` (sub. ${selectedDgEntry.subsidiary_risk})` : ''}
                          {selectedDgEntry.packing_group ? ` · PG ${selectedDgEntry.packing_group}` : ''}
                        </span>
                        {dgForm.transportMode === 'AIR' && selectedDgEntry.air_transport_restriction && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: selectedDgEntry.air_transport_restriction === 'FORBIDDEN' ? 'var(--red-l)' : 'var(--gold-l)',
                            color: selectedDgEntry.air_transport_restriction === 'FORBIDDEN' ? 'var(--red)' : 'var(--gold)',
                          }}>
                            {selectedDgEntry.air_transport_restriction.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '16px' }}>
                      {fld('Packaging type', dgForm.packagingType, v => setDgForm(p => ({ ...p, packagingType: v })), { placeholder: 'e.g. Fibreboard box' })}
                      {fld('No. of packages', dgForm.numberOfPackages, v => setDgForm(p => ({ ...p, numberOfPackages: v.replace(/[^0-9]/g, '') })))}
                      {fld('Net quantity', dgForm.netQuantity, v => setDgForm(p => ({ ...p, netQuantity: v.replace(/[^0-9.]/g, '') })))}
                      {fld('Unit', dgForm.quantityUnit, v => setDgForm(p => ({ ...p, quantityUnit: v })))}
                    </div>

                    <div style={{ display: 'flex', gap: '16px' }}>
                      {fld('Shipper name *', dgForm.shipperName, v => setDgForm(p => ({ ...p, shipperName: v })))}
                      {fld('Shipper address', dgForm.shipperAddress, v => setDgForm(p => ({ ...p, shipperAddress: v })))}
                    </div>

                    {fld('Emergency contact', dgForm.emergencyContact, v => setDgForm(p => ({ ...p, emergencyContact: v })), { placeholder: 'name + 24h phone' })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '16px' }}>
                  {fld('BL / Doc Number', createForm.bl_number, v => setCreateForm(p => ({ ...p, bl_number: v })), { placeholder: 'e.g. MEDU90123456' })}
                  {fld('Vessel / Flight *', createForm.vessel, v => setCreateForm(p => ({ ...p, vessel: v })), { placeholder: 'e.g. MSC Savannah' })}
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  {fld('Origin Port *', createForm.origin_port, v => setCreateForm(p => ({ ...p, origin_port: v })))}
                  {fld('Destination Port *', createForm.dest_port, v => setCreateForm(p => ({ ...p, dest_port: v })))}
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>ETA</label>
                    <DatePicker date={parseDateOnly(createForm.eta)} onChange={d => setCreateForm(p => ({ ...p, eta: toDateOnlyString(d) }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Free Time End</label>
                    <DatePicker date={parseDateOnly(createForm.free_time_end)} onChange={d => setCreateForm(p => ({ ...p, free_time_end: toDateOnlyString(d) }))} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>
                      Assigned Officer
                    </label>
                    <OfficerMentionInput
                      officers={officers}
                      value={{ id: createForm.assigned_to, name: createForm.assigned_to_name }}
                      onChange={(id, name) => setCreateForm(p => ({ ...p, assigned_to: id, assigned_to_name: name }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    {fld('Container No.', createForm.container_number,
                      v => setCreateForm(p => ({ ...p, container_number: v.toUpperCase() })),
                      { placeholder: 'e.g. MSKU1234565' })}
                    {containerHint && (
                      <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.45, display: 'flex', gap: 6, alignItems: 'flex-start', color: containerHint.ok ? 'var(--green)' : 'var(--gold)' }}>
                        <Icon name={containerHint.ok ? 'checkCircle' : 'alertCircle'} size={12} color={containerHint.ok ? 'var(--green)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{containerHint.text}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  {fld('Seal No.', createForm.seal_number, v => setCreateForm(p => ({ ...p, seal_number: v.toUpperCase() })), { placeholder: 'as printed on the seal' })}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>Workflow</label>
                    <Select value={createForm.workflow_id || '__auto__'} onValueChange={v => setCreateForm(p => ({ ...p, workflow_id: v === '__auto__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Automatic" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">Automatic (recommended)</SelectItem>
                        {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        <SelectItem value="legacy">Standard stages</SelectItem>
                      </SelectContent>
                    </Select>
                    <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink3)' }}>
                      {createForm.workflow_id === '' ? 'Chosen automatically from your workflow rules.'
                        : createForm.workflow_id === 'legacy' ? 'The built-in clearance stages.'
                        : 'This workflow will govern the case.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Confirm */}
            {currentStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ padding: 24, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>{createForm.goods_desc || '—'}</h3>
                  <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 600, marginBottom: 20 }}>
                    {customers.find(c => c.id === createForm.customer_id)?.name || 'Unknown Customer'} · {createForm.type.replace('_', ' ')}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Route</div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{createForm.origin_port || '—'} → {createForm.dest_port || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Vessel</div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{createForm.vessel || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>BL / Doc #</div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{createForm.bl_number || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>ETA</div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{createForm.eta || '—'}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--blue-l)', borderRadius: 12, border: '1px solid rgba(8,145,178,0.2)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                    <Icon name="bell" size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Notification will be sent</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      {createForm.assigned_to_name ? `Assignee ${createForm.assigned_to_name} will be notified.` : 'No assignee selected.'}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Footer Navigation */}
            <div className="create-shipment-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => currentStep > 1 ? setCurrentStep(s => s - 1) : navigate('/clearos/ops')}
              >
                {currentStep === 1 ? 'Cancel' : 'Previous'}
              </button>
              
              {currentStep === 1 && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(2)}>Skip OCR</button>
                  <button type="button" className="btn btn-primary" onClick={applyOcrToForm} disabled={!ocrResult}>Apply & Continue</button>
                </div>
              )}
              
              {currentStep === 2 && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(3)}>Skip Excel</button>
                  <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(3)} disabled={!excelReport}>Continue</button>
                </div>
              )}
              
              {currentStep === 3 && (
                <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(4)}>
                  Review Details
                </button>
              )}
              
              {currentStep === 4 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* Say what is missing. A disabled button on the last step of
                      a four-step wizard, with the fields two steps back, is
                      otherwise a dead end. */}
                  {missingRequired.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      Still needed: <strong style={{ color: 'var(--ink2)' }}>{missingRequired.join(', ')}</strong>
                      {' · '}
                      <button type="button" onClick={() => setCurrentStep(3)}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                        Go back
                      </button>
                    </span>
                  )}
                  <button type="button" className="btn btn-primary" onClick={handleCreateCase}
                    disabled={createLoading || missingRequired.length > 0}>
                    {createLoading ? 'Creating...' : 'Create Shipment'}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
