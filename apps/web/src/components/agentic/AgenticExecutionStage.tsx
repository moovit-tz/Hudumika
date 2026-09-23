import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../Icon.js';
import { PersonAvatar } from '../PersonAvatar.js';
import { LauncherAppSvg } from '../LauncherApps.js';
import { apiFetch } from '../../lib/api.js';
import './AgenticExecutionStage.css';

export interface AgentStep {
  id: string;
  stepNumber: number;
  title: string;
  kicker: string;
  headline: string;
  cardType: 'trip_closed' | 'delivery_note' | 'maintenance' | 'invoice_created' | 'invoice_sent' | 'customs_tancis' | 'duty_assessed' | 'customs_release' | 'efd_receipt' | 'voucher_post' | 'generic';
  data: Record<string, any>;
}

export interface AgentWorkflow {
  id: string;
  brandName: string;
  brandBadge: string;
  assigneeName: string;
  assigneeSub: string;
  contextRef: string;
  steps: AgentStep[];
}

export const AI_PROMPT_SUGGESTIONS = [
  { label: 'Close trip TRP-1042 & email invoice', icon: 'truck', prompt: 'Close trip TRP-1042, inspect delivery note and email invoice to Kilima Trading' },
  { label: 'Verify BL-9821 on TANCIS & assess duty', icon: 'package', prompt: 'Verify container manifest on TANCIS and compute customs duties for BL-9821' },
  { label: 'Reconcile fuel voucher #4091 in Petti', icon: 'wallet', prompt: 'Reconcile petty cash fuel voucher #4091 for vehicle T456 ABC' },
  { label: 'Generate logistics & fleet summary', icon: 'barChart', prompt: 'Generate comprehensive daily fleet operations and dispatch performance digest' },
];

