import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { apiFetch, apiViewBlob } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { getJobs } from '../clearanceData.js';

/**
 * Preferential-origin eligibility check + Certificate of Origin issuance
 * (ClearOS M5). The eligibility engine only ever auto-decides what real
 * declared data supports (a value-added % against a real threshold); every
 * other case — wholly-obtained, specific-process criteria, AfCFTA's general
 * framework — comes back needing a human to confirm the actual production
 * facts. See origin-rules.service.ts for exactly what's sourced, real data.
 */

interface OriginRule {
  id: string; agreementCode: string; hsMatch: string; description: string;
  criteriaType: 'WHOLLY_OBTAINED' | 'VALUE_ADDED' | 'HEADING_CHANGE' | 'SPECIFIC_PROCESS' | 'GENERAL';
  criteriaText: string; maxNonOriginatingPct: number | null; sourceCitation: string;
}
interface EligibilityResult { status: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW' | 'INSUFFICIENT_DATA'; basis: string; rule: OriginRule | null; }

interface CoO {
  id: string; agreement_code: string; hs_code: string; country_of_origin: string;
  eligibility_status: string; eligibility_basis: string | null;
  exporter_name: string | null; consignee_name: string | null;
  certificate_number: string | null; status: 'draft' | 'issued'; created_at: string;
  subject_type: 'shipment' | 'declaration_item' | 'adhoc'; subject_id: string | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'gray'> = {
  ELIGIBLE: 'success', NOT_ELIGIBLE: 'error', NEEDS_REVIEW: 'warning', INSUFFICIENT_DATA: 'gray',
};

const emptyForm = {
  agreementCode: 'EAC', hsCode: '', countryOfOrigin: 'TZ',
  nonOriginatingValuePct: '', whollyObtainedConfirmed: null as boolean | null,
  exporterName: '', exporterAddress: '', consigneeName: '', consigneeAddress: '',
  goodsDescription: '', invoiceNumber: '',
};

export function CertificateOfOriginPage() {
  const [urlParams] = useSearchParams();
  const shipmentFilter = urlParams.get('shipment');

  const [rows, setRows] = useState<CoO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState<EligibilityResult | null>(null);
  const [selectedJobId, setSelectedJobId] = useState(shipmentFilter || '');
  const jobs = getJobs();
  const shipmentLabel = (id: string | null) => {
    if (!id) return null;
    const job = jobs.find(j => j.id === id);
    return job ? `${job.bl ? `${job.bl} — ` : ''}${job.customer}` : id;
  };

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(shipmentFilter ? `/v1/customs/certificates-of-origin?shipment_id=${shipmentFilter}` : '/v1/customs/certificates-of-origin')
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [shipmentFilter]);
  useEffect(load, [load]);
  useEffect(() => { if (shipmentFilter) setShowForm(true); }, [shipmentFilter]);

