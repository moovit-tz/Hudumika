import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.js';
import { getCompany, subscribeCompany } from '../data/companyStore.js';
import { getJobs } from './clearanceData.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { useBranding } from '../hooks/useBranding.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { showConfirm } from '../lib/confirm.js';

const ORANGE = '#f97316';
const DARK   = '#1e293b';

// ── Types ─────────────────────────────────────────────────────────────────────
interface GoodsRow {
  no: number; description: string;
  qtySent: number; qtyReceived: number;
  condition: string; variance: number; remarks: string;
}

interface DN {
  id: string; noteNo: string; date: string; time: string;
  dispatchRef: string; invoiceNo: string;
  consigneeName: string; contactPerson: string; phone: string;
  email: string; deliveryAddress: string; city: string;
  driverName: string; vehicleNo: string; driverContact: string;
  carrier: string; deliveryDate: string; deliveryTime: string;
  rows: GoodsRow[];
  statusFlags: string[];
  discrepancyNotes: string;
}

// ── Linked invoice option (real data — GET /v1/invoices joined against GET /v1/customers) ──
interface InvoiceOption {
  no: string; client: string; address: string; city: string; contact: string; phone: string; email: string;
}

// ── Mock notes ────────────────────────────────────────────────────────────────
function blankRows(from: number, count: number): GoodsRow[] {
  return Array.from({ length: count }, (_, i) => ({ no: from + i, description: '', qtySent: 0, qtyReceived: 0, condition: '', variance: 0, remarks: '' }));
}

function apiToDN(apiDN: any): DN {
  let extra: Partial<DN> = {};
  try { extra = JSON.parse(apiDN.notes || '{}'); } catch {}

  const rows = Array.isArray(apiDN.lines) ? apiDN.lines.map((l: any, i: number) => {
    let lextra: any = {};
    try { lextra = JSON.parse(l.notes || '{}'); } catch {}
    return {
      no: i + 1,
      description: l.description || '',
      qtySent: Number(l.qty_ordered) || 0,
      qtyReceived: Number(l.qty_delivered) || 0,
      condition: lextra.condition || '',
      variance: lextra.variance || 0,
      remarks: lextra.remarks || ''
    };
  }) : [];

  return {
    id: apiDN.id,
    noteNo: apiDN.dn_number || '',
    date: extra.date || '',
    time: extra.time || '',
    dispatchRef: extra.dispatchRef || '',
    invoiceNo: extra.invoiceNo || '',
    consigneeName: apiDN.customer_name || '',
    contactPerson: extra.contactPerson || '',
    phone: extra.phone || '',
    email: extra.email || '',
    deliveryAddress: extra.deliveryAddress || '',
    city: extra.city || '',
    driverName: extra.driverName || '',
    vehicleNo: extra.vehicleNo || '',
    driverContact: extra.driverContact || '',
    carrier: extra.carrier || '',
    deliveryDate: apiDN.delivery_date ? String(apiDN.delivery_date).slice(0, 10) : (extra.deliveryDate || ''),
    deliveryTime: extra.deliveryTime || '',
    statusFlags: extra.statusFlags || [apiDN.status || 'DRAFT'],
    discrepancyNotes: extra.discrepancyNotes || '',
    rows
  };
}

function dnToApi(n: DN): any {
  return {
    dn_number: n.noteNo,
    customer_name: n.consigneeName,
    delivery_date: n.deliveryDate || null,
    status: n.statusFlags[0] || 'DRAFT',
    notes: JSON.stringify({
      date: n.date, time: n.time, dispatchRef: n.dispatchRef, invoiceNo: n.invoiceNo,
      contactPerson: n.contactPerson, phone: n.phone, email: n.email,
      deliveryAddress: n.deliveryAddress, city: n.city,
      driverName: n.driverName, vehicleNo: n.vehicleNo, driverContact: n.driverContact,
      carrier: n.carrier, deliveryTime: n.deliveryTime,
      discrepancyNotes: n.discrepancyNotes,
      statusFlags: n.statusFlags
    }),
    lines: n.rows.map(r => ({
      description: r.description,
      qty_ordered: r.qtySent,
      qty_delivered: r.qtyReceived,
      unit: 'ea',
      notes: JSON.stringify({ condition: r.condition, variance: r.variance, remarks: r.remarks })
    }))
  };
}


// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:             { label: 'Pending',             color: 'var(--gold)', bg: 'var(--gold-l)' },
  fully_delivered:     { label: 'Fully Delivered',     color: 'var(--green)', bg: 'var(--green-l)' },
  partially_delivered: { label: 'Partially Delivered', color: 'var(--blue)', bg: 'var(--blue-l)' },
  damaged:             { label: 'Goods Damaged',       color: 'var(--gold)', bg: 'var(--gold-l)' },
  missing:             { label: 'Missing Items',       color: 'var(--purple)', bg: 'var(--purple-l)' },
  returned:            { label: 'Returned',            color: 'var(--ink2)', bg: 'var(--bg)' },
};