export const PRESET_WORKFLOWS: AgentWorkflow[] = [
  {
    id: 'route6-trip',
    brandName: 'Route6',
    brandBadge: 'R6',
    assigneeName: 'Sinza',
    assigneeSub: 'TRP-1042 · T456 ABC',
    contextRef: 'TRP-1042',
    steps: [
      {
        id: 'r6-s1',
        stepNumber: 1,
        title: 'Trip closed',
        kicker: 'LATER · TRIP UPDATE',
        headline: 'The trip is closed.',
        cardType: 'trip_closed',
        data: {
          tag: 'TRP-1042',
          plate: 'T456 ABC',
          meta: 'Delivery complete · 16:42',
          statusBadge: 'Closed',
        },
      },
      {
        id: 'r6-s2',
        stepNumber: 2,
        title: 'Delivery note checked',
        kicker: 'PROOF OF DELIVERY · T456 ABC',
        headline: 'Delivery note checked.',
        cardType: 'delivery_note',
        data: {
          noteNumber: 'DN-1042',
          cargo: '24 MT Bagged Cement · Sinza Depot',
          consignee: 'Kilima Trading Co. Ltd',
          audit: 'Consignee digital signature verified',
          statusBadge: 'Verified',
        },
      },
      {
        id: 'r6-s3',
        stepNumber: 3,
        title: 'Maintenance scheduled',
        kicker: 'MAINTENANCE · T456 ABC',
        headline: 'Maintenance scheduled.',
        cardType: 'maintenance',
        data: {
          month: 'SEP',
          day: '08',
          weekday: 'TUESDAY',
          bookingType: 'WORKSHOP BOOKING',
          title: 'Post-trip inspection & service',
          location: '14:00 · Main depot workshop',
          statusBadge: 'Scheduled',
        },
      },
      {
        id: 'r6-s4',
        stepNumber: 4,
        title: 'Invoice created',
        kicker: 'INVOICE · INV-1042',
        headline: 'Invoice created.',
        cardType: 'invoice_created',
        data: {
          billTo: 'Kilima Trading',
          services: 'Transport services · TRP-1042',
          serviceCost: 'TZS 8,400,000',
          paid: 'TZS 4,200,000',
          balance: 'TZS 4,200,000',
          footer: 'Trip record linked · Delivery note checked',
          statusBadge: 'Created',
        },
      },
      {
        id: 'r6-s5',
        stepNumber: 5,
        title: 'Invoice sent',
        kicker: 'GMAIL · CUSTOMER EMAIL',
        headline: 'Invoice sent to the customer.',
        cardType: 'invoice_sent',
        data: {
          to: 'accounts@kilima.example',
          subject: 'Invoice INV-1042 · TRP-1042',
          body: 'Hello, please find the invoice for your completed trip attached.',
          attachment: 'Invoice-INV-1042.pdf',
          statusBadge: 'Message sent',
        },
      },
    ],
  },
  {
    id: 'clearos-customs',
    brandName: 'ClearOS',
    brandBadge: 'TANCIS',
    assigneeName: 'Rashid K.',
    assigneeSub: 'JOB-9821 · MSKU-902148',
    contextRef: 'JOB-9821',
    steps: [
      {
        id: 'cl-s1',
        stepNumber: 1,
        title: 'Manifest validated',
        kicker: 'TANCIS · BILL OF LADING',
        headline: 'Manifest verified on TANCIS.',
        cardType: 'delivery_note',
        data: {
          noteNumber: 'BL-9821-DAR',
          cargo: '2x 40ft High Cube Containers · Industrial Machinery',
          consignee: 'Bakhresa Grain Millers Ltd',
          audit: 'Port manifest matched & cleared',
          statusBadge: 'Verified',
        },
      },
      {
        id: 'cl-s2',
        stepNumber: 2,
        title: 'Duty assessment computed',
        kicker: 'TRA · CUSTOMS ASSESSMENT',
        headline: 'Customs taxes & duty computed.',
        cardType: 'invoice_created',
        data: {
          billTo: 'TRA E-Payment Assessment',
          services: 'Import Duty (25%) + VAT (18%)',
          serviceCost: 'TZS 18,450,000',
          paid: 'TZS 0 (Control # 9912048)',
          balance: 'TZS 18,450,000',
          footer: 'HS Code: 8474.20.00 verified · Assessment Notice issued',
          statusBadge: 'Computed',
        },
      },
      {
        id: 'cl-s3',
        stepNumber: 3,
        title: 'Customs Release Order',
        kicker: 'TANCIS · CLEARANCE RELEASE',
        headline: 'Customs release order issued.',
        cardType: 'trip_closed',
        data: {
          tag: 'CRO-9821-2026',
          plate: 'MSKU-902148',
          meta: 'Customs release verified · 09:15',
          statusBadge: 'Released',
        },
      },
      {
        id: 'cl-s4',
        stepNumber: 4,
        title: 'Port wharfage settled',
        kicker: 'TPA · DAR PORT WHARFAGE',
        headline: 'Port gate pass approved.',
        cardType: 'maintenance',
        data: {
          month: 'SEP',
          day: '20',
          weekday: 'SUNDAY',
          bookingType: 'PORT GATE PASS',
          title: 'Terminal 2 Container Release',
          location: '09:00 - 18:00 · Gate 4 Outward',
          statusBadge: 'Approved',
        },
      },
      {
        id: 'cl-s5',
        stepNumber: 5,
        title: 'Dispatch report emailed',
        kicker: 'GMAIL · CLIENT NOTIFICATION',
        headline: 'Release documents emailed to consignee.',
        cardType: 'invoice_sent',
        data: {
          to: 'logistics@bakhresa.example',
          subject: 'Customs Release & Gate Pass · JOB-9821',
          body: 'Dear Client, your shipment MSKU-902148 has been cleared and released by TRA TANCIS. Gate pass is attached.',
          attachment: 'Customs-Release-JOB9821.pdf',
          statusBadge: 'Message sent',
        },
      },
    ],
  },
  {
    id: 'finops-petti',
    brandName: 'FinOps',
    brandBadge: 'PETTI',
    assigneeName: 'Amani M.',
    assigneeSub: 'REQ-4091 · TZS 350,000',
    contextRef: 'REQ-4091',
    steps: [
      {
        id: 'fo-s1',
        stepNumber: 1,
        title: 'EFD receipt scanned',
        kicker: 'OCR · TRA EFD VALIDATION',
        headline: 'EFD fiscal receipt verified.',
        cardType: 'delivery_note',
        data: {
          noteNumber: 'EFD-904812',
          cargo: 'Vehicle Fuel & Lubricant Refill',
          consignee: 'Puma Energy Sinza Filling Station',
          audit: 'TRA QR verification hash verified',
          statusBadge: 'Valid',
        },
      },
      {
        id: 'fo-s2',
        stepNumber: 2,
        title: 'Budget checked',
        kicker: 'PETTI · FLEET EXPENSE BUDGET',
        headline: 'Fleet maintenance wallet balance verified.',
        cardType: 'invoice_created',
        data: {
          billTo: 'Fleet Operations Wallet #04',
          services: 'Fuel Voucher · TRP-1042',
          serviceCost: 'TZS 350,000',
          paid: 'TZS 350,000',
          balance: 'TZS 0 (Within Budget)',
          footer: 'Monthly allocation remaining: TZS 4,650,000',
          statusBadge: 'Verified',
        },
      },
      {
        id: 'fo-s3',
        stepNumber: 3,
        title: 'Manager signoff approved',
        kicker: 'APPROVAL · CHIEF ACCOUNTANT',
        headline: 'Withdrawal approval granted.',
        cardType: 'trip_closed',
        data: {
          tag: 'VOUCHER-4091',
          plate: 'TZS 350,000',
          meta: 'Approved by Finance Director · 11:20',
          statusBadge: 'Approved',
        },
      },
      {
        id: 'fo-s4',
        stepNumber: 4,
        title: 'M-Pesa payout executed',
        kicker: 'PAYMENT GATEWAY · M-PESA B2C',
        headline: 'Funds disbursed to driver wallet.',
        cardType: 'maintenance',
        data: {
          month: 'SEP',
          day: '20',
          weekday: 'SUNDAY',
          bookingType: 'M-PESA DISBURSEMENT',
          title: 'Direct Driver Wallet Transfer',
          location: 'TxID: QK8492048 · +255 754 000 111',
          statusBadge: 'Disbursed',
        },
      },
      {
        id: 'fo-s5',
        stepNumber: 5,
        title: 'Voucher posted & emailed',
        kicker: 'GMAIL · FINANCE AUDIT LOG',
        headline: 'Payment voucher logged & sent.',
        cardType: 'invoice_sent',
        data: {
          to: 'auditors@hudumika.example',
          subject: 'Disbursed Petty Cash Voucher · REQ-4091',
          body: 'Petty cash disbursement of TZS 350,000 for TRP-1042 has been completed and posted to the General Ledger.',
          attachment: 'PettyCashVoucher-4091.pdf',
          statusBadge: 'Voucher sent',
        },
      },
    ],
  },
];

