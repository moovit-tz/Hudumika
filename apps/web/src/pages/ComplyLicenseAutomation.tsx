import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { useComplyCertificates, useComplyObligations } from '../hooks/useComply.js';
import { apiFetch } from '../lib/api.js';
import { getHudumikaFooterHtml } from '../lib/watermark.js';
import { showAlert } from '../lib/alert.js';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';

interface TerminalLog {
  id: string;
  time: string;
  type: 'observe' | 'agent' | 'success' | 'warn' | 'error';
  text: string;
}

export function ComplyLicenseAutomation() {
  const { create: createCert } = useComplyCertificates();
  const { create: createObligation } = useComplyObligations();

  // Upload state — the user signs in to Tausi themselves, on the real site,
  // and uploads an export/screenshot of their license & levy statement here.
  // ComplyOS never sees their portal credentials.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([
    { id: '1', time: '17:45:01', type: 'agent', text: 'System initialized. Waiting for a document upload...' }
  ]);
  const [resultData, setResultData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'licenses' | 'levies' | 'workflows'>('licenses');

  // Syncing states
  const [licensesSaved, setLicensesSaved] = useState(false);
  const [leviesSaved, setLeviesSaved] = useState(false);
  const [workflowsSaved, setWorkflowsSaved] = useState(false);
  const [savingLicense, setSavingLicense] = useState(false);
  const [savingLevies, setSavingLevies] = useState(false);
  const [savingWorkflows, setSavingWorkflows] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  const addLog = (text: string, type: TerminalLog['type'] = 'observe') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, time: timestamp, type, text }]);
  };

  const handleUploadDocument = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files (screenshots) can be extracted right now — PDF support is coming later.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setFileName(file.name);
    addLog(`Document received: ${file.name}`, 'observe');
    addLog('Reading document with ComplyOS AI extraction...', 'agent');

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image_base64 = dataUrl.split(',')[1];

      const res = await apiFetch('/v1/comply/tausi-import', {
        method: 'POST',
        body: JSON.stringify({ image_base64, media_type: file.type }),
      });

      if (res.simulated) {
        addLog('Extraction simulated — configure a Gemini API key in Platform Settings → OCR for live extraction.', 'warn');
      }
      addLog(`Taxpayer profile identified: ${res.taxpayer?.name || 'unknown'}.`, 'success');
      addLog(`Extracted ${res.licenses?.length || 0} license record(s).`, 'agent');
      addLog(`Extracted ${res.levies?.length || 0} levy record(s).`, 'agent');
      addLog('Extraction complete. Review the results below.', 'success');
      setResultData(res);
    } catch (err: any) {
      addLog(`Extraction failed: ${err.message}`, 'error');
      setUploadError(err.message || 'Extraction failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setResultData(null);
    setFileName(null);
    setUploadError(null);
    setActiveTab('licenses');
    setLicensesSaved(false);
    setLeviesSaved(false);
    setWorkflowsSaved(false);
    setTerminalLogs([{ id: '1', time: '17:45:01', type: 'agent', text: 'System initialized. Waiting for a document upload...' }]);
  };

  const handleImportLicenses = async () => {
    if (!resultData?.licenses) return;
    setSavingLicense(true);
    try {
      for (const lic of resultData.licenses) {
        await createCert({
          name: lic.name,
          cert_number: lic.license_number,
          agency_code: 'TAMISEMI',
          agency_name: lic.lga,
          issued_date: lic.issued_date,
          expiry_date: lic.expiry_date,
          metadata: {
            notes: `Imported from a Tausi TAMISEMI license statement uploaded to ComplyOS. Original status: ${lic.status}`,
            cost: lic.cost,
          }
        });
      }
      setLicensesSaved(true);
    } catch (e: any) {
      showAlert(`Failed to import licenses: ${e.message}`);
    } finally {
      setSavingLicense(false);
    }
  };

  const handleRegisterLevies = async () => {
    if (!resultData?.levies) return;
    setSavingLevies(true);
    try {
      for (const levy of resultData.levies) {
        await createObligation({
          obligation_code: 'LGA_LEVY',
          agency_code: 'TAMISEMI',
          name: levy.name,
          frequency: 'One-off',
          mandatory: true,
          due_date: levy.due_date,
          customer_id: null,
        });
      }
      setLeviesSaved(true);
    } catch (e: any) {
      showAlert(`Failed to register levies: ${e.message}`);
    } finally {
      setSavingLevies(false);
    }
  };

  return (
    <div className="comply-page" data-layout="full">
      <PageHeader
        crumbs={['ComplyOS', 'License Automation Tool']}
        titlePlain="License Automation"
        titleEm="tool"
        subtitle="Sign in to Tausi (TAMISEMI) yourself, upload your license &amp; levy statement, and let the ComplyOS agent file the results automatically."
      />
      <div className="comply-page-hdr">
        </div>

      {!resultData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '640px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Upload panel */}
          <div className="comply-card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <FeaturedIcon variant="brand" size="lg" shape="square">
                <Icon name="upload" size={22} />
              </FeaturedIcon>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Import from Tausi</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>You sign in on the real Tausi site — ComplyOS only reads the statement you upload.</div>
              </div>
            </div>

            <ol style={{ margin: '0 0 20px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--ink2)' }}>
              <li>
                Sign in with your own credentials at the official Tausi portal.{' '}
                <a href="https://tausi.tamisemi.go.tz/#/login" target="_blank" rel="noreferrer" style={{ color: 'var(--comply)', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Open Tausi Portal <Icon name="externalLink" size={11} />
                </a>
              </li>
              <li>Export or screenshot your business license &amp; levy/payment statement.</li>
              <li>Upload that image below — the agent reads it and files the results automatically.</li>
            </ol>

            <label htmlFor="tausi-upload" className="comply-upload-zone" style={uploading ? { cursor: 'default', opacity: 0.7 } : undefined}>
              <span style={uploading ? { display: 'inline-flex', animation: 'spin 1s linear infinite' } : { display: 'inline-flex' }}>
                <Icon name={uploading ? 'refresh' : 'upload'} size={24} color="var(--comply)" />
              </span>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{uploading ? 'Extracting…' : fileName || 'Click to upload a screenshot'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>PNG or JPG — one page/screenshot at a time</div>
              <input
                id="tausi-upload" type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDocument(f); e.target.value = ''; }}
              />
            </label>
            {uploadError && <div className="comply-note comply-note--error" style={{ marginTop: 12 }}>{uploadError}</div>}
          </div>

          {/* Right Panel: Extraction Log */}
          <div className="comply-card" style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, minHeight: 440 }}>
            <div className="comply-card-hdr" style={{ borderBottom: '1px solid #1E293B', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#94A3B8', fontFamily: 'monospace' }}>COMPLYOS EXTRACTION AGENT</span>
              <span style={{ fontSize: 11, color: uploading ? '#FBBF24' : '#10B981', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: uploading ? '#FBBF24' : '#10B981', display: 'inline-block' }} /> {uploading ? 'EXTRACTING' : 'READY'}
              </span>
            </div>

            {/* Live Logs */}
            <div style={{ padding: '0 20px', flex: 1, overflowY: 'auto', maxHeight: 240, fontFamily: 'monospace', fontSize: 12, lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {terminalLogs.map(log => (
                <div key={log.id} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#64748B' }}>[{log.time}]</span>
                  <span style={{
                    color: log.type === 'observe' ? '#F472B6' :
                           log.type === 'agent' ? '#38BDF8' :
                           log.type === 'success' ? '#34D399' :
                           log.type === 'warn' ? '#FBBF24' : '#EF4444'
                  }}>
                    {log.type === 'observe' ? `[Observing] ` : `[Agent] `}{log.text}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            {/* Extracted Summary */}
            <div style={{ padding: 18, borderTop: '1px solid #1E293B', background: '#090D16', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Extracted Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11.5, fontFamily: 'monospace' }}>
                <div style={{ background: '#1E293B', padding: '6px 10px', borderRadius: 4, color: '#E2E8F0' }}>
                  <span style={{ color: '#64748B' }}>NIN:</span> —
                </div>
                <div style={{ background: '#1E293B', padding: '6px 10px', borderRadius: 4, color: '#E2E8F0' }}>
                  <span style={{ color: '#64748B' }}>TIN:</span> —
                </div>
                <div style={{ background: '#1E293B', padding: '6px 10px', borderRadius: 4, color: '#E2E8F0', gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748B' }}>COUNCIL:</span> —
                </div>
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* Extracted Results View */
        <div className="comply-card">
          <div className="comply-card-hdr" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="comply-card-title" style={{ fontSize: 18, fontWeight: 900 }}>{resultData.taxpayer?.name || 'Unknown taxpayer'}</h2>
                <span className="comply-badge comply-badge--active" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" style={{ width: 12, height: 12 }} /> Imported &amp; Automated
                </span>
                {resultData.simulated && <span className="comply-badge comply-badge--pending">Simulated</span>}
              </div>
              <p className="comply-page-sub" style={{ margin: '4px 0 0' }}>Council: {resultData.taxpayer?.registered_council || '—'} · TIN: {resultData.taxpayer?.tin || '—'}</p>
            </div>
            <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleReset}>
              <Icon name="refresh" style={{ marginRight: 6 }} /> Upload Another Statement
            </button>
          </div>

          {/* Results Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '0 24px' }}>
            {([
              { key: 'profile', label: 'LGA Identity', icon: 'user' },
              { key: 'licenses', label: 'Licenses Extracted', icon: 'fileText' },
              { key: 'levies', label: 'Payments & Levies', icon: 'receipt' },
              { key: 'workflows', label: 'Suggested Workflows', icon: 'zap' }
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
                  transition: 'all 0.15s'
                }}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>Council Association</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Linked Council</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.registered_council || '—'}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>Region</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.region || '—'}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>TIN Number</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.tin || '—'}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>LGA Account Details</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Account Name</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.name || '—'}</td></tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '8px 0', color: 'var(--ink2)' }}>NIDA Number</td><td style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.nin || '—'}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Licenses */}
            {activeTab === 'licenses' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>The following local government licenses were extracted from your uploaded Tausi statement.</div>
                  {licensesSaved ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ✓ Imported to Vault
                    </span>
                  ) : (
                    <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleImportLicenses} disabled={savingLicense || !resultData.licenses?.length}>
                      {savingLicense ? 'Importing...' : 'Import to Vault'}
                    </button>
                  )}
                </div>
                {!resultData.licenses?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No license records were found in the uploaded document.</div>
                ) : (
                <table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>License Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Ref Number</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Expiry Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Cost (TZS)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultData.licenses.map((lic: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{lic.name}</td>
                        <td style={{ padding: '12px', color: 'var(--ink2)' }}>{lic.license_number}</td>
                        <td style={{ padding: '12px', color: 'var(--ink3)' }}>{lic.expiry_date}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{Number(lic.cost || 0).toLocaleString()} TZS</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span className={`comply-badge comply-badge--${lic.status === 'Active' ? 'active' : 'expired'}`}>
                            {lic.status || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* Tab 3: Levies */}
            {activeTab === 'levies' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Outstanding payments and levies extracted from your uploaded statement.</div>
                  {leviesSaved ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)' }}>✓ Registered in Obligations</span>
                  ) : (
                    <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleRegisterLevies} disabled={savingLevies || !resultData.levies?.length}>
                      {savingLevies ? 'Registering...' : 'Register Levies'}
                    </button>
                  )}
                </div>
                {!resultData.levies?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No levy records were found in the uploaded document.</div>
                ) : (
                <table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Levy Item</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>GePG Control Number</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Due Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultData.levies.map((lev: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{lev.name}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 600 }}>{lev.control_number}</td>
                        <td style={{ padding: '12px', color: 'var(--ink3)' }}>{lev.due_date}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{Number(lev.amount || 0).toLocaleString()} TZS</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span className="comply-badge comply-badge--pending">
                            {lev.status || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* Tab 4: Workflows */}
            {activeTab === 'workflows' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>ComplyOS suggests these next steps based on your imported license and levy statuses:</div>
                  {resultData.workflows?.length > 0 && (
                    workflowsSaved ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)' }}>✓ Workflows Configured</span>
                    ) : (
                      <button
                        type="button"
                        className="comply-btn-primary comply-btn-sm"
                        onClick={() => {
                          setSavingWorkflows(true);
                          setTimeout(() => {
                            setSavingWorkflows(false);
                            setWorkflowsSaved(true);
                          }, 1000);
                        }}
                        disabled={savingWorkflows}
                      >
                        {savingWorkflows ? 'Activating...' : 'Activate Workflows'}
                      </button>
                    )
                  )}
                </div>

                {!resultData.workflows?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No lapsed licenses or unpaid levies found — nothing needs action right now.</div>
                ) : resultData.workflows.map((wf: any, idx: number) => (
                  <div key={idx} className="comply-card" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <div className="comply-card-hdr" style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
                        <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>{wf.name}</h4>
                      </div>
                      <span className="comply-badge comply-badge--active" style={{ fontSize: 10.5 }}>Suggested</span>
                    </div>
                    <div style={{ padding: 20 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--ink2)', margin: '0 0 16px' }}>{wf.description}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {wf.steps.map((st: any) => (
                          <div key={st.order} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, background: 'var(--white)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                            <span style={{ display: 'flex', width: 18, height: 18, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 10, fontWeight: 700, alignItems: 'center', justifyContent: 'center' }}>
                              {st.order}
                            </span>
                            <span style={{ flex: 1, color: 'var(--ink)' }}>{st.name}</span>
                            <span className="comply-firm-tag" style={{ fontSize: 10 }}>{st.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

      <div dangerouslySetInnerHTML={{ __html: getHudumikaFooterHtml() }} />
    </div>
  );
}