const STATUS_OPTIONS = [
  { key: 'fully_delivered',     label: 'Fully Delivered'     },
  { key: 'partially_delivered', label: 'Partially Delivered' },
  { key: 'damaged',             label: 'Goods Damaged'       },
  { key: 'missing',             label: 'Missing Items'       },
  { key: 'returned',            label: 'Returned'            },
];

// ── Print template (matches attached PDF design) ──────────────────────────────
function PrintTemplate({ note }: { note: DN }) {
  const branding = useBranding();
  const [co, setCo] = useState(getCompany);
  useEffect(() => subscribeCompany(() => setCo(getCompany())), []);

  const totalSent     = note.rows.reduce((s, r) => s + (r.qtySent     || 0), 0);
  const totalReceived = note.rows.reduce((s, r) => s + (r.qtyReceived || 0), 0);
  const totalVariance = note.rows.reduce((s, r) => s + (r.variance    || 0), 0);

  const cell = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: '6px 8px', fontSize: 10.5, borderBottom: '1px solid #e5e7eb', ...extra,
  });

  const sectionHdr = (title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: '#fef9f5', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ width: 4, height: 14, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: '#222', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
    </div>
  );

  const logoToUse = branding.logoLight || branding.getAppLogo('clearos') || co.logoUrl;

  return (
    <div style={{ width: 960, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, color: '#000', background: '#fff', lineHeight: 1.4 }}>

      {/* ── Header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 190px', marginBottom: 12 }}>
        {/* Company logo column */}
        <div style={{ background: DARK, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, background: ORANGE }} />
          <div style={{ position: 'relative', padding: '14px 12px 14px 60px' }}>
            {logoToUse
              ? <img src={logoToUse} alt={branding.platformName || co.name} style={{ height: 36, objectFit: 'contain', marginBottom: 6, display: 'block' }} />
              : <>
                  <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{(branding.platformName || co.name).split(' ')[0]}</div>
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: ORANGE, marginBottom: 10 }}>{(branding.platformTagline || co.tagline).split(' ').slice(0, 2).join(' ')}</div>
                </>
            }
            <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
              {co.address}<br />{co.city} · {co.phone}<br />{branding.supportEmail || co.email}
            </div>
          </div>
        </div>
        {/* Title column */}
        <div style={{ background: DARK, padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>DELIVERY NOTE</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 7 }}>{co.name} · {co.website}</div>
        </div>
        {/* Meta fields column */}
        <div style={{ background: '#fdf8f0', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[['Note No', note.noteNo], ['Date', note.date], ['Time', note.time], ['Dispatch Ref', note.dispatchRef]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 1 }}>{l}:</div>
              <div style={{ borderBottom: `1.5px solid ${ORANGE}`, paddingBottom: 2, fontSize: 11, fontWeight: 600, color: '#000', minHeight: 14 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Consignee + Driver ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
        {[
          {
            title: 'Consignee (Delivery To)',
            fields: [
              ['Company / Receiver Name', note.consigneeName], ['Contact Person', note.contactPerson], ['Phone', note.phone],
              ['Email', note.email], ['Delivery Address', note.deliveryAddress], ['Country / City', note.city],
            ],
          },
          {
            title: 'Delivered By (Driver / Agent)',
            fields: [
              ['Driver / Agent Name', note.driverName], ['Vehicle / Flight No.', note.vehicleNo], ['Driver Contact', note.driverContact],
              ['Carrier / Airline', note.carrier], ['Delivery Date', note.deliveryDate], ['Delivery Time', note.deliveryTime],
            ],
          },
        ].map((sec, si) => (
          <div key={si} style={{ border: '1px solid #e5e7eb', borderRight: si === 0 ? 'none' : '1px solid #e5e7eb' }}>
            {sectionHdr(sec.title)}
            <div style={{ padding: '8px 10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px' }}>
                {sec.fields.map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: ORANGE, marginBottom: 2 }}>{l}</div>
                    <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 4, fontSize: 10.5, minHeight: 14 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Goods table ── */}
      <div style={{ border: '1px solid #e5e7eb', marginBottom: 10 }}>
        {sectionHdr('Goods Delivery Record')}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: ORANGE }}>
              {[['No.',40,'center'],['Description of Goods','auto','left'],['Qty Sent',80,'center'],['Qty Received',95,'center'],['Condition',100,'left'],['Variance',75,'center'],['Remarks','auto','left']].map(([h, w, a]) => (
                <th key={h} style={{ padding: '7px 8px', fontSize: 10, fontWeight: 800, color: '#fff', textAlign: a as React.CSSProperties['textAlign'], width: w as any, borderRight: '1px solid rgba(255,255,255,0.2)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? '#fafafa' : '#fff', borderBottom: '1px solid #e5e7eb' }}>
                <td style={cell({ textAlign: 'center', fontWeight: 600 })}>{row.no}</td>
                <td style={cell()}>{row.description}</td>
                <td style={cell({ textAlign: 'center' })}>{row.qtySent  || ''}</td>
                <td style={cell({ textAlign: 'center' })}>{row.qtyReceived || ''}</td>
                <td style={cell()}>{row.condition}</td>
                <td style={cell({ textAlign: 'center', color: (row.variance ?? 0) < 0 ? '#dc2626' : '#000', fontWeight: row.variance ? 700 : 400 })}>{row.variance || ''}</td>
                <td style={cell()}>{row.remarks}</td>
              </tr>
            ))}
            <tr style={{ background: '#fef9f5', borderTop: '2px solid #e5e7eb' }}>
              <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10 }}><b style={{ color: ORANGE }}>Total Packages Sent: </b><b>{totalSent || ''}</b></td>
              <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10 }}><b style={{ color: ORANGE }}>Total Packages Received: </b><b>{totalReceived || ''}</b></td>
              <td colSpan={3} style={{ padding: '6px 8px', fontSize: 10 }}><b style={{ color: ORANGE }}>Total Variance: </b><b style={{ color: totalVariance < 0 ? '#dc2626' : '#000' }}>{totalVariance || ''}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Status + Signatures ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', marginBottom: 10 }}>
        {/* Delivery status */}
        <div style={{ border: '1px solid #e5e7eb', borderRight: 'none' }}>
          {sectionHdr('Delivery Status')}
          <div style={{ padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 8px', marginBottom: 10 }}>
              {STATUS_OPTIONS.map(({ key, label }) => {
                const on = note.statusFlags.includes(key);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5 }}>
                    <div style={{ width: 10, height: 10, border: `1.5px solid ${on ? ORANGE : '#aaa'}`, borderRadius: 2, background: on ? ORANGE : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {on && <span style={{ color: '#fff', fontSize: 7, fontWeight: 900 }}>✓</span>}
                    </div>
                    {label}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: ORANGE, marginBottom: 3 }}>Discrepancy Notes:</div>
            <div style={{ borderTop: '1px solid #e5e7eb', minHeight: 24, paddingTop: 4, fontSize: 9.5, lineHeight: 1.5 }}>{note.discrepancyNotes}</div>
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, minHeight: 20 }} />
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, minHeight: 20 }} />
          </div>
        </div>

        {/* Signatures */}
        <div style={{ border: '1px solid #e5e7eb' }}>
          {sectionHdr('Confirmation Signatures')}
          <div style={{ padding: '5px 10px 4px', fontSize: 9, fontStyle: 'italic', color: '#666', borderBottom: '1px solid #e5e7eb' }}>
            By signing below, all parties confirm the accuracy of goods received as described in this Delivery Note.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {['Receiver Confirmation', 'Driver / Agent', `${co.name.split(' ')[0]} Representative`].map((party, i) => (
              <div key={party} style={{ borderRight: i < 2 ? '1px solid #e5e7eb' : 'none' }}>
                <div style={{ padding: '5px 10px', background: ORANGE }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff' }}>{party}</span>
                </div>
                <div style={{ padding: '8px 14px' }}>
                  {['Name', 'Sig', 'Date'].map((f, fi) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: fi < 2 ? 18 : 4 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{f}:</span>
                      <div style={{ flex: 1, borderBottom: `1px solid ${ORANGE}` }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ background: DARK, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
        <div style={{ width: 10, height: 10, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontWeight: 800, color: '#fff', textTransform: 'uppercase', fontSize: 8.5, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{co.name.toUpperCase()}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8.5 }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, whiteSpace: 'nowrap' }}>{co.address}, {co.country}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8.5 }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, whiteSpace: 'nowrap' }}>{co.phone}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8.5 }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, whiteSpace: 'nowrap' }}>{co.email}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8.5 }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, whiteSpace: 'nowrap' }}>{co.website}</span>
      </div>
    </div>
  );
}

