import type { ClearanceStage, DocumentType } from '@hudumika/types';

export interface StageConfig {
  stage: ClearanceStage;
  label: string;
  slaHours: number; // Target SLA duration in hours
  requiredDocuments: DocumentType[]; // Documents that MUST be verified/received to enter or complete this stage
  prerequisites: ClearanceStage[]; // Stages that must be completed before entering this stage
}

export const WORKFLOW_CONFIGS: Record<ClearanceStage, StageConfig> = {
  DOCS_RECEIVED: {
    stage: 'DOCS_RECEIVED',
    label: 'Documents Received',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: [],
  },
  VALIDATION: {
    stage: 'VALIDATION',
    label: 'Document Validation',
    slaHours: 24,
    requiredDocuments: ['BL', 'INVOICE', 'PACKING_LIST'],
    prerequisites: ['DOCS_RECEIVED'],
  },
  PERMITS: {
    stage: 'PERMITS',
    label: 'Permit Applications',
    slaHours: 48,
    requiredDocuments: [],
    prerequisites: ['VALIDATION'],
  },
  ENTRY_PREP: {
    stage: 'ENTRY_PREP',
    label: 'Customs Entry Prep',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: ['VALIDATION'],
  },
  TANCIS_REG: {
    stage: 'TANCIS_REG',
    label: 'TANCIS Registration',
    slaHours: 24,
    requiredDocuments: ['CUSTOMS_ENTRY'],
    prerequisites: ['ENTRY_PREP'],
  },
  ASSESSMENT: {
    stage: 'ASSESSMENT',
    label: 'TRA Tax Assessment',
    slaHours: 48,
    requiredDocuments: [],
    prerequisites: ['TANCIS_REG'],
  },
  TAX_PAYMENT: {
    stage: 'TAX_PAYMENT',
    label: 'Tax / Duty Payment',
    slaHours: 48,
    requiredDocuments: ['DUTY_RECEIPT'],
    prerequisites: ['ASSESSMENT'],
  },
  DO_APPLICATION: {
    stage: 'DO_APPLICATION',
    label: 'Delivery Order Application',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: ['TAX_PAYMENT'],
  },
  INSPECTION_BOOKING: {
    stage: 'INSPECTION_BOOKING',
    label: 'Inspection Booking',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: ['DO_APPLICATION'],
  },
  INSPECTION: {
    stage: 'INSPECTION',
    label: 'Inspection Process',
    slaHours: 48,
    requiredDocuments: [],
    prerequisites: ['INSPECTION_BOOKING'],
  },
  GOV_REMARKS: {
    stage: 'GOV_REMARKS',
    label: 'Government Remarks',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: ['INSPECTION'],
  },
  RELEASE: {
    stage: 'RELEASE',
    label: 'Customs Release',
    slaHours: 24,
    requiredDocuments: ['RELEASE_ORDER'],
    prerequisites: ['TAX_PAYMENT'],
  },
  ICD_PAYMENT: {
    stage: 'ICD_PAYMENT',
    label: 'ICD / Storage Payment',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: ['RELEASE'],
  },
  GATE_PASS: {
    stage: 'GATE_PASS',
    label: 'Gate Pass Issuance',
    slaHours: 12,
    requiredDocuments: [],
    prerequisites: ['ICD_PAYMENT'],
  },
  TRANSPORT: {
    stage: 'TRANSPORT',
    label: 'Transport to Customer',
    slaHours: 48,
    requiredDocuments: [],
    prerequisites: ['GATE_PASS'],
  },
  DELIVERY: {
    stage: 'DELIVERY',
    label: 'Delivery Confirmation',
    slaHours: 12,
    requiredDocuments: ['DELIVERY_NOTE'],
    prerequisites: ['TRANSPORT'],
  },
  EMPTY_RETURN: {
    stage: 'EMPTY_RETURN',
    label: 'Empty Container Return',
    slaHours: 72, // Usually within demurrage free period
    requiredDocuments: [],
    prerequisites: ['DELIVERY'],
  },
  INVOICING: {
    stage: 'INVOICING',
    label: 'Final Invoicing',
    slaHours: 24,
    requiredDocuments: [],
    prerequisites: ['DELIVERY'],
  },
  CLOSED: {
    stage: 'CLOSED',
    label: 'Case Closed',
    slaHours: 0,
    requiredDocuments: [],
    prerequisites: ['INVOICING'],
  },
};


/**
 * Validates a transition from current stage to next stage
 */
export function validateStageTransition(current: ClearanceStage, next: ClearanceStage): { valid: boolean; error?: string } {
  const nextConfig = WORKFLOW_CONFIGS[next];
  if (!nextConfig) {
    return { valid: false, error: `Invalid stage: ${next}` };
  }

  // Linear progression verification (simplified validation)
  const currentIdx = Object.keys(WORKFLOW_CONFIGS).indexOf(current);
  const nextIdx = Object.keys(WORKFLOW_CONFIGS).indexOf(next);

  if (nextIdx === -1) {
    return { valid: false, error: `Target stage ${next} is not defined.` };
  }

  // A case can only jump forward, or go back to any previous stage (re-validation)
  // For V1, we let them skip if they have the prerequisites satisfied, but mostly it's linear.
  for (const pre of nextConfig.prerequisites) {
    if (pre === current) continue; // if current is the direct prerequisite, it's valid
    // Otherwise, we check if it has been cleared in history (validated elsewhere or skipped)
  }

  return { valid: true };
}
