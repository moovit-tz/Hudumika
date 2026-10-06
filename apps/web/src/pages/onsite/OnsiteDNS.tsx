import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, apiFetchRaw } from '../../lib/api.js';
import type { OnsiteDnsRecord, DnsPropagationResult } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.js';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Card } from '../../components/ui/card.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import './Onsite.css';
import './OnsiteDNS.css';

export function OnsiteDNS() {
  const { domainId } = useParams<{ domainId: string }>();
  const [records, setRecords] = useState<OnsiteDnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [recordType, setRecordType] = useState('all');
  const visibleRecords = records.filter(record => (recordType === 'all' || record.type === recordType) && `${record.name} ${record.value} ${record.type}`.toLowerCase().includes(search.toLowerCase()));

  // Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('@');
  const [type, setType] = useState('A');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('3600');
  const [priority, setPriority] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check propagation state
  const [checkRecord, setCheckRecord] = useState<OnsiteDnsRecord | null>(null);
  const [checking, setChecking] = useState(false);
  const [propResults, setPropResults] = useState<DnsPropagationResult[] | null>(null);

  /* Import: previewed before it is applied, so a paste can be read first. */
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPlan, setImportPlan] = useState<any>(null);
  const [importBusy, setImportBusy] = useState(false);

  /* Templates: generated, reviewed, then applied — never applied on pick. */
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [templatePreview, setTemplatePreview] = useState<any[] | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  useEffect(() => {
    apiFetch('/v1/onsite/dns/templates').then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const fetchDNS = () => {
    if (!domainId) return;
    setLoading(true);
    setError(null);
    apiFetch(`/v1/onsite/domains/${domainId}/dns`)
      .then((res: any) => setRecords(res.records || []))
      .catch((err: any) => setError(err.message ?? 'Failed to load DNS records'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDNS();
  }, [domainId]);

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainId || !name || !value) return;
    setSubmitting(true);
    try {
      await apiFetch(`/v1/onsite/domains/${domainId}/dns`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          type,
          value,
          ttl: parseInt(ttl, 10) || 3600,
          priority: priority ? parseInt(priority, 10) : undefined,
        }),
      });
      setShowAddModal(false);
      setName('@');
      setType('A');
      setValue('');
      setTtl('3600');
      setPriority('');
      fetchDNS();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add DNS record', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Delete a record, with the server's own account of what it breaks.
   *
   * The generic "Are you sure?" said nothing about consequences, so removing
   * the last MX record — which ends mail delivery for the domain — read
   * exactly like removing a spare TXT record. The API answers 409 with the
   * specific impact, and that sentence is what gets confirmed against.
   */
  const handleDeleteRecord = async (recordId: string) => {
    if (!domainId) return;
    const del = (confirmed: boolean) =>
      apiFetch(`/v1/onsite/domains/${domainId}/dns/${recordId}${confirmed ? '?confirm=true' : ''}`, { method: 'DELETE' });
    try {
      if (!(await showConfirm('Delete this DNS record?', { variant: 'danger', confirmLabel: 'Delete' }))) return;
      await del(false);
      fetchDNS();
    } catch (err: any) {
      const impact = err?.message || '';
      // A 409 here is the warning, not a failure: ask again naming the risk.
      if (/stops email|unresolvable|takes the website offline|more likely to be treated as spam|weakens protection/i.test(impact)) {
        const ok = await showConfirm(`${impact}\n\nDelete it anyway?`, {
          title: 'This change has consequences', variant: 'danger', confirmLabel: 'Delete anyway',
        });
        if (!ok) return;
        try {
          await del(true);
          fetchDNS();
        } catch (e: any) {
          showAlert(e.message || 'Failed to delete record', { variant: 'error' });
        }
        return;
      }
      showAlert(impact || 'Failed to delete record', { variant: 'error' });
    }
  };

  /* ── Export / import / templates ── */

  const handleExport = async () => {
    if (!domainId) return;
    try {
      const res = await apiFetchRaw(`/v1/onsite/domains/${domainId}/dns/export`);
      const text = await res.text();
      // Saved through a blob rather than opened in a tab: a zone file is a
      // file, and the browser would render it as plain text otherwise.
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      // The server already names the file after the domain in
      // Content-Disposition; taking it from there keeps one source of truth.
      const disposition = res.headers.get('Content-Disposition') ?? '';
      a.download = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'zone.zone';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showAlert(err.message || 'Could not export the zone.', { variant: 'error' });
    }
  };

  const previewImport = async () => {
    if (!domainId || !importText.trim()) return;
    setImportBusy(true);
    try {
      const res = await apiFetch(`/v1/onsite/domains/${domainId}/dns/import`, {
        method: 'POST', body: JSON.stringify({ zone_file: importText }),
      });
      setImportPlan(res);
    } catch (err: any) {
      showAlert(err.message || 'Could not read that zone file.', { variant: 'error' });
    } finally {
      setImportBusy(false);
    }
  };

  const applyImport = async () => {
    if (!domainId) return;
    setImportBusy(true);
    try {
      const res = await apiFetch(`/v1/onsite/domains/${domainId}/dns/import`, {
        method: 'POST', body: JSON.stringify({ zone_file: importText, apply: true }),
      });
      showAlert(`${res.created} record(s) added, ${res.unchanged} already present.`,
                { title: 'Zone imported', variant: 'success' });
      setShowImport(false); setImportText(''); setImportPlan(null);
      fetchDNS();
    } catch (err: any) {
      showAlert(err.message || 'The import was not applied.', { variant: 'error' });
    } finally {
      setImportBusy(false);
    }
  };

  const previewTemplate = async (id: string) => {
    setTemplateBusy(true);
    try {
      const t = templates.find(x => x.id === id);
      const vars: Record<string, string> = {};
      for (const i of t?.inputs ?? []) vars[i.key] = templateVars[i.key] ?? '';
      const res = await apiFetch(`/v1/onsite/dns/templates/${id}/preview`, {
        method: 'POST', body: JSON.stringify(vars),
      });
      setTemplatePreview(res.records);
    } catch (err: any) {
      showAlert(err.message || 'Could not build that template.', { variant: 'error' });
    } finally {
      setTemplateBusy(false);
    }
  };

  /** Templates never write on their own — this is the accepted rows going in. */
  const applyTemplate = async () => {
    if (!domainId || !templatePreview) return;
    setTemplateBusy(true);
    try {
      for (const r of templatePreview) {
        await apiFetch(`/v1/onsite/domains/${domainId}/dns`, { method: 'POST', body: JSON.stringify(r) });
      }
      showAlert(`${templatePreview.length} record(s) added.`, { title: 'Template applied', variant: 'success' });
      setShowTemplates(false); setTemplatePreview(null); setTemplateVars({});
      fetchDNS();
    } catch (err: any) {
      showAlert(err.message || 'The template was not fully applied.', { variant: 'error' });
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleCheckPropagation = async (record: OnsiteDnsRecord) => {
    if (!domainId) return;
    setCheckRecord(record);
    setChecking(true);
    setPropResults(null);
    try {
      const res: any = await apiFetch(`/v1/onsite/domains/${domainId}/dns/check-propagation`, {
        method: 'POST',
        body: JSON.stringify({
          name: record.name,
          type: record.type,
          expected: record.value,
        }),
      });
      setPropResults(res.results || []);
    } catch (err: any) {
      showAlert(err.message || 'Propagation check failed', { variant: 'error' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="onsite-page onsite-dns-page">
      <PageHeader
        crumbs={['Onsite', { label: 'Domains', to: '/onsite/domains' }, 'DNS']}
        titlePlain="DNS"
        titleEm="records"
        subtitle="Manage domain routing, email delivery, and verification records."
        actions={<>
          <Button variant="outline" onClick={() => setShowTemplates(true)}>
            <Icon name="layers" size={16} /> Quick setup
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Icon name="upload" size={16} /> Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Icon name="download" size={16} /> Export
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Add record
          </Button>
        </>}
      />

      {loading ? (
        <div className="onsite-card">
          <SectionLoading label="Loading DNS records…" />
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>
          <Button variant="outline" onClick={fetchDNS}>Retry</Button>
        </div>
      ) : (
        <Card className="onsite-dns-records">
          <div className="onsite-dns-toolbar">
            <div><h2>Zone records <span>{records.length}</span></h2><p>{visibleRecords.length} shown · TTL controls how long resolvers cache each record.</p></div>
            <div className="onsite-dns-filters">
              <Select value={recordType} onValueChange={setRecordType}><SelectTrigger aria-label="Record type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{[...new Set(records.map(record => record.type))].sort().map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
              <Input aria-label="Search DNS records" placeholder="Search records…" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="onsite-table-wrapper">
            <table className="onsite-table onsite-dns-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Value</th>
                  <th>TTL</th>
                  <th>Priority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Type">
                      <span className="onsite-badge" style={{ background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 700 }}>
                        {r.type}
                      </span>
                    </td>
                    <td data-label="Name" className="onsite-mono" style={{ fontWeight: 600 }}>{r.name}</td>
                    <td data-label="Value" className="onsite-mono onsite-dns-value">
                      {r.value}
                    </td>
                    <td data-label="TTL" style={{ color: 'var(--ink3)' }}>{r.ttl}s</td>
                    <td data-label="Priority" style={{ color: 'var(--ink3)' }}>{r.priority ?? '—'}</td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="ghost" onClick={() => handleCheckPropagation(r)} title="Check propagation">
                          <Icon name="globe" size={14} /> Check
                        </Button>
                        <Button variant="ghost" aria-label={`Delete ${r.type} record ${r.name}`} style={{ color: 'var(--red)' }} onClick={() => handleDeleteRecord(r.id)}>
                          <Icon name="trash2" size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleRecords.length && <div className="onsite-dns-empty"><Icon name="globe" size={32} /><h3>{records.length ? 'No matching records' : 'No DNS records'}</h3><p>{records.length ? 'Try another search or record type.' : 'Add a record or use Quick setup to configure this zone.'}</p><Button variant="outline" onClick={() => { if (records.length) { setSearch(''); setRecordType('all'); } else setShowAddModal(true); }}>{records.length ? 'Clear filters' : 'Add record'}</Button></div>}
          </div>
        </Card>
      )}

      {/* Add record Modal */}
      <Dialog open={showAddModal} onOpenChange={(o) => { if (!o) setShowAddModal(false); }}>
        <DialogContent hideClose className="max-w-130 gap-0 onsite-dns-dialog" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="onsite-card-header">
            <DialogTitle className="onsite-card-title">Add DNS Record</DialogTitle>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>✕</Button>
          </div>
          <form onSubmit={handleAddRecord} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>Type *</label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="AAAA">AAAA</SelectItem>
                      <SelectItem value="CNAME">CNAME</SelectItem>
                      <SelectItem value="MX">MX</SelectItem>
                      <SelectItem value="TXT">TXT</SelectItem>
                      <SelectItem value="NS">NS</SelectItem>
                      <SelectItem value="SRV">SRV</SelectItem>
                      <SelectItem value="CAA">CAA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="onsite-form-group">
                  <label>Name * (@ for root)</label>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="@ or subdomain"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="onsite-form-group">
                <label>Value / Target *</label>
                <input
                  type="text"
                  className="onsite-input"
                  placeholder="e.g. 192.0.2.1 or mail.example.com"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="onsite-form-group">
                  <label>TTL (seconds)</label>
                  <input
                    type="number"
                    className="onsite-input"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                  />
                </div>
                {type === 'MX' && (
                  <div className="onsite-form-group">
                    <label>Priority</label>
                    <input
                      type="number"
                      className="onsite-input"
                      placeholder="10"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save record'}
                </Button>
              </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Propagation Check Modal */}
      <Dialog open={!!checkRecord} onOpenChange={(o) => { if (!o) setCheckRecord(null); }}>
        <DialogContent hideClose className="max-w-130 gap-0 onsite-dns-dialog" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {checkRecord && (
            <>
              <div className="onsite-card-header">
                <DialogTitle className="onsite-card-title">DNS Propagation Probe</DialogTitle>
                <Button variant="ghost" onClick={() => setCheckRecord(null)}>✕</Button>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--ink3)' }}>
                Checking global propagation for <strong>{checkRecord.type}</strong> <code>{checkRecord.name}</code>:
              </p>

              {checking ? (
                <p style={{ padding: '1rem 0' }}>Querying Cloudflare and Google DoH resolvers…</p>
              ) : propResults ? (
                <div className="onsite-table-wrapper">
                  <table className="onsite-table">
                    <thead>
                      <tr>
                        <th>Resolver</th>
                        <th>Observed Value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propResults.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{r.resolver}</td>
                          <td className="onsite-mono">{r.actual || 'No record'}</td>
                          <td>
                            {r.propagated ? (
                              <span className="onsite-badge succeeded">✓ Propagated</span>
                            ) : (
                              <span className="onsite-badge pending">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <Button variant="outline" onClick={() => setCheckRecord(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Import a zone file ──
          Two steps deliberately: the preview writes nothing, so a paste can be
          read before it changes how a domain resolves. */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o) { setShowImport(false); setImportPlan(null); } }}>
        <DialogContent className="max-w-160 gap-0" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <DialogTitle style={{ marginTop: 0 }}>Import a zone file</DialogTitle>
          <p style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>
            Paste a BIND zone file. Nothing is written until you apply it, and
            records already present are left alone rather than duplicated.
          </p>
          <textarea
            value={importText}
            onChange={e => { setImportText(e.target.value); setImportPlan(null); }}
            rows={10}
            spellCheck={false}
            placeholder={'@\t3600\tIN\tA\t203.0.113.10\nwww\t3600\tIN\tCNAME\texample.com.'}
            style={{ width: '100%', fontFamily: 'var(--font)', fontSize: '0.8125rem', padding: '0.5rem' }}
          />

          {importPlan && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ fontWeight: 600 }}>
                {importPlan.create} to add · {importPlan.unchanged} already present
                {importPlan.errors?.length ? ` · ${importPlan.errors.length} line(s) unreadable` : ''}
              </div>
              {importPlan.errors?.length > 0 && (
                <ul style={{ color: 'var(--red)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                  {importPlan.errors.slice(0, 8).map((e: any) => (
                    <li key={e.line}>Line {e.line}: {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => { setShowImport(false); setImportPlan(null); }}>Cancel</Button>
            <Button variant="outline" disabled={importBusy || !importText.trim()} onClick={previewImport}>
              {importBusy ? 'Reading…' : 'Preview'}
            </Button>
            <Button
              disabled={importBusy || !importPlan || importPlan.errors?.length > 0 || importPlan.create === 0}
              onClick={applyImport}>
              {importPlan ? `Add ${importPlan.create} record(s)` : 'Apply'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Quick setup ──
          A template generates records and stops; applying them is a separate,
          explicit step (ONSITE.md section 15). */}
      <Dialog open={showTemplates} onOpenChange={(o) => { if (!o) { setShowTemplates(false); setTemplatePreview(null); } }}>
        <DialogContent className="max-w-155 gap-0" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <DialogTitle style={{ marginTop: 0 }}>Quick setup</DialogTitle>
          <p style={{ color: 'var(--ink3)', fontSize: '0.8125rem' }}>
            Generates the records a common setup needs. Review them before they are added.
          </p>

          <RadioGroup value={templateId} onValueChange={value => { setTemplateId(value); setTemplatePreview(null); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {templates.map(t => (
              <label key={t.id} htmlFor={`template-${t.id}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <RadioGroupItem id={`template-${t.id}`} value={t.id} />
                <span>
                  <span style={{ fontWeight: 600 }}>{t.label}</span>
                  <span style={{ display: 'block', color: 'var(--ink3)', fontSize: '0.8125rem' }}>{t.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>

          {templates.find(t => t.id === templateId)?.inputs?.map((i: any) => (
            <div key={i.key} style={{ marginTop: '0.75rem' }}>
              <label className="seal-field-label">{i.label}</label>
              <input className="input-field" placeholder={i.placeholder}
                value={templateVars[i.key] ?? ''}
                onChange={e => { setTemplateVars(v => ({ ...v, [i.key]: e.target.value })); setTemplatePreview(null); }} />
            </div>
          ))}

          {templatePreview && (
            <table className="onsite-table" style={{ marginTop: '1rem' }}>
              <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>TTL</th></tr></thead>
              <tbody>
                {templatePreview.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="onsite-mono">{r.name}</td>
                    <td>{r.type}{r.priority != null ? ` (${r.priority})` : ''}</td>
                    <td className="onsite-mono" style={{ wordBreak: 'break-all' }}>{r.value}</td>
                    <td>{r.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => { setShowTemplates(false); setTemplatePreview(null); }}>Cancel</Button>
            <Button variant="outline" disabled={!templateId || templateBusy}
              onClick={() => previewTemplate(templateId)}>
              {templateBusy ? 'Building…' : 'Preview records'}
            </Button>
            <Button disabled={!templatePreview || templateBusy} onClick={applyTemplate}>
              Add {templatePreview ? `${templatePreview.length} ` : ''}record(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
