// ── Tenant-configurable ClearOS Workflows ──────────────────────

export interface FieldCondition {
  id: string;
  field: string; // a shipment_cases column name, or 'document:<DocumentType>'
  operator: 'required' | 'not_empty' | 'equals' | 'greater_than' | 'less_than' | 'contains';
  value?: string;
  label: string;
}

export interface AutoComm {
  id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'system_notification' | 'webhook';
  recipient: 'customer' | 'assigned_agent' | 'manager' | 'custom_email';
  customEmail?: string;
  subject: string;
  template: string;
  delayMinutes: number;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  order: number;
  isStart: boolean;
  isTerminal: boolean;
  nextStepIds: string[];
  entryConditions: FieldCondition[];
  autoComms: AutoComm[];
  slaHours?: number;
  color: string;
}

export interface WorkflowTrigger {
  freightModes: string[];
  consignmentTypes: string[];
  customerIds: string[];
  originCountries: string[];
  destinationCountries: string[];
  isDefault: boolean;
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  /** True for platform-seeded default workflows (Sea/Air/Road/Sea-transit). A
   *  tenant may delete these once they've built their own; a custom workflow of
   *  the tenant's always out-ranks a system default at shipment-resolution time. */
  isSystem?: boolean;
  /** Stable key of the platform template this workflow was seeded from
   *  (e.g. 'sys-sea-import'), used to de-duplicate re-seeds. Null for hand-built. */
  templateKey?: string | null;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  isActive?: boolean;
  isDefault?: boolean;
  triggers: WorkflowTrigger;
  // `id` here is a client-generated temp id used only so `nextStepIds` can
  // reference sibling steps within the same payload — the server remaps
  // every temp id to a real UUID (and rewrites nextStepIds accordingly)
  // before insert. `workflowId` is omitted; it doesn't exist yet.
  steps: Omit<WorkflowStep, 'workflowId'>[];
}

export type UpdateWorkflowInput = Partial<CreateWorkflowInput>;
