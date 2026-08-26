import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyCertificates, useComplyObligations } from '../hooks/useComply.js';
import { apiFetch } from '../lib/api.js';
import { getHudumikaFooterHtml } from '../lib/watermark.js';
import { showAlert } from '../lib/alert.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';

interface TerminalLog {
  id: string;
  time: string;
  type: 'info' | 'warn' | 'success' | 'error' | 'input';
  text: string;
}

export function ComplyTraExtract() {
  const navigate = useNavigate();
  const { create: createCert } = useComplyCertificates();
  const { create: createObligation } = useComplyObligations();

  // Form State — TRA has no public API and this tool does not perform a live
  // portal login, so it never asks for (or needs) the taxpayer's real portal
  // password. It only takes the two fields that actually shape the preview.
  const [tin, setTin] = useState('108-449-012');
  const [region, setRegion] = useState('Mainland');

  // Execution State
  const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [resultData, setResultData] = useState<any>(null);
  const [simulated, setSimulated] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'obligations' | 'tcc' | 'history'>('profile');

  // Saving states
  const [savingTcc, setSavingTcc] = useState(false);
  const [savingObligations, setSavingObligations] = useState(false);
  const [tccSaved, setTccSaved] = useState(false);
  const [obligationsSaved, setObligationsSaved] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Only follow the log when it actually grew — not on mount, and not on
  // React 18 StrictMode's dev-only double-invoke of this effect (see the
  // identical fix in ComplyLicenseAutomation.tsx for why a plain "skip the
  // first run" flag isn't enough).
  const logsSeenCount = useRef(terminalLogs.length);
  useEffect(() => {
    if (terminalLogs.length > logsSeenCount.current && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    logsSeenCount.current = terminalLogs.length;
  }, [terminalLogs]);

  const addLog = (text: string, type: TerminalLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, time: timestamp, type, text }]);
  };

  // TRA's taxpayer portal has no public API, so this does not establish a
  // live authenticated session — it looks up a sample compliance profile for
  // the given TIN so you can see the shape of the data before it's real.
  // Nothing here is a bypass of any real security control; the log lines
  // below describe what ComplyOS is actually doing, not a fake login.
  const handleStartExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tin.trim()) {
      showAlert('Please enter a TIN.');
      return;
    }

    setStatus('running');
    setTerminalLogs([]);
    setResultData(null);
    setTccSaved(false);
    setObligationsSaved(false);

    addLog('Generating a simulated taxpayer preview — TRA has no public API, so this is not a live portal session.', 'info');
    setTimeout(() => addLog(`Looking up sample profile shape for TIN ${tin} (${region === 'Mainland' ? 'TRA Mainland' : 'ZRA Zanzibar'})...`, 'info'), 500);
    setTimeout(() => addLog('Building demo taxpayer profile, obligations, TCC and filing history...', 'info'), 1200);

    setTimeout(async () => {
      try {
        const res = await apiFetch('/v1/comply/tra-extract', {
          method: 'POST',
          body: JSON.stringify({ tin }),
        });
        setResultData(res);
        setSimulated(res?.simulated !== false);
        addLog('Preview ready.', 'success');
        setStatus('completed');
      } catch (err: any) {
        addLog(`Error building TRA preview: ${err.message}`, 'error');
        setStatus('idle');
      }
    }, 1900);
  };

  const handleImportTcc = async () => {
    if (!resultData?.tcc) return;
    setSavingTcc(true);
    try {
      await createCert({
        name: 'Tax Compliance Certificate',
        cert_number: resultData.tcc.reference,
        agency_code: 'TRA',
        agency_name: 'Tanzania Revenue Authority',
        issued_date: resultData.tcc.issued_date,
        expiry_date: resultData.tcc.expiry_date,
        metadata: {
          notes: `Imported from the TRA preview tool for TIN ${resultData.taxpayer.tin}${simulated ? ' — SIMULATED demo data, not a live TRA record. Verify before relying on it.' : ''}`,
        }
      });
      setTccSaved(true);
    } catch (e: any) {
      showAlert(`Failed to import certificate: ${e.message}`);
    } finally {
      setSavingTcc(false);
    }
  };

  const handleImportObligations = async () => {
    if (!resultData?.obligations) return;
    setSavingObligations(true);
    try {
      const activeOb = resultData.obligations.filter((o: any) => o.status === 'Active');
      for (const ob of activeOb) {
        await createObligation({
          obligation_code: ob.name.includes('VAT') ? 'VAT' : ob.name.includes('PAYE') ? 'PAYE' : 'TAX',
          agency_code: 'TRA',
          name: ob.name,
          frequency: ob.type,
          mandatory: true,
          due_date: null,
          customer_id: null,
        });
      }
      setObligationsSaved(true);
    } catch (e: any) {
      showAlert(`Failed to register obligations: ${e.message}`);
    } finally {
      setSavingObligations(false);
    }
  };

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'TRA Taxpayer Portal Agent']}
        titlePlain="TRA Taxpayer Portal"
        titleEm="preview"
        subtitle="TRA has no public API — this previews the shape of a taxpayer compliance profile by TIN. It never asks for your portal password and does not log in to the live TRA site."
      />

      <div className={status === 'completed' ? undefined : 'comply-grid-2'} style={status === 'completed' ? undefined : { alignItems: 'start' }}>

        {/* Credentials Form Card */}
        {status !== 'completed' && (
          <div className="comply-card">
            <div className="comply-card-hdr">
              <h2 className="comply-card-title">Preview Lookup</h2>
            </div>
            <form className="comply-wizard-card" onSubmit={handleStartExtraction} style={{ padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="comply-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Tax Authority</label>
                  <Select value={region} onValueChange={setRegion} disabled={status !== 'idle'}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mainland">Tanzania Revenue Authority (TRA) - Mainland</SelectItem>
                      <SelectItem value="Zanzibar">Zanzibar Revenue Authority (ZRA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="comply-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>TIN Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 108-449-012"
                    value={tin}
                    onChange={e => setTin(e.target.value)}
                    disabled={status !== 'idle'}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                </div>

                <div className="comply-note comply-note--info" style={{ margin: 0 }}>
                  <Icon name="info" size={14} />
                  <span>This tool never asks for your TRA portal username or password — it doesn't perform a live login.</span>
                </div>

                {status === 'idle' ? (
                  <button type="submit" className="comply-btn-primary" style={{ padding: '12px', borderRadius: 'var(--r)', marginTop: 8 }}>
                    <Icon name="zap" style={{ marginRight: 8 }} /> Generate Preview
                  </button>
                ) : (
                  <button type="button" className="comply-btn-secondary" disabled style={{ padding: '12px', borderRadius: 'var(--r)', marginTop: 8 }}>
                    Generating…
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Console / Terminal View */}
        {status !== 'completed' && (
          <div className="comply-card" style={{ background: '#0F172A', color: '#38BDF8', border: '1px solid #1E293B', borderRadius: 12 }}>
            <div className="comply-card-hdr" style={{ borderBottom: '1px solid #1E293B', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--ink3)', fontFamily: 'monospace' }}>PREVIEW BUILDER LOG</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
              </div>
            </div>
            <div style={{ padding: 20, height: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12.5, lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {terminalLogs.length === 0 ? (
                <div style={{ color: 'var(--ink2)', fontStyle: 'italic' }}>Waiting for a TIN to preview...</div>
              ) : (
                terminalLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', gap: 10 }}>
                    <span style={{ color: 'var(--ink2)' }}>[{log.time}]</span>
                    <span style={{
                      color: log.type === 'error' ? '#EF4444' :
                             log.type === 'success' ? '#34D399' :
                             log.type === 'warn' ? '#FBBF24' :
                             log.type === 'input' ? '#F472B6' : '#38BDF8'
                    }}>
                      {log.type === 'input' ? `> ` : ``}{log.text}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Extracted Details View */}
        {status === 'completed' && resultData && (
          <div className="comply-card">
            <div className="comply-card-hdr" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 className="comply-card-title" style={{ fontSize: 18, fontWeight: 900 }}>{resultData.taxpayer.name}</h2>
                  <span className="comply-badge comply-badge--pending" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="alertTriangle" style={{ width: 12, height: 12 }} /> Simulated Preview
                  </span>
                </div>
                <p className="comply-page-sub" style={{ margin: '4px 0 0' }}>TIN: {resultData.taxpayer.tin} · Demo data — not a live TRA record</p>
              </div>
              <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => setStatus('idle')}>
                <Icon name="refresh" style={{ marginRight: 6 }} /> New Preview
              </button>
            </div>

            <div className="comply-note comply-note--warning comply-note--icon" style={{ margin: '16px 24px 0' }}>
              <Icon name="alertTriangle" size={15} />
              <span><strong>Simulated data.</strong> TRA has no public API for ComplyOS to query, so the profile, obligations, TCC and filing history below are a fixed demo dataset for previewing this feature — not a live extraction for this specific TIN. Verify anything you import against your actual TRA records.</span>
            </div>

            {/* Results Navigation Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '0 24px', marginTop: 16 }}>
              {([
                { key: 'profile', label: 'Taxpayer Profile', icon: 'user' },
                { key: 'obligations', label: 'Active Obligations', icon: 'clipboardList' },
                { key: 'tcc', label: 'Compliance & TCC', icon: 'shield' },
                { key: 'history', label: 'Filing History', icon: 'fileText' }
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 'var(--ds-btn-py-lg) 20px',
                    border: 'none',
                    background: 'none',
                    fontSize: 13,
                    fontWeight: activeTab === tab.key ? 700 : 500,
                    color: activeTab === tab.key ? 'var(--teal)' : 'var(--ink2)',
                    borderBottom: activeTab === tab.key ? '2px solid var(--teal)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s', minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}
                >
                  <Icon name={tab.icon as any} style={{ width: 14, height: 14 }} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div style={{ padding: 24 }}>

              {/* Tab 1: Profile */}
              {activeTab === 'profile' && (
                <div className="comply-grid-2" style={{ marginBottom: 0 }}>
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>Corporate Identity</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Registered Name</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.name}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>TIN Number</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.tin}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>VRN Number</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.vrn}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>Incorporation Date</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.incorporation_date}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>Portal & Bio Data</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Tax Office</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.tax_office}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>NIDA / NIN</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.nida}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>Registered Phone</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.phone}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>Registered Email</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer.email}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Obligations */}
              {activeTab === 'obligations' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink2)' }}>The following tax obligations were identified in the taxpayers record.</div>
                    {obligationsSaved ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        ✓ Registered in Obligations
                      </span>
                    ) : (
                      <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleImportObligations} disabled={savingObligations}>
                        {savingObligations ? 'Registering...' : 'Register Obligations'}
                      </button>
                    )}
                  </div>
                  <table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tax Obligation Type</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Filing Frequency</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultData.obligations.map((ob: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{ob.name}</td>
                          <td style={{ padding: '12px', color: 'var(--ink2)' }}>{ob.type}</td>
                          <td style={{ padding: '12px' }}>
                            <span className={`comply-badge comply-badge--${ob.status === 'Active' ? 'active' : 'draft'}`}>
                              {ob.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 3: TCC */}
              {activeTab === 'tcc' && (
                <div style={{ display: 'flex', gap: 24 }}>
                  <div style={{ width: 140, height: 140, border: '4px solid #DCFCE7', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--green-l)', color: '#166534', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>TCC Status</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Compliant</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800 }}>Tax Compliance Certificate (TCC)</h3>
                      {tccSaved ? (
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)' }}>✓ Imported into Vault</span>
                      ) : (
                        <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleImportTcc} disabled={savingTcc}>
                          {savingTcc ? 'Importing...' : 'Import to Vault'}
                        </button>
                      )}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Certificate Ref</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.tcc.reference}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>Date of Issue</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.tcc.issued_date}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>Expiry Date</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.tcc.expiry_date}</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>TRA Status</td><td style={{ padding: '8px 0', color: '#166534', fontWeight: 700 }}>{resultData.tcc.status}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 4: Filing History */}
              {activeTab === 'history' && (
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>Corporate Tax Return History</h3>
                  <table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Assessment Year</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tax Type</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date Submitted</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Tax Assessed (TZS)</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Tax Paid (TZS)</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Assessment Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultData.filing_history.map((hist: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{hist.year}</td>
                          <td style={{ padding: '12px', color: 'var(--ink2)' }}>{hist.return_type}</td>
                          <td style={{ padding: '12px', color: 'var(--ink3)' }}>{hist.filed_date}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{hist.tax_due.toLocaleString()} TZS</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: '#166534' }}>{hist.tax_paid.toLocaleString()} TZS</td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span className={`comply-badge comply-badge--${hist.status === 'Assessed' ? 'active' : 'pending'}`}>
                              {hist.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      <div dangerouslySetInnerHTML={{ __html: getHudumikaFooterHtml() }} />
    </div>
  );
}
