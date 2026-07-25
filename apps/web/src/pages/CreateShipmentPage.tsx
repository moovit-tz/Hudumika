import React, { useState, useEffect, useRef } from 'react';
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
import { showAlert } from '../lib/alert.js';
import './CreateShipmentPage.css';

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
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
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

      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1.5 max-h-[220px] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>No staff found</div>
        ) : filtered.slice(0, 8).map(o => (
          <button
            key={o.user_id || o.id}
            type="button"
            onClick={() => select(o)}
            className="rounded-lg hover:bg-accent hover:text-accent-foreground"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}
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
  
  const [dragOver, setDragOver] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [ocrSimulated, setOcrSimulated] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrDeclarationData, setOcrDeclarationData] = useState<any | null>(null);

  const [excelFile, setExcelFile] = useState<File | null>(null);

  const [createForm, setCreateForm] = useState({
    customer_id: '',
    type: 'SEA_FCL' as ShipmentType,
    goods_desc: '',
    bl_number: '',
    vessel: '',
    origin_port: 'Port of Shanghai',
    dest_port: 'Port of Dar es Salaam',
    eta: '',
    free_time_end: '',
    assigned_to: '',
    assigned_to_name: '',
    container_number: 'MSKU' + Math.floor(1000000 + Math.random() * 9000000),
    container_size: '40HC' as const,
  });
  
  const [createLoading, setCreateLoading] = useState(false);

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
          containers: [{
            number: createForm.container_number,
            size: createForm.container_size,
            seal_number: 'SL-' + Math.floor(100000 + Math.random() * 900000),
          }],
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
          <div className="create-shipment-title">
            {currentStep === 1 && 'Scan Document'}
            {currentStep === 2 && 'Excel Bulk Upload'}
            {currentStep === 3 && 'Shipment Details'}
            {currentStep === 4 && 'Confirm & Create'}
          </div>
          <div className="create-shipment-subtitle">
            {currentStep === 1 && 'Drop a Bill of Lading, Commercial Invoice, or Packing List to automatically extract shipment data using AI.'}
            {currentStep === 2 && 'Alternatively, download the standard Hudumika Excel template, fill it out with bulk container/items data, and upload it here.'}
            {currentStep === 3 && 'Verify the extracted information. Fill in any missing required fields before proceeding.'}
            {currentStep === 4 && 'Please review the final details below before creating the shipment record in the system.'}
          </div>

          <div className="create-shipment-card">
            {/* Step 1: OCR */}
            {currentStep === 1 && (
              <div>
                {ocrError && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#991b1b' }}>{ocrError}</div>
                    <button type="button" title="Dismiss" onClick={() => setOcrError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700, fontSize: 13 }}>×</button>
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
                {ocrResult && !ocrScanning && (() => {
                  const ov = ocrResult.overview || {};
                  const conf = Math.round((ocrResult.confidence || 0.9) * 100);
                  return (
                    <div style={{ display: 'flex', gap: 24 }}>
                      {ocrPreview && (
                        <div style={{ flexShrink: 0 }}>
                          <img src={ocrPreview} alt="Scanned document" style={{ width: 200, height: 260, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, background: 'var(--teal)', color: '#fff', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>{ocrResult.doc_type}</span>
                            {ocrSimulated && <span style={{ fontSize: 12, background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>Demo data</span>}
                            <span style={{ fontSize: 12, color: conf >= 85 ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>{conf}% confidence</span>
                          </div>
                          <button type="button" className="btn btn-secondary" title="Re-scan a different document" style={{ fontSize: 12, padding: '4px 12px', minHeight: 32, height: 32 }}
                            onClick={() => { setOcrFile(null); setOcrPreview(null); setOcrResult(null); }}>
                            Re-scan
                          </button>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Extracted Overview</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 20 }}>
                          {[
                            ['B/L Number', ov.bl_number], ['Vessel', ov.vessel],
                            ['Origin Port', ov.origin_port], ['Dest Port', ov.dest_port],
                            ['ETA', ov.eta], ['Container', ov.container_number],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k as string} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)' }}>
                              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{k}</span>
                              <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        {ov.goods_desc && (
                          <div style={{ padding: '14px 16px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 10, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 700, color: 'var(--teal-d)', display: 'block', marginBottom: 4, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>Goods Description</span>
                            {ov.goods_desc}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
                  <button className="btn btn-secondary" onClick={() => showAlert('Downloading Excel template...')}>
                    <Icon name="download" size={16} /> Download Template
                  </button>
                  <button className="btn btn-primary" onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.csv'; inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) { setExcelFile(f); setTimeout(() => setCurrentStep(3), 1000); } }; inp.click(); }}>
                    <Icon name="upload" size={16} /> Upload Filled Excel
                  </button>
                </div>
                {excelFile && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--green-l)', color: 'var(--green)', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                    <Icon name="check" size={16} /> {excelFile.name} parsed successfully.
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Form */}
            {currentStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {(ocrResult || excelFile) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--teal-l)', borderRadius: 9, fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>
                    <Icon name="check" size={16} />
                    <span>Data applied — additional details will be pre-filled in the Shipment record.</span>
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
                  {fld('Container No.', createForm.container_number, v => setCreateForm(p => ({ ...p, container_number: v })))}
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
                  <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(3)} disabled={!excelFile}>Continue</button>
                </div>
              )}
              
              {currentStep === 3 && (
                <button type="button" className="btn btn-primary" onClick={() => setCurrentStep(4)}>
                  Review Details
                </button>
              )}
              
              {currentStep === 4 && (
                <button type="button" className="btn btn-primary" onClick={handleCreateCase} disabled={createLoading || !createForm.customer_id || !createForm.vessel || !createForm.goods_desc}>
                  {createLoading ? 'Creating...' : 'Create Shipment'}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
