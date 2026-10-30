import {Banner} from '../components/ui/alert.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { Card } from '../components/ui/card.js';
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { useComplyObligations } from '../hooks/useComply.js';
import { apiFetch } from '../lib/api.js';

import {Link} from 'react-router-dom';
import type {SaveTausiLicensesResult,TausiLicenseRecord} from '@hudumika/types';
import {Input} from '../components/ui/input.js';
import {Checkbox} from '../components/ui/checkbox.js';
import {DatePicker,toDateOnlyString} from '../components/ui/date-picker.js';
import {ComplyCustomerPicker} from './ComplyCustomerPicker.js';
import { showAlert } from '../lib/alert.js';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';

interface TerminalLog {
  id: string;
  time: string;
  type: 'observe' | 'agent' | 'success' | 'warn' | 'error';
  text: string;
}

export function ComplyLicenseAutomation() {
  const { create: createObligation } = useComplyObligations();

  // Updated link as requested by user
  const tausiUrl = 'https://tausi.tamisemi.go.tz/#/welcome';
  const [iframeKey, setIframeKey] = useState(0);
  const [captureFile,setCaptureFile]=useState<File|null>(null);
  const [capturePreview,setCapturePreview]=useState<string|null>(null);
  const [source,setSource]=useState<'tab_capture'|'document_upload'>('document_upload');
  const [reviewed,setReviewed]=useState(false);
  const [customerId,setCustomerId]=useState<string|null>(null);
  const [saveResult,setSaveResult]=useState<SaveTausiLicensesResult|null>(null);
  const editLicense=(index:number,field:keyof TausiLicenseRecord,value:string|number|null)=>{setReviewed(false);setResultData((prev:any)=>({...prev,licenses:prev.licenses.map((license:any,i:number)=>i===index?{...license,[field]:value}:license)}));};

  // Tausi Login Dialog state
  const [isTausiLoginDialogOpen, setIsTausiLoginDialogOpen] = useState(false);

  // Upload & Extraction state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([
    { id: '1', time: new Date().toLocaleTimeString(), type: 'agent', text: 'Open Tausi and sign in to your own account.' },
    { id: '2', time: new Date().toLocaleTimeString(), type: 'observe', text: 'Ready for a shared-tab screenshot or uploaded statement.' }
  ]);

  const [resultData, setResultData] = useState<any>(null);
  // Whether resultData is demo/simulated rather than a real extraction —
  // same distinction ComplyTraExtract.tsx tracks, threaded through to the
  // imported record's own notes below so a simulated import can't later be
  // mistaken for a live one once it's sitting in the Vault.
  const [simulated, setSimulated] = useState(false);
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
  const handleUploadDocument = async (file: File, captureSource:'tab_capture'|'document_upload'='document_upload') => {
    if (!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>8*1024*1024) {
      setUploadError('Upload a PNG, JPEG, WebP or PDF up to 8 MB.');
      return;
    }
    setUploading(true);
    setSource(captureSource);setReviewed(false);setSaveResult(null);setLicensesSaved(false);setLeviesSaved(false);
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

      if(res.simulated!==false)throw new Error('Demo results cannot be imported. Configure the OCR provider and capture a real statement.');
      addLog(`Taxpayer profile identified: ${res.taxpayer?.name || 'Not visible in document'}.`, 'success');
      addLog(`Extracted ${res.licenses?.length || 0} license record(s).`, 'agent');
      addLog(`Extracted ${res.levies?.length || 0} levy record(s).`, 'agent');
      addLog('Extraction complete. Review the results below.', 'success');
      setSimulated(res?.simulated !== false);
      setResultData(res);
    } catch (err: any) {
      addLog(`Extraction failed: ${err.message}`, 'error');
      setUploadError(err.message || 'Extraction failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleCaptureInAppBrowser = async () => {
    if(!navigator.mediaDevices?.getDisplayMedia){setUploadError('Tab capture is unavailable in this browser. Upload a screenshot or PDF instead.');return;}
    setUploading(true);setUploadError(null);
    let stream:MediaStream|undefined;
    const video=document.createElement('video');
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false});
      video.srcObject=stream;video.muted=true;
      await Promise.race([video.play(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('The shared tab did not produce a frame. Try again or upload a screenshot.')),10000))]);
      if(!video.videoWidth||!video.videoHeight)throw new Error('No image was captured. Upload a screenshot instead.');
      const canvas=document.createElement('canvas');
      const scale=Math.min(1,2560/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      const context=canvas.getContext('2d');if(!context)throw new Error('Image capture is unavailable.');
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode screenshot.')),'image/jpeg',.92));
      setCaptureFile(new File([blob],'tausi-tab-capture.jpg',{type:'image/jpeg'}));setCapturePreview(canvas.toDataURL('image/jpeg',.92));
      setIsTausiLoginDialogOpen(false);addLog('Screenshot captured. Sharing stopped. Review the image before sending it for extraction.','success');
    }catch(err:any){setUploadError(err.name==='NotAllowedError'?'Capture cancelled. No screenshot was sent.':err.message||'Capture failed.');}
    finally{stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;setUploading(false);}
  };

  const handleReset = () => {
    setResultData(null);setCaptureFile(null);setCapturePreview(null);setReviewed(false);setSaveResult(null);
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
      if(simulated||!reviewed)throw new Error('Review the extracted licence details before saving.');
      const saved:SaveTausiLicensesResult=await apiFetch('/v1/comply/tausi-import/save',{method:'POST',body:JSON.stringify({licenses:resultData.licenses,source,taxpayer:{name:resultData.taxpayer?.name,tin:resultData.taxpayer?.tin},customer_id:customerId})});
      setSaveResult(saved);
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
        crumbs={['ComplyOS', 'Licence automation']}
        titlePlain="Licence"
        titleEm="automation"
        subtitle="Sign in to Tausi, capture the licence page or upload its statement, then review and save records to ComplyOS."
      />

      <Banner variant="info">ComplyOS does not read portal passwords or silently access this embedded page. Capture shares one screenshot with the configured OCR provider after you approve it. Only visible records are extracted; capture additional pages separately.</Banner>
      {captureFile&&capturePreview&&!resultData&&<Card className="comply-card" style={{padding:16}}><h2 className="comply-card-title">Review captured screenshot</h2><p>Check that this shows licence details, not login credentials or unrelated information.</p><img src={capturePreview} alt="Captured tab ready for extraction" style={{maxWidth:'100%',maxHeight:420,objectFit:'contain'}}/><div className="comply-action-row"><Button disabled={uploading} onClick={()=>void handleUploadDocument(captureFile,'tab_capture')}>Extract this screenshot</Button><Button variant="outline" disabled={uploading} onClick={()=>{setCaptureFile(null);setCapturePreview(null);}}>Discard capture</Button></div></Card>}
      {!resultData ? (
        <div className="comply-automation-grid" style={{ display: 'grid', gridTemplateColumns: '500px 1fr', gap: 20, alignItems: 'start' }}>

          {/* Left Column: Guidance & Document Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card className="comply-card" style={{ padding: 24 }}>
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
                  Sign in to Tausi in its own browser tab.{' '}
                  <Button
                    type="button"
                    size="xs"
                    style={{margin: '0 4px', verticalAlign: 'middle'}}
                    onClick={openNativeTausi}
                  >
                    Open Tausi portal
                  </Button>
                </li>
                <li>Open the licence details after login, then choose Capture licence tab and select that Tausi tab.</li>
                <li>Review the captured image and extracted fields, choose a customer if needed, then save to the permit vault. You can also upload a statement.</li>
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
              {uploadError && <Banner variant="error" icon={false} className="" style={{ marginTop: 12 }}>{uploadError}</Banner>}
            </Card>

            {/* Terminal Agent Logs */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--surface2)', borderRadius: 'var(--r)', padding: '14px 18px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                COMPLYOS EXTRACTION AGENT LOG
              </div>
              {terminalLogs.map(log => (
                <div key={log.id} style={{ display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--ink2)' }}>[{log.time}]</span>
                  <span style={{
                    color: log.type === 'observe' ? 'var(--purple)' :
                           log.type === 'agent' ? 'var(--blue)' :
                           log.type === 'success' ? 'var(--green)' :
                           log.type === 'warn' ? 'var(--gold)' : 'var(--red)'
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
                <Icon name="lock" size={13} style={{ color: 'var(--green)' }} />
                <span>{tausiUrl}</span>
              </div>

              <Button aria-label="Reload portal" variant="ghost" size="icon"
                type="button"
                onClick={() => setIframeKey(k => k + 1)}
                style={{color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                title="Reload portal"
               >
                <Icon name="refresh" size={14} />
              </Button>

              <Button aria-label="Open in new browser tab" variant="ghost" size="icon"
                type="button"
                onClick={openNativeTausi}
                style={{color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                title="Open in new browser tab"
               >
                <Icon name="externalLink" size={14} />
              </Button>

              <Button variant="default" size="sm"
                type="button"

                onClick={handleCaptureInAppBrowser}
                disabled={uploading}
                style={{display: 'inline-flex', alignItems: 'center', gap: 6}}
               >
                <span style={uploading ? { display: 'inline-flex', animation: 'ds-spin 1s linear infinite' } : { display: 'inline-flex' }}>
                  <Icon name={uploading ? 'refresh' : 'zap'} size={13} />
                </span>
                <span>{uploading ? 'Capturing...' : 'Capture licence tab'}</span>
              </Button>
            </div>

            {/* Portal Banner Note */}
            <div style={{ background: 'var(--surface2)', padding: '6px 14px', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Portal preview only. Capture requires selecting the signed-in Tausi tab.
              </span>
              <Button variant="ghost" size="sm" onClick={() => setIsTausiLoginDialogOpen(true)}>
                Pop out dialog ↗
              </Button>
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
        <Card className="comply-card">
          <div className="comply-card-hdr" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="comply-card-title" style={{ fontSize: 18, fontWeight: 900 }}>{resultData.taxpayer?.name || 'Unknown taxpayer'}</h2>
                <Badge variant={complyBadgeVariant("comply-badge comply-badge--active")} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" style={{ width: 12, height: 12 }} /> Extracted · review before saving
                </Badge>
              </div>
              <p className="comply-page-sub" style={{ margin: '4px 0 0' }}>Council: {resultData.taxpayer?.registered_council || '—'} &bull; TIN: {resultData.taxpayer?.tin || '—'}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <Icon name="refresh" style={{ marginRight: 6 }} /> Return to Portal / Capture More
            </Button>
          </div>

          {/* Simulated-data disclosure — CompObligation (levies) has no
              notes/metadata field to carry this once imported, unlike
              certificates below, so this banner is the one place a levy
              import gets flagged as demo data at all. Shown regardless of
              which results tab is active. */}
          {simulated && (
            <div style={{ margin: '0 24px', padding: '10px 14px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r-sm)', color: 'var(--gold)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alertTriangle" style={{ width: 14, height: 14, flexShrink: 0 }} />
              Demo output cannot be saved. Capture or upload a real licence statement to continue.
            </div>
          )}

          {/* Results Tabs */}
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}  style={{ padding: '0 24px' }}>
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
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Review every extracted field against the source before saving. Existing licence numbers are skipped without overwriting their records.</div>
                  {licensesSaved ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--comply)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ✓ Synced to Permits Vault
                    </span>
                  ) : (
                    <Button type="button" size="sm" onClick={handleImportLicenses} disabled={savingLicense || simulated || !reviewed || !resultData.licenses?.length}>
                      {savingLicense ? 'Saving…' : 'Save reviewed licences'}
                    </Button>
                  )}
                </div>
                {saveResult&&<Banner variant="success">{saveResult.created} licences saved; {saveResult.skipped} existing records kept. <Link to="/complyos/vault">Open permit vault</Link></Banner>}
                {!licensesSaved&&<div style={{marginBottom:16}}><ComplyCustomerPicker value={customerId} onChange={setCustomerId}/><label style={{display:'flex',gap:8,alignItems:'center'}}><Checkbox disabled={savingLicense} checked={reviewed} onCheckedChange={value=>setReviewed(value===true)}/>I reviewed the licence numbers, dates and costs against the source.</label></div>}
                {!resultData.licenses?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No license records found.</div>
                ) : (
                <Table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <TableHeader>
                    <TableRow style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>License Name</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>Ref Number</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>LGA Council</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>Issued Date</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>Expiry Date</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'right' }}>Cost (TZS)</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'center' }}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultData.licenses.map((lic: any, idx: number) => (
                      <TableRow key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <TableCell data-label="License Name" style={{ padding: '12px', fontWeight: 600 }}><Input aria-label={`Licence name ${idx+1}`} disabled={licensesSaved||savingLicense} value={lic.name} onChange={e=>editLicense(idx,'name',e.target.value)}/></TableCell>
                        <TableCell data-label="Ref Number" style={{ padding: '12px', color: 'var(--ink2)', fontFamily: 'monospace' }}><Input aria-label={`Licence number ${idx+1}`} disabled={licensesSaved||savingLicense} value={lic.license_number} onChange={e=>editLicense(idx,'license_number',e.target.value)}/></TableCell>
                        <TableCell data-label="LGA Council" style={{ padding: '12px', color: 'var(--ink2)' }}><Input aria-label={`Council ${idx+1}`} disabled={licensesSaved||savingLicense} value={lic.lga} onChange={e=>editLicense(idx,'lga',e.target.value)}/></TableCell>
                        <TableCell data-label="Issued Date"><DatePicker date={lic.issued_date?new Date(lic.issued_date+'T00:00:00'):undefined} onChange={value=>editLicense(idx,'issued_date',value?toDateOnlyString(value):null)} disabled={licensesSaved||savingLicense}/></TableCell>
                        <TableCell data-label="Expiry Date" style={{ padding: '12px', color: 'var(--ink3)' }}><DatePicker date={lic.expiry_date?new Date(lic.expiry_date+'T00:00:00'):undefined} onChange={value=>editLicense(idx,'expiry_date',value?toDateOnlyString(value):null)} disabled={licensesSaved||savingLicense}/></TableCell>
                        <TableCell data-label="Cost (TZS)" style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}><Input type="number" min="0" step="0.01" aria-label={`Licence cost ${idx+1}`} disabled={licensesSaved||savingLicense} value={lic.cost??''} onChange={e=>editLicense(idx,'cost',e.target.value===''?null:Number(e.target.value))}/></TableCell>
                        <TableCell data-label="Status" style={{ padding: '12px', textAlign: 'center' }}>
                          <Badge variant={complyBadgeVariant(`comply-badge comply-badge--${lic.status === 'Active' ? 'active' : 'expired'}`)}>
                            {lic.status || 'Active'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                    <Button type="button" variant="outline" size="sm" onClick={handleRegisterLevies} disabled={savingLevies || !resultData.levies?.length}>
                      {savingLevies ? 'Registering...' : 'Register Levies'}
                    </Button>
                  )}
                </div>
                {!resultData.levies?.length ? (
                  <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>No levy records found.</div>
                ) : (
                <Table className="comply-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <TableHeader>
                    <TableRow style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>Levy Item</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>GePG Control Number</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'left' }}>Due Date</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</TableHead>
                      <TableHead style={{ padding: '10px 12px', textAlign: 'center' }}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultData.levies.map((lev: any, idx: number) => (
                      <TableRow key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <TableCell data-label="Levy Item" style={{ padding: '12px', fontWeight: 600 }}>{lev.name}</TableCell>
                        <TableCell data-label="GePG Control Number" style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 600 }}>{lev.control_number}</TableCell>
                        <TableCell data-label="Due Date" style={{ padding: '12px', color: 'var(--ink3)' }}>{lev.due_date}</TableCell>
                        <TableCell data-label="Amount" style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{Number(lev.amount || 0).toLocaleString()} TZS</TableCell>
                        <TableCell data-label="Status" style={{ padding: '12px', textAlign: 'center' }}>
                          <Badge variant={complyBadgeVariant("comply-badge comply-badge--pending")}>
                            {lev.status || 'Pending Payment'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                )}
              </div>
            )}

            {/* Tab 3: Profile */}
            {activeTab === 'profile' && (
              <div className="comply-grid-2" style={{ marginBottom: 0 }}>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>Council Association</h3>
                  <Table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <TableBody>
                      <TableRow style={{ borderBottom: '1px solid var(--border)' }}><TableCell data-label="Details" style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Linked Council</TableCell><TableCell data-label="Details" style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.registered_council || '—'}</TableCell></TableRow>
                      <TableRow style={{ borderBottom: '1px solid var(--border)' }}><TableCell data-label="Details" style={{ padding: '8px 0', color: 'var(--ink2)' }}>Region</TableCell><TableCell data-label="Details" style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.region || '—'}</TableCell></TableRow>
                      <TableRow style={{ borderBottom: '1px solid var(--border)' }}><TableCell data-label="Details" style={{ padding: '8px 0', color: 'var(--ink2)' }}>TIN Number</TableCell><TableCell data-label="Details" style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.tin || '—'}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.05em', marginBottom: 12 }}>LGA Account Details</h3>
                  <Table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <TableBody>
                      <TableRow style={{ borderBottom: '1px solid var(--border)' }}><TableCell data-label="Details" style={{ padding: '8px 0', color: 'var(--ink2)', width: 140 }}>Account Name</TableCell><TableCell data-label="Details" style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.name || '—'}</TableCell></TableRow>
                      <TableRow style={{ borderBottom: '1px solid var(--border)' }}><TableCell data-label="Details" style={{ padding: '8px 0', color: 'var(--ink2)' }}>NIDA Number</TableCell><TableCell data-label="Details" style={{ padding: '8px 0', fontWeight: 600 }}>{resultData.taxpayer?.nin || '—'}</TableCell></TableRow>
                    </TableBody>
                  </Table>
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
                  <Card key={idx} className="comply-card" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <div className="comply-card-hdr" style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
                        <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>{wf.name}</h4>
                      </div>
                      <Badge variant={complyBadgeVariant("comply-badge comply-badge--active")} style={{ fontSize: 10.5 }}>Suggested</Badge>
                    </div>
                    <div style={{ padding: 20 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--ink2)', margin: '0 0 16px' }}>{wf.description}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {wf.steps.map((st: any) => (
                          <div key={st.order} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, background: 'var(--white)', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                            <span style={{ display: 'flex', width: 18, height: 18, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 10, fontWeight: 700, alignItems: 'center', justifyContent: 'center' }}>
                              {st.order}
                            </span>
                            <span style={{ flex: 1, color: 'var(--ink)' }}>{st.name}</span>
                            <Badge variant={complyBadgeVariant("comply-firm-tag")} style={{ fontSize: 10 }}>{st.type}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

          </div>
        </Card>
      )}

      {/* TAUSI LOGIN DIALOG MODAL (tausi-login-dialog) */}
      <Dialog open={isTausiLoginDialogOpen} onOpenChange={setIsTausiLoginDialogOpen}>
          <DialogContent size="xl" className="tausi-login-dialog overflow-hidden p-0">
            {/* Modal Header */}
            <DialogHeader className="flex-row items-center justify-between" style={{ background: 'var(--ink)', borderColor: 'var(--border)', color: 'var(--white)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Icon name="lock" size={18} style={{ color: 'var(--green)' }} />
                <DialogTitle className="onsite-modal-title" style={{ color: 'var(--white)', fontSize: '1.05rem' }}>
                  Tausi (TAMISEMI) Portal Login &amp; Extraction
                </DialogTitle>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCaptureInAppBrowser}
                  disabled={uploading}
                >
                  <span style={uploading ? { display: 'inline-flex', animation: 'ds-spin 1s linear infinite' } : { display: 'inline-flex' }}>
                    <Icon name={uploading ? 'refresh' : 'zap'} size={13} />
                  </span>
                  <span>{uploading ? 'Capturing...' : 'Capture licence tab'}</span>
                </Button>
              </div>
            </DialogHeader>

            {/* Modal Subheader */}
            <div style={{ background: 'var(--ink)', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace' }}>URL: {tausiUrl}</span>
              <Button type="button" variant="link" size="sm" onClick={openNativeTausi}>
                Open in new tab ↗
              </Button>
            </div>

            {/* Modal Body: Embedded Interactive Tausi IFrame */}
            <DialogBody className="p-0">
              <iframe
                src={tausiUrl}
                title="Tausi Portal Login Dialog"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </DialogBody>
          </DialogContent>
      </Dialog>
    </div>
  );
}
