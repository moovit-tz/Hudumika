import { ContainerIdentity } from '../components/container/ContainerIdentity.js';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSessionDraft, clearSessionDrafts } from '../hooks/useSessionDraft.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Spinner } from '../components/ui/spinner.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useBranding.js';
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
import { Button } from '../components/ui/button.js';

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

const TRANSPORT_MODES: { value: ShipmentType; label: string; sub: string; icon: IconName }[] = [
  { value: 'SEA_FCL', label: 'Sea — FCL', sub: 'Full Container', icon: 'ship' },
  { value: 'SEA_LCL', label: 'Sea — LCL', sub: 'Less Container', icon: 'package' },
  { value: 'AIR',     label: 'Air Cargo', sub: 'Air Freight',    icon: 'plane' },
  { value: 'ROAD',    label: 'Road Freight', sub: 'Cross-Border', icon: 'truck' },
  { value: 'RAIL',    label: 'Rail Freight', sub: 'Rail Freight', icon: 'train' },
  { value: 'BULK',    label: 'Bulk Vessel', sub: 'Break-Bulk',   icon: 'anchor' },
];

function getTransportIcon(type: ShipmentType): IconName {
  switch (type) {
    case 'AIR': return 'plane';
    case 'ROAD': return 'truck';
    case 'RAIL': return 'train';
    case 'BULK': return 'anchor';
    case 'SEA_LCL': return 'package';
    case 'SEA_FCL':
    default: return 'ship';
  }
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          onClick={() => { setOpen(true); }}
          className="shipment-form-input"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'text',
            minHeight: 40,
            borderColor: open ? 'var(--shipment-accent, var(--teal))' : 'var(--border)',
            boxShadow: open ? '0 0 0 2px var(--shipment-accent-ring, var(--teal-l))' : 'none',
          }}
        >
          {value.id ? (
            <>
              <PersonAvatar userId={value.id} name={value.name} size={22} />
              <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, fontWeight: 600 }}>{value.name}</span>
              <button
                type="button"
                onClick={clear}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: "var(--text-base)", padding: '0 4px', lineHeight: 1 }}
                data-ui-native-button=""
              >
                ×
              </button>
            </>
          ) : (
            <input data-field-appearance="bare" data-ui-field="input"
              ref={inputRef}
              type="text"
              placeholder="Type @ to search staff…"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              style={{ border: 'none', outline: 'none', fontSize: "var(--text-base)", color: 'var(--ink)', background: 'transparent', flex: 1, fontFamily: 'var(--font)', padding: 0 }}
            />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        style={{ width: 280, maxHeight: 220, overflowY: 'auto', padding: 4 }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--ink3)' }}>No staff members found</div>
        ) : (
          filtered.map(o => (
            <div
              key={o.id || o.user_id}
              onClick={() => select(o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <PersonAvatar userId={o.user_id || o.id} name={o.name} size={24} />
              <div>
                <div style={{ fontWeight: 600 }}>{o.name}</div>
                {o.role && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{o.role}</div>}
              </div>
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CreateShipmentPage() {
  usePageSEO('New Shipment', 'Create a new shipment case via OCR or manual entry.');
  const branding = useBranding();
  const appColor = branding.getAppColor('clearos', '#ea580c');
  const appName = branding.getAppName('clearos', 'ClearOS');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '';
  const presetCustomerId = searchParams.get('customer_id') || '';

  const [currentStep, setCurrentStep] = useSessionDraft('shipment:step', 1);
  
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
  const [excelReport, setExcelReport] = useState<{ ok: boolean; text: string; filled: string[] } | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  const REQUIRED: { key: 'customer_id' | 'goods_desc' | 'vessel' | 'origin_port' | 'dest_port'; label: string }[] = [
    { key: 'customer_id', label: 'Customer' },
    { key: 'goods_desc',  label: 'Goods description' },
    { key: 'vessel',      label: 'Vessel / flight' },
    { key: 'origin_port', label: 'Origin port' },
    { key: 'dest_port',   label: 'Destination port' },
  ];

  const [createForm, setCreateForm] = useSessionDraft('shipment:form', {
    customer_id: presetCustomerId,
    type: 'SEA_FCL' as ShipmentType,
    goods_desc: '',
    bl_number: '',
    vessel: '',
    origin_port: '',
    dest_port: '',
    eta: '',
    free_time_end: '',
    assigned_to: '',
    assigned_to_name: '',
    workflow_id: '',
    container_number: '',
    container_size: '40HC' as const,
    seal_number: '',
  });
  
  const [createLoading, setCreateLoading] = useState(false);

  const [natureOfGoods, setNatureOfGoods] = useSessionDraft<'general' | 'dangerous'>('shipment:nature', 'general');
  const [dgForm, setDgForm] = useSessionDraft('shipment:dg', {
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

  const containerHint = useMemo(() => {
    const raw = createForm.container_number.trim().toUpperCase();
    if (!raw) return null;
    const clean = raw.replace(/\s+/g, '');
    if (!/^[A-Z]{4}\d{7}$/.test(clean)) {
      if (/^[A-Z]{3}U/i.test(clean) && clean.length !== 11) {
        return { ok: false, text: `Standard container numbers are 4 letters + 7 digits (e.g. MSKU1234565). You entered ${clean.length} characters.` };
      }
      return null;
    }
    const letters = clean.slice(0, 4);
    const digits = clean.slice(4, 10);
    const check = parseInt(clean[10], 10);
    const letterValues: Record<string, number> = {
      A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
      K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
      U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
    };
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += letterValues[letters[i]] * Math.pow(2, i);
    for (let i = 0; i < 6; i++) sum += parseInt(digits[i], 10) * Math.pow(2, i + 4);
    const expected = (sum % 11) % 10;
    if (expected !== check) {
      return { ok: false, text: `ISO 6346 check digit mismatch (expected ${expected}, got ${check}). Double-check for transposed numbers.` };
    }
    return { ok: true, text: 'Valid ISO 6346 container number (check digit verified).' };
  }, [createForm.container_number]);

  useEffect(() => {
    apiFetch('/v1/customers').then((response: any) => {
      setCustomers(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []);
    }).catch(() => setCustomers([]));
    apiFetch('/v1/hr/staff').then((response: any) => {
      setOfficers(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []);
    }).catch(() => setOfficers([]));
    apiFetch('/v1/workflows').then((response: any) => {
      setWorkflows(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []);
    }).catch(() => setWorkflows([]));
  }, []);

  const handleOcrFile = async (f: File) => {
    setOcrFile(f);
    setOcrError(null);
    setOcrPreview(URL.createObjectURL(f));
    setOcrScanning(true);

    try {
      const formData = new FormData();
      formData.append('document', f);

      const res = await apiFetch('/v1/comply/ocr', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok && res.error) {
        throw new Error(res.error);
      }

      setOcrResult(res.data);
      setOcrSimulated(res.simulated || false);
      if (res.declaration_data) {
        setOcrDeclarationData(res.declaration_data);
      }
    } catch (err: any) {
      setOcrError(err.message || 'OCR failed to extract data');
      setOcrResult(null);
    } finally {
      setOcrScanning(false);
    }
  };

  const applyOcrToForm = () => {
    if (!ocrResult) return;
    const ov = ocrResult.overview || {};
    const pt = ocrResult.parties || {};
    
    setCreateForm(p => ({
      ...p,
      goods_desc: ov.goods_desc || p.goods_desc,
      bl_number: ov.bl_number || p.bl_number,
      vessel: ov.vessel || p.vessel,
      origin_port: ov.origin_port || p.origin_port,
      dest_port: ov.dest_port || p.dest_port,
      eta: ov.eta || p.eta,
      free_time_end: ov.free_time_end || p.free_time_end,
      container_number: ov.container_number || p.container_number,
      seal_number: ov.seal_number || p.seal_number,
      container_size: ov.container_size || p.container_size,
    }));

    if (pt.consignee_name) {
      const matched = customers.find(c => 
        c.name.toLowerCase().includes(pt.consignee_name.toLowerCase()) ||
        pt.consignee_name.toLowerCase().includes(c.name.toLowerCase())
      );
      if (matched) {
        setCreateForm(p => ({ ...p, customer_id: matched.id }));
      }
    }

    setCurrentStep(3);
  };

  const downloadTemplate = () => {
    const headers = [
      'Customer Name', 'Shipment Type (SEA_FCL/SEA_LCL/AIR/ROAD/RAIL/BULK)',
      'Goods Description', 'BL Number', 'Vessel / Flight', 'Origin Port',
      'Destination Port', 'ETA (YYYY-MM-DD)', 'Free Time End (YYYY-MM-DD)',
      'Container Number', 'Container Size (20FT/40FT/40HC)', 'Seal Number'
    ];
    const example = [
      'ABC Logistics Ltd', 'SEA_FCL', '500 MT Medical Supplies', 'MEDU90123456',
      'MSC Savannah', 'Port of Shanghai', 'Port of Dar es Salaam',
      '2026-11-15', '2026-11-29', 'MSKU9012345', '40HC', 'SL-991201'
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), example.join(',')].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'hudumika_shipment_bulk_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importSheet = async (f: File) => {
    setExcelFile(f);
    setExcelBusy(true);
    setExcelReport(null);
    try {
      const sheets = await readXlsxSheets(f);
      const rows = sheets[0]?.rows ?? [];
      if (rows.length < 2) {
        setExcelReport({
          ok: false,
          text: `"${f.name}" has no data rows below the header. Fill in row 2 with your shipment's details and upload again.`,
          filled: [],
        });
        return;
      }
      const [headerRow, dataRow] = [rows[0], rows[1]];
      const mapCol = (lbl: string): string => {
        const needle = lbl.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = headerRow.findIndex(h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(needle));
        return idx >= 0 && dataRow[idx] !== undefined && dataRow[idx] !== null ? String(dataRow[idx]).trim() : '';
      };

      const extracted: Record<string, string> = {
        customer_name:    mapCol('customer'),
        type:             mapCol('shipmenttype') || mapCol('type'),
        goods_desc:       mapCol('goods') || mapCol('description'),
        bl_number:        mapCol('bl') || mapCol('waybill'),
        vessel:           mapCol('vessel') || mapCol('flight'),
        origin_port:      mapCol('origin'),
        dest_port:        mapCol('dest') || mapCol('discharge'),
        eta:              mapCol('eta'),
        free_time_end:    mapCol('freetime') || mapCol('expiry'),
        container_number: mapCol('container'),
        container_size:   mapCol('size'),
        seal_number:      mapCol('seal'),
      };

      const filledKeys = Object.entries(extracted).filter(([_, v]) => v.length > 0).map(([k]) => k);
      if (filledKeys.length === 0) {
        setExcelReport({
          ok: false,
          text: `Could not recognise columns in "${f.name}". Download the template below to see the expected headers, or continue to fill the form by hand.`,
          filled: [],
        });
        return;
      }

      setCreateForm(p => {
        const next: any = { ...p };
        if (extracted.goods_desc)       next.goods_desc = extracted.goods_desc;
        if (extracted.bl_number)        next.bl_number = extracted.bl_number;
        if (extracted.vessel)           next.vessel = extracted.vessel;
        if (extracted.origin_port)      next.origin_port = extracted.origin_port;
        if (extracted.dest_port)        next.dest_port = extracted.dest_port;
        if (extracted.eta)              next.eta = extracted.eta;
        if (extracted.free_time_end)    next.free_time_end = extracted.free_time_end;
        if (extracted.container_number) next.container_number = extracted.container_number.toUpperCase();
        if (extracted.seal_number)      next.seal_number = extracted.seal_number.toUpperCase();
        if (extracted.type && ['SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'BULK'].includes(extracted.type.toUpperCase())) {
          next.type = extracted.type.toUpperCase() as ShipmentType;
        }
        return next;
      });

      if (extracted.customer_name) {
        const needle = extracted.customer_name.toLowerCase();
        const match = customers.find(c => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()));
        if (match) setCreateForm(p => ({ ...p, customer_id: match.id }));
      }

      const friendly: Record<string, string> = {
        customer_name: 'Customer', type: 'Shipment Type', goods_desc: 'Goods Description',
        bl_number: 'BL Number', vessel: 'Vessel', origin_port: 'Origin Port',
        dest_port: 'Destination Port', eta: 'ETA', free_time_end: 'Free Time End',
        container_number: 'Container Number', seal_number: 'Seal Number',
      };
      setExcelReport({
        ok: true,
        text: `Read ${filledKeys.length} fields from row 2 of "${f.name}". They are applied to the form on Step 3 for review.`,
        filled: filledKeys.map(k => friendly[k] || k),
      });
    } catch (err: any) {
      setExcelReport({
        ok: false,
        text: `Failed to read "${f.name}": ${err?.message || 'unsupported file format'}. Use .xlsx or .csv from the template.`,
        filled: [],
      });
    } finally {
      setExcelBusy(false);
    }
  };

  const handleCreateCase = async () => {
    if (missingRequired.length > 0) {
      showAlert(`Please fill in all required fields before creating: ${missingRequired.join(', ')}.`);
      return;
    }

    setCreateLoading(true);
    try {
      const payload: any = {
        ...createForm,
        declaration_data: ocrDeclarationData || undefined,
        eta: createForm.eta || undefined,
        free_time_end: createForm.free_time_end || undefined,
        assigned_to: createForm.assigned_to || undefined,
      };

      const res = await apiFetch('/v1/shipments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const newShipmentId = res?.data?.id || res?.id;
      const refNumber     = res?.data?.ref_number || res?.ref_number || 'New Shipment';

      if (natureOfGoods === 'dangerous' && newShipmentId && selectedDgEntry) {
        try {
          await apiFetch('/v1/dangerous-goods/declarations', {
            method: 'POST',
            body: JSON.stringify({
              shipmentId: newShipmentId,
              unNumber: selectedDgEntry.un_number,
              properShippingName: selectedDgEntry.proper_shipping_name,
              classOrDivision: selectedDgEntry.class_or_division,
              packingGroup: selectedDgEntry.packing_group || undefined,
              subsidiaryRisk: selectedDgEntry.subsidiary_risk || undefined,
              transportMode: dgForm.transportMode,
              packagingType: dgForm.packagingType || undefined,
              numberOfPackages: dgForm.numberOfPackages ? Number(dgForm.numberOfPackages) : undefined,
              netQuantity: dgForm.netQuantity ? Number(dgForm.netQuantity) : undefined,
              quantityUnit: dgForm.quantityUnit || 'kg',
              shipperName: dgForm.shipperName,
              shipperAddress: dgForm.shipperAddress || undefined,
              consigneeName: customers.find(c => c.id === createForm.customer_id)?.name || undefined,
              emergencyContact: dgForm.emergencyContact || undefined,
            }),
          });
        } catch {
        }
      }

      clearSessionDrafts('shipment');

      if (returnTo) {
        const dest = new URL(returnTo, window.location.origin);
        dest.searchParams.set('shipment_id', newShipmentId);
        dest.searchParams.set('shipment_ref', refNumber);
        navigate(dest.pathname + dest.search);
        return;
      }

      navigate(`/clearos/clearance/${newShipmentId}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create case');
    } finally {
      setCreateLoading(false);
    }
  };

  const steps = [
    { id: 1, title: 'Scan Document', shortTitle: 'Scan', desc: 'Auto-extract data from BL or Invoice via AI.' },
    { id: 2, title: 'Excel Bulk Upload', shortTitle: 'Excel', desc: 'Share or upload a completed Excel template.' },
    { id: 3, title: 'Shipment Details', shortTitle: 'Details', desc: 'Verify and manually complete logistics fields.' },
    { id: 4, title: 'Confirm & Review', shortTitle: 'Review', desc: 'Review the details before creating.' },
  ];

  const fld = (lbl: string, val: string, set: (v: string) => void, props: any = {}) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label className="shipment-form-label">{lbl}</label>
      <input data-ui-field="input" type="text" className="shipment-form-input" value={val} onChange={e => set(e.target.value)} {...props} />
    </div>
  );

  return (
    <div
      className="create-shipment-page"
      style={{
        '--app-color': appColor,
      } as React.CSSProperties}
    >
      {/* Sidebar Navigation */}
      <div className="create-shipment-sidebar">
        <Link to="/clearos/ops" className="create-shipment-brand">
          <Icon name="package" size={24} color="var(--shipment-accent, var(--teal))" />
          <span>{appName}</span>
        </Link>
        <div className="create-shipment-mobile-header">
          <span className="create-shipment-mobile-step-badge">Step {currentStep} of {steps.length}</span>
          <span className="create-shipment-mobile-step-name">{steps[currentStep - 1]?.title}</span>
        </div>
        <div className="create-shipment-steps">
          {steps.map((s) => {
            const status = currentStep === s.id ? 'active' : currentStep > s.id ? 'completed' : 'pending';
            const canJump = s.id < currentStep;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => canJump && setCurrentStep(s.id)}
                className={`create-shipment-step ${status}`}
                title={canJump ? `Go back to ${s.title}` : undefined}
                data-ui-native-button=""
              >
                <div className="create-shipment-step-indicator">
                  {status === 'completed' ? <Icon name="check" size={14} /> : s.id}
                </div>
                <div className="create-shipment-step-content">
                  <div className="create-shipment-step-title">
                    <span className="create-shipment-step-title-full">{s.title}</span>
                    <span className="create-shipment-step-title-short">{s.shortTitle}</span>
                  </div>
                  <div className="create-shipment-step-desc">{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="create-shipment-main">
        <div className="create-shipment-header">
          <Link
            to="/clearos/ops"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              color: 'var(--ink2)', textDecoration: 'none', padding: '6px 14px',
              border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
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
            
            {/* ── Step 1: Scan Document ──────────────────────────────── */}
            {currentStep === 1 && (
              <div>
                {ocrError && (
                  <Banner variant="error" onDismiss={() => setOcrError(null)} className="mb-4">{ocrError}</Banner>
                )}
                {!ocrFile && !ocrScanning && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleOcrFile(f); }}
                    className={`shipment-upload-zone ${dragOver ? 'dragover' : ''}`}
                    onClick={() => {
                      const inp = document.createElement('input');
                      inp.type = 'file';
                      inp.accept = 'image/*,.pdf';
                      inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) handleOcrFile(f); };
                      inp.click();
                    }}
                  >
                    <div className="shipment-upload-icon-circle">
                      <Icon name="fileText" size={28} />
                    </div>
                    <div className="shipment-upload-title">Drop or click to upload shipment document</div>
                    <div className="shipment-upload-subtitle">Our AI reads bills of lading, packing lists, invoices, and waybills</div>
                    <div className="shipment-upload-badges">
                      <span className="shipment-format-pill">Bill of Lading</span>
                      <span className="shipment-format-pill">Commercial Invoice</span>
                      <span className="shipment-format-pill">Packing List</span>
                      <span className="shipment-format-pill">Air Waybill</span>
                      <span className="shipment-format-pill">PDF, JPG, PNG, WEBP</span>
                    </div>
                  </div>
                )}
                {ocrScanning && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spinner size={56} thickness={4} trackColor="var(--shipment-accent-l, var(--teal-l))" style={{ margin: '0 auto 16px' }} />
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Scanning document…</div>
                    <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 8 }}>Our AI is extracting shipment data, voyage, and container details.</div>
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

            {/* ── Step 2: Excel Bulk Upload ──────────────────────────── */}
            {currentStep === 2 && (
              <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                <div
                  className="shipment-upload-icon-circle"
                  style={{ margin: '0 auto 16px', background: 'rgba(5, 150, 105, 0.1)', color: 'var(--green)', boxShadow: '0 0 0 8px rgba(5, 150, 105, 0.08)' }}
                >
                  <Icon name="fileText" size={28} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Bulk Upload via Excel</h3>
                <p style={{ fontSize: 13.5, color: 'var(--ink3)', marginBottom: 24, maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.5 }}>
                  Download the official Hudumika logistics template. Share it with your clients or operators to fill in container and commercial details before uploading here.
                </p>
                <div className="shipment-excel-btn-group">
                  <Button variant="outline" onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="download" size={16} /> Download Template (.csv)
                  </Button>
                  <Button
                   
                    disabled={excelBusy}
                    onClick={() => {
                      const inp = document.createElement('input');
                      inp.type = 'file';
                      inp.accept = '.xlsx,.csv';
                      inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) void importSheet(f); };
                      inp.click();
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    <Icon name="upload" size={16} /> {excelBusy ? 'Reading…' : 'Upload Filled Sheet'}
                  </Button>
                </div>

                {excelReport && (
                  <div style={{
                    maxWidth: 620, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-start',
                    textAlign: 'left', padding: '14px 18px', borderRadius: 'var(--r)',
                    background: excelReport.ok ? 'var(--green-l)' : 'var(--gold-l)',
                    border: `1px solid ${excelReport.ok ? 'var(--green)' : 'var(--gold)'}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}>
                    <Icon name={excelReport.ok ? 'checkCircle' : 'alertCircle'} size={18} color={excelReport.ok ? 'var(--green)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.55 }}>
                      <div>{excelReport.text}</div>
                      <div style={{ marginTop: 12 }}>
                        <Button style={{ fontSize: "var(--text-base)" }} onClick={() => setCurrentStep(3)}>
                          {excelReport.ok ? 'Review Extracted Fields' : 'Fill Form by Hand'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Structured Shipment Details Form ───────────── */}
            {currentStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>

                {/* Pre-fill banner notification */}
                {(ocrResult || excelReport?.ok) && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px',
                    background: 'var(--shipment-accent-l, var(--teal-l))', borderRadius: 'var(--r)', fontSize: 12.5,
                    color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 20, border: '1px solid var(--shipment-accent, var(--teal))'
                  }}>
                    <Icon name="check" size={16} color="var(--shipment-accent, var(--teal))" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                      {excelReport?.ok
                        ? <>Pre-filled from <strong>{excelFile?.name}</strong>: {excelReport.filled.join(', ')}. </>
                        : <>Pre-filled from scanned document. </>}
                      Verify every field below before proceeding to confirm.
                    </span>
                  </div>
                )}

                {/* ── Section 1: Customer & Cargo Classification ── */}
                <div className="shipment-section-card">
                  <div className="shipment-section-header">
                    <div className="shipment-section-icon-wrap">
                      <Icon name="package" size={17} />
                    </div>
                    <div>
                      <div className="shipment-section-title">Customer & Cargo Information</div>
                      <div className="shipment-section-desc">Client account, cargo description, and regulatory classification</div>
                    </div>
                  </div>

                  <div className="shipment-form-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="shipment-form-label">Customer Account *</label>
                      <Combobox
                        options={customers.map(c => ({ value: c.id, label: c.name }))}
                        value={createForm.customer_id}
                        onChange={v => setCreateForm(p => ({ ...p, customer_id: v }))}
                        placeholder="Search or select customer…"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="shipment-form-label">Nature of Goods</label>
                      <Select value={natureOfGoods} onValueChange={v => setNatureOfGoods(v as any)}>
                        <SelectTrigger className="shipment-form-input"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General Cargo</SelectItem>
                          <SelectItem value="dangerous">Dangerous Goods (DG)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <label className="shipment-form-label">Goods Description *</label>
                    <input data-ui-field="input"
                      type="text"
                      className="shipment-form-input"
                      placeholder="e.g. 500 MT of Medical Supplies, Industrial Equipment, etc."
                      value={createForm.goods_desc}
                      onChange={e => setCreateForm(p => ({ ...p, goods_desc: e.target.value }))}
                    />
                  </div>

                  {/* Dangerous Goods sub-panel */}
                  {natureOfGoods === 'dangerous' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="alertTriangle" size={16} color="var(--gold)" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Dangerous Goods — Statutory Requirements</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -6 }}>
                        Creates a linked draft declaration alongside this shipment for immediate compliance generation.
                      </div>

                      <div className="shipment-form-row" style={{ marginBottom: 0 }}>
                        <div style={{ flex: 1 }}>
                          <label className="shipment-form-label">Transport Mode</label>
                          <Select value={dgForm.transportMode} onValueChange={v => setDgForm(p => ({ ...p, transportMode: v as any }))}>
                            <SelectTrigger className="shipment-form-input"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SEA">Sea</SelectItem>
                              <SelectItem value="AIR">Air</SelectItem>
                              <SelectItem value="ROAD">Road</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div style={{ flex: 2 }}>
                          <label className="shipment-form-label">UN Number / Goods Name *</label>
                          <EntityPicker value={selectedDg} onChange={onPickDg} search={searchDg} placeholder="Search UN number or proper shipping name…" />
                        </div>
                      </div>

                      {selectedDgEntry && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--white)', fontSize: 12.5 }}>
                          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedDgEntry.un_number}</span>
                          <span style={{ color: 'var(--ink)' }}>{selectedDgEntry.proper_shipping_name}</span>
                          <span style={{ color: 'var(--ink3)' }}>
                            Class {selectedDgEntry.class_or_division}
                            {selectedDgEntry.subsidiary_risk ? ` (Sub-risk: ${selectedDgEntry.subsidiary_risk})` : ''}
                            {selectedDgEntry.packing_group ? ` · PG ${selectedDgEntry.packing_group}` : ''}
                          </span>
                        </div>
                      )}

                      <div className="shipment-form-row" style={{ marginBottom: 0 }}>
                        {fld('Packaging Type', dgForm.packagingType, v => setDgForm(p => ({ ...p, packagingType: v })), { placeholder: 'e.g. Steel drum, Fibreboard box' })}
                        {fld('No. of Packages', dgForm.numberOfPackages, v => setDgForm(p => ({ ...p, numberOfPackages: v.replace(/[^0-9]/g, '') })))}
                        {fld('Net Quantity', dgForm.netQuantity, v => setDgForm(p => ({ ...p, netQuantity: v.replace(/[^0-9.]/g, '') })))}
                        {fld('Unit', dgForm.quantityUnit, v => setDgForm(p => ({ ...p, quantityUnit: v })))}
                      </div>

                      <div className="shipment-form-row" style={{ marginBottom: 0 }}>
                        {fld('Shipper Name *', dgForm.shipperName, v => setDgForm(p => ({ ...p, shipperName: v })))}
                        {fld('Shipper Address', dgForm.shipperAddress, v => setDgForm(p => ({ ...p, shipperAddress: v })))}
                      </div>

                      {fld('Emergency 24h Contact', dgForm.emergencyContact, v => setDgForm(p => ({ ...p, emergencyContact: v })), { placeholder: 'Contact name + 24h phone' })}
                    </div>
                  )}
                </div>

                {/* ── Section 2: Transport Mode & Route (with Middle Icons) ── */}
                <div className="shipment-section-card">
                  <div className="shipment-section-header">
                    <div className="shipment-section-icon-wrap">
                      <Icon name={getTransportIcon(createForm.type)} size={17} />
                    </div>
                    <div>
                      <div className="shipment-section-title">Transport Mode & Journey Routing</div>
                      <div className="shipment-section-desc">Select transport method and define origin-to-destination corridor</div>
                    </div>
                  </div>

                  {/* Mode Selector Cards */}
                  <div className="shipment-transport-grid">
                    {TRANSPORT_MODES.map(m => {
                      const isSel = createForm.type === m.value;
                      return (
                        <div
                          key={m.value}
                          onClick={() => setCreateForm(p => ({ ...p, type: m.value }))}
                          className={`shipment-transport-tile ${isSel ? 'active' : ''}`}
                        >
                          <div className="shipment-transport-tile-icon">
                            <Icon name={m.icon} size={18} />
                          </div>
                          <div className="shipment-transport-tile-label">{m.label}</div>
                          <div className="shipment-transport-tile-sub">{m.sub}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Route Corridor Row with Connected Middle Icon */}
                  <div className="shipment-route-row">
                    <div className="shipment-route-col">
                      <label className="shipment-form-label">Origin Port / Place of Receipt *</label>
                      <div style={{ position: 'relative' }}>
                        <input data-ui-field="input"
                          type="text"
                          className="shipment-form-input"
                          style={{ paddingLeft: 34 }}
                          placeholder="e.g. Shanghai (CNSHA), Dubai (AEDXB)"
                          value={createForm.origin_port}
                          onChange={e => setCreateForm(p => ({ ...p, origin_port: e.target.value }))}
                        />
                        <Icon name="mapPin" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                      </div>
                    </div>

                    {/* Middle Route Connector Icon */}
                    <div className="shipment-route-middle">
                      <div className="shipment-route-line" />
                      <div className="shipment-route-icon-badge" title={`Transport via ${createForm.type}`}>
                        <Icon name={getTransportIcon(createForm.type)} size={17} />
                      </div>
                    </div>

                    <div className="shipment-route-col">
                      <label className="shipment-form-label">Destination Port / Port of Discharge *</label>
                      <div style={{ position: 'relative' }}>
                        <input data-ui-field="input"
                          type="text"
                          className="shipment-form-input"
                          style={{ paddingLeft: 34 }}
                          placeholder="e.g. Dar es Salaam (TZDAR), Mombasa (KEMBA)"
                          value={createForm.dest_port}
                          onChange={e => setCreateForm(p => ({ ...p, dest_port: e.target.value }))}
                        />
                        <Icon name="compass" size={15} color="var(--shipment-accent, var(--teal))" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                      </div>
                    </div>
                  </div>

                  <div className="shipment-form-row">
                    {fld('BL / Air Waybill Number', createForm.bl_number, v => setCreateForm(p => ({ ...p, bl_number: v })), { placeholder: 'e.g. MEDU90123456, 023-12345678' })}
                    {fld('Vessel / Flight *', createForm.vessel, v => setCreateForm(p => ({ ...p, vessel: v })), { placeholder: 'e.g. MSC Savannah, KQ 482' })}
                  </div>
                </div>

                {/* ── Section 3: Schedule & Critical Time Windows ── */}
                <div className="shipment-section-card">
                  <div className="shipment-section-header">
                    <div className="shipment-section-icon-wrap">
                      <Icon name="clock" size={17} />
                    </div>
                    <div>
                      <div className="shipment-section-title">Schedule & Demurrage Windows</div>
                      <div className="shipment-section-desc">Estimated arrival and carrier free-time demurrage milestones</div>
                    </div>
                  </div>

                  <div className="shipment-form-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="shipment-form-label">Estimated Time of Arrival (ETA)</label>
                      <DatePicker
                        date={parseDateOnly(createForm.eta)}
                        onChange={d => setCreateForm(p => ({ ...p, eta: toDateOnlyString(d) }))}
                        placeholder="Select arrival date"
                        triggerClassName="w-full h-10"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="shipment-form-label">Free Time Expiry (Demurrage End)</label>
                      <DatePicker
                        date={parseDateOnly(createForm.free_time_end)}
                        onChange={d => setCreateForm(p => ({ ...p, free_time_end: toDateOnlyString(d) }))}
                        placeholder="Select free time deadline"
                        triggerClassName="w-full h-10"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Section 4: Equipment & Operations ── */}
                <div className="shipment-section-card">
                  <div className="shipment-section-header">
                    <div className="shipment-section-icon-wrap">
                      <Icon name="settings" size={17} />
                    </div>
                    <div>
                      <div className="shipment-section-title">Equipment & Operational Assignment</div>
                      <div className="shipment-section-desc">Container equipment details and officer assignment</div>
                    </div>
                  </div>

                  <div className="shipment-form-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="shipment-form-label">Assigned Clearing Officer</label>
                      <OfficerMentionInput
                        officers={officers}
                        value={{ id: createForm.assigned_to, name: createForm.assigned_to_name }}
                        onChange={(id, name) => setCreateForm(p => ({ ...p, assigned_to: id, assigned_to_name: name }))}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {fld('Container Number', createForm.container_number,
                        v => setCreateForm(p => ({ ...p, container_number: v.toUpperCase() })),
                        { placeholder: 'e.g. MSKU1234565' })}
                      <ContainerIdentity number={createForm.container_number} />
                      {containerHint && (
                        <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.45, display: 'flex', gap: 6, alignItems: 'flex-start', color: containerHint.ok ? 'var(--green)' : 'var(--gold)' }}>
                          <Icon name={containerHint.ok ? 'checkCircle' : 'alertCircle'} size={12} color={containerHint.ok ? 'var(--green)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span>{containerHint.text}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shipment-form-row" style={{ marginBottom: 0 }}>
                    {fld('Seal Number', createForm.seal_number, v => setCreateForm(p => ({ ...p, seal_number: v.toUpperCase() })), { placeholder: 'e.g. SL-881920' })}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="shipment-form-label">Clearance Workflow Rule</label>
                      <Select value={createForm.workflow_id || '__auto__'} onValueChange={v => setCreateForm(p => ({ ...p, workflow_id: v === '__auto__' ? '' : v }))}>
                        <SelectTrigger className="shipment-form-input"><SelectValue placeholder="Automatic (recommended)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Automatic (recommended)</SelectItem>
                          {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                          <SelectItem value="legacy">Standard Built-in Stages</SelectItem>
                        </SelectContent>
                      </Select>
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>
                        {createForm.workflow_id === '' ? 'Chosen automatically based on customer and cargo selectivity.'
                          : createForm.workflow_id === 'legacy' ? 'Uses standard Tanzanian single-window stages.'
                          : 'Specific custom workflow assigned.'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ── Step 4: Confirm & Review ───────────────────────────── */}
            {currentStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="shipment-confirm-hero">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <h3 style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
                        {createForm.goods_desc || 'Untitled Shipment'}
                      </h3>
                      <div style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 600, marginTop: 4 }}>
                        {customers.find(c => c.id === createForm.customer_id)?.name || 'Unassigned Customer'}
                      </div>
                    </div>
                    <Badge variant="brand" className="font-bold text-xs py-1 px-3">
                      {createForm.type.replace('_', ' ')}
                    </Badge>
                  </div>

                  {/* Visual Route Strip in Confirm */}
                  <div className="shipment-confirm-route-banner">
                    <div className="shipment-confirm-route-point">
                      <span className="shipment-confirm-route-tag">Origin</span>
                      <span className="shipment-confirm-route-val">{createForm.origin_port || '—'}</span>
                    </div>

                    <div className="shipment-confirm-route-connector">
                      <span className="shipment-confirm-route-line" />
                      <div className="shipment-confirm-route-icon">
                        <Icon name={getTransportIcon(createForm.type)} size={16} />
                      </div>
                      <span className="shipment-confirm-route-line" />
                    </div>

                    <div className="shipment-confirm-route-point shipment-confirm-route-point--right">
                      <span className="shipment-confirm-route-tag">Destination</span>
                      <span className="shipment-confirm-route-val">{createForm.dest_port || '—'}</span>
                    </div>
                  </div>

                  {/* 4-Card Summary Grid */}
                  <div className="shipment-confirm-grid">
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Vessel / Carrier</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{createForm.vessel || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>BL / Waybill #</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--font)' }}>{createForm.bl_number || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Estimated Arrival (ETA)</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{createForm.eta || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Free Time Deadline</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{createForm.free_time_end || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Assigned Officer</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{createForm.assigned_to_name || 'Unassigned'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Equipment & Seal</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>
                        {createForm.container_number ? `${createForm.container_number} (${createForm.container_size || '40HC'})` : 'No container'}
                        {createForm.seal_number ? ` · Seal #${createForm.seal_number}` : ''}
                      </div>
                    </div>
                  </div>
                </div>

                <Banner variant="info" icon="bell" title="Notification will be dispatched">
                  {createForm.assigned_to_name ? `Clearing officer ${createForm.assigned_to_name} will be assigned and notified.` : 'Case will be placed into the general operations queue.'}
                </Banner>
              </div>
            )}
            
            {/* ── Footer Navigation ──────────────────────────────────── */}
            <div className="create-shipment-footer">
              <Button variant="outline" 
                type="button" 
                
                onClick={() => currentStep > 1 ? setCurrentStep(s => s - 1) : navigate('/clearos/ops')}
              >
                {currentStep === 1 ? 'Cancel' : 'Previous Step'}
              </Button>
              
              {currentStep === 1 && (
                <div className="create-shipment-footer-actions">
                  <Button variant="outline" type="button" onClick={() => setCurrentStep(2)}>Skip OCR</Button>
                  <Button type="button" onClick={applyOcrToForm} disabled={!ocrResult}>Apply Extracted Data</Button>
                </div>
              )}
              
              {currentStep === 2 && (
                <div className="create-shipment-footer-actions">
                  <Button variant="outline" type="button" onClick={() => setCurrentStep(3)}>Skip Excel</Button>
                  <Button type="button" onClick={() => setCurrentStep(3)} disabled={!excelReport}>Continue to Form</Button>
                </div>
              )}
              
              {currentStep === 3 && (
                <div className="create-shipment-footer-actions">
                  <Button type="button" onClick={() => setCurrentStep(4)}>
                    Review Details &rarr;
                  </Button>
                </div>
              )}
              
              {currentStep === 4 && (
                <div className="create-shipment-footer-actions create-shipment-footer-actions--end">
                  {missingRequired.length > 0 && (
                    <span className="create-shipment-missing-msg">
                      Missing: <strong style={{ color: 'var(--red)' }}>{missingRequired.join(', ')}</strong>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--shipment-accent, var(--teal))', fontWeight: 600, cursor: 'pointer', fontSize: "var(--text-base)" }}
                        data-ui-native-button=""
                      >
                        Go back to edit
                      </button>
                    </span>
                  )}
                  <Button
                    type="button"
                   
                    onClick={handleCreateCase}
                    disabled={createLoading || missingRequired.length > 0}
                    style={{ fontWeight: 700 }}
                  >
                    {createLoading ? 'Creating Shipment…' : 'Create Shipment Case'}
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
