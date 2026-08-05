import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { Workflow, WorkflowStep, FieldCondition, AutoComm } from './ClearanceWorkflowList.js';
import type { CreateWorkflowInput } from '@hudumika/types';
import { COUNTRIES } from '@hudumika/types';
import { Icon, type IconName } from '../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { MultiSelectFilter } from '../../components/ui/filter-dropdown.js';
import { showAlert } from '../../lib/alert.js';
import './Workflows.css';
import { ClearanceWorkflowInsights } from './ClearanceWorkflowInsights.js';
import { showConfirm } from '../../lib/confirm.js';

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

/* ══ Layout constants ═══════════════════════════════════════ */
const NW = 240;  /* node width  */
const NH = 126;  /* node height */
const HG = 90;   /* horizontal gap */
const VG = 54;   /* vertical gap   */
const PAD = 64;  /* canvas padding  */

/* ══ Auto-layout ════════════════════════════════════════════ */
function computeLayout(steps: WorkflowStep[]): Record<string, {x:number; y:number}> {
  if (!steps.length) return {};
  const sorted = [...steps].sort((a,b) => a.order - b.order);
  const start  = sorted.find(s => s.isStart) ?? sorted[0];

  const colOf: Record<string,number> = {};
  const rowOf: Record<string,number> = {};
  const colCount: Record<number,number> = {};
  const q: {id:string; col:number}[] = [{id: start.id, col: 0}];
  const seen = new Set<string>();

  while (q.length) {
    const {id, col} = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const row = colCount[col] ?? 0;
    colOf[id] = col; rowOf[id] = row; colCount[col] = row + 1;
    steps.find(x => x.id === id)?.nextStepIds.forEach(nid => {
      if (!seen.has(nid)) q.push({id: nid, col: col + 1});
    });
  }
  /* unreachable steps get appended in order */
  sorted.forEach(s => {
    if (seen.has(s.id)) return;
    const maxCol = Object.values(colOf).length ? Math.max(...Object.values(colOf)) + 1 : 0;
    colOf[s.id] = maxCol; rowOf[s.id] = colCount[maxCol] ?? 0;
    colCount[maxCol] = (colCount[maxCol] ?? 0) + 1;
  });

  const maxRows = Math.max(1, ...Object.values(colCount));
  const pos: Record<string, {x:number; y:number}> = {};
  steps.forEach(s => {
    const col = colOf[s.id] ?? 0;
    const row = rowOf[s.id] ?? 0;
    const colRows = colCount[col] ?? 1;
    const colH   = colRows * (NH + VG) - VG;
    const totalH  = maxRows * (NH + VG) - VG;
    pos[s.id] = {
      x: PAD + col * (NW + HG),
      y: PAD + (totalH - colH) / 2 + row * (NH + VG),
    };
  });
  return pos;
}

function canvasSize(pos: Record<string, {x:number; y:number}>) {
  if (!Object.keys(pos).length) return {w:900, h:540};
  let mx = 0, my = 0;
  Object.values(pos).forEach(({x,y}) => { mx = Math.max(mx,x); my = Math.max(my,y); });
  return { w: mx + NW + PAD, h: my + NH + PAD };
}