// ── Form section heading ──────────────────────────────────────────────────────
function FSection({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 24px 6px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
      {title}
    </div>
  );
}

function FRow({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={{ gridColumn: span ? 'span 2' : undefined }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// ── Create / Edit Drawer ──────────────────────────────────────────────────────
function NoteDrawer({ note, onSave, onClose, isMobile, invoices }: { note: DN; onSave: (n: DN) => void; onClose: () => void; isMobile: boolean; invoices: InvoiceOption[] }) {
  const [f, setF] = useState<DN>(note);
  const [selectedJobId, setSelectedJobId] = useState('');
  const jobs = getJobs();

  function set<K extends keyof DN>(k: K, v: DN[K]) {
    setF(prev => ({ ...prev, [k]: v }));
  }

  function pickJob(jobId: string) {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      setF(prev => ({
        ...prev,
        dispatchRef: job.bl ?? prev.dispatchRef,
        consigneeName: job.customer,
        invoiceNo: '',
      }));
    }
  }

  function pickInvoice(invoiceNo: string) {
    const inv = invoices.find(i => i.no === invoiceNo);
    if (inv) {
      setF(prev => ({
        ...prev, invoiceNo,
        consigneeName: inv.client, contactPerson: inv.contact,
        phone: inv.phone, email: inv.email,
        deliveryAddress: inv.address, city: inv.city,
      }));
    } else {
      setF(prev => ({ ...prev, invoiceNo }));
    }
  }

  function updateRow(idx: number, field: keyof GoodsRow, val: string | number) {
    setF(prev => {
      const rows = prev.rows.map((r, i) => {
        if (i !== idx) return r;
        const updated = { ...r, [field]: val };
        if (field === 'qtySent' || field === 'qtyReceived') {
          updated.variance = (field === 'qtyReceived' ? Number(val) : r.qtyReceived) - (field === 'qtySent' ? Number(val) : r.qtySent);
        }
        return updated;
      });
      return { ...prev, rows };
    });
  }

  function addRow() {
    setF(prev => ({ ...prev, rows: [...prev.rows, { no: prev.rows.length + 1, description: '', qtySent: 0, qtyReceived: 0, condition: '', variance: 0, remarks: '' }] }));
  }

  function removeRow(idx: number) {
    setF(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== idx).map((r, i) => ({ ...r, no: i + 1 })) }));
  }

  function toggleStatus(key: string) {
    setF(prev => ({
      ...prev,
      statusFlags: prev.statusFlags.includes(key) ? prev.statusFlags.filter(k => k !== key) : [...prev.statusFlags.filter(k => k !== 'pending'), key],
    }));
  }

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box' as const, fontSize: 13, padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 7, background: 'var(--white)', fontFamily: 'var(--font)', color: 'var(--ink)', outline: 'none' };
  const sel = { ...inp };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000 }} />

      {/* Drawer panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100%' : 680, background: 'var(--white)', zIndex: 1001, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,0.18)' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{f.id ? 'Edit Delivery Note' : 'New Delivery Note'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{f.noteNo}</div>
          </div>
          <button title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── BL / Shipment Link ── */}
          <FSection title="Link to BL / Shipment" />
          <div style={{ padding: '12px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px 16px' }}>
            <FRow label="BL / Shipment" span>
              <Combobox
                options={jobs.map(j => ({ value: j.id, label: `${j.bl ? `BL: ${j.bl} — ` : ''}${j.customer} (${j.title})` }))}
                value={selectedJobId} onChange={pickJob} placeholder="— Select Shipment —"
              />
            </FRow>
            {selectedJobId && (
              <FRow label="Invoice Number" span>
                <Combobox
                  options={invoices.map(inv => ({ value: inv.no, label: `${inv.no} · ${inv.client}` }))}
                  value={f.invoiceNo} onChange={pickInvoice} placeholder="— Select Invoice —"
                />
              </FRow>
            )}
          </div>

          {/* ── Invoice Link (standalone, when no BL selected) ── */}
          {!selectedJobId && (
            <>
              <FSection title="Or Link to Invoice Directly" />
              <div style={{ padding: '12px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px 16px' }}>
                <FRow label="Invoice Number" span>
                  <Combobox
                    options={invoices.map(inv => ({ value: inv.no, label: `${inv.no} · ${inv.client}` }))}
                    value={f.invoiceNo} onChange={pickInvoice} placeholder="— Select Invoice —"
                  />
                </FRow>
              </div>
            </>
          )}

          {/* ── Note Details ── */}
          <FSection title="Note Details" />
          <div style={{ padding: '12px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px 16px' }}>
            <FRow label="Note Number"><input title="Note number" style={inp} value={f.noteNo} onChange={e => set('noteNo', e.target.value)} /></FRow>
            <FRow label="Dispatch Ref"><input title="Dispatch reference" style={inp} value={f.dispatchRef} onChange={e => set('dispatchRef', e.target.value)} /></FRow>
            <FRow label="Date"><input title="Date" style={inp} type="text" value={f.date} onChange={e => set('date', e.target.value)} /></FRow>
            <FRow label="Time"><input title="Time" style={inp} type="text" value={f.time} onChange={e => set('time', e.target.value)} /></FRow>
          </div>

          {/* ── Consignee ── */}
          <FSection title="Consignee (Delivery To)" />
          <div style={{ padding: '12px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px 16px' }}>
            <FRow label="Company / Receiver Name" span><input title="Company or receiver name" style={inp} value={f.consigneeName} onChange={e => set('consigneeName', e.target.value)} /></FRow>
            <FRow label="Contact Person"><input title="Contact person" style={inp} value={f.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></FRow>
            <FRow label="Phone"><input title="Phone number" style={inp} value={f.phone} onChange={e => set('phone', e.target.value)} /></FRow>
            <FRow label="Email" span><input title="Email address" style={inp} value={f.email} onChange={e => set('email', e.target.value)} /></FRow>
            <FRow label="Delivery Address" span><input title="Delivery address" style={inp} value={f.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} /></FRow>
            <FRow label="Country / City" span><input title="Country or city" style={inp} value={f.city} onChange={e => set('city', e.target.value)} /></FRow>
          </div>

          {/* ── Driver / Agent ── */}
          <FSection title="Delivered By (Driver / Agent)" />
          <div style={{ padding: '12px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px 16px' }}>
            <FRow label="Driver / Agent Name"><input title="Driver or agent name" style={inp} value={f.driverName} onChange={e => set('driverName', e.target.value)} /></FRow>
            <FRow label="Vehicle / Flight No."><input title="Vehicle or flight number" style={inp} value={f.vehicleNo} onChange={e => set('vehicleNo', e.target.value)} /></FRow>
            <FRow label="Driver Contact"><input title="Driver contact number" style={inp} value={f.driverContact} onChange={e => set('driverContact', e.target.value)} /></FRow>
            <FRow label="Carrier / Airline"><input title="Carrier or airline" style={inp} value={f.carrier} onChange={e => set('carrier', e.target.value)} /></FRow>
            <FRow label="Delivery Date"><input title="Delivery date" style={inp} value={f.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} /></FRow>
            <FRow label="Delivery Time"><input title="Delivery time" style={inp} value={f.deliveryTime} onChange={e => set('deliveryTime', e.target.value)} /></FRow>
          </div>

          {/* ── Goods table ── */}
          <FSection title="Goods Delivery Record" />
          <div style={{ padding: '12px 24px 0' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['#','Description','Qty Sent','Qty Rec.','Condition','Variance','Remarks',''].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--ink3)', fontWeight: 600, fontSize: 11 }}>{row.no}</td>
                      <td style={{ padding: '4px 4px' }}><input title="Description" placeholder="Item description" style={{ ...inp, padding: '5px 7px', fontSize: 12 }} value={row.description} onChange={e => updateRow(i, 'description', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px', width: 70 }}><input title="Qty sent" placeholder="0" style={{ ...inp, padding: '5px 7px', fontSize: 12, textAlign: 'center' }} type="number" value={row.qtySent || ''} onChange={e => updateRow(i, 'qtySent', Number(e.target.value))} /></td>
                      <td style={{ padding: '4px 4px', width: 70 }}><input title="Qty received" placeholder="0" style={{ ...inp, padding: '5px 7px', fontSize: 12, textAlign: 'center' }} type="number" value={row.qtyReceived || ''} onChange={e => updateRow(i, 'qtyReceived', Number(e.target.value))} /></td>
                      <td style={{ padding: '4px 4px', width: 90 }}>
                        <Select value={row.condition || '__none__'} onValueChange={v => updateRow(i, 'condition', v === '__none__' ? '' : v)}>
                          <SelectTrigger className="h-7 px-2 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            <SelectItem value="Good">Good</SelectItem>
                            <SelectItem value="Damaged">Damaged</SelectItem>
                            <SelectItem value="Wet">Wet</SelectItem>
                            <SelectItem value="Partial">Partial</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td style={{ padding: '4px 4px', width: 68 }}>
                        <div style={{ ...inp, padding: '5px 7px', fontSize: 12, textAlign: 'center', color: row.variance < 0 ? 'var(--red)' : 'var(--ink)', background: 'var(--bg)' }}>{row.variance || 0}</div>
                      </td>
                      <td style={{ padding: '4px 4px' }}><input title="Remarks" placeholder="Notes…" style={{ ...inp, padding: '5px 7px', fontSize: 12 }} value={row.remarks} onChange={e => updateRow(i, 'remarks', e.target.value)} /></td>
                      <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                        <button title="Remove row" onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}>
                          <Icon name="close" size={12} strokeWidth={2.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addRow} style={{ margin: '8px 0 16px', background: 'none', border: '1.5px dashed var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink3)', padding: 'var(--ds-btn-py-sm) 14px', fontSize: 12, fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="plus" size={13} strokeWidth={2.5} /> Add Row
            </button>
          </div>

          {/* ── Delivery Status ── */}
          <FSection title="Delivery Status" />
          <div style={{ padding: '12px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '8px 12px', marginBottom: 12 }}>
              {STATUS_OPTIONS.map(({ key, label }) => {
                const on = f.statusFlags.includes(key);
                const cfg = STATUS_CFG[key];
                return (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 700 : 400, color: on ? cfg.color : 'var(--ink2)' }}>
                    <input type="checkbox" checked={on} onChange={() => toggleStatus(key)} style={{ accentColor: cfg.color }} />
                    {label}
                  </label>
                );
              })}
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Discrepancy Notes</label>
            <textarea style={{ ...inp, resize: 'none' }} rows={3} value={f.discrepancyNotes} onChange={e => set('discrepancyNotes', e.target.value)} placeholder="Describe any discrepancies, damages or missing items…" />
          </div>

        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--white)' }}>
          <button onClick={onClose} style={{ padding: 'var(--ds-btn-py) 20px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
          <button onClick={() => onSave(f)} style={{ padding: 'var(--ds-btn-py) 24px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', color: '#fff', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Save Note</button>
        </div>
      </div>
    </>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ flags }: { flags: string[] }) {
  const key = flags[0] ?? 'pending';
  const cfg = STATUS_CFG[key] ?? STATUS_CFG.pending;
  return (
    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

// ── Note Detail Panel (invoice-style) ─────────────────────────────────────────
function NoteDetailPanel({ note, onClose, onEdit, onDelete }: {
  note: DN; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'dn-print-css';
    s.textContent = `@media print { body > * { visibility: hidden !important; } #dn-print-area, #dn-print-area * { visibility: visible !important; } #dn-print-area { position: fixed !important; inset: 0 !important; padding: 16px !important; background: #fff !important; overflow: visible !important; } }`;
    document.head.appendChild(s);
    return () => document.getElementById('dn-print-css')?.remove();
  }, []);

  const cfg = STATUS_CFG[note.statusFlags[0] ?? 'pending'] ?? STATUS_CFG.pending;

  const ib: React.CSSProperties = { width: 32, height: 32, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const tb: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)', borderLeft: '1px solid var(--border)', overflow: 'hidden', minWidth: 0 }}>

      {/* Tab / top bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0, gap: 4 }}>
        <span style={{ padding: '11px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)', borderBottom: '2px solid var(--ink)', marginBottom: -1 }}>
          {note.noteNo}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" title="Print" onClick={() => window.print()} style={ib}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <Icon name="printer" size={15} color="var(--ink3)" />
        </button>
        <button type="button" title="Edit" onClick={onEdit} style={ib}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <Icon name="edit" size={15} color="var(--ink3)" />
        </button>
        <button type="button" title="Close" onClick={onClose} style={ib}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <Icon name="x" size={15} color="var(--ink3)" />
        </button>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
        <div style={{ flex: 1 }} />
        <button type="button" style={tb} onClick={onEdit}><Icon name="edit" size={13} color="var(--ink3)" /> Edit</button>
        <button type="button" style={{ ...tb, background: 'var(--teal)', color: '#fff', border: 'none' }} onClick={() => window.print()}>
          <Icon name="printer" size={13} color="#fff" /> Print
        </button>
        <button type="button" style={{ ...tb, color: 'var(--red)', borderColor: 'var(--red)' }} onClick={onDelete}>
          <Icon name="trash" size={13} color="var(--red)" /> Delete
        </button>
      </div>

      {/* Note preview */}
      <div id="dn-print-area" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '16px 12px', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ transform: 'scale(0.9)', transformOrigin: 'top center', marginBottom: -80 }}>
            <PrintTemplate note={note} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export const DeliveryNotes: React.FC = () => {
  const [notes, setNotes]           = useState<DN[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [invoices, setInvoices]     = useState<InvoiceOption[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch]         = useState('');
  const [drawerNote, setDrawerNote] = useState<DN | null>(null);
  const [selectedNote, setSelectedNote] = useState<DN | null>(null);
  const isSplit = selectedNote !== null;
  const isMobile = useIsMobile();

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/delivery-notes');
      const data = Array.isArray(res) ? res : (res?.delivery_notes ?? []);

      const withLines = await Promise.all(data.map(async (dn: any) => {
        try {
          const detail = await apiFetch(`/v1/delivery-notes/${dn.id}`);
          return apiToDN(detail);
        } catch {
          return apiToDN(dn);
        }
      }));

      setNotes(withLines);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load delivery notes');
    } finally { setLoading(false); }
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      const [invRes, custRes] = await Promise.all([
        apiFetch('/v1/invoices').catch(() => []),
        apiFetch('/v1/customers').catch(() => ({ data: [] })),
      ]);
      const customers: any[] = Array.isArray(custRes?.data) ? custRes.data : [];
      const custById = new Map<string, any>(customers.map((c: any) => [c.id, c]));
      const opts: InvoiceOption[] = (Array.isArray(invRes) ? invRes : []).map((inv: any) => {
        const cust = custById.get(inv.customer_id);
        return {
          no: inv.invoice_number,
          client: inv.client_name || cust?.name || 'Unknown',
          address: inv.client_address || cust?.address || '',
          city: cust?.city || '',
          contact: cust?.contact_name || '',
          phone: cust?.phone_wa || '',
          email: cust?.email || '',
        };
      });
      setInvoices(opts);
    } catch { /* invoice picker just stays empty */ }
  }, []);

  useEffect(() => { loadNotes(); loadInvoices(); }, [loadNotes, loadInvoices]);

  function newBlankNote(): DN {
    const next = String(notes.length + 4).padStart(4, '0');
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = today.toTimeString().slice(0, 5);
    return {
      id: '', noteNo: `DN-2026-${next}`, date: dateStr, time: timeStr,
      dispatchRef: '', invoiceNo: '',
      consigneeName: '', contactPerson: '', phone: '', email: '',
      deliveryAddress: '', city: '',
      driverName: '', vehicleNo: '', driverContact: '',
      carrier: '', deliveryDate: dateStr, deliveryTime: '',
      rows: blankRows(1, 5),
      statusFlags: ['pending'], discrepancyNotes: '',
    };
  }

  async function saveNote(n: DN) {
    const isNew = !n.id;
    const payload = dnToApi(n);
    
    try {
      if (isNew) {
        const res: any = await apiFetch('/v1/delivery-notes', { method: 'POST', body: JSON.stringify(payload) });
        const saved = apiToDN({ ...res, lines: payload.lines.map((l:any) => ({...l, qty_ordered: l.qty_ordered, qty_delivered: l.qty_delivered})) }); // mock the lines for the response
        setNotes(ns => [saved, ...ns]);
        setSelectedNote(saved);
        loadNotes(); // reload to get proper DB IDs for lines
      } else {
        await apiFetch(`/v1/delivery-notes/${n.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        loadNotes(); // reload from DB
      }
    } catch {
      /* Fallback: local state only */
      const saved = isNew ? { ...n, id: Date.now().toString() } : n;
      if (isNew) setNotes(ns => [saved, ...ns]);
      else setNotes(ns => ns.map(x => x.id === n.id ? saved : x));
      setSelectedNote(saved);
    }
    setDrawerNote(null);
  }

  async function deleteNote(id: string) {
    if (!(await showConfirm('Delete this delivery note?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/delivery-notes/${id}`, { method: 'DELETE' });
    } catch { /* allow local removal */ }
    setNotes(ns => ns.filter(n => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
  }

  const filtered = notes.filter(n => {
    const matchStatus = filterStatus === 'all' || n.statusFlags.includes(filterStatus);
    const q = search.toLowerCase();
    const matchSearch = !q || n.noteNo.toLowerCase().includes(q) || n.consigneeName.toLowerCase().includes(q) || n.invoiceNo.toLowerCase().includes(q) || n.driverName.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  function exportCsv() {
    const rows = [
      ['Note No.', 'Date', 'Invoice No.', 'Consignee', 'Delivery Address', 'Driver', 'Vehicle No.', 'Delivery Date', 'Status'],
      ...filtered.map(n => [n.noteNo, n.date, n.invoiceNo, n.consigneeName, n.deliveryAddress, n.driverName, n.vehicleNo, n.deliveryDate, n.statusFlags.join('; ')]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delivery-notes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Stats
  const total     = notes.length;
  const fullyDone = notes.filter(n => n.statusFlags.includes('fully_delivered')).length;
  const partial   = notes.filter(n => n.statusFlags.includes('partially_delivered')).length;
  const issues    = notes.filter(n => n.statusFlags.some(f => ['damaged','missing','returned'].includes(f))).length;
  const pending   = notes.filter(n => n.statusFlags.includes('pending')).length;

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', fontFamily: 'var(--font)' }}>

      {/* ── Drawer (edit) ── */}
      {drawerNote && (
        <NoteDrawer
          note={drawerNote}
          onSave={saveNote}
          onClose={() => setDrawerNote(null)}
          isMobile={isMobile}
          invoices={invoices}
        />
      )}

      {/* ── Left: list panel ── */}
      <div style={{ width: isSplit ? 420 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', borderRight: isSplit ? '1px solid var(--border)' : 'none', transition: 'width 0.18s ease' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>

      <PageHeader
        crumbs={['CRM', 'Delivery Notes']}
        titlePlain="Delivery"
        titleEm="notes"
        subtitle={`${notes.length} notes · Track and print delivery notes linked to invoices`}
        actions={
          <button type="button" onClick={() => setDrawerNote(newBlankNote())} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', border: 'none', borderRadius: 'var(--r)', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="plus" size={14} strokeWidth={2.5} /> New Delivery Note
          </button>
        }
      />

      {/* ── Stats ── */}
      <div style={{ padding: '16px 28px', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isSplit ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Notes',       value: total,     color: 'var(--navy)', filter: 'all' },
          { label: 'Fully Delivered',   value: fullyDone, color: 'var(--green)',     filter: 'fully_delivered'     },
          { label: 'Partial',           value: partial,   color: 'var(--blue)',     filter: 'partially_delivered' },
          { label: 'Issues',            value: issues,    color: 'var(--gold)',     filter: 'damaged'             },
          { label: 'Pending',           value: pending,   color: 'var(--gold)',     filter: 'pending'             },
        ].map(s => (
          <div
            key={s.label}
            onClick={() => setFilterStatus(s.filter)}
            style={{ background: 'var(--white)', border: `1.5px solid ${filterStatus === s.filter ? s.color : 'var(--border)'}`, borderRadius: 9, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ padding: '0 28px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Icon name="search" size={14} strokeWidth={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' } as React.CSSProperties} />
          <input
            placeholder="Search note no., consignee, invoice…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px 8px 32px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', outline: 'none' }}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <button type="button" onClick={exportCsv}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="download" size={13} /> Export CSV
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ margin: '0 28px 28px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {(isSplit
                ? ['Note No.', 'Consignee', 'Status', '']
                : ['Note No.', 'Date', 'Invoice', 'Consignee', 'Driver / Vehicle', 'Delivery Date', 'Items', 'Status', '']
              ).map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading delivery notes…</td>
              </tr>
            )}
            {!loading && loadError && (
              <tr>
                <td colSpan={9} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--red, #dc2626)', fontSize: 13 }}>{loadError}</td>
              </tr>
            )}
            {!loading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No delivery notes found.</td>
              </tr>
            )}
            {filtered.map(n => {
              const itemCount = n.rows.filter(r => r.description).length;
              const isActive = selectedNote?.id === n.id;
              return (
                <tr
                  key={n.id}
                  onClick={() => setSelectedNote(n)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'var(--teal-l)' : '' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ''; }}
                >
                  <td style={{ padding: '12px 14px', fontSize: 12.5, fontFamily: 'var(--mono)', color: isActive ? 'var(--teal)' : 'var(--teal)', fontWeight: 700 }}>{n.noteNo}</td>
                  {!isSplit && <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{n.date}</td>}
                  {!isSplit && <td style={{ padding: '12px 14px' }}><div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>{n.invoiceNo}</div></td>}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{n.consigneeName}</div>
                    {!isSplit && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{n.city}</div>}
                  </td>
                  {!isSplit && <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{n.driverName}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>{n.vehicleNo}</div>
                  </td>}
                  {!isSplit && <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{n.deliveryDate}</td>}
                  {!isSplit && <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink)', textAlign: 'center' }}>{itemCount}</td>}
                  <td style={{ padding: '12px 14px' }}><StatusBadge flags={n.statusFlags} /></td>
                  <td style={{ padding: '12px 10px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        title="Edit"
                        onClick={() => setDrawerNote({ ...n })}
                        style={{ padding: 'var(--ds-btn-py-sm) 8px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--ink)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                      >
                        <Icon name="edit" size={13} strokeWidth={2} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => deleteNote(n.id)}
                        style={{ padding: 'var(--ds-btn-py-sm) 8px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--red)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                      >
                        <Icon name="trash" size={13} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

        </div>{/* end scroll */}
      </div>{/* end left panel */}

      {/* ── Right: detail panel ── */}
      {isSplit && selectedNote && (
        <NoteDetailPanel
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onEdit={() => setDrawerNote({ ...selectedNote })}
          onDelete={() => deleteNote(selectedNote.id)}
        />
      )}

    </div>
  );
};