  useEffect(() => {
    if (!form.hsCode.trim()) { setPreview(null); return; }
    const t = setTimeout(() => {
      const params = new URLSearchParams({ agreement: form.agreementCode, hs_code: form.hsCode.trim() });
      if (form.nonOriginatingValuePct) params.set('non_originating_value_pct', form.nonOriginatingValuePct);
      if (form.whollyObtainedConfirmed != null) params.set('wholly_obtained_confirmed', String(form.whollyObtainedConfirmed));
      apiFetch(`/v1/customs/origin-eligibility?${params.toString()}`).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [form.agreementCode, form.hsCode, form.nonOriginatingValuePct, form.whollyObtainedConfirmed]);

  const resetForm = () => { setForm(emptyForm); setPreview(null); setSelectedJobId(shipmentFilter || ''); setError(null); };

  const pickJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (job) setForm(p => ({ ...p, consigneeName: p.consigneeName || job.customer }));
  };

  const submit = async () => {
    if (!form.hsCode.trim()) { setError('HS code is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/customs/certificates-of-origin', {
        method: 'POST',
        body: JSON.stringify({
          subjectType: selectedJobId ? 'shipment' : 'adhoc',
          subjectId: selectedJobId || undefined,
          agreementCode: form.agreementCode,
          hsCode: form.hsCode.trim(),
          countryOfOrigin: form.countryOfOrigin.trim() || 'TZ',
          nonOriginatingValuePct: form.nonOriginatingValuePct ? parseFloat(form.nonOriginatingValuePct) : undefined,
          whollyObtainedConfirmed: form.whollyObtainedConfirmed ?? undefined,
          exporterName: form.exporterName.trim() || undefined,
          exporterAddress: form.exporterAddress.trim() || undefined,
          consigneeName: form.consigneeName.trim() || undefined,
          consigneeAddress: form.consigneeAddress.trim() || undefined,
          goodsDescription: form.goodsDescription.trim() || undefined,
          invoiceNumber: form.invoiceNumber.trim() || undefined,
        }),
      });
      resetForm();
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save certificate');
    } finally {
      setSaving(false);
    }
  };

  const issue = async (id: string) => {
    try {
      await apiFetch(`/v1/customs/certificates-of-origin/${id}/issue`, { method: 'PATCH' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not issue this certificate.', { variant: 'error' });
    }
  };

  const openPdf = (id: string) => {
    apiViewBlob(`/v1/customs/certificates-of-origin/${id}/pdf`).catch(() => showAlert('Could not open the certificate PDF.', { variant: 'error' }));
  };

  const needsWhollyObtained = preview?.rule?.criteriaType === 'WHOLLY_OBTAINED';
  const needsValueAdded = preview?.rule?.criteriaType === 'VALUE_ADDED';

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Compliance', 'Certificate of Origin']}
        titlePlain="Certificate of"
        titleEm="origin"
        subtitle="Real EAC/AfCFTA rules-of-origin criteria — eligibility is only auto-decided when the declared data genuinely supports it; everything else needs a human confirmation before issuing."
        actions={
          <Button onClick={() => setShowForm(s => !s)}>
            <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'New certificate'}
          </Button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {shipmentFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink2)' }}>
            <Icon name="package" size={14} color="var(--teal)" />
            <span>Showing certificates for shipment <strong>{shipmentLabel(shipmentFilter) ?? shipmentFilter}</strong>.</span>
            <Link to="/clearos/compliance/origin" style={{ marginLeft: 'auto', color: 'var(--teal)', fontWeight: 600, fontSize: 12 }}>View all certificates</Link>
          </div>
        )}

        {showForm && (
          <SectionCard title="New certificate" collapsible={false}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Shipment (optional)</label>
              <Combobox
                options={jobs.map(j => ({ value: j.id, label: `${j.bl ? `BL: ${j.bl} — ` : ''}${j.customer} (${j.title})` }))}
                value={selectedJobId} onChange={pickJob} placeholder="Not linked to a shipment"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Agreement *</label>
                <Select value={form.agreementCode} onValueChange={v => setForm(p => ({ ...p, agreementCode: v, nonOriginatingValuePct: '', whollyObtainedConfirmed: null }))}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EAC">East African Community</SelectItem>
                    <SelectItem value="AFCFTA">AfCFTA</SelectItem>
                    <SelectItem value="SADC">SADC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>HS code *</label>
                <Input value={form.hsCode} onChange={e => setForm(p => ({ ...p, hsCode: e.target.value }))} placeholder="e.g. 3907.10.00" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Country of origin</label>
                <Input value={form.countryOfOrigin} onChange={e => setForm(p => ({ ...p, countryOfOrigin: e.target.value.toUpperCase() }))} placeholder="TZ" maxLength={2} />
              </div>
            </div>

            {preview && (
              <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--bg)', marginBottom: 16, fontSize: 12.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Badge variant={STATUS_VARIANT[preview.status] ?? 'gray'}>{preview.status.replace('_', ' ')}</Badge>
                  {preview.rule && <span style={{ color: 'var(--ink3)' }}>{preview.rule.sourceCitation}</span>}
                </div>
                <div style={{ color: 'var(--ink2)' }}>{preview.basis}</div>

                {needsWhollyObtained && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button size="xs" variant={form.whollyObtainedConfirmed === true ? 'default' : 'outline'} onClick={() => setForm(p => ({ ...p, whollyObtainedConfirmed: true }))}>Confirm wholly obtained</Button>
                    <Button size="xs" variant={form.whollyObtainedConfirmed === false ? 'destructive' : 'outline'} onClick={() => setForm(p => ({ ...p, whollyObtainedConfirmed: false }))}>Not wholly obtained</Button>
                  </div>
                )}
                {needsValueAdded && (
                  <div style={{ marginTop: 10, maxWidth: 220 }}>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Declared non-originating value %</label>
                    <Input type="number" min="0" max="100" step="0.1" value={form.nonOriginatingValuePct} onChange={e => setForm(p => ({ ...p, nonOriginatingValuePct: e.target.value }))} />
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Exporter name</label>
                <Input value={form.exporterName} onChange={e => setForm(p => ({ ...p, exporterName: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Exporter address</label>
                <Input value={form.exporterAddress} onChange={e => setForm(p => ({ ...p, exporterAddress: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Consignee name</label>
                <Input value={form.consigneeName} onChange={e => setForm(p => ({ ...p, consigneeName: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Consignee address</label>
                <Input value={form.consigneeAddress} onChange={e => setForm(p => ({ ...p, consigneeAddress: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Goods description</label>
                <Input value={form.goodsDescription} onChange={e => setForm(p => ({ ...p, goodsDescription: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Invoice number</label>
                <Input value={form.invoiceNumber} onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} />
              </div>
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
            <Button disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save certificate'}</Button>
          </SectionCard>
        )}

        <SectionCard title="Certificates" padded={false} collapsible={false}>
          {loading ? (
            <SectionLoading />
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No certificates of origin yet.</div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Agreement', 'HS Code', 'Origin', 'Exporter → Consignee', 'Eligibility', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{row.agreement_code}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{row.hs_code}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{row.country_of_origin}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>
                      {row.exporter_name || '—'} → {row.consignee_name || '—'}
                      {row.subject_type === 'shipment' && row.subject_id && (
                        <div><Link to={`/clearance/${row.subject_id}`} style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>{shipmentLabel(row.subject_id) ?? 'View shipment'}</Link></div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[row.eligibility_status] ?? 'gray'}>{row.eligibility_status.replace('_', ' ')}</Badge></td>
                    <td style={{ padding: '12px 16px' }}>
                      {row.status === 'issued' ? (
                        <Badge variant="success">{row.certificate_number}</Badge>
                      ) : <Badge variant="gray">draft</Badge>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {row.status === 'draft' && row.eligibility_status === 'ELIGIBLE' && (
                          <Button size="xs" onClick={() => issue(row.id)}>Issue</Button>
                        )}
                        {row.status === 'issued' && (
                          <Button size="xs" variant="outline" onClick={() => openPdf(row.id)}>PDF</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