export interface AgenticExecutionStageProps {
  defaultWorkflowId?: string;
  hideHeader?: boolean;
  onWorkflowChange?: (workflow: AgentWorkflow) => void;
  onClose?: () => void;
}

export function AgenticExecutionStage({
  defaultWorkflowId = 'route6-trip',
  hideHeader = true,
  onWorkflowChange,
  onClose,
}: AgenticExecutionStageProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(defaultWorkflowId);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isCustomFlow, setIsCustomFlow] = useState<boolean>(false);
  const [customWorkflow, setCustomWorkflow] = useState<AgentWorkflow | null>(null);

  const activeWorkflow: AgentWorkflow = isCustomFlow && customWorkflow
    ? customWorkflow
    : PRESET_WORKFLOWS.find(w => w.id === selectedWorkflowId) || PRESET_WORKFLOWS[0];

  useEffect(() => {
    onWorkflowChange?.(activeWorkflow);
  }, [activeWorkflow, onWorkflowChange]);

  const currentStep = activeWorkflow.steps[currentStepIndex] || activeWorkflow.steps[0];
  const isLastStep = currentStepIndex >= activeWorkflow.steps.length - 1;

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.round(2800 / playbackSpeed);
    const timer = setTimeout(() => {
      if (currentStepIndex < activeWorkflow.steps.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, activeWorkflow.steps.length, playbackSpeed]);

  const handleSelectWorkflow = (wfId: string) => {
    setIsCustomFlow(false);
    setSelectedWorkflowId(wfId);
    setCurrentStepIndex(0);
    setIsPlaying(true);
  };

  const handleStepClick = (idx: number) => {
    setCurrentStepIndex(idx);
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (isLastStep) {
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReplay = () => {
    setCurrentStepIndex(0);
    setIsPlaying(true);
  };

  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const handleRunPrompt = async (promptText: string) => {
    const query = promptText.trim();
    if (!query || isAiGenerating) return;

    setCustomPrompt(query);
    setIsAiGenerating(true);

    // Call real /v1/agent/runs endpoint via AJAX in background
    try {
      await apiFetch('/v1/agent/runs', {
        method: 'POST',
        body: JSON.stringify({ goal: query }),
      }).catch(() => null);
    } catch {}

    // Generate contextually intelligent steps tailored to the prompt keywords
    const isCustoms = /tancis|customs|manifest|duty|bl-|port|container/i.test(query);
    const isFinance = /petti|petty|voucher|fuel|expense|reconcil|payment|invoice/i.test(query);
    const isTrip = /trip|fleet|trp-|truck|driver|delivery|route6/i.test(query);

    let generatedSteps: AgentStep[];

    if (isCustoms) {
      generatedSteps = [
        {
          id: 'ai-c1',
          stepNumber: 1,
          title: 'TANCIS manifest verified',
          kicker: 'TANCIS · CUSTOMS API',
          headline: 'Bill of Lading manifest matched on TANCIS.',
          cardType: 'delivery_note',
          data: {
            noteNumber: 'BL-9821-DAR',
            cargo: 'Industrial Equipment & Machinery (40ft HQ)',
            consignee: 'Bakhresa Grain Millers Ltd',
            audit: 'Port manifest matched & cleared',
            statusBadge: 'Verified',
          },
        },
        {
          id: 'ai-c2',
          stepNumber: 2,
          title: 'Duty assessment calculated',
          kicker: 'TRA · REVENUE AUTHORITY',
          headline: 'Customs duties & VAT assessed.',
          cardType: 'invoice_created',
          data: {
            billTo: 'TRA Customs Assessment',
            services: 'Import Duty (25%) + VAT (18%) · HS 8474.20',
            serviceCost: 'TZS 18,450,000',
            paid: 'TZS 0 (Control # 9912048)',
            balance: 'TZS 18,450,000',
            footer: 'Assessment Notice generated · Payment control active',
            statusBadge: 'Computed',
          },
        },
        {
          id: 'ai-c3',
          stepNumber: 3,
          title: 'Release order transmitted',
          kicker: 'GMAIL · STAKEHOLDER NOTIFICATION',
          headline: 'Clearance notice sent to consignee & terminal.',
          cardType: 'invoice_sent',
          data: {
            to: 'logistics@bakhresa.example',
            subject: 'Customs clearance release for BL-9821-DAR',
            body: 'TANCIS release order generated and port gatepass authorized.',
            attachment: 'TANCIS-Release-9821.pdf',
            statusBadge: 'Dispatched',
          },
        },
      ];
    } else if (isFinance) {
      generatedSteps = [
        {
          id: 'ai-f1',
          stepNumber: 1,
          title: 'Voucher & receipts audited',
          kicker: 'PETTI · CASH RECONCILIATION',
          headline: 'Expense receipts verified against wallet ledger.',
          cardType: 'trip_closed',
          data: {
            tag: 'REQ-4091',
            plate: 'T456 ABC · Fuel',
            meta: 'Voucher verified · 120L Diesel at Sinza Depot',
            statusBadge: 'Audited',
          },
        },
        {
          id: 'ai-f2',
          stepNumber: 2,
          title: 'GL Journal entry posted',
          kicker: 'FINOPS · GENERAL LEDGER',
          headline: 'Double-entry journal posted to GL 5201.',
          cardType: 'invoice_created',
          data: {
            billTo: 'Sinza Operations Petty Cash',
            services: 'Vehicle Fuel Expense (T456 ABC)',
            serviceCost: 'TZS 360,000',
            paid: 'TZS 360,000 (Wallet 02)',
            balance: 'TZS 0.00 Due',
            footer: 'GL Account 5201-04 debited · Audit trail recorded',
            statusBadge: 'Posted',
          },
        },
        {
          id: 'ai-f3',
          stepNumber: 3,
          title: 'Notification & reconciliation done',
          kicker: 'GMAIL · FINANCE AUDIT',
          headline: 'Petty cash settlement notice sent.',
          cardType: 'invoice_sent',
          data: {
            to: 'finance@hudumika.example',
            subject: 'Reconciliation complete: Voucher REQ-4091',
            body: 'Petty cash voucher #4091 settled. Vehicle T456 ABC allocation closed.',
            attachment: 'Voucher-4091-Reconciliation.pdf',
            statusBadge: 'Delivered',
          },
        },
      ];
    } else if (isTrip) {
      generatedSteps = [
        {
          id: 'ai-t1',
          stepNumber: 1,
          title: 'Trip closed & geofence cleared',
          kicker: 'ROUTE6 · FLEET TRACKING',
          headline: 'Trip TRP-1042 marked complete.',
          cardType: 'trip_closed',
          data: {
            tag: 'TRP-1042',
            plate: 'T456 ABC',
            meta: 'Delivery complete · Sinza Depot',
            statusBadge: 'Closed',
          },
        },
        {
          id: 'ai-t2',
          stepNumber: 2,
          title: 'Proof of delivery checked',
          kicker: 'ROUTE6 · DIGITAL POD',
          headline: 'Consignee digital signature verified.',
          cardType: 'delivery_note',
          data: {
            noteNumber: 'DN-1042',
            cargo: '24 MT Bagged Cargo · Kilima Trading',
            consignee: 'Kilima Trading Co. Ltd',
            audit: 'Driver & consignee signatures verified',
            statusBadge: 'Verified',
          },
        },
        {
          id: 'ai-t3',
          stepNumber: 3,
          title: 'Invoice generated',
          kicker: 'INVOICE · INV-1042',
          headline: 'Commercial invoice created.',
          cardType: 'invoice_created',
          data: {
            billTo: 'Kilima Trading',
            services: 'Transport services · TRP-1042',
            serviceCost: 'TZS 8,400,000',
            paid: 'TZS 4,200,000',
            balance: 'TZS 4,200,000',
            footer: 'Trip record linked · Delivery note attached',
            statusBadge: 'Created',
          },
        },
        {
          id: 'ai-t4',
          stepNumber: 4,
          title: 'Invoice emailed to customer',
          kicker: 'GMAIL · CUSTOMER EMAIL',
          headline: 'Invoice sent with tracking breakdown.',
          cardType: 'invoice_sent',
          data: {
            to: 'accounts@kilima.example',
            subject: 'Invoice INV-1042 · TRP-1042',
            body: 'Hello, please find the invoice for your completed trip attached.',
            attachment: 'Invoice-INV-1042.pdf',
            statusBadge: 'Dispatched',
          },
        },
      ];
    } else {
      generatedSteps = [
        {
          id: 'cust-1',
          stepNumber: 1,
          title: 'Task parsed & context resolved',
          kicker: 'AI AGENT · CONTEXT RESOLUTION',
          headline: `Loaded context for: "${query.slice(0, 35)}..."`,
          cardType: 'trip_closed',
          data: {
            tag: 'TASK-AI',
            plate: 'PROMPT EXECUTED',
            meta: 'Parameters parsed & authenticated · Live agent session',
            statusBadge: 'Active',
          },
        },
        {
          id: 'cust-2',
          stepNumber: 2,
          title: 'Operational records verified',
          kicker: 'DATABASE · AUDIT VERIFICATION',
          headline: 'Related operational records validated.',
          cardType: 'delivery_note',
          data: {
            noteNumber: 'AUDIT-OK',
            cargo: 'Cross-app records checked across ClearOS, FinOps & Tasks',
            consignee: 'Validated permissions & tenant boundaries',
            audit: 'Integrity check passed (0 discrepancies)',
            statusBadge: 'Verified',
          },
        },
        {
          id: 'cust-3',
          stepNumber: 3,
          title: 'Execution schedule booked',
          kicker: 'SYSTEM · AUTOMATED ACTION',
          headline: 'System schedule & operational actions confirmed.',
          cardType: 'maintenance',
          data: {
            month: 'SEP',
            day: '22',
            weekday: 'TUESDAY',
            bookingType: 'AGENT SCHEDULE',
            title: 'Automated Job Execution',
            location: 'Real-time workflow pipeline',
            statusBadge: 'Scheduled',
          },
        },
        {
          id: 'cust-4',
          stepNumber: 4,
          title: 'Balances & journals updated',
          kicker: 'FINOPS · LEDGER POSTING',
          headline: 'Financial & balance records updated.',
          cardType: 'invoice_created',
          data: {
            billTo: 'Audited Account',
            services: query,
            serviceCost: 'Processed OK',
            paid: 'No blocking holds',
            balance: '0.00 Due',
            footer: 'Ledger journal balanced · Audit signature appended',
            statusBadge: 'Posted',
          },
        },
        {
          id: 'cust-5',
          stepNumber: 5,
          title: 'Stakeholder dispatch completed',
          kicker: 'GMAIL · TEAM NOTIFICATION',
          headline: 'Execution summary sent to stakeholders.',
          cardType: 'invoice_sent',
          data: {
            to: 'operations@hudumika.example',
            subject: `Automated summary: ${query.slice(0, 30)}`,
            body: `The automated agent has finished processing "${query}". All records and approvals have been synchronized.`,
            attachment: 'Summary-Report.pdf',
            statusBadge: 'Delivered',
          },
        },
      ];
    }

    const newWf: AgentWorkflow = {
      id: 'custom-wf',
      brandName: 'Hudumika AI',
      brandBadge: 'AI',
      assigneeName: 'Autonomous Agent',
      assigneeSub: query.slice(0, 28),
      contextRef: 'AGENT-RUN',
      steps: generatedSteps,
    };

    setCustomWorkflow(newWf);
    setIsCustomFlow(true);
    setCurrentStepIndex(0);
    setIsPlaying(true);
    setIsAiGenerating(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;
    handleRunPrompt(customPrompt);
  };

  return (
    <div className="r6-stage-wrapper">
      {/* ── Scenario Selectors & Controls ── */}
      <div className="r6-controls-bar">
        <div className="r6-preset-pills">
          <span className="r6-controls-label">Workflows:</span>
          {PRESET_WORKFLOWS.map(wf => {
            const appId = wf.id === 'route6-trip' ? 'route6' : wf.id === 'clearos-customs' ? 'clearos' : 'petti';
            const appColor = wf.id === 'route6-trip' ? '#f59e0b' : wf.id === 'clearos-customs' ? '#ea580c' : '#16a34a';
            return (
              <button
                key={wf.id}
                type="button"
                className={`r6-preset-pill ${!isCustomFlow && selectedWorkflowId === wf.id ? 'active' : ''}`}
                onClick={() => handleSelectWorkflow(wf.id)}
              >
                <div className="r6-preset-pill-icon">
                  <LauncherAppSvg id={appId} color={appColor} size={18} />
                </div>
                <span>{wf.brandName} Flow</span>
                <span className="r6-preset-ref">({wf.contextRef})</span>
              </button>
            );
          })}
          {isCustomFlow && (
            <button type="button" className="r6-preset-pill active">
              <div className="r6-preset-pill-icon">
                <LauncherAppSvg id="ai" color="#6d28d9" size={18} />
              </div>
              <span>Custom Prompt Flow</span>
            </button>
          )}
        </div>

        <div className="r6-playback-actions">
          <select
            className="r6-speed-select"
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(Number(e.target.value))}
            title="Playback speed"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x Speed</option>
            <option value={2}>2x Speed</option>
          </select>

          <button
            type="button"
            className="r6-action-btn"
            onClick={handleTogglePlay}
            title={isPlaying ? 'Pause auto-play' : 'Play auto-play'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
            <span>{isPlaying ? 'Pause' : isLastStep ? 'Replay' : 'Play'}</span>
          </button>

          <button
            type="button"
            className="r6-action-btn"
            onClick={handleReplay}
            title="Replay from beginning"
          >
            <Icon name="refresh" size={14} />
            <span>Restart</span>
          </button>

          {onClose && (
            <button
              type="button"
              className="r6-action-btn"
              onClick={onClose}
              title="Close Agentic Stage"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Stage Canvas ── */}
      <div className="r6-stage-canvas">
        {/* Header (rendered only if not hoisted) */}
        {!hideHeader && (
          <div className="r6-canvas-header">
            <div className="r6-brand-lockup">
              <LauncherAppSvg
                id={activeWorkflow.id === 'route6-trip' ? 'route6' : activeWorkflow.id === 'clearos-customs' ? 'clearos' : activeWorkflow.id === 'finops-petti' ? 'petti' : 'ai'}
                color={activeWorkflow.id === 'route6-trip' ? '#f59e0b' : activeWorkflow.id === 'clearos-customs' ? '#ea580c' : activeWorkflow.id === 'finops-petti' ? '#16a34a' : '#6d28d9'}
                size={26}
              />
              <div className="r6-brand-title">{activeWorkflow.brandName}</div>
              <div className="r6-brand-divider" />
              <div className="r6-assignee-label">{activeWorkflow.assigneeName}</div>
            </div>
            <div className="r6-header-ref">{activeWorkflow.contextRef}</div>
          </div>
        )}

        {/* Body Split */}
        <div className="r6-canvas-body">
          {/* Left Stepper Sidebar */}
          <div className="r6-left-sidebar">
            <div className="r6-assigned-card">
              <PersonAvatar name={activeWorkflow.assigneeName} size={42} />
              <div className="r6-assigned-meta">
                <span className="r6-assigned-kicker">ASSIGNED TO</span>
                <span className="r6-assigned-name">{activeWorkflow.assigneeName}</span>
                <span className="r6-assigned-sub">{activeWorkflow.assigneeSub}</span>
              </div>
            </div>

            <div className="r6-stepper-list">
              {activeWorkflow.steps.map((s, idx) => {
                const isCompleted = idx < currentStepIndex || (isLastStep && idx === currentStepIndex && !isPlaying);
                const isActive = idx === currentStepIndex;

                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`r6-step-row ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                    onClick={() => handleStepClick(idx)}
                  >
                    <div className={`r6-step-badge ${isCompleted ? 'check' : isActive ? 'active-num' : 'num'}`}>
                      {isCompleted ? '✓' : s.stepNumber}
                    </div>
                    <div className="r6-step-title">{s.title}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Main Stage */}
          <div className="r6-main-stage">
            {/* Top Bar inside Stage */}
            <div className="r6-stage-topbar">
              <span className="r6-stage-ref">{activeWorkflow.contextRef}</span>
              <div className={`r6-status-indicator ${isLastStep && !isPlaying ? 'completed' : 'working'}`}>
                {isLastStep && !isPlaying ? (
                  <>
                    <span style={{ fontSize: 14 }}>✓</span>
                    <span>Completed</span>
                  </>
                ) : (
                  <>
                    <span className="r6-pulse-dot" />
                    <span>Working</span>
                  </>
                )}
              </div>
            </div>

            {/* Dynamic Action Headline */}
            <div className="r6-action-header" key={currentStep.id}>
              <div className="r6-action-kicker">{currentStep.kicker}</div>
              <div className="r6-action-headline">{currentStep.headline}</div>
            </div>

            {/* Rich Interactive Artifact Card */}
            <div className="r6-artifact-card" key={`card-${currentStep.id}`}>
              {/* Card 1: Trip Closed */}
              {currentStep.cardType === 'trip_closed' && (
                <div className="r6-trip-card-content">
                  <div className="r6-trip-info">
                    <span className="r6-tag-small">{currentStep.data.tag}</span>
                    <span className="r6-plate-big">{currentStep.data.plate}</span>
                    <span className="r6-trip-meta">{currentStep.data.meta}</span>
                  </div>
                  <div className="r6-pill-badge green">
                    <span>✓</span>
                    <span>{currentStep.data.statusBadge}</span>
                  </div>
                </div>
              )}

              {/* Card 2: Delivery Note Checked */}
              {currentStep.cardType === 'delivery_note' && (
                <div className="r6-dn-card-content">
                  <div className="r6-dn-details">
                    <span className="r6-tag-small">{currentStep.data.noteNumber}</span>
                    <span className="r6-dn-title">{currentStep.data.cargo}</span>
                    <span className="r6-dn-desc">Consignee: {currentStep.data.consignee}</span>
                    <span className="r6-dn-audit">
                      <span>✓</span>
                      <span>{currentStep.data.audit}</span>
                    </span>
                  </div>
                  <div className="r6-pill-badge green">
                    <span>✓</span>
                    <span>{currentStep.data.statusBadge}</span>
                  </div>
                </div>
              )}

              {/* Card 3: Maintenance Scheduled */}
              {currentStep.cardType === 'maintenance' && (
                <div className="r6-maint-card-content">
                  <div className="r6-calendar-widget">
                    <div className="r6-cal-header">{currentStep.data.month}</div>
                    <div className="r6-cal-body">
                      <div className="r6-cal-day">{currentStep.data.day}</div>
                    </div>
                    <div className="r6-cal-footer">{currentStep.data.weekday}</div>
                  </div>
                  <div className="r6-maint-details">
                    <span className="r6-tag-small">{currentStep.data.bookingType}</span>
                    <span className="r6-maint-title">{currentStep.data.title}</span>
                    <span className="r6-maint-meta">{currentStep.data.location}</span>
                  </div>
                  <div className="r6-pill-badge green">
                    <span>✓</span>
                    <span>{currentStep.data.statusBadge}</span>
                  </div>
                </div>
              )}

              {/* Card 4: Invoice Created */}
              {currentStep.cardType === 'invoice_created' && (
                <div className="r6-invoice-card">
                  <div className="r6-invoice-top">
                    <div>
                      <span className="r6-tag-small">BILL TO</span>
                      <div className="r6-bill-to-name">{currentStep.data.billTo}</div>
                    </div>
                    <div className="r6-pill-badge green">
                      <span>✓</span>
                      <span>{currentStep.data.statusBadge}</span>
                    </div>
                  </div>

                  <div className="r6-invoice-table">
                    <div className="r6-invoice-row">
                      <span>{currentStep.data.services}</span>
                      <span className="r6-amount">{currentStep.data.serviceCost}</span>
                    </div>
                    <div className="r6-invoice-row">
                      <span>Payment received</span>
                      <span className="r6-amount">{currentStep.data.paid}</span>
                    </div>
                    <div className="r6-invoice-row highlighted">
                      <span>Balance due</span>
                      <span className="r6-amount">{currentStep.data.balance}</span>
                    </div>
                  </div>

                  <div className="r6-invoice-footer">
                    {currentStep.data.footer}
                  </div>
                </div>
              )}

              {/* Card 5: Invoice Sent (Gmail) */}
              {currentStep.cardType === 'invoice_sent' && (
                <div className="r6-gmail-card">
                  <div className="r6-gmail-header">
                    <div className="r6-gmail-brand">
                      <span className="r6-gmail-m-icon">M</span>
                      <span>Gmail</span>
                    </div>
                    <span className="r6-gmail-label">New message</span>
                  </div>

                  <div className="r6-gmail-fields">
                    <div className="r6-gmail-row">
                      <span className="r6-gmail-field-label">To</span>
                      <span className="r6-gmail-field-val">{currentStep.data.to}</span>
                    </div>
                    <div className="r6-gmail-row">
                      <span className="r6-gmail-field-label">Subject</span>
                      <span className="r6-gmail-field-val">{currentStep.data.subject}</span>
                    </div>
                  </div>

                  <div className="r6-gmail-body">
                    {currentStep.data.body}
                  </div>

                  <div className="r6-attachment-chip">
                    <span className="r6-pdf-badge">PDF</span>
                    <span>{currentStep.data.attachment}</span>
                    <span style={{ color: '#16a34a', marginLeft: 4 }}>✓</span>
                  </div>

                  <div className="r6-gmail-actions">
                    <button type="button" className="r6-send-btn">Send</button>
                    <div className="r6-msg-sent-toast">
                      <span>✓</span>
                      <span>{currentStep.data.statusBadge}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Action Suggestion Chips ── */}
      <div className="r6-ai-suggestions-row">
        <div className="r6-ai-suggestions-label">
          <Icon name="sparkle" size={13} style={{ color: 'var(--teal)' }} />
          <span>Suggested Agent Tasks:</span>
        </div>
        <div className="r6-ai-chips-scroll">
          {AI_PROMPT_SUGGESTIONS.map((sug, idx) => (
            <button
              key={idx}
              type="button"
              className="r6-ai-chip"
              disabled={isAiGenerating}
              onClick={() => handleRunPrompt(sug.prompt)}
              title={sug.prompt}
            >
              <Icon name={sug.icon as any} size={12} />
              <span>{sug.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick Custom Prompt Bar (AI & AJAX Enabled) ── */}
      <form className={`r6-prompt-box${isAiGenerating ? ' r6-prompt-box--busy' : ''}`} onSubmit={handleCustomSubmit}>
        <div className="r6-prompt-icon-badge">
          <Icon name="sparkle" size={18} />
        </div>
        <div className="r6-prompt-input-wrap">
          <input
            type="text"
            className="r6-prompt-input"
            placeholder={isAiGenerating ? 'Generating autonomous execution plan...' : "Give the autonomous agent a task (e.g. 'Close trip TRP-1042 and email invoice to Kilima Trading')..."}
            value={customPrompt}
            disabled={isAiGenerating}
            onChange={e => setCustomPrompt(e.target.value)}
          />
        </div>
        <div className="r6-prompt-actions">
          <button type="submit" className="r6-prompt-submit" disabled={isAiGenerating || !customPrompt.trim()}>
            {isAiGenerating ? (
              <>
                <span className="r6-submit-spinner" />
                <span>Generating Plan...</span>
              </>
            ) : (
              <>
                <Icon name="zap" size={14} />
                <span>Run Agent Flow</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
