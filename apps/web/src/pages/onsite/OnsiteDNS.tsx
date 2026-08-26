import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, apiFetchRaw } from '../../lib/api.js';
import type { OnsiteDnsRecord, DnsPropagationResult } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteDNS() {
  const { domainId } = useParams<{ domainId: string }>();
  const [records, setRecords] = useState<OnsiteDnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Domains', 'DNS']}
        titlePlain="DNS"
        titleEm="records"
        subtitle="Configure A, CNAME, MX, TXT, and SRV records for your domain."
        actions={<>
          <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>
            <Icon name="layers" size={16} /> Quick setup
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Icon name="upload" size={16} /> Import
          </button>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Icon name="download" size={16} /> Export
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Add Record
          </button>
        </>}
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading DNS zone records…</p>
        </div>
      ) : error ? (
        <div className="onsite-card">
          <p style={{ color: '#ef4444' }}>Error: {error}</p>
        </div>
      ) : (
        <div className="onsite-card">
          <div className="onsite-table-wrapper">
            <table className="onsite-table">
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
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="onsite-badge" style={{ background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 700 }}>
                        {r.type}
                      </span>
                    </td>
                    <td className="onsite-mono" style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="onsite-mono" style={{ maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.value}
                    </td>
                    <td style={{ color: 'var(--ink-muted)' }}>{r.ttl}s</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{r.priority ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleCheckPropagation(r)} title="Check Propagation">
                          <Icon name="globe" size={14} /> Probe
                        </button>
                        <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleDeleteRecord(r.id)}>
                          <Icon name="trash2" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '520px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Add DNS Record</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
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
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Propagation Check Modal */}
      {checkRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '520px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">DNS Propagation Probe</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setCheckRecord(null)}>✕</button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}>
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
              <button className="btn btn-secondary" onClick={() => setCheckRecord(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Import a zone file ──
          Two steps deliberately: the preview writes nothing, so a paste can be
          read before it changes how a domain resolves. */}
      {showImport && (
        <div className="onsite-modal-backdrop" onClick={() => setShowImport(false)}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Import a zone file</h3>
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>
              Paste a BIND zone file. Nothing is written until you apply it, and
              records already present are left alone rather than duplicated.
            </p>
            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportPlan(null); }}
              rows={10}
              spellCheck={false}
              placeholder={'@\t3600\tIN\tA\t203.0.113.10\nwww\t3600\tIN\tCNAME\texample.com.'}
              style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: '0.8125rem', padding: '0.5rem' }}
            />

            {importPlan && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontWeight: 600 }}>
                  {importPlan.create} to add · {importPlan.unchanged} already present
                  {importPlan.errors?.length ? ` · ${importPlan.errors.length} line(s) unreadable` : ''}
                </div>
                {importPlan.errors?.length > 0 && (
                  <ul style={{ color: '#ef4444', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                    {importPlan.errors.slice(0, 8).map((e: any) => (
                      <li key={e.line}>Line {e.line}: {e.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={() => { setShowImport(false); setImportPlan(null); }}>Cancel</button>
              <button className="btn btn-secondary" disabled={importBusy || !importText.trim()} onClick={previewImport}>
                {importBusy ? 'Reading…' : 'Preview'}
              </button>
              <button className="btn btn-primary"
                disabled={importBusy || !importPlan || importPlan.errors?.length > 0 || importPlan.create === 0}
                onClick={applyImport}>
                {importPlan ? `Add ${importPlan.create} record(s)` : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick setup ──
          A template generates records and stops; applying them is a separate,
          explicit step (ONSITE.md section 15). */}
      {showTemplates && (
        <div className="onsite-modal-backdrop" onClick={() => setShowTemplates(false)}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Quick setup</h3>
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>
              Generates the records a common setup needs. Review them before they are added.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {templates.map(t => (
                <label key={t.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="radio" name="tpl" checked={templateId === t.id}
                    onChange={() => { setTemplateId(t.id); setTemplatePreview(null); }} />
                  <span>
                    <span style={{ fontWeight: 600 }}>{t.label}</span>
                    <span style={{ display: 'block', color: 'var(--ink-muted)', fontSize: '0.8125rem' }}>{t.description}</span>
                  </span>
                </label>
              ))}
            </div>

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
              <button className="btn btn-ghost" onClick={() => { setShowTemplates(false); setTemplatePreview(null); }}>Cancel</button>
              <button className="btn btn-secondary" disabled={!templateId || templateBusy}
                onClick={() => previewTemplate(templateId)}>
                {templateBusy ? 'Building…' : 'Preview records'}
              </button>
              <button className="btn btn-primary" disabled={!templatePreview || templateBusy} onClick={applyTemplate}>
                Add {templatePreview ? `${templatePreview.length} ` : ''}record(s)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
