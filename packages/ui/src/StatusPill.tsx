import React from 'react';
import type { ClearanceStage } from '@hudumika/types';

export interface StatusPillProps {
  // ClearanceStage literal for legacy shipments, or a workflow_steps.id
  // (UUID) for custom-workflow shipments — the lookups below already fall
  // back to a neutral pill + humanized string for any unrecognized value.
  stage: string;
}

const STAGE_MAP: Record<ClearanceStage, string> = {
  DOCS_RECEIVED:      'sp-grey',
  VALIDATION:         'sp-grey',
  PERMITS:            'sp-blue',
  ENTRY_PREP:         'sp-blue',
  TANCIS_REG:         'sp-blue',
  DO_APPLICATION:     'sp-blue',
  INSPECTION_BOOKING: 'sp-blue',
  ASSESSMENT:         'sp-gold',
  TAX_PAYMENT:        'sp-gold',
  ICD_PAYMENT:        'sp-gold',
  INSPECTION:         'sp-purple',
  GOV_REMARKS:        'sp-purple',
  RELEASE:            'sp-teal',
  GATE_PASS:          'sp-teal',
  TRANSPORT:          'sp-blue',
  DELIVERY:           'sp-green',
  EMPTY_RETURN:       'sp-green',
  INVOICING:          'sp-gold',
  CLOSED:             'sp-green',
};

const STAGE_LABEL: Partial<Record<ClearanceStage, string>> = {
  DOCS_RECEIVED:      'Docs Received',
  VALIDATION:         'Validation',
  PERMITS:            'Permits',
  ENTRY_PREP:         'Entry Prep',
  TANCIS_REG:         'TANCIS Reg',
  DO_APPLICATION:     'D/O App',
  INSPECTION_BOOKING: 'Insp. Booking',
  ASSESSMENT:         'Assessment',
  TAX_PAYMENT:        'Tax Payment',
  ICD_PAYMENT:        'ICD Payment',
  INSPECTION:         'Inspection',
  GOV_REMARKS:        'Gov Remarks',
  RELEASE:            'Release',
  GATE_PASS:          'Gate Pass',
  TRANSPORT:          'Transport',
  DELIVERY:           'Delivery',
  EMPTY_RETURN:       'Empty Return',
  INVOICING:          'Invoicing',
  CLOSED:             'Closed',
};

export const StatusPill: React.FC<StatusPillProps> = ({ stage }) => (
  <span className={`stage-pill ${STAGE_MAP[stage as ClearanceStage] ?? 'sp-grey'}`}>
    {STAGE_LABEL[stage as ClearanceStage] ?? stage.replace(/_/g, ' ')}
  </span>
);
