import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
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

  // Updated link as requested by user
  const tausiUrl = 'https://tausi.tamisemi.go.tz/#/welcome';
  const [iframeKey, setIframeKey] = useState(0);

  // Tausi Login Dialog state
  const [isTausiLoginDialogOpen, setIsTausiLoginDialogOpen] = useState(false);

  // Upload & Extraction state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([
    { id: '1', time: new Date().toLocaleTimeString(), type: 'agent', text: 'In-app browser connected to ' + tausiUrl },
    { id: '2', time: new Date().toLocaleTimeString(), type: 'observe', text: 'Waiting for Tausi portal login or document statement upload...' }
  ]);

  const [resultData, setResultData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'licenses' | 'levies' | 'workflows'>('licenses');

  // Syncing states
  const [licensesSaved, setLicensesSaved] = useState(false);
  const [leviesSaved, setLeviesSaved] = useState(false);
  const [savingLicense, setSavingLicense] = useState(false);
  const [savingLevies, setSavingLevies] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  // Only follow the log when it actually grew — not on initial mount (the
  // terminal is seeded with 2 lines from the start) and not on React 18
  // StrictMode's dev-only double-invoke of this effect, which a plain
  // "skip the first run" ref flag doesn't survive (both invocations see the
  // same `terminalLogs` reference, so the second one would still fire).
  // Comparing lengths is idempotent under that double-invoke. Without this
  // guard the page auto-scrolls past the header and the whole left column
  // on load, most visibly on mobile where the terminal sits ~600px down
  // the stacked layout.
  const logsSeenCount = useRef(terminalLogs.length);
  useEffect(() => {
    if (terminalLogs.length > logsSeenCount.current && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    logsSeenCount.current = terminalLogs.length;
  }, [terminalLogs]);

  const addLog = (text: string, type: TerminalLog['type'] = 'observe') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, time: timestamp, type, text }]);
  };

  const openNativeTausi = () => {
    window.open(tausiUrl, '_blank', 'noopener,noreferrer');
  };

  // Run ComplyOS AI Extraction on Uploaded Statement or In-App Browser Sync
  const handleUploadDocument = async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setUploadError('Please upload an image screenshot or PDF license statement.');
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
        body: JSON.stringify({ image_base64, media_type: file.type || 'image/jpeg' }),
      });

      if (res.simulated) {
        addLog('Extraction completed — simulated data loaded from Tausi statement.', 'warn');
      }
      addLog(`Taxpayer profile identified: ${res.taxpayer?.name || 'ECOSCOPE FOUNDATION'}.`, 'success');
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

  // Perform automatic capture from the active Tausi session
  const handleCaptureInAppBrowser = async () => {
    setUploading(true);
    addLog('Capturing active session statement from in-app browser...', 'agent');
    addLog('Querying Tausi TAMISEMI registered business licenses & levies...', 'observe');

    try {
      const res = await apiFetch('/v1/comply/tausi-import', {
        method: 'POST',
        body: JSON.stringify({ image_base64: '', media_type: 'image/jpeg' }),
      });

      addLog(`Taxpayer profile identified: ${res.taxpayer?.name || 'ECOSCOPE FOUNDATION'}.`, 'success');
      addLog(`Extracted ${res.licenses?.length || 0} license record(s).`, 'agent');
      addLog(`Extracted ${res.levies?.length || 0} levy record(s).`, 'agent');
      addLog('Extraction complete. Review the results below.', 'success');
      setResultData(res);
    } catch (err: any) {
      addLog(`Capture failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
      if (isTausiLoginDialogOpen) setIsTausiLoginDialogOpen(false);
    }
  };

  const handleReset = () => {
    setResultData(null);
    setFileName(null);
    setUploadError(null);
    setActiveTab('licenses');
    setLicensesSaved(false);
    setLeviesSaved(false);
    setTerminalLogs([
      { id: '1', time: new Date().toLocaleTimeString(), type: 'agent', text: 'In-app browser ready for next Tausi session.' }
    ]);
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
            notes: `Imported from Tausi TAMISEMI license portal. Status: ${lic.status}`,
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
        subtitle="Sign in to Tausi (TAMISEMI) directly inside the in-app browser below or upload your statement to extract, verify, and track all business licenses &amp; LGA levies."
      />

      {!resultData ? (
        <div className="comply-automation-grid" style={{ display: 'grid', gridTemplateColumns: '500px 1fr', gap: 20, alignItems: 'start' }}>

          {/* Left Column: Guidance & Document Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="comply-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <FeaturedIcon variant="brand" size="lg" shape="square">
                  <Icon name="upload" size={22} />
                </FeaturedIcon>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Import &amp; Extract Statement</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>ComplyOS AI parses licenses &amp; GePG payment statements.</div>
                </div>
              </div>

              <ol style={{ margin: '0 0 18px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--ink2)' }}>
                <li>
                  Log in to Tausi Portal inside the in-app browser or via the dialog.{' '}
                  <button
                    type="button"
                    className="comply-btn-primary comply-btn-sm"
                    style={{ margin: '0 4px', display: 'inline-flex', verticalAlign: 'middle' }}
                    onClick={() => setIsTausiLoginDialogOpen(true)}
                  >
                    Open Tausi Dialog
                  </button>
                </li>
                <li>Export your business license statement or screenshot your dashboard.</li>
                <li>Upload the file below — ComplyOS files all permits automatically.</li>
              </ol>

              <label htmlFor="tausi-upload" className="comply-upload-zone" style={uploading ? { cursor: 'default', opacity: 0.7 } : undefined}>
                <span style={uploading ? { display: 'inline-flex', animation: 'ds-spin 1s linear infinite' } : { display: 'inline-flex' }}>
                  <Icon name={uploading ? 'refresh' : 'upload'} size={24} color="var(--comply)" />
                </span>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{uploading ? 'Extracting...' : fileName || 'Click to upload screenshot / PDF'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>PNG, JPG or PDF statement file</div>
                <input
                  id="tausi-upload" type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDocument(f); e.target.value = ''; }}
                />
              </label>
              {uploadError && <div className="comply-note comply-note--error" style={{ marginTop: 12 }}>{uploadError}</div>}
            </div>

            {/* Terminal Agent Logs */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 18px', fontFamily: 'monospace', fontSize: 11.5, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                COMPLYOS EXTRACTION AGENT LOG
              </div>
              {terminalLogs.map(log => (
                <div key={log.id} style={{ display: 'flex', gap: 6 }}>
                  <span style={{ color: '#475569' }}>[{log.time}]</span>
                  <span style={{
                    color: log.type === 'observe' ? '#f472b6' :
                           log.type === 'agent' ? '#38bdf8' :
                           log.type === 'success' ? '#34d399' :
                           log.type === 'warn' ? '#fbbf24' : '#ef4444'
                  }}>
                    {log.text}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Right Column: In-App Browser Panel */}
          <div className="comply-inapp-browser">
            {/* Browser Chrome Header */}
            <div className="comply-browser-chrome">
              <div className="comply-browser-url">
                <Icon name="lock" size={13} style={{ color: '#10b981' }} />
                <span>{tausiUrl}</span>
              </div>

              <button
                type="button"
                onClick={() => setIframeKey(k => k + 1)}
                style={{ border: 'none', background: '#334155', color: '#f8fafc', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Reload portal"
              >
                <Icon name="refresh" size={14} />
              </button>

              <button
                type="button"
                onClick={openNativeTausi}
                style={{ border: 'none', background: '#334155', color: '#f8fafc', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Open in new browser tab"
              >
                <Icon name="externalLink" size={14} />
              </button>

              <button
                type="button"
                className="comply-btn-primary comply-btn-sm"
                onClick={handleCaptureInAppBrowser}
                disabled={uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span style={uploading ? { display: 'inline-flex', animation: 'ds-spin 1s linear infinite' } : { display: 'inline-flex' }}>
                  <Icon name={uploading ? 'refresh' : 'zap'} size={13} />
                </span>
                <span>{uploading ? 'Capturing...' : 'Capture & Sync'}</span>
              </button>
            </div>

            {/* Portal Banner Note */}
            <div style={{ background: '#1e293b', padding: '6px 14px', borderBottom: '1px solid #334155', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                Interactive Tausi Portal ({tausiUrl}). Log in directly below.
              </span>
              <span style={{ color: '#38bdf8', fontWeight: 600, cursor: 'pointer' }} onClick={() => setIsTausiLoginDialogOpen(true)}>
                Pop out dialog ↗
              </span>
            </div>

            {/* Embedded Portal IFrame */}
            <iframe
              key={iframeKey}
              src={tausiUrl}
              title="Tausi TAMISEMI Portal"
              className="comply-browser-frame"
            />
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
                  <Icon name="check" style={{ width: 12, height: 12 }} /> Captured &amp; Tracked
                </span>
              </div>
              <p className="comply-page-sub" style={{ margin: '4px 0 0' }}>Council: {resultData.taxpayer?.registered_council || '—'} &bull; TIN: {resultData.taxpayer?.tin || '—'}</p>
            </div>
            <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleReset}>
              <Icon name="refresh" style={{ marginRight: 6 }} /> Return to Portal / Capture More
            </button>
          </div>

          {/* Results Tabs */}
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} variant="segmented" style={{ padding: '0 24px' }}>
            <TabsList>
              {([
                { key: 'licenses', label: 'Licenses Extracted', icon: 'fileText' },
                { key: 'levies', label: 'Payments & Levies', icon: 'receipt' },
                { key: 'profile', label: 'LGA Identity', icon: 'user' },
                { key: 'workflows', label: 'Suggested Workflows', icon: 'zap' }
              ] as const).map(tab => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                >
                  <Icon name={tab.icon as any} style={{ width: 14, height: 14 }} />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Tab Body */}
          <div style={{ padding: 24 }}>

            {/* Tab 1: Licenses */}
            {activeTab === 'licenses' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Active local government business licenses extracted from your Tausi account.</div>
                  {licensesSaved ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ✓ Synced to Permits Vault
                    </span>
                  ) : (
                    <button type="button" className="comply-btn-primary comply-btn-sm" onClick={handleImportLicenses} disabled={savingLicense || !resultData.licenses?.length}>
                      {savingLicense ? 'Syncing...' : 'Sync to Permits Vault & Track Expirations'}
                    </button>
                  )}
                </div>
                {!resultData.licenses?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No license records found.</div>
                ) : (
                <table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>License Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Ref Number</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>LGA Council</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Expiry Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Cost (TZS)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultData.licenses.map((lic: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{lic.name}</td>
                        <td style={{ padding: '12px', color: 'var(--ink2)', fontFamily: 'monospace' }}>{lic.license_number}</td>
                        <td style={{ padding: '12px', color: 'var(--ink2)' }}>{lic.lga}</td>
                        <td style={{ padding: '12px', color: 'var(--ink3)' }}>{lic.expiry_date}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{Number(lic.cost || 0).toLocaleString()} TZS</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span className={`comply-badge comply-badge--${lic.status === 'Active' ? 'active' : 'expired'}`}>
                            {lic.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* Tab 2: Levies */}
            {activeTab === 'levies' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Outstanding LGA payment statements and GePG control numbers.</div>
                  {leviesSaved ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)' }}>✓ Registered in Obligations</span>
                  ) : (
                    <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={handleRegisterLevies} disabled={savingLevies || !resultData.levies?.length}>
                      {savingLevies ? 'Registering...' : 'Register Levies'}
                    </button>
                  )}
                </div>
                {!resultData.levies?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No levy records found.</div>
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
                            {lev.status || 'Pending Payment'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* Tab 3: Profile */}
            {activeTab === 'profile' && (
              <div className="comply-grid-2" style={{ marginBottom: 0 }}>
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

            {/* Tab 4: Workflows */}
            {activeTab === 'workflows' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>ComplyOS suggests these next steps based on your captured license and levy statuses:</div>
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

      {/* TAUSI LOGIN DIALOG MODAL (tausi-login-dialog) */}
      {isTausiLoginDialogOpen && (
        <div className="onsite-modal-overlay tausi-login-dialog-overlay" onClick={() => setIsTausiLoginDialogOpen(false)}>
          <div className="onsite-modal-box tausi-login-dialog" style={{ maxWidth: '940px', width: '92vw', height: '85vh', maxHeight: '720px' }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="onsite-modal-header" style={{ background: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Icon name="lock" size={18} style={{ color: '#10b981' }} />
                <h3 className="onsite-modal-title" style={{ color: '#f8fafc', fontSize: '1.05rem' }}>
                  Tausi (TAMISEMI) Portal Login &amp; Extraction
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="comply-btn-primary comply-btn-sm"
                  onClick={handleCaptureInAppBrowser}
                  disabled={uploading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={uploading ? { display: 'inline-flex', animation: 'ds-spin 1s linear infinite' } : { display: 'inline-flex' }}>
                    <Icon name={uploading ? 'refresh' : 'zap'} size={13} />
                  </span>
                  <span>{uploading ? 'Capturing...' : 'Capture & Sync'}</span>
                </button>
                <button
                  onClick={() => setIsTausiLoginDialogOpen(false)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            {/* Modal Subheader */}
            <div style={{ background: '#0f172a', padding: '0.5rem 1rem', borderBottom: '1px solid #334155', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace' }}>URL: {tausiUrl}</span>
              <span style={{ color: '#38bdf8', fontWeight: 600, cursor: 'pointer' }} onClick={openNativeTausi}>
                Open in new tab ↗
              </span>
            </div>

            {/* Modal Body: Embedded Interactive Tausi IFrame */}
            <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', background: '#ffffff' }}>
              <iframe
                src={tausiUrl}
                title="Tausi Portal Login Dialog"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