function bezier(x1:number, y1:number, x2:number, y2:number) {
  const cx = x1 + (x2-x1)*0.5;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

/* ══ Constants ══════════════════════════════════════════════ */
// Values here must be either a real shipment_cases column name, or the
// "document:<DocumentType>" convention — both are exactly what
// evaluateEntryConditions (apps/api/src/services/workflow-resolver.service.ts)
// actually checks against. An earlier version of this list offered field
// names with no backing column (invoice_value, duty_amount, pod, ...), which
// meant any condition built from them could never be satisfied.
const SHIPMENT_FIELDS = [
  {value:'bl_number',            label:'Bill of Lading Number'},
  {value:'awb_number',           label:'Air Waybill Number'},
  {value:'hs_code',              label:'HS Code'},
  {value:'vessel',               label:'Vessel / Flight Name'},
  {value:'eta',                  label:'ETA Date'},
  {value:'gross_weight_kg',      label:'Gross Weight (kg)'},
  {value:'cif_value_usd',        label:'CIF Invoice Value (USD)'},
  {value:'tancis_ref',           label:'TANCIS Reference'},
  {value:'tansad_number',        label:'TANSAD Declaration Number'},
  {value:'declaration_id',       label:'Customs Declaration ID'},
  {value:'selectivity_channel',  label:'Selectivity Channel'},
  {value:'free_time_end',        label:'Demurrage Free Time End'},
  {value:'document:BL',            label:'Document: Bill of Lading (Verified)'},
  {value:'document:AWB',           label:'Document: Air Waybill (Verified)'},
  {value:'document:INVOICE',       label:'Document: Commercial Invoice (Verified)'},
  {value:'document:PACKING_LIST',  label:'Document: Packing List (Verified)'},
  {value:'document:PERMIT',        label:'Document: Regulatory Permit (Verified)'},
  {value:'document:CERTIFICATE',   label:'Document: Certificate of Origin (Verified)'},
  {value:'document:CUSTOMS_ENTRY', label:'Document: Customs Entry Form (Verified)'},
  {value:'document:DUTY_RECEIPT',  label:'Document: Duty Payment Receipt (Verified)'},
  {value:'document:RELEASE_ORDER', label:'Document: Release Order (Verified)'},
  {value:'document:DELIVERY_NOTE', label:'Document: Delivery Note (Verified)'},
];

const OPERATORS: {value: FieldCondition['operator']; label: string}[] = [
  {value:'required',     label:'Must be present'},
  {value:'not_empty',    label:'Not empty'},
  {value:'equals',       label:'Equals'},
  {value:'greater_than', label:'Greater than'},
  {value:'less_than',    label:'Less than'},
  {value:'contains',     label:'Contains'},
];

const CHANNELS: {value: AutoComm['channel']; label: string; icon: IconName; color: string}[] = [
  {value:'email',               label:'Email',               icon:'mail',          color:'#DBEAFE'},
  {value:'sms',                 label:'SMS',                 icon:'messageSquare', color:'#DCFCE7'},
  {value:'whatsapp',            label:'WhatsApp',            icon:'smartphone',    color:'#DCFCE7'},
  {value:'system_notification', label:'System Notification', icon:'bell',          color:'#FEF3C7'},
  {value:'webhook',             label:'Webhook',              icon:'link',         color:'#F3E8FF'},
];

const RECIPIENTS: {value: AutoComm['recipient']; label: string}[] = [
  {value:'customer',       label:'Customer'},
  {value:'assigned_agent', label:'Assigned Agent'},
  {value:'manager',        label:'Operations Manager'},
  {value:'custom_email',   label:'Custom Email'},
];

const TEMPLATE_VARS = ['{{ref}}','{{customer_name}}','{{vessel}}','{{eta}}','{{duty_amount}}','{{agent_name}}','{{current_step}}'];
const STEP_COLORS   = ['#0d9488','#2563eb','#d97706','#059669','#7c3aed','#ea580c','#db2777','#0369a1'];
const FREIGHT_MODES = ['sea','air','road','rail','multimodal'];
const CONSIGNMENT_TYPES = ['import','export','transit','re-export','warehousing'];
const FREIGHT_MODE_ICON: Record<string, IconName> = {
  sea: 'ship', air: 'plane', road: 'truck', rail: 'train', multimodal: 'globe',
};

// COUNTRIES now lives in @hudumika/types so the API's declaration prefill and
// this builder read one list rather than two that drift.

function makeStep(order: number, isFirst = false): WorkflowStep {
  // isTerminal is recomputed from nextStepIds.length===0 at save time (see
  // buildSavePayload) — it mirrors that derivation rather than being a
  // separately-edited field, so a placeholder value here is fine.
  return {id:uid(), workflowId:'', name:`Step ${order}`, description:'', order, isStart:isFirst, isTerminal:false, nextStepIds:[], entryConditions:[], autoComms:[], color:STEP_COLORS[(order-1)%STEP_COLORS.length]};
}
function makeWorkflow(): Workflow {
  const step = makeStep(1, true);
  // id/tenantId/createdAt/updatedAt are server-assigned and stay empty on an
  // unsaved draft — handleSave POSTs a CreateWorkflowInput (which has none
  // of these fields) rather than this raw object, so the placeholders are
  // never actually sent anywhere.
  return {id:'', tenantId:'', name:'New Workflow', description:'', isActive:true, isDefault:false, createdAt:'', updatedAt:'', steps:[step], triggers:{freightModes:[],consignmentTypes:[],customerIds:[],originCountries:[],destinationCountries:[],isDefault:false}};
}

function buildSavePayload(wf: Workflow): CreateWorkflowInput {
  return {
    name: wf.name,
    description: wf.description,
    isActive: wf.isActive,
    isDefault: wf.isDefault,
    triggers: wf.triggers,
    steps: wf.steps.map(s => ({ ...s, isTerminal: s.nextStepIds.length === 0 })),
  };
}

/* ══ Tiny SVG icon ══════════════════════════════════════════ */
function I({n,s=14,c='currentColor'}:{n:string;s?:number;c?:string}) {
  const P: Record<string, React.ReactElement> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    save:      <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    plus:      <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:     <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    x:         <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    chevDown:  <polyline points="6 9 12 15 18 9"/>,
    chevUp:    <polyline points="18 15 12 9 6 15"/>,
    check:     <polyline points="20 6 9 17 4 12"/>,
    zoomIn:    <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></>,
    zoomOut:   <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></>,
    fit:       <><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M21 8V5a2 2 0 00-2-2h-3"/><path d="M3 16v3a2 2 0 002 2h3"/><path d="M16 21h3a2 2 0 002-2v-3"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>,
    zap:       <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    lock:      <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
    dot3:      <><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
    layers:    <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{P[n] ?? <circle cx="12" cy="12" r="5"/>}</svg>;
}

function Toggle({on,set}:{on:boolean; set:(v:boolean)=>void}) {
  return <label className="wfb-toggle"><input type="checkbox" checked={on} onChange={e=>set(e.target.checked)}/><span className="wfb-toggle-slider"/></label>;
}

/* ══ Right Panel ════════════════════════════════════════════ */
interface RPProps {
  wf: Workflow;
  step: WorkflowStep | null;
  allSteps: WorkflowStep[];
  customers: {id:string; name:string}[];
  onUpdateStep: (id:string, p:Partial<WorkflowStep>) => void;
  onDeleteStep: (id:string) => void;
  onUpdateWf: (p:Partial<Workflow>) => void;
  onClose: () => void;
}

function RightPanel({wf, step, allSteps, customers, onUpdateStep, onDeleteStep, onUpdateWf, onClose}: RPProps) {
  const [open, setOpen] = useState(new Set(['basics','transitions','conditions','comms']));
  const tog = (k:string) => setOpen(prev => { const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n; });
  const isOpen = (k:string) => open.has(k);

  /* ─ No step selected → workflow settings ─ */
  if (!step) return (
    <div className="wfb-right-panel">
      <div className="wfb-panel-head">
        <I n="settings" s={15} c="var(--ink3)"/>
        <span className="wfb-panel-title">Workflow Settings</span>
        <button className="wf-icon-btn" onClick={onClose}><I n="x" s={13}/></button>
      </div>
      <div className="wfb-panel-body">
        <div className="wfb-panel-section">
          <div className="wfb-panel-section-title">Identity</div>
          <div className="wfb-field" style={{marginBottom:10}}>
            <label className="wfb-label">Workflow Name</label>
            <input className="wfb-input" value={wf.name} onChange={e=>onUpdateWf({name:e.target.value})} style={{fontSize:13}}/>
          </div>
          <div className="wfb-field">
            <label className="wfb-label">Description</label>
            <textarea className="wfb-textarea" rows={2} value={wf.description} onChange={e=>onUpdateWf({description:e.target.value})} style={{fontSize:12,minHeight:60}}/>
          </div>
        </div>
        <div className="wfb-panel-section">
          <div className="wfb-panel-section-title">Settings</div>
          <div className="wfb-toggle-row" style={{marginBottom:8}}><div><div className="wfb-toggle-label">Active</div><div className="wfb-toggle-sub">Assign to new shipments</div></div><Toggle on={wf.isActive} set={v=>onUpdateWf({isActive:v})}/></div>
          <div className="wfb-toggle-row"><div><div className="wfb-toggle-label">Default Fallback</div><div className="wfb-toggle-sub">Use when no trigger matches</div></div><Toggle on={wf.isDefault} set={v=>onUpdateWf({isDefault:v})}/></div>
        </div>
        <div className="wfb-panel-section">
          <div className="wfb-panel-section-title">Freight Modes</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {FREIGHT_MODES.map(m=><div key={m} className={`wfb-tag-pill ${wf.triggers.freightModes.includes(m)?'sel':''}`} style={{display:'inline-flex',alignItems:'center',gap:5}} onClick={()=>{const a=wf.triggers.freightModes;onUpdateWf({triggers:{...wf.triggers,freightModes:a.includes(m)?a.filter(x=>x!==m):[...a,m]}});}}><Icon name={FREIGHT_MODE_ICON[m]} size={12} /> {m}</div>)}
          </div>
        </div>
        <div className="wfb-panel-section">
          <div className="wfb-panel-section-title">Consignment Types</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {CONSIGNMENT_TYPES.map(c=><div key={c} className={`wfb-tag-pill ${wf.triggers.consignmentTypes.includes(c)?'sel':''}`} onClick={()=>{const a=wf.triggers.consignmentTypes;onUpdateWf({triggers:{...wf.triggers,consignmentTypes:a.includes(c)?a.filter(x=>x!==c):[...a,c]}});}}>{c}</div>)}
          </div>
        </div>
        <div className="wfb-panel-section">
          <div className="wfb-panel-section-title">Customers</div>
          <div style={{fontSize:11,color:'var(--ink3)',marginBottom:8}}>Restrict this workflow to specific customers (leave empty to match any)</div>
          <MultiSelectFilter
            label="Customers"
            icon={<Icon name="users" size={14} />}
            options={customers.map(c=>({value:c.id, label:c.name}))}
            values={wf.triggers.customerIds}
            onChange={ids=>onUpdateWf({triggers:{...wf.triggers, customerIds:ids}})}
          />
        </div>
        <div className="wfb-panel-section">
          <div className="wfb-panel-section-title">Countries</div>
          <div style={{fontSize:11,color:'var(--ink3)',marginBottom:8}}>Restrict by origin/destination country (matched against the shipment's port codes)</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            <MultiSelectFilter
              label="Origin"
              icon={<Icon name="mapPin" size={14} />}
              options={COUNTRIES.map(c=>({value:c.code, label:c.name}))}
              values={wf.triggers.originCountries}
              onChange={codes=>onUpdateWf({triggers:{...wf.triggers, originCountries:codes}})}
            />
            <MultiSelectFilter
              label="Destination"
              icon={<Icon name="flag" size={14} />}
              options={COUNTRIES.map(c=>({value:c.code, label:c.name}))}
              values={wf.triggers.destinationCountries}
              onChange={codes=>onUpdateWf({triggers:{...wf.triggers, destinationCountries:codes}})}
            />
          </div>
        </div>
      </div>
    </div>
  );

  /* ─ Step selected → step config ─ */
  const uid2 = () => `${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
  const addCond = () => onUpdateStep(step.id, {entryConditions:[...step.entryConditions,{id:uid2(),field:'bl_number',operator:'required',label:'Bill of Lading Number',value:''}]});
  const updCond = (cid:string, p:Partial<FieldCondition>) => onUpdateStep(step.id, {entryConditions:step.entryConditions.map(c=>c.id===cid?{...c,...p}:c)});
  const delCond = (cid:string) => onUpdateStep(step.id, {entryConditions:step.entryConditions.filter(c=>c.id!==cid)});
  const addComm = () => onUpdateStep(step.id, {autoComms:[...step.autoComms,{id:uid2(),channel:'email',recipient:'customer',customEmail:'',subject:'',template:'',delayMinutes:0}]});
  const updComm = (cid:string, p:Partial<AutoComm>) => onUpdateStep(step.id, {autoComms:step.autoComms.map(c=>c.id===cid?{...c,...p}:c)});
  const delComm = (cid:string) => onUpdateStep(step.id, {autoComms:step.autoComms.filter(c=>c.id!==cid)});
  const others  = allSteps.filter(s=>s.id!==step.id).sort((a,b)=>a.order-b.order);

  return (
    <div className="wfb-right-panel">
      {/* Header */}
      <div className="wfb-panel-head">
        <div className="wfb-panel-step-dot" style={{background:step.color}}>{step.order}</div>
        <span className="wfb-panel-title">{step.name}</span>
        <button className="wf-icon-btn danger" title="Delete step" onClick={()=>onDeleteStep(step.id)}><I n="trash" s={13}/></button>
        <button className="wf-icon-btn" onClick={onClose}><I n="x" s={13}/></button>
      </div>
      <div className="wfb-panel-body">

        {/* BASICS */}
        <div className="wfb-acc">
          <div className="wfb-acc-head" onClick={()=>tog('basics')}>
            <span className="wfb-acc-title">Step Details</span>
            <I n={isOpen('basics')?'chevUp':'chevDown'} s={13} c="var(--ink3)"/>
          </div>
          {isOpen('basics')&&<div className="wfb-acc-body">
            <div className="wfb-field">
              <label className="wfb-label">Name</label>
              <input className="wfb-input" style={{fontSize:13}} value={step.name} onChange={e=>onUpdateStep(step.id,{name:e.target.value})} placeholder="Step name"/>
            </div>
            <div className="wfb-field">
              <label className="wfb-label">Description</label>
              <textarea className="wfb-textarea" rows={2} style={{fontSize:12,minHeight:56}} value={step.description} onChange={e=>onUpdateStep(step.id,{description:e.target.value})} placeholder="What happens here?"/>
            </div>
            <div className="wfb-field">
              <label className="wfb-label">SLA (hours optional)</label>
              <input className="wfb-input" style={{fontSize:13}} type="number" min="0" value={step.slaHours??''} onChange={e=>onUpdateStep(step.id,{slaHours:e.target.value?Number(e.target.value):undefined})} placeholder="No SLA"/>
            </div>
            <div className="wfb-field">
              <label className="wfb-label">Color</label>
              <div className="wfb-color-row">{STEP_COLORS.map(c=><div key={c} className={`wfb-color-dot ${step.color===c?'sel':''}`} style={{background:c}} onClick={()=>onUpdateStep(step.id,{color:c})}/>)}</div>
            </div>
            <div className="wfb-toggle-row">
              <div><div className="wfb-toggle-label">Start Step</div><div className="wfb-toggle-sub">First step in this workflow</div></div>
              <Toggle on={step.isStart} set={v=>onUpdateStep(step.id,{isStart:v})}/>
            </div>
          </div>}
        </div>

        {/* TRANSITIONS */}
        <div className="wfb-acc">
          <div className="wfb-acc-head" onClick={()=>tog('transitions')}>
            <span className="wfb-acc-title">Transitions {step.nextStepIds.length>0&&<span className="wfb-acc-badge">{step.nextStepIds.length}</span>}</span>
            <I n={isOpen('transitions')?'chevUp':'chevDown'} s={13} c="var(--ink3)"/>
          </div>
          {isOpen('transitions')&&<div className="wfb-acc-body">
            <div style={{fontSize:11,color:'var(--ink3)',marginBottom:6}}>Steps that can follow this one (select all valid transitions)</div>
            {others.length===0?(<div style={{fontSize:12,color:'var(--ink3)'}}>Add more steps to configure transitions.</div>):
              others.map(s=>{const sel=step.nextStepIds.includes(s.id); return (
                <div key={s.id} className={`wfb-trans-item ${sel?'sel':''}`} onClick={()=>onUpdateStep(step.id,{nextStepIds:sel?step.nextStepIds.filter(n=>n!==s.id):[...step.nextStepIds,s.id]})}>
                  <div className="wfb-trans-check">{sel&&<I n="check" s={9} c="white"/>}</div>
                  <span style={{width:8,height:8,borderRadius:'50%',background:s.color,display:'inline-block',flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--navy)'}}>{s.name}</span>
                </div>
              );})}
            {step.nextStepIds.length===0&&<div style={{marginTop:4,fontSize:11,color:'var(--ink3)'}}>No transitions — this is a terminal step.</div>}
          </div>}
        </div>

        {/* ENTRY CONDITIONS */}
        <div className="wfb-acc">
          <div className="wfb-acc-head" onClick={()=>tog('conditions')}>
            <span className="wfb-acc-title"><I n="lock" s={12} c="var(--ink3)"/>Entry Conditions {step.entryConditions.length>0&&<span className="wfb-acc-badge">{step.entryConditions.length}</span>}</span>
            <I n={isOpen('conditions')?'chevUp':'chevDown'} s={13} c="var(--ink3)"/>
          </div>
          {isOpen('conditions')&&<div className="wfb-acc-body">
            <div style={{fontSize:11,color:'var(--ink3)',marginBottom:6}}>Fields required on the shipment card before entering this step</div>
            {step.entryConditions.map(cond=>(
              <div key={cond.id} className="wfb-cond-card">
                <div className="wfb-cond-row">
                  <Select value={cond.field} onValueChange={v=>{const f=SHIPMENT_FIELDS.find(x=>x.value===v);updCond(cond.id,{field:v,label:f?.label??v});}}>
                    <SelectTrigger className="h-11 text-sm" style={{fontSize:13.5,flex:1}}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIPMENT_FIELDS.map(f=><SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button className="wf-icon-btn danger" style={{flexShrink:0,width:26,height:26}} onClick={()=>delCond(cond.id)}><I n="trash" s={11}/></button>
                </div>
                <Select value={cond.operator} onValueChange={v=>updCond(cond.id,{operator:v as FieldCondition['operator']})}>
                  <SelectTrigger className="h-11 text-sm" style={{fontSize:13.5}}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {['equals','greater_than','less_than','contains'].includes(cond.operator)&&(
                  <input className="wfb-input" style={{fontSize:11.5,padding:'5px 8px'}} value={cond.value??''} onChange={e=>updCond(cond.id,{value:e.target.value})} placeholder="Value"/>
                )}
              </div>
            ))}
            <button className="wfb-btn-ghost wfb-btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={addCond}><I n="plus" s={12}/> Add Condition</button>
          </div>}
        </div>

        {/* AUTO-COMMS */}
        <div className="wfb-acc">
          <div className="wfb-acc-head" onClick={()=>tog('comms')}>
            <span className="wfb-acc-title"><I n="zap" s={12} c="var(--ink3)"/>Auto-Comms {step.autoComms.length>0&&<span className="wfb-acc-badge">{step.autoComms.length}</span>}</span>
            <I n={isOpen('comms')?'chevUp':'chevDown'} s={13} c="var(--ink3)"/>
          </div>
          {isOpen('comms')&&<div className="wfb-acc-body">
            <div style={{fontSize:11,color:'var(--ink3)',marginBottom:6}}>Triggered when a shipment enters this step</div>
            {step.autoComms.map(comm=>{
              const ch=CHANNELS.find(c=>c.value===comm.channel);
              return <div key={comm.id} className="wfb-comm-card">
                <div className="wfb-comm-card-head">
                  <span className="wfb-comm-ch-badge" style={{background:ch?.color,display:'inline-flex',alignItems:'center',gap:4}}>{ch&&<Icon name={ch.icon} size={11} />} {ch?.label}</span>
                  <span style={{flex:1,fontSize:11,color:'var(--ink3)'}}>→ {RECIPIENTS.find(r=>r.value===comm.recipient)?.label}</span>
                  <button className="wf-icon-btn danger" style={{width:24,height:24}} onClick={()=>delComm(comm.id)}><I n="trash" s={11}/></button>
                </div>
                <div className="wfb-comm-card-body">
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                    <Select value={comm.channel} onValueChange={v=>updComm(comm.id,{channel:v as AutoComm['channel']})}>
                      <SelectTrigger className="h-11 text-sm" style={{fontSize:13.5}}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map(c=><SelectItem key={c.value} value={c.value}><Icon name={c.icon} size={12} /> {c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={comm.recipient} onValueChange={v=>updComm(comm.id,{recipient:v as AutoComm['recipient']})}>
                      <SelectTrigger className="h-11 text-sm" style={{fontSize:13.5}}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPIENTS.map(r=><SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {comm.recipient==='custom_email'&&<input className="wfb-input" style={{fontSize:11,padding:'5px 8px'}} type="email" value={comm.customEmail??''} onChange={e=>updComm(comm.id,{customEmail:e.target.value})} placeholder="email@example.com"/>}
                  {comm.channel==='email'&&<input className="wfb-input" style={{fontSize:11,padding:'5px 8px'}} value={comm.subject} onChange={e=>updComm(comm.id,{subject:e.target.value})} placeholder="Email subject…"/>}
                  <textarea className="wfb-textarea" style={{fontSize:11,minHeight:64,padding:'6px 8px'}} rows={3} value={comm.template} onChange={e=>updComm(comm.id,{template:e.target.value})} placeholder="Message template…"/>
                  <div className="wfb-var-chips">{TEMPLATE_VARS.map(v=><button key={v} className="wfb-var-chip" type="button" onClick={()=>updComm(comm.id,{template:comm.template+v})}>{v}</button>)}</div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:11,color:'var(--ink3)'}}>Delay:</span>
                    <input className="wfb-input" style={{fontSize:11,padding:'4px 8px',width:56}} type="number" min="0" value={comm.delayMinutes} onChange={e=>updComm(comm.id,{delayMinutes:Number(e.target.value)})}/>
                    <span style={{fontSize:11,color:'var(--ink3)'}}>min</span>
                  </div>
                </div>
              </div>;
            })}
            <button className="wfb-btn-ghost wfb-btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={addComm}><I n="plus" s={12}/> Add Communication</button>
          </div>}
        </div>
      </div>
    </div>
  );
}

/* ══ Main WorkflowBuilder Component ════════════════════════ */

export function ClearanceWorkflowBuilder() {
  const {id} = useParams<{id?:string}>();
  const navigate = useNavigate();

  const [wf, setWf] = useState<Workflow>(() => makeWorkflow());
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string|null>(null);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [zoom, setZoom]     = useState(0.9);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [panel, setPanel]   = useState(true);   /* right panel visible */
  const [insights, setInsights] = useState(false);
  const [insightsTab, setInsightsTab] = useState<'test'|'history'>('test');
  /* Serialized payload as last persisted. Test and History both read the SAVED
     workflow, so the drawer has to be able to say when you are looking at
     something other than what is on your canvas. */
  const [savedSnapshot, setSavedSnapshot] = useState<string|null>(null);
  const [customers, setCustomers] = useState<{id:string; name:string}[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/workflows/${id}`)
      .then((res: Workflow) => { setWf(res); setSavedSnapshot(JSON.stringify(buildSavePayload(res))); })
      .catch(err => setLoadError(err.message || 'Failed to load workflow'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    apiFetch('/v1/customers')
      .then((res: any) => setCustomers(Array.isArray(res) ? res : res.data ?? res.customers ?? []))
      .catch(() => setCustomers([]));
  }, []);

  /**
   * How many live shipments are sitting on each step.
   *
   * The thing that made this builder dangerous was that its steps look like a
   * diagram but are not one: shipment_cases.workflow_step_id points straight
   * at them, so deleting or reordering a step moves or strands real
   * consignments. Previously the only warning was a flat refusal at delete
   * time. Now the count sits on the node while it is being edited.
   */
  const [usage, setUsage] = useState<{ totalShipments: number; byStep: Record<string, number> }>({ totalShipments: 0, byStep: {} });
  useEffect(() => {
    if (!id) return;
    apiFetch(`/v1/workflows/${id}/usage`)
      .then((r: any) => setUsage({ totalShipments: r?.totalShipments ?? 0, byStep: r?.byStep ?? {} }))
      .catch(() => setUsage({ totalShipments: 0, byStep: {} }));  // a new workflow simply has none
  }, [id]);

  /* ── Wf mutations ── */
  const updateWf = useCallback((p: Partial<Workflow>) =>
    setWf(prev => ({...prev, ...p, updatedAt: new Date().toISOString()})), []);

  const updateStep = useCallback((sid: string, p: Partial<WorkflowStep>) =>
    setWf(prev => ({...prev, updatedAt: new Date().toISOString(), steps: prev.steps.map(s=>s.id===sid?{...s,...p}:s)})), []);

  const addStep = useCallback((afterId?: string, beforeId?: string) => {
    const ns = makeStep(wf.steps.length + 1, wf.steps.length === 0);
    setWf(prev => {
      let steps = [...prev.steps, ns];
      if (afterId) {
        steps = steps.map(s => {
          if (s.id !== afterId) return s;
          const nids = beforeId ? s.nextStepIds.filter(n=>n!==beforeId) : s.nextStepIds;
          return {...s, nextStepIds: [...nids, ns.id]};
        });
        if (beforeId) {
          const i = steps.findIndex(s=>s.id===ns.id);
          if (i>=0) steps[i] = {...steps[i], nextStepIds: [beforeId]};
        }
      }
      return {...prev, steps, updatedAt: new Date().toISOString()};
    });
    setSelectedId(ns.id);
  }, [wf.steps.length]);

  const appendAfter = useCallback((afterId: string) => {
    const ns = makeStep(wf.steps.length + 1, false);
    setWf(prev => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      steps: [...prev.steps.map(s=>s.id===afterId?{...s,nextStepIds:[...s.nextStepIds,ns.id]}:s), ns],
    }));
    setSelectedId(ns.id);
  }, [wf.steps.length]);

  const deleteStep = useCallback(async (sid: string) => {
    if (wf.steps.length <= 1) { showAlert('A workflow must have at least one step.'); return; }
    // Named consequences before the fact. A step is not a diagram element —
    // shipment_cases.workflow_step_id points at it — so deleting one with live
    // shipments on it moves real consignments somewhere else. The old prompt
    // said only "Delete this step?" and gave no way to know that.
    const live = usage.byStep[sid] ?? 0;
    const prompt = live > 0
      ? `Delete this step? ${live} shipment${live === 1 ? '' : 's'} ${live === 1 ? 'is' : 'are'} currently sitting on it. `
        + `Saving will be refused until ${live === 1 ? 'it is' : 'they are'} moved to another step.`
      : 'Delete this step?';
    if (!(await showConfirm(prompt, { confirmLabel: 'Delete' }))) return;
    setWf(prev => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      steps: prev.steps.filter(s=>s.id!==sid)
        .map((s,i)=>({...s, order:i+1, nextStepIds:s.nextStepIds.filter(n=>n!==sid)})),
    }));
    if (selectedId === sid) setSelectedId(null);
  }, [wf.steps.length, selectedId, usage]);

  const handleSave = async () => {
    if (!wf.name.trim()) { showAlert('Please give the workflow a name.'); return; }
    setSaving(true);
    try {
      const payload = buildSavePayload(wf);
      if (wf.id) {
        const result: Workflow = await apiFetch(`/v1/workflows/${wf.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setWf(result);
        setSavedSnapshot(JSON.stringify(buildSavePayload(result)));
      } else {
        const result: Workflow = await apiFetch('/v1/workflows', { method: 'POST', body: JSON.stringify(payload) });
        setWf(result);
        setSavedSnapshot(JSON.stringify(buildSavePayload(result)));
        navigate(`/studio/clearance/${result.id}`, { replace: true });
      }
      setSaved(true); setTimeout(()=>setSaved(false), 2200);
    } catch (err: any) {
      showAlert(err.message || 'Could not save this workflow.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived ── */
  const positions = useMemo(() => computeLayout(wf.steps), [wf.steps]);
  const {w: cW, h: cH} = useMemo(() => canvasSize(positions), [positions]);
  const selectedStep = wf.steps.find(s=>s.id===selectedId) ?? null;

  const connections = useMemo(() => {
    const c: {from:string; to:string}[] = [];
    wf.steps.forEach(s => s.nextStepIds.forEach(n => c.push({from:s.id, to:n})));
    return c;
  }, [wf.steps]);

  const terminalSteps = useMemo(() => wf.steps.filter(s=>s.nextStepIds.length===0), [wf.steps]);

  const dirty = useMemo(
    () => savedSnapshot !== null && JSON.stringify(buildSavePayload(wf)) !== savedSnapshot,
    [wf, savedSnapshot],
  );

  const zoomIn  = () => setZoom(z => Math.min(2,   +(z+0.1).toFixed(1)));
  const zoomOut = () => setZoom(z => Math.max(0.25, +(z-0.1).toFixed(1)));

  if (loading) {
    return <div className="wfb-page" style={{alignItems:'center', justifyContent:'center', display:'flex'}}>Loading workflow…</div>;
  }
  if (loadError) {
    return (
      <div className="wfb-page" style={{alignItems:'center', justifyContent:'center', display:'flex', flexDirection:'column', gap:12}}>
        <div style={{color:'var(--red)'}}>{loadError}</div>
        <button className="wfb-btn-ghost wfb-btn-sm" onClick={()=>navigate('/studio/clearance')}><I n="arrowLeft" s={13}/> Back to clearance workflows</button>
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="wfb-page">

      {/* ── Top bar ── */}
      <div className="wfb-topbar">
        <button className="wfb-btn-ghost wfb-btn-sm" onClick={()=>navigate('/studio/clearance')}>
          <I n="arrowLeft" s={13}/> Workflows
        </button>
        <span className="wfb-topbar-sep">/</span>
        <input
          className="wfb-topbar-name"
          value={wf.name}
          onChange={e=>updateWf({name:e.target.value})}
          placeholder="Workflow name"
          size={Math.max(16, wf.name.length)}
        />
        <div style={{flex:1}}/>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <Toggle on={wf.isActive} set={v=>updateWf({isActive:v})}/>
          <span style={{fontSize:12,color:'var(--ink3)',whiteSpace:'nowrap'}}>{wf.isActive?'Active':'Inactive'}</span>
        </div>
        {/* Rehearse and review \u2014 only once the workflow exists server-side,
            since both read the saved version by id. */}
        {wf.id && (
          <>
            <button className="wfb-btn-ghost wfb-btn-sm" onClick={()=>{setInsightsTab('test'); setInsights(true);}}>
              <Icon name="play" size={13}/> Dry run
            </button>
            <button className="wfb-btn-ghost wfb-btn-sm" onClick={()=>{setInsightsTab('history'); setInsights(true);}}>
              <Icon name="clock" size={13}/> History
            </button>
          </>
        )}
        <button className="wfb-btn-ghost wfb-btn-sm" onClick={()=>setPanel(p=>!p)}>
          <I n="layers" s={13}/> {panel?'Hide':'Panel'}
        </button>
        <button className="wfb-btn-primary" onClick={handleSave} disabled={saving}>
          <I n="save" s={13} c="white"/> {saving?'Saving\u2026':saved?'Saved \u2713':'Save'}
        </button>
      </div>

      {insights && wf.id && (
        <ClearanceWorkflowInsights
          workflowId={wf.id}
          initialTab={insightsTab}
          unsaved={dirty}
          onClose={()=>setInsights(false)}
        />
      )}

      {/* ── Main ── */}
      <div className="wfb-main">

        {/* ── Canvas area ── */}
        <div
          className="wfb-canvas-area"
          onClick={e => { if ((e.target as Element).closest('.wfb-node')) return; setSelectedId(null); }}
        >
          {/* Scrollable container sized to scaled canvas */}
          <div className="wfb-canvas-scroller" style={{width: cW*zoom, height: cH*zoom, minWidth:'100%', minHeight:'100%', position:'relative'}}>

            {/* Scaled canvas */}
            <div className="wfb-canvas-inner" style={{transform:`scale(${zoom})`, width:cW, height:cH, position:'absolute', top:0, left:0}}>

              {/* SVG connection layer */}
              <svg className="wfb-svg-layer" width={cW} height={cH}>
                <defs>
                  <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <polygon points="0 0,8 3,0 6" fill="var(--border2)"/>
                  </marker>
                  <marker id="arr-t" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <polygon points="0 0,8 3,0 6" fill="var(--teal)"/>
                  </marker>
                </defs>
                {connections.map(({from,to}) => {
                  const fp=positions[from]; const tp=positions[to];
                  if(!fp||!tp) return null;
                  const x1=fp.x+NW, y1=fp.y+NH/2, x2=tp.x, y2=tp.y+NH/2;
                  const hl = selectedId===from||selectedId===to;
                  return <path key={`${from}-${to}`}
                    d={bezier(x1,y1,x2,y2)} fill="none"
                    stroke={hl?'var(--teal)':'var(--border2)'}
                    strokeWidth={hl?2:1.5}
                    strokeDasharray={hl?'none':'none'}
                    markerEnd={hl?'url(#arr-t)':'url(#arr)'}
                  />;
                })}
              </svg>

              {/* + Add-between buttons (midpoint of each connection) */}
              {connections.map(({from,to}) => {
                const fp=positions[from]; const tp=positions[to];
                if(!fp||!tp) return null;
                const x1=fp.x+NW, y1=fp.y+NH/2, x2=tp.x, y2=tp.y+NH/2;
                const mx=(x1+x2)/2, my=(y1+y2)/2;
                return <button key={`add-${from}-${to}`} className="wfb-add-between"
                  style={{left:mx-11, top:my-11}} title="Insert step here"
                  onClick={e=>{e.stopPropagation(); addStep(from,to);}}>+</button>;
              })}

              {/* Append button after each terminal step */}
              {terminalSteps.map(s => {
                const fp=positions[s.id]; if(!fp) return null;
                return <button key={`app-${s.id}`} className="wfb-append-btn"
                  style={{left:fp.x+NW+28, top:fp.y+NH/2-14}}
                  onClick={e=>{e.stopPropagation(); appendAfter(s.id);}}>
                  <I n="plus" s={11}/> Add step
                </button>;
              })}

              {/* Nodes */}
              {wf.steps.map(step => {
                const pos=positions[step.id]; if(!pos) return null;
                const isEnd = step.nextStepIds.length===0;
                const isSel = selectedId===step.id;
                return (
                  <div
                    key={step.id}
                    className={`wfb-node${isSel?' wfb-node-selected':''}${step.isStart?' wfb-node-start':''}`}
                    style={{left:pos.x, top:pos.y}}
                    onClick={e=>{e.stopPropagation(); setSelectedId(prev=>prev===step.id?null:step.id); if(!panel) setPanel(true);}}
                  >
                    <div className="wfb-node-header">
                      <span className="wfb-node-color-dot" style={{background:step.color}}/>
                      <span className="wfb-node-type">{step.isStart?'Start \u2605':isEnd?'Terminal':'Step'}</span>
                      <span className="wfb-node-order">#{step.order}</span>
                    </div>
                    <div className="wfb-node-name">{step.name}</div>
                    {step.description&&<div className="wfb-node-desc">{step.description}</div>}
                    <div className="wfb-node-footer">
                      {/* Live shipments sitting on this step, right now. Shown
                          first because it is the one badge that changes what
                          you are allowed to do to the node. */}
                      {(usage.byStep[step.id] ?? 0) > 0 && (
                        <span className="wf-badge wf-badge-green" title={`${usage.byStep[step.id]} shipment${usage.byStep[step.id] === 1 ? ' is' : 's are'} on this step now — editing or deleting it will move them`}
                          style={{fontSize:9.5,padding:'1px 7px'}}>
                          <Icon name="package" size={9} /> {usage.byStep[step.id]} live
                        </span>
                      )}
                      {step.entryConditions.length>0&&<span className="wf-badge wf-badge-orange" style={{fontSize:9.5,padding:'1px 7px'}}><Icon name="lock" size={9} /> {step.entryConditions.length}</span>}
                      {step.autoComms.length>0&&<span className="wf-badge wf-badge-blue" style={{fontSize:9.5,padding:'1px 7px'}}><Icon name="zap" size={9} /> {step.autoComms.length}</span>}
                      {step.slaHours!=null&&<span className="wf-badge wf-badge-gray" style={{fontSize:9.5,padding:'1px 7px'}}><Icon name="timer" size={9} /> {step.slaHours}h</span>}
                    </div>
                  </div>
                );
              })}

              {/* Empty canvas placeholder */}
              {wf.steps.length===0&&(
                <div className="wfb-add-first">
                  <div style={{fontSize:13,color:'var(--ink3)'}}>No steps yet</div>
                  <button className="wfb-btn-primary" onClick={()=>addStep()}><I n="plus" s={13} c="white"/> Add First Step</button>
                </div>
              )}
            </div>
          </div>

          {/* Zoom bar */}
          <div className="wfb-zoom-bar">
            <button className="wfb-zoom-btn" onClick={zoomOut} title="Zoom out"><I n="zoomOut" s={13}/></button>
            <span className="wfb-zoom-label">{Math.round(zoom*100)}%</span>
            <button className="wfb-zoom-btn" onClick={zoomIn} title="Zoom in"><I n="zoomIn" s={13}/></button>
            <div className="wfb-zoom-divider"/>
            <button className="wfb-zoom-btn" onClick={()=>setZoom(1)} title="Reset to 100%"><I n="fit" s={13}/></button>
            <div className="wfb-zoom-divider"/>
            <button className="wfb-zoom-btn" style={{gap:5,fontSize:12,fontWeight:700,color:'var(--teal)',width:'auto',padding:'0 6px'}} onClick={()=>{setSelectedId(null); setPanel(true);}} title="Workflow settings">
              <I n="settings" s={12} c="var(--teal)"/>Settings
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        {panel&&(
          <RightPanel
            wf={wf}
            step={selectedStep}
            allSteps={wf.steps}
            customers={customers}
            onUpdateStep={updateStep}
            onDeleteStep={deleteStep}
            onUpdateWf={updateWf}
            onClose={()=>setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
